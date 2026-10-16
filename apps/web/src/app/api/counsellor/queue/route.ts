import { NextResponse } from 'next/server';
import { getAuthenticatedUser, requireRole } from '../../../../lib/authorization';
import { isDemoMode } from '../../../../lib/demo-mode';
import { demoCounsellorQueue } from '../../../../lib/demo-dashboard';
import { fail } from '../../../../lib/guard';

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, normal: 2 };
const NOT_PROVIDED = 'Not provided';

export async function GET() {
  const { supabase, user } = await getAuthenticatedUser();
  const denied = requireRole(user, 'counsellor');
  if (denied) return isDemoMode() ? NextResponse.json(demoCounsellorQueue()) : denied;

  // Active tickets only. Without this filter 50 newer resolved tickets could push an old, still
  // unhandled distress ticket off the list.
  const { data: escalations, error } = await supabase
    .from('escalations')
    .select(`
      id, session_id, reason, summary, status, counsellor_id, priority, concern_category,
      callback_slot, accepted_at, contacted_at, created_at,
      sessions ( district, state, user_role, learner_class, income_bracket, trades ( name_en ) )
    `)
    .in('status', ['new', 'assigned', 'contacted'])
    .order('created_at', { ascending: true })
    .limit(100);

  if (error) return fail(500, 'queue_unavailable', error);

  const formatted = (escalations || []).map((item: any) => ({
    id: item.id,
    session_id: item.session_id,
    reason: item.reason,
    summary: item.summary,
    status: item.status,
    priority: item.priority,
    callback_slot: item.callback_slot ?? null,
    created_at: item.created_at,
    // Never invent family details. A counsellor must be able to tell "not recorded" from a real value.
    family_profile: {
      district: item.sessions?.district || NOT_PROVIDED,
      state: item.sessions?.state || NOT_PROVIDED,
      role: item.sessions?.user_role || NOT_PROVIDED,
      learner_class: item.sessions?.learner_class || NOT_PROVIDED,
      income_bracket: item.sessions?.income_bracket || NOT_PROVIDED,
      trade_name: item.sessions?.trades?.name_en || NOT_PROVIDED,
    },
  }));

  // Urgent first, then oldest first within a priority, so the longest-waiting person is seen first.
  formatted.sort((a: any, b: any) =>
    (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3) ||
    String(a.created_at).localeCompare(String(b.created_at)));

  return NextResponse.json(formatted);
}

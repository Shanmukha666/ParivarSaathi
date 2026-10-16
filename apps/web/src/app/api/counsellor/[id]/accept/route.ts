import { NextResponse } from 'next/server';
import { getAuthenticatedUser, requireRole } from '../../../../../lib/authorization';
import { fail } from '../../../../../lib/guard';
import { isDemoMode } from '../../../../../lib/demo-mode';
import { parseId } from '../../../../../lib/http';

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  // Demo mode has no database: answer with a clearly labelled simulated success instead of a 403 the UI used to hide.
  if (isDemoMode()) return NextResponse.json({ demo: true, id: params.id, status: 'assigned' });
  const { supabase, user } = await getAuthenticatedUser();
  const denied = requireRole(user, 'counsellor');
  if (denied) return denied;

  const ticketId = parseId(params.id);
  if (ticketId === null) return fail(400, 'invalid_ticket_id');

  // The guard trigger stamps accepted_at and sets counsellor_id; the app never sends timestamps.
  const { data, error } = await supabase
    .from('escalations')
    .update({ status: 'assigned', counsellor_id: user!.id })
    .eq('id', ticketId)
    .eq('status', 'new')
    .select('id, session_id, status, accepted_at')
    .maybeSingle();

  if (error) return fail(500, 'accept_failed', error);
  // Zero rows is normal: another counsellor took it first, or it is outside this counsellor's districts.
  if (!data) return fail(409, 'ticket_not_available');
  return NextResponse.json(data);
}

import { NextResponse } from 'next/server';
import { getAuthenticatedUser, requireRole } from '../../../../lib/authorization';
import { fail, isUuid } from '../../../../lib/guard';
import { isLang, readJson, str } from '../../../../lib/http';
import { isDemoMode } from '../../../../lib/demo-mode';

const MAX_TEXT = 1000; // matches the messages.text CHECK constraint

/** Only the counsellor assigned to the ticket may read or write the transcript; admins may not. */
async function guard() {
  const { supabase, user } = await getAuthenticatedUser();
  const denied = requireRole(user, 'counsellor');
  if (denied) return { denied };
  if (user!.app_metadata?.role === 'admin') return { denied: fail(403, 'transcripts_restricted_to_assigned_counsellor') };
  return { supabase, user: user! };
}

async function isAssigned(supabase: any, sessionId: string, userId: string) {
  const { data } = await supabase
    .from('escalations')
    .select('id')
    .eq('session_id', sessionId)
    .eq('counsellor_id', userId)
    .in('status', ['assigned', 'contacted'])
    .maybeSingle();
  return Boolean(data);
}

export async function POST(request: Request) {
  if (isDemoMode()) return NextResponse.json({ demo: true, speaker: 'counsellor' });
  const g = await guard();
  if (g.denied) return g.denied;

  const body = await readJson(request);
  const text = str(body?.text, MAX_TEXT);
  if (!body || !isUuid(body.session_id) || !text || !text.trim()) return fail(400, 'invalid_message');
  if (!(await isAssigned(g.supabase, body.session_id, g.user.id))) return fail(403, 'ticket_not_assigned_to_you');

  const { data, error } = await g.supabase
    .from('messages')
    .insert({ session_id: body.session_id, speaker: 'counsellor', text, lang: isLang(body.lang) ? body.lang : 'en' })
    .select('id, session_id, speaker, text, created_at')
    .single();

  if (error) return fail(500, 'message_not_saved', error);
  return NextResponse.json(data);
}

export async function GET(request: Request) {
  if (isDemoMode()) return NextResponse.json([]);
  const g = await guard();
  if (g.denied) return g.denied;

  const sessionId = new URL(request.url).searchParams.get('session_id');
  if (!isUuid(sessionId)) return fail(400, 'invalid_session_id');
  if (!(await isAssigned(g.supabase, sessionId, g.user.id))) return fail(403, 'ticket_not_assigned_to_you');

  const { data, error } = await g.supabase
    .from('messages')
    .select('id, session_id, speaker, text, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (error) return fail(500, 'messages_unavailable', error);
  return NextResponse.json(data || []);
}

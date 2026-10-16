import { NextResponse } from 'next/server';
import { getAuthenticatedUser, requireRole } from '../../../../../lib/authorization';
import { fail } from '../../../../../lib/guard';
import { isDemoMode } from '../../../../../lib/demo-mode';
import { parseId, readJson } from '../../../../../lib/http';

const MAX_NOTE = 1000; // matches the escalations.resolution_note CHECK constraint

export async function POST(request: Request, { params }: { params: { id: string } }) {
  // Demo mode has no database: answer with a clearly labelled simulated success instead of a 403 the UI used to hide.
  if (isDemoMode()) return NextResponse.json({ demo: true, id: params.id, status: 'resolved' });
  const { supabase, user } = await getAuthenticatedUser();
  const denied = requireRole(user, 'counsellor');
  if (denied) return denied;

  const ticketId = parseId(params.id);
  if (ticketId === null) return fail(400, 'invalid_ticket_id');

  const body = (await readJson(request)) ?? {};
  const note = typeof body.resolution_note === 'string' && body.resolution_note.trim() ? body.resolution_note.trim() : 'Resolved by counsellor';
  if (note.length > MAX_NOTE) return fail(400, 'note_too_long');

  // Accepted tickets can be resolved directly (the dashboard has no separate "contacted" step).
  // resolved_at is stamped by the trigger; the app must not send it (counsellors have no column grant).
  const { data, error } = await supabase
    .from('escalations')
    .update({ status: 'resolved', resolution_note: note })
    .eq('id', ticketId)
    .eq('counsellor_id', user!.id)
    .in('status', ['assigned', 'contacted'])
    .select('id, session_id, status, resolved_at')
    .maybeSingle();

  if (error) return fail(500, 'resolve_failed', error);
  if (!data) return fail(409, 'ticket_not_resolvable');
  return NextResponse.json(data);
}

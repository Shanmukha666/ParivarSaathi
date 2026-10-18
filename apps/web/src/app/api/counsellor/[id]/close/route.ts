import { NextResponse } from 'next/server';
import { getAuthenticatedUser, requireRole } from '../../../../../lib/authorization';
import { fail } from '../../../../../lib/guard';
import { isDemoMode } from '../../../../../lib/demo-mode';
import { parseId, readJson } from '../../../../../lib/http';

const MAX_NOTE = 1000; // matches the escalations.resolution_note CHECK constraint (was 2000 here)

/** Close a ticket the family never answered. Allowed from assigned or contacted, never from resolved. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Demo mode has no database: answer with a clearly labelled simulated success instead of a 403 the UI used to hide.
  if (isDemoMode()) return NextResponse.json({ demo: true, id, status: 'closed_no_response' });
  const { supabase, user } = await getAuthenticatedUser();
  const denied = requireRole(user, 'counsellor');
  if (denied) return denied;

  const ticketId = parseId(id);
  if (ticketId === null) return fail(400, 'invalid_ticket_id');

  const body = (await readJson(request)) ?? {};
  const note = typeof body.resolution_note === 'string' ? body.resolution_note.trim() : '';
  if (!note) return fail(400, 'resolution_note_required');
  if (note.length > MAX_NOTE) return fail(400, 'note_too_long');

  const { data, error } = await supabase
    .from('escalations')
    .update({ status: 'closed_no_response', resolution_note: note })
    .eq('id', ticketId)
    .eq('counsellor_id', user!.id)
    .in('status', ['assigned', 'contacted'])
    .select('id, session_id, status, closed_at')
    .maybeSingle();

  if (error) return fail(500, 'close_failed', error);
  if (!data) return fail(409, 'ticket_not_closable');
  return NextResponse.json(data);
}

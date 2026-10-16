import { NextResponse } from 'next/server';
import { getAuthenticatedUser, requireRole } from '../../../../../lib/authorization';
import { fail } from '../../../../../lib/guard';
import { isDemoMode } from '../../../../../lib/demo-mode';
import { parseId } from '../../../../../lib/http';

/** Mark an accepted ticket as contacted. The trigger stamps contacted_at. */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  if (isDemoMode()) return NextResponse.json({ demo: true, id: params.id, status: 'contacted' });
  const { supabase, user } = await getAuthenticatedUser();
  const denied = requireRole(user, 'counsellor');
  if (denied) return denied;

  const ticketId = parseId(params.id);
  if (ticketId === null) return fail(400, 'invalid_ticket_id');

  const { data, error } = await supabase
    .from('escalations')
    .update({ status: 'contacted' })
    .eq('id', ticketId)
    .eq('counsellor_id', user!.id)
    .eq('status', 'assigned')
    .select('id, session_id, status, contacted_at')
    .maybeSingle();

  if (error) return fail(500, 'contact_failed', error);
  if (!data) return fail(409, 'ticket_not_assigned_to_you');
  return NextResponse.json(data);
}

/**
 * The family's callback number. The database only reveals it to the counsellor who has accepted the
 * ticket (escalation_contacts RLS), so before accepting this returns null, never an error that leaks why.
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  if (isDemoMode()) return NextResponse.json({ demo: true, callback_phone: null, callback_slot: null });
  const { supabase, user } = await getAuthenticatedUser();
  const denied = requireRole(user, 'counsellor');
  if (denied) return denied;

  const ticketId = parseId(params.id);
  if (ticketId === null) return fail(400, 'invalid_ticket_id');

  const [{ data: contact, error: contactError }, { data: ticket }] = await Promise.all([
    supabase.from('escalation_contacts').select('callback_phone').eq('escalation_id', ticketId).maybeSingle(),
    supabase.from('escalations').select('callback_slot').eq('id', ticketId).maybeSingle(),
  ]);
  if (contactError) return fail(500, 'contact_lookup_failed', contactError);
  return NextResponse.json({ callback_phone: contact?.callback_phone ?? null, callback_slot: ticket?.callback_slot ?? null });
}

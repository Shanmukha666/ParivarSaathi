import { pgCode, pgMessage } from './http';

/**
 * Create (or confirm) an urgent human ticket through the checked SECURITY DEFINER RPC.
 * Returns true only if a counsellor will really see it: created now, or already open for this session.
 * Never claim "a counsellor has been alerted" unless this returned true.
 */
export async function ensureTicket(supabase: any, sessionId: string, reason: string): Promise<boolean> {
  const { error } = await supabase.rpc('create_escalation', {
    p_session: sessionId,
    p_reason: reason,
    p_priority: 'high',
    p_slot: null,
    p_phone: null,
    p_phone_consent: false,
  });
  if (!error) return true;
  if (pgCode(error) === '23505' || /ticket_already_open/.test(pgMessage(error))) return true;
  console.error('[escalation] could not create ticket', error);
  return false;
}

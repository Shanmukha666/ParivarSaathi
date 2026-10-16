import { createSupabaseAdminClient } from './supabase-admin';

/**
 * Write server-computed state onto a session.
 *
 * Families may update only `lang` and `selected_trade_id` on `sessions` (column grant in the security
 * migration). `concern_state` and `joint_counselling_state` are computed on the server, so they must be
 * written with the service-role client. Calling routes MUST already have verified ownership; the
 * owner_id filter here is a second line of defence, not the first.
 *
 * Before this existed, both writes ran as the family user, were denied by the database, and the
 * errors were ignored: concern analytics were always empty and joint counselling never saved a single
 * answer in live mode.
 */
export async function writeSessionState(
  sessionId: string,
  ownerId: string,
  patch: { concern_state?: unknown; joint_counselling_state?: unknown },
): Promise<boolean> {
  try {
    const { data, error } = await createSupabaseAdminClient()
      .from('sessions')
      .update(patch)
      .eq('id', sessionId)
      .eq('owner_id', ownerId)
      .select('id')
      .maybeSingle();
    if (error) {
      console.error('[session-state] write failed', error);
      return false;
    }
    return Boolean(data);
  } catch (error) {
    console.error('[session-state] write threw', error);
    return false;
  }
}

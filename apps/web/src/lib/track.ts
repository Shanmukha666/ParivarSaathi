// Best-effort funnel tracking. Never blocks or breaks the UI; silently skipped without a session.
export type TrackType = 'trade_viewed' | 'summary_viewed' | 'summary_shared' | 'voice_used';

export function track(type: TrackType, sessionId: string | null | undefined) {
  if (!sessionId || typeof window === 'undefined') return;
  try {
    void fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, type }),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    /* tracking must never affect the user */
  }
}

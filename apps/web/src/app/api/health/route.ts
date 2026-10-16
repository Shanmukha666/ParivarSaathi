import { NextResponse } from 'next/server';
import { getAuthenticatedUser, requireAdmin } from '../../../lib/authorization';
import { modelChain } from '../../../lib/ai/gemini-chain';
import { enforceRateLimit } from '../../../lib/rate-limit';

// Public:  GET /api/health            -> { status: 'ok' }. A liveness probe. No secrets, no outbound calls.
// Admin:   GET /api/health?deep=1     -> configuration and dependency checks. Requires a signed-in admin and
//                                        is rate limited, because it calls Supabase and Gemini.
// It never returns key values, sample rows or raw upstream error text.

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (new URL(request.url).searchParams.get('deep') !== '1') {
    return NextResponse.json({ status: 'ok' });
  }

  const { supabase, user } = await getAuthenticatedUser();
  const denied = requireAdmin(user);
  if (denied) return denied;
  if (!enforceRateLimit(`health:${user!.id}`, 6)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': '60' } });
  }

  const config = {
    gemini_api_key: Boolean(process.env.GEMINI_API_KEY),
    supabase_url: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabase_publishable_key: Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
    supabase_service_role_key: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    demo_mode: process.env.NEXT_PUBLIC_PARIVAR_DEMO_MODE === 'true' || process.env.PARIVAR_DEMO_MODE === 'true',
  };

  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  try {
    const { count, error } = await supabase.from('trades').select('id', { count: 'exact', head: true });
    checks.database = error ? { ok: false, detail: 'query failed' } : { ok: (count ?? 0) > 0, detail: (count ?? 0) > 0 ? undefined : 'trades table is empty; run seed.sql' };
  } catch {
    checks.database = { ok: false, detail: 'unreachable' };
  }

  const chain = modelChain();
  if (!config.gemini_api_key) {
    checks.gemini = { ok: false, detail: 'GEMINI_API_KEY is not set' };
  } else {
    try {
      // The key goes in a header, never the URL, so it cannot end up in access logs.
      const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', {
        headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY as string },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        checks.gemini = { ok: false, detail: `model list returned HTTP ${res.status}` };
      } else {
        const available = new Set<string>(((await res.json()).models ?? []).map((m: { name: string }) => m.name.split('/').pop() as string));
        const missing = chain.filter((model) => !available.has(model));
        // The app only needs ONE usable model in the chain, but a missing primary should be loud.
        checks.gemini = {
          ok: missing.length < chain.length,
          detail: missing.length ? `not available to this key: ${missing.join(', ')}` : undefined,
        };
      }
    } catch {
      checks.gemini = { ok: false, detail: 'unreachable' };
    }
  }

  const healthy = Object.values(checks).every((c) => c.ok) && config.supabase_url && config.supabase_publishable_key;
  return NextResponse.json(
    { status: healthy ? 'ok' : 'degraded', model_chain: chain, config, checks },
    { status: healthy ? 200 : 503 },
  );
}

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../../lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const checks: Record<string, any> = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: {
      has_gemini_key: Boolean(process.env.GEMINI_API_KEY),
      gemini_model: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
      has_supabase_url: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      has_supabase_anon_key: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      has_supabase_service_key: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      demo_mode_forced: process.env.NEXT_PUBLIC_FORCE_DEMO_MODE === 'true',
    },
    services: {
      supabase: 'untested',
      gemini: 'untested',
    },
  };

  // 1. Supabase Check
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.from('trades').select('id, name_en').limit(1);
    if (error) {
      checks.services.supabase = `error: ${error.message}`;
    } else {
      checks.services.supabase = {
        status: 'healthy',
        sample_trade: data?.[0] || null,
      };
    }
  } catch (err: any) {
    checks.services.supabase = `unavailable: ${err?.message || 'unknown error'}`;
  }

  // 2. Gemini Model ping (if key is set)
  if (process.env.GEMINI_API_KEY) {
    try {
      const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}?key=${process.env.GEMINI_API_KEY}`;
      const pingRes = await fetch(endpoint, { signal: AbortSignal.timeout(4000) });
      if (pingRes.ok) {
        checks.services.gemini = {
          status: 'healthy',
          model,
        };
      } else {
        const errPayload = await pingRes.json().catch(() => ({}));
        checks.services.gemini = {
          status: 'degraded',
          http_code: pingRes.status,
          detail: errPayload?.error?.message || 'Failed to ping model',
          fallback_recommendation: model !== 'gemini-2.5-flash' ? 'Set GEMINI_MODEL=gemini-2.5-flash if 3.8 is not yet provisioned in this project' : null,
        };
      }
    } catch (err: any) {
      checks.services.gemini = {
        status: 'timeout_or_error',
        detail: err?.message || 'Network error reaching Google AI endpoints',
      };
    }
  } else {
    checks.services.gemini = 'skipped_no_api_key';
  }

  return NextResponse.json(checks, {
    status: checks.services.supabase === 'healthy' || checks.environment.demo_mode_forced ? 200 : 200,
  });
}

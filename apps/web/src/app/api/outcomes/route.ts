import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../../lib/supabase-server';
import { demoOutcomeResponse, hasSupabaseConfig, isDemoMode } from '../../../lib/demo-mode';

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const tradeId = Number(params.get('trade_id'));
  const providerId = params.get('provider_id');
  const state = params.get('state') || 'Telangana';
  const district = params.get('district') || undefined;

  if (!Number.isInteger(tradeId) || tradeId <= 0) {
    return NextResponse.json({ error: 'Invalid trade id' }, { status: 400 });
  }

  if (isDemoMode()) {
    return NextResponse.json(demoOutcomeResponse(tradeId, district, state));
  }

  if (!hasSupabaseConfig()) {
    return NextResponse.json({ error: 'Supabase is not configured' }, { status: 503 });
  }

  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from('outcome_metrics')
    .select('*, data_sources(*)')
    .eq('trade_id', tradeId)
    .eq('state', state)
    .in('verification_status', isDemoMode() ? ['verified', 'pending'] : ['verified'])
    .in('is_synthetic', isDemoMode() ? [true, false] : [false])
    .order('year', { ascending: false })
    .order('id', { ascending: false });

  if (providerId) query = query.eq('provider_id', providerId);
  if (district) query = query.eq('district', district);

  const { data, error } = await query;
  if (error) {
    console.error('Outcome query failed', error);
    return NextResponse.json({ error: 'Outcome data unavailable' }, { status: 500 });
  }

  const staleBefore = new Date();
  staleBefore.setDate(staleBefore.getDate() - 730);
  return NextResponse.json((data || []).map((metric: any) => ({
    ...metric,
    stale: Boolean(metric.verification_date && new Date(metric.verification_date) < staleBefore),
    source: metric.data_sources ? {
      publisher: metric.data_sources.publisher,
      title: metric.data_sources.title,
      url: metric.data_sources.source_url,
      document_reference: metric.data_sources.document_reference,
    } : null,
    data_sources: undefined,
  })));
}

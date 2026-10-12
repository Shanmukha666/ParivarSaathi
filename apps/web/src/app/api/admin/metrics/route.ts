import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../../../lib/supabase-server';
import { authorize, fail } from '../../../../lib/guard';
import { isDemoMode } from '../../../../lib/demo-mode';
import { demoAdminMetrics } from '../../../../lib/demo-dashboard';

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const auth = await authorize(supabase, ['admin']);
  if (!auth.ok) return isDemoMode() ? NextResponse.json(demoAdminMetrics()) : auth.response;

  const query = new URL(request.url).searchParams;
  const cleanText = (value: string | null) => value && /^[A-Za-z .'-]{1,60}$/.test(value) ? value : null;
  const state = cleanText(query.get('state'));
  const district = cleanText(query.get('district'));
  const rawTrade = Number(query.get('trade_id'));
  const tradeId = Number.isSafeInteger(rawTrade) && rawTrade > 0 ? rawTrade : null;

  const [kpis, heatmap, objections] = await Promise.all([
    supabase.rpc('admin_kpis', { p_state: state, p_district: district, p_trade_id: tradeId }),
    supabase.rpc('admin_district_resistance', { p_state: state }),
    supabase.rpc('admin_objection_breakdown', { p_district: district }),
  ]);
  if (kpis.error || heatmap.error || objections.error) {
    return fail(503, 'metrics_unavailable', kpis.error || heatmap.error || objections.error);
  }

  const aggregate = (kpis.data || {}) as Record<string, any>;
  const total = Number(aggregate.total_sessions || 0);
  const MIN = 5; // groups smaller than this are never shown
  const shown = (v: unknown) => (Number(v) >= MIN ? Number(v) : null);
  const f = (aggregate.funnel || {}) as Record<string, unknown>;
  const funnel = aggregate.funnel
    ? ['sessions', 'trades_viewed', 'summary_shared', 'escalated'].map(stage => ({ stage, count: shown(f[stage]) }))
    : null;

  // Breakdowns come from a guarded function (staff-only, groups under 5 omitted). Failure = no breakdowns, never a guess.
  const dist = await supabase.rpc('admin_distributions', { p_state: state, p_district: district, p_trade_id: tradeId });
  const d = (dist.error ? {} : dist.data || {}) as Record<string, any>;
  const langNames: Record<string, string> = { en: 'English', hi: 'Hindi', te: 'Telugu', ta: 'Tamil' };
  const languages = Object.fromEntries(Object.entries((d.language_distribution || {}) as Record<string, number>).map(([k, v]) => [langNames[k] || k, v]));
  const withConcerns = Number(d.sessions_with_concerns || 0);
  const withUnresolved = Number(d.sessions_with_unresolved || 0);
  const enough = withConcerns >= 10;
  const resolvedPct = enough ? Math.round(((withConcerns - withUnresolved) / withConcerns) * 100) : null;


  return NextResponse.json({
    ...aggregate,
    objections: objections.data || {},
    heatmap: heatmap.data || [],
    kpis: {
      counselling_volume: total,
      unresolved_concerns: enough ? withUnresolved : null,
      escalation_rate: aggregate.escalation_rate ?? null,
      escalation_rate_label: total ? `${Math.round(Number(aggregate.escalation_rate || 0) * 100)}%` : 'Insufficient data',
    },
    concern_distribution: objections.data || {},
    unresolved_concerns_by_category: d.unresolved_concerns_by_category || {},
    concern_state_change: enough
      ? { resolved: withConcerns - withUnresolved, unresolved: withUnresolved, label: `${resolvedPct}% of families who raised a concern finished with none unresolved` }
      : { resolved: null, unresolved: null, label: 'Aggregate concern-state data unavailable' },
    geographic_distribution: {},
    trade_distribution: d.trade_distribution || {},
    language_distribution: languages,
    provider_distribution: {},
    engagement_funnel: funnel,
    insufficient_data: total === 0,
  });
}

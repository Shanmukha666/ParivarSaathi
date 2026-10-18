'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import PathwayLadder from '../../../components/PathwayLadder';
import { ArrowLeft, MessageCircle, TrendingUp, Award, MapPin, Building, ShieldCheck, Users } from 'lucide-react';
import WhyThisNumber from '../../../components/WhyThisNumber';
import { track } from '../../../lib/track';
import TextToSpeech from '../../../components/TextToSpeech';
import { fetchTradeDetail, fetchTradeOutcomes, fetchTradePathway, fetchProviders, attachProviderOutcomes, fetchSchemes, patchSession } from '../../../lib/api';
import { useStore } from '../../../lib/store';
import { formatCurrency, useTranslation } from '../../../lib/i18n';
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner';
import { ErrorMessage } from '../../../components/ui/ErrorMessage';

export default function TradeDetail() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { language, profile, isHydrated, setSelectedTrade, sessionId } = useStore();
  const t = useTranslation(language);
  useEffect(() => { if (isHydrated) track('trade_viewed', sessionId); }, [isHydrated, sessionId]);
  const tradeId = Number(params.id);
  const validTradeId = Number.isInteger(tradeId) && tradeId > 0;

  const [trade, setTrade] = useState<any>(null);
  const [outcomes, setOutcomes] = useState<any>(null);
  const [pathway, setPathway] = useState<any>(null);
  const [providers, setProviders] = useState<any[]>([]);
  const [schemes, setSchemes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isHydrated) return;

    async function loadData() {
      if (!validTradeId) {
        setError('Invalid trade id');
        setLoading(false);
        return;
      }
      try {
        setError(null);
        const [tr, out, pw, prov, schemeRows] = await Promise.all([
          fetchTradeDetail(tradeId).catch(() => null),
          fetchTradeOutcomes(tradeId, profile.district, profile.state).catch(() => null),
          fetchTradePathway(tradeId).catch(() => null),
          fetchProviders(profile.district, profile.state).then((rows: any[]) => attachProviderOutcomes(rows, tradeId)).catch(() => []),
          fetchSchemes(profile.state, profile.income).catch(() => []),
        ]);

        if (tr) {
          setTrade(tr);
          setSelectedTrade(tr.id, tr.name_en);
        } else {
          throw new Error('Trade data is unavailable');
        }

        // Call patchSession if session exists
        if (sessionId) {
          try {
            await patchSession(sessionId, { selected_trade_id: tradeId });
          } catch(e) {
            console.error('Failed to patch session', e);
          }
        }

        setOutcomes(out);
        setPathway(pw);
        setProviders(prov);
        setSchemes(schemeRows);
      } catch (err: any) {
        setError(err.message || 'Failed to load trade data');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [isHydrated, tradeId, validTradeId, profile.district, profile.state, profile.income, sessionId, setSelectedTrade]);

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen bg-slate-50 max-w-xl mx-auto justify-center items-center">
        <LoadingSpinner message="Loading verified trade details..." />
      </div>
    );
  }

  if (error || !trade) {
    return (
      <div className="flex flex-col min-h-screen bg-slate-50 max-w-xl mx-auto p-6">
        <ErrorMessage 
          title="Failed to Load Details"
          message={error || 'Trade details are unavailable at the moment.'}
          onRetry={() => window.location.reload()}
        />
        <button onClick={() => router.back()} className="mt-4 text-orange-600 font-bold hover:underline">
          &larr; Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 max-w-xl mx-auto">
      {/* Sticky Header Banner */}
      <div className="bg-gradient-to-r from-orange-600 to-orange-900 p-6 pt-6 pb-8 text-white relative rounded-b-3xl shadow-md">
        <button
          onClick={() => router.back()}
          className="p-2.5 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-full text-white transition-colors mb-4"
        >
          <ArrowLeft size={20} />
        </button>

        <div className="flex items-center gap-3">
          <div className="text-4xl p-2.5 bg-white/10 backdrop-blur-sm rounded-2xl">⚡</div>
          <div>
            <h1 className="text-2xl font-black">{trade?.name_en || 'Trade'}</h1>
            <div className="flex flex-wrap items-center gap-1.5 mt-1 text-xs text-white/90">
              <span className="bg-white/15 backdrop-blur-sm px-2 py-0.5 rounded-md whitespace-nowrap">{trade?.duration_months || 'Not available'} Months</span>
              <span className="bg-white/15 backdrop-blur-sm px-2 py-0.5 rounded-md whitespace-nowrap">NSQF Level {trade?.nsqf_level || 'Not available'}</span>
              <span className="bg-white/15 backdrop-blur-sm px-2 py-0.5 rounded-md whitespace-nowrap">{profile.district || 'Not available'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-5 flex-1 space-y-5">
        <section className="bg-orange-50 border border-orange-200 rounded-2xl p-4 flex gap-3 items-start">
          <p className="text-sm text-slate-800 flex-1">{t('nsqf_plain')}</p>
          <TextToSpeech text={`${trade?.name_en || ''}. ${t('nsqf_plain')}`} lang={language} />
        </section>
        {/* Verified Local Outcomes Card */}
        <section className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
              <TrendingUp size={16} className="text-orange-600" />
              <span>Local Outcomes ({profile.district || 'Not available'})</span>
            </h2>
            <span className="text-[11px] font-semibold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">
              {outcomes?.is_synthetic ? 'DEMO / SYNTHETIC DATA' : outcomes?.verified ? 'VERIFIED DATA' : 'Verification pending'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="bg-orange-50/60 p-3 rounded-xl border border-orange-100 text-center">
              <div className={`font-black text-orange-600 leading-snug break-words ${outcomes?.placement_rate != null ? 'text-2xl' : 'text-base'}`}>{outcomes?.placement_rate != null ? `${outcomes.placement_rate}%` : 'Not available'}</div>
              <div className="text-[11px] text-slate-500 font-semibold">Placement Rate</div>
              {outcomes?.placement_rate != null && (
                <WhyThisNumber variant="subtle" details={{
                  metric: t('placement_label') || 'Placement Rate',
                  value: `${outcomes.placement_rate}%`,
                  location: `${profile.district || 'District'}, ${profile.state || 'State'}`,
                  trade: trade?.name_en,
                  year: outcomes?.cohort_year,
                  sampleSize: outcomes?.sample_size,
                  source: outcomes?.source?.publisher || outcomes?.source?.title || 'Evaluation dataset (dummy)',
                  sourceUrl: outcomes?.source?.url,
                  verifiedOn: outcomes?.verified_on,
                  isVerified: !outcomes?.is_synthetic,
                  isSynthetic: outcomes?.is_synthetic,
                }} />
              )}
            </div>
            <div className="bg-orange-50/60 p-3 rounded-xl border border-orange-100 text-center flex flex-col justify-center">
              <div className="text-base sm:text-xl font-black text-orange-600 leading-snug break-words">
                {outcomes?.start_salary_min != null && outcomes?.start_salary_max != null ? (
                  <span className="text-sm sm:text-base font-extrabold block">
                    {`${formatCurrency(outcomes.start_salary_min, language)} – ${formatCurrency(outcomes.start_salary_max, language)}/mo`}
                  </span>
                ) : outcomes?.avg_start_salary_inr != null ? (
                  `${formatCurrency(outcomes.avg_start_salary_inr, language)}/mo`
                ) : (
                  t('not_available')
                )}
              </div>
              <div className="text-[11px] text-slate-500 font-semibold mt-0.5">{t('salary_label')}</div>
              {outcomes?.avg_start_salary_inr != null && (
                <WhyThisNumber variant="subtle" details={{
                  metric: t('salary_label') || 'Starting Salary',
                  value: `${formatCurrency(outcomes.avg_start_salary_inr, language)} / month`,
                  location: `${profile.district || 'District'}, ${profile.state || 'State'}`,
                  trade: trade?.name_en,
                  year: outcomes?.cohort_year,
                  sampleSize: outcomes?.sample_size,
                  source: outcomes?.source?.publisher || outcomes?.source?.title || 'Evaluation dataset (dummy)',
                  sourceUrl: outcomes?.source?.url,
                  verifiedOn: outcomes?.verified_on,
                  isVerified: !outcomes?.is_synthetic,
                  isSynthetic: outcomes?.is_synthetic,
                }} />
              )}
            </div>
          </div>

          <div className="text-xs text-slate-600 pt-1">
            {t('after_three_years')}: <strong>{outcomes?.salary_3yr_min != null && outcomes?.salary_3yr_max != null ? `${formatCurrency(outcomes.salary_3yr_min, language)} – ${formatCurrency(outcomes.salary_3yr_max, language)} / month` : outcomes?.avg_mid_career_salary_inr != null ? `${formatCurrency(Number(outcomes.avg_mid_career_salary_inr), language)} / month` : t('not_available')}</strong>
            {outcomes?.salary_3yr_min != null && outcomes?.salary_3yr_max != null && (
              <WhyThisNumber variant="subtle" className="ml-1" details={{
                metric: t('after_three_years') || '3-Year Earnings',
                value: `${formatCurrency(outcomes.salary_3yr_min, language)} – ${formatCurrency(outcomes.salary_3yr_max, language)}`,
                location: `${profile.district || 'District'}, ${profile.state || 'State'}`,
                trade: trade?.name_en,
                year: outcomes?.cohort_year,
                sampleSize: outcomes?.sample_size,
                source: outcomes?.source?.publisher || outcomes?.source?.title || 'Evaluation dataset (dummy)',
                sourceUrl: outcomes?.source?.url,
                verifiedOn: outcomes?.verified_on,
                isVerified: !outcomes?.is_synthetic,
                isSynthetic: outcomes?.is_synthetic,
              }} />
            )}
          </div>

          <div className="text-[11px] text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-100 flex items-center gap-1.5">
            <Award size={13} className="text-blue-500 flex-shrink-0" />
            <span>Scope: {outcomes?.scope_label || 'Verified data unavailable'} ({outcomes?.cohort_year || 'n/a'} batch, {outcomes?.sample_size || 'n/a'} learners)</span>
          </div>
          {outcomes?.source && (
            <div className="text-[11px] text-slate-500">
              Source: {outcomes.source.publisher} — {outcomes.source.title}
              {outcomes.source.url && <a className="ml-1 underline" href={outcomes.source.url} target="_blank" rel="noreferrer">open reference</a>}
              {outcomes.stale && <span className="ml-1 text-amber-700">This record may be stale.</span>}
            </div>
          )}
        </section>

        {/* NSQF Progression Pathway Ladder */}
        <section className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <h2 className="font-bold text-sm text-slate-900">Career Progression & Further Education</h2>
          <p className="text-xs text-slate-500">
            Vocational training offers a step-by-step career ladder with lateral entry options to higher degrees:
          </p>
          {pathway?.steps?.length ? (
            <PathwayLadder
              levels={pathway.steps.map((s: any) => ({
                title: `${s.step_title || 'Career Step'}${s.nsqf_level != null ? ` (Level ${s.nsqf_level})` : ''}`,
                duration: s.typical_role || 'Role not available',
                salary: s.typical_salary_range || undefined,
              }))}
            />
          ) : (
            <p className="text-sm text-slate-500">No verified career pathway data is available for this trade.</p>
          )}
        </section>

        {/* Nearest Training Providers */}
        <section className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <h2 className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
            <Building size={16} className="text-slate-600" />
            <span>Nearby Accredited Centres</span>
          </h2>
          <div className="space-y-2">
            {providers.slice(0, 2).map((p: any, idx: number) => (
              <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                <div className="font-bold text-slate-900">{p.name}</div>
                <div className="text-slate-500 mt-0.5">
                  Type: {p.type} • Fee: {p.fee_inr != null ? `₹${p.fee_inr}` : 'Not available'}
                </div>
                {p.outcomes ? (
                  <div className="mt-1.5 text-slate-800 font-semibold">
                    Placement {p.outcomes.placement_rate != null ? `${p.outcomes.placement_rate}%` : 'n/a'}
                    {' • '}Starting pay {p.outcomes.starting_earnings != null ? `₹${Number(p.outcomes.starting_earnings).toLocaleString('en-IN')}/mo` : 'n/a'}
                    {p.outcomes.sample_size != null ? ` • ${p.outcomes.sample_size} learners` : ''}{p.outcomes.year ? ` • ${p.outcomes.year}` : ''}
                  </div>
                ) : (
                  <div className="mt-1.5 text-slate-500">This centre&apos;s own outcomes: not available</div>
                )}
                <div className={p.is_synthetic ? 'text-amber-700 font-semibold' : 'text-emerald-700 font-semibold'}>
                  {p.is_synthetic ? 'DEMO / SYNTHETIC PROVIDER DATA' : 'VERIFIED CENTRE DATA'}
                </div>
              </div>
            ))}
            {providers.length === 0 && <p className="text-sm text-slate-500">No verified centre data is available for this area.</p>}
          </div>
        </section>

        <section className="bg-emerald-50 p-4 rounded-2xl border border-emerald-200 text-xs text-emerald-900">
          <div className="font-bold flex items-center gap-1.5 text-emerald-800"><ShieldCheck size={16} /> Eligible Schemes</div>
          {schemes.length ? (
            <div className="mt-2 space-y-2">
              {schemes.slice(0, 3).map((scheme: any) => (
                <div key={scheme.id} className="bg-white/70 rounded-lg p-2 border border-emerald-100">
                  <div className="font-semibold">{scheme.name}</div>
                  {scheme.benefit && <div className="mt-0.5">{scheme.benefit}</div>}
                  {scheme.official_url && <a className="underline" href={scheme.official_url} target="_blank" rel="noreferrer">Official details</a>}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-1">No verified scheme data is available for this profile.</p>
          )}
        </section>
      </div>

      {/* Sticky Bottom Discussion Button */}
      <div className="p-4 bg-white border-t border-slate-200 sticky bottom-0 shadow-lg">
        <button
          onClick={() => router.push('/joint')}
          className="w-full mb-2 bg-white border border-orange-300 text-orange-700 font-bold text-sm py-3 rounded-2xl flex items-center justify-center gap-2"
        >
          <Users size={18} />
          <span>{t('joint_cta')}</span>
        </button>
        <button
          onClick={() => router.push('/chat')}
          className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold text-base py-4 rounded-2xl flex items-center justify-center gap-2.5 shadow-md min-h-[52px] transition-all"
        >
          <MessageCircle size={22} />
          <span>Discuss with Family (AI Counsellor)</span>
        </button>
      </div>
    </div>
  );
}

'use client';

import { Share2, Printer, MapPin, Award, CheckCircle2, TrendingUp, ShieldCheck } from 'lucide-react';
import { useStore } from '../lib/store';
import { useEffect } from 'react';
import { track } from '../lib/track';
import ReadPageButton from './ReadPageButton';
import { useTranslation } from '../lib/i18n';
import WhyThisNumber from './WhyThisNumber';

const COPY: Record<string, Record<string, string>> = {
  en: { title: 'Official Family Summary', course: 'Course Details', earn: 'Verified Earnings in', centre: 'Nearest Centre & Help', share: 'Share with Family on WhatsApp', print: 'Download / Print Card', months: 'Months', train: 'practical hands-on training' },
  te: { title: 'అధికారిక కుటుంబ సారాంశం', course: 'కోర్సు వివరాలు', earn: 'ధృవీకరించిన ఆదాయం:', centre: 'సమీప కేంద్రం & సహాయం', share: 'WhatsApp ద్వారా కుటుంబంతో పంచుకోండి', print: 'కార్డ్ డౌన్‌లోడ్ / ప్రింట్', months: 'నెలలు', train: 'ప్రాక్టికల్ శిక్షణ' },
  hi: { title: 'आधिकारिक पारिवारिक सारांश', course: 'कोर्स की जानकारी', earn: 'सत्यापित आय:', centre: 'नज़दीकी केंद्र और सहायता', share: 'WhatsApp पर परिवार के साथ साझा करें', print: 'कार्ड डाउनलोड / प्रिंट', months: 'महीने', train: 'व्यावहारिक प्रशिक्षण' },
  ta: { title: 'அதிகாரப்பூர்வ குடும்ப சுருக்கம்', course: 'பாடநெறி விவரங்கள்', earn: 'சரிபார்க்கப்பட்ட வருமானம்:', centre: 'அருகிலுள்ள மையம் & உதவி', share: 'WhatsApp மூலம் குடும்பத்துடன் பகிருங்கள்', print: 'அட்டை பதிவிறக்கம் / அச்சு', months: 'மாதங்கள்', train: 'நடைமுறைப் பயிற்சி' },
};

export default function FamilySummaryCard({ data, loading }: { data?: any, loading?: boolean }) {
  const { language, profile, sessionId } = useStore();
  useEffect(() => { track('summary_viewed', sessionId); }, [sessionId]);
  const t = useTranslation(language);
  const c = COPY[language] || COPY.en;

  const tradeName = profile.selectedTradeName || 'Selected trade';
  const district = profile.district || 'your district';
  const state = profile.state || 'your state';

  if (loading) {
    return (
      <div className="bg-white rounded-3xl border-2 border-slate-200 shadow-xl overflow-hidden max-w-lg mx-auto p-10 text-center">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-600 font-semibold">Loading verified data...</p>
        </div>
      </div>
    );
  }

  if (!data || Object.keys(data).length === 0) {
    return (
      <div className="bg-white rounded-3xl border-2 border-slate-200 shadow-xl overflow-hidden max-w-lg mx-auto p-10 text-center">
        <p className="text-slate-600 font-semibold">Data not available for your district</p>
      </div>
    );
  }

  const { outcomes, pathway, providers, schemes = [] } = data;
  const pathwaySteps = Array.isArray(pathway) ? pathway : (pathway?.steps || []);
  const startingSalary = outcomes?.avg_start_salary_inr ?? outcomes?.avg_starting_salary;
  const midCareerSalary = outcomes?.avg_mid_career_salary_inr ?? outcomes?.avg_mid_career_salary;
  const sourceLabel = typeof outcomes?.source === 'string'
    ? outcomes.source
    : outcomes?.source?.publisher
      ? `${outcomes.source.publisher} — ${outcomes.source.title || ''}`
      : 'Not available';
  const verifiedScheme = schemes.find((scheme: any) => scheme.verified && !scheme.is_synthetic) || schemes[0];

  const shareText = `🏠 Parivar Path: Family Career Summary Card for ${tradeName}
📍 Location: ${district}, ${state}
📊 Placement Rate: ${outcomes?.placement_rate || 'N/A'}%
💰 Starting Salary: ₹${startingSalary || 'N/A'}/month
📈 3-Year Earnings: ₹${midCareerSalary || 'N/A'}/month
🏫 Accredited Centre: ${providers?.[0]?.name || 'Not available'}
Explore verified vocational careers together at Parivar Path!`;

  const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;

  return (
    <div className="bg-white rounded-3xl border-2 border-slate-200 shadow-xl overflow-hidden max-w-lg mx-auto">
      {/* Header Banner */}
      <div className="relative bg-gradient-to-br from-orange-600 to-orange-900 p-6 text-white text-center"><div className="absolute top-3 right-3"><ReadPageButton /></div>
        <div className="inline-flex items-center gap-1.5 bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-2">
          <span>{c.title}</span>
        </div>
        <h2 className="text-2xl font-black mb-1">⚡ {tradeName}</h2>
        <p className="text-white/90 text-sm flex items-center justify-center gap-1">
          <MapPin size={16} /> {district}, {state}
        </p>
      </div>

      <div className="p-5 space-y-5 text-slate-800">
        {/* Section 1: Course */}
        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
          <h3 className="text-xs font-bold text-orange-600 uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <span>📘 1. {c.course}</span>
          </h3>
          <p className="text-sm text-slate-700 leading-snug">
            <strong>{data?.trade?.duration_months || 'Not available'} {c.months}</strong> {c.train} (NSQF Level {data?.trade?.nsqf_level || '4'}).
          </p>
        </div>

        {/* Section 3: Verified Earnings */}
        <div className="bg-orange-50/70 p-4 rounded-2xl border border-orange-200">
          <h3 className="text-xs font-bold text-orange-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <TrendingUp size={16} /> 2. {c.earn} {district}
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white p-3 rounded-xl border border-orange-100 shadow-sm text-center">
              <div className="text-2xl font-black text-orange-600">{outcomes?.placement_rate != null ? `${outcomes.placement_rate}%` : 'N/A'}</div>
              <div className="text-xs text-slate-500 font-medium">Placement / Job Rate</div>
              {outcomes?.placement_rate != null && (
                <WhyThisNumber variant="subtle" details={{
                  metric: t('placement_label') || 'Placement Rate',
                  value: `${outcomes.placement_rate}%`,
                  location: `${district}, ${state}`,
                  trade: tradeName,
                  year: outcomes?.cohort_year,
                  sampleSize: outcomes?.sample_size,
                  source: sourceLabel,
                  isVerified: true,
                  isSynthetic: outcomes?.is_synthetic,
                }} />
              )}
            </div>
            <div className="bg-white p-3 rounded-xl border border-orange-100 shadow-sm text-center">
              <div className="text-2xl font-black text-orange-600">{startingSalary != null ? `₹${startingSalary}` : 'N/A'}</div>
              <div className="text-xs text-slate-500 font-medium">Starting Salary / Month</div>
              {startingSalary != null && (
                <WhyThisNumber variant="subtle" details={{
                  metric: t('salary_label') || 'Starting Salary',
                  value: `₹${startingSalary} / month`,
                  location: `${district}, ${state}`,
                  trade: tradeName,
                  year: outcomes?.cohort_year,
                  sampleSize: outcomes?.sample_size,
                  source: sourceLabel,
                  isVerified: true,
                  isSynthetic: outcomes?.is_synthetic,
                }} />
              )}
            </div>
          </div>
          <p className="text-xs text-slate-600 mt-2.5 font-medium">
            After 3 years experience: <strong>{midCareerSalary != null ? `₹${midCareerSalary} / month` : 'N/A'}</strong>
            {midCareerSalary != null && (
              <WhyThisNumber variant="subtle" className="ml-1" details={{
                metric: t('after_three_years') || '3-Year Earnings',
                value: `₹${midCareerSalary} / month`,
                location: `${district}, ${state}`,
                trade: tradeName,
                year: outcomes?.cohort_year,
                sampleSize: outcomes?.sample_size,
                source: sourceLabel,
                isVerified: true,
                isSynthetic: outcomes?.is_synthetic,
              }} />
            )}
          </p>
          <div className="mt-2 inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-full text-[11px] font-semibold">
            <Award size={13} /> Source: {sourceLabel} {outcomes?.cohort_year ? `(${outcomes.cohort_year})` : ''}
          </div>
        </div>

        {/* Section 4: Pathway */}
        {pathwaySteps.length > 0 && (
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
            <h3 className="text-xs font-bold text-orange-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <span>🚀 3. Career Growth Ladder</span>
            </h3>
            <div className="space-y-2 text-xs">
              {pathwaySteps.map((p: any, i: number) => (
                <div key={i} className="flex items-center gap-2">
                  <span className={`w-5 h-5 rounded-full text-white flex items-center justify-center font-bold text-[10px] ${i === pathwaySteps.length - 1 ? 'bg-emerald-600' : 'bg-orange-600'}`}>
                    {i + 1}
                  </span>
                  <span><strong>{p.step_title || p.title || p.role || 'Career step'}</strong> {p.typical_salary_range || p.salary_range ? `(${p.typical_salary_range || p.salary_range})` : ''}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Section 5: Nearest Centre & Schemes */}
        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
          <h3 className="text-xs font-bold text-orange-600 uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <span>🏫 3. {c.centre}</span>
          </h3>
          <p className="text-sm font-bold text-slate-900">{providers?.[0]?.name || 'No verified centre available'}</p>
          <p className="text-xs text-slate-600 mt-0.5">
            {providers?.[0]?.accreditation || 'Accreditation not available'}
            {verifiedScheme?.name ? ` • ${verifiedScheme.name}` : ' • No verified scheme available'}
          </p>
          {verifiedScheme?.official_url && (
            <a className="text-xs text-orange-700 underline" href={verifiedScheme.official_url} target="_blank" rel="noreferrer">
              Official scheme details
            </a>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="bg-slate-100 p-4 border-t border-slate-200 flex flex-col gap-2.5">
        <a 
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClickCapture={() => track('summary_shared', sessionId)} className="w-full bg-[#0E7C6B] hover:bg-[#0B6A5B] text-white py-3.5 px-4 rounded-xl font-bold text-base flex items-center justify-center gap-2 shadow-sm transition-all min-h-[48px]"
        >
          <Share2 size={20} />
          <span>{c.share}</span>
        </a>
        <button 
          onClick={() => window.print()}
          className="w-full bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 py-3.5 px-4 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 shadow-sm transition-all min-h-[48px]"
        >
          <Printer size={18} />
          <span>{c.print}</span>
        </button>
      </div>
    </div>
  );
}


export function hasSupabaseConfig(): boolean {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const key = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '').trim();

  if (!url || !key) return false;

  const placeholderPatterns = [
    /demo-project/i,
    /your-project/i,
    /demo-publishable-key/i,
    /your-supabase/i,
    /placeholder/i,
  ];

  return !placeholderPatterns.some((pattern) => pattern.test(url) || pattern.test(key));
}

/**
 * Demo mode is explicit in production. A missing Supabase configuration must
 * never silently turn a production deployment into a fake-data application.
 */
export function isDemoMode(): boolean {
  const explicit = process.env.PARIVAR_DEMO_MODE ?? process.env.NEXT_PUBLIC_PARIVAR_DEMO_MODE;
  if (explicit != null) return explicit === 'true';
  return process.env.NODE_ENV !== 'production' && !hasSupabaseConfig();
}

export function demoSessionResponse(payload: Record<string, unknown>) {
  const selectedTradeId = payload.selected_trade_id;
  if (!Number.isInteger(selectedTradeId) || Number(selectedTradeId) <= 0) {
    throw new Error('A selected trade is required in demo mode');
  }

  return {
    id: '00000000-0000-4000-8000-000000000001',
    owner_id: '00000000-0000-0000-0000-000000000001',
    lang: payload.lang ?? 'en',
    state: payload.state ?? 'Telangana',
    district: payload.district ?? 'Warangal',
    user_role: payload.user_role ?? 'both',
    learner_class: payload.learner_class ?? 'Class 10 Pass',
    income_bracket: payload.income_bracket ?? '₹1 - 3 Lakhs',
    selected_trade_id: Number(selectedTradeId),
    consent: true,
    consent_version: payload.consent_version ?? 'v1',
    consented_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };
}

/**
 * Demo evidence is intentionally limited to the existing Electrician fixture.
 * Other trades must return no outcome rather than borrowing Electrician data.
 */
export function demoOutcomeResponse(tradeId: number, district = 'Warangal', state = 'Telangana') {
  if (tradeId !== 1 || district !== 'Warangal' || state !== 'Telangana') return [];

  const base = [
    {
      id: 1,
      trade_id: 1,
      state: 'Telangana',
      district: 'Warangal',
      metric_key: 'placement_rate',
      metric_value: '78.4',
      metric_text: '78.4%',
      unit: '%',
      sample_size: 42,
      year: 2024,
      verification_status: 'pending',
      is_synthetic: true,
      verification_date: null,
      data_sources: {
        publisher: 'Hackathon evaluation dataset (dummy)',
        title: 'Dummy placement and earnings data (illustrative only)',
        source_url: null,
        document_reference: 'dummy-evaluation-dataset-v1',
      },
    },
    {
      id: 2,
      trade_id: 1,
      state: 'Telangana',
      district: 'Warangal',
      metric_key: 'starting_earnings',
      metric_value: '16500',
      metric_text: '₹16,500/month',
      unit: 'INR',
      sample_size: 42,
      year: 2024,
      verification_status: 'pending',
      is_synthetic: true,
      verification_date: null,
      data_sources: {
        publisher: 'Hackathon evaluation dataset (dummy)',
        title: 'Dummy placement and earnings data (illustrative only)',
        source_url: null,
        document_reference: 'dummy-evaluation-dataset-v1',
      },
    },
  ];

  return base.map((metric) => ({
    ...metric,
    stale: false,
    source: {
      publisher: metric.data_sources.publisher,
      title: metric.data_sources.title,
      url: metric.data_sources.source_url,
      document_reference: metric.data_sources.document_reference,
    },
    data_sources: undefined,
  }));
}

export function demoChatReply(text: string, lang = 'en') {
  const normalized = text.toLowerCase();
  if (normalized.includes('salary') || normalized.includes('earn') || normalized.includes('wage')) {
    return {
      reply: lang === 'te'
        ? 'డెమో మోడ్‌లో ఈ ప్రశ్నకు ఉపయోగించగల ధృవీకరించిన డేటా అందుబాటులో లేదు. మానవ counsellor సహాయం కోరవచ్చు.'
        : lang === 'hi'
          ? 'डेमो मोड में इस प्रश्न के लिए सत्यापित डेटा उपलब्ध नहीं है। आप मानव counsellor की मदद ले सकते हैं।'
          : lang === 'ta'
            ? 'டெமோ பயன்முறையில் இந்த கேள்விக்கான சரிபார்க்கப்பட்ட தரவு இல்லை. மனித ஆலோசகரின் உதவியைப் பெறலாம்.'
            : 'Verified data for this question is not available in demo mode. You can request a human counsellor.',
      citations: [],
      suggested_chips: ['Talk to a counsellor'],
      escalate: true,
      escalate_reason: 'demo_mode_no_verified_data',
    };
  }

  return {
    reply: lang === 'te'
      ? 'ఇది డెమో మోడ్. అంచనా వేయకుండా, అందుబాటులో ఉన్న ధృవీకరించిన ఆధారాలకే పరిమితం అవుతాను.'
      : lang === 'hi'
        ? 'यह डेमो मोड है। अनुमान लगाने के बजाय मैं उपलब्ध सत्यापित साक्ष्य तक ही सीमित रहूँगा।'
        : lang === 'ta'
          ? 'இது டெமோ பயன்முறை. ஊகிக்காமல் கிடைக்கும் சரிபார்க்கப்பட்ட ஆதாரங்களுக்குள் மட்டுமே பதிலளிப்பேன்.'
          : 'This is demo mode. I will not guess; I will only use verified evidence that is actually available.',
    citations: [],
    suggested_chips: ['Talk to a counsellor'],
    escalate: false,
  };
}

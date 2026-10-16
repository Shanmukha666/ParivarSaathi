import type { Source } from './types';
import { supabase } from './supabase';
import { isDemoMode } from './demo-mode';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

function normaliseInterest(value: string) {
  return value.trim().toLowerCase();
}

const INTEREST_KEYWORDS: Record<string, string[]> = {
  tech: ['it', 'data', 'computer', 'digital', 'electronics', 'technology'],
  health: ['health', 'medical', 'care', 'wellness'],
  build: ['plumber', 'construction', 'civil', 'fitter', 'building'],
  art: ['beauty', 'beautician', 'wellness', 'fashion', 'tailoring', 'textile', 'art'],
  food: ['food', 'cook', 'culinary', 'hospitality', 'processing'],
  auto: ['auto', 'automotive', 'mechanic', 'vehicle'],
  electrical: ['electrical', 'electrician', 'electronics', 'solar', 'renewable'],
  mechanical: ['mechanical', 'fitter', 'auto', 'cnc', 'hvac', 'welder'],
};

function matchesInterests(trade: any, interests: string[]) {
  const text = `${String(trade.name_en || '')} ${String(trade.sector || '')} ${(trade.job_roles || []).join(' ')}`.toLowerCase();
  return interests.some((interest) => {
    const key = normaliseInterest(interest);
    const keywords = INTEREST_KEYWORDS[key] || [key];
    return keywords.some((keyword) => text.includes(keyword));
  });
}

export interface SessionPayload {
  lang: string;
  state: string;
  district: string;
  user_role: string;
  learner_class: string;
  income_bracket: string;
  consent: boolean;
  selected_trade_id?: number;
}

export interface ChatTurnRequest {
  session_id: string;
  trade_id?: number;
  speaker: 'learner' | 'parent' | 'counsellor';
  text: string;
  lang: string;
}

export interface ChatTurnResponse {
  reply: string;
  citations: Array<string | Source>;
  suggested_chips: string[];
  escalate: boolean;
  escalate_reason?: string;
}

export async function createSession(payload: SessionPayload) {
  if (!payload.selected_trade_id || payload.selected_trade_id <= 0) {
    throw new Error('A selected trade is required before creating a session');
  }

  try {
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: await getSupabaseAuthHeaders(),
      body: JSON.stringify(payload),
    });
    if (res.ok) return res.json();
    const body = await res.json().catch(() => null);
    if (res.status >= 400 && res.status < 500) {
      throw new Error(body?.error || 'Unable to create session');
    }
  } catch (error) {
    if (error instanceof Error && error.message !== 'Failed to fetch') throw error;
  }

  if (isDemoMode() && !API_BASE_URL && !supabase) {
    const { demoSessionResponse } = await import('./demo-mode');
    return demoSessionResponse(payload as unknown as Record<string, unknown>);
  }

  if (supabase || !API_BASE_URL) throw new Error('Session service is not configured');

  const res = await fetch(`${API_BASE_URL}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to create session');
  return res.json();
}

function isChatTurnResponse(body: unknown): body is ChatTurnResponse {
  return Boolean(
    body &&
      typeof body === 'object' &&
      typeof (body as ChatTurnResponse).reply === 'string'
  );
}

export async function sendChatMessage(
  data: ChatTurnRequest
): Promise<ChatTurnResponse> {
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: await getSupabaseAuthHeaders(),
      body: JSON.stringify(data),
    });

    const body = await res.json().catch(() => null);
    if (isChatTurnResponse(body)) return body;
    if (res.status >= 400 && res.status < 500) {
      throw new Error(body?.error || 'Chat request was rejected');
    }
  } catch (error) {
    if (error instanceof Error && !['Failed to fetch', 'NetworkError'].includes(error.message)) {
      throw error;
    }
  }

  if (supabase || !API_BASE_URL) throw new Error('Chat service is not configured');

  const res = await fetch(`${API_BASE_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const body = await res.json().catch(() => null);
  if (isChatTurnResponse(body)) return body;
  throw new Error(body?.detail || body?.error || 'Failed to send message');
}

const DEMO_TRADES: Record<number, any> = {
  1: {
    id: 1,
    name_en: 'Electrician',
    name_local: {
      te: 'ఎలక్ట్రీషియన్',
      hi: 'इलेक्ट्रीशियन',
      ta: 'மின் பணியாளர்',
    },
    sector: 'Electrical & Power',
    nsqf_level: 4,
    duration_months: 24,
    entry_qualification: 'Class 10 Passed with Science & Math',
    safety_notes:
      'Standard high-voltage electrical safety & insulated tools certification',
    job_roles: [
      'Site Electrician',
      'Maintenance Technician',
      'Control Panel Wireman',
      'Solar Inverter Installer',
    ],
    description_simple: {
      en: 'Hands-on electrical wiring, installations, and power equipment maintenance.',
    },
  },

  6: {
    id: 6,
    name_en: 'Solar Technician',
    name_local: {
      te: 'సోలార్ టెక్నీషియన్',
      hi: 'सोलर तकनीशियन',
      ta: 'சூரிய சக்தி தொழில்நுட்ப வல்லுநர்',
    },
    sector: 'Renewable Energy',
    nsqf_level: 4,
    duration_months: 12,
    entry_qualification: 'Class 10 Passed',
    safety_notes:
      'Rooftop safety harness & PV array disconnect protocol',
    job_roles: [
      'Rooftop Solar Installer',
      'PV Maintenance Tech',
      'Battery System Specialist',
    ],
    description_simple: {
      en: 'Assembly, testing, and maintenance of rooftop and utility solar panels.',
    },
  },

  13: {
    id: 13,
    name_en: 'Food Processing',
    name_local: {
      te: 'ఆహార ప్రాసెసింగ్',
      hi: 'खाद्य प्रसंस्करण',
      ta: 'உணவு பதப்படுத்துதல்',
    },
    sector: 'Food Industry',
    nsqf_level: 4,
    duration_months: 12,
    entry_qualification: 'Class 10 Passed',
    safety_notes:
      'Food hygiene, equipment safety, and quality-control procedures',
    job_roles: [
      'Food Processing Operator',
      'Food Packaging Technician',
      'Quality Control Assistant',
    ],
    description_simple: {
      en: 'Food preparation, processing, packaging, and quality control.',
    },
  },
};

export async function fetchTrades(
  district?: string,
  interest?: string,
  state?: string
) {
  const interests = (interest || '').split(',').map(normaliseInterest).filter(Boolean);

  if (supabase) {
    try {
      const { data, error } = await supabase.from('trades').select('*').order('id');
      if (!error && data) {
        return interests.length ? data.filter((trade: any) => matchesInterests(trade, interests)) : data;
      }
    } catch (error) {
      console.error('Supabase trade query failed', error);
    }
  }

  if (!supabase && API_BASE_URL) {
    try {
      const params = new URLSearchParams();
      if (district) params.append('district', district);
      if (interest) params.append('interest', interest);
      if (state) params.append('state', state);
      const res = await fetch(`${API_BASE_URL}/trades?${params.toString()}`);
      if (res.ok) return await res.json();
    } catch (error) {
      console.error('Backend trade query failed', error);
    }
  }

  if (isDemoMode()) {
    const demo = Object.values(DEMO_TRADES);
    return interests.length ? demo.filter((trade: any) => matchesInterests(trade, interests)) : demo;
  }

  throw new Error('Trade data is unavailable');
}

export async function fetchTradeDetail(id: number | string) {
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) throw new Error('Invalid trade id');

  if (supabase) {
    try {
      const { data, error } = await supabase.from('trades').select('*').eq('id', numId).single();
      if (!error && data) return data;
    } catch (error) {
      console.error('Supabase trade detail query failed', error);
    }
  }

  if (!supabase && API_BASE_URL) {
    try {
      const res = await fetch(`${API_BASE_URL}/trades/${numId}`);
      if (res.ok) return await res.json();
    } catch (error) {
      console.error('Backend trade detail query failed', error);
    }
  }

  if (isDemoMode() && DEMO_TRADES[numId]) return DEMO_TRADES[numId];
  throw new Error('Trade data is unavailable');
}

export async function fetchTradeOutcomes(
  id: number | string,
  district?: string,
  state?: string
) {
  const params = new URLSearchParams({ trade_id: String(id), state: state || 'Telangana' });
  if (district) params.set('district', district);

  let records: any[] = [];
  try {
    const res = await fetch(`/api/outcomes?${params.toString()}`);
    if (res.ok) records = await res.json();
  } catch (error) {
    console.error('Next outcomes query failed', error);
  }

  if (!records.length && !supabase && API_BASE_URL) {
    try {
      const res = await fetch(`${API_BASE_URL}/outcomes?${params.toString()}`);
      if (res.ok) records = await res.json();
    } catch (error) {
      console.error('Backend outcomes query failed', error);
    }
  }

  if (!records.length && isDemoMode()) {
    const { demoOutcomeResponse } = await import('./demo-mode');
    records = demoOutcomeResponse(Number(id), district, state);
  }

  if (!records.length) return { found: false };

  const latest = records[0];
  const values = Object.fromEntries(records.map((r: any) => [r.metric_key, r.metric_value ?? r.metric_text]));
  return {
    found: true,
    is_synthetic: Boolean(latest.is_synthetic),
    verified: latest.verification_status === 'verified' && !latest.is_synthetic,
    verification_status: latest.verification_status,
    verification_date: latest.verification_date,
    verified_on: latest.verification_date,
    stale: records.some((r: any) => r.stale),
    sample_size: latest.sample_size,
    cohort_year: latest.year,
    source: latest.source,
    ...values,
    placement_rate: values.placement_rate,
    avg_start_salary_inr: values.starting_earnings,
    avg_mid_career_salary_inr: values.earnings_after_period,
    start_salary_min: values.starting_earnings_min,
    start_salary_max: values.starting_earnings_max,
    salary_3yr_min: values.earnings_after_period_min,
    salary_3yr_max: values.earnings_after_period_max,
    scope_label: `${latest.district || latest.state} ${latest.district ? 'district' : 'state'}`,
  };
}

export async function fetchTradePathway(id: number | string) {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('pathways')
        .select('*')
        .eq('from_trade_id', id)
        .in('verification_status', isDemoMode() ? ['verified', 'pending'] : ['verified'])
        .in('is_synthetic', isDemoMode() ? [true, false] : [false])
        .order('step_order');
      if (!error && data) return { found: data.length > 0, steps: data };
    } catch (error) {
      console.error('Supabase pathway query failed', error);
    }
  }

  if (!supabase && API_BASE_URL) {
    try {
      const res = await fetch(`${API_BASE_URL}/trades/${id}/pathway`);
      if (res.ok) {
        const data = await res.json();
        return { found: Boolean(data?.steps?.length), steps: data?.steps || [] };
      }
    } catch (error) {
      console.error('Backend pathway query failed', error);
    }
  }

  return { found: false, steps: [] };
}

export async function fetchTradeStory(
  id: number | string,
  district?: string
) {
  const params = new URLSearchParams();

  if (district) {
    params.append('district', district);
  }

  if (!API_BASE_URL) return null;
  const res = await fetch(`${API_BASE_URL}/trades/${id}/story?${params.toString()}`);
  if (!res.ok) return null;
  return res.json();
}

export async function fetchProviders(
  district?: string,
  state?: string
) {
  if (supabase) {
    try {
      let query = supabase
        .from('providers')
        .select('*')
        .eq('state', state || 'Telangana')
        .in('is_synthetic', isDemoMode() ? [true, false] : [false]);
      // Real providers must be verified; dummy providers (demo mode only) are labelled synthetic instead.
      if (!isDemoMode()) query = query.eq('verified', true);
      if (district) query = query.eq('district', district);
      const { data, error } = await query.order('name').limit(20);
      if (!error && data) return data;
    } catch (error) {
      console.error('Supabase provider query failed', error);
    }
  }

  if (!supabase && API_BASE_URL) {
    try {
      const params = new URLSearchParams();
      if (district) params.append('district', district);
      if (state) params.append('state', state);
      const res = await fetch(`${API_BASE_URL}/providers?${params.toString()}`);
      if (res.ok) return (await res.json()).filter((p: any) => isDemoMode() || (p.verified !== false && !p.is_synthetic));
    } catch (error) {
      console.error('Backend provider query failed', error);
    }
  }

  return [];
}

// Adds each provider's own outcomes for the chosen trade (placement, starting earnings). Never invents values.
export async function attachProviderOutcomes(providers: any[], tradeId?: number) {
  if (!supabase || !tradeId || providers.length === 0) return providers;
  try {
    const demo = isDemoMode();
    const { data, error } = await supabase
      .from('outcome_metrics')
      .select('provider_id, metric_key, metric_value, sample_size, year, is_synthetic')
      .eq('trade_id', tradeId)
      .in('provider_id', providers.map((p) => p.id))
      .in('metric_key', ['placement_rate', 'starting_earnings'])
      .in('verification_status', demo ? ['verified', 'pending'] : ['verified'])
      .in('is_synthetic', demo ? [true, false] : [false]);
    if (error || !data) return providers;
    return providers.map((p) => {
      const rows = data.filter((r: any) => r.provider_id === p.id);
      const latest = (key: string) => rows.filter((r: any) => r.metric_key === key).sort((a: any, b: any) => (b.year ?? 0) - (a.year ?? 0))[0];
      const placement = latest('placement_rate');
      const earnings = latest('starting_earnings');
      const any = placement || earnings;
      return {
        ...p,
        outcomes: any
          ? {
              placement_rate: placement ? Number(placement.metric_value) : null,
              starting_earnings: earnings ? Number(earnings.metric_value) : null,
              sample_size: any.sample_size ?? null,
              year: any.year ?? null,
              is_synthetic: !!any.is_synthetic,
            }
          : null,
      };
    });
  } catch {
    return providers;
  }
}

export async function fetchSchemes(
  state?: string,
  income_bracket?: string
) {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('schemes')
        .select('*')
        .eq('verified', true)
        .eq('is_synthetic', false)
        .or(`state.eq.${state || 'Telangana'},state.is.null`);
      if (!error && data) return data;
    } catch (error) {
      console.error('Supabase scheme query failed', error);
    }
  }

  if (!supabase && API_BASE_URL) {
    try {
      const params = new URLSearchParams();
      if (state) params.append('state', state);
      if (income_bracket) params.append('income_bracket', income_bracket);
      const res = await fetch(`${API_BASE_URL}/schemes?${params.toString()}`);
      if (res.ok) return (await res.json()).filter((s: any) => s.verified === true && s.is_synthetic === false);
    } catch (error) {
      console.error('Backend scheme query failed', error);
    }
  }

  return [];
}

export async function fetchAdminMetrics(filters?: {
  state?: string;
  district?: string;
  language?: string;
  trade_id?: number;
  provider_id?: number;
  concern?: string;
  start_date?: string;
  end_date?: string;
}) {
  const params = new URLSearchParams();

  if (filters?.state) {
    params.append('state', filters.state);
  }

  if (filters?.district) {
    params.append('district', filters.district);
  }

  if (filters?.trade_id) {
    params.append('trade_id', filters.trade_id.toString());
  }

  if (filters?.language) {
    params.append('language', filters.language);
  }

  if (filters?.provider_id) {
    params.append('provider_id', filters.provider_id.toString());
  }

  if (filters?.concern) {
    params.append('concern', filters.concern);
  }

  if (filters?.start_date) {
    params.append('start_date', filters.start_date);
  }

  if (filters?.end_date) {
    params.append('end_date', filters.end_date);
  }

  const res = await fetch(
    `/api/admin/metrics?${params.toString()}`,
    {
      headers: await getSupabaseAuthHeaders(),
    }
  );

  if (!res.ok) {
    throw new Error('Failed to fetch metrics');
  }

  return res.json();
}

export async function fetchAdminInsights(
  state?: string,
  district?: string
) {
  const params = new URLSearchParams();

  if (state) {
    params.append('state', state);
  }

  if (district) {
    params.append('district', district);
  }

  const res = await fetch(
    `/api/admin/insights?${params.toString()}`,
    {
      headers: await getSupabaseAuthHeaders(),
    }
  );

  if (!res.ok) {
    throw new Error('Failed to fetch insights');
  }

  return res.json();
}

/** The family's callback number, revealed by the database only to the counsellor who accepted the ticket. */
export async function fetchTicketContact(ticketId: number | string): Promise<{ callback_phone: string | null; callback_slot: string | null }> {
  const res = await fetch(`/api/counsellor/${ticketId}/contact`, { headers: await getSupabaseAuthHeaders() });
  if (!res.ok) throw new Error('Failed to fetch callback details');
  return res.json();
}

export async function fetchCounsellorQueue() {
  const res = await fetch('/api/counsellor/queue', {
    headers: await getSupabaseAuthHeaders(),
  });

  if (!res.ok) {
    throw new Error('Failed to fetch counsellor queue');
  }

  return res.json();
}

export async function acceptTicket(ticketId: number | string) {
  const res = await fetch(
    `/api/counsellor/${ticketId}/accept`,
    {
      method: 'POST',
      headers: await getSupabaseAuthHeaders(),
    }
  );

  if (!res.ok) {
    throw new Error('Failed to accept ticket');
  }

  return res.json();
}

export async function resolveTicket(
  ticketId: number | string,
  resolutionNote: string
) {
  const res = await fetch(
    `/api/counsellor/${ticketId}/resolve`,
    {
      method: 'POST',
      headers: await getSupabaseAuthHeaders(),
      body: JSON.stringify({
        resolution_note: resolutionNote,
      }),
    }
  );

  if (!res.ok) {
    throw new Error('Failed to resolve ticket');
  }

  return res.json();
}

export async function sendCounsellorMessage(
  sessionId: string,
  text: string,
  lang: string = 'en'
) {
  const res = await fetch(
    '/api/counsellor/messages',
    {
      method: 'POST',
      headers: await getSupabaseAuthHeaders(),
      body: JSON.stringify({
        session_id: sessionId,
        text,
        lang,
      }),
    }
  );

  if (!res.ok) {
    throw new Error('Failed to send counsellor message');
  }

  return res.json();
}

export async function fetchSessionMessages(
  sessionId: string
) {
  const res = await fetch(
    `/api/counsellor/messages?session_id=${sessionId}`,
    {
      headers: await getSupabaseAuthHeaders(),
    }
  );

  if (!res.ok) {
    throw new Error('Failed to fetch messages');
  }

  return res.json();
}

export async function createManualEscalation(data: {
  session_id: string;
  reason: string;
  callback_phone?: string;
  callback_phone_consent?: boolean;
  callback_slot?: string;
}) {
  const headers = await getSupabaseAuthHeaders();

  const res = await fetch('/api/escalations', {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    throw new Error('Failed to create escalation');
  }

  return res.json();
}

export async function getSummaryCardHtml(
  sessionId: string
) {
  if (!API_BASE_URL) throw new Error('Summary service is not configured');
  const headers = await getSupabaseAuthHeaders();

  const res = await fetch(
    `${API_BASE_URL}/summary-card`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        session_id: sessionId,
      }),
    }
  );

  if (!res.ok) {
    throw new Error('Failed to generate summary card');
  }

  return res.text();
}

export async function login(
  role: string,
  phone: string,
  pin: string
) {
  if (!API_BASE_URL) throw new Error('Backend auth service is not configured');
  const res = await fetch(
    `${API_BASE_URL}/auth/login`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        role,
        phone,
        pin,
      }),
    }
  );

  if (!res.ok) {
    throw new Error('Login failed');
  }

  return res.json();
}

export async function patchSession(
  id: string,
  data: any
) {
  const res = await fetch(
    `/api/sessions/${id}`,
    {
      method: 'PATCH',
      headers: await getSupabaseAuthHeaders(),
      body: JSON.stringify(data),
    }
  );

  if (!res.ok) {
    throw new Error('Failed to update session');
  }

  return res.json();
}

export function getAuthHeaders() {
  return {
    'Content-Type': 'application/json',
  };
}

export async function getSupabaseAuthHeaders() {
  const { data } =
    (await supabase?.auth.getSession()) ?? {
      data: { session: null },
    };

  return {
    'Content-Type': 'application/json',
    ...(data.session?.access_token
      ? {
          Authorization: `Bearer ${data.session.access_token}`,
        }
      : {}),
  };
}
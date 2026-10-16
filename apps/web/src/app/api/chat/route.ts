import { NextResponse } from 'next/server';

import { createSupabaseServerClient } from '../../../lib/supabase-server';
import { GeminiProvider, type VerifiedOutcome } from '../../../lib/ai/provider';
import { enforceRateLimit } from '../../../lib/rate-limit';
import {
  assessEvidence,
  validateGeneratedNumbers,
  requiresQuantitativeEvidence,
  type EvidenceMetric,
} from '../../../lib/ai/grounding';
import {
  classifyConcerns,
  updateConcernState,
  type ConcernState,
} from '../../../lib/concern-state';
import { analyseMessage } from '../../../lib/analysis';
import { createSupabaseAdminClient } from '../../../lib/supabase-admin';
import {
  crisisReply,
  hasDistressSignal as detectsDistress,
  type Lang,
} from '../../../lib/safety';
import { hasSupabaseConfig, isDemoMode } from '../../../lib/demo-mode';
import { evidenceReply } from '../../../lib/demo-answers';
import { fail, isUuid } from '../../../lib/guard';
import { isLang, isQuotaError, readJson, str } from '../../../lib/http';
import { redactPersonalData } from '../../../lib/redact';
import { ensureTicket } from '../../../lib/escalation';
import { writeSessionState } from '../../../lib/session-state';

const MAX_MESSAGES_PER_SESSION = 30;
const MAX_TEXT = 1000; // matches the messages.text CHECK constraint
// A long, desperate message must still reach the crisis check even though it is too long to store.
const CRISIS_SCAN_CHARS = 5000;

/**
 * Distress path. It runs BEFORE rate limits, length limits, the trade requirement, the per-session
 * cap and the daily quota, because none of those may ever stand between a person in distress and the
 * helpline number. It makes no LLM call. Database work is best effort, and the reply only claims a
 * counsellor was notified if the urgent ticket really was created.
 */
async function handleDistress(
  supabase: any,
  userId: string,
  sessionId: string | null,
  text: string,
  lang: Lang,
  speaker: 'learner' | 'parent',
) {
  let notified = false;
  if (sessionId && enforceRateLimit(`crisis:${userId}`, 20)) {
    try {
      // Keep the message so the counsellor sees what was said (redacted; the callback number has its own consent flow).
      const { data: saved } = await supabase
        .from('messages')
        .insert({ session_id: sessionId, speaker, text: redactPersonalData(text).slice(0, MAX_TEXT), lang })
        .select('id')
        .single();
      if (saved) {
        const analysis = analyseMessage(text);
        await createSupabaseAdminClient().from('message_analysis').insert({
          message_id: saved.id,
          objection_category: analysis.objection,
          sentiment: analysis.sentiment,
          intent: analysis.intent,
        });
      }
    } catch (error) {
      console.error('[chat] could not store distress message', error);
    }

    try {
      const { error } = await supabase.rpc('raise_distress', { p_session: sessionId });
      notified = !error;
      if (error) console.error('[chat] distress escalation failed', error);
    } catch (error) {
      console.error('[chat] distress escalation threw', error);
    }

    if (notified) {
      try {
        const { data: row } = await supabase.from('sessions').select('concern_state').eq('id', sessionId).eq('owner_id', userId).single();
        await writeSessionState(sessionId, userId, {
          concern_state: updateConcernState(row?.concern_state as Partial<ConcernState> | null, classifyConcerns(text), [], 'escalated'),
        });
      } catch (error) {
        console.error('[chat] could not update concern state', error);
      }
    }
  }

  return NextResponse.json({
    reply: crisisReply(lang, notified),
    citations: [],
    suggested_chips: [],
    escalate: notified,
    escalate_reason: 'distress_signal',
    priority: 'urgent',
  });
}

export async function POST(request: Request) {
  const body = await readJson(request);
  if (!body) return fail(400, 'invalid_json');

  const text = typeof body.text === 'string' ? body.text : null;
  const lang: Lang = isLang(body.lang) ? body.lang : 'en';
  const speaker = body.speaker === 'learner' || body.speaker === 'parent' ? body.speaker : null;
  const sessionId = isUuid(body.session_id) ? body.session_id : null;

  if (isDemoMode()) {
    if (text === null) return fail(400, 'invalid_message');
    // Safety first: crisis messages must never reach the canned evidence answers.
    if (detectsDistress(text.slice(0, CRISIS_SCAN_CHARS))) {
      return NextResponse.json({
        reply: crisisReply(lang),
        citations: [],
        suggested_chips: [],
        escalate: true,
        escalate_reason: 'distress_signal',
      });
    }
    return NextResponse.json(evidenceReply(text, lang, Number(body.trade_id) || undefined));
  }

  if (!hasSupabaseConfig()) {
    return NextResponse.json({ error: 'Supabase is not configured' }, { status: 503 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  // Crisis first, before any limit or validation that could reject the request.
  if (text !== null && detectsDistress(text.slice(0, CRISIS_SCAN_CHARS))) {
    return handleDistress(supabase, user.id, sessionId, text, lang, speaker ?? 'parent');
  }

  if (!enforceRateLimit(`chat:${user.id}`, 30)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': '60' } });
  }

  const messageText = str(text, MAX_TEXT);
  if (!sessionId || !messageText || !messageText.trim() || !speaker || !isLang(body.lang)) {
    return NextResponse.json({ error: 'Invalid message' }, { status: 400 });
  }

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select(
      'id, owner_id, state, district, lang, selected_trade_id, concern_state, learner_class, income_bracket, trades(name_en)',
    )
    .eq('id', sessionId)
    .eq('owner_id', user.id)
    .single();

  if (sessionError || !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  if (!session.selected_trade_id) {
    return NextResponse.json({ error: 'Selected trade is required' }, { status: 409 });
  }

  const { count } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId);

  if ((count || 0) >= MAX_MESSAGES_PER_SESSION) {
    return NextResponse.json({ error: 'Session message limit reached', code: 'SESSION_CAP' }, { status: 429 });
  }

  // Phone numbers and emails typed into chat are redacted before storage as well as before the LLM:
  // a callback number belongs in the explicit-consent escalation flow, not in the transcript.
  const safeText = redactPersonalData(messageText).slice(0, MAX_TEXT);

  const { data: familyMessage, error: insertError } = await supabase
    .from('messages')
    .insert({ session_id: sessionId, speaker, text: safeText, lang: body.lang })
    .select('id')
    .single();

  if (insertError) {
    if (isQuotaError(insertError)) {
      return NextResponse.json({ error: 'Daily message limit reached', code: 'DAILY_QUOTA' }, { status: 429, headers: { 'Retry-After': '3600' } });
    }
    return fail(500, 'message_not_saved', insertError);
  }

  if (familyMessage) {
    try {
      const analysis = analyseMessage(messageText);
      await createSupabaseAdminClient().from('message_analysis').insert({
        message_id: familyMessage.id,
        objection_category: analysis.objection,
        sentiment: analysis.sentiment,
        intent: analysis.intent,
      });
    } catch (error) {
      console.error('message analysis write failed', error);
    }
  }

  const classification = classifyConcerns(messageText);
  const concernState = updateConcernState(session.concern_state as Partial<ConcernState> | null, classification);

  await writeSessionState(session.id, user.id, { concern_state: concernState });

  let outcomes: VerifiedOutcome | null = null;
  let evidenceMetrics: EvidenceMetric[] = [];
  let evidence = assessEvidence(evidenceMetrics);

  {
    const { data: metricRows } = await supabase
      .from('outcome_metrics')
      .select(
        'district, state, metric_key, metric_value, metric_text, unit, sample_size, year, verification_date, verification_status, is_synthetic, data_sources(publisher, title, source_url, document_reference)',
      )
      .eq('trade_id', session.selected_trade_id)
      .eq('state', session.state)
      .eq('district', session.district)
      .eq('verification_status', 'verified')
      .eq('is_synthetic', false)
      .order('year', { ascending: false });

    if (metricRows?.length) {
      const values = Object.fromEntries(
        metricRows.map((row: any) => [row.metric_key, row.metric_value ?? row.metric_text]),
      );

      const latest = metricRows[0] as any;
      const source = latest.data_sources;

      evidenceMetrics = metricRows as EvidenceMetric[];

      outcomes = {
        district: latest.district,
        state: latest.state,
        placement_rate: values.placement_rate ?? null,
        avg_start_salary_inr: values.starting_earnings ?? null,
        salary_3yr_min: null,
        salary_3yr_max: null,
        sample_size: latest.sample_size ?? 0,
        cohort_year: latest.year,
        source: source?.publisher ? `${source.publisher}: ${source.title}` : 'Source reference unavailable',
        verified_on: latest.verification_date,
        verified: true,
        is_synthetic: false,
        evidence_url: source?.source_url ?? null,
        scope: 'district',
      };
    }
  }

  evidence = assessEvidence(evidenceMetrics);

  await writeSessionState(session.id, user.id, {
    concern_state: updateConcernState(concernState, classification, evidence.citations),
  });

  // Persist an AI-side message. A failure to save must never discard a good answer or change what
  // the family sees, so this only logs.
  const saveAiMessage = async (reply: string) => {
    const { error } = await createSupabaseAdminClient()
      .from('messages')
      .insert({ session_id: sessionId, speaker: 'ai', text: reply, lang: body.lang });
    if (error) console.error('[chat] could not save AI message', error);
  };

  if (requiresQuantitativeEvidence(messageText) && !evidence.usable) {
    const reason = evidence.reason;
    const reply =
      reason === 'conflicting_verified_data'
        ? 'Verified sources give conflicting figures for this question. I will not choose one number without a counsellor reviewing the sources.'
        : 'Verified information is unavailable for this question. I can connect you with a human counsellor.';

    // The flag tells the UI to show "counsellor alerted", so it must reflect a ticket that exists.
    const escalated = await ensureTicket(supabase, session.id, reason);
    if (escalated) {
      await writeSessionState(session.id, user.id, {
        concern_state: updateConcernState(concernState, classification, evidence.citations, 'escalated'),
      });
    }

    return NextResponse.json({
      reply,
      citations: evidence.citations,
      suggested_chips: ['Talk to a counsellor'],
      escalate: escalated,
      escalate_reason: reason,
    });
  }

  try {
    const provider = new GeminiProvider();

    const result = await provider.generate({
      language: body.lang,
      speaker,
      userMessage: safeText,
      location: { state: session.state, district: session.district },
      household: { incomeBracket: session.income_bracket, learnerClass: session.learner_class },
      tradeName: (session.trades as { name_en?: string } | null)?.name_en,
      verifiedOutcomes: outcomes,
      verifiedEvidence: evidence.metrics,
    });

    // Validate BEFORE anything is stored, so an unsupported statistic never enters the transcript.
    const unsupported = validateGeneratedNumbers(result.text, evidence);

    if (unsupported.length) {
      const escalated = await ensureTicket(supabase, session.id, 'unsupported_numeric_claim');
      const reply = escalated
        ? 'I could not verify every number in that response. I will connect you with a counsellor rather than provide an unsupported statistic.'
        : 'I could not verify every number in that response, so I will not share an unsupported statistic. Please ask a human counsellor for these figures.';
      await saveAiMessage(reply);
      return NextResponse.json({
        reply,
        citations: evidence.citations,
        suggested_chips: ['Talk to a counsellor'],
        escalate: escalated,
        escalate_reason: 'unsupported_numeric_claim',
      });
    }

    await saveAiMessage(result.text);
    return NextResponse.json({
      reply: result.text,
      citations: evidence.citations,
      suggested_chips: [],
      escalate: false,
    });
  } catch (error) {
    const rateLimited = error instanceof Error && error.message === 'AI_RATE_LIMITED';

    console.error('Gemini/provider error:', error);

    return NextResponse.json({
      reply: rateLimited
        ? 'The counselling assistant is busy right now. Your verified data is safe; please try again shortly or request a human counsellor.'
        : 'I cannot reach the counselling assistant right now. Verified data is unavailable; please try again or request a human counsellor.',
      citations: [],
      suggested_chips: [],
      escalate: false,
      degraded: true,
    });
  }
}

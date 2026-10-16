import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../../../lib/supabase-server';
import { enforceRateLimit } from '../../../../lib/rate-limit';
import { fail, isUuid } from '../../../../lib/guard';
import { readJson } from '../../../../lib/http';
import { ensureTicket } from '../../../../lib/escalation';
import { writeSessionState } from '../../../../lib/session-state';

const QUESTIONS = ['preferred_trade', 'top_priority', 'preferred_location'] as const;
type Participant = 'learner' | 'parent';
const MAX_ANSWER = 100; // free-text answers are short; unbounded input was being stored as-is

function compare(learner: Record<string, string>, parent: Record<string, string>) {
  const agreements = QUESTIONS.filter(question =>
    learner[question]?.trim().toLocaleLowerCase() === parent[question]?.trim().toLocaleLowerCase(),
  );
  const disagreements = QUESTIONS.filter(question => !agreements.includes(question));
  return {
    agreements,
    disagreements,
    has_disagreement: disagreements.length > 0,
    neutral_language: true,
  };
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  if (!enforceRateLimit(`joint:${user.id}`, 20)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': '60' } });
  }

  const body = await readJson(request);
  if (!body) return fail(400, 'invalid_json');
  const participant: Participant | null = body.participant === 'learner' || body.participant === 'parent' ? body.participant : null;
  const rawAnswers = body.answers !== null && typeof body.answers === 'object' && !Array.isArray(body.answers)
    ? (body.answers as Record<string, unknown>) : null;
  if (!isUuid(body.session_id) || !participant || !rawAnswers ||
      Object.keys(rawAnswers).some(key => !QUESTIONS.includes(key as typeof QUESTIONS[number])) ||
      Object.values(rawAnswers).some(value => typeof value !== 'string' || value.length > MAX_ANSWER)) {
    return NextResponse.json({ error: 'Invalid joint counselling answer' }, { status: 400 });
  }

  const { data: session, error } = await supabase
    .from('sessions')
    .select('id, owner_id, state, joint_counselling_state')
    .eq('id', body.session_id)
    .eq('owner_id', user.id)
    .single();
  if (error || !session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  const current = session.joint_counselling_state || { mode: 'joint', answers: {}, evidence_discussed: [] };
  const answers = Object.fromEntries(
    Object.entries(rawAnswers).filter(([, value]) => typeof value === 'string' && value.trim()),
  ) as Record<string, string>;

  // A failed write used to be ignored, so a family could be told their answers were saved when they were not.
  // joint_counselling_state is not a family-writable column, so it is written server-side (see lib/session-state.ts).
  const save = (state: unknown) => writeSessionState(session.id, user.id, { joint_counselling_state: state });
  const missing = QUESTIONS.filter(question => !answers[question]);
  const nextAnswers = { ...(current.answers || {}), [participant]: { ...(current.answers?.[participant] || {}), ...answers } };

  if (missing.length) {
    if (!(await save({ ...current, mode: 'joint', status: 'incomplete', answers: nextAnswers }))) return fail(500, 'answers_not_saved');
    return NextResponse.json({ status: 'incomplete', missing, revealed: false });
  }
  if (participant === 'learner' || !nextAnswers.learner) {
    const nextState = { ...current, mode: 'joint', status: 'awaiting_parent', answers: nextAnswers };
    if (!(await save(nextState))) return fail(500, 'answers_not_saved');
    return NextResponse.json({ status: 'awaiting_parent', missing: [], revealed: false });
  }

  const comparison = compare(nextAnswers.learner, nextAnswers.parent);
  const tradeNames = [nextAnswers.learner.preferred_trade, nextAnswers.parent.preferred_trade];
  const { data: trades } = await supabase
    .from('trades')
    .select('id, name_en')
    .in('name_en', tradeNames);
  const tradeIds = (trades || []).map((trade: any) => trade.id);
  const { data: evidenceRows } = tradeIds.length
    ? await supabase
      .from('outcome_metrics')
      .select('trade_id, metric_key, metric_value, metric_text, unit, year, verification_date, data_sources(publisher, title, source_url, document_reference)')
      .in('trade_id', tradeIds)
      .eq('state', session.state || '')
      .eq('verification_status', 'verified')
      .eq('is_synthetic', false)
    : { data: [] };
  const evidence = evidenceRows || [];
  const citations = evidence.map((row: any) => row.data_sources).filter(Boolean);
  // Create the ticket first so the saved state and the response describe what really happened.
  const escalated = body.request_escalation === true ? await ensureTicket(supabase, session.id, 'joint_counselling_requested') : false;
  const nextState = {
    ...current,
    mode: 'joint',
    status: 'compared',
    answers: nextAnswers,
    comparison,
    counselling_plan: {
      goal: 'Support an informed family discussion; the system does not decide for the family.',
      steps: comparison.disagreements.map(area => `Discuss the evidence for ${area.replaceAll('_', ' ')} together.`),
      decision_owner: 'family',
      avoid_blame: true,
    },
    unresolved: true,
    escalation_status: escalated ? 'pending' : (current.escalation_status || 'not_escalated'),
    evidence_discussed: citations,
  };
  if (!(await save(nextState))) return fail(500, 'answers_not_saved');
  return NextResponse.json({
    status: 'compared',
    missing: [],
    revealed: true,
    comparison,
    counselling_plan: nextState.counselling_plan,
    escalate: escalated,
    escalation_failed: body.request_escalation === true && !escalated,
    evidence,
    citations,
  });
}

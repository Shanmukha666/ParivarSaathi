import { describe, expect, it } from 'vitest';
import { crisisReply, hasDistressSignal } from '../safety';
import { evidenceReply } from '../demo-answers';
import { TELANGANA_DISTRICTS, demoAdminMetrics, demoCounsellorQueue } from '../demo-dashboard';

const distress: Array<[string, string]> = [
  ['en', 'I want to die'], ['en', 'I feel like ending my life'], ['en', 'I want to end it all'], ['en', 'I am going to kill myself'],
  ['te', 'నేను చచ్చిపోవాలనుకుంటున్నాను'], ['te', 'నా ప్రాణం తీసుకోవాలని ఉంది'], ['te', 'నేను చనిపోతాను అనిపిస్తోంది'],
  ['hi', 'मैं मरना चाहता हूँ'], ['hi', 'मुझे आत्महत्या का मन है'],
  ['ta', 'நான் சாக வேண்டும்'], ['ta', 'வாழ பிடிக்கவில்லை'], ['ta', 'thatkolai pannikalam'],
];
const harmless: Array<[string, string]> = [
  ['en', 'What is the salary?'], ['en', 'This job will kill me with stress'], ['en', 'I am dying to start this course'],
  ['te', 'మా తాత చనిపోయారు'], ['te', 'జీతం ఎంత?'], ['hi', 'वेतन कितना है'], ['ta', 'சம்பளம் எவ்வளவு'],
];

describe('distress detection', () => {
  it.each(distress)('catches (%s) %s', (_l, text) => expect(hasDistressSignal(text)).toBeTruthy());
  it.each(harmless)('does not fire on (%s) %s', (_l, text) => expect(hasDistressSignal(text)).toBeFalsy());
  it.each(['en', 'te', 'hi', 'ta'] as const)('crisis reply in %s is non-empty and gives the helpline', (lang) => {
    const reply = crisisReply(lang);
    expect(reply.length).toBeGreaterThan(40);
    expect(reply).toMatch(/14416/);
  });
});

describe('evidence answers never borrow another trade\'s numbers', () => {
  it('quotes Electrician figures only for trade 1, with a dummy-data citation', () => {
    const r = evidenceReply('How much will they earn?', 'en', 1);
    expect(r.reply).toMatch(/78\.4%/);
    expect(r.citations[0]).toMatch(/dummy/i);
  });
  it.each([undefined, 0, 6, 13, 999])('says no data for earnings/safety/degree when trade is %s', (trade) => {
    for (const q of ['How much will they earn?', 'Is it safe?', "Isn't a degree better?"]) {
      const r = evidenceReply(q, 'en', trade as number | undefined);
      expect(r.reply).not.toMatch(/78\.4|16,500|Electrical work/);
      expect(r.citations).toHaveLength(0);
    }
  });
  it('answers in each language', () => {
    for (const lang of ['te', 'hi', 'ta']) {
      expect(evidenceReply('salary', lang, 1).reply).not.toMatch(/^For Electrician in Warangal/);
    }
  });
});

describe('demo dashboard fixtures', () => {
  it('covers all 33 distinct Telangana districts, flagged as demo', () => {
    const m = demoAdminMetrics();
    expect(TELANGANA_DISTRICTS).toHaveLength(33);
    expect(new Set(m.heatmap.map((d) => d.district)).size).toBe(33);
    expect(m.is_demo).toBe(true);
  });
  it('marks every sample escalation as DEMO', () => {
    for (const t of demoCounsellorQueue()) expect(t.summary).toMatch(/^\[DEMO\]/);
  });
});

describe('engagement funnel fixture', () => {
  it('is present, demo-flagged, and mirrors the stages the real function returns', () => {
    const m = demoAdminMetrics();
    expect(m.is_demo).toBe(true);
    expect(m.engagement_funnel.map((s) => s.stage).sort()).toEqual(['escalated', 'sessions', 'summary_shared', 'trades_viewed']);
  });
});

import { describe, expect, it } from 'vitest';
import { Observation, summarize, toCsv } from '../research';

const ob = (id: string, r: 'unaided' | 'with_help' | 'failed', extra: Partial<Observation> = {}): Observation => ({
  id, role: 'parent', language: 'te', literacy: 'low', seconds: 120, quote: '',
  tasks: { choose_trade: r, find_salary: r, find_human_help: r, explain_nsqf: r }, ...extra,
});

describe('usability summary', () => {
  it('computes task success and averages from real observations only', () => {
    const s = summarize([ob('P01', 'unaided'), ob('P02', 'with_help', { seconds: 240 }), ob('P03', 'failed', { seconds: null }), ob('P04', 'unaided', { literacy: 'high' })]);
    expect(s.participants).toBe(4);
    expect(s.low_literacy).toBe(3);
    expect(s.per_task.choose_trade).toEqual({ unaided_pct: 50, with_help_pct: 25, failed_pct: 25 });
    expect(s.avg_seconds).toBe(160);
  });
  it('reports nothing (null) when there are no sessions, never a made-up figure', () => {
    const s = summarize([]);
    expect(s.avg_seconds).toBeNull();
    expect(s.per_task.choose_trade.unaided_pct).toBeNull();
  });
  it('neutralises spreadsheet formulas and escapes quotes in the CSV', () => {
    const csv = toCsv([ob('P01', 'unaided', { quote: '=HYPERLINK("x")' }), ob('P02', 'unaided', { quote: 'said "yes"' })]);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain('"said ""yes"""');
  });
});

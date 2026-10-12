import { describe, expect, it } from 'vitest';
import { compareAnswers, isComplete } from '../joint';

describe('joint comparison', () => {
  it('finds agreements and differences per question', () => {
    const r = compareAnswers({ preferred_trade: 0, top_priority: 1, preferred_location: 2 }, { preferred_trade: 0, top_priority: 3, preferred_location: 2 });
    expect(r.agreements).toEqual(['preferred_trade', 'preferred_location']);
    expect(r.disagreements).toEqual(['top_priority']);
    expect(r.has_disagreement).toBe(true);
  });
  it('treats missing answers as not agreed, even when both are missing', () => {
    expect(compareAnswers({}, {}).agreements).toEqual([]);
  });
  it('knows when a participant has answered everything', () => {
    expect(isComplete({ preferred_trade: 0, top_priority: 0 })).toBe(false);
    expect(isComplete({ preferred_trade: 0, top_priority: 0, preferred_location: 0 })).toBe(true);
  });
});

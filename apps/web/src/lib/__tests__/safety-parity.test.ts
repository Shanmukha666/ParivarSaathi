import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DISTRESS_PHRASES, TELE_MANAS, crisisReply } from '../safety';

// The FastAPI service loads its phrases and crisis text from safety_data.json, which is GENERATED from
// safety.ts. If this fails, run `npm run sync:safety` and commit the result.
const data = JSON.parse(readFileSync(join(process.cwd(), '../../services/api/app/core/safety_data.json'), 'utf8'));

describe('services/api/app/core/safety_data.json matches safety.ts', () => {
  it('has identical distress phrases', () => expect(data.phrases).toEqual(DISTRESS_PHRASES));
  it('has identical helpline numbers', () => expect(data.helplines).toEqual(TELE_MANAS));
  for (const lang of ['en', 'te', 'hi', 'ta'] as const) {
    it(`has identical ${lang} crisis replies (with and without the counsellor promise)`, () => {
      expect(data.replies[lang].full).toBe(crisisReply(lang));
      expect(data.replies[lang].without_counsellor_claim).toBe(crisisReply(lang, false));
    });
  }
});

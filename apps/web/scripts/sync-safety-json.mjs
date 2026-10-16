// Generates services/api/app/core/safety_data.json from src/lib/safety.ts, so the FastAPI service
// detects distress and answers with exactly the same phrases and crisis text as the Next.js app.
//   npm run sync:safety          write the file
//   npm run sync:safety -- --check   exit 1 if the committed file is out of date (used by CI via vitest)
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '../../../services/api/app/core/safety_data.json');
const bundled = buildSync({ entryPoints: [join(here, '../src/lib/safety.ts')], bundle: true, format: 'cjs', platform: 'node', write: false });
const mod = { exports: {} };
new Function('module', 'exports', 'require', bundled.outputFiles[0].text)(mod, mod.exports, createRequire(import.meta.url));
const s = mod.exports;

const langs = ['en', 'te', 'hi', 'ta'];
const data = {
  _comment: 'GENERATED from apps/web/src/lib/safety.ts by `npm run sync:safety`. Do not edit by hand.',
  helplines: s.TELE_MANAS,
  phrases: s.DISTRESS_PHRASES,
  replies: Object.fromEntries(langs.map((l) => [l, { full: s.crisisReply(l), without_counsellor_claim: s.crisisReply(l, false) }])),
};
const text = JSON.stringify(data, null, 2) + '\n';
if (process.argv.includes('--check')) {
  const current = (() => { try { return readFileSync(out, 'utf8'); } catch { return ''; } })();
  if (current !== text) { console.error('safety_data.json is out of date: run `npm run sync:safety`'); process.exit(1); }
  console.log('safety_data.json is up to date');
} else {
  writeFileSync(out, text);
  console.log('wrote', out);
}

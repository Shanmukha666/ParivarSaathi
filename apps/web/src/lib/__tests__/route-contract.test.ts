import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Contract: every column an API route updates through the signed-in user's client must be granted to
// the `authenticated` role in the SQL migrations. Two real bugs shipped because nothing checked this:
//  - counsellor routes sent resolved_at / contacted_at / closed_at (denied: "permission denied")
//  - the chat and joint-counselling routes wrote concern_state / joint_counselling_state as the family
//    (denied), with errors ignored, so those features silently did nothing in live mode.
// Server-computed columns must go through the service-role client (lib/session-state.ts).

const API = join(process.cwd(), 'src/app/api');
const MIGRATIONS = join(process.cwd(), '../../supabase/migrations');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : full.endsWith('route.ts') ? [full] : [];
  });
}

/** table -> columns granted for UPDATE to `authenticated` (last grant statement wins). */
function grantedUpdateColumns(): Record<string, Set<string>> {
  const sql = readdirSync(MIGRATIONS).sort().map((f) => readFileSync(join(MIGRATIONS, f), 'utf8')).join('\n');
  const grants: Record<string, Set<string>> = {};
  const re = /grant\s+update\s*\(([^)]*)\)\s*on\s+public\.(\w+)\s+to\s+authenticated/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    grants[m[2]] = new Set(m[1].split(',').map((c: string) => c.trim()));
  }
  return grants;
}

describe('API routes only update columns the database grants', () => {
  const grants = grantedUpdateColumns();

  it('finds the grants it is supposed to enforce', () => {
    expect(Array.from(grants.escalations ?? []).sort()).toEqual(['counsellor_id', 'family_changed_mind', 'resolution_note', 'status']);
    expect(Array.from(grants.sessions ?? []).sort()).toEqual(['lang', 'selected_trade_id']);
  });

  for (const file of walk(API)) {
    const source = readFileSync(file, 'utf8');
    // Calls made through the user's own client: `supabase.from('t').update({...})` (also g.supabase).
    const callRe = /\bsupabase\s*\.from\('(\w+)'\)\s*\.update\(\{([\s\S]*?)\}\)/g;
    const calls: Array<[string, string]> = [];
    let call: RegExpExecArray | null;
    while ((call = callRe.exec(source)) !== null) calls.push([call[1], call[2]]);
    for (const [table, payload] of calls) {
      it(`${file.split('src/app/api/')[1]}: update on ${table} uses only granted columns`, () => {
        const keyRe = /(?:^|[,{\s])([a-z_]+)\s*:/g;
        const keys: string[] = [];
        let k: RegExpExecArray | null;
        while ((k = keyRe.exec(payload)) !== null) keys.push(k[1]);
        const allowed = grants[table] ?? new Set<string>();
        const denied = keys.filter((key) => !allowed.has(key));
        expect(denied, `${table}: not granted to authenticated: ${denied.join(', ')}`).toEqual([]);
      });
    }
  }
});

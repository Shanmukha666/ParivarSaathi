import { beforeEach, describe, expect, it, vi } from 'vitest';

// Fake database + fake Gemini. Every write is recorded in `h.log` so tests can assert on what was stored.
const h = vi.hoisted(() => ({
  cfg: {} as any,
  log: [] as any[],
  generate: vi.fn(),
}));

function makeClient() {
  const cfg = h.cfg;
  const from = (table: string) => {
    let op = 'select';
    let payload: any;
    const result = () => {
      if (op === 'insert') {
        h.log.push({ table, op, payload });
        if (table === 'messages' && payload.speaker !== 'ai' && cfg.messageInsertError) return { data: null, error: cfg.messageInsertError };
        return { data: { id: 99 }, error: null };
      }
      if (op === 'update') {
        h.log.push({ table, op, payload });
        return { data: { id: 'x' }, error: null };
      }
      if (table === 'sessions') return cfg.session ? { data: cfg.session, error: null } : { data: null, error: { message: 'none' } };
      if (table === 'messages') return { count: cfg.count ?? 0, data: null, error: null };
      if (table === 'outcome_metrics') return { data: cfg.metrics ?? [], error: null };
      return { data: null, error: null };
    };
    const b: any = {};
    for (const m of ['select', 'eq', 'in', 'order', 'limit']) b[m] = () => b;
    b.insert = (p: any) => { op = 'insert'; payload = p; return b; };
    b.update = (p: any) => { op = 'update'; payload = p; return b; };
    b.single = async () => result();
    b.maybeSingle = b.single;
    b.then = (res: any, rej: any) => Promise.resolve(result()).then(res, rej);
    return b;
  };
  return {
    from,
    rpc: async (name: string, args: any) => {
      h.log.push({ rpc: name, args });
      return { data: 1, error: cfg.rpcError?.[name] ?? null };
    },
    auth: { getUser: async () => ({ data: { user: cfg.anonymous ? null : { id: 'user-1' } } }) },
  };
}

vi.mock('../supabase-server', () => ({ createSupabaseServerClient: async () => makeClient() }));
vi.mock('../supabase-admin', () => ({ createSupabaseAdminClient: () => makeClient() }));
vi.mock('../rate-limit', () => ({ enforceRateLimit: () => true }));
vi.mock('../demo-mode', async (orig) => ({ ...(await orig<object>()), isDemoMode: () => false, hasSupabaseConfig: () => true }));
vi.mock('../ai/provider', () => ({ GeminiProvider: class { generate = h.generate; } }));

import { POST } from '../../app/api/chat/route';

const SID = '3ea8542e-4da9-48cf-b6d4-e3c6f8bef574';
const SESSION = {
  id: SID, owner_id: 'user-1', state: 'Telangana', district: 'Warangal', lang: 'en', selected_trade_id: 1,
  concern_state: null, learner_class: 'Class 10', income_bracket: '1-3L', trades: { name_en: 'Electrician' },
};
const post = (body: unknown, raw = false) =>
  POST(new Request('http://x/api/chat', { method: 'POST', body: raw ? (body as string) : JSON.stringify(body) }));
const msg = (text: unknown, extra: object = {}) => ({ session_id: SID, speaker: 'parent', lang: 'en', text, ...extra });
const written = (table: string, op = 'insert') => h.log.filter((e) => e.table === table && e.op === op).map((e) => e.payload);

beforeEach(() => {
  h.log.length = 0;
  h.cfg = { session: SESSION, count: 0 };
  h.generate.mockReset();
  h.generate.mockResolvedValue({ text: 'This course teaches wiring and safety.' });
});

describe('malformed input never crashes the route', () => {
  it('invalid JSON -> 400', async () => expect((await post('not json', true)).status).toBe(400));
  it('non-string text -> 400, not a 500', async () => {
    for (const text of [123, { a: 1 }, ['x'], null]) expect((await post(msg(text))).status).toBe(400);
  });
  it('unknown language / speaker -> 400', async () => {
    expect((await post(msg('hi', { lang: 'xx' }))).status).toBe(400);
    expect((await post(msg('hi', { speaker: 'admin' }))).status).toBe(400);
  });
  it('requires authentication', async () => {
    h.cfg.anonymous = true;
    expect((await post(msg('hello'))).status).toBe(401);
  });
});

describe('crisis messages are never blocked by a limit', () => {
  const DISTRESS = 'I want to die';

  it('at the 30-message session cap a normal message is refused, but a crisis message gets the helpline', async () => {
    h.cfg.count = 30;
    expect((await post(msg('what is the course fee'))).status).toBe(429);
    const res = await post(msg(DISTRESS));
    expect(res.status).toBe(200);
    expect((await res.json()).reply).toContain('14416');
  });

  it('a crisis message longer than the 1000-char storage limit still gets the helpline', async () => {
    const res = await post(msg(DISTRESS + ' ' + 'x'.repeat(2500)));
    expect(res.status).toBe(200);
    expect((await res.json()).reply).toContain('14416');
  });

  it('works before a trade is selected and when the daily quota trigger fires', async () => {
    h.cfg.session = { ...SESSION, selected_trade_id: null };
    h.cfg.messageInsertError = { message: 'daily_message_quota' };
    const res = await post(msg(DISTRESS));
    expect(res.status).toBe(200);
    expect((await res.json()).reply).toContain('14416');
  });

  it('makes no LLM call', async () => {
    await post(msg(DISTRESS));
    expect(h.generate).not.toHaveBeenCalled();
  });

  it('claims a counsellor was notified ONLY when the urgent ticket was really created', async () => {
    const ok = await (await post(msg(DISTRESS))).json();
    expect(ok.escalate).toBe(true);
    expect(ok.reply.toLowerCase()).toContain('counsellor');

    h.cfg.rpcError = { raise_distress: { message: 'boom' } };
    const failed = await (await post(msg(DISTRESS))).json();
    expect(failed.escalate).toBe(false);
    expect(failed.reply.toLowerCase()).not.toContain('counsellor');
    expect(failed.reply).toContain('14416'); // the helpline is never dropped
  });

  it('still answers when the session id is bogus (no ticket, honest reply)', async () => {
    const res = await post(msg(DISTRESS, { session_id: 'nope' }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.escalate).toBe(false);
    expect(body.reply).toContain('14416');
  });
});

describe('privacy: personal data is redacted before it is stored or sent to the LLM', () => {
  it('strips a spaced phone number from the stored message and from the LLM input', async () => {
    await post(msg('my number is 98765 43210, is ITI good?'));
    const stored = written('messages').find((p) => p.speaker === 'parent');
    expect(stored.text).toContain('[phone removed]');
    expect(stored.text).not.toMatch(/\d{5}/);
    expect(h.generate.mock.calls[0][0].userMessage).not.toMatch(/\d{5}/);
  });
});

describe('quota and storage failures', () => {
  it('maps the daily quota trigger to a clear 429', async () => {
    h.cfg.messageInsertError = { message: 'daily_message_quota' };
    const res = await post(msg('what will I study'));
    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe('DAILY_QUOTA');
  });
  it('does not leak database error text on other failures', async () => {
    h.cfg.messageInsertError = { message: 'relation "messages" violates secret_constraint_name' };
    const res = await post(msg('what will I study'));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('secret_constraint_name');
  });
});

describe('number grounding: an unsupported statistic never reaches the transcript', () => {
  it('stores the safe reply, not the hallucinated figure', async () => {
    h.generate.mockResolvedValue({ text: 'About 78% of graduates are placed within a month.' });
    const res = await post(msg('tell me about this course'));
    const body = await res.json();
    expect(body.reply).not.toContain('78');
    expect(body.reply.toLowerCase()).toContain('could not verify');
    const ai = written('messages').filter((p) => p.speaker === 'ai');
    expect(ai).toHaveLength(1);
    expect(ai[0].text).not.toContain('78');
  });
  it('claims escalation only if the ticket exists', async () => {
    h.generate.mockResolvedValue({ text: 'About 78% of graduates are placed.' });
    h.cfg.rpcError = { create_escalation: { message: 'boom' } };
    const body = await (await post(msg('tell me about this course'))).json();
    expect(body.escalate).toBe(false);
    expect(body.reply).not.toContain('I will connect you');
  });
});

describe('server-owned session state', () => {
  it('writes concern_state with the server client after the ownership check', async () => {
    await post(msg('worried about money for the course'));
    expect(written('sessions', 'update').some((p) => 'concern_state' in p)).toBe(true);
  });
});

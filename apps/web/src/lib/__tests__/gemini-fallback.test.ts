import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GeminiHttpError, modelChain, thinkingConfig, withModelFallback } from '../ai/gemini-chain';
import { GeminiProvider } from '../ai/provider';

describe('modelChain', () => {
  it('puts the primary first and de-duplicates fallbacks', () => {
    expect(modelChain({ GEMINI_MODEL: 'a', GEMINI_FALLBACK_MODELS: 'b, a ,,c' })).toEqual(['a', 'b', 'c']);
  });
  it('has a safe default fallback so one bad model name cannot kill chat', () => {
    expect(modelChain({}).length).toBeGreaterThanOrEqual(2);
  });
  it('uses thinking_level for gemini-3 and a budget for 2.x (2.x rejects thinking_level)', () => {
    expect(thinkingConfig('gemini-3.8-flash')).toEqual({ thinking_level: 'low' });
    expect(thinkingConfig('gemini-2.5-flash')).toEqual({ thinking_budget: 0 });
  });
});

describe('withModelFallback', () => {
  it('retries a transient 503 once on the same model', async () => {
    const attempt = vi.fn().mockRejectedValueOnce(new GeminiHttpError(503)).mockResolvedValueOnce('ok');
    await expect(withModelFallback(['m1', 'm2'], attempt)).resolves.toBe('ok');
    expect(attempt.mock.calls.map((c) => c[0])).toEqual(['m1', 'm1']);
  });
  it('moves to the next model immediately on 404 (unknown model)', async () => {
    const attempt = vi.fn().mockRejectedValueOnce(new GeminiHttpError(404)).mockResolvedValueOnce('fallback');
    await expect(withModelFallback(['m1', 'm2'], attempt)).resolves.toBe('fallback');
    expect(attempt.mock.calls.map((c) => c[0])).toEqual(['m1', 'm2']);
  });
  it('retries a timeout once, then falls back', async () => {
    const attempt = vi.fn()
      .mockRejectedValueOnce(new Error('timeout')).mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce('late');
    await expect(withModelFallback(['m1', 'm2'], attempt)).resolves.toBe('late');
    expect(attempt).toHaveBeenCalledTimes(3);
  });
  it('throws the last error when every model fails', async () => {
    const attempt = vi.fn().mockRejectedValue(new GeminiHttpError(404));
    await expect(withModelFallback(['m1', 'm2'], attempt)).rejects.toBeInstanceOf(GeminiHttpError);
  });
});

describe('GeminiProvider', () => {
  const ok = (parts: unknown[]) => new Response(JSON.stringify({ candidates: [{ content: { parts } }] }), { status: 200 });
  beforeEach(() => {
    vi.stubEnv('GEMINI_API_KEY', 'k');
    vi.stubEnv('GEMINI_MODEL', 'gemini-3.8-flash');
    vi.stubEnv('GEMINI_FALLBACK_MODELS', 'gemini-2.5-flash');
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  const req = { language: 'en' as const, userMessage: 'hi', speaker: 'parent' as const, location: { state: 'Telangana', district: 'Warangal' } };

  it('answers from the fallback model when the primary is unknown', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      urls.push(url);
      return url.includes('gemini-3.8-flash') ? new Response('{}', { status: 404 }) : ok([{ text: 'fallback answer' }]);
    }));
    const out = await new GeminiProvider().generate(req);
    expect(out.text).toBe('fallback answer');
    expect(urls[0]).toContain('gemini-3.8-flash');
    expect(urls[1]).toContain('gemini-2.5-flash');
  });

  it('keeps the tool-call follow-up on the same model and echoes the original part', async () => {
    const part = { functionCall: { name: 'get_verified_outcomes', args: { district: 'Warangal', trade: 'Electrician' } }, thoughtSignature: 'sig' };
    const bodies: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      bodies.push(body);
      return bodies.length === 1 ? ok([part]) : ok([{ text: 'grounded answer' }]);
    }));
    const out = await new GeminiProvider().generate(req);
    expect(out.text).toBe('grounded answer');
    const echoed = bodies[1].contents.find((c: any) => c.role === 'model');
    expect(echoed.parts[0]).toEqual(part); // thought signature intact
  });

  it('surfaces AI_RATE_LIMITED so the route can answer politely', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 429 })));
    await expect(new GeminiProvider().generate(req)).rejects.toThrow('AI_RATE_LIMITED');
  });
});

// Model fallback and retry rules for Gemini calls. Kept free of network code so it can be unit tested.

export function modelChain(env: Record<string, string | undefined> = process.env): string[] {
  const primary = (env.GEMINI_MODEL || 'gemini-3.8-flash').trim();
  const fallbacks = (env.GEMINI_FALLBACK_MODELS ?? 'gemini-2.5-flash').split(',');
  const chain: string[] = [];
  for (const raw of [primary, ...fallbacks]) {
    const name = raw.trim();
    if (name && !chain.includes(name)) chain.push(name);
  }
  return chain;
}

/** Gemini 3 takes thinking_level; Gemini 2.x rejects it with HTTP 400 and takes a token budget. */
export function thinkingConfig(model: string): Record<string, unknown> {
  return model.startsWith('gemini-3') ? { thinking_level: 'low' } : { thinking_budget: 0 };
}

const TRANSIENT_STATUS = new Set([500, 502, 503, 504]);

export class GeminiHttpError extends Error {
  constructor(readonly status: number, message?: string) {
    super(message ?? `Gemini request failed: ${status}`);
  }
}

/** Transient = worth one retry on the same model. Anything else moves to the next model. */
export function isTransient(error: unknown): boolean {
  if (error instanceof GeminiHttpError) return TRANSIENT_STATUS.has(error.status);
  // fetch network failures and AbortSignal.timeout both surface as non-HTTP errors.
  return error instanceof Error && !(error instanceof GeminiHttpError);
}

/** Run `attempt` against each model in turn: one retry on transient errors, then the next model. */
export async function withModelFallback<T>(
  models: string[],
  attempt: (model: string) => Promise<T>,
): Promise<T> {
  let lastError: unknown = new Error('No Gemini model configured');
  for (const model of models) {
    for (let tries = 0; tries < 2; tries++) {
      try {
        return await attempt(model);
      } catch (error) {
        lastError = error;
        if (!isTransient(error)) break;
      }
    }
  }
  throw lastError;
}

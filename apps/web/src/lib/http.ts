// Small, dependency-free request helpers shared by the API routes.
// Why this exists: `await request.json()` throws on malformed input, and a non-string `text` crashed
// the chat route with an unhandled 500 (also in demo mode). Every route now parses through here.

export type Json = Record<string, unknown>;
export const LANGS = ['en', 'hi', 'te', 'ta'] as const;
export type AppLang = (typeof LANGS)[number];

/** Parse a JSON object body. Returns null for malformed JSON, arrays, null and primitives. */
export async function readJson(request: Request): Promise<Json | null> {
  try {
    const value: unknown = await request.json();
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : null;
  } catch {
    return null;
  }
}

export const isLang = (v: unknown): v is AppLang =>
  typeof v === 'string' && (LANGS as readonly string[]).includes(v);

/** A non-empty string no longer than `max`, otherwise null. */
export function str(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.length > 0 && v.length <= max ? v : null;
}

/** Postgres / PostgREST error code, e.g. '23505' unique violation, 'P0001' raised by a trigger. */
export function pgCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null ? ((error as { code?: string }).code) : undefined;
}

export function pgMessage(error: unknown): string {
  return typeof error === 'object' && error !== null ? String((error as { message?: string }).message ?? '') : '';
}

/** True when the database refused a write because a daily quota trigger fired. */
export function isQuotaError(error: unknown): boolean {
  return /daily_(message|session)_quota/.test(pgMessage(error));
}

/** Strict positive integer from a URL segment. Number.parseInt("12abc") is 12, which we do not accept. */
export function parseId(value: string | undefined): number | null {
  return typeof value === 'string' && /^[1-9]\d{0,15}$/.test(value) ? Number(value) : null;
}

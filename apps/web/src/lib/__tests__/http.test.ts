import { describe, expect, it } from 'vitest';
import { isLang, isQuotaError, parseId, readJson, str } from '../http';

const req = (body: string) => new Request('http://x', { method: 'POST', body });

describe('readJson', () => {
  it('parses an object', async () => expect(await readJson(req('{"a":1}'))).toEqual({ a: 1 }));
  it('returns null (never throws) for malformed JSON, arrays, null and primitives', async () => {
    for (const bad of ['not json', '', '[1,2]', 'null', '"str"', '12']) expect(await readJson(req(bad))).toBeNull();
  });
});
describe('parseId', () => {
  it('accepts positive integers only', () => {
    expect(parseId('42')).toBe(42);
    for (const bad of ['0', '-1', '12abc', '1.5', '', 'demo-1', ' 1', '1e3', undefined]) expect(parseId(bad as string)).toBeNull();
  });
});
describe('str / isLang / isQuotaError', () => {
  it('str enforces type and length', () => {
    expect(str('ab', 5)).toBe('ab');
    for (const bad of [123, {}, null, undefined, '', 'toolong']) expect(str(bad, 5)).toBeNull();
  });
  it('isLang accepts only supported languages', () => {
    for (const l of ['en', 'hi', 'te', 'ta']) expect(isLang(l)).toBe(true);
    for (const l of ['xx', '', 5, null, 'EN']) expect(isLang(l)).toBe(false);
  });
  it('isQuotaError recognises the database quota triggers', () => {
    expect(isQuotaError({ message: 'daily_message_quota' })).toBe(true);
    expect(isQuotaError({ message: 'daily_session_quota' })).toBe(true);
    expect(isQuotaError({ message: 'something else' })).toBe(false);
    expect(isQuotaError(null)).toBe(false);
  });
});

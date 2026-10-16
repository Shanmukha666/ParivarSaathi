import { describe, expect, it } from 'vitest';
import { redactPersonalData, toAsciiDigits } from '../redact';

describe('redactPersonalData', () => {
  const phones = [
    '9876543210', '98765 43210', '98765-43210', '98765.43210', '987 654 3210', '9876 543 210',
    '+919876543210', '+91 98765 43210', '+91-9876543210', '919876543210', '09876543210', '0 9876543210',
    '00919876543210',
  ];
  for (const p of phones) {
    it(`removes phone written as "${p}"`, () => {
      const out = redactPersonalData(`please call ${p} tomorrow`);
      expect(out).toContain('[phone removed]');
      expect(out).not.toMatch(/\d{4}/);
    });
  }

  // Build digit strings from the real Unicode digit blocks (Devanagari U+0966, Telugu U+0C66, Tamil U+0BE6).
  const inScript = (zero: number, ascii: string) => ascii.split('').map((d) => String.fromCodePoint(zero + Number(d))).join('');

  it('removes phone numbers written in Telugu, Hindi and Tamil digits', () => {
    for (const zero of [0x0c66, 0x0966, 0x0be6]) {
      expect(redactPersonalData(`call ${inScript(zero, '9876543210')}`)).toBe('call [phone removed]');
      expect(redactPersonalData(`call ${inScript(zero, '98765')} ${inScript(zero, '43210')}`)).toBe('call [phone removed]');
    }
  });

  it('removes email and Aadhaar-style 12-digit numbers', () => {
    expect(redactPersonalData('mail me at ravi.k@example.com')).toBe('mail me at [email removed]');
    expect(redactPersonalData('aadhaar 1234 5678 9012')).toBe('aadhaar [id number removed]');
  });

  it('does NOT mangle salary, fee, year, percentage or duration figures', () => {
    const safe = [
      'He expects 15000 to 18000 rupees a month', 'salary 9000-12000 per month', 'fee is 8500', 'placed in 2024',
      'course is 24 months', '78% placement', 'class 10 passed with 85 percent', 'earn 16500 and 21000',
      'around 8000 9000 per month', 'room 5 floor 3',
    ];
    for (const s of safe) expect(redactPersonalData(s)).toBe(s);
  });

  it('keeps surrounding text and leaves clean text untouched', () => {
    expect(redactPersonalData('hello world')).toBe('hello world');
    expect(redactPersonalData('a 98765 43210 b 9123456789 c')).toBe('a [phone removed] b [phone removed] c');
  });

  it('toAsciiDigits preserves string length', () => {
    const s = `x ${inScript(0x0c66, '98')} y ${inScript(0x0966, '9')} z`;
    expect(toAsciiDigits(s)).toHaveLength(s.length);
    expect(toAsciiDigits(s)).toBe('x 98 y 9 z');
  });
});

import { normaliseIndianMobile } from '../redact';

describe('normaliseIndianMobile', () => {
  it('accepts the formats people really type', () => {
    for (const p of ['9876543210', '98765 43210', '98765-43210', '+91 98765 43210', '+919876543210', '919876543210', '09876543210', '0091 9876543210', '(98765) 43210']) {
      expect(normaliseIndianMobile(p)).toBe('9876543210');
    }
  });
  it('accepts Telugu digits', () => {
    const telugu = '9876543210'.split('').map((d) => String.fromCodePoint(0x0c66 + Number(d))).join('');
    expect(normaliseIndianMobile(telugu)).toBe('9876543210');
  });
  it('rejects things that are not Indian mobile numbers', () => {
    for (const p of ['', '12345', '5876543210', '98765432101', '98765 4321', 'call me', '+1 415 555 0100', '1800-891-4416']) {
      expect(normaliseIndianMobile(p)).toBeNull();
    }
  });
});

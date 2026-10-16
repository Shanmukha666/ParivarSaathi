// Personal-data redaction applied to free text BEFORE it reaches the LLM or is stored.
//
// The previous version only caught a bare ten-digit number. It missed the formats people actually
// type: "98765 43210", "98765-43210", "+91 98765 43210", "09876543210", and numbers written with
// Devanagari, Telugu or Tamil digits. Aadhaar-style 12-digit numbers were not handled at all.

const INDIC_DIGIT_BLOCKS = [0x0966, 0x0c66, 0x0be6]; // Devanagari, Telugu, Tamil zero

/** Map Indic digits to ASCII 1:1 (same string length, so match indices line up with the original). */
export function toAsciiDigits(value: string): string {
  let out = '';
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i); // all supported digit blocks are in the BMP
    let mapped = value.charAt(i);
    for (const zero of INDIC_DIGIT_BLOCKS) {
      if (code >= zero && code <= zero + 9) mapped = String(code - zero);
    }
    out += mapped;
  }
  return out;
}

const SEP = '[\\s.-]';
const PHONE = new RegExp(
  // optional country code / trunk prefix, then 10 digits starting 6-9 in a plausible grouping
  `(?<!\\d)(?:(?:\\+|00)?91${SEP}?)?0?(?:[6-9]\\d{4}${SEP}?\\d{5}|[6-9]\\d{2}${SEP}\\d{3}${SEP}\\d{4}|[6-9]\\d{3}${SEP}\\d{3}${SEP}\\d{3})(?!\\d)`,
  'g',
);
const AADHAAR_LIKE = new RegExp(`(?<!\\d)\\d{4}${SEP}?\\d{4}${SEP}?\\d{4}(?!\\d)`, 'g');
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

export function redactPersonalData(value: string): string {
  const ascii = toAsciiDigits(value);
  const spans: Array<[number, number, string]> = [];
  const patterns: Array<[RegExp, string]> = [[PHONE, '[phone removed]'], [AADHAAR_LIKE, '[id number removed]'], [EMAIL, '[email removed]']];
  for (const [re, label] of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(ascii)) !== null) spans.push([m.index, m.index + m[0].length, label]);
  }
  if (!spans.length) return value;
  spans.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  let out = '';
  let pos = 0;
  for (const [start, end, label] of spans) {
    if (start < pos) continue; // overlaps an earlier, already-redacted span
    out += value.slice(pos, start) + label;
    pos = end;
  }
  return out + value.slice(pos);
}

/**
 * Normalise what a person types into a callback-number field to a bare 10-digit Indian mobile number,
 * or null if it is not one. Accepts spaces, hyphens, dots, a +91 / 91 / 0 prefix and Indic digits,
 * so "+91 98765 43210" no longer fails validation on the very form families use to ask for a call.
 */
export function normaliseIndianMobile(input: string): string | null {
  let digits = toAsciiDigits(input).replace(/[\s.\-()]/g, '');
  if (digits.startsWith('+91')) digits = digits.slice(3);
  else if (digits.startsWith('0091')) digits = digits.slice(4);
  else if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

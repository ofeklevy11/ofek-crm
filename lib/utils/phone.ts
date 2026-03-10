/**
 * E.164 phone number validation and normalization.
 * This file must NOT import server-only modules (used in frontend too).
 */

const E164_RE = /^\+[1-9]\d{6,14}$/;

export function isValidE164(phone: string): boolean {
  return E164_RE.test(phone);
}

/**
 * Best-effort normalization to E.164 format.
 * Handles Israeli local numbers (0xx → +972xx) and strips common formatting.
 * Returns null if the result doesn't look like a valid E.164 number.
 */
export function normalizeToE164(phone: string): string | null {
  // Strip all non-digit characters except leading +
  let digits = phone.replace(/[^\d+]/g, "");

  // Israeli local number: 05x, 07x, etc. → +972xx
  if (digits.startsWith("0") && digits.length >= 9 && digits.length <= 10) {
    digits = "+972" + digits.substring(1);
  }

  // If no + prefix but looks like international, add +
  if (!digits.startsWith("+") && digits.length >= 10) {
    digits = "+" + digits;
  }

  return E164_RE.test(digits) ? digits : null;
}

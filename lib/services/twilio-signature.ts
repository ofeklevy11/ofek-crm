/**
 * Twilio webhook signature validation.
 * Implements Twilio's HMAC-SHA1 signature algorithm with timing-safe comparison.
 */

import { createHmac, timingSafeEqual } from "crypto";

/**
 * Validate a Twilio webhook request signature.
 *
 * Algorithm:
 * 1. Start with the full webhook URL
 * 2. Sort POST parameters alphabetically by key
 * 3. Append key+value for each parameter
 * 4. HMAC-SHA1 using the Twilio Auth Token as key
 * 5. Base64 encode and compare to X-Twilio-Signature header
 */
export function validateTwilioSignature(
  authToken: string,
  signatureHeader: string,
  url: string,
  params: Record<string, string>,
): boolean {
  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const key of sortedKeys) {
    data += key + params[key];
  }

  const computed = createHmac("sha1", authToken)
    .update(data)
    .digest("base64");

  try {
    return timingSafeEqual(
      Buffer.from(computed),
      Buffer.from(signatureHeader),
    );
  } catch {
    return false;
  }
}

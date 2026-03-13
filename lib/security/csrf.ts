/**
 * CSRF protection utilities.
 *
 * Validates that state-changing requests originate from the application itself
 * by checking the Origin header (with Referer as fallback) and requiring
 * a custom X-Requested-With header that cannot be set by plain HTML forms.
 */

const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Routes exempt from CSRF checks (use their own auth mechanisms). */
const CSRF_EXEMPT_PREFIXES = [
  "/api/inngest",      // Inngest SDK signing
  "/api/make/",        // Make webhook secret
  "/api/cron/",        // Bearer CRON_SECRET
  "/api/p/",           // Public APIs
  "/api/uploadthing",  // UploadThing SDK auth
  "/api/webhooks/",    // WhatsApp webhooks (signature-verified in route)
  "/api/nurture/webhook/", // Nurture webhooks (Bearer NURTURE_WEBHOOK_SECRET)
];

const CSRF_EXEMPT_PREFIXES_EXTRA = [
  "/api/auth/forgot-password", // Public forgot password flow
];

const CSRF_EXEMPT_EXACT = [
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/verify-email",
  "/api/automations/cron", // Bearer CRON_SECRET
];

export function isStateChangingMethod(method: string): boolean {
  return STATE_CHANGING_METHODS.has(method.toUpperCase());
}

export function isCsrfExempt(pathname: string): boolean {
  if (CSRF_EXEMPT_EXACT.includes(pathname)) return true;
  if (CSRF_EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true;
  return CSRF_EXEMPT_PREFIXES_EXTRA.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Extract the origin (scheme + host + port) from a URL string.
 * Returns null if the URL is unparseable.
 */
function extractOrigin(url: string): string | null {
  try {
    const { origin } = new URL(url);
    return origin !== "null" ? origin : null;
  } catch {
    return null;
  }
}

export interface CsrfCheckResult {
  allowed: boolean;
  reason: string;
}

/**
 * Validate that a request's Origin (or Referer) matches the trusted app origin.
 *
 * In development, localhost origins on any port are accepted.
 * In production, the origin must match NEXT_PUBLIC_APP_URL exactly.
 */
export function validateOrigin(
  originHeader: string | null,
  refererHeader: string | null,
  appUrl: string | undefined,
): CsrfCheckResult {
  const requestOrigin = originHeader ?? (refererHeader ? extractOrigin(refererHeader) : null);

  // If no Origin/Referer is present, block — legitimate browser requests include at least one.
  if (!requestOrigin) {
    return { allowed: false, reason: "Missing Origin and Referer headers" };
  }

  const isDev = process.env.NODE_ENV !== "production";

  // In development, allow any localhost origin
  if (isDev) {
    try {
      const { hostname } = new URL(requestOrigin);
      if (hostname === "localhost" || hostname === "127.0.0.1") {
        return { allowed: true, reason: "Development localhost" };
      }
    } catch {
      // fall through to reject
    }
  }

  // In production (or non-localhost dev), compare against the trusted app URL
  if (!appUrl) {
    // If NEXT_PUBLIC_APP_URL is not configured, allow in dev, block in prod
    if (isDev) {
      return { allowed: true, reason: "Development mode without APP_URL" };
    }
    return { allowed: false, reason: "NEXT_PUBLIC_APP_URL not configured" };
  }

  const trustedOrigin = extractOrigin(appUrl);
  if (!trustedOrigin) {
    return { allowed: false, reason: "Invalid NEXT_PUBLIC_APP_URL" };
  }

  if (requestOrigin === trustedOrigin) {
    return { allowed: true, reason: "Origin matches trusted app URL" };
  }

  return { allowed: false, reason: `Origin mismatch: ${requestOrigin}` };
}

/**
 * Check that the request includes the custom X-Requested-With header.
 * HTML forms and simple navigations cannot set custom headers, so this
 * blocks cross-origin form-based CSRF attacks.
 */
export function validateCustomHeader(xRequestedWith: string | null): CsrfCheckResult {
  if (xRequestedWith) {
    return { allowed: true, reason: "X-Requested-With header present" };
  }
  return { allowed: false, reason: "Missing X-Requested-With header" };
}

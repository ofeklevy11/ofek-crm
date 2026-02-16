/**
 * Extract client IP from request headers.
 * Prefers x-real-ip (set by Vercel/reverse proxy, non-spoofable),
 * falls back to first IP in x-forwarded-for chain.
 */
export function getClientIp(req: Request): string {
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0]?.trim();
    if (firstIp) return firstIp;
  }

  return "unknown";
}

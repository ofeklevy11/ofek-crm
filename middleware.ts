import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  isStateChangingMethod,
  isCsrfExempt,
  validateOrigin,
  validateCustomHeader,
} from "@/lib/security/csrf";

function buildCspHeader(nonce: string, path?: string): string {
  // Allow embedding for public meeting booking pages
  const frameAncestors = path?.startsWith("/p/meetings/") ? "*" : "'none'";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://connect.facebook.net`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://utfs.io https://*.ufs.sh",
    "font-src 'self' data:",
    "connect-src 'self' https://utfs.io https://*.ufs.sh https://*.uploadthing.com https://*.inngest.com https://graph.facebook.com https://www.facebook.com https://connect.facebook.net",
    "frame-src https://www.facebook.com",
    `frame-ancestors ${frameAncestors}`,
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Generate a per-request nonce for CSP
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  // ── CSRF protection for state-changing API requests ──
  if (
    path.startsWith("/api/") &&
    isStateChangingMethod(request.method) &&
    !isCsrfExempt(path)
  ) {
    const originCheck = validateOrigin(
      request.headers.get("origin"),
      request.headers.get("referer"),
      process.env.NEXT_PUBLIC_APP_URL,
    );
    if (!originCheck.allowed) {
      console.warn(`[CSRF] Origin rejected: ${originCheck.reason} — ${request.method} ${path}`);
      return NextResponse.json(
        { error: "Forbidden", message: "CSRF validation failed" },
        { status: 403 },
      );
    }

    const headerCheck = validateCustomHeader(request.headers.get("x-requested-with"));
    if (!headerCheck.allowed) {
      console.warn(`[CSRF] Header rejected: ${headerCheck.reason} — ${request.method} ${path}`);
      return NextResponse.json(
        { error: "Forbidden", message: "CSRF validation failed" },
        { status: 403 },
      );
    }
  }

  // Define public paths that don't require authentication
  const publicPaths = [
    "/",
    "/login",
    "/register",
    "/api/auth/login",
    "/api/auth/logout",
    "/api/auth/register",
  ];

  // Check if the path is strictly one of the public paths
  // or if it's an allowed bypass path (webhooks, cron, public pages)
  if (
    publicPaths.includes(path) ||
    path.startsWith("/api/inngest") || // Allow Inngest Dev Server to communicate with the route
    path.startsWith("/api/make/") || // Allow Make webhooks to bypass cookie auth
    path.startsWith("/api/webhooks/") || // WhatsApp webhooks (signature-verified in route)
    path.startsWith("/api/cron/") || // Allow Cron jobs to bypass cookie auth (secured in route)
    path === "/api/automations/cron" || // Allow automation cron endpoint to bypass cookie auth
    path.startsWith("/p/") || // Allow Public Pages
    path.startsWith("/api/p/") // Allow Public APIs
  ) {
    const reqHeaders = new Headers(request.headers);
    reqHeaders.set("x-nonce", nonce);
    const res = addCacheControl(path, NextResponse.next({ request: { headers: reqHeaders } }));
    res.headers.set("Content-Security-Policy", buildCspHeader(nonce, path));
    res.headers.set("x-pathname", path);
    return res;
  }

  // Check for the authentication cookie
  const authToken = request.cookies.get("auth_token")?.value;

  // If no auth token found, redirect to home page
  if (!authToken) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Token format check: must be either userId.issuedAt.signature (new) or userId.signature (legacy)
  // Signature must be exactly 64 hex characters
  const parts = authToken.split(".");
  if (parts.length < 2 || parts.length > 3) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  const signaturePart = parts[parts.length - 1];
  if (!signaturePart || signaturePart.length !== 64 || !/^[0-9a-f]{64}$/.test(signaturePart)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Sliding session: re-set cookie with 1-day maxAge on each authenticated request
  // Combined with 7-day absolute token expiration, active users stay logged in
  // up to 7 days, idle users expire in 1 day
  const reqHeaders = new Headers(request.headers);
  reqHeaders.set("x-nonce", nonce);
  const response = addCacheControl(path, NextResponse.next({ request: { headers: reqHeaders } }));
  response.headers.set("Content-Security-Policy", buildCspHeader(nonce, path));
  response.cookies.set("auth_token", authToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 86_400, // 1 day sliding window
    path: "/",
    sameSite: "lax",
  });

  return response;
}

/**
 * Add Cache-Control: no-store to API responses to prevent
 * browsers from caching sensitive JSON on shared computers.
 * Excludes routes that set their own Cache-Control (file downloads, SSE, public).
 */
function addCacheControl(path: string, response: NextResponse): NextResponse {
  if (
    path.startsWith("/api/") &&
    !path.startsWith("/api/files/") &&
    !path.startsWith("/api/attachments/") &&
    !path.startsWith("/api/sse") &&
    !path.startsWith("/api/p/")
  ) {
    response.headers.set("Cache-Control", "no-store");
  } else if (!path.startsWith("/api/")) {
    // Prevent browser/CDN from caching page responses so auth state is always fresh
    response.headers.set("Cache-Control", "private, no-store, must-revalidate");
    response.headers.set("Vary", "Cookie");
  }
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, sitemap.xml, robots.txt
     * - Static asset files (images, fonts, etc.)
     */
    "/((?!_next/static|_next/image|favicon\\.ico|sitemap\\.xml|robots\\.txt|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|eot)$).*)",
  ],
};

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

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
  // or if it's a static asset (nextjs internals, images, etc)
  if (
    publicPaths.includes(path) ||
    path.startsWith("/api/make/") || // Allow Make webhooks to bypass cookie auth
    path.startsWith("/api/cron/") || // Allow Cron jobs to bypass cookie auth (secured in route)
    path.startsWith("/_next") ||
    path.startsWith("/static") ||
    path.includes(".") // naive check for files like favicon.ico, images
  ) {
    return NextResponse.next();
  }

  // Check for the authentication cookie
  // Note: We use 'auth_token' as defined in app/api/auth/login/route.ts
  const authToken = request.cookies.get("auth_token")?.value;

  // If no auth token found, redirect to home page
  if (!authToken) {
    // The user requested that unauthorized users can only access the ROOT page ('/')
    // So we redirect everyone else to '/'
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Optional: Basic format check (id.signature)
  if (!authToken.includes(".")) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};

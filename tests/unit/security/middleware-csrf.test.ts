import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@/lib/redis", () => ({
  redis: { get: vi.fn(), set: vi.fn(), del: vi.fn() },
}));

import { middleware } from "@/middleware";
import { NextRequest } from "next/server";

function makeRequest(
  method: string,
  path: string,
  headers: Record<string, string> = {},
  cookies: Record<string, string> = {},
): NextRequest {
  const url = `http://localhost:3000${path}`;
  const req = new NextRequest(new Request(url, { method, headers }));
  for (const [k, v] of Object.entries(cookies)) {
    req.cookies.set(k, v);
  }
  return req;
}

const originalEnv = { ...process.env };

afterEach(() => {
  process.env.NODE_ENV = originalEnv.NODE_ENV;
  process.env.NEXT_PUBLIC_APP_URL = originalEnv.NEXT_PUBLIC_APP_URL;
});

describe("middleware — CSRF checks", () => {
  it("GET requests pass without CSRF check", () => {
    const res = middleware(makeRequest("GET", "/api/tasks"));
    // No auth token → redirect to login (not a 403)
    expect(res.status).not.toBe(403);
  });

  it("POST to exempt path passes without CSRF headers", () => {
    const res = middleware(makeRequest("POST", "/api/auth/login"));
    // login is public + exempt → passes through (200-level next())
    expect(res.status).not.toBe(403);
  });

  it("POST to non-exempt path without Origin → 403", () => {
    const res = middleware(
      makeRequest("POST", "/api/tasks", { "content-type": "application/json" }),
    );
    expect(res.status).toBe(403);
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("POST with correct Origin + X-Requested-With → passes", () => {
    process.env.NODE_ENV = "production";
    process.env.NEXT_PUBLIC_APP_URL = "https://bizlycrm.com";
    const res = middleware(
      makeRequest(
        "POST",
        "/api/tasks",
        {
          origin: "https://bizlycrm.com",
          "x-requested-with": "XMLHttpRequest",
        },
        // Need an auth token to not get redirected
        { auth_token: "1.1234567890.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
      ),
    );
    // Should not be 403 (CSRF passes); may redirect if token invalid, that's fine
    expect(res.status).not.toBe(403);
  });

  it("POST with wrong Origin → 403", () => {
    process.env.NODE_ENV = "production";
    process.env.NEXT_PUBLIC_APP_URL = "https://bizlycrm.com";
    const res = middleware(
      makeRequest("POST", "/api/tasks", {
        origin: "https://evil.com",
        "x-requested-with": "XMLHttpRequest",
      }),
    );
    expect(res.status).toBe(403);
  });

  it("POST with Origin but missing X-Requested-With → 403", () => {
    process.env.NODE_ENV = "production";
    process.env.NEXT_PUBLIC_APP_URL = "https://bizlycrm.com";
    const res = middleware(
      makeRequest("POST", "/api/tasks", {
        origin: "https://bizlycrm.com",
      }),
    );
    expect(res.status).toBe(403);
  });

  it("unauthenticated request to protected path → redirect /login", () => {
    const res = middleware(makeRequest("GET", "/dashboard"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("invalid token format → redirect /login", () => {
    const res = middleware(
      makeRequest("GET", "/dashboard", {}, { auth_token: "not-valid-token" }),
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("valid token format passes through", () => {
    const res = middleware(
      makeRequest(
        "GET",
        "/dashboard",
        {},
        { auth_token: "123.1234567890.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
      ),
    );
    // Valid format → next() (200)
    expect(res.status).not.toBe(307);
    expect(res.status).not.toBe(403);
  });
});

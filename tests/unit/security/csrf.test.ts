import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Must mock redis before importing csrf module (redis import at module level in other files)
vi.mock("@/lib/redis", () => ({
  redis: { get: vi.fn(), set: vi.fn(), del: vi.fn() },
}));

import {
  isStateChangingMethod,
  isCsrfExempt,
  validateOrigin,
  validateCustomHeader,
} from "@/lib/security/csrf";

// ── isStateChangingMethod ──────────────────────────────────────────

describe("isStateChangingMethod", () => {
  it.each(["POST", "PUT", "PATCH", "DELETE"])(
    "%s → true",
    (method) => {
      expect(isStateChangingMethod(method)).toBe(true);
    },
  );

  it.each(["GET", "HEAD", "OPTIONS"])(
    "%s → false",
    (method) => {
      expect(isStateChangingMethod(method)).toBe(false);
    },
  );

  it("is case-insensitive (lowercased input)", () => {
    expect(isStateChangingMethod("post")).toBe(true);
    expect(isStateChangingMethod("Post")).toBe(true);
    expect(isStateChangingMethod("get")).toBe(false);
  });
});

// ── isCsrfExempt ──────────────────────────────────────────────────

describe("isCsrfExempt", () => {
  describe("exact matches", () => {
    it.each([
      "/api/auth/login",
      "/api/auth/register",
      "/api/auth/verify-email",
      "/api/automations/cron",
    ])("%s → true", (path) => {
      expect(isCsrfExempt(path)).toBe(true);
    });
  });

  describe("prefix matches", () => {
    it.each([
      "/api/inngest",
      "/api/inngest/some-event",
      "/api/make/hook123",
      "/api/cron/daily",
      "/api/p/meetings/book",
      "/api/uploadthing",
      "/api/webhooks/whatsapp",
    ])("%s → true", (path) => {
      expect(isCsrfExempt(path)).toBe(true);
    });
  });

  describe("non-exempt paths", () => {
    it.each([
      "/api/tasks",
      "/api/auth/me",
      "/api/auth/logout",
      "/api/tables",
      "/api/users",
    ])("%s → false", (path) => {
      expect(isCsrfExempt(path)).toBe(false);
    });
  });
});

// ── validateOrigin ─────────────────────────────────────────────────

describe("validateOrigin", () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it("blocks when both Origin and Referer are missing", () => {
    const result = validateOrigin(null, null, "https://bizlycrm.com");
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/Missing/i);
  });

  it("allows localhost in development", () => {
    process.env.NODE_ENV = "development";
    const result = validateOrigin("http://localhost:3000", null, "https://bizlycrm.com");
    expect(result.allowed).toBe(true);
  });

  it("allows 127.0.0.1 in development", () => {
    process.env.NODE_ENV = "development";
    const result = validateOrigin("http://127.0.0.1:3000", null, undefined);
    expect(result.allowed).toBe(true);
  });

  it("allows matching APP_URL origin", () => {
    process.env.NODE_ENV = "production";
    const result = validateOrigin("https://bizlycrm.com", null, "https://bizlycrm.com");
    expect(result.allowed).toBe(true);
  });

  it("blocks mismatched origin in production", () => {
    process.env.NODE_ENV = "production";
    const result = validateOrigin("https://evil.com", null, "https://bizlycrm.com");
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/mismatch/i);
  });

  it("falls back to Referer when Origin is missing", () => {
    process.env.NODE_ENV = "production";
    const result = validateOrigin(
      null,
      "https://bizlycrm.com/dashboard?tab=1",
      "https://bizlycrm.com",
    );
    expect(result.allowed).toBe(true);
  });

  it("blocks when APP_URL is not configured in production", () => {
    process.env.NODE_ENV = "production";
    const result = validateOrigin("https://bizlycrm.com", null, undefined);
    expect(result.allowed).toBe(false);
  });

  it("allows dev mode without APP_URL", () => {
    process.env.NODE_ENV = "development";
    const result = validateOrigin("https://some-origin.com", null, undefined);
    expect(result.allowed).toBe(true);
  });
});

// ── validateCustomHeader ───────────────────────────────────────────

describe("validateCustomHeader", () => {
  it("allows when X-Requested-With is present", () => {
    const result = validateCustomHeader("XMLHttpRequest");
    expect(result.allowed).toBe(true);
  });

  it("blocks when X-Requested-With is missing", () => {
    const result = validateCustomHeader(null);
    expect(result.allowed).toBe(false);
  });

  it("allows any non-empty value", () => {
    const result = validateCustomHeader("fetch");
    expect(result.allowed).toBe(true);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// --- Mocks ---
vi.mock("@/lib/prisma", () => ({
  prisma: {
    quote: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(),
  RATE_LIMITS: {
    publicDownload: { prefix: "pub-dl", max: 20, windowSeconds: 60 },
  },
}));

vi.mock("@/lib/db-retry", () => ({
  withRetry: vi.fn((fn: any) => fn()),
}));

vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: vi.fn() },
}));

vi.mock("@/lib/security/safe-hosts", () => ({
  isSafeStorageUrl: vi.fn(),
}));

vi.mock("@/lib/security/tokens", () => ({
  tokensMatch: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue({
    get: vi.fn().mockReturnValue(""),
  }),
}));

// --- Imports ---
import { GET } from "@/app/api/p/quotes/[id]/download/route";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { inngest } from "@/lib/inngest/client";
import { isSafeStorageUrl } from "@/lib/security/safe-hosts";
import { tokensMatch } from "@/lib/security/tokens";
import { headers } from "next/headers";
import { buildGetRequest, buildParams } from "@/tests/helpers/finance-mocks";

// --- Fixtures ---
const VALID_CUID = "clh4n7r0v000008l5c2h6d3e7";
const VALID_TOKEN = "d9a5f8e3-1234-5678-abcd-ef0123456789";
const BASE_URL = "http://localhost:3000/api/p/quotes";

function quoteFixture(overrides: Record<string, any> = {}) {
  return {
    id: VALID_CUID,
    companyId: 100,
    pdfUrl: "https://utfs.io/f/cached.pdf",
    shareToken: VALID_TOKEN,
    updatedAt: new Date(),
    ...overrides,
  };
}

const mockFetch = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(headers).mockResolvedValue({
    get: vi.fn().mockReturnValue(""),
  } as any);
  vi.mocked(checkRateLimit).mockResolvedValue(null);
  vi.mocked(inngest.send).mockResolvedValue(undefined as any);
  vi.mocked(isSafeStorageUrl).mockReturnValue(true);
  vi.mocked(tokensMatch).mockReturnValue(true);
  vi.mocked(prisma.quote.updateMany).mockResolvedValue({ count: 1 });
  vi.stubGlobal("fetch", mockFetch);
});

// ─── GET /api/p/quotes/[id]/download ───────────────────────────────────────
describe("GET /api/p/quotes/[id]/download", () => {
  // --- Validation ---
  it("returns 400 for invalid CUID", async () => {
    const req = buildGetRequest(`${BASE_URL}/bad-id/download`);
    const res = await GET(req, buildParams("bad-id"));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("Invalid quote ID");
  });

  it("returns 400 for empty id", async () => {
    const req = buildGetRequest(`${BASE_URL}//download`);
    const res = await GET(req, buildParams(""));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("Invalid quote ID");
  });

  // --- Rate limit ---
  it("returns 429 when rate limited", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue(
      NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 }),
    );
    const req = buildGetRequest(
      `${BASE_URL}/${VALID_CUID}/download`,
      { token: VALID_TOKEN },
    );
    const res = await GET(req, buildParams(VALID_CUID));
    expect(res.status).toBe(429);
  });

  it("extracts IP from x-forwarded-for", async () => {
    vi.mocked(prisma.quote.findFirst).mockResolvedValue(null);
    vi.mocked(tokensMatch).mockReturnValue(false);
    const req = new Request(
      new URL(`${BASE_URL}/${VALID_CUID}/download?token=${VALID_TOKEN}`),
      { headers: { "x-forwarded-for": "1.2.3.4" } },
    );
    // NextRequest wraps native Request
    const { NextRequest } = await import("next/server");
    const nextReq = new NextRequest(req);
    await GET(nextReq, buildParams(VALID_CUID));
    expect(checkRateLimit).toHaveBeenCalledWith(
      "1.2.3.4",
      expect.objectContaining({ prefix: "pub-dl" }),
    );
  });

  it("uses 'unknown' when x-forwarded-for is missing", async () => {
    vi.mocked(prisma.quote.findFirst).mockResolvedValue(null);
    vi.mocked(tokensMatch).mockReturnValue(false);
    const req = buildGetRequest(
      `${BASE_URL}/${VALID_CUID}/download`,
      { token: VALID_TOKEN },
    );
    await GET(req, buildParams(VALID_CUID));
    expect(checkRateLimit).toHaveBeenCalledWith(
      "unknown",
      expect.objectContaining({ prefix: "pub-dl" }),
    );
  });

  it("extracts first IP from comma-separated list", async () => {
    vi.mocked(prisma.quote.findFirst).mockResolvedValue(null);
    vi.mocked(tokensMatch).mockReturnValue(false);
    const { NextRequest } = await import("next/server");
    const req = new NextRequest(
      new URL(`${BASE_URL}/${VALID_CUID}/download?token=${VALID_TOKEN}`),
      { headers: { "x-forwarded-for": "10.0.0.1, 10.0.0.2, 10.0.0.3" } },
    );
    await GET(req, buildParams(VALID_CUID));
    expect(checkRateLimit).toHaveBeenCalledWith(
      "10.0.0.1",
      expect.objectContaining({ prefix: "pub-dl" }),
    );
  });

  // --- Token ---
  it("returns 404 when token query param is missing", async () => {
    vi.mocked(prisma.quote.findFirst).mockResolvedValue(quoteFixture() as any);
    vi.mocked(tokensMatch).mockReturnValue(false);
    const req = buildGetRequest(`${BASE_URL}/${VALID_CUID}/download`);
    const res = await GET(req, buildParams(VALID_CUID));
    expect(res.status).toBe(404);
    expect(tokensMatch).toHaveBeenCalledWith(null, VALID_TOKEN);
  });

  it("returns 404 when token mismatch", async () => {
    vi.mocked(prisma.quote.findFirst).mockResolvedValue(quoteFixture() as any);
    vi.mocked(tokensMatch).mockReturnValue(false);
    const req = buildGetRequest(`${BASE_URL}/${VALID_CUID}/download`, {
      token: "wrong-token",
    });
    const res = await GET(req, buildParams(VALID_CUID));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Not found");
  });

  it("returns 404 when token is empty string", async () => {
    vi.mocked(prisma.quote.findFirst).mockResolvedValue(quoteFixture() as any);
    vi.mocked(tokensMatch).mockReturnValue(false);
    const req = buildGetRequest(`${BASE_URL}/${VALID_CUID}/download`, {
      token: "",
    });
    const res = await GET(req, buildParams(VALID_CUID));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Not found");
  });

  it("proceeds when token matches", async () => {
    vi.mocked(prisma.quote.findFirst).mockResolvedValue(quoteFixture() as any);
    vi.mocked(tokensMatch).mockReturnValue(true);
    mockFetch.mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "application/pdf" }),
      body: new ReadableStream(),
    });
    const req = buildGetRequest(`${BASE_URL}/${VALID_CUID}/download`, {
      token: VALID_TOKEN,
    });
    const res = await GET(req, buildParams(VALID_CUID));
    expect(res.status).toBe(200);
    expect(tokensMatch).toHaveBeenCalledWith(VALID_TOKEN, VALID_TOKEN);
  });

  // --- Enumeration prevention ---
  it("returns same 404 for non-existent quote and wrong token", async () => {
    vi.mocked(prisma.quote.findFirst).mockResolvedValue(null);
    const req = buildGetRequest(`${BASE_URL}/${VALID_CUID}/download`, {
      token: "abc",
    });
    const res = await GET(req, buildParams(VALID_CUID));
    expect(res.status).toBe(404);
    const text = await res.text();
    expect(text).toBe("Not found");
  });

  it("returns plain text 'Not found' (no JSON leak)", async () => {
    vi.mocked(prisma.quote.findFirst).mockResolvedValue(quoteFixture() as any);
    vi.mocked(tokensMatch).mockReturnValue(false);
    const req = buildGetRequest(`${BASE_URL}/${VALID_CUID}/download`, {
      token: "wrong",
    });
    const res = await GET(req, buildParams(VALID_CUID));
    expect(res.status).toBe(404);
    const text = await res.text();
    expect(text).toBe("Not found");
  });

  // --- Trashed filter ---
  it("calls findFirst with isTrashed: false", async () => {
    vi.mocked(prisma.quote.findFirst).mockResolvedValue(null);
    const req = buildGetRequest(`${BASE_URL}/${VALID_CUID}/download`, {
      token: VALID_TOKEN,
    });
    await GET(req, buildParams(VALID_CUID));
    expect(prisma.quote.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isTrashed: false }),
      }),
    );
  });

  it("wraps DB call in withRetry", async () => {
    const { withRetry } = await import("@/lib/db-retry");
    vi.mocked(prisma.quote.findFirst).mockResolvedValue(null);
    const req = buildGetRequest(`${BASE_URL}/${VALID_CUID}/download`, {
      token: VALID_TOKEN,
    });
    await GET(req, buildParams(VALID_CUID));
    expect(withRetry).toHaveBeenCalledTimes(1);
  });

  // --- Cached PDF ---
  it("returns PDF with correct headers for public route", async () => {
    vi.mocked(prisma.quote.findFirst).mockResolvedValue(quoteFixture() as any);
    mockFetch.mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "application/pdf" }),
      body: new ReadableStream(),
    });
    const req = buildGetRequest(`${BASE_URL}/${VALID_CUID}/download`, {
      token: VALID_TOKEN,
    });
    const res = await GET(req, buildParams(VALID_CUID));
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toContain("attachment");
    const expectedSuffix = VALID_CUID.slice(-6);
    expect(res.headers.get("Content-Disposition")).toContain(
      `quote-${expectedSuffix}.pdf`,
    );
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://utfs.io/f/cached.pdf",
      expect.objectContaining({ redirect: "error", signal: expect.any(AbortSignal) }),
    );
  });

  // --- No PDF — waiting page ---
  it("returns 202 HTML when no pdfUrl", async () => {
    vi.mocked(prisma.quote.findFirst).mockResolvedValue(
      quoteFixture({ pdfUrl: null, updatedAt: new Date() }) as any,
    );
    const req = buildGetRequest(`${BASE_URL}/${VALID_CUID}/download`, {
      token: VALID_TOKEN,
    });
    const res = await GET(req, buildParams(VALID_CUID));
    expect(res.status).toBe(202);
    expect(res.headers.get("Content-Type")).toContain("text/html");
  });

  it("includes Retry-After: 5 when no pdfUrl", async () => {
    vi.mocked(prisma.quote.findFirst).mockResolvedValue(
      quoteFixture({ pdfUrl: null, updatedAt: new Date() }) as any,
    );
    const req = buildGetRequest(`${BASE_URL}/${VALID_CUID}/download`, {
      token: VALID_TOKEN,
    });
    const res = await GET(req, buildParams(VALID_CUID));
    expect(res.headers.get("Retry-After")).toBe("5");
  });

  it("triggers inngest recovery when updated <5min ago", async () => {
    vi.mocked(prisma.quote.findFirst).mockResolvedValue(
      quoteFixture({ pdfUrl: null, updatedAt: new Date() }) as any,
    );
    const req = buildGetRequest(`${BASE_URL}/${VALID_CUID}/download`, {
      token: VALID_TOKEN,
    });
    await GET(req, buildParams(VALID_CUID));
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "pdf/generate-quote",
        data: { quoteId: VALID_CUID, companyId: 100 },
      }),
    );
  });

  it("skips inngest when updated >5min ago", async () => {
    const oldDate = new Date(Date.now() - 600_000); // 10 min ago
    vi.mocked(prisma.quote.findFirst).mockResolvedValue(
      quoteFixture({ pdfUrl: null, updatedAt: oldDate }) as any,
    );
    const req = buildGetRequest(`${BASE_URL}/${VALID_CUID}/download`, {
      token: VALID_TOKEN,
    });
    await GET(req, buildParams(VALID_CUID));
    expect(inngest.send).not.toHaveBeenCalled();
  });

  it("includes x-nonce in HTML response", async () => {
    const mockNonce = "test-nonce-123";
    vi.mocked(headers).mockResolvedValue({
      get: vi.fn().mockReturnValue(mockNonce),
    } as any);
    vi.mocked(prisma.quote.findFirst).mockResolvedValue(
      quoteFixture({ pdfUrl: null, updatedAt: new Date() }) as any,
    );
    const req = buildGetRequest(`${BASE_URL}/${VALID_CUID}/download`, {
      token: VALID_TOKEN,
    });
    const res = await GET(req, buildParams(VALID_CUID));
    const html = await res.text();
    expect(html).toContain(mockNonce);
  });

  it("returns 202 HTML even when inngest.send rejects", async () => {
    vi.mocked(prisma.quote.findFirst).mockResolvedValue(
      quoteFixture({ pdfUrl: null, updatedAt: new Date() }) as any,
    );
    vi.mocked(inngest.send).mockRejectedValue(new Error("Inngest down"));
    const req = buildGetRequest(`${BASE_URL}/${VALID_CUID}/download`, {
      token: VALID_TOKEN,
    });
    const res = await GET(req, buildParams(VALID_CUID));
    expect(res.status).toBe(202);
    expect(res.headers.get("Content-Type")).toContain("text/html");
  });

  // --- SSRF ---
  it("returns 500 when isSafeStorageUrl fails", async () => {
    vi.mocked(prisma.quote.findFirst).mockResolvedValue(
      quoteFixture({ pdfUrl: "https://evil.com/bad.pdf" }) as any,
    );
    vi.mocked(isSafeStorageUrl).mockReturnValue(false);
    const req = buildGetRequest(`${BASE_URL}/${VALID_CUID}/download`, {
      token: VALID_TOKEN,
    });
    const res = await GET(req, buildParams(VALID_CUID));
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ status: "error" });
    expect(isSafeStorageUrl).toHaveBeenCalledWith("https://evil.com/bad.pdf");
  });

  // --- Stale URL ---
  it("returns 202 and clears pdfUrl when content-type is not PDF", async () => {
    vi.mocked(prisma.quote.findFirst).mockResolvedValue(quoteFixture() as any);
    mockFetch.mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "text/html" }),
      body: "not a pdf",
    });
    const req = buildGetRequest(`${BASE_URL}/${VALID_CUID}/download`, {
      token: VALID_TOKEN,
    });
    const res = await GET(req, buildParams(VALID_CUID));
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ status: "generating" });
    expect(prisma.quote.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ pdfUrl: "https://utfs.io/f/cached.pdf" }),
        data: { pdfUrl: null },
      }),
    );
  });

  it("stale URL updateMany uses WHERE without companyId", async () => {
    vi.mocked(prisma.quote.findFirst).mockResolvedValue(quoteFixture() as any);
    mockFetch.mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "text/html" }),
      body: "not a pdf",
    });
    const req = buildGetRequest(`${BASE_URL}/${VALID_CUID}/download`, {
      token: VALID_TOKEN,
    });
    await GET(req, buildParams(VALID_CUID));
    expect(prisma.quote.updateMany).toHaveBeenCalledTimes(1);
    const call = vi.mocked(prisma.quote.updateMany).mock.calls[0][0];
    expect(call?.where).not.toHaveProperty("companyId");
  });

  it("triggers regen on stale URL", async () => {
    vi.mocked(prisma.quote.findFirst).mockResolvedValue(quoteFixture() as any);
    mockFetch.mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "text/html" }),
      body: "not a pdf",
    });
    const req = buildGetRequest(`${BASE_URL}/${VALID_CUID}/download`, {
      token: VALID_TOKEN,
    });
    await GET(req, buildParams(VALID_CUID));
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "pdf/generate-quote",
        data: { quoteId: VALID_CUID, companyId: 100 },
      }),
    );
  });

  // --- Storage 404 ---
  it("clears pdfUrl and triggers regen on storage 404", async () => {
    vi.mocked(prisma.quote.findFirst).mockResolvedValue(quoteFixture() as any);
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      headers: new Headers(),
    });
    const req = buildGetRequest(`${BASE_URL}/${VALID_CUID}/download`, {
      token: VALID_TOKEN,
    });
    await GET(req, buildParams(VALID_CUID));
    expect(prisma.quote.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ pdfUrl: "https://utfs.io/f/cached.pdf" }),
        data: { pdfUrl: null },
      }),
    );
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "pdf/generate-quote",
        data: { quoteId: VALID_CUID, companyId: 100 },
      }),
    );
    const call = vi.mocked(prisma.quote.updateMany).mock.calls[0][0];
    expect(call?.where).not.toHaveProperty("companyId");
  });

  it("returns 502 after storage 404", async () => {
    vi.mocked(prisma.quote.findFirst).mockResolvedValue(quoteFixture() as any);
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      headers: new Headers(),
    });
    const req = buildGetRequest(`${BASE_URL}/${VALID_CUID}/download`, {
      token: VALID_TOKEN,
    });
    const res = await GET(req, buildParams(VALID_CUID));
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ status: "not_ready" });
  });

  // --- Storage 5xx / fetch throws ---
  it("returns 502 on storage 5xx without clearing pdfUrl", async () => {
    vi.mocked(prisma.quote.findFirst).mockResolvedValue(quoteFixture() as any);
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers(),
    });
    const req = buildGetRequest(`${BASE_URL}/${VALID_CUID}/download`, {
      token: VALID_TOKEN,
    });
    const res = await GET(req, buildParams(VALID_CUID));
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ status: "not_ready" });
    expect(prisma.quote.updateMany).not.toHaveBeenCalled();
    expect(inngest.send).not.toHaveBeenCalled();
  });

  it("returns 502 when fetch throws without clearing pdfUrl", async () => {
    vi.mocked(prisma.quote.findFirst).mockResolvedValue(quoteFixture() as any);
    mockFetch.mockRejectedValue(new Error("Network error"));
    const req = buildGetRequest(`${BASE_URL}/${VALID_CUID}/download`, {
      token: VALID_TOKEN,
    });
    const res = await GET(req, buildParams(VALID_CUID));
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ status: "not_ready" });
    expect(prisma.quote.updateMany).not.toHaveBeenCalled();
    expect(inngest.send).not.toHaveBeenCalled();
  });
});

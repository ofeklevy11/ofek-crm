import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// --- Mocks ---
vi.mock("@/lib/permissions-server", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    quote: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(),
  RATE_LIMITS: {
    quoteRead: { prefix: "qt-read", max: 60, windowSeconds: 60 },
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

vi.mock("@/lib/pdf-fonts", () => ({
  registerFonts: vi.fn(),
}));

vi.mock("@react-pdf/renderer", () => ({
  renderToStream: vi.fn(),
}));

vi.mock("@/components/pdf/QuotePdfTemplate", () => ({
  default: vi.fn(),
}));

// --- Imports ---
import { GET } from "@/app/api/quotes/[id]/download/route";
import { getCurrentUser } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { inngest } from "@/lib/inngest/client";
import { isSafeStorageUrl } from "@/lib/security/safe-hosts";
import { renderToStream } from "@react-pdf/renderer";
import { registerFonts } from "@/lib/pdf-fonts";
import { buildGetRequest, buildParams } from "@/tests/helpers/finance-mocks";

// --- Fixtures ---
const VALID_CUID = "clh4n7r0v000008l5c2h6d3e7";
const BASE_URL = "http://localhost:3000/api/quotes";

const adminUser = {
  id: 1,
  companyId: 100,
  name: "Admin",
  email: "admin@test.com",
  role: "admin" as const,
  allowedWriteTableIds: [] as number[],
  permissions: {} as Record<string, boolean>,
};

const basicUserCanViewQuotes = {
  id: 2,
  companyId: 100,
  name: "Viewer",
  email: "viewer@test.com",
  role: "basic" as const,
  allowedWriteTableIds: [] as number[],
  permissions: { canViewQuotes: true } as Record<string, boolean>,
};

const basicUserNoPerms = {
  id: 3,
  companyId: 100,
  name: "NoPerms",
  email: "none@test.com",
  role: "basic" as const,
  allowedWriteTableIds: [] as number[],
  permissions: {} as Record<string, boolean>,
};

function quoteFixture(overrides: Record<string, any> = {}) {
  return {
    id: VALID_CUID,
    companyId: 100,
    pdfUrl: null,
    items: [],
    company: { name: "Test Co" },
    ...overrides,
  };
}

const mockFetch = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(checkRateLimit).mockResolvedValue(null);
  vi.mocked(inngest.send).mockResolvedValue(undefined as any);
  vi.mocked(isSafeStorageUrl).mockReturnValue(true);
  vi.stubGlobal("fetch", mockFetch);
});

// ─── GET /api/quotes/[id]/download ─────────────────────────────────────────
describe("GET /api/quotes/[id]/download", () => {
  // --- Auth ---
  it("returns 401 when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const req = buildGetRequest(`${BASE_URL}/${VALID_CUID}/download`);
    const res = await GET(req, buildParams(VALID_CUID));
    expect(res.status).toBe(401);
    expect(await res.text()).toBe("Unauthorized");
  });

  it("returns 403 when user lacks canViewQuotes", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserNoPerms as any);
    const req = buildGetRequest(`${BASE_URL}/${VALID_CUID}/download`);
    const res = await GET(req, buildParams(VALID_CUID));
    expect(res.status).toBe(403);
    expect(await res.text()).toBe("Forbidden");
  });

  it("returns 200 for basic user with canViewQuotes", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserCanViewQuotes as any);
    vi.mocked(prisma.quote.findUnique).mockResolvedValue(
      quoteFixture({ pdfUrl: "https://utfs.io/f/abc.pdf" }) as any,
    );
    mockFetch.mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "application/pdf" }),
      body: new ReadableStream(),
    });
    const req = buildGetRequest(`${BASE_URL}/${VALID_CUID}/download`);
    const res = await GET(req, buildParams(VALID_CUID));
    expect(res.status).toBe(200);
  });

  // --- Rate limit ---
  it("returns 429 when rate limited", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(checkRateLimit).mockResolvedValue(
      NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 }),
    );
    const req = buildGetRequest(`${BASE_URL}/${VALID_CUID}/download`);
    const res = await GET(req, buildParams(VALID_CUID));
    expect(res.status).toBe(429);
  });

  it("calls checkRateLimit with correct args", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.quote.findUnique).mockResolvedValue(null);
    const req = buildGetRequest(`${BASE_URL}/${VALID_CUID}/download`);
    await GET(req, buildParams(VALID_CUID));
    expect(checkRateLimit).toHaveBeenCalledWith(
      "1",
      expect.objectContaining({ prefix: "qt-read" }),
    );
  });

  // --- Validation ---
  it("returns 400 for invalid CUID", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const req = buildGetRequest(`${BASE_URL}/bad-id/download`);
    const res = await GET(req, buildParams("bad-id"));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("Invalid quote ID");
  });

  it("returns 400 for empty id", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const req = buildGetRequest(`${BASE_URL}//download`);
    const res = await GET(req, buildParams(""));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("Invalid quote ID");
  });

  // --- 404 ---
  it("returns 404 when quote not found", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.quote.findUnique).mockResolvedValue(null);
    const req = buildGetRequest(`${BASE_URL}/${VALID_CUID}/download`);
    const res = await GET(req, buildParams(VALID_CUID));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Quote not found");
  });

  it("scopes findUnique to companyId", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.quote.findUnique).mockResolvedValue(null);
    const req = buildGetRequest(`${BASE_URL}/${VALID_CUID}/download`);
    await GET(req, buildParams(VALID_CUID));
    expect(prisma.quote.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: VALID_CUID, companyId: 100 },
      }),
    );
  });

  it("wraps DB call in withRetry", async () => {
    const { withRetry } = await import("@/lib/db-retry");
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.quote.findUnique).mockResolvedValue(null);
    const req = buildGetRequest(`${BASE_URL}/${VALID_CUID}/download`);
    await GET(req, buildParams(VALID_CUID));
    expect(withRetry).toHaveBeenCalledTimes(1);
  });

  // --- Cached PDF happy path ---
  it("returns PDF with correct headers when cached", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.quote.findUnique).mockResolvedValue(
      quoteFixture({ pdfUrl: "https://utfs.io/f/abc.pdf" }) as any,
    );
    mockFetch.mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "application/pdf" }),
      body: new ReadableStream(),
    });
    const req = buildGetRequest(`${BASE_URL}/${VALID_CUID}/download`);
    const res = await GET(req, buildParams(VALID_CUID));
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toContain("attachment");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://utfs.io/f/abc.pdf",
      expect.objectContaining({ redirect: "error", signal: expect.any(AbortSignal) }),
    );
  });

  // --- SSRF ---
  it("returns 500 when isSafeStorageUrl returns false", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.quote.findUnique).mockResolvedValue(
      quoteFixture({ pdfUrl: "https://evil.com/bad.pdf" }) as any,
    );
    vi.mocked(isSafeStorageUrl).mockReturnValue(false);
    const req = buildGetRequest(`${BASE_URL}/${VALID_CUID}/download`);
    const res = await GET(req, buildParams(VALID_CUID));
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ status: "error" });
    expect(isSafeStorageUrl).toHaveBeenCalledWith("https://evil.com/bad.pdf");
  });

  // --- Stale URL ---
  it("returns 202 and clears pdfUrl when content-type is not PDF", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.quote.findUnique).mockResolvedValue(
      quoteFixture({ pdfUrl: "https://utfs.io/f/abc.pdf" }) as any,
    );
    mockFetch.mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "text/html" }),
      body: "not a pdf",
    });
    vi.mocked(prisma.quote.updateMany).mockResolvedValue({ count: 1 });
    const req = buildGetRequest(`${BASE_URL}/${VALID_CUID}/download`);
    const res = await GET(req, buildParams(VALID_CUID));
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ status: "generating" });
    expect(prisma.quote.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ companyId: 100, pdfUrl: "https://utfs.io/f/abc.pdf" }),
        data: { pdfUrl: null },
      }),
    );
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "pdf/generate-quote",
        data: { quoteId: VALID_CUID, companyId: 100 },
      }),
    );
  });

  // --- Storage 404 ---
  it("clears pdfUrl and triggers regen on storage 404, falls through to inline render", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.quote.findUnique).mockResolvedValue(
      quoteFixture({ pdfUrl: "https://utfs.io/f/abc.pdf" }) as any,
    );
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      headers: new Headers(),
    });
    vi.mocked(prisma.quote.updateMany).mockResolvedValue({ count: 1 });

    // Mock inline render to succeed (falls through to it after 404)
    const mockStream = {
      [Symbol.asyncIterator]: async function* () {
        yield Buffer.from("pdf-content");
      },
    };
    vi.mocked(renderToStream).mockResolvedValue(mockStream as any);

    const req = buildGetRequest(`${BASE_URL}/${VALID_CUID}/download`);
    const res = await GET(req, buildParams(VALID_CUID));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(prisma.quote.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ companyId: 100, pdfUrl: "https://utfs.io/f/abc.pdf" }),
        data: { pdfUrl: null },
      }),
    );
    expect(registerFonts).toHaveBeenCalled();
    expect(inngest.send).toHaveBeenCalledTimes(2);
    // First call: storage-404 regen trigger
    expect(inngest.send).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        name: "pdf/generate-quote",
        data: { quoteId: VALID_CUID, companyId: 100 },
      }),
    );
    // Second call: inline render background cache trigger
    expect(inngest.send).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        name: "pdf/generate-quote",
        data: { quoteId: VALID_CUID, companyId: 100 },
      }),
    );
  });

  // --- Storage 5xx ---
  it("returns 502 on storage 5xx without clearing pdfUrl", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.quote.findUnique).mockResolvedValue(
      quoteFixture({ pdfUrl: "https://utfs.io/f/abc.pdf" }) as any,
    );
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers(),
    });
    const req = buildGetRequest(`${BASE_URL}/${VALID_CUID}/download`);
    const res = await GET(req, buildParams(VALID_CUID));
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ status: "error" });
    expect(prisma.quote.updateMany).not.toHaveBeenCalled();
    expect(inngest.send).not.toHaveBeenCalled();
  });

  // --- Fetch throws ---
  it("returns 502 when fetch throws without clearing pdfUrl", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.quote.findUnique).mockResolvedValue(
      quoteFixture({ pdfUrl: "https://utfs.io/f/abc.pdf" }) as any,
    );
    mockFetch.mockRejectedValue(new Error("Network error"));
    const req = buildGetRequest(`${BASE_URL}/${VALID_CUID}/download`);
    const res = await GET(req, buildParams(VALID_CUID));
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ status: "error" });
    expect(prisma.quote.updateMany).not.toHaveBeenCalled();
    expect(inngest.send).not.toHaveBeenCalled();
  });

  // --- Inline render happy path ---
  it("renders PDF inline when no pdfUrl", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.quote.findUnique).mockResolvedValue(
      quoteFixture({ pdfUrl: null }) as any,
    );
    const mockStream = {
      [Symbol.asyncIterator]: async function* () {
        yield Buffer.from("pdf-content");
      },
    };
    vi.mocked(renderToStream).mockResolvedValue(mockStream as any);
    const req = buildGetRequest(`${BASE_URL}/${VALID_CUID}/download`);
    const res = await GET(req, buildParams(VALID_CUID));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(registerFonts).toHaveBeenCalled();
    const expectedSuffix = VALID_CUID.slice(-6);
    expect(res.headers.get("Content-Disposition")).toContain(
      `quote-${expectedSuffix}.pdf`,
    );
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "pdf/generate-quote",
        data: { quoteId: VALID_CUID, companyId: 100 },
      }),
    );
  });

  // --- Inline render failure ---
  it("returns 202 and triggers fallback when inline render fails", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.quote.findUnique).mockResolvedValue(
      quoteFixture({ pdfUrl: null }) as any,
    );
    vi.mocked(renderToStream).mockRejectedValue(new Error("Render failed"));
    const req = buildGetRequest(`${BASE_URL}/${VALID_CUID}/download`);
    const res = await GET(req, buildParams(VALID_CUID));
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ status: "generating" });
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "pdf/generate-quote",
        data: { quoteId: VALID_CUID, companyId: 100 },
      }),
    );
  });

  // --- Inngest resilience ---
  it("returns 200 even when inngest.send rejects (fire-and-forget)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.quote.findUnique).mockResolvedValue(
      quoteFixture({ pdfUrl: null }) as any,
    );
    const mockStream = {
      [Symbol.asyncIterator]: async function* () {
        yield Buffer.from("pdf");
      },
    };
    vi.mocked(renderToStream).mockResolvedValue(mockStream as any);
    vi.mocked(inngest.send).mockRejectedValue(new Error("Inngest down"));
    const req = buildGetRequest(`${BASE_URL}/${VALID_CUID}/download`);
    const res = await GET(req, buildParams(VALID_CUID));
    expect(res.status).toBe(200);
  });

  // --- Filename ---
  it("generates filename from last 6 chars of quote ID", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.quote.findUnique).mockResolvedValue(
      quoteFixture({ pdfUrl: "https://utfs.io/f/abc.pdf" }) as any,
    );
    mockFetch.mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "application/pdf" }),
      body: new ReadableStream(),
    });
    const req = buildGetRequest(`${BASE_URL}/${VALID_CUID}/download`);
    const res = await GET(req, buildParams(VALID_CUID));
    const expectedSuffix = VALID_CUID.slice(-6);
    expect(res.headers.get("Content-Disposition")).toContain(
      `quote-${expectedSuffix}.pdf`,
    );
  });
});

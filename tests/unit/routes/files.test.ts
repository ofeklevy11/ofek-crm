import { vi, describe, it, expect, beforeEach } from "vitest";
import { NextResponse } from "next/server";

/* ------------------------------------------------------------------ */
/*  Module mocks                                                       */
/* ------------------------------------------------------------------ */

vi.mock("@/lib/permissions-server", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/permissions", async () => {
  const actual = await vi.importActual("@/lib/permissions");
  return actual;
});

const prismaMock = {
  file: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
};

vi.mock("@/lib/prisma", () => ({
  get prisma() {
    return prismaMock;
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(null),
  RATE_LIMITS: {
    fileRead: { prefix: "file-read", max: 60, windowSeconds: 60 },
    fileMutation: { prefix: "file-mut", max: 30, windowSeconds: 60 },
  },
}));

vi.mock("@/lib/security/safe-hosts", () => ({
  isSafeStorageUrl: vi.fn().mockReturnValue(true),
}));

/* ------------------------------------------------------------------ */
/*  Imports (after mocks)                                              */
/* ------------------------------------------------------------------ */

import { PUT } from "@/app/api/files/[id]/route";
import { GET } from "@/app/api/files/[id]/download/route";
import { getCurrentUser } from "@/lib/permissions-server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isSafeStorageUrl } from "@/lib/security/safe-hosts";
import { NextRequest } from "next/server";

const mockGetCurrentUser = getCurrentUser as ReturnType<typeof vi.fn>;
const mockCheckRateLimit = checkRateLimit as ReturnType<typeof vi.fn>;
const mockIsSafeStorageUrl = isSafeStorageUrl as ReturnType<typeof vi.fn>;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeUser(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    companyId: 1,
    name: "Test Admin",
    email: "admin@test.com",
    role: "admin" as const,
    allowedWriteTableIds: [],
    permissions: {},
    ...overrides,
  };
}

function buildParams(id: string | number) {
  return { params: Promise.resolve({ id: String(id) }) };
}

function buildJsonRequest(url: string, method: string, body: any): Request {
  return new Request(new URL(url), {
    method,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function buildBadJsonRequest(url: string, method: string): Request {
  return new Request(new URL(url), {
    method,
    body: "not-json{{{",
    headers: { "content-type": "application/json" },
  });
}

const PUT_URL = "http://localhost:3000/api/files/1";
const DL_URL = "http://localhost:3000/api/files/1/download";

const mockFile = {
  id: 1,
  name: "test.pdf",
  displayName: "My Document",
  size: 1024,
  type: "application/pdf",
  folderId: null,
  recordId: null,
  createdAt: new Date("2025-01-01"),
  updatedAt: new Date("2025-01-01"),
};

/* ------------------------------------------------------------------ */
/*  Setup                                                              */
/* ------------------------------------------------------------------ */

let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCurrentUser.mockResolvedValue(makeUser());
  mockCheckRateLimit.mockResolvedValue(null);
  mockIsSafeStorageUrl.mockReturnValue(true);
  prismaMock.file.findFirst.mockResolvedValue(null);
  prismaMock.file.update.mockResolvedValue(mockFile);

  // Stub global fetch for download route
  mockFetch = vi.fn();
  vi.stubGlobal("fetch", mockFetch);
});

/* ================================================================== */
/*  PUT /api/files/[id]                                                */
/* ================================================================== */

describe("PUT /api/files/[id]", () => {
  // --- Validation ---

  it("returns 400 for non-numeric ID", async () => {
    const req = buildJsonRequest(PUT_URL, "PUT", { displayName: "x" });
    const res = await PUT(req, buildParams("abc"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid file ID");
    expect(prismaMock.file.update).not.toHaveBeenCalled();
  });

  it("returns 400 for zero ID", async () => {
    const req = buildJsonRequest(PUT_URL, "PUT", { displayName: "x" });
    const res = await PUT(req, buildParams(0));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid file ID");
    expect(prismaMock.file.update).not.toHaveBeenCalled();
  });

  it("returns 400 for negative ID", async () => {
    const req = buildJsonRequest(PUT_URL, "PUT", { displayName: "x" });
    const res = await PUT(req, buildParams(-5));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid file ID");
    expect(prismaMock.file.update).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = buildBadJsonRequest(PUT_URL, "PUT");
    const res = await PUT(req, buildParams(1));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid JSON body");
    expect(prismaMock.file.update).not.toHaveBeenCalled();
  });

  it("returns 400 for non-string displayName", async () => {
    const req = buildJsonRequest(PUT_URL, "PUT", { displayName: 123 });
    const res = await PUT(req, buildParams(1));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid display name");
    expect(prismaMock.file.update).not.toHaveBeenCalled();
  });

  it("returns 400 for displayName exceeding 255 chars", async () => {
    const req = buildJsonRequest(PUT_URL, "PUT", {
      displayName: "x".repeat(256),
    });
    const res = await PUT(req, buildParams(1));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid display name");
    expect(prismaMock.file.update).not.toHaveBeenCalled();
  });

  // --- Auth ---

  it("returns 401 when user is not authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const req = buildJsonRequest(PUT_URL, "PUT", { displayName: "x" });
    const res = await PUT(req, buildParams(1));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Unauthorized");
    expect(prismaMock.file.update).not.toHaveBeenCalled();
  });

  it("returns 403 when user lacks canViewFiles", async () => {
    mockGetCurrentUser.mockResolvedValue(
      makeUser({ role: "basic", permissions: {} }),
    );
    const req = buildJsonRequest(PUT_URL, "PUT", { displayName: "x" });
    const res = await PUT(req, buildParams(1));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("Forbidden");
    expect(prismaMock.file.update).not.toHaveBeenCalled();
  });

  // --- Rate limit ---

  it("returns 429 when rate limited", async () => {
    mockCheckRateLimit.mockResolvedValue(
      NextResponse.json({ error: "Too many requests" }, { status: 429 }),
    );
    const req = buildJsonRequest(PUT_URL, "PUT", { displayName: "x" });
    const res = await PUT(req, buildParams(1));
    expect(res.status).toBe(429);
    expect(prismaMock.file.update).not.toHaveBeenCalled();
  });

  it("uses fileMutation rate limit key", async () => {
    const req = buildJsonRequest(PUT_URL, "PUT", { displayName: "x" });
    await PUT(req, buildParams(1));
    expect(mockCheckRateLimit).toHaveBeenCalledWith("1", RATE_LIMITS.fileMutation);
  });

  // --- Not found ---

  it("returns 404 when file not found (P2025)", async () => {
    const prismaError = new Error("Record not found") as any;
    prismaError.code = "P2025";
    prismaMock.file.update.mockRejectedValue(prismaError);

    const req = buildJsonRequest(PUT_URL, "PUT", { displayName: "Renamed" });
    const res = await PUT(req, buildParams(1));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("File not found");
  });

  // --- Server error ---

  it("returns 500 on unexpected DB error", async () => {
    prismaMock.file.update.mockRejectedValue(new Error("DB down"));

    const req = buildJsonRequest(PUT_URL, "PUT", { displayName: "x" });
    const res = await PUT(req, buildParams(1));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("Failed to update file");
  });

  // --- Happy path ---

  it("returns updated file with downloadUrl", async () => {
    prismaMock.file.update.mockResolvedValue(mockFile);

    const req = buildJsonRequest(PUT_URL, "PUT", { displayName: "New Name" });
    const res = await PUT(req, buildParams(1));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      id: mockFile.id,
      name: mockFile.name,
      displayName: mockFile.displayName,
      size: mockFile.size,
      type: mockFile.type,
      folderId: mockFile.folderId,
      recordId: mockFile.recordId,
      createdAt: mockFile.createdAt.toISOString(),
      updatedAt: mockFile.updatedAt.toISOString(),
      downloadUrl: "/api/files/1/download",
    });
  });

  it("trims displayName before saving", async () => {
    const req = buildJsonRequest(PUT_URL, "PUT", {
      displayName: "  trimmed  ",
    });
    await PUT(req, buildParams(1));
    expect(prismaMock.file.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { displayName: "trimmed" },
      }),
    );
  });

  it("allows null displayName", async () => {
    const req = buildJsonRequest(PUT_URL, "PUT", { displayName: null });
    const res = await PUT(req, buildParams(1));
    expect(res.status).toBe(200);
    expect(prismaMock.file.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { displayName: null },
      }),
    );
  });

  it("allows undefined displayName", async () => {
    const req = buildJsonRequest(PUT_URL, "PUT", {});
    const res = await PUT(req, buildParams(1));
    expect(res.status).toBe(200);
    expect(prismaMock.file.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { displayName: null },
      }),
    );
  });

  it("converts empty-after-trim displayName to null", async () => {
    const req = buildJsonRequest(PUT_URL, "PUT", { displayName: "   " });
    await PUT(req, buildParams(1));
    expect(prismaMock.file.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { displayName: null },
      }),
    );
  });

  it("includes companyId in WHERE clause", async () => {
    const req = buildJsonRequest(PUT_URL, "PUT", { displayName: "x" });
    await PUT(req, buildParams(5));
    expect(prismaMock.file.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 5, companyId: 1 },
      }),
    );
  });

  it("allows basic user with canViewFiles permission", async () => {
    mockGetCurrentUser.mockResolvedValue(
      makeUser({ role: "basic", permissions: { canViewFiles: true } }),
    );
    prismaMock.file.update.mockResolvedValue(mockFile);

    const req = buildJsonRequest(PUT_URL, "PUT", { displayName: "x" });
    const res = await PUT(req, buildParams(1));
    expect(res.status).toBe(200);
  });

  it("accepts displayName at exactly 255 chars", async () => {
    const req = buildJsonRequest(PUT_URL, "PUT", {
      displayName: "a".repeat(255),
    });
    const res = await PUT(req, buildParams(1));
    expect(res.status).toBe(200);
  });

  it("uses explicit select clause to prevent data exposure", async () => {
    const req = buildJsonRequest(PUT_URL, "PUT", { displayName: "x" });
    await PUT(req, buildParams(1));
    expect(prismaMock.file.update).toHaveBeenCalledWith(
      expect.objectContaining({
        select: {
          id: true,
          name: true,
          displayName: true,
          size: true,
          type: true,
          folderId: true,
          recordId: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    );
  });
});

/* ================================================================== */
/*  GET /api/files/[id]/download                                       */
/* ================================================================== */

describe("GET /api/files/[id]/download", () => {
  const mockDbFile = {
    url: "https://utfs.io/f/abc123",
    type: "application/pdf",
    name: "report.pdf",
    displayName: "Annual Report",
  };

  function makeUpstreamResponse(overrides: Record<string, any> = {}) {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("file-bytes"));
        controller.close();
      },
    });
    return {
      ok: true,
      body,
      headers: new Headers({ "content-length": "1024" }),
      ...overrides,
    };
  }

  beforeEach(() => {
    prismaMock.file.findFirst.mockResolvedValue(mockDbFile);
    mockFetch.mockResolvedValue(makeUpstreamResponse());
  });

  // --- Validation ---

  it("returns 400 for non-numeric ID", async () => {
    const req = new NextRequest(new URL(DL_URL));
    const res = await GET(req, buildParams("abc"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid file ID");
    expect(prismaMock.file.findFirst).not.toHaveBeenCalled();
  });

  it("returns 400 for zero ID", async () => {
    const req = new NextRequest(new URL(DL_URL));
    const res = await GET(req, buildParams(0));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid file ID");
    expect(prismaMock.file.findFirst).not.toHaveBeenCalled();
  });

  it("returns 400 for negative ID", async () => {
    const req = new NextRequest(new URL(DL_URL));
    const res = await GET(req, buildParams(-5));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid file ID");
    expect(prismaMock.file.findFirst).not.toHaveBeenCalled();
  });

  // --- Auth ---

  it("returns 401 when user is not authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const req = new NextRequest(new URL(DL_URL));
    const res = await GET(req, buildParams(1));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Unauthorized");
    expect(prismaMock.file.findFirst).not.toHaveBeenCalled();
  });

  it("returns 403 when user lacks canViewFiles", async () => {
    mockGetCurrentUser.mockResolvedValue(
      makeUser({ role: "basic", permissions: {} }),
    );
    const req = new NextRequest(new URL(DL_URL));
    const res = await GET(req, buildParams(1));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("Forbidden");
    expect(prismaMock.file.findFirst).not.toHaveBeenCalled();
  });

  // --- Rate limit ---

  it("returns 429 when rate limited", async () => {
    mockCheckRateLimit.mockResolvedValue(
      NextResponse.json({ error: "Too many requests" }, { status: 429 }),
    );
    const req = new NextRequest(new URL(DL_URL));
    const res = await GET(req, buildParams(1));
    expect(res.status).toBe(429);
    expect(prismaMock.file.findFirst).not.toHaveBeenCalled();
  });

  it("uses fileRead rate limit key", async () => {
    const req = new NextRequest(new URL(DL_URL));
    await GET(req, buildParams(1));
    expect(mockCheckRateLimit).toHaveBeenCalledWith("1", RATE_LIMITS.fileRead);
  });

  // --- Not found ---

  it("returns 404 when file not found", async () => {
    prismaMock.file.findFirst.mockResolvedValue(null);
    const req = new NextRequest(new URL(DL_URL));
    const res = await GET(req, buildParams(1));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("File not found or access denied");
    expect(mockIsSafeStorageUrl).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // --- SSRF protection ---

  it("passes file URL to isSafeStorageUrl", async () => {
    const req = new NextRequest(new URL(DL_URL));
    await GET(req, buildParams(1));
    expect(mockIsSafeStorageUrl).toHaveBeenCalledWith("https://utfs.io/f/abc123");
  });

  it("returns 500 when URL is unsafe (SSRF protection)", async () => {
    mockIsSafeStorageUrl.mockReturnValue(false);
    const req = new NextRequest(new URL(DL_URL));
    const res = await GET(req, buildParams(1));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("File storage error");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // --- Upstream fetch errors ---

  it("returns 502 when upstream fetch returns !ok", async () => {
    mockFetch.mockResolvedValue(
      makeUpstreamResponse({ ok: false, status: 403 }),
    );
    const req = new NextRequest(new URL(DL_URL));
    const res = await GET(req, buildParams(1));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("Failed to fetch file from storage");
  });

  it("returns 500 when fetch throws", async () => {
    mockFetch.mockRejectedValue(new Error("Network failure"));
    const req = new NextRequest(new URL(DL_URL));
    const res = await GET(req, buildParams(1));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("Internal server error");
  });

  // --- File too large ---

  it("returns 413 when content-length exceeds 50MB", async () => {
    mockFetch.mockResolvedValue(
      makeUpstreamResponse({
        headers: new Headers({ "content-length": "50000001" }),
      }),
    );
    const req = new NextRequest(new URL(DL_URL));
    const res = await GET(req, buildParams(1));
    expect(res.status).toBe(413);
    expect((await res.json()).error).toBe("File too large");
  });

  it("allows file at exactly 50MB", async () => {
    mockFetch.mockResolvedValue(
      makeUpstreamResponse({
        headers: new Headers({ "content-length": "50000000" }),
      }),
    );
    const req = new NextRequest(new URL(DL_URL));
    const res = await GET(req, buildParams(1));
    expect(res.status).toBe(200);
    expect(res.body).toBeInstanceOf(ReadableStream);
    expect(res.headers.get("content-length")).toBe("50000000");
  });

  // --- Happy path ---

  it("streams body from upstream response", async () => {
    const req = new NextRequest(new URL(DL_URL));
    const res = await GET(req, buildParams(1));
    expect(res.status).toBe(200);
    expect(res.body).toBeInstanceOf(ReadableStream);
  });

  it("sets correct Content-Type header from file type", async () => {
    const req = new NextRequest(new URL(DL_URL));
    const res = await GET(req, buildParams(1));
    expect(res.headers.get("content-type")).toBe("application/pdf");
  });

  it("sets Content-Disposition with displayName when available", async () => {
    const req = new NextRequest(new URL(DL_URL));
    const res = await GET(req, buildParams(1));
    const disposition = res.headers.get("content-disposition")!;
    expect(disposition).toBe(
      `attachment; filename="Annual%20Report"; filename*=UTF-8''Annual%20Report`,
    );
  });

  it("falls back to name when displayName is null", async () => {
    prismaMock.file.findFirst.mockResolvedValue({
      ...mockDbFile,
      displayName: null,
    });
    const req = new NextRequest(new URL(DL_URL));
    const res = await GET(req, buildParams(1));
    const disposition = res.headers.get("content-disposition")!;
    expect(disposition).toBe(
      `attachment; filename="report.pdf"; filename*=UTF-8''report.pdf`,
    );
  });

  it("sets Cache-Control header", async () => {
    const req = new NextRequest(new URL(DL_URL));
    const res = await GET(req, buildParams(1));
    expect(res.headers.get("cache-control")).toBe("private, max-age=3600");
  });

  it("sets X-Content-Type-Options nosniff header", async () => {
    const req = new NextRequest(new URL(DL_URL));
    const res = await GET(req, buildParams(1));
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("forwards Content-Length from upstream", async () => {
    const req = new NextRequest(new URL(DL_URL));
    const res = await GET(req, buildParams(1));
    expect(res.headers.get("content-length")).toBe("1024");
  });

  it("does not set Content-Length when upstream omits it", async () => {
    mockFetch.mockResolvedValue(
      makeUpstreamResponse({ headers: new Headers() }),
    );
    const req = new NextRequest(new URL(DL_URL));
    const res = await GET(req, buildParams(1));
    expect(res.headers.get("content-length")).toBeNull();
  });

  it("calls fetch with redirect:error and timeout signal", async () => {
    const req = new NextRequest(new URL(DL_URL));
    await GET(req, buildParams(1));
    expect(mockFetch).toHaveBeenCalledWith(
      "https://utfs.io/f/abc123",
      expect.objectContaining({
        redirect: "error",
      }),
    );
    const fetchOptions = mockFetch.mock.calls[0][1];
    expect(fetchOptions.signal).toBeInstanceOf(AbortSignal);
  });

  it("queries file scoped to companyId with correct select", async () => {
    const req = new NextRequest(new URL(DL_URL));
    await GET(req, buildParams(5));
    expect(prismaMock.file.findFirst).toHaveBeenCalledWith({
      where: { id: 5, companyId: 1 },
      select: { url: true, type: true, name: true, displayName: true },
    });
  });

  it("uses application/octet-stream when file type is null", async () => {
    prismaMock.file.findFirst.mockResolvedValue({
      ...mockDbFile,
      type: null,
    });
    const req = new NextRequest(new URL(DL_URL));
    const res = await GET(req, buildParams(1));
    expect(res.headers.get("content-type")).toBe("application/octet-stream");
  });

  it("allows basic user with canViewFiles", async () => {
    mockGetCurrentUser.mockResolvedValue(
      makeUser({ role: "basic", permissions: { canViewFiles: true } }),
    );
    const req = new NextRequest(new URL(DL_URL));
    const res = await GET(req, buildParams(1));
    expect(res.status).toBe(200);
  });
});

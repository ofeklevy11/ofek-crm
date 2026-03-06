import { vi, describe, it, expect, beforeEach } from "vitest";
import {
  createMockUser,
  createPrismaMock,
  buildGetRequest,
  buildJsonRequest,
} from "@/tests/helpers/finance-mocks";

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

let prismaMock: ReturnType<typeof createPrismaMock>;

vi.mock("@/lib/prisma", () => ({
  get prisma() {
    return prismaMock;
  },
}));

vi.mock("@/lib/db-retry", () => ({
  withRetry: vi.fn((fn: any) => fn()),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(null),
  RATE_LIMITS: { api: { prefix: "api", max: 120, windowSeconds: 60 } },
}));

/* ------------------------------------------------------------------ */
/*  Imports (after mocks)                                              */
/* ------------------------------------------------------------------ */

import { GET, POST } from "@/app/api/finance/clients/route";
import { getCurrentUser } from "@/lib/permissions-server";
import { checkRateLimit } from "@/lib/rate-limit";
import { NextResponse } from "next/server";

const mockGetCurrentUser = getCurrentUser as ReturnType<typeof vi.fn>;
const mockCheckRateLimit = checkRateLimit as ReturnType<typeof vi.fn>;

const BASE_URL = "http://localhost:3000/api/finance/clients";

/* ------------------------------------------------------------------ */
/*  Setup                                                              */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock = createPrismaMock();
  mockGetCurrentUser.mockResolvedValue(createMockUser());
  mockCheckRateLimit.mockResolvedValue(null);
});

/* ================================================================== */
/*  GET /api/finance/clients                                           */
/* ================================================================== */

describe("GET /api/finance/clients", () => {
  it("returns 401 when user is not authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const req = buildGetRequest(BASE_URL);

    const res = await GET(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 when user lacks canViewFinance", async () => {
    mockGetCurrentUser.mockResolvedValue(
      createMockUser({ role: "basic", permissions: {} }),
    );
    const req = buildGetRequest(BASE_URL);

    const res = await GET(req);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
  });

  it("returns 429 when rate limited", async () => {
    mockCheckRateLimit.mockResolvedValue(
      NextResponse.json({ error: "Too many requests" }, { status: 429 }),
    );
    const req = buildGetRequest(BASE_URL);

    const res = await GET(req);

    expect(res.status).toBe(429);
  });

  it("returns first page of clients with hasMore false", async () => {
    const mockClients = Array.from({ length: 3 }, (_, i) => ({
      id: i + 1,
      name: `Client ${i + 1}`,
      email: null,
      phone: null,
      businessName: null,
      notes: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    prismaMock.client.findMany.mockResolvedValue(mockClients);

    const req = buildGetRequest(BASE_URL);
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(3);
    expect(body.hasMore).toBe(false);
    expect(body.nextCursor).toBeNull();
  });

  it("returns hasMore and nextCursor when more data exists", async () => {
    // 501 items so hasMore is triggered (take defaults to 500, fetches 501)
    const mockClients = Array.from({ length: 501 }, (_, i) => ({
      id: i + 1,
      name: `Client ${i + 1}`,
      email: null,
      phone: null,
      businessName: null,
      notes: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    prismaMock.client.findMany.mockResolvedValue(mockClients);

    const req = buildGetRequest(BASE_URL);
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(500);
    expect(body.hasMore).toBe(true);
    expect(body.nextCursor).toBe(500); // last item in sliced data
  });

  it("respects cursor and skip parameters", async () => {
    prismaMock.client.findMany.mockResolvedValue([]);

    const req = buildGetRequest(BASE_URL, { cursor: "5" });
    await GET(req);

    expect(prismaMock.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: { id: 5 },
        skip: 1,
      }),
    );
  });

  it("caps take at 500", async () => {
    prismaMock.client.findMany.mockResolvedValue([]);

    const req = buildGetRequest(BASE_URL, { take: "1000" });
    await GET(req);

    expect(prismaMock.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 501, // 500 (capped) + 1
      }),
    );
  });

  it("uses default take of 500 when not specified", async () => {
    prismaMock.client.findMany.mockResolvedValue([]);

    const req = buildGetRequest(BASE_URL);
    await GET(req);

    expect(prismaMock.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 501, // 500 (default) + 1
      }),
    );
  });

  it("filters by companyId and deletedAt null", async () => {
    prismaMock.client.findMany.mockResolvedValue([]);

    const req = buildGetRequest(BASE_URL);
    await GET(req);

    expect(prismaMock.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: 1, deletedAt: null },
      }),
    );
  });

  it("returns 500 on database failure", async () => {
    prismaMock.client.findMany.mockRejectedValue(new Error("DB down"));

    const req = buildGetRequest(BASE_URL);
    const res = await GET(req);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to fetch clients");
  });
});

/* ================================================================== */
/*  POST /api/finance/clients                                          */
/* ================================================================== */

describe("POST /api/finance/clients", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const req = buildJsonRequest(BASE_URL, "POST", { name: "Test" });

    const res = await POST(req);

    expect(res.status).toBe(401);
  });

  it("returns 403 when user lacks canViewFinance", async () => {
    mockGetCurrentUser.mockResolvedValue(
      createMockUser({ role: "basic", permissions: {} }),
    );
    const req = buildJsonRequest(BASE_URL, "POST", { name: "Test" });

    const res = await POST(req);

    expect(res.status).toBe(403);
  });

  it("returns 429 when rate limited", async () => {
    mockCheckRateLimit.mockResolvedValue(
      NextResponse.json({ error: "Too many requests" }, { status: 429 }),
    );
    const req = buildJsonRequest(BASE_URL, "POST", { name: "Test" });

    const res = await POST(req);

    expect(res.status).toBe(429);
  });

  it("returns 400 for missing name", async () => {
    const req = buildJsonRequest(BASE_URL, "POST", {});

    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
  });

  it("returns 400 for name exceeding 200 chars", async () => {
    const req = buildJsonRequest(BASE_URL, "POST", {
      name: "a".repeat(201),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
  });

  it("returns 400 for invalid email", async () => {
    const req = buildJsonRequest(BASE_URL, "POST", {
      name: "Test",
      email: "not-email",
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.details.email).toBeDefined();
  });

  it("creates client with minimal payload", async () => {
    const created = {
      id: 1,
      name: "Test",
      email: null,
      phone: null,
      businessName: null,
      notes: null,
      createdAt: new Date().toISOString(),
    };
    prismaMock.client.create.mockResolvedValue(created);

    const req = buildJsonRequest(BASE_URL, "POST", { name: "Test" });
    const res = await POST(req);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe("Test");
    expect(prismaMock.client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          companyId: 1,
          name: "Test",
          email: null,
          phone: null,
          businessName: null,
          notes: null,
        }),
      }),
    );
  });

  it("creates client with full payload", async () => {
    const payload = {
      name: "Acme Corp",
      email: "hello@acme.com",
      phone: "+972501234567",
      businessName: "Acme Corporation Ltd",
      notes: "VIP customer",
    };
    const created = {
      id: 2,
      ...payload,
      createdAt: new Date().toISOString(),
    };
    prismaMock.client.create.mockResolvedValue(created);

    const req = buildJsonRequest(BASE_URL, "POST", payload);
    const res = await POST(req);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe("Acme Corp");
    expect(body.email).toBe("hello@acme.com");
    expect(prismaMock.client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          companyId: 1,
          name: "Acme Corp",
          email: "hello@acme.com",
          phone: "+972501234567",
          businessName: "Acme Corporation Ltd",
          notes: "VIP customer",
        }),
      }),
    );
  });

  it("returns 500 on database failure", async () => {
    prismaMock.client.create.mockRejectedValue(new Error("DB down"));

    const req = buildJsonRequest(BASE_URL, "POST", { name: "Test" });
    const res = await POST(req);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to create client");
  });
});

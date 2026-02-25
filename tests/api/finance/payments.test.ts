import { vi, describe, it, expect, beforeEach } from "vitest";
import {
  createMockUser,
  createPrismaMock,
  buildJsonRequest,
} from "@/tests/helpers/finance-mocks";

let prismaMock: ReturnType<typeof createPrismaMock>;

vi.mock("@/lib/permissions-server", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/permissions", async () => {
  const actual = await vi.importActual("@/lib/permissions");
  return actual;
});

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

import { POST } from "@/app/api/finance/payments/route";
import { getCurrentUser } from "@/lib/permissions-server";
import { checkRateLimit } from "@/lib/rate-limit";
import { NextResponse } from "next/server";

const mockGetCurrentUser = getCurrentUser as ReturnType<typeof vi.fn>;
const mockCheckRateLimit = checkRateLimit as ReturnType<typeof vi.fn>;

const BASE_URL = "http://localhost/api/finance/payments";

function validBody(overrides: Record<string, any> = {}) {
  return {
    title: "Invoice #100",
    clientId: 1,
    amount: 250,
    dueDate: "2025-06-01",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock = createPrismaMock();
  mockGetCurrentUser.mockResolvedValue(createMockUser());
  mockCheckRateLimit.mockResolvedValue(null);
});

describe("POST /api/finance/payments", () => {
  // ── Auth & permissions ──────────────────────────────────────

  it("returns 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const req = buildJsonRequest(BASE_URL, "POST", validBody());
    const res = await POST(req);

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 403 when user lacks canViewFinance", async () => {
    mockGetCurrentUser.mockResolvedValue(
      createMockUser({ role: "basic", permissions: {} }),
    );

    const req = buildJsonRequest(BASE_URL, "POST", validBody());
    const res = await POST(req);

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe("Forbidden");
  });

  it("returns 429 when rate limited", async () => {
    const rateLimitRes = NextResponse.json(
      { error: "Too many requests" },
      { status: 429 },
    );
    mockCheckRateLimit.mockResolvedValue(rateLimitRes);

    const req = buildJsonRequest(BASE_URL, "POST", validBody());
    const res = await POST(req);

    expect(res.status).toBe(429);
  });

  // ── Validation ──────────────────────────────────────────────

  it("returns 400 when title is missing", async () => {
    const req = buildJsonRequest(BASE_URL, "POST", {
      clientId: 1,
      amount: 100,
      dueDate: "2025-01-01",
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Validation failed");
  });

  it("returns 400 when clientId is invalid string", async () => {
    const req = buildJsonRequest(BASE_URL, "POST", {
      title: "Test",
      clientId: "abc",
      amount: 100,
      dueDate: "2025-01-01",
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Validation failed");
  });

  it("returns 400 when amount is non-positive", async () => {
    const req = buildJsonRequest(BASE_URL, "POST", {
      title: "Test",
      clientId: 1,
      amount: -5,
      dueDate: "2025-01-01",
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Validation failed");
  });

  it("returns 400 when dueDate is invalid", async () => {
    const req = buildJsonRequest(BASE_URL, "POST", {
      title: "Test",
      clientId: 1,
      amount: 100,
      dueDate: "not-a-date",
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Validation failed");
  });

  // ── Client lookup ───────────────────────────────────────────

  it("returns 404 when client not found", async () => {
    prismaMock.client.findFirst.mockResolvedValue(null);

    const req = buildJsonRequest(BASE_URL, "POST", validBody());
    const res = await POST(req);

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("Client not found");
  });

  // ── Happy path ──────────────────────────────────────────────

  it("returns 201 and creates payment with status pending", async () => {
    const mockClient = { id: 1, companyId: 1, deletedAt: null };
    const mockPayment = {
      id: 10,
      clientId: 1,
      title: "Invoice #100",
      amount: 250,
      dueDate: new Date("2025-06-01"),
      status: "pending",
      notes: null,
      createdAt: new Date(),
    };

    prismaMock.client.findFirst.mockResolvedValue(mockClient);
    prismaMock.oneTimePayment.create.mockResolvedValue(mockPayment);

    const req = buildJsonRequest(BASE_URL, "POST", validBody());
    const res = await POST(req);

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBe(10);
    expect(data.status).toBe("pending");
    expect(data.title).toBe("Invoice #100");

    // Verify create was called with companyId from session
    expect(prismaMock.oneTimePayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          companyId: 1,
          status: "pending",
          clientId: 1,
          title: "Invoice #100",
          amount: 250,
        }),
      }),
    );
  });

  it("sets notes to null when omitted", async () => {
    const mockClient = { id: 1, companyId: 1, deletedAt: null };
    const mockPayment = {
      id: 11,
      clientId: 1,
      title: "No Notes",
      amount: 50,
      dueDate: new Date("2025-07-01"),
      status: "pending",
      notes: null,
      createdAt: new Date(),
    };

    prismaMock.client.findFirst.mockResolvedValue(mockClient);
    prismaMock.oneTimePayment.create.mockResolvedValue(mockPayment);

    const body = validBody({ title: "No Notes", amount: 50 });
    // Ensure notes is not in the body
    delete (body as any).notes;
    const req = buildJsonRequest(BASE_URL, "POST", body);
    const res = await POST(req);

    expect(res.status).toBe(201);

    expect(prismaMock.oneTimePayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          notes: null,
        }),
      }),
    );
  });

  // ── Error handling ──────────────────────────────────────────

  it("returns 500 on database failure", async () => {
    prismaMock.$transaction.mockRejectedValue(new Error("DB connection lost"));

    const req = buildJsonRequest(BASE_URL, "POST", validBody());
    const res = await POST(req);

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("Failed to create payment");
  });
});

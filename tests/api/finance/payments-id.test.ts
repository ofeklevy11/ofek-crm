import { vi, describe, it, expect, beforeEach } from "vitest";
import {
  createMockUser,
  createPrismaMock,
  buildJsonRequest,
  buildGetRequest,
  buildParams,
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

vi.mock("@/lib/finance-constants", async () => {
  const actual = await vi.importActual("@/lib/finance-constants");
  return actual;
});

import { GET, PATCH, DELETE } from "@/app/api/finance/payments/[id]/route";
import { getCurrentUser } from "@/lib/permissions-server";
import { checkRateLimit } from "@/lib/rate-limit";
import { NextResponse } from "next/server";

const mockGetCurrentUser = getCurrentUser as ReturnType<typeof vi.fn>;
const mockCheckRateLimit = checkRateLimit as ReturnType<typeof vi.fn>;

const BASE_URL = "http://localhost/api/finance/payments/1";

const samplePayment = {
  id: 1,
  clientId: 5,
  title: "Website Build",
  amount: 3000,
  dueDate: new Date("2025-04-15"),
  paidDate: null,
  status: "pending",
  notes: null,
  createdAt: new Date("2025-01-10"),
  updatedAt: new Date("2025-01-10"),
  client: {
    id: 5,
    name: "Acme Corp",
    email: "acme@example.com",
    phone: "0501234567",
    businessName: "Acme",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock = createPrismaMock();
  mockGetCurrentUser.mockResolvedValue(createMockUser());
  mockCheckRateLimit.mockResolvedValue(null);
});

// ═══════════════════════════════════════════════════════════════
// GET /api/finance/payments/[id]
// ═══════════════════════════════════════════════════════════════
describe("GET /api/finance/payments/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const req = buildGetRequest(BASE_URL);
    const res = await GET(req, buildParams(1));

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 403 when user lacks canViewFinance", async () => {
    mockGetCurrentUser.mockResolvedValue(
      createMockUser({ role: "basic", permissions: {} }),
    );

    const req = buildGetRequest(BASE_URL);
    const res = await GET(req, buildParams(1));

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

    const req = buildGetRequest(BASE_URL);
    const res = await GET(req, buildParams(1));

    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid ID", async () => {
    const req = buildGetRequest("http://localhost/api/finance/payments/abc");
    const res = await GET(req, buildParams("abc"));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid payment ID");
  });

  it("returns payment with client data", async () => {
    prismaMock.oneTimePayment.findFirst.mockResolvedValue(samplePayment);

    const req = buildGetRequest(BASE_URL);
    const res = await GET(req, buildParams(1));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe(1);
    expect(data.title).toBe("Website Build");
    expect(data.client.name).toBe("Acme Corp");
  });

  it("returns 404 when payment not found", async () => {
    prismaMock.oneTimePayment.findFirst.mockResolvedValue(null);

    const req = buildGetRequest(BASE_URL);
    const res = await GET(req, buildParams(1));

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("Payment not found");
  });

  it("returns 500 on database failure", async () => {
    prismaMock.oneTimePayment.findFirst.mockRejectedValue(new Error("DB down"));

    const req = buildGetRequest(BASE_URL);
    const res = await GET(req, buildParams(1));

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("Failed to fetch payment");
  });
});

// ═══════════════════════════════════════════════════════════════
// PATCH /api/finance/payments/[id]
// ═══════════════════════════════════════════════════════════════
describe("PATCH /api/finance/payments/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const req = buildJsonRequest(BASE_URL, "PATCH", { title: "Updated" });
    const res = await PATCH(req, buildParams(1));

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 403 when user lacks canViewFinance", async () => {
    mockGetCurrentUser.mockResolvedValue(
      createMockUser({ role: "basic", permissions: {} }),
    );

    const req = buildJsonRequest(BASE_URL, "PATCH", { title: "Updated" });
    const res = await PATCH(req, buildParams(1));

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

    const req = buildJsonRequest(BASE_URL, "PATCH", { title: "Updated" });
    const res = await PATCH(req, buildParams(1));

    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid ID", async () => {
    const req = buildJsonRequest(
      "http://localhost/api/finance/payments/abc",
      "PATCH",
      { title: "Updated" },
    );
    const res = await PATCH(req, buildParams("abc"));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid payment ID");
  });

  it("returns 400 for unrecognized status", async () => {
    const req = buildJsonRequest(BASE_URL, "PATCH", { status: "foobar" });
    const res = await PATCH(req, buildParams(1));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Invalid status");
  });

  it('normalizes "Pd" to "paid"', async () => {
    const existingPayment = { id: 1, companyId: 1, deletedAt: null };
    const updatedPayment = { ...samplePayment, status: "paid" };

    prismaMock.oneTimePayment.findFirst.mockResolvedValue(existingPayment);
    prismaMock.oneTimePayment.update.mockResolvedValue(updatedPayment);

    const req = buildJsonRequest(BASE_URL, "PATCH", { status: "Pd" });
    const res = await PATCH(req, buildParams(1));

    expect(res.status).toBe(200);
    expect(prismaMock.oneTimePayment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "paid" }),
      }),
    );
  });

  it('normalizes "completed" to "paid"', async () => {
    const existingPayment = { id: 1, companyId: 1, deletedAt: null };
    const updatedPayment = { ...samplePayment, status: "paid" };

    prismaMock.oneTimePayment.findFirst.mockResolvedValue(existingPayment);
    prismaMock.oneTimePayment.update.mockResolvedValue(updatedPayment);

    const req = buildJsonRequest(BASE_URL, "PATCH", { status: "completed" });
    const res = await PATCH(req, buildParams(1));

    expect(res.status).toBe(200);
    expect(prismaMock.oneTimePayment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "paid" }),
      }),
    );
  });

  it('normalizes "manual-marked-paid" to "paid"', async () => {
    const existingPayment = { id: 1, companyId: 1, deletedAt: null };
    const updatedPayment = { ...samplePayment, status: "paid" };

    prismaMock.oneTimePayment.findFirst.mockResolvedValue(existingPayment);
    prismaMock.oneTimePayment.update.mockResolvedValue(updatedPayment);

    const req = buildJsonRequest(BASE_URL, "PATCH", {
      status: "manual-marked-paid",
    });
    const res = await PATCH(req, buildParams(1));

    expect(res.status).toBe(200);
    expect(prismaMock.oneTimePayment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "paid" }),
      }),
    );
  });

  it('normalizes "pending" to "pending"', async () => {
    const existingPayment = { id: 1, companyId: 1, deletedAt: null };
    const updatedPayment = { ...samplePayment, status: "pending" };

    prismaMock.oneTimePayment.findFirst.mockResolvedValue(existingPayment);
    prismaMock.oneTimePayment.update.mockResolvedValue(updatedPayment);

    const req = buildJsonRequest(BASE_URL, "PATCH", { status: "pending" });
    const res = await PATCH(req, buildParams(1));

    expect(res.status).toBe(200);
    expect(prismaMock.oneTimePayment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "pending" }),
      }),
    );
  });

  it('normalizes "overdue" to "overdue"', async () => {
    const existingPayment = { id: 1, companyId: 1, deletedAt: null };
    const updatedPayment = { ...samplePayment, status: "overdue" };

    prismaMock.oneTimePayment.findFirst.mockResolvedValue(existingPayment);
    prismaMock.oneTimePayment.update.mockResolvedValue(updatedPayment);

    const req = buildJsonRequest(BASE_URL, "PATCH", { status: "overdue" });
    const res = await PATCH(req, buildParams(1));

    expect(res.status).toBe(200);
    expect(prismaMock.oneTimePayment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "overdue" }),
      }),
    );
  });

  it("does not auto-set paidDate for non-paid status", async () => {
    const existingPayment = { id: 1, companyId: 1, deletedAt: null };
    const updatedPayment = { ...samplePayment, status: "pending" };

    prismaMock.oneTimePayment.findFirst.mockResolvedValue(existingPayment);
    prismaMock.oneTimePayment.update.mockResolvedValue(updatedPayment);

    const req = buildJsonRequest(BASE_URL, "PATCH", { status: "pending" });
    const res = await PATCH(req, buildParams(1));

    expect(res.status).toBe(200);
    const updateCall = prismaMock.oneTimePayment.update.mock.calls[0][0];
    expect(updateCall.data.paidDate).toBeUndefined();
  });

  it('normalizes "canceled" to "cancelled"', async () => {
    const existingPayment = { id: 1, companyId: 1, deletedAt: null };
    const updatedPayment = { ...samplePayment, status: "cancelled" };

    prismaMock.oneTimePayment.findFirst.mockResolvedValue(existingPayment);
    prismaMock.oneTimePayment.update.mockResolvedValue(updatedPayment);

    const req = buildJsonRequest(BASE_URL, "PATCH", { status: "canceled" });
    const res = await PATCH(req, buildParams(1));

    expect(res.status).toBe(200);
    expect(prismaMock.oneTimePayment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "cancelled" }),
      }),
    );
  });

  it("auto-sets paidDate when status is paid and no paidDate provided", async () => {
    const existingPayment = { id: 1, companyId: 1, deletedAt: null };
    const updatedPayment = {
      ...samplePayment,
      status: "paid",
      paidDate: new Date(),
    };

    prismaMock.oneTimePayment.findFirst.mockResolvedValue(existingPayment);
    prismaMock.oneTimePayment.update.mockResolvedValue(updatedPayment);

    const req = buildJsonRequest(BASE_URL, "PATCH", { status: "paid" });
    const res = await PATCH(req, buildParams(1));

    expect(res.status).toBe(200);

    const updateCall = prismaMock.oneTimePayment.update.mock.calls[0][0];
    expect(updateCall.data.paidDate).toBeInstanceOf(Date);
  });

  it("uses provided paidDate instead of auto-setting", async () => {
    const existingPayment = { id: 1, companyId: 1, deletedAt: null };
    const explicitDate = new Date("2025-03-15");
    const updatedPayment = {
      ...samplePayment,
      status: "paid",
      paidDate: explicitDate,
    };

    prismaMock.oneTimePayment.findFirst.mockResolvedValue(existingPayment);
    prismaMock.oneTimePayment.update.mockResolvedValue(updatedPayment);

    const req = buildJsonRequest(BASE_URL, "PATCH", {
      status: "paid",
      paidDate: "2025-03-15",
    });
    const res = await PATCH(req, buildParams(1));

    expect(res.status).toBe(200);

    const updateCall = prismaMock.oneTimePayment.update.mock.calls[0][0];
    // Should be the provided date, not an auto-generated one
    expect(new Date(updateCall.data.paidDate)).toEqual(new Date("2025-03-15"));
  });

  it("uses RepeatableRead isolation level in transaction", async () => {
    const existingPayment = { id: 1, companyId: 1, deletedAt: null };
    prismaMock.oneTimePayment.findFirst.mockResolvedValue(existingPayment);
    prismaMock.oneTimePayment.update.mockResolvedValue(samplePayment);

    const req = buildJsonRequest(BASE_URL, "PATCH", { title: "Updated" });
    await PATCH(req, buildParams(1));

    expect(prismaMock.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: "RepeatableRead" },
    );
  });

  it("returns 404 when payment not found in transaction", async () => {
    prismaMock.oneTimePayment.findFirst.mockResolvedValue(null);

    const req = buildJsonRequest(BASE_URL, "PATCH", { title: "Updated" });
    const res = await PATCH(req, buildParams(1));

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("Payment not found");
  });

  it("returns 500 on database failure", async () => {
    prismaMock.$transaction.mockRejectedValue(new Error("DB down"));

    const req = buildJsonRequest(BASE_URL, "PATCH", { amount: 999 });
    const res = await PATCH(req, buildParams(1));

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("Failed to update payment");
  });
});

// ═══════════════════════════════════════════════════════════════
// DELETE /api/finance/payments/[id]
// ═══════════════════════════════════════════════════════════════
describe("DELETE /api/finance/payments/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const req = buildGetRequest(BASE_URL);
    const res = await DELETE(req, buildParams(1));

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 403 when user lacks canViewFinance", async () => {
    mockGetCurrentUser.mockResolvedValue(
      createMockUser({ role: "basic", permissions: {} }),
    );

    const req = buildGetRequest(BASE_URL);
    const res = await DELETE(req, buildParams(1));

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

    const req = buildGetRequest(BASE_URL);
    const res = await DELETE(req, buildParams(1));

    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid ID", async () => {
    const req = buildGetRequest("http://localhost/api/finance/payments/abc");
    const res = await DELETE(req, buildParams("abc"));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid payment ID");
  });

  it("soft-deletes payment and returns success", async () => {
    const existingPayment = { id: 1, companyId: 1, deletedAt: null };
    prismaMock.oneTimePayment.findFirst.mockResolvedValue(existingPayment);
    prismaMock.oneTimePayment.update.mockResolvedValue({
      ...existingPayment,
      deletedAt: new Date(),
    });

    const req = buildGetRequest(BASE_URL);
    const res = await DELETE(req, buildParams(1));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);

    // Verify soft-delete (sets deletedAt, not hard delete)
    expect(prismaMock.oneTimePayment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: { deletedAt: expect.any(Date) },
      }),
    );

    // Verify RepeatableRead isolation
    expect(prismaMock.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: "RepeatableRead" },
    );
  });

  it("returns 404 when payment not found", async () => {
    prismaMock.oneTimePayment.findFirst.mockResolvedValue(null);

    const req = buildGetRequest(BASE_URL);
    const res = await DELETE(req, buildParams(1));

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("Payment not found");
  });

  it("returns 500 on database failure", async () => {
    prismaMock.$transaction.mockRejectedValue(new Error("DB connection lost"));

    const req = buildGetRequest(BASE_URL);
    const res = await DELETE(req, buildParams(1));

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("Failed to delete payment");
  });
});

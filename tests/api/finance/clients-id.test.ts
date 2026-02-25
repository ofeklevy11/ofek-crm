import { vi, describe, it, expect, beforeEach } from "vitest";
import {
  createMockUser,
  createPrismaMock,
  buildGetRequest,
  buildJsonRequest,
  buildParams,
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

import { GET, PATCH, DELETE } from "@/app/api/finance/clients/[id]/route";
import { getCurrentUser } from "@/lib/permissions-server";
import { checkRateLimit } from "@/lib/rate-limit";
import { NextResponse } from "next/server";

const mockGetCurrentUser = getCurrentUser as ReturnType<typeof vi.fn>;
const mockCheckRateLimit = checkRateLimit as ReturnType<typeof vi.fn>;

const BASE_URL = "http://localhost:3000/api/finance/clients/1";

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
/*  GET /api/finance/clients/[id]                                      */
/* ================================================================== */

describe("GET /api/finance/clients/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const req = buildGetRequest(BASE_URL);

    const res = await GET(req, buildParams(1));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 when user lacks canViewFinance", async () => {
    mockGetCurrentUser.mockResolvedValue(
      createMockUser({ role: "basic", permissions: {} }),
    );
    const req = buildGetRequest(BASE_URL);

    const res = await GET(req, buildParams(1));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
  });

  it("returns 429 when rate limited", async () => {
    mockCheckRateLimit.mockResolvedValue(
      NextResponse.json({ error: "Too many requests" }, { status: 429 }),
    );
    const req = buildGetRequest(BASE_URL);

    const res = await GET(req, buildParams(1));

    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid ID", async () => {
    const req = buildGetRequest("http://localhost:3000/api/finance/clients/abc");

    const res = await GET(req, buildParams("abc"));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid client ID");
  });

  it("returns client with nested data", async () => {
    const mockClient = {
      id: 1,
      name: "Test Client",
      email: "test@example.com",
      phone: "+972501234567",
      businessName: "Test Ltd",
      notes: "Important client",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      retainers: [
        { id: 10, amount: 5000, frequency: "monthly", status: "active", nextDueDate: null, createdAt: new Date().toISOString() },
      ],
      oneTimePayments: [
        { id: 20, amount: 1500, status: "pending", dueDate: null, paidDate: null, title: "Setup fee", createdAt: new Date().toISOString() },
      ],
      transactions: [
        { id: 30, amount: 5000, status: "completed", notes: null, attemptDate: null, paidDate: null, createdAt: new Date().toISOString() },
      ],
    };
    prismaMock.client.findFirst.mockResolvedValue(mockClient);

    const req = buildGetRequest(BASE_URL);
    const res = await GET(req, buildParams(1));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Test Client");
    expect(body.retainers).toHaveLength(1);
    expect(body.oneTimePayments).toHaveLength(1);
    expect(body.transactions).toHaveLength(1);
    expect(prismaMock.client.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1, companyId: 1, deletedAt: null },
        select: expect.objectContaining({
          retainers: expect.objectContaining({
            where: { deletedAt: null },
          }),
          oneTimePayments: expect.objectContaining({
            where: { deletedAt: null },
          }),
          transactions: expect.objectContaining({
            where: { deletedAt: null },
          }),
        }),
      }),
    );
  });

  it("returns 404 when client not found", async () => {
    prismaMock.client.findFirst.mockResolvedValue(null);

    const req = buildGetRequest(BASE_URL);
    const res = await GET(req, buildParams(1));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Client not found");
  });

  it("returns 500 on database failure", async () => {
    prismaMock.client.findFirst.mockRejectedValue(new Error("DB down"));

    const req = buildGetRequest(BASE_URL);
    const res = await GET(req, buildParams(1));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to fetch client");
  });
});

/* ================================================================== */
/*  PATCH /api/finance/clients/[id]                                    */
/* ================================================================== */

describe("PATCH /api/finance/clients/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const req = buildJsonRequest(BASE_URL, "PATCH", { name: "Updated" });

    const res = await PATCH(req, buildParams(1));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 when user lacks canViewFinance", async () => {
    mockGetCurrentUser.mockResolvedValue(
      createMockUser({ role: "basic", permissions: {} }),
    );
    const req = buildJsonRequest(BASE_URL, "PATCH", { name: "Updated" });

    const res = await PATCH(req, buildParams(1));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
  });

  it("returns 429 when rate limited", async () => {
    mockCheckRateLimit.mockResolvedValue(
      NextResponse.json({ error: "Too many requests" }, { status: 429 }),
    );
    const req = buildJsonRequest(BASE_URL, "PATCH", { name: "Updated" });

    const res = await PATCH(req, buildParams(1));

    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid ID", async () => {
    const req = buildJsonRequest(
      "http://localhost:3000/api/finance/clients/abc",
      "PATCH",
      { name: "Updated" },
    );

    const res = await PATCH(req, buildParams("abc"));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid client ID");
  });

  it("returns 400 for invalid email in payload", async () => {
    const req = buildJsonRequest(BASE_URL, "PATCH", { email: "bad-email" });

    const res = await PATCH(req, buildParams(1));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.details.email).toBeDefined();
  });

  it("returns 400 when setting non-nullable name to null", async () => {
    const req = buildJsonRequest(BASE_URL, "PATCH", { name: null });
    const res = await PATCH(req, buildParams(1));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.details.name).toBeDefined();
  });

  it("returns 400 when name is empty string", async () => {
    const req = buildJsonRequest(BASE_URL, "PATCH", { name: "" });
    const res = await PATCH(req, buildParams(1));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.details.name).toBeDefined();
  });

  it("returns 500 on malformed JSON body", async () => {
    const { NextRequest } = await import("next/server");
    const req = new NextRequest(new URL(BASE_URL), {
      method: "PATCH",
      body: "not-json{{{",
      headers: { "content-type": "application/json" },
    });
    const res = await PATCH(req, buildParams(1));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to update client");
  });

  it("returns 400 when notes exceeds max length", async () => {
    const req = buildJsonRequest(BASE_URL, "PATCH", { notes: "a".repeat(5001) });
    const res = await PATCH(req, buildParams(1));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.details.notes).toBeDefined();
  });

  it("handles empty body with no fields", async () => {
    const existing = {
      id: 1,
      companyId: 1,
      name: "Unchanged",
      email: "same@test.com",
      phone: null,
      businessName: null,
      notes: null,
      deletedAt: null,
    };
    const returned = {
      id: 1,
      name: "Unchanged",
      email: "same@test.com",
      phone: null,
      businessName: null,
      notes: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    prismaMock.client.findFirst.mockResolvedValue(existing);
    prismaMock.client.update.mockResolvedValue(returned);

    const req = buildJsonRequest(BASE_URL, "PATCH", {});
    const res = await PATCH(req, buildParams(1));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Unchanged");
    expect(prismaMock.client.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: {} }),
    );
  });

  it("partial update works (only name)", async () => {
    const existing = {
      id: 1,
      companyId: 1,
      name: "Old Name",
      email: "old@test.com",
      phone: null,
      businessName: null,
      notes: null,
      deletedAt: null,
    };
    const updated = {
      id: 1,
      name: "New Name",
      email: "old@test.com",
      phone: null,
      businessName: null,
      notes: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    prismaMock.client.findFirst.mockResolvedValue(existing);
    prismaMock.client.update.mockResolvedValue(updated);

    const req = buildJsonRequest(BASE_URL, "PATCH", { name: "New Name" });
    const res = await PATCH(req, buildParams(1));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("New Name");
    expect(prismaMock.client.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1, companyId: 1 },
        data: expect.objectContaining({ name: "New Name" }),
      }),
    );
    expect(prismaMock.client.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1, companyId: 1, deletedAt: null },
      }),
    );
  });

  it("can set nullable field to null", async () => {
    const existing = {
      id: 1,
      companyId: 1,
      name: "Test",
      email: "old@test.com",
      deletedAt: null,
    };
    const updated = {
      id: 1,
      name: "Test",
      email: null,
      phone: null,
      businessName: null,
      notes: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    prismaMock.client.findFirst.mockResolvedValue(existing);
    prismaMock.client.update.mockResolvedValue(updated);

    const req = buildJsonRequest(BASE_URL, "PATCH", { email: null });
    const res = await PATCH(req, buildParams(1));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.email).toBeNull();
    expect(prismaMock.client.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: null }),
      }),
    );
  });

  it("returns 404 when client not found in transaction", async () => {
    prismaMock.client.findFirst.mockResolvedValue(null);

    const req = buildJsonRequest(BASE_URL, "PATCH", { name: "Updated" });
    const res = await PATCH(req, buildParams(1));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Client not found");
    expect(prismaMock.client.update).not.toHaveBeenCalled();
  });

  it("uses RepeatableRead transaction isolation", async () => {
    const existing = { id: 1, companyId: 1, name: "Test", deletedAt: null };
    const updated = {
      id: 1,
      name: "Updated",
      email: null,
      phone: null,
      businessName: null,
      notes: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    prismaMock.client.findFirst.mockResolvedValue(existing);
    prismaMock.client.update.mockResolvedValue(updated);

    const req = buildJsonRequest(BASE_URL, "PATCH", { name: "Updated" });
    await PATCH(req, buildParams(1));

    expect(prismaMock.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: "RepeatableRead" }),
    );
  });

  it("returns 500 on database failure", async () => {
    prismaMock.$transaction.mockRejectedValue(new Error("DB down"));

    const req = buildJsonRequest(BASE_URL, "PATCH", { name: "Updated" });
    const res = await PATCH(req, buildParams(1));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to update client");
  });
});

/* ================================================================== */
/*  DELETE /api/finance/clients/[id]                                   */
/* ================================================================== */

describe("DELETE /api/finance/clients/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const req = buildGetRequest(BASE_URL);

    const res = await DELETE(req, buildParams(1));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 when user lacks canViewFinance", async () => {
    mockGetCurrentUser.mockResolvedValue(
      createMockUser({ role: "basic", permissions: {} }),
    );
    const req = buildGetRequest(BASE_URL);

    const res = await DELETE(req, buildParams(1));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
  });

  it("returns 429 when rate limited", async () => {
    mockCheckRateLimit.mockResolvedValue(
      NextResponse.json({ error: "Too many requests" }, { status: 429 }),
    );
    const req = buildGetRequest(BASE_URL);

    const res = await DELETE(req, buildParams(1));

    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid ID", async () => {
    const req = buildGetRequest(
      "http://localhost:3000/api/finance/clients/abc",
    );

    const res = await DELETE(req, buildParams("abc"));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid client ID");
  });

  it("cascade soft-deletes client and all related records", async () => {
    const existing = { id: 1, companyId: 1, name: "To Delete", deletedAt: null };
    prismaMock.client.findFirst.mockResolvedValue(existing);
    prismaMock.transaction.updateMany.mockResolvedValue({ count: 3 });
    prismaMock.retainer.updateMany.mockResolvedValue({ count: 2 });
    prismaMock.oneTimePayment.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.financeRecord.updateMany.mockResolvedValue({ count: 5 });
    prismaMock.client.update.mockResolvedValue({ ...existing, deletedAt: new Date() });

    const req = buildGetRequest(BASE_URL);
    const res = await DELETE(req, buildParams(1));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Verify cascade: all 4 updateMany calls + client.update
    expect(prismaMock.transaction.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clientId: 1,
          companyId: 1,
          deletedAt: null,
        }),
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    );
    expect(prismaMock.retainer.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clientId: 1,
          companyId: 1,
          deletedAt: null,
        }),
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    );
    expect(prismaMock.oneTimePayment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clientId: 1,
          companyId: 1,
          deletedAt: null,
        }),
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    );
    expect(prismaMock.financeRecord.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clientId: 1,
          companyId: 1,
          deletedAt: null,
        }),
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    );
    expect(prismaMock.client.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1, companyId: 1 },
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    );
    expect(prismaMock.client.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1, companyId: 1, deletedAt: null },
      }),
    );
  });

  it("returns 404 when client not found in transaction", async () => {
    prismaMock.client.findFirst.mockResolvedValue(null);

    const req = buildGetRequest(BASE_URL);
    const res = await DELETE(req, buildParams(1));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Client not found");
  });

  it("uses RepeatableRead transaction isolation", async () => {
    const existing = { id: 1, companyId: 1, name: "To Delete", deletedAt: null };
    prismaMock.client.findFirst.mockResolvedValue(existing);
    prismaMock.client.update.mockResolvedValue({ ...existing, deletedAt: new Date() });

    const req = buildGetRequest(BASE_URL);
    await DELETE(req, buildParams(1));

    expect(prismaMock.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: "RepeatableRead" }),
    );
  });

  it("returns 500 on database failure", async () => {
    prismaMock.$transaction.mockRejectedValue(new Error("DB down"));

    const req = buildGetRequest(BASE_URL);
    const res = await DELETE(req, buildParams(1));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to delete client");
  });
});

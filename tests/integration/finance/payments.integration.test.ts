import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";

// ── Mocks ───────────────────────────────────────────────────────────
vi.mock("@/lib/permissions-server", () => ({
  getCurrentUser: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(null),
  RATE_LIMITS: {
    api: { prefix: "api", max: 120, windowSeconds: 60 },
  },
}));

// ── Imports ─────────────────────────────────────────────────────────
import { POST } from "@/app/api/finance/payments/route";
import {
  GET,
  PATCH,
  DELETE,
} from "@/app/api/finance/payments/[id]/route";
import { getCurrentUser } from "@/lib/permissions-server";
import {
  buildGetRequest,
  buildJsonRequest,
  buildParams,
} from "@/tests/helpers/finance-mocks";
import {
  testPrisma,
  seedCompany,
  seedUser,
  seedClient,
  cleanupAll,
} from "./helpers";

const mockGetCurrentUser = getCurrentUser as ReturnType<typeof vi.fn>;
const BASE_URL = "http://localhost:3000/api/finance/payments";

let company: any;
let adminUser: any;
let basicUser: any;
let basicUserWithPerm: any;
let client: any;
let otherCompany: any;
let otherClient: any;

beforeAll(async () => {
  await cleanupAll();
  company = await seedCompany();
  otherCompany = await seedCompany();
  adminUser = await seedUser(company.id, { role: "admin" });
  basicUser = await seedUser(company.id, { role: "basic", permissions: {} });
  basicUserWithPerm = await seedUser(company.id, {
    role: "basic",
    permissions: { canViewFinance: true },
    name: "Basic With Finance",
  });
  client = await seedClient(company.id, { name: "CloudScale Technologies" });
  otherClient = await seedClient(otherCompany.id, { name: "Foreign Entity Corp" });
});

afterAll(async () => {
  await cleanupAll();
});

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCurrentUser.mockResolvedValue(adminUser);
});

// ── Auth ────────────────────────────────────────────────────────────
describe("Auth", () => {
  it("returns 401 when user is not authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const res = await POST(
      buildJsonRequest(BASE_URL, "POST", {
        title: "Auth Test Invoice",
        clientId: client.id,
        amount: 500,
        dueDate: "2026-04-01T00:00:00.000Z",
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when basic user lacks canViewFinance", async () => {
    mockGetCurrentUser.mockResolvedValue(basicUser);
    const res = await POST(
      buildJsonRequest(BASE_URL, "POST", {
        title: "Auth Test Invoice",
        clientId: client.id,
        amount: 500,
        dueDate: "2026-04-01T00:00:00.000Z",
      }),
    );
    expect(res.status).toBe(403);
  });

  it("returns 200 for basic user with canViewFinance", async () => {
    mockGetCurrentUser.mockResolvedValue(basicUserWithPerm);
    const payment = await testPrisma.oneTimePayment.create({
      data: {
        clientId: client.id,
        companyId: company.id,
        title: "Auth Perm Test",
        amount: 100,
        dueDate: new Date(),
        status: "pending",
      },
    });
    const res = await GET(
      buildGetRequest(`${BASE_URL}/${payment.id}`),
      buildParams(payment.id),
    );
    expect(res.status).toBe(200);
  });
});

// ── POST /api/finance/payments ──────────────────────────────────────
describe("POST /api/finance/payments", () => {
  it("creates payment with valid data, defaults status to pending, verifies DB", async () => {
    const res = await POST(
      buildJsonRequest(BASE_URL, "POST", {
        title: "Q2 Brand Strategy Invoice",
        clientId: client.id,
        amount: 8500.75,
        dueDate: "2026-04-15T00:00:00.000Z",
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.title).toBe("Q2 Brand Strategy Invoice");
    expect(body.status).toBe("pending");
    expect(body.clientId).toBe(client.id);

    // Verify DB state
    const db = await testPrisma.oneTimePayment.findUnique({
      where: { id: body.id },
    });
    expect(db).not.toBeNull();
    expect(db!.title).toBe("Q2 Brand Strategy Invoice");
    expect(db!.status).toBe("pending");
    expect(db!.companyId).toBe(company.id);
    expect(Number(db!.amount)).toBeCloseTo(8500.75);
    expect(db!.paidDate).toBeNull();
    expect(db!.deletedAt).toBeNull();
  });

  it("stores Decimal(10,2) amount correctly in DB", async () => {
    const res = await POST(
      buildJsonRequest(BASE_URL, "POST", {
        title: "Decimal Precision Test",
        clientId: client.id,
        amount: 1234.56,
        dueDate: "2026-05-01T00:00:00.000Z",
      }),
    );
    const body = await res.json();
    const db = await testPrisma.oneTimePayment.findUnique({
      where: { id: body.id },
    });
    expect(Number(db!.amount)).toBeCloseTo(1234.56);
  });

  it("creates payment with optional notes", async () => {
    const res = await POST(
      buildJsonRequest(BASE_URL, "POST", {
        title: "Consulting Hours - March",
        clientId: client.id,
        amount: 3200,
        dueDate: "2026-03-31T00:00:00.000Z",
        notes: "40 hours at $80/hr. Net-30 terms.",
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    const db = await testPrisma.oneTimePayment.findUnique({
      where: { id: body.id },
    });
    expect(db!.notes).toBe("40 hours at $80/hr. Net-30 terms.");
  });

  it("returns 404 when clientId not found", async () => {
    const res = await POST(
      buildJsonRequest(BASE_URL, "POST", {
        title: "Ghost Client Invoice",
        clientId: 999999,
        amount: 100,
        dueDate: "2026-04-01T00:00:00.000Z",
      }),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Client not found");
  });

  it("returns 404 when clientId belongs to different company", async () => {
    const res = await POST(
      buildJsonRequest(BASE_URL, "POST", {
        title: "Cross-Company Attempt",
        clientId: otherClient.id,
        amount: 100,
        dueDate: "2026-04-01T00:00:00.000Z",
      }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 for missing title", async () => {
    const res = await POST(
      buildJsonRequest(BASE_URL, "POST", {
        clientId: client.id,
        amount: 100,
        dueDate: "2026-04-01T00:00:00.000Z",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for negative amount", async () => {
    const res = await POST(
      buildJsonRequest(BASE_URL, "POST", {
        title: "Negative Amount",
        clientId: client.id,
        amount: -500,
        dueDate: "2026-04-01T00:00:00.000Z",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing dueDate", async () => {
    const res = await POST(
      buildJsonRequest(BASE_URL, "POST", {
        title: "No Due Date",
        clientId: client.id,
        amount: 100,
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for zero amount", async () => {
    const res = await POST(
      buildJsonRequest(BASE_URL, "POST", {
        title: "Free Invoice",
        clientId: client.id,
        amount: 0,
        dueDate: "2026-04-01T00:00:00.000Z",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when clientId is omitted", async () => {
    const res = await POST(
      buildJsonRequest(BASE_URL, "POST", {
        title: "Missing Client Invoice",
        amount: 1000,
        dueDate: "2026-04-01T00:00:00.000Z",
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
  });

  it("returns 400 for title exceeding max length", async () => {
    const res = await POST(
      buildJsonRequest(BASE_URL, "POST", {
        title: "X".repeat(201),
        clientId: client.id,
        amount: 1000,
        dueDate: "2026-04-01T00:00:00.000Z",
      }),
    );
    expect(res.status).toBe(400);
  });
});

// ── GET /api/finance/payments/[id] ──────────────────────────────────
describe("GET /api/finance/payments/[id]", () => {
  let payment: any;
  let otherCoPayment: any;
  let deletedPayment: any;

  beforeAll(async () => {
    payment = await testPrisma.oneTimePayment.create({
      data: {
        clientId: client.id,
        companyId: company.id,
        title: "Annual License Fee",
        amount: 24000,
        dueDate: new Date("2026-06-01"),
        status: "pending",
      },
    });
    const otherCoClient2 = await seedClient(otherCompany.id);
    otherCoPayment = await testPrisma.oneTimePayment.create({
      data: {
        clientId: otherCoClient2.id,
        companyId: otherCompany.id,
        title: "Foreign Company Payment",
        amount: 100,
        dueDate: new Date(),
        status: "pending",
      },
    });
    deletedPayment = await testPrisma.oneTimePayment.create({
      data: {
        clientId: client.id,
        companyId: company.id,
        title: "Voided Invoice",
        amount: 100,
        dueDate: new Date(),
        status: "pending",
        deletedAt: new Date(),
      },
    });
  });

  it("returns payment with nested client data", async () => {
    const res = await GET(
      buildGetRequest(`${BASE_URL}/${payment.id}`),
      buildParams(payment.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe("Annual License Fee");
    expect(body.client).toBeDefined();
    expect(body.client.name).toBe("CloudScale Technologies");
    expect(body.client).toHaveProperty("id");
    expect(body.client).toHaveProperty("email");
    // client should not leak sensitive fields
    expect(body.client).not.toHaveProperty("companyId");
  });

  it("returns 404 for non-existent payment", async () => {
    const res = await GET(
      buildGetRequest(`${BASE_URL}/999999`),
      buildParams(999999),
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 for payment in different company", async () => {
    const res = await GET(
      buildGetRequest(`${BASE_URL}/${otherCoPayment.id}`),
      buildParams(otherCoPayment.id),
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 for soft-deleted payment", async () => {
    const res = await GET(
      buildGetRequest(`${BASE_URL}/${deletedPayment.id}`),
      buildParams(deletedPayment.id),
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 for non-numeric ID", async () => {
    const res = await GET(
      buildGetRequest(`${BASE_URL}/abc`),
      buildParams("abc"),
    );
    expect(res.status).toBe(400);
  });
});

// ── PATCH /api/finance/payments/[id] ────────────────────────────────
describe("PATCH /api/finance/payments/[id]", () => {
  let patchPayment: any;

  beforeAll(async () => {
    patchPayment = await testPrisma.oneTimePayment.create({
      data: {
        clientId: client.id,
        companyId: company.id,
        title: "Original Invoice Title",
        amount: 5000,
        dueDate: new Date("2026-04-01"),
        status: "pending",
      },
    });
  });

  it("updates title and amount, verifies DB state", async () => {
    const res = await PATCH(
      buildJsonRequest(`${BASE_URL}/${patchPayment.id}`, "PATCH", {
        title: "Revised Invoice - Q2",
        amount: 6500,
      }),
      buildParams(patchPayment.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe("Revised Invoice - Q2");

    const db = await testPrisma.oneTimePayment.findUnique({
      where: { id: patchPayment.id },
    });
    expect(db!.title).toBe("Revised Invoice - Q2");
    expect(Number(db!.amount)).toBeCloseTo(6500);
  });

  it("normalizes status 'pd' to 'paid' and verifies in DB", async () => {
    await testPrisma.oneTimePayment.update({
      where: { id: patchPayment.id },
      data: { status: "pending", paidDate: null },
    });

    const res = await PATCH(
      buildJsonRequest(`${BASE_URL}/${patchPayment.id}`, "PATCH", {
        status: "pd",
      }),
      buildParams(patchPayment.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("paid");

    const db = await testPrisma.oneTimePayment.findUnique({
      where: { id: patchPayment.id },
    });
    expect(db!.status).toBe("paid");
  });

  it("normalizes status 'canceled' to 'cancelled' and verifies DB", async () => {
    await testPrisma.oneTimePayment.update({
      where: { id: patchPayment.id },
      data: { status: "pending" },
    });
    const res = await PATCH(
      buildJsonRequest(`${BASE_URL}/${patchPayment.id}`, "PATCH", {
        status: "canceled",
      }),
      buildParams(patchPayment.id),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("cancelled");

    const db = await testPrisma.oneTimePayment.findUnique({
      where: { id: patchPayment.id },
    });
    expect(db!.status).toBe("cancelled");
  });

  it("normalizes status 'completed' to 'paid' and verifies DB", async () => {
    await testPrisma.oneTimePayment.update({
      where: { id: patchPayment.id },
      data: { status: "pending", paidDate: null },
    });
    const res = await PATCH(
      buildJsonRequest(`${BASE_URL}/${patchPayment.id}`, "PATCH", {
        status: "completed",
      }),
      buildParams(patchPayment.id),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("paid");

    const db = await testPrisma.oneTimePayment.findUnique({
      where: { id: patchPayment.id },
    });
    expect(db!.status).toBe("paid");
  });

  it("normalizes status 'manual-marked-paid' to 'paid' and verifies DB", async () => {
    await testPrisma.oneTimePayment.update({
      where: { id: patchPayment.id },
      data: { status: "pending", paidDate: null },
    });
    const res = await PATCH(
      buildJsonRequest(`${BASE_URL}/${patchPayment.id}`, "PATCH", {
        status: "manual-marked-paid",
      }),
      buildParams(patchPayment.id),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("paid");

    const db = await testPrisma.oneTimePayment.findUnique({
      where: { id: patchPayment.id },
    });
    expect(db!.status).toBe("paid");
  });

  it("auto-sets paidDate when status→paid without explicit paidDate, verifies DB", async () => {
    // Reset to pending
    await testPrisma.oneTimePayment.update({
      where: { id: patchPayment.id },
      data: { status: "pending", paidDate: null },
    });

    const before = new Date();
    const res = await PATCH(
      buildJsonRequest(`${BASE_URL}/${patchPayment.id}`, "PATCH", {
        status: "paid",
      }),
      buildParams(patchPayment.id),
    );
    expect(res.status).toBe(200);

    const db = await testPrisma.oneTimePayment.findUnique({
      where: { id: patchPayment.id },
    });
    expect(db!.paidDate).not.toBeNull();
    expect(db!.paidDate!.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
  });

  it("uses explicit paidDate when provided alongside 'paid' status", async () => {
    const explicitDate = new Date("2026-02-15T12:00:00.000Z");
    const res = await PATCH(
      buildJsonRequest(`${BASE_URL}/${patchPayment.id}`, "PATCH", {
        status: "paid",
        paidDate: explicitDate.toISOString(),
      }),
      buildParams(patchPayment.id),
    );
    expect(res.status).toBe(200);

    const db = await testPrisma.oneTimePayment.findUnique({
      where: { id: patchPayment.id },
    });
    expect(db!.paidDate!.toISOString()).toBe(explicitDate.toISOString());
  });

  it("returns 400 for unrecognized status 'xyz'", async () => {
    const res = await PATCH(
      buildJsonRequest(`${BASE_URL}/${patchPayment.id}`, "PATCH", {
        status: "xyz",
      }),
      buildParams(patchPayment.id),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid status");
  });

  it("returns 404 for non-existent payment", async () => {
    const res = await PATCH(
      buildJsonRequest(`${BASE_URL}/999999`, "PATCH", { title: "Nope" }),
      buildParams(999999),
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 for payment in different company (cross-company)", async () => {
    const otherCoClient2 = await seedClient(otherCompany.id);
    const foreignPayment = await testPrisma.oneTimePayment.create({
      data: {
        clientId: otherCoClient2.id,
        companyId: otherCompany.id,
        title: "Foreign PATCH Target",
        amount: 100,
        dueDate: new Date(),
        status: "pending",
      },
    });
    const res = await PATCH(
      buildJsonRequest(`${BASE_URL}/${foreignPayment.id}`, "PATCH", {
        title: "Hijack Attempt",
      }),
      buildParams(foreignPayment.id),
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 for non-numeric ID", async () => {
    const res = await PATCH(
      buildJsonRequest(`${BASE_URL}/abc`, "PATCH", { title: "Nope" }),
      buildParams("abc"),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid payment ID");
  });

  it("returns 400 for negative amount in update", async () => {
    const res = await PATCH(
      buildJsonRequest(`${BASE_URL}/${patchPayment.id}`, "PATCH", {
        amount: -500,
      }),
      buildParams(patchPayment.id),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for zero amount in update", async () => {
    const res = await PATCH(
      buildJsonRequest(`${BASE_URL}/${patchPayment.id}`, "PATCH", {
        amount: 0,
      }),
      buildParams(patchPayment.id),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for title exceeding max length in update", async () => {
    const res = await PATCH(
      buildJsonRequest(`${BASE_URL}/${patchPayment.id}`, "PATCH", {
        title: "X".repeat(201),
      }),
      buildParams(patchPayment.id),
    );
    expect(res.status).toBe(400);
  });

  it("updates updatedAt timestamp", async () => {
    const before = await testPrisma.oneTimePayment.findUnique({
      where: { id: patchPayment.id },
    });
    await new Promise((r) => setTimeout(r, 50));
    await PATCH(
      buildJsonRequest(`${BASE_URL}/${patchPayment.id}`, "PATCH", {
        notes: "Updated for timestamp test",
      }),
      buildParams(patchPayment.id),
    );
    const after = await testPrisma.oneTimePayment.findUnique({
      where: { id: patchPayment.id },
    });
    expect(after!.updatedAt.getTime()).toBeGreaterThan(
      before!.updatedAt.getTime(),
    );
  });
});

// ── DELETE /api/finance/payments/[id] ────────────────────────────────
describe("DELETE /api/finance/payments/[id]", () => {
  let delPayment: any;

  beforeAll(async () => {
    delPayment = await testPrisma.oneTimePayment.create({
      data: {
        clientId: client.id,
        companyId: company.id,
        title: "Invoice To Cancel",
        amount: 2000,
        dueDate: new Date("2026-05-01"),
        status: "pending",
      },
    });
  });

  it("soft-deletes payment, verifies DB state, returns success", async () => {
    const res = await DELETE(
      buildGetRequest(`${BASE_URL}/${delPayment.id}`),
      buildParams(delPayment.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    const db = await testPrisma.oneTimePayment.findUnique({
      where: { id: delPayment.id },
    });
    expect(db!.deletedAt).not.toBeNull();
    // Record still exists in DB (soft delete, not hard delete)
    expect(db!.title).toBe("Invoice To Cancel");
  });

  it("returns 404 for non-existent payment", async () => {
    const res = await DELETE(
      buildGetRequest(`${BASE_URL}/999999`),
      buildParams(999999),
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 for already-deleted payment", async () => {
    const res = await DELETE(
      buildGetRequest(`${BASE_URL}/${delPayment.id}`),
      buildParams(delPayment.id),
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 for non-numeric ID", async () => {
    const res = await DELETE(
      buildGetRequest(`${BASE_URL}/not-a-number`),
      buildParams("not-a-number"),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid payment ID");
  });

  it("returns 404 for payment in different company (cross-company)", async () => {
    const otherCoClient2 = await seedClient(otherCompany.id);
    const foreignPayment = await testPrisma.oneTimePayment.create({
      data: {
        clientId: otherCoClient2.id,
        companyId: otherCompany.id,
        title: "Foreign DELETE Target",
        amount: 100,
        dueDate: new Date(),
        status: "pending",
      },
    });
    const res = await DELETE(
      buildGetRequest(`${BASE_URL}/${foreignPayment.id}`),
      buildParams(foreignPayment.id),
    );
    expect(res.status).toBe(404);
  });
});

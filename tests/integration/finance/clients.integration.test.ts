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
import { GET, POST } from "@/app/api/finance/clients/route";
import {
  GET as GET_ID,
  PATCH,
  DELETE,
} from "@/app/api/finance/clients/[id]/route";
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
const BASE_URL = "http://localhost:3000/api/finance/clients";

let company: any;
let adminUser: any;
let basicUser: any;
let basicUserWithPerm: any;

beforeAll(async () => {
  await cleanupAll();
  company = await seedCompany();
  adminUser = await seedUser(company.id, { role: "admin", name: "Admin Tester" });
  basicUser = await seedUser(company.id, {
    role: "basic",
    permissions: {},
    name: "Basic No Perms",
  });
  basicUserWithPerm = await seedUser(company.id, {
    role: "basic",
    permissions: { canViewFinance: true },
    name: "Basic With Finance",
  });
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
    const res = await GET(buildGetRequest(BASE_URL));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 when basic user lacks canViewFinance", async () => {
    mockGetCurrentUser.mockResolvedValue(basicUser);
    const res = await GET(buildGetRequest(BASE_URL));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
  });

  it("returns 200 for admin user", async () => {
    const res = await GET(buildGetRequest(BASE_URL));
    expect(res.status).toBe(200);
  });

  it("returns 200 for basic user with canViewFinance", async () => {
    mockGetCurrentUser.mockResolvedValue(basicUserWithPerm);
    const res = await GET(buildGetRequest(BASE_URL));
    expect(res.status).toBe(200);
  });
});

// ── GET /api/finance/clients (list) ─────────────────────────────────
describe("GET /api/finance/clients", () => {
  let clientA: any;
  let clientB: any;
  let otherCompany: any;

  beforeAll(async () => {
    otherCompany = await seedCompany();
    clientA = await seedClient(company.id, { name: "Apex Digital Marketing" });
    clientB = await seedClient(company.id, { name: "Bright Ideas Studio" });
    // soft-deleted client — must NOT appear
    await seedClient(company.id, {
      name: "Defunct Corp",
      deletedAt: new Date(),
    });
    // other company's client — must NOT appear
    await seedClient(otherCompany.id, { name: "Rival Agency" });
  });

  it("returns company-scoped clients excluding soft-deleted", async () => {
    const res = await GET(buildGetRequest(BASE_URL));
    const body = await res.json();
    expect(res.status).toBe(200);
    const names = body.data.map((c: any) => c.name);
    expect(names).toContain("Apex Digital Marketing");
    expect(names).toContain("Bright Ideas Studio");
    expect(names).not.toContain("Defunct Corp");
    expect(names).not.toContain("Rival Agency");
  });

  it("returns correct response shape with proper types", async () => {
    const res = await GET(buildGetRequest(BASE_URL));
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(typeof body.hasMore).toBe("boolean");
    // nextCursor is number or undefined/null
    if (body.nextCursor !== undefined && body.nextCursor !== null) {
      expect(typeof body.nextCursor).toBe("number");
    }
  });

  it("does not leak companyId or deletedAt in response", async () => {
    const res = await GET(buildGetRequest(BASE_URL));
    const body = await res.json();
    for (const client of body.data) {
      expect(client).not.toHaveProperty("companyId");
      expect(client).not.toHaveProperty("deletedAt");
      // Verify expected fields exist
      expect(client).toHaveProperty("id");
      expect(client).toHaveProperty("name");
      expect(client).toHaveProperty("createdAt");
    }
  });

  it("returns empty list with hasMore: false when no clients exist", async () => {
    const emptyCo = await seedCompany();
    const emptyUser = await seedUser(emptyCo.id, { role: "admin" });
    mockGetCurrentUser.mockResolvedValue(emptyUser);
    const res = await GET(buildGetRequest(BASE_URL));
    const body = await res.json();
    expect(body.data).toEqual([]);
    expect(body.hasMore).toBe(false);
  });

  it("supports cursor-based pagination", async () => {
    const res1 = await GET(buildGetRequest(BASE_URL, { take: "1" }));
    const body1 = await res1.json();
    expect(body1.data).toHaveLength(1);
    expect(body1.hasMore).toBe(true);
    expect(typeof body1.nextCursor).toBe("number");

    const res2 = await GET(
      buildGetRequest(BASE_URL, { cursor: String(body1.nextCursor), take: "1" }),
    );
    const body2 = await res2.json();
    expect(body2.data).toHaveLength(1);
    expect(body2.data[0].id).not.toBe(body1.data[0].id);
  });
});

// ── POST /api/finance/clients ───────────────────────────────────────
describe("POST /api/finance/clients", () => {
  it("creates client with minimal payload and verifies DB state", async () => {
    const res = await POST(
      buildJsonRequest(BASE_URL, "POST", { name: "Streamline Consulting" }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe("Streamline Consulting");
    expect(body.id).toBeDefined();

    // Verify DB state
    const dbClient = await testPrisma.client.findUnique({
      where: { id: body.id },
    });
    expect(dbClient).not.toBeNull();
    expect(dbClient!.name).toBe("Streamline Consulting");
    expect(dbClient!.email).toBeNull();
    expect(dbClient!.phone).toBeNull();
    expect(dbClient!.businessName).toBeNull();
    expect(dbClient!.notes).toBeNull();
    expect(dbClient!.deletedAt).toBeNull();
  });

  it("creates client with full payload and verifies all fields", async () => {
    const payload = {
      name: "Pinnacle Web Design",
      email: "contact@pinnacle.io",
      phone: "+1-555-0142",
      businessName: "Pinnacle Digital LLC",
      notes: "Referred by existing client. Monthly retainer expected.",
    };
    const res = await POST(buildJsonRequest(BASE_URL, "POST", payload));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe(payload.name);
    expect(body.email).toBe(payload.email);
    expect(body.phone).toBe(payload.phone);
    expect(body.businessName).toBe(payload.businessName);
    expect(body.notes).toBe(payload.notes);

    // Verify DB
    const dbClient = await testPrisma.client.findUnique({
      where: { id: body.id },
    });
    expect(dbClient!.email).toBe("contact@pinnacle.io");
    expect(dbClient!.phone).toBe("+1-555-0142");
    expect(dbClient!.businessName).toBe("Pinnacle Digital LLC");
  });

  it("sets companyId from the authenticated user", async () => {
    const res = await POST(
      buildJsonRequest(BASE_URL, "POST", { name: "CompanyId Verify" }),
    );
    const body = await res.json();
    const dbClient = await testPrisma.client.findUnique({
      where: { id: body.id },
    });
    expect(dbClient!.companyId).toBe(company.id);
    // companyId should NOT be in the response (select omits it)
    expect(body).not.toHaveProperty("companyId");
  });

  it("returns 400 for missing name", async () => {
    const res = await POST(buildJsonRequest(BASE_URL, "POST", {}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.details).toBeDefined();
  });

  it("returns 400 for empty name", async () => {
    const res = await POST(buildJsonRequest(BASE_URL, "POST", { name: "" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for name exceeding 200 chars", async () => {
    const res = await POST(
      buildJsonRequest(BASE_URL, "POST", { name: "a".repeat(201) }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid email format", async () => {
    const res = await POST(
      buildJsonRequest(BASE_URL, "POST", {
        name: "Valid Name",
        email: "not-a-valid-email",
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.details.email).toBeDefined();
  });
});

// ── GET /api/finance/clients/[id] ──────────────────────────────────
describe("GET /api/finance/clients/[id]", () => {
  let client: any;
  let otherCompany2: any;
  let deletedClient: any;
  let otherCompanyClient: any;

  beforeAll(async () => {
    otherCompany2 = await seedCompany();
    client = await seedClient(company.id, {
      name: "Horizon Media Group",
      email: "info@horizon.media",
      phone: "+972-50-1234567",
      businessName: "Horizon Media Ltd",
    });
    deletedClient = await seedClient(company.id, {
      name: "Closed Account LLC",
      deletedAt: new Date(),
    });
    otherCompanyClient = await seedClient(otherCompany2.id, {
      name: "Competitor Agency",
    });
    // Seed nested records for relation testing
    await testPrisma.retainer.create({
      data: {
        clientId: client.id,
        companyId: company.id,
        title: "Monthly SEO Retainer",
        amount: 3500,
        frequency: "monthly",
        startDate: new Date("2026-01-01"),
        status: "active",
      },
    });
    await testPrisma.oneTimePayment.create({
      data: {
        clientId: client.id,
        companyId: company.id,
        title: "Website Redesign - Phase 1",
        amount: 12000,
        dueDate: new Date("2026-03-15"),
        status: "pending",
      },
    });
    await testPrisma.transaction.create({
      data: {
        clientId: client.id,
        companyId: company.id,
        relatedType: "retainer",
        relatedId: 1,
        amount: 3500,
        status: "paid",
      },
    });
    // Soft-deleted retainer for this client — should NOT appear
    await testPrisma.retainer.create({
      data: {
        clientId: client.id,
        companyId: company.id,
        title: "Cancelled Old Retainer",
        amount: 1000,
        frequency: "monthly",
        startDate: new Date("2025-01-01"),
        status: "cancelled",
        deletedAt: new Date(),
      },
    });
  });

  it("returns client with nested retainers, payments, and transactions", async () => {
    const res = await GET_ID(
      buildGetRequest(`${BASE_URL}/${client.id}`),
      buildParams(client.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Horizon Media Group");
    expect(body.email).toBe("info@horizon.media");

    // Verify nested relations exist and have correct shape
    expect(body.retainers).toHaveLength(1); // only non-deleted
    expect(body.retainers[0]).toHaveProperty("id");
    expect(body.retainers[0]).toHaveProperty("amount");
    expect(body.retainers[0]).toHaveProperty("frequency");
    expect(body.retainers[0].title).toBe("Monthly SEO Retainer");

    expect(body.oneTimePayments).toHaveLength(1);
    expect(body.oneTimePayments[0].title).toBe("Website Redesign - Phase 1");

    expect(body.transactions).toHaveLength(1);
    expect(body.transactions[0]).toHaveProperty("amount");
    expect(body.transactions[0]).toHaveProperty("status");
  });

  it("excludes soft-deleted nested records from response", async () => {
    const res = await GET_ID(
      buildGetRequest(`${BASE_URL}/${client.id}`),
      buildParams(client.id),
    );
    const body = await res.json();
    const retainerTitles = body.retainers.map((r: any) => r.title);
    expect(retainerTitles).not.toContain("Cancelled Old Retainer");
  });

  it("returns 404 for non-existent client", async () => {
    const res = await GET_ID(
      buildGetRequest(`${BASE_URL}/999999`),
      buildParams(999999),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Client not found");
  });

  it("returns 404 for client in different company", async () => {
    const res = await GET_ID(
      buildGetRequest(`${BASE_URL}/${otherCompanyClient.id}`),
      buildParams(otherCompanyClient.id),
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 for soft-deleted client", async () => {
    const res = await GET_ID(
      buildGetRequest(`${BASE_URL}/${deletedClient.id}`),
      buildParams(deletedClient.id),
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 for non-numeric ID", async () => {
    const res = await GET_ID(
      buildGetRequest(`${BASE_URL}/abc`),
      buildParams("abc"),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid client ID");
  });
});

// ── PATCH /api/finance/clients/[id] ─────────────────────────────────
describe("PATCH /api/finance/clients/[id]", () => {
  let patchClient: any;
  let otherCo: any;
  let otherCoClient: any;

  beforeAll(async () => {
    patchClient = await seedClient(company.id, {
      name: "Original Name Ltd",
      email: "original@example.com",
      phone: "+1-555-0100",
    });
    otherCo = await seedCompany();
    otherCoClient = await seedClient(otherCo.id, { name: "Foreign Corp" });
  });

  it("updates a single field and verifies DB", async () => {
    const res = await PATCH(
      buildJsonRequest(`${BASE_URL}/${patchClient.id}`, "PATCH", {
        name: "Rebranded Name Ltd",
      }),
      buildParams(patchClient.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Rebranded Name Ltd");

    const db = await testPrisma.client.findUnique({
      where: { id: patchClient.id },
    });
    expect(db!.name).toBe("Rebranded Name Ltd");
    // other fields unchanged
    expect(db!.email).toBe("original@example.com");
  });

  it("updates multiple fields simultaneously", async () => {
    const res = await PATCH(
      buildJsonRequest(`${BASE_URL}/${patchClient.id}`, "PATCH", {
        name: "Multi-Update Corp",
        email: "new@multi.com",
        phone: "+972-54-9876543",
      }),
      buildParams(patchClient.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Multi-Update Corp");
    expect(body.email).toBe("new@multi.com");
    expect(body.phone).toBe("+972-54-9876543");
  });

  it("updates updatedAt timestamp", async () => {
    const before = await testPrisma.client.findUnique({
      where: { id: patchClient.id },
    });
    // Small delay to ensure timestamp difference
    await new Promise((r) => setTimeout(r, 50));
    await PATCH(
      buildJsonRequest(`${BASE_URL}/${patchClient.id}`, "PATCH", {
        notes: "Timestamp check",
      }),
      buildParams(patchClient.id),
    );
    const after = await testPrisma.client.findUnique({
      where: { id: patchClient.id },
    });
    expect(after!.updatedAt.getTime()).toBeGreaterThan(
      before!.updatedAt.getTime(),
    );
  });

  it("returns 404 for non-existent client", async () => {
    const res = await PATCH(
      buildJsonRequest(`${BASE_URL}/999999`, "PATCH", { name: "Nope" }),
      buildParams(999999),
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 for client in another company", async () => {
    const res = await PATCH(
      buildJsonRequest(`${BASE_URL}/${otherCoClient.id}`, "PATCH", {
        name: "Hijack Attempt",
      }),
      buildParams(otherCoClient.id),
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 for empty name", async () => {
    const res = await PATCH(
      buildJsonRequest(`${BASE_URL}/${patchClient.id}`, "PATCH", { name: "" }),
      buildParams(patchClient.id),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid email in update", async () => {
    const res = await PATCH(
      buildJsonRequest(`${BASE_URL}/${patchClient.id}`, "PATCH", {
        email: "bad-email",
      }),
      buildParams(patchClient.id),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for non-numeric ID", async () => {
    const res = await PATCH(
      buildJsonRequest(`${BASE_URL}/abc`, "PATCH", { name: "Nope" }),
      buildParams("abc"),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid client ID");
  });
});

// ── DELETE /api/finance/clients/[id] ─────────────────────────────────
describe("DELETE /api/finance/clients/[id]", () => {
  let delClient: any;
  let alreadyDeleted: any;

  beforeAll(async () => {
    delClient = await seedClient(company.id, {
      name: "Sunset Ventures (To Be Deleted)",
    });
    // Create related records to verify cascade soft-delete
    await testPrisma.retainer.create({
      data: {
        clientId: delClient.id,
        companyId: company.id,
        title: "Quarterly Advisory",
        amount: 7500,
        frequency: "quarterly",
        startDate: new Date("2026-01-01"),
        status: "active",
      },
    });
    await testPrisma.oneTimePayment.create({
      data: {
        clientId: delClient.id,
        companyId: company.id,
        title: "Q1 Strategy Consulting",
        amount: 15000,
        dueDate: new Date("2026-02-28"),
        status: "pending",
      },
    });
    await testPrisma.transaction.create({
      data: {
        clientId: delClient.id,
        companyId: company.id,
        relatedType: "one_time",
        relatedId: 1,
        amount: 15000,
        status: "pending",
      },
    });
    await testPrisma.financeRecord.create({
      data: {
        clientId: delClient.id,
        companyId: company.id,
        title: "Revenue from Sunset Ventures",
        amount: 7500,
        type: "INCOME",
      },
    });

    alreadyDeleted = await seedClient(company.id, {
      name: "Previously Closed Account",
      deletedAt: new Date(),
    });
  });

  it("soft-deletes client and cascades deletedAt to all related records", async () => {
    const res = await DELETE(
      buildGetRequest(`${BASE_URL}/${delClient.id}`),
      buildParams(delClient.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Verify client itself is soft-deleted
    const dbClient = await testPrisma.client.findUnique({
      where: { id: delClient.id },
    });
    expect(dbClient!.deletedAt).not.toBeNull();

    // Verify cascade: ALL retainers for this client have deletedAt set
    const retainers = await testPrisma.retainer.findMany({
      where: { clientId: delClient.id },
    });
    expect(retainers.length).toBeGreaterThanOrEqual(1);
    for (const r of retainers) {
      expect(r.deletedAt).not.toBeNull();
    }

    // Verify cascade: ALL payments
    const payments = await testPrisma.oneTimePayment.findMany({
      where: { clientId: delClient.id },
    });
    expect(payments.length).toBeGreaterThanOrEqual(1);
    for (const p of payments) {
      expect(p.deletedAt).not.toBeNull();
    }

    // Verify cascade: ALL transactions
    const txns = await testPrisma.transaction.findMany({
      where: { clientId: delClient.id },
    });
    expect(txns.length).toBeGreaterThanOrEqual(1);
    for (const t of txns) {
      expect(t.deletedAt).not.toBeNull();
    }

    // Verify cascade: ALL finance records
    const frs = await testPrisma.financeRecord.findMany({
      where: { clientId: delClient.id },
    });
    expect(frs.length).toBeGreaterThanOrEqual(1);
    for (const fr of frs) {
      expect(fr.deletedAt).not.toBeNull();
    }
  });

  it("deleted client no longer appears in GET list", async () => {
    const res = await GET(buildGetRequest(BASE_URL));
    const body = await res.json();
    const names = body.data.map((c: any) => c.name);
    expect(names).not.toContain("Sunset Ventures (To Be Deleted)");
  });

  it("returns 404 for non-existent client", async () => {
    const res = await DELETE(
      buildGetRequest(`${BASE_URL}/999999`),
      buildParams(999999),
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 for already-deleted client", async () => {
    const res = await DELETE(
      buildGetRequest(`${BASE_URL}/${alreadyDeleted.id}`),
      buildParams(alreadyDeleted.id),
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 for non-numeric ID", async () => {
    const res = await DELETE(
      buildGetRequest(`${BASE_URL}/not-a-number`),
      buildParams("not-a-number"),
    );
    expect(res.status).toBe(400);
  });
});

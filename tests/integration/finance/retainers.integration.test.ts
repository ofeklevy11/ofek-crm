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
import { POST } from "@/app/api/finance/retainers/route";
import {
  GET,
  PATCH,
  DELETE,
} from "@/app/api/finance/retainers/[id]/route";
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
const BASE_URL = "http://localhost:3000/api/finance/retainers";

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
  });
  client = await seedClient(company.id, {
    name: "DataFlow Analytics",
    email: "billing@dataflow.io",
  });
  otherClient = await seedClient(otherCompany.id, { name: "External LLC" });
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
        title: "Auth Test",
        clientId: client.id,
        amount: 1000,
        frequency: "monthly",
        startDate: "2026-01-01T00:00:00.000Z",
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when basic user lacks canViewFinance", async () => {
    mockGetCurrentUser.mockResolvedValue(basicUser);
    const res = await POST(
      buildJsonRequest(BASE_URL, "POST", {
        title: "Auth Test",
        clientId: client.id,
        amount: 1000,
        frequency: "monthly",
        startDate: "2026-01-01T00:00:00.000Z",
      }),
    );
    expect(res.status).toBe(403);
  });

  it("returns 200 for GET with basic user who has canViewFinance", async () => {
    mockGetCurrentUser.mockResolvedValue(basicUserWithPerm);
    // Create a retainer for the GET test
    const r = await testPrisma.retainer.create({
      data: {
        clientId: client.id,
        companyId: company.id,
        title: "Auth Perm Test",
        amount: 100,
        frequency: "monthly",
        startDate: new Date(),
        status: "active",
      },
    });
    const res = await GET(
      buildGetRequest(`${BASE_URL}/${r.id}`),
      buildParams(r.id),
    );
    expect(res.status).toBe(200);
  });
});

// ── POST /api/finance/retainers ─────────────────────────────────────
describe("POST /api/finance/retainers", () => {
  it("creates retainer with valid data, defaults status to active, verifies DB", async () => {
    const res = await POST(
      buildJsonRequest(BASE_URL, "POST", {
        title: "Monthly Platform Maintenance",
        clientId: client.id,
        amount: 4500,
        frequency: "monthly",
        startDate: "2026-02-01T00:00:00.000Z",
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.title).toBe("Monthly Platform Maintenance");
    expect(body.status).toBe("active");
    expect(body.frequency).toBe("monthly");

    // Verify DB state
    const db = await testPrisma.retainer.findUnique({
      where: { id: body.id },
    });
    expect(db).not.toBeNull();
    expect(db!.title).toBe("Monthly Platform Maintenance");
    expect(db!.status).toBe("active");
    expect(db!.companyId).toBe(company.id);
    expect(db!.clientId).toBe(client.id);
    expect(Number(db!.amount)).toBeCloseTo(4500);
    expect(db!.deletedAt).toBeNull();
  });

  it("auto-calculates nextDueDate for monthly frequency (+1 month)", async () => {
    const res = await POST(
      buildJsonRequest(BASE_URL, "POST", {
        title: "Monthly SEO Services",
        clientId: client.id,
        amount: 2500,
        frequency: "monthly",
        startDate: "2026-03-15T00:00:00.000Z",
      }),
    );
    const body = await res.json();
    const nextDue = new Date(body.nextDueDate);
    expect(nextDue.getMonth()).toBe(3); // April (0-indexed)
    expect(nextDue.getDate()).toBe(15);
    expect(nextDue.getFullYear()).toBe(2026);

    // Verify in DB too
    const db = await testPrisma.retainer.findUnique({ where: { id: body.id } });
    expect(db!.nextDueDate!.getMonth()).toBe(3);
  });

  it("auto-calculates nextDueDate for quarterly frequency (+3 months)", async () => {
    const res = await POST(
      buildJsonRequest(BASE_URL, "POST", {
        title: "Quarterly Analytics Review",
        clientId: client.id,
        amount: 12000,
        frequency: "quarterly",
        startDate: "2026-01-10T00:00:00.000Z",
      }),
    );
    const body = await res.json();
    const nextDue = new Date(body.nextDueDate);
    expect(nextDue.getMonth()).toBe(3); // April
    expect(nextDue.getDate()).toBe(10);

    // Verify DB state
    const db = await testPrisma.retainer.findUnique({ where: { id: body.id } });
    expect(db!.nextDueDate!.getMonth()).toBe(3);
  });

  it("auto-calculates nextDueDate for annually frequency (+1 year)", async () => {
    const res = await POST(
      buildJsonRequest(BASE_URL, "POST", {
        title: "Annual Enterprise License",
        clientId: client.id,
        amount: 48000,
        frequency: "annually",
        startDate: "2026-06-01T00:00:00.000Z",
      }),
    );
    const body = await res.json();
    const nextDue = new Date(body.nextDueDate);
    expect(nextDue.getFullYear()).toBe(2027);
    expect(nextDue.getMonth()).toBe(5); // June

    // Verify DB state
    const db = await testPrisma.retainer.findUnique({ where: { id: body.id } });
    expect(db!.nextDueDate!.getFullYear()).toBe(2027);
  });

  it("creates retainer with optional notes", async () => {
    const res = await POST(
      buildJsonRequest(BASE_URL, "POST", {
        title: "Support Retainer with Notes",
        clientId: client.id,
        amount: 1500,
        frequency: "monthly",
        startDate: "2026-01-01T00:00:00.000Z",
        notes: "Priority support included. Review quarterly.",
      }),
    );
    expect(res.status).toBe(201);
    const db = await testPrisma.retainer.findUnique({
      where: { id: (await res.json()).id },
    });
    expect(db!.notes).toBe("Priority support included. Review quarterly.");
  });

  it("returns 404 when client not found", async () => {
    const res = await POST(
      buildJsonRequest(BASE_URL, "POST", {
        title: "Ghost Client Retainer",
        clientId: 999999,
        amount: 100,
        frequency: "monthly",
        startDate: "2026-01-01T00:00:00.000Z",
      }),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Client not found");
  });

  it("returns 404 when client belongs to other company", async () => {
    const res = await POST(
      buildJsonRequest(BASE_URL, "POST", {
        title: "Cross-Tenant Attempt",
        clientId: otherClient.id,
        amount: 100,
        frequency: "monthly",
        startDate: "2026-01-01T00:00:00.000Z",
      }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid frequency value", async () => {
    const res = await POST(
      buildJsonRequest(BASE_URL, "POST", {
        title: "Bad Freq Retainer",
        clientId: client.id,
        amount: 100,
        frequency: "biweekly",
        startDate: "2026-01-01T00:00:00.000Z",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await POST(
      buildJsonRequest(BASE_URL, "POST", { title: "Only Title" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
  });

  it("returns 400 for negative amount", async () => {
    const res = await POST(
      buildJsonRequest(BASE_URL, "POST", {
        title: "Negative Amount Retainer",
        clientId: client.id,
        amount: -500,
        frequency: "monthly",
        startDate: "2026-01-01T00:00:00.000Z",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for zero amount", async () => {
    const res = await POST(
      buildJsonRequest(BASE_URL, "POST", {
        title: "Zero Amount Retainer",
        clientId: client.id,
        amount: 0,
        frequency: "monthly",
        startDate: "2026-01-01T00:00:00.000Z",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for title exceeding max length", async () => {
    const res = await POST(
      buildJsonRequest(BASE_URL, "POST", {
        title: "X".repeat(201),
        clientId: client.id,
        amount: 1000,
        frequency: "monthly",
        startDate: "2026-01-01T00:00:00.000Z",
      }),
    );
    expect(res.status).toBe(400);
  });
});

// ── GET /api/finance/retainers/[id] ─────────────────────────────────
describe("GET /api/finance/retainers/[id]", () => {
  let retainer: any;
  let otherCoRetainer: any;
  let deletedRetainer: any;

  beforeAll(async () => {
    retainer = await testPrisma.retainer.create({
      data: {
        clientId: client.id,
        companyId: company.id,
        title: "Managed Cloud Services",
        amount: 8500,
        frequency: "monthly",
        startDate: new Date("2026-01-01"),
        status: "active",
      },
    });
    const otherCoClient2 = await seedClient(otherCompany.id);
    otherCoRetainer = await testPrisma.retainer.create({
      data: {
        clientId: otherCoClient2.id,
        companyId: otherCompany.id,
        title: "Foreign Retainer",
        amount: 100,
        frequency: "monthly",
        startDate: new Date(),
        status: "active",
      },
    });
    deletedRetainer = await testPrisma.retainer.create({
      data: {
        clientId: client.id,
        companyId: company.id,
        title: "Terminated Retainer",
        amount: 500,
        frequency: "monthly",
        startDate: new Date(),
        status: "cancelled",
        deletedAt: new Date(),
      },
    });
  });

  it("returns retainer with client relation data", async () => {
    const res = await GET(
      buildGetRequest(`${BASE_URL}/${retainer.id}`),
      buildParams(retainer.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe("Managed Cloud Services");
    expect(body.client).toBeDefined();
    expect(body.client.name).toBe("DataFlow Analytics");
    expect(body.client).toHaveProperty("id");
    expect(body.client).toHaveProperty("email");
    // Verify companyId is NOT leaked (symmetric with payments GET)
    expect(body).not.toHaveProperty("companyId");
  });

  it("returns 404 for non-existent retainer", async () => {
    const res = await GET(
      buildGetRequest(`${BASE_URL}/999999`),
      buildParams(999999),
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 for retainer in different company", async () => {
    const res = await GET(
      buildGetRequest(`${BASE_URL}/${otherCoRetainer.id}`),
      buildParams(otherCoRetainer.id),
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 for soft-deleted retainer", async () => {
    const res = await GET(
      buildGetRequest(`${BASE_URL}/${deletedRetainer.id}`),
      buildParams(deletedRetainer.id),
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

// ── PATCH /api/finance/retainers/[id] ────────────────────────────────
describe("PATCH /api/finance/retainers/[id]", () => {
  let patchRetainer: any;

  beforeAll(async () => {
    patchRetainer = await testPrisma.retainer.create({
      data: {
        clientId: client.id,
        companyId: company.id,
        title: "Original Monthly Plan",
        amount: 3000,
        frequency: "monthly",
        startDate: new Date("2026-01-01"),
        status: "active",
      },
    });
  });

  it("updates fields and verifies DB state", async () => {
    const res = await PATCH(
      buildJsonRequest(`${BASE_URL}/${patchRetainer.id}`, "PATCH", {
        title: "Premium Monthly Plan",
        amount: 5500,
      }),
      buildParams(patchRetainer.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe("Premium Monthly Plan");

    const db = await testPrisma.retainer.findUnique({
      where: { id: patchRetainer.id },
    });
    expect(db!.title).toBe("Premium Monthly Plan");
    expect(Number(db!.amount)).toBeCloseTo(5500);
  });

  it("transitions status to paused", async () => {
    const res = await PATCH(
      buildJsonRequest(`${BASE_URL}/${patchRetainer.id}`, "PATCH", {
        status: "paused",
      }),
      buildParams(patchRetainer.id),
    );
    expect(res.status).toBe(200);
    const db = await testPrisma.retainer.findUnique({
      where: { id: patchRetainer.id },
    });
    expect(db!.status).toBe("paused");
  });

  it("transitions status to cancelled", async () => {
    const res = await PATCH(
      buildJsonRequest(`${BASE_URL}/${patchRetainer.id}`, "PATCH", {
        status: "cancelled",
      }),
      buildParams(patchRetainer.id),
    );
    expect(res.status).toBe(200);
    const db = await testPrisma.retainer.findUnique({
      where: { id: patchRetainer.id },
    });
    expect(db!.status).toBe("cancelled");
  });

  it("returns 400 for invalid status enum value", async () => {
    const res = await PATCH(
      buildJsonRequest(`${BASE_URL}/${patchRetainer.id}`, "PATCH", {
        status: "suspended",
      }),
      buildParams(patchRetainer.id),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid frequency enum value", async () => {
    const res = await PATCH(
      buildJsonRequest(`${BASE_URL}/${patchRetainer.id}`, "PATCH", {
        frequency: "biweekly",
      }),
      buildParams(patchRetainer.id),
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 for non-existent retainer", async () => {
    const res = await PATCH(
      buildJsonRequest(`${BASE_URL}/999999`, "PATCH", { title: "Nope" }),
      buildParams(999999),
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 for retainer in different company (cross-company)", async () => {
    const otherCoClient2 = await seedClient(otherCompany.id);
    const foreignRetainer = await testPrisma.retainer.create({
      data: {
        clientId: otherCoClient2.id,
        companyId: otherCompany.id,
        title: "Foreign PATCH Target",
        amount: 100,
        frequency: "monthly",
        startDate: new Date(),
        status: "active",
      },
    });
    const res = await PATCH(
      buildJsonRequest(`${BASE_URL}/${foreignRetainer.id}`, "PATCH", {
        title: "Hijack Attempt",
      }),
      buildParams(foreignRetainer.id),
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
    expect(body.error).toBe("Invalid retainer ID");
  });

  it("returns 400 for negative amount in update", async () => {
    const res = await PATCH(
      buildJsonRequest(`${BASE_URL}/${patchRetainer.id}`, "PATCH", {
        amount: -500,
      }),
      buildParams(patchRetainer.id),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for zero amount in update", async () => {
    const res = await PATCH(
      buildJsonRequest(`${BASE_URL}/${patchRetainer.id}`, "PATCH", {
        amount: 0,
      }),
      buildParams(patchRetainer.id),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for title exceeding max length in update", async () => {
    const res = await PATCH(
      buildJsonRequest(`${BASE_URL}/${patchRetainer.id}`, "PATCH", {
        title: "X".repeat(201),
      }),
      buildParams(patchRetainer.id),
    );
    expect(res.status).toBe(400);
  });

  it("updates updatedAt timestamp", async () => {
    const before = await testPrisma.retainer.findUnique({
      where: { id: patchRetainer.id },
    });
    await new Promise((r) => setTimeout(r, 50));
    await PATCH(
      buildJsonRequest(`${BASE_URL}/${patchRetainer.id}`, "PATCH", {
        notes: "Timestamp verification",
      }),
      buildParams(patchRetainer.id),
    );
    const after = await testPrisma.retainer.findUnique({
      where: { id: patchRetainer.id },
    });
    expect(after!.updatedAt.getTime()).toBeGreaterThan(
      before!.updatedAt.getTime(),
    );
  });
});

// ── DELETE /api/finance/retainers/[id] ───────────────────────────────
describe("DELETE /api/finance/retainers/[id]", () => {
  let delRetainer: any;

  beforeAll(async () => {
    delRetainer = await testPrisma.retainer.create({
      data: {
        clientId: client.id,
        companyId: company.id,
        title: "Retainer to Terminate",
        amount: 2000,
        frequency: "monthly",
        startDate: new Date("2026-01-01"),
        status: "active",
      },
    });
  });

  it("soft-deletes retainer via updateMany scoped by companyId, verifies DB", async () => {
    const res = await DELETE(
      buildGetRequest(`${BASE_URL}/${delRetainer.id}`),
      buildParams(delRetainer.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    const db = await testPrisma.retainer.findUnique({
      where: { id: delRetainer.id },
    });
    expect(db!.deletedAt).not.toBeNull();
    // Still exists in DB (soft delete)
    expect(db!.title).toBe("Retainer to Terminate");
  });

  it("returns 404 when count=0 (non-existent ID)", async () => {
    const res = await DELETE(
      buildGetRequest(`${BASE_URL}/999999`),
      buildParams(999999),
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 for already-deleted retainer", async () => {
    const res = await DELETE(
      buildGetRequest(`${BASE_URL}/${delRetainer.id}`),
      buildParams(delRetainer.id),
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
    expect(body.error).toBe("Invalid retainer ID");
  });

  it("returns 404 for retainer in different company (cross-company)", async () => {
    const otherCoClient3 = await seedClient(otherCompany.id);
    const foreignRetainer = await testPrisma.retainer.create({
      data: {
        clientId: otherCoClient3.id,
        companyId: otherCompany.id,
        title: "Foreign DELETE Target",
        amount: 100,
        frequency: "monthly",
        startDate: new Date(),
        status: "active",
      },
    });
    const res = await DELETE(
      buildGetRequest(`${BASE_URL}/${foreignRetainer.id}`),
      buildParams(foreignRetainer.id),
    );
    expect(res.status).toBe(404);
  });
});

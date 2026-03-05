import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";

// ── Mocks ───────────────────────────────────────────────────────────
vi.mock("@/lib/permissions-server", () => ({
  getCurrentUser: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(null),
  RATE_LIMITS: {
    api: { prefix: "api", max: 120, windowSeconds: 60 },
    goalRead: { prefix: "goal-read", max: 60, windowSeconds: 60 },
    goalMutation: { prefix: "goal-mut", max: 30, windowSeconds: 60 },
  },
}));
vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("@/lib/services/dashboard-cache", () => ({
  invalidateGoalsCache: vi.fn().mockResolvedValue(undefined),
}));

// ── Imports ─────────────────────────────────────────────────────────
import { GET, POST } from "@/app/api/finance/goals/route";
import {
  GET as GET_ID,
  PATCH,
  DELETE,
} from "@/app/api/finance/goals/[id]/route";
import { getCurrentUser } from "@/lib/permissions-server";
import { inngest } from "@/lib/inngest/client";
import { invalidateGoalsCache } from "@/lib/services/dashboard-cache";
import {
  buildGetRequest,
  buildJsonRequest,
  buildParams,
} from "@/tests/helpers/finance-mocks";
import {
  testPrisma,
  seedCompany,
  seedUser,
  cleanupAll,
} from "./helpers";

const mockGetCurrentUser = getCurrentUser as ReturnType<typeof vi.fn>;
const mockInngestSend = inngest.send as ReturnType<typeof vi.fn>;
const mockInvalidateGoalsCache = invalidateGoalsCache as ReturnType<typeof vi.fn>;
const LIST_URL = "http://localhost:3000/api/finance/goals";

let company: any;
let adminUser: any;
let basicNoPerms: any;
let basicFinanceOnly: any;
let basicBothPerms: any;
let otherCompany: any;

function goalPayload(overrides: Record<string, any> = {}) {
  return {
    name: "Monthly Revenue Target",
    metricType: "REVENUE",
    targetValue: 50000,
    startDate: "2026-01-01T00:00:00.000Z",
    endDate: "2026-12-31T00:00:00.000Z",
    ...overrides,
  };
}

beforeAll(async () => {
  await cleanupAll();
  company = await seedCompany();
  otherCompany = await seedCompany();
  adminUser = await seedUser(company.id, { role: "admin" });
  basicNoPerms = await seedUser(company.id, { role: "basic", permissions: {} });
  basicFinanceOnly = await seedUser(company.id, {
    role: "basic",
    permissions: { canViewFinance: true },
  });
  basicBothPerms = await seedUser(company.id, {
    role: "basic",
    permissions: { canViewFinance: true, canViewGoals: true },
    name: "Basic Both Perms",
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
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 403 when basic user lacks canViewFinance", async () => {
    mockGetCurrentUser.mockResolvedValue(basicNoPerms);
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns 403 when basic user has canViewFinance but not canViewGoals", async () => {
    mockGetCurrentUser.mockResolvedValue(basicFinanceOnly);
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns 200 for admin (has both flags implicitly)", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("returns 200 for basic user with both canViewFinance and canViewGoals", async () => {
    mockGetCurrentUser.mockResolvedValue(basicBothPerms);
    const res = await GET();
    expect(res.status).toBe(200);
  });
});

// ── GET /api/finance/goals (list) ────────────────────────────────────
describe("GET /api/finance/goals", () => {
  beforeAll(async () => {
    await testPrisma.goal.create({
      data: {
        companyId: company.id,
        name: "H2 Sales Pipeline",
        metricType: "REVENUE",
        targetValue: 100000,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-06-30"),
        order: 2,
      },
    });
    await testPrisma.goal.create({
      data: {
        companyId: company.id,
        name: "Q1 New Customer Acquisition",
        metricType: "CUSTOMERS",
        targetValue: 25,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-03-31"),
        order: 1,
      },
    });
    // Archived goal — must NOT appear
    await testPrisma.goal.create({
      data: {
        companyId: company.id,
        name: "Expired 2025 Goal",
        metricType: "REVENUE",
        targetValue: 1000,
        startDate: new Date("2025-01-01"),
        endDate: new Date("2025-12-31"),
        isArchived: true,
        isActive: false,
      },
    });
    // Other company goal — must NOT appear
    await testPrisma.goal.create({
      data: {
        companyId: otherCompany.id,
        name: "Competitor Goal",
        metricType: "REVENUE",
        targetValue: 1000,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-03-31"),
      },
    });
  });

  it("returns non-archived goals ordered by order ASC, endDate ASC", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    const names = body.map((g: any) => g.name);
    expect(names).toContain("Q1 New Customer Acquisition");
    expect(names).toContain("H2 Sales Pipeline");
    expect(names).not.toContain("Expired 2025 Goal");
    expect(names).not.toContain("Competitor Goal");
    // order=1 before order=2
    expect(names.indexOf("Q1 New Customer Acquisition")).toBeLessThan(
      names.indexOf("H2 Sales Pipeline"),
    );
  });

  it("returns goals with expected field structure (strict 17-field set)", async () => {
    const res = await GET();
    const body = await res.json();
    const goal = body[0];
    const expectedFields = [
      "id", "name", "metricType", "targetType", "targetValue",
      "periodType", "startDate", "endDate", "filters",
      "warningThreshold", "criticalThreshold",
      "isActive", "isArchived", "order", "notes",
      "createdAt", "updatedAt",
    ].sort();
    expect(Object.keys(goal).sort()).toEqual(expectedFields);
    // Explicitly verify companyId is NOT leaked
    expect(goal).not.toHaveProperty("companyId");
  });
});

// ── POST /api/finance/goals ─────────────────────────────────────────
describe("POST /api/finance/goals", () => {
  it("creates goal returning 200, verifies DB state and defaults", async () => {
    const res = await POST(
      buildJsonRequest(
        LIST_URL,
        "POST",
        goalPayload({ name: "Annual Revenue Milestone" }),
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Annual Revenue Milestone");
    expect(body.metricType).toBe("REVENUE");
    expect(body.id).toBeDefined();

    // Verify DB state
    const db = await testPrisma.goal.findUnique({ where: { id: body.id } });
    expect(db).not.toBeNull();
    expect(db!.name).toBe("Annual Revenue Milestone");
    expect(db!.companyId).toBe(company.id);
    expect(db!.isActive).toBe(true);
    expect(db!.isArchived).toBe(false);
    expect(db!.order).toBe(0);
    // Verify @default values
    expect(db!.targetType).toBe("SUM");
    expect(db!.periodType).toBe("MONTHLY");
    expect(db!.warningThreshold).toBe(70);
    expect(db!.criticalThreshold).toBe(50);
  });

  it("respects explicit non-default values for targetType/periodType/thresholds", async () => {
    const res = await POST(
      buildJsonRequest(
        LIST_URL,
        "POST",
        goalPayload({
          name: "Custom Defaults Goal",
          targetType: "COUNT",
          periodType: "QUARTERLY",
          warningThreshold: 80,
          criticalThreshold: 40,
        }),
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    const db = await testPrisma.goal.findUnique({ where: { id: body.id } });
    expect(db!.targetType).toBe("COUNT");
    expect(db!.periodType).toBe("QUARTERLY");
    expect(db!.warningThreshold).toBe(80);
    expect(db!.criticalThreshold).toBe(40);
  });

  it("returns 400 when endDate < startDate", async () => {
    const res = await POST(
      buildJsonRequest(
        LIST_URL,
        "POST",
        goalPayload({
          startDate: "2026-12-31T00:00:00.000Z",
          endDate: "2026-01-01T00:00:00.000Z",
        }),
      ),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.details.endDate).toBeDefined();
  });

  it("returns 400 when warningThreshold < criticalThreshold", async () => {
    const res = await POST(
      buildJsonRequest(
        LIST_URL,
        "POST",
        goalPayload({ warningThreshold: 30, criticalThreshold: 60 }),
      ),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.details.warningThreshold).toBeDefined();
  });

  it("returns 400 for invalid metricType", async () => {
    const res = await POST(
      buildJsonRequest(
        LIST_URL,
        "POST",
        goalPayload({ metricType: "NONEXISTENT" }),
      ),
    );
    expect(res.status).toBe(400);
  });

  it("returns 413 for payload exceeding 100KB via content-length", async () => {
    const { NextRequest } = await import("next/server");
    const body = JSON.stringify(goalPayload({ notes: "x".repeat(110_000) }));
    const req = new NextRequest(new URL(LIST_URL), {
      method: "POST",
      body,
      headers: {
        "content-type": "application/json",
        "content-length": String(Buffer.byteLength(body)),
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(413);
  });

  it("returns 400 for invalid JSON body", async () => {
    const { NextRequest } = await import("next/server");
    const req = new NextRequest(new URL(LIST_URL), {
      method: "POST",
      body: "{invalid json",
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Invalid JSON body");
  });

  it("returns 400 (INVALID_TABLE) when tableId belongs to other company", async () => {
    const otherUser = await seedUser(otherCompany.id, { role: "admin" });
    const otherTable = await testPrisma.tableMeta.create({
      data: {
        companyId: otherCompany.id,
        createdBy: otherUser.id,
        name: "Foreign CRM Table",
        slug: `foreign-crm-${Date.now()}`,
        schemaJson: {},
      },
    });
    const res = await POST(
      buildJsonRequest(
        LIST_URL,
        "POST",
        goalPayload({ tableId: otherTable.id, metricType: "RECORDS" }),
      ),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("tableId");
  });

  it("returns 400 (INVALID_PRODUCT) when productId belongs to other company", async () => {
    const otherProduct = await testPrisma.product.create({
      data: {
        companyId: otherCompany.id,
        name: "Competitor Widget",
        price: 299,
      },
    });
    const res = await POST(
      buildJsonRequest(
        LIST_URL,
        "POST",
        goalPayload({ productId: otherProduct.id }),
      ),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("productId");
  });

  it("accepts valid tableId from same company", async () => {
    const ownTable = await testPrisma.tableMeta.create({
      data: {
        companyId: company.id,
        createdBy: adminUser.id,
        name: "Our CRM Table",
        slug: `own-crm-${Date.now()}`,
        schemaJson: {},
      },
    });
    const res = await POST(
      buildJsonRequest(
        LIST_URL,
        "POST",
        goalPayload({
          name: "Records Goal",
          metricType: "RECORDS",
          tableId: ownTable.id,
        }),
      ),
    );
    expect(res.status).toBe(200);
  });

  it("calls inngest.send with correct event after creation", async () => {
    await POST(
      buildJsonRequest(
        LIST_URL,
        "POST",
        goalPayload({ name: "Inngest Verification Goal" }),
      ),
    );
    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "dashboard/refresh-goals",
        data: expect.objectContaining({ companyId: company.id }),
      }),
    );
  });

  it("calls invalidateGoalsCache after creation", async () => {
    mockInvalidateGoalsCache.mockClear();
    await POST(
      buildJsonRequest(
        LIST_URL,
        "POST",
        goalPayload({ name: "Cache Invalidation Goal" }),
      ),
    );
    expect(mockInvalidateGoalsCache).toHaveBeenCalledWith(company.id);
  });

  it("returns 400 when MAX_GOALS_PER_COMPANY (50) is reached", async () => {
    // Use a separate company to avoid interference with other tests
    const capCo = await seedCompany();
    const capUser = await seedUser(capCo.id, { role: "admin" });

    // Create 50 active goals to hit the cap
    await testPrisma.goal.createMany({
      data: Array.from({ length: 50 }, (_, i) => ({
        companyId: capCo.id,
        name: `Cap Goal ${i + 1}`,
        metricType: "REVENUE",
        targetValue: 1000,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-12-31"),
      })),
    });

    mockGetCurrentUser.mockResolvedValue(capUser);
    const res = await POST(
      buildJsonRequest(
        LIST_URL,
        "POST",
        goalPayload({ name: "51st Goal Should Fail" }),
      ),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("50");
    expect(body.error).toContain("active goals reached");
  });

  it("returns 400 for zero targetValue", async () => {
    const res = await POST(
      buildJsonRequest(LIST_URL, "POST", goalPayload({ targetValue: 0 })),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for negative targetValue", async () => {
    const res = await POST(
      buildJsonRequest(LIST_URL, "POST", goalPayload({ targetValue: -1000 })),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when required name field is missing", async () => {
    const { name, ...withoutName } = goalPayload();
    const res = await POST(
      buildJsonRequest(LIST_URL, "POST", withoutName),
    );
    expect(res.status).toBe(400);
  });
});

// ── GET /api/finance/goals/[id] ──────────────────────────────────────
describe("GET /api/finance/goals/[id]", () => {
  let goal: any;
  let otherCoGoal: any;

  beforeAll(async () => {
    goal = await testPrisma.goal.create({
      data: {
        companyId: company.id,
        name: "Q3 Sales Target",
        metricType: "SALES",
        targetValue: 150,
        startDate: new Date("2026-07-01"),
        endDate: new Date("2026-09-30"),
      },
    });
    otherCoGoal = await testPrisma.goal.create({
      data: {
        companyId: otherCompany.id,
        name: "Competitor Q3 Goal",
        metricType: "REVENUE",
        targetValue: 1000,
        startDate: new Date("2026-07-01"),
        endDate: new Date("2026-09-30"),
      },
    });
  });

  it("returns goal by ID with full field set", async () => {
    const res = await GET_ID(
      buildGetRequest(`${LIST_URL}/${goal.id}`),
      buildParams(goal.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Q3 Sales Target");
    expect(body.metricType).toBe("SALES");
    expect(body).toHaveProperty("warningThreshold");
    expect(body).toHaveProperty("criticalThreshold");
    expect(body).toHaveProperty("isActive");
    expect(body).toHaveProperty("startDate");
    expect(body).toHaveProperty("endDate");
    // Verify companyId is NOT leaked (symmetric with GET list)
    expect(body).not.toHaveProperty("companyId");
  });

  it("returns 404 for non-existent goal", async () => {
    const res = await GET_ID(
      buildGetRequest(`${LIST_URL}/999999`),
      buildParams(999999),
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 for goal in different company", async () => {
    const res = await GET_ID(
      buildGetRequest(`${LIST_URL}/${otherCoGoal.id}`),
      buildParams(otherCoGoal.id),
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 for non-numeric ID", async () => {
    const res = await GET_ID(
      buildGetRequest(`${LIST_URL}/not-a-number`),
      buildParams("not-a-number"),
    );
    expect(res.status).toBe(400);
  });
});

// ── PATCH /api/finance/goals/[id] ────────────────────────────────────
describe("PATCH /api/finance/goals/[id]", () => {
  let patchGoal: any;

  beforeAll(async () => {
    patchGoal = await testPrisma.goal.create({
      data: {
        companyId: company.id,
        name: "Original Target Name",
        metricType: "REVENUE",
        targetValue: 25000,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-12-31"),
        warningThreshold: 70,
        criticalThreshold: 50,
      },
    });
  });

  it("partially updates goal and verifies DB state", async () => {
    const res = await PATCH(
      buildJsonRequest(`${LIST_URL}/${patchGoal.id}`, "PATCH", {
        name: "Revised Revenue Target",
        targetValue: 40000,
      }),
      buildParams(patchGoal.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Revised Revenue Target");

    const db = await testPrisma.goal.findUnique({
      where: { id: patchGoal.id },
    });
    expect(db!.name).toBe("Revised Revenue Target");
    expect(Number(db!.targetValue)).toBeCloseTo(40000);
    // Unchanged fields
    expect(db!.metricType).toBe("REVENUE");
    expect(db!.warningThreshold).toBe(70);
  });

  it("cross-field validation: rejects endDate < existing startDate", async () => {
    const res = await PATCH(
      buildJsonRequest(`${LIST_URL}/${patchGoal.id}`, "PATCH", {
        endDate: "2025-06-01T00:00:00.000Z",
      }),
      buildParams(patchGoal.id),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.details.endDate).toBeDefined();
  });

  it("cross-field validation: rejects warningThreshold < existing criticalThreshold", async () => {
    const res = await PATCH(
      buildJsonRequest(`${LIST_URL}/${patchGoal.id}`, "PATCH", {
        warningThreshold: 10,
      }),
      buildParams(patchGoal.id),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.details.warningThreshold).toBeDefined();
  });

  it("returns 413 for payload exceeding 100KB via content-length", async () => {
    const { NextRequest } = await import("next/server");
    const body = JSON.stringify({ name: "x".repeat(110_000) });
    const req = new NextRequest(new URL(`${LIST_URL}/${patchGoal.id}`), {
      method: "PATCH",
      body,
      headers: {
        "content-type": "application/json",
        "content-length": String(Buffer.byteLength(body)),
      },
    });
    const res = await PATCH(req, buildParams(patchGoal.id));
    expect(res.status).toBe(413);
    const json = await res.json();
    expect(json.error).toBe("Payload too large");
  });

  it("returns 400 for invalid JSON body", async () => {
    const { NextRequest } = await import("next/server");
    const req = new NextRequest(new URL(`${LIST_URL}/${patchGoal.id}`), {
      method: "PATCH",
      body: "{invalid json",
      headers: { "content-type": "application/json" },
    });
    const res = await PATCH(req, buildParams(patchGoal.id));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Invalid JSON body");
  });

  it("returns 400 for non-numeric ID", async () => {
    const res = await PATCH(
      buildJsonRequest(`${LIST_URL}/not-a-number`, "PATCH", { name: "Nope" }),
      buildParams("not-a-number"),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid goal ID");
  });

  it("returns 404 for non-existent goal", async () => {
    const res = await PATCH(
      buildJsonRequest(`${LIST_URL}/999999`, "PATCH", { name: "Nope" }),
      buildParams(999999),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Goal not found");
  });

  it("calls inngest.send after successful update", async () => {
    await PATCH(
      buildJsonRequest(`${LIST_URL}/${patchGoal.id}`, "PATCH", {
        notes: "Trigger refresh",
      }),
      buildParams(patchGoal.id),
    );
    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "dashboard/refresh-goals",
      }),
    );
  });

  it("returns 404 for goal in different company (cross-company)", async () => {
    const foreignGoal = await testPrisma.goal.create({
      data: {
        companyId: otherCompany.id,
        name: "Foreign PATCH Target",
        metricType: "REVENUE",
        targetValue: 5000,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-12-31"),
      },
    });
    const res = await PATCH(
      buildJsonRequest(`${LIST_URL}/${foreignGoal.id}`, "PATCH", {
        name: "Hijack Attempt",
      }),
      buildParams(foreignGoal.id),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Goal not found");
  });

  it("returns 400 for name exceeding max length", async () => {
    const res = await PATCH(
      buildJsonRequest(`${LIST_URL}/${patchGoal.id}`, "PATCH", {
        name: "X".repeat(201),
      }),
      buildParams(patchGoal.id),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for zero targetValue in update", async () => {
    const res = await PATCH(
      buildJsonRequest(`${LIST_URL}/${patchGoal.id}`, "PATCH", {
        targetValue: 0,
      }),
      buildParams(patchGoal.id),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for negative targetValue in update", async () => {
    const res = await PATCH(
      buildJsonRequest(`${LIST_URL}/${patchGoal.id}`, "PATCH", {
        targetValue: -500,
      }),
      buildParams(patchGoal.id),
    );
    expect(res.status).toBe(400);
  });

  it("updates isActive field and verifies DB", async () => {
    // Ensure patchGoal is active first
    await testPrisma.goal.update({
      where: { id: patchGoal.id },
      data: { isActive: true },
    });

    const res = await PATCH(
      buildJsonRequest(`${LIST_URL}/${patchGoal.id}`, "PATCH", {
        isActive: false,
      }),
      buildParams(patchGoal.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isActive).toBe(false);

    const db = await testPrisma.goal.findUnique({
      where: { id: patchGoal.id },
    });
    expect(db!.isActive).toBe(false);
  });
});

// ── DELETE /api/finance/goals/[id] ───────────────────────────────────
describe("DELETE /api/finance/goals/[id]", () => {
  let delGoal: any;

  beforeAll(async () => {
    delGoal = await testPrisma.goal.create({
      data: {
        companyId: company.id,
        name: "Retiring This Goal",
        metricType: "CUSTOMERS",
        targetValue: 200,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-12-31"),
        isActive: true,
        isArchived: false,
      },
    });
  });

  it("archives goal (sets isArchived:true, isActive:false) and verifies DB", async () => {
    const res = await DELETE(
      buildGetRequest(`${LIST_URL}/${delGoal.id}`),
      buildParams(delGoal.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    const db = await testPrisma.goal.findUnique({
      where: { id: delGoal.id },
    });
    expect(db!.isArchived).toBe(true);
    expect(db!.isActive).toBe(false);
  });

  it("archived goal no longer appears in GET list", async () => {
    const res = await GET();
    const body = await res.json();
    const names = body.map((g: any) => g.name);
    expect(names).not.toContain("Retiring This Goal");
  });

  it("calls inngest.send after successful archive", async () => {
    // Create another to delete
    const g = await testPrisma.goal.create({
      data: {
        companyId: company.id,
        name: "Another to Archive",
        metricType: "REVENUE",
        targetValue: 1000,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-06-30"),
      },
    });
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(adminUser);
    await DELETE(
      buildGetRequest(`${LIST_URL}/${g.id}`),
      buildParams(g.id),
    );
    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "dashboard/refresh-goals",
      }),
    );
  });

  it("returns error for non-existent goal (handlePrismaError P2025)", async () => {
    const res = await DELETE(
      buildGetRequest(`${LIST_URL}/999999`),
      buildParams(999999),
    );
    // handlePrismaError maps P2025 to 404
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("הפריט המבוקש לא נמצא");
  });

  it("returns 400 for non-numeric ID", async () => {
    const res = await DELETE(
      buildGetRequest(`${LIST_URL}/not-a-number`),
      buildParams("not-a-number"),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid goal ID");
  });

  it("returns 404 for goal in different company (cross-company)", async () => {
    const foreignGoal = await testPrisma.goal.create({
      data: {
        companyId: otherCompany.id,
        name: "Foreign DELETE Target",
        metricType: "REVENUE",
        targetValue: 5000,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-12-31"),
      },
    });
    const res = await DELETE(
      buildGetRequest(`${LIST_URL}/${foreignGoal.id}`),
      buildParams(foreignGoal.id),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("הפריט המבוקש לא נמצא");
  });
});

// ── Filters Validation ──────────────────────────────────────────────
describe("POST /api/finance/goals - filters validation", () => {
  it("creates goal with valid filters object", async () => {
    const res = await POST(
      buildJsonRequest(
        LIST_URL,
        "POST",
        goalPayload({
          name: "Filtered Revenue Goal",
          filters: {
            clientId: 1,
            frequency: "MONTHLY",
            source: "TRANSACTIONS",
            taskGoalMode: "COUNT",
          },
        }),
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.filters).toEqual({
      clientId: 1,
      frequency: "MONTHLY",
      source: "TRANSACTIONS",
      taskGoalMode: "COUNT",
    });

    const db = await testPrisma.goal.findUnique({ where: { id: body.id } });
    expect(db!.filters).toEqual({
      clientId: 1,
      frequency: "MONTHLY",
      source: "TRANSACTIONS",
      taskGoalMode: "COUNT",
    });
  });

  it("returns 400 when filters contain unknown key (strict mode)", async () => {
    const res = await POST(
      buildJsonRequest(
        LIST_URL,
        "POST",
        goalPayload({
          name: "Bad Filters Goal",
          filters: { unknownField: "value" },
        }),
      ),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.details.filters).toBeDefined();
  });

  it("creates goal with Hebrew columnKey in filters", async () => {
    const res = await POST(
      buildJsonRequest(
        LIST_URL,
        "POST",
        goalPayload({
          name: "Hebrew ColumnKey Goal",
          filters: { columnKey: "עמודה_test123" },
        }),
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.filters.columnKey).toBe("עמודה_test123");
  });

  it("returns 400 when filters.columnKey has invalid chars", async () => {
    const res = await POST(
      buildJsonRequest(
        LIST_URL,
        "POST",
        goalPayload({
          name: "Bad ColumnKey Goal",
          filters: { columnKey: "col key spaces!" },
        }),
      ),
    );
    expect(res.status).toBe(400);
  });

  it("PATCH updates filters field", async () => {
    const createRes = await POST(
      buildJsonRequest(
        LIST_URL,
        "POST",
        goalPayload({ name: "Filters PATCH Target" }),
      ),
    );
    const created = await createRes.json();

    const res = await PATCH(
      buildJsonRequest(`${LIST_URL}/${created.id}`, "PATCH", {
        filters: { source: "TABLE", tableId: 42 },
      }),
      buildParams(created.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.filters).toEqual({ source: "TABLE", tableId: 42 });

    const db = await testPrisma.goal.findUnique({ where: { id: created.id } });
    expect(db!.filters).toEqual({ source: "TABLE", tableId: 42 });
  });
});

// ── Boundary Values ─────────────────────────────────────────────────
describe("Boundary values", () => {
  it("POST accepts name exactly 200 characters", async () => {
    const res = await POST(
      buildJsonRequest(
        LIST_URL,
        "POST",
        goalPayload({ name: "A".repeat(200) }),
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toHaveLength(200);
  });

  it("POST rejects name of 201 characters", async () => {
    const res = await POST(
      buildJsonRequest(
        LIST_URL,
        "POST",
        goalPayload({ name: "A".repeat(201) }),
      ),
    );
    expect(res.status).toBe(400);
  });

  it("POST accepts notes exactly 2000 characters", async () => {
    const notes = "N".repeat(2000);
    const res = await POST(
      buildJsonRequest(
        LIST_URL,
        "POST",
        goalPayload({ name: "Notes Boundary Goal", notes }),
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    const db = await testPrisma.goal.findUnique({ where: { id: body.id } });
    expect(db!.notes).toHaveLength(2000);
  });

  it("POST rejects notes of 2001 characters", async () => {
    const res = await POST(
      buildJsonRequest(
        LIST_URL,
        "POST",
        goalPayload({ name: "Notes Too Long Goal", notes: "N".repeat(2001) }),
      ),
    );
    expect(res.status).toBe(400);
  });

  it("POST accepts targetValue of 0.01 (small positive)", async () => {
    const res = await POST(
      buildJsonRequest(
        LIST_URL,
        "POST",
        goalPayload({ name: "Tiny Target Goal", targetValue: 0.01 }),
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    const db = await testPrisma.goal.findUnique({ where: { id: body.id } });
    expect(Number(db!.targetValue)).toBeCloseTo(0.01);
  });

  it("POST accepts warningThreshold=0, criticalThreshold=0", async () => {
    const res = await POST(
      buildJsonRequest(
        LIST_URL,
        "POST",
        goalPayload({
          name: "Zero Thresholds Goal",
          warningThreshold: 0,
          criticalThreshold: 0,
        }),
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.warningThreshold).toBe(0);
    expect(body.criticalThreshold).toBe(0);
  });

  it("POST accepts warningThreshold=100, criticalThreshold=100", async () => {
    const res = await POST(
      buildJsonRequest(
        LIST_URL,
        "POST",
        goalPayload({
          name: "Max Thresholds Goal",
          warningThreshold: 100,
          criticalThreshold: 100,
        }),
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.warningThreshold).toBe(100);
    expect(body.criticalThreshold).toBe(100);
  });
});

// ── Notes Field CRUD ────────────────────────────────────────────────
describe("Notes field CRUD", () => {
  it("POST with null notes stores null in DB", async () => {
    const res = await POST(
      buildJsonRequest(
        LIST_URL,
        "POST",
        goalPayload({ name: "Null Notes Goal", notes: null }),
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    const db = await testPrisma.goal.findUnique({ where: { id: body.id } });
    expect(db!.notes).toBeNull();
  });

  it("POST with valid notes string stores and returns correctly", async () => {
    const res = await POST(
      buildJsonRequest(
        LIST_URL,
        "POST",
        goalPayload({
          name: "Notes Present Goal",
          notes: "Track Q1 revenue against annual budget",
        }),
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.notes).toBe("Track Q1 revenue against annual budget");

    const db = await testPrisma.goal.findUnique({ where: { id: body.id } });
    expect(db!.notes).toBe("Track Q1 revenue against annual budget");
  });

  it("PATCH notes from null to a value", async () => {
    const createRes = await POST(
      buildJsonRequest(
        LIST_URL,
        "POST",
        goalPayload({ name: "Notes Null-to-Value Goal", notes: null }),
      ),
    );
    const created = await createRes.json();

    const res = await PATCH(
      buildJsonRequest(`${LIST_URL}/${created.id}`, "PATCH", {
        notes: "Added notes after creation",
      }),
      buildParams(created.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.notes).toBe("Added notes after creation");

    const db = await testPrisma.goal.findUnique({ where: { id: created.id } });
    expect(db!.notes).toBe("Added notes after creation");
  });

  it("PATCH notes to null (clear notes)", async () => {
    const createRes = await POST(
      buildJsonRequest(
        LIST_URL,
        "POST",
        goalPayload({
          name: "Notes Value-to-Null Goal",
          notes: "Some existing notes",
        }),
      ),
    );
    const created = await createRes.json();

    const res = await PATCH(
      buildJsonRequest(`${LIST_URL}/${created.id}`, "PATCH", {
        notes: null,
      }),
      buildParams(created.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.notes).toBeNull();

    const db = await testPrisma.goal.findUnique({ where: { id: created.id } });
    expect(db!.notes).toBeNull();
  });
});

// ── Serialization ───────────────────────────────────────────────────
describe("Serialization", () => {
  it("targetValue is serialized correctly for decimal value (12345.67)", async () => {
    const res = await POST(
      buildJsonRequest(
        LIST_URL,
        "POST",
        goalPayload({ name: "Decimal Precision Goal", targetValue: 12345.67 }),
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Number(body.targetValue)).toBeCloseTo(12345.67, 2);

    const db = await testPrisma.goal.findUnique({ where: { id: body.id } });
    expect(Number(db!.targetValue)).toBeCloseTo(12345.67, 2);
  });

  it("startDate and endDate are ISO 8601 in response", async () => {
    const res = await POST(
      buildJsonRequest(
        LIST_URL,
        "POST",
        goalPayload({ name: "Date Format Goal" }),
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(typeof body.startDate).toBe("string");
    expect(typeof body.endDate).toBe("string");
    expect(new Date(body.startDate).toISOString()).toBe(body.startDate);
    expect(new Date(body.endDate).toISOString()).toBe(body.endDate);
  });

  it("createdAt and updatedAt are ISO 8601 in response", async () => {
    const res = await POST(
      buildJsonRequest(
        LIST_URL,
        "POST",
        goalPayload({ name: "Timestamp Format Goal" }),
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(typeof body.createdAt).toBe("string");
    expect(typeof body.updatedAt).toBe("string");
    expect(new Date(body.createdAt).toISOString()).toBe(body.createdAt);
    expect(new Date(body.updatedAt).toISOString()).toBe(body.updatedAt);
  });
});

// ── Full CRUD Lifecycle ─────────────────────────────────────────────
describe("Full CRUD lifecycle", () => {
  it("Create → GET by ID → PATCH → GET by ID → DELETE → verify list/getById", async () => {
    // 1. Create
    const createRes = await POST(
      buildJsonRequest(
        LIST_URL,
        "POST",
        goalPayload({ name: "Lifecycle Goal", targetValue: 10000 }),
      ),
    );
    expect(createRes.status).toBe(200);
    const created = await createRes.json();
    const goalId = created.id;

    // 2. GET by ID
    const getRes = await GET_ID(
      buildGetRequest(`${LIST_URL}/${goalId}`),
      buildParams(goalId),
    );
    expect(getRes.status).toBe(200);
    const fetched = await getRes.json();
    expect(fetched.name).toBe("Lifecycle Goal");
    expect(Number(fetched.targetValue)).toBeCloseTo(10000);

    // 3. PATCH
    const patchRes = await PATCH(
      buildJsonRequest(`${LIST_URL}/${goalId}`, "PATCH", {
        name: "Lifecycle Goal Updated",
        targetValue: 20000,
      }),
      buildParams(goalId),
    );
    expect(patchRes.status).toBe(200);
    const patched = await patchRes.json();
    expect(patched.name).toBe("Lifecycle Goal Updated");

    // 4. GET by ID after PATCH
    const getRes2 = await GET_ID(
      buildGetRequest(`${LIST_URL}/${goalId}`),
      buildParams(goalId),
    );
    expect(getRes2.status).toBe(200);
    const fetched2 = await getRes2.json();
    expect(fetched2.name).toBe("Lifecycle Goal Updated");
    expect(Number(fetched2.targetValue)).toBeCloseTo(20000);

    // 5. DELETE (soft-delete / archive)
    const delRes = await DELETE(
      buildGetRequest(`${LIST_URL}/${goalId}`),
      buildParams(goalId),
    );
    expect(delRes.status).toBe(200);

    // 6. Verify GET list excludes archived goal
    const listRes = await GET();
    const list = await listRes.json();
    const names = list.map((g: any) => g.name);
    expect(names).not.toContain("Lifecycle Goal Updated");

    // 7. GET by ID still returns it with isArchived: true
    const getRes3 = await GET_ID(
      buildGetRequest(`${LIST_URL}/${goalId}`),
      buildParams(goalId),
    );
    expect(getRes3.status).toBe(200);
    const archived = await getRes3.json();
    expect(archived.isArchived).toBe(true);
    expect(archived.isActive).toBe(false);
  });
});

// ── Unicode/Hebrew Support ──────────────────────────────────────────
describe("Unicode/Hebrew support", () => {
  it("POST with Hebrew goal name roundtrips correctly", async () => {
    const hebrewName = "יעד הכנסות חודשי";
    const res = await POST(
      buildJsonRequest(
        LIST_URL,
        "POST",
        goalPayload({ name: hebrewName }),
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe(hebrewName);

    const db = await testPrisma.goal.findUnique({ where: { id: body.id } });
    expect(db!.name).toBe(hebrewName);
  });

  it("POST with Hebrew + special chars in notes roundtrips correctly", async () => {
    const hebrewNotes = "הערות ליעד: 50,000 ₪ — כולל מע\"מ (17%)";
    const res = await POST(
      buildJsonRequest(
        LIST_URL,
        "POST",
        goalPayload({ name: "Hebrew Notes Goal", notes: hebrewNotes }),
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.notes).toBe(hebrewNotes);

    const db = await testPrisma.goal.findUnique({ where: { id: body.id } });
    expect(db!.notes).toBe(hebrewNotes);
  });
});

// ── Extra/Unknown Fields Handling ───────────────────────────────────
describe("Extra/unknown fields handling", () => {
  it("POST with extra unknown top-level fields silently strips them", async () => {
    const res = await POST(
      buildJsonRequest(LIST_URL, "POST", {
        ...goalPayload({ name: "Extra Fields Goal" }),
        nonExistentField: "should be stripped",
        anotherFake: 12345,
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).not.toHaveProperty("nonExistentField");
    expect(body).not.toHaveProperty("anotherFake");
  });

  it("PATCH with extra unknown fields silently strips them", async () => {
    const createRes = await POST(
      buildJsonRequest(
        LIST_URL,
        "POST",
        goalPayload({ name: "Extra Fields PATCH Target" }),
      ),
    );
    const created = await createRes.json();

    const res = await PATCH(
      buildJsonRequest(`${LIST_URL}/${created.id}`, "PATCH", {
        name: "Renamed Extra Fields Target",
        unknownPatchField: "nope",
      }),
      buildParams(created.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Renamed Extra Fields Target");
    expect(body).not.toHaveProperty("unknownPatchField");
  });
});

// ── Empty Body PATCH ────────────────────────────────────────────────
describe("PATCH /api/finance/goals/[id] - empty body", () => {
  let emptyPatchGoal: any;

  beforeAll(async () => {
    emptyPatchGoal = await testPrisma.goal.create({
      data: {
        companyId: company.id,
        name: "Empty PATCH Target",
        metricType: "REVENUE",
        targetValue: 30000,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-12-31"),
        warningThreshold: 70,
        criticalThreshold: 50,
      },
    });
  });

  it("PATCH with empty body returns 200 and goal is unchanged (except updatedAt)", async () => {
    const before = await testPrisma.goal.findUnique({
      where: { id: emptyPatchGoal.id },
    });

    const res = await PATCH(
      buildJsonRequest(`${LIST_URL}/${emptyPatchGoal.id}`, "PATCH", {}),
      buildParams(emptyPatchGoal.id),
    );
    expect(res.status).toBe(200);

    const after = await testPrisma.goal.findUnique({
      where: { id: emptyPatchGoal.id },
    });
    expect(after!.name).toBe(before!.name);
    expect(Number(after!.targetValue)).toBeCloseTo(Number(before!.targetValue));
    expect(after!.warningThreshold).toBe(before!.warningThreshold);
    expect(after!.criticalThreshold).toBe(before!.criticalThreshold);
    expect(after!.metricType).toBe(before!.metricType);
  });
});

// ── PATCH Both Thresholds ───────────────────────────────────────────
describe("PATCH /api/finance/goals/[id] - both thresholds", () => {
  let thresholdGoal: any;

  beforeAll(async () => {
    thresholdGoal = await testPrisma.goal.create({
      data: {
        companyId: company.id,
        name: "Threshold PATCH Target",
        metricType: "REVENUE",
        targetValue: 50000,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-12-31"),
        warningThreshold: 70,
        criticalThreshold: 50,
      },
    });
  });

  it("PATCH both thresholds with valid combo (90/30)", async () => {
    const res = await PATCH(
      buildJsonRequest(`${LIST_URL}/${thresholdGoal.id}`, "PATCH", {
        warningThreshold: 90,
        criticalThreshold: 30,
      }),
      buildParams(thresholdGoal.id),
    );
    expect(res.status).toBe(200);

    const db = await testPrisma.goal.findUnique({
      where: { id: thresholdGoal.id },
    });
    expect(db!.warningThreshold).toBe(90);
    expect(db!.criticalThreshold).toBe(30);
  });

  it("PATCH both thresholds with invalid combo (20/80)", async () => {
    const res = await PATCH(
      buildJsonRequest(`${LIST_URL}/${thresholdGoal.id}`, "PATCH", {
        warningThreshold: 20,
        criticalThreshold: 80,
      }),
      buildParams(thresholdGoal.id),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.details.warningThreshold).toBeDefined();
  });
});

// ── PATCH tableId/productId Behavior ────────────────────────────────
describe("PATCH /api/finance/goals/[id] - tableId/productId behavior", () => {
  let tpGoal: any;

  beforeAll(async () => {
    tpGoal = await testPrisma.goal.create({
      data: {
        companyId: company.id,
        name: "TableId ProductId PATCH Target",
        metricType: "REVENUE",
        targetValue: 25000,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-12-31"),
      },
    });
  });

  // Documents current behavior: tableId/productId pass Zod validation in PATCH
  // but are never written to DB (omitted from the update data spread in [id]/route.ts)
  it("PATCH with tableId and productId are accepted but silently ignored", async () => {
    const res = await PATCH(
      buildJsonRequest(`${LIST_URL}/${tpGoal.id}`, "PATCH", {
        tableId: 99999,
        productId: 88888,
      }),
      buildParams(tpGoal.id),
    );
    expect(res.status).toBe(200);

    const db = await testPrisma.goal.findUnique({
      where: { id: tpGoal.id },
    });
    // Goal should be unchanged (fields are not persisted)
    expect(db!.name).toBe("TableId ProductId PATCH Target");
    expect(Number(db!.targetValue)).toBeCloseTo(25000);
  });
});

// ── Error Resilience ────────────────────────────────────────────────
describe("Error resilience - cache/inngest failures", () => {
  it("POST returns goal even when inngest.send throws", async () => {
    mockInngestSend.mockRejectedValueOnce(new Error("Inngest service down"));

    const res = await POST(
      buildJsonRequest(
        LIST_URL,
        "POST",
        goalPayload({ name: "Inngest Failure Goal" }),
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Inngest Failure Goal");
    expect(body.id).toBeDefined();
  });

  it("POST returns goal even when invalidateGoalsCache throws", async () => {
    mockInvalidateGoalsCache.mockRejectedValueOnce(
      new Error("Cache service down"),
    );

    const res = await POST(
      buildJsonRequest(
        LIST_URL,
        "POST",
        goalPayload({ name: "Cache Failure Goal" }),
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Cache Failure Goal");
    expect(body.id).toBeDefined();
  });

  it("PATCH returns goal even when inngest.send throws", async () => {
    const createRes = await POST(
      buildJsonRequest(
        LIST_URL,
        "POST",
        goalPayload({ name: "PATCH Inngest Failure Target" }),
      ),
    );
    const created = await createRes.json();
    mockInngestSend.mockRejectedValueOnce(new Error("Inngest service down"));

    const res = await PATCH(
      buildJsonRequest(`${LIST_URL}/${created.id}`, "PATCH", {
        name: "PATCH Inngest Failure Updated",
      }),
      buildParams(created.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("PATCH Inngest Failure Updated");
  });
});

// ── PATCH Cache Invalidation Asymmetry ──────────────────────────────
describe("PATCH cache invalidation asymmetry", () => {
  let asymGoal: any;

  beforeAll(async () => {
    asymGoal = await testPrisma.goal.create({
      data: {
        companyId: company.id,
        name: "Cache Asymmetry Target",
        metricType: "REVENUE",
        targetValue: 15000,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-12-31"),
      },
    });
  });

  it("PATCH does not call invalidateGoalsCache (only inngest.send)", async () => {
    mockInvalidateGoalsCache.mockClear();
    mockInngestSend.mockClear();

    await PATCH(
      buildJsonRequest(`${LIST_URL}/${asymGoal.id}`, "PATCH", {
        name: "Cache Asymmetry Updated",
      }),
      buildParams(asymGoal.id),
    );

    expect(mockInvalidateGoalsCache).toHaveBeenCalledTimes(0);
    expect(mockInngestSend).toHaveBeenCalledTimes(1);
  });
});

// ── All Metric Types ────────────────────────────────────────────────
describe("POST /api/finance/goals - all metric types", () => {
  it.each(["SALES", "TASKS", "RETAINERS", "QUOTES", "CALENDAR"] as const)(
    "accepts metricType %s",
    async (metricType) => {
      const res = await POST(
        buildJsonRequest(
          LIST_URL,
          "POST",
          goalPayload({ name: `${metricType} Metric Goal`, metricType }),
        ),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.metricType).toBe(metricType);
    },
  );
});

// ── Valid productId from Same Company ───────────────────────────────
describe("POST /api/finance/goals - valid productId", () => {
  it("accepts valid productId from same company", async () => {
    const ownProduct = await testPrisma.product.create({
      data: {
        companyId: company.id,
        name: "Our Premium Widget",
        price: 499,
      },
    });

    const res = await POST(
      buildJsonRequest(
        LIST_URL,
        "POST",
        goalPayload({
          name: "Product Goal",
          productId: ownProduct.id,
        }),
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Product Goal");
  });
});

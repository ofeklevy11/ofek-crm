import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import type { User } from "@/lib/permissions";

// ── Hoisted mocks ────────────────────────────────────────────────────
const {
  mockGetCurrentUser,
  mockCheckActionRateLimit,
  mockGetCachedGoals,
  mockGetCachedTableWidget,
  mockSetCachedTableWidget,
  mockBuildWidgetHash,
  mockGetAnalyticsDataForDashboard,
  mockGetGoalsForCompanyInternal,
  mockInngestSend,
  mockProcessViewServer,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockCheckActionRateLimit: vi.fn(),
  mockGetCachedGoals: vi.fn(),
  mockGetCachedTableWidget: vi.fn(),
  mockSetCachedTableWidget: vi.fn(),
  mockBuildWidgetHash: vi.fn(),
  mockGetAnalyticsDataForDashboard: vi.fn(),
  mockGetGoalsForCompanyInternal: vi.fn(),
  mockInngestSend: vi.fn(),
  mockProcessViewServer: vi.fn(),
}));

// ── Module mocks (only external dependencies) ───────────────────────

vi.mock("@/lib/permissions-server", () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock("@/lib/rate-limit-action", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit-action")>();
  return {
    ...actual,
    checkActionRateLimit: mockCheckActionRateLimit,
  };
});

vi.mock("@/lib/services/dashboard-cache", () => ({
  getCachedGoals: mockGetCachedGoals,
  getCachedTableWidget: mockGetCachedTableWidget,
  setCachedTableWidget: mockSetCachedTableWidget,
  buildWidgetHash: mockBuildWidgetHash,
}));

vi.mock("@/app/actions/analytics", () => ({
  getAnalyticsDataForDashboard: mockGetAnalyticsDataForDashboard,
}));

vi.mock("@/lib/services/goal-computation", () => ({
  getGoalsForCompanyInternal: mockGetGoalsForCompanyInternal,
}));

vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: mockInngestSend },
}));

vi.mock("@/lib/viewProcessorServer", () => ({
  processViewServer: mockProcessViewServer,
}));

vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(null),
    del: vi.fn().mockResolvedValue(null),
    mget: vi.fn().mockResolvedValue([null, null]),
    multi: vi.fn(() => ({
      incr: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([[null, 1]]),
    })),
    pipeline: vi.fn(() => ({
      set: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([]),
    })),
    scan: vi.fn().mockResolvedValue(["0", []]),
    options: { keyPrefix: "" },
  },
  redisPublisher: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(null),
    del: vi.fn().mockResolvedValue(null),
  },
}));

// ── Import server actions AFTER mocks ────────────────────────────────
import {
  getDashboardInitialData,
  getTableViewData,
  getCustomTableData,
  getBatchTableData,
} from "@/app/actions/dashboard";
import { DASHBOARD_RATE_LIMITS } from "@/lib/rate-limit-action";

// ── Seeded IDs ───────────────────────────────────────────────────────
let companyA: { id: number };
let companyB: { id: number };
let adminUser: { id: number };
let managerUser: { id: number };
let basicUser: { id: number };
let writeBasicUser: { id: number };
let otherCompanyUser: { id: number };
let table1: { id: number; slug: string };
let table2: { id: number; slug: string };
let softDeletedTable: { id: number };
let otherTable: { id: number };
let view1: { id: number };
let view2: { id: number };
let disabledView: { id: number };
let view2Table2: { id: number };
let records: { id: number }[];
let nullCreatorRecord: { id: number };

// ── User factories ───────────────────────────────────────────────────

function makeAdminUser(): User {
  return {
    id: adminUser.id,
    companyId: companyA.id,
    name: "Admin User",
    email: "admin-integ@test.com",
    role: "admin",
    allowedWriteTableIds: [],
    permissions: {},
    tablePermissions: {},
  };
}

function makeManagerUser(): User {
  return {
    id: managerUser.id,
    companyId: companyA.id,
    name: "Manager User",
    email: "manager-integ@test.com",
    role: "manager",
    allowedWriteTableIds: [],
    permissions: { canViewDashboardData: true },
    tablePermissions: {},
  };
}

function makeBasicUser(): User {
  return {
    id: basicUser.id,
    companyId: companyA.id,
    name: "Basic User",
    email: "basic-integ@test.com",
    role: "basic",
    allowedWriteTableIds: [],
    permissions: { canViewDashboardData: true },
    tablePermissions: { [String(table1.id)]: "read" },
  };
}

function makeWriteBasicUser(): User {
  return {
    id: writeBasicUser.id,
    companyId: companyA.id,
    name: "Write Basic User",
    email: "write-basic-integ@test.com",
    role: "basic",
    allowedWriteTableIds: [],
    permissions: { canViewDashboardData: true },
    tablePermissions: { [String(table2.id)]: "write" },
  };
}

function makeOtherCompanyUser(): User {
  return {
    id: otherCompanyUser.id,
    companyId: companyB.id,
    name: "Other User",
    email: "other-integ@test.com",
    role: "admin",
    allowedWriteTableIds: [],
    permissions: {},
    tablePermissions: {},
  };
}

// ── Seed data ────────────────────────────────────────────────────────

const SCHEMA_JSON = [
  { name: "name", label: "Name", type: "string" },
  { name: "value", label: "Value", type: "number" },
  { name: "status", label: "Status", type: "string" },
  { name: "email", label: "Email", type: "string" },
  { name: "phone", label: "Phone", type: "string" },
  { name: "city", label: "City", type: "string" },
  { name: "notes", label: "Notes", type: "string" },
  { name: "extra", label: "Extra", type: "string" },
];

beforeAll(async () => {
  // 1. Companies
  companyA = await prisma.company.create({
    data: { name: "IntegTest Co A", slug: `integ-test-a-${Date.now()}` },
  });
  companyB = await prisma.company.create({
    data: { name: "IntegTest Co B", slug: `integ-test-b-${Date.now()}` },
  });

  // 2. Users
  adminUser = await prisma.user.create({
    data: {
      companyId: companyA.id,
      name: "Admin User",
      email: `admin-integ-${Date.now()}@test.com`,
      passwordHash: "not-a-real-hash",
      role: "admin",
      permissions: {},
      tablePermissions: {},
    },
  });
  managerUser = await prisma.user.create({
    data: {
      companyId: companyA.id,
      name: "Manager User",
      email: `manager-integ-${Date.now()}@test.com`,
      passwordHash: "not-a-real-hash",
      role: "manager",
      permissions: { canViewDashboardData: true },
      tablePermissions: {},
    },
  });
  basicUser = await prisma.user.create({
    data: {
      companyId: companyA.id,
      name: "Basic User",
      email: `basic-integ-${Date.now()}@test.com`,
      passwordHash: "not-a-real-hash",
      role: "basic",
      permissions: { canViewDashboardData: true },
      tablePermissions: {},
    },
  });
  writeBasicUser = await prisma.user.create({
    data: {
      companyId: companyA.id,
      name: "Write Basic User",
      email: `write-basic-integ-${Date.now()}@test.com`,
      passwordHash: "not-a-real-hash",
      role: "basic",
      permissions: { canViewDashboardData: true },
      tablePermissions: {},
    },
  });
  otherCompanyUser = await prisma.user.create({
    data: {
      companyId: companyB.id,
      name: "Other User",
      email: `other-integ-${Date.now()}@test.com`,
      passwordHash: "not-a-real-hash",
      role: "admin",
      permissions: {},
      tablePermissions: {},
    },
  });

  // 3. TableMeta
  table1 = await prisma.tableMeta.create({
    data: {
      companyId: companyA.id,
      name: "Test Table 1",
      slug: `test-table-1-${Date.now()}`,
      createdBy: adminUser.id,
      schemaJson: SCHEMA_JSON,
    },
  });
  table2 = await prisma.tableMeta.create({
    data: {
      companyId: companyA.id,
      name: "Test Table 2",
      slug: `test-table-2-${Date.now()}`,
      createdBy: adminUser.id,
      schemaJson: SCHEMA_JSON,
    },
  });
  softDeletedTable = await prisma.tableMeta.create({
    data: {
      companyId: companyA.id,
      name: "Soft Deleted Table",
      slug: `soft-deleted-${Date.now()}`,
      createdBy: adminUser.id,
      schemaJson: SCHEMA_JSON,
      deletedAt: new Date(),
    },
  });
  otherTable = await prisma.tableMeta.create({
    data: {
      companyId: companyB.id,
      name: "Other Table",
      slug: `other-table-${Date.now()}`,
      createdBy: otherCompanyUser.id,
      schemaJson: SCHEMA_JSON,
    },
  });

  // Update user tablePermissions to reference real table IDs
  await prisma.user.update({
    where: { id: basicUser.id },
    data: { tablePermissions: { [String(table1.id)]: "read" } },
  });
  await prisma.user.update({
    where: { id: writeBasicUser.id },
    data: { tablePermissions: { [String(table2.id)]: "write" } },
  });

  // 4. Views
  view1 = await prisma.view.create({
    data: {
      companyId: companyA.id,
      tableId: table1.id,
      name: "View 1",
      slug: `view-1-${Date.now()}`,
      config: { type: "count", filters: [] },
      isEnabled: true,
      order: 1,
    },
  });
  view2 = await prisma.view.create({
    data: {
      companyId: companyA.id,
      tableId: table1.id,
      name: "View 2",
      slug: `view-2-${Date.now()}`,
      config: { type: "sum", field: "value" },
      isEnabled: true,
      order: 2,
    },
  });
  disabledView = await prisma.view.create({
    data: {
      companyId: companyA.id,
      tableId: table1.id,
      name: "Disabled View",
      slug: `disabled-view-${Date.now()}`,
      config: { type: "count", filters: [] },
      isEnabled: false,
      order: 3,
    },
  });
  view2Table2 = await prisma.view.create({
    data: {
      companyId: companyA.id,
      tableId: table2.id,
      name: "View for Table 2",
      slug: `view-t2-${Date.now()}`,
      config: { type: "count", filters: [] },
      isEnabled: true,
      order: 1,
    },
  });

  // 5. Records for table1 (5 normal records)
  const recordData = [
    { name: "Alice Cohen", value: 100, status: "active", email: "alice@example.com", phone: "050-1234567", city: "Tel Aviv", notes: "VIP client", extra: "premium" },
    { name: "Bob Levy", value: 200, status: "active", email: "bob@example.com", phone: "052-2345678", city: "Jerusalem", notes: "Renewal pending", extra: "standard" },
    { name: "Charlie David", value: 50, status: "inactive", email: "charlie@example.com", phone: "054-3456789", city: "Haifa", notes: "Churned Q3", extra: "basic" },
    { name: "Dana Raz", value: 300, status: "active", email: "dana@example.com", phone: "058-4567890", city: "Tel Aviv", notes: "Enterprise plan", extra: "premium" },
    { name: "Eve Shapira", value: 150, status: "inactive", email: "eve@example.com", phone: "053-5678901", city: "Jerusalem", notes: "Trial expired", extra: "trial" },
  ];

  records = [];
  for (const data of recordData) {
    const rec = await prisma.record.create({
      data: {
        companyId: companyA.id,
        tableId: table1.id,
        data,
        createdBy: adminUser.id,
        updatedBy: adminUser.id,
      },
    });
    records.push(rec);
  }

  // 6. Record with null createdBy/updatedBy (tests "מערכת" fallback)
  nullCreatorRecord = await prisma.record.create({
    data: {
      companyId: companyA.id,
      tableId: table1.id,
      data: { name: "System Record", value: 999, status: "system", email: "system@auto.com", phone: "000-0000000", city: "System", notes: "Auto-generated", extra: "none" },
      // createdBy and updatedBy intentionally omitted (null) to test fallback
    },
  });
}, 30_000);

// ── Cleanup ──────────────────────────────────────────────────────────

afterAll(async () => {
  const companyIds = [companyA?.id, companyB?.id].filter(Boolean) as number[];
  if (companyIds.length === 0) return;

  await prisma.record.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.view.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.tableMeta.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.user.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.company.deleteMany({ where: { id: { in: companyIds } } });

  await prisma.$disconnect();
}, 15_000);

// ── Default mock setup ───────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckActionRateLimit.mockResolvedValue(null);
  mockGetCachedGoals.mockResolvedValue(null);
  mockGetCachedTableWidget.mockResolvedValue(null);
  mockSetCachedTableWidget.mockResolvedValue(undefined);
  mockBuildWidgetHash.mockImplementation(
    (tableId: number, viewId: number | string, settings?: any) => `${tableId}|${viewId}`,
  );
  mockGetAnalyticsDataForDashboard.mockResolvedValue({ success: true, data: [{ id: 1, label: "Metric" }] });
  mockGetGoalsForCompanyInternal.mockResolvedValue([{ id: 1, name: "Goal 1" }]);
  mockInngestSend.mockResolvedValue(undefined);
  mockProcessViewServer.mockResolvedValue({ type: "view", data: { records: [], columns: [] } });
});

// =====================================================================
// A. getDashboardInitialData()
// =====================================================================

describe("getDashboardInitialData()", () => {
  it("admin happy path: returns exact tables with views, analytics, goals", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const result = await getDashboardInitialData();

    expect(result).toHaveProperty("tables");
    expect(result).toHaveProperty("analyticsViews");
    expect(result).toHaveProperty("goals");
    // Admin sees exactly 2 live tables (soft-deleted excluded)
    expect(result.tables.length).toBe(2);
    const tableIds = result.tables.map((t: any) => t.id);
    expect(tableIds).toContain(table1.id);
    expect(tableIds).toContain(table2.id);
    expect(tableIds).not.toContain(softDeletedTable.id);
    // W3 fix: verify full table field set from getTablesForDashboardInternal select clause
    for (const table of result.tables) {
      expect(table).toHaveProperty("id");
      expect(table).toHaveProperty("name");
      expect(table).toHaveProperty("slug");
      expect(table).toHaveProperty("companyId", companyA.id);
      expect(table).toHaveProperty("createdBy");
      expect(table).toHaveProperty("categoryId");
      expect(table).toHaveProperty("order");
      expect(table).toHaveProperty("createdAt");
      expect(table).toHaveProperty("updatedAt");
      expect(table).toHaveProperty("views");
      expect(Array.isArray(table.views)).toBe(true);
      // W2 fix: verify heavy columns are NOT present (perf-critical — 50-200KB per table)
      expect(table).not.toHaveProperty("schemaJson");
      expect(table).not.toHaveProperty("tabsConfig");
      expect(table).not.toHaveProperty("displayConfig");
    }
  });

  it("manager happy path: sees all live tables like admin", async () => {
    mockGetCurrentUser.mockResolvedValue(makeManagerUser());

    const result = await getDashboardInitialData();

    // Manager has full read access — same as admin
    expect(result.tables.length).toBe(2);
    const tableIds = result.tables.map((t: any) => t.id);
    expect(tableIds).toContain(table1.id);
    expect(tableIds).toContain(table2.id);
    expect(tableIds).not.toContain(softDeletedTable.id);
    // Manager sees views for both tables
    const t1 = result.tables.find((t: any) => t.id === table1.id);
    expect(t1!.views.length).toBe(2);
  });

  it("soft-deleted table excluded from dashboard", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const result = await getDashboardInitialData();

    const tableIds = result.tables.map((t: any) => t.id);
    expect(tableIds).not.toContain(softDeletedTable.id);
    // Verify via direct DB that the soft-deleted table still exists
    const dbTable = await prisma.tableMeta.findUnique({ where: { id: softDeletedTable.id } });
    expect(dbTable).not.toBeNull();
    expect(dbTable!.deletedAt).not.toBeNull();
  });

  it("disabled views are filtered out (isEnabled: false)", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const result = await getDashboardInitialData();

    const t1 = result.tables.find((t: any) => t.id === table1.id);
    expect(t1).toBeDefined();
    const viewIds = t1!.views.map((v: any) => v.id);
    expect(viewIds).toContain(view1.id);
    expect(viewIds).toContain(view2.id);
    expect(viewIds).not.toContain(disabledView.id);
  });

  it("views are grouped by table correctly", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const result = await getDashboardInitialData();

    const t1 = result.tables.find((t: any) => t.id === table1.id);
    const t2 = result.tables.find((t: any) => t.id === table2.id);
    expect(t1).toBeDefined();
    expect(t2).toBeDefined();
    expect(t1!.views.length).toBe(2);
    expect(t2!.views.length).toBe(1);
    expect(t2!.views[0].id).toBe(view2Table2.id);
  });

  it("view select fields: exactly id, tableId, name, config", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const result = await getDashboardInitialData();

    const t1 = result.tables.find((t: any) => t.id === table1.id);
    for (const view of t1!.views) {
      expect(Object.keys(view).sort()).toEqual(["config", "id", "name", "tableId"]);
      expect(view).not.toHaveProperty("slug");
      expect(view).not.toHaveProperty("order");
      expect(view).not.toHaveProperty("isEnabled");
    }
  });

  it("basic user: tables/views filtered by tablePermissions", async () => {
    mockGetCurrentUser.mockResolvedValue(makeBasicUser());

    const result = await getDashboardInitialData();

    // Basic user only has read access to table1
    const tableIds = result.tables.map((t: any) => t.id);
    expect(tableIds).toContain(table1.id);
    expect(tableIds).not.toContain(table2.id);
    // Views should only include views for table1
    const allViewIds = result.tables.flatMap((t: any) => t.views.map((v: any) => v.id));
    expect(allViewIds).not.toContain(view2Table2.id);
  });

  it("basic user with 'write' permission: can see the table", async () => {
    mockGetCurrentUser.mockResolvedValue(makeWriteBasicUser());

    const result = await getDashboardInitialData();

    // writeBasicUser has "write" on table2 — should see table2 and its views
    const tableIds = result.tables.map((t: any) => t.id);
    expect(tableIds).toContain(table2.id);
    expect(tableIds).not.toContain(table1.id);
    const allViewIds = result.tables.flatMap((t: any) => t.views.map((v: any) => v.id));
    expect(allViewIds).toContain(view2Table2.id);
  });

  it("unauthorized (null user) throws 'Unauthorized'", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    await expect(getDashboardInitialData()).rejects.toThrow("Unauthorized");
  });

  it("missing canViewDashboardData flag throws 'Forbidden'", async () => {
    mockGetCurrentUser.mockResolvedValue({
      ...makeBasicUser(),
      permissions: {},
    });

    await expect(getDashboardInitialData()).rejects.toThrow("Forbidden");
  });

  it("rate limited throws rate limit error", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());
    mockCheckActionRateLimit.mockResolvedValue({ error: "Rate limit exceeded. Please try again later." });

    await expect(getDashboardInitialData()).rejects.toThrow("Rate limit exceeded");
  });

  it("fresh cached goals are served from cache (no live fetch)", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());
    mockGetCachedGoals.mockResolvedValue({ data: [{ id: 99, name: "Cached Goal" }], stale: false });

    const result = await getDashboardInitialData();

    expect(result.goals).toEqual([{ id: 99, name: "Cached Goal" }]);
    expect(mockGetGoalsForCompanyInternal).not.toHaveBeenCalled();
  });

  it("stale cached goals: served + inngest refresh triggered", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());
    mockGetCachedGoals.mockResolvedValue({ data: [{ id: 99, name: "Stale Goal" }], stale: true });

    const result = await getDashboardInitialData();

    expect(result.goals).toEqual([{ id: 99, name: "Stale Goal" }]);
    // W2 fix: use vi.waitFor instead of flaky setTimeout for fire-and-forget microtask
    await vi.waitFor(() => {
      expect(mockInngestSend).toHaveBeenCalledWith(
        expect.objectContaining({ name: "dashboard/refresh-goals" }),
      );
    }, { timeout: 200 });
  });

  it("cache miss: getGoalsForCompanyInternal called with skipCache true", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());
    mockGetCachedGoals.mockResolvedValue(null);
    mockGetGoalsForCompanyInternal.mockResolvedValue([{ id: 1, name: "Live Goal" }]);

    const result = await getDashboardInitialData();

    expect(result.goals).toEqual([{ id: 1, name: "Live Goal" }]);
    expect(mockGetGoalsForCompanyInternal).toHaveBeenCalledWith(companyA.id, { skipCache: true });
  });

  it("settled() fallback: goals computation failure returns []", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());
    mockGetCachedGoals.mockResolvedValue(null);
    mockGetGoalsForCompanyInternal.mockRejectedValue(new Error("Goals computation boom"));

    const result = await getDashboardInitialData();

    expect(result.goals).toEqual([]);
    // Tables and analytics should still work
    expect(result.tables.length).toBe(2);
  });

  it("multi-tenancy isolation: other company data never leaks", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const result = await getDashboardInitialData();

    const tableIds = result.tables.map((t: any) => t.id);
    expect(tableIds).not.toContain(otherTable.id);
    // DB-level verification: every returned view belongs to companyA
    const allViewIds = result.tables.flatMap((t: any) => t.views.map((v: any) => v.id));
    for (const vid of allViewIds) {
      const view = await prisma.view.findUnique({ where: { id: vid } });
      expect(view?.companyId).toBe(companyA.id);
    }
  });

  it("analytics failure: graceful degradation (settled fallback to [])", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());
    mockGetAnalyticsDataForDashboard.mockRejectedValue(new Error("Analytics boom"));

    const result = await getDashboardInitialData();

    expect(result.analyticsViews).toEqual([]);
    expect(result.tables.length).toBe(2);
  });

  it("empty company: returns tables but no views", async () => {
    mockGetCurrentUser.mockResolvedValue(makeOtherCompanyUser());

    const result = await getDashboardInitialData();

    // CompanyB has 1 table (otherTable) with 0 views
    expect(result.tables.length).toBe(1);
    const otherT = result.tables.find((t: any) => t.id === otherTable.id);
    expect(otherT).toBeDefined();
    expect(otherT!.views).toEqual([]);
  });

  it("rate limit called with DASHBOARD_RATE_LIMITS.read config", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    await getDashboardInitialData();

    expect(mockCheckActionRateLimit).toHaveBeenCalledWith(
      String(adminUser.id),
      DASHBOARD_RATE_LIMITS.read,
    );
  });

  it("view ordering: order asc then createdAt asc", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const result = await getDashboardInitialData();

    const t1 = result.tables.find((t: any) => t.id === table1.id);
    expect(t1).toBeDefined();
    // view1 (order:1) should come before view2 (order:2)
    const viewIds = t1!.views.map((v: any) => v.id);
    expect(viewIds.indexOf(view1.id)).toBeLessThan(viewIds.indexOf(view2.id));
    expect(viewIds[0]).toBe(view1.id);
    expect(viewIds[1]).toBe(view2.id);
  });
});

// =====================================================================
// B. getTableViewData()
// =====================================================================

describe("getTableViewData()", () => {
  it("happy path: real prisma.view.findFirst + mock processViewServer", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());
    mockProcessViewServer.mockResolvedValue({ type: "view-result", data: { records: [{ id: 1 }] } });

    const result = await getTableViewData(table1.id, view1.id);

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ type: "view-result", data: { records: [{ id: 1 }] } });
    // W8 fix: verify processViewServer receives correct config from DB view
    expect(mockProcessViewServer).toHaveBeenCalledWith(
      expect.objectContaining({
        tableId: table1.id,
        companyId: companyA.id,
        config: expect.objectContaining({ type: "count", filters: [] }),
      }),
    );
    // Verify setCachedTableWidget was called to cache the result
    expect(mockSetCachedTableWidget).toHaveBeenCalledWith(
      companyA.id,
      expect.any(String),
      expect.objectContaining({ type: "view-result" }),
    );
  });

  it("cache hit returns cached data, no DB query", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());
    mockGetCachedTableWidget.mockResolvedValue({ type: "cached-data" });

    const result = await getTableViewData(table1.id, view1.id);

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ type: "cached-data" });
    expect(mockProcessViewServer).not.toHaveBeenCalled();
  });

  it("bypassCache: true skips cache", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());
    mockGetCachedTableWidget.mockResolvedValue({ type: "cached-data" });
    mockProcessViewServer.mockResolvedValue({ type: "fresh-data" });

    const result = await getTableViewData(table1.id, view1.id, true);

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ type: "fresh-data" });
    expect(mockGetCachedTableWidget).not.toHaveBeenCalled();
  });

  it("basic user denied access to unauthorized table", async () => {
    mockGetCurrentUser.mockResolvedValue(makeBasicUser());

    const result = await getTableViewData(table2.id, view2Table2.id);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Access denied");
  });

  it("viewId 'custom' returns error message", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const result = await getTableViewData(table1.id, "custom");

    expect(result.success).toBe(false);
    expect(result.error).toContain("custom");
  });

  it("invalid input (negative tableId) returns Zod validation error", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const result = await getTableViewData(-1, view1.id);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Invalid input");
  });

  it("non-existent view returns 'Table or view not found'", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const result = await getTableViewData(table1.id, 999999);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Table or view not found");
  });

  it("processViewServer receives correct DB config from view", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());
    mockProcessViewServer.mockResolvedValue({ type: "view-result", data: { records: [] } });

    await getTableViewData(table1.id, view2.id);

    // view2 was seeded with config: { type: "sum", field: "value" }
    expect(mockProcessViewServer).toHaveBeenCalledWith(
      expect.objectContaining({
        tableId: table1.id,
        companyId: companyA.id,
        config: expect.objectContaining({ type: "sum", field: "value" }),
      }),
    );
  });

  it("rate limited returns rate limit error", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());
    mockCheckActionRateLimit.mockResolvedValue({ error: "Rate limit exceeded. Please try again later." });

    const result = await getTableViewData(table1.id, view1.id);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Rate limit");
  });

  it("cross-table isolation: view from table1 queried with table2 ID returns not found", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const result = await getTableViewData(table2.id, view1.id);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Table or view not found");
  });

  it("processViewServer exception → graceful 'Failed to fetch data'", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());
    mockProcessViewServer.mockRejectedValue(new Error("processViewServer boom"));

    const result = await getTableViewData(table1.id, view1.id);

    // The catch block should return a graceful error, not crash
    expect(result.success).toBe(false);
    expect(result.error).toBe("Failed to fetch data");
  });

  it("rate limit called with DASHBOARD_RATE_LIMITS.read config", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());
    mockProcessViewServer.mockResolvedValue({ type: "view-data", data: { records: [] } });

    await getTableViewData(table1.id, view1.id);

    expect(mockCheckActionRateLimit).toHaveBeenCalledWith(
      String(adminUser.id),
      DASHBOARD_RATE_LIMITS.read,
    );
  });
});

// =====================================================================
// C. getCustomTableData()
// =====================================================================

describe("getCustomTableData()", () => {
  // ── Happy paths ──────────────────────────────────────────────────

  it("happy path with default settings — real Prisma queries", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const result = await getCustomTableData(table1.id, {});

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data.type).toBe("custom-table");
    expect(result.data.title).toBe("Test Table 1");
    expect(result.data.data.tableId).toBe(table1.id);
    expect(Array.isArray(result.data.data.records)).toBe(true);
    expect(Array.isArray(result.data.data.columns)).toBe(true);
  });

  it("full response contract: all fields present and correctly typed", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const result = await getCustomTableData(table1.id, { columns: ["name", "value"], limit: 2, sortBy: "value", sort: "asc" });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(expect.objectContaining({
      type: "custom-table",
      title: "Test Table 1",
      data: expect.objectContaining({
        columns: expect.any(Array),
        records: expect.any(Array),
        hasMore: true,
        tableSlug: table1.slug,
        currentSort: { field: "value", direction: "asc" },
        tableId: table1.id,
      }),
    }));
    expect(result.data.data.records.length).toBe(2);
    // W5 fix: verify column type/label fields for requested columns
    const colMap = Object.fromEntries(result.data.data.columns.map((c: any) => [c.name, c]));
    expect(colMap.name).toEqual(expect.objectContaining({ name: "name", label: "Name", type: "string" }));
    expect(colMap.value).toEqual(expect.objectContaining({ name: "value", label: "Value", type: "number" }));
  });

  it("tableSlug matches seeded slug", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const result = await getCustomTableData(table1.id, {});

    expect(result.data.data.tableSlug).toBe(table1.slug);
  });

  it("manager role: can read all tables", async () => {
    mockGetCurrentUser.mockResolvedValue(makeManagerUser());

    const r1 = await getCustomTableData(table1.id, {});
    const r2 = await getCustomTableData(table2.id, {});

    expect(r1.success).toBe(true);
    expect(r1.data.title).toBe("Test Table 1");
    expect(r2.success).toBe(true);
    expect(r2.data.title).toBe("Test Table 2");
  });

  it("basic user with 'write' permission can read table", async () => {
    mockGetCurrentUser.mockResolvedValue(makeWriteBasicUser());

    const result = await getCustomTableData(table2.id, {});

    expect(result.success).toBe(true);
    expect(result.data.type).toBe("custom-table");
    expect(result.data.title).toBe("Test Table 2");
    // W6 fix: table2 has 0 records — verify empty state explicitly
    expect(result.data.data.records).toEqual([]);
    expect(result.data.data.hasMore).toBe(false);
  });

  // ── Column selection ─────────────────────────────────────────────

  it("column selection: only requested columns returned", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const result = await getCustomTableData(table1.id, { columns: ["name", "value"] });

    expect(result.success).toBe(true);
    const columnNames = result.data.data.columns.map((c: any) => c.name);
    expect(columnNames).toContain("name");
    expect(columnNames).toContain("value");
    expect(columnNames).not.toContain("status");
    expect(columnNames).not.toContain("email");
  });

  it("default columns: first 7 schema fields when no columns specified", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const result = await getCustomTableData(table1.id, {});

    expect(result.success).toBe(true);
    const columns = result.data.data.columns;
    expect(columns.length).toBe(7);
    const expected = ["name", "value", "status", "email", "phone", "city", "notes"];
    expect(columns.map((c: any) => c.name)).toEqual(expected);
    // 8th field "extra" excluded
    expect(columns.map((c: any) => c.name)).not.toContain("extra");
  });

  it("createdAt/updatedAt as special column selections", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const result = await getCustomTableData(table1.id, { columns: ["name", "createdAt", "updatedAt"] });

    expect(result.success).toBe(true);
    const columns = result.data.data.columns;
    const colMap = Object.fromEntries(columns.map((c: any) => [c.name, c]));
    expect(colMap.name).toBeDefined();
    expect(colMap.createdAt).toEqual({ name: "createdAt", label: "נוצר בתאריך", type: "datetime" });
    expect(colMap.updatedAt).toEqual({ name: "updatedAt", label: "עודכן בתאריך", type: "datetime" });
  });

  // ── Pagination ───────────────────────────────────────────────────

  it("limit parameter: correct record count + hasMore flag", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const result = await getCustomTableData(table1.id, { limit: 3 });

    expect(result.success).toBe(true);
    expect(result.data.data.records.length).toBe(3);
    expect(result.data.data.hasMore).toBe(true);
  });

  it("limit greater than total records: exact count and hasMore false", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const result = await getCustomTableData(table1.id, { limit: 100 });

    expect(result.success).toBe(true);
    // 5 normal records + 1 null-creator record = 6 total
    expect(result.data.data.records.length).toBe(6);
    expect(result.data.data.hasMore).toBe(false);
  });

  // ── Sorting ──────────────────────────────────────────────────────

  it("default sort (createdAt desc): real Prisma orderBy", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const result = await getCustomTableData(table1.id, {});

    expect(result.success).toBe(true);
    const recs = result.data.data.records;
    for (let i = 0; i < recs.length - 1; i++) {
      const a = new Date(recs[i].createdAt).getTime();
      const b = new Date(recs[i + 1].createdAt).getTime();
      expect(a).toBeGreaterThanOrEqual(b);
    }
    // W1 fix: verify last-inserted record appears first in desc order
    expect(recs[0].id).toBe(nullCreatorRecord.id);
    expect(result.data.data.currentSort).toEqual({ field: "createdAt", direction: "desc" });
  });

  it("updatedAt sort path: uses Prisma ORM orderBy", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const result = await getCustomTableData(table1.id, { sortBy: "updatedAt", sort: "asc" });

    expect(result.success).toBe(true);
    const recs = result.data.data.records;
    for (let i = 0; i < recs.length - 1; i++) {
      const a = new Date(recs[i].updatedAt).getTime();
      const b = new Date(recs[i + 1].updatedAt).getTime();
      expect(a).toBeLessThanOrEqual(b);
    }
    // W4 fix: verify first record identity — records inserted sequentially, first inserted = earliest updatedAt
    expect(recs[0].id).toBe(records[0].id);
    expect(result.data.data.currentSort).toEqual({ field: "updatedAt", direction: "asc" });
  });

  it("JSON numeric field sort (value asc): real raw SQL sorting", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const result = await getCustomTableData(table1.id, { sortBy: "value", sort: "asc" });

    expect(result.success).toBe(true);
    const recs = result.data.data.records;
    const values = recs.map((r: any) => {
      const data = typeof r.data === "string" ? JSON.parse(r.data) : r.data;
      return data.value;
    });
    // W1 fix: assert exact expected order from seeded data
    expect(values).toEqual([50, 100, 150, 200, 300, 999]);
    expect(result.data.data.currentSort).toEqual({ field: "value", direction: "asc" });
  });

  it("JSON string field sort (name asc): raw SQL text sorting", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const result = await getCustomTableData(table1.id, { sortBy: "name", sort: "asc" });

    expect(result.success).toBe(true);
    const recs = result.data.data.records;
    const names = recs.map((r: any) => {
      const data = typeof r.data === "string" ? JSON.parse(r.data) : r.data;
      return data.name;
    });
    // W4 fix: assert exact expected order from seeded data (PostgreSQL text collation)
    expect(names).toEqual([
      "Alice Cohen",
      "Bob Levy",
      "Charlie David",
      "Dana Raz",
      "Eve Shapira",
      "System Record",
    ]);
    expect(result.data.data.currentSort).toEqual({ field: "name", direction: "asc" });
  });

  it("JSON string field sort desc direction: Prisma.sql DESC branch", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const result = await getCustomTableData(table1.id, { sortBy: "name", sort: "desc" });

    expect(result.success).toBe(true);
    const recs = result.data.data.records;
    const names = recs.map((r: any) => {
      const data = typeof r.data === "string" ? JSON.parse(r.data) : r.data;
      return data.name;
    });
    // Reverse of asc order
    expect(names).toEqual([
      "System Record",
      "Eve Shapira",
      "Dana Raz",
      "Charlie David",
      "Bob Levy",
      "Alice Cohen",
    ]);
    expect(result.data.data.currentSort).toEqual({ field: "name", direction: "desc" });
  });

  // ── SQL injection guard ─────────────────────────────────────────

  it("unsafe sortBy: falls back to createdAt desc (SQL injection guard)", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const result = await getCustomTableData(table1.id, { sortBy: "field;DROP" });

    expect(result.success).toBe(true);
    // SAFE_FIELD_NAME regex rejects "field;DROP" → code falls back to createdAt desc
    expect(result.data.data.currentSort).toEqual({ field: "field;DROP", direction: "desc" });
    const recs = result.data.data.records;
    // Verify records come back in createdAt desc order (same as default)
    for (let i = 0; i < recs.length - 1; i++) {
      const a = new Date(recs[i].createdAt).getTime();
      const b = new Date(recs[i + 1].createdAt).getTime();
      expect(a).toBeGreaterThanOrEqual(b);
    }
    // Last-inserted record should be first
    expect(recs[0].id).toBe(nullCreatorRecord.id);
  });

  // ── DB state verification ──────────────────────────────────────

  it("DB state: record count matches API response", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const result = await getCustomTableData(table1.id, { limit: 100 });
    const dbCount = await prisma.record.count({
      where: { tableId: table1.id, companyId: companyA.id },
    });

    expect(result.success).toBe(true);
    expect(result.data.data.records.length).toBe(dbCount);
  });

  it("pagination identity: limit subset matches full fetch", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const fullResult = await getCustomTableData(table1.id, { limit: 100 });
    const limitResult = await getCustomTableData(table1.id, { limit: 3 });

    expect(fullResult.success).toBe(true);
    expect(limitResult.success).toBe(true);
    const fullIds = fullResult.data.data.records.map((r: any) => r.id);
    const limitIds = limitResult.data.data.records.map((r: any) => r.id);
    // The first 3 records from the full fetch should match the limit fetch exactly
    expect(limitIds).toEqual(fullIds.slice(0, 3));
  });

  // ── Soft-deleted table behavior ────────────────────────────────

  it("soft-deleted table still accessible via getCustomTableData (documents source behavior)", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    // getCustomTableDataInternal does findFirst({ where: { id, companyId } }) without deletedAt filter
    const result = await getCustomTableData(softDeletedTable.id, {});

    // The soft-deleted table IS accessible through getCustomTableData
    // because getCustomTableDataInternal doesn't filter by deletedAt
    expect(result.success).toBe(true);
    expect(result.data.type).toBe("custom-table");
    expect(result.data.title).toBe("Soft Deleted Table");
  });

  // ── Column metadata ────────────────────────────────────────────

  it("createdBy/updatedBy column metadata has correct Hebrew labels", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const result = await getCustomTableData(table1.id, {
      columns: ["name", "createdBy", "updatedBy"],
    });

    expect(result.success).toBe(true);
    const colMap = Object.fromEntries(
      result.data.data.columns.map((c: any) => [c.name, c]),
    );
    expect(colMap.createdBy).toEqual({ name: "createdBy", label: "נוצר על ידי", type: "string" });
    expect(colMap.updatedBy).toEqual({ name: "updatedBy", label: "עודכן על ידי", type: "string" });
  });

  // ── Relations & fallbacks ────────────────────────────────────────

  it("createdBy/updatedBy populated from User relation join", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const result = await getCustomTableData(table1.id, { columns: ["name", "createdBy", "updatedBy"] });

    expect(result.success).toBe(true);
    const recs = result.data.data.records;
    // Filter to records with known creator
    const normalRecs = recs.filter((r: any) => r.id !== nullCreatorRecord.id);
    for (const rec of normalRecs) {
      expect(rec.createdBy).toBe("Admin User");
      expect(rec.updatedBy).toBe("Admin User");
    }
  });

  it("null creator fallback: createdBy shows 'מערכת'", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const result = await getCustomTableData(table1.id, { columns: ["name", "createdBy", "updatedBy"] });

    expect(result.success).toBe(true);
    const recs = result.data.data.records;
    const systemRec = recs.find((r: any) => r.id === nullCreatorRecord.id);
    expect(systemRec).toBeDefined();
    expect(systemRec!.createdBy).toBe("מערכת");
    expect(systemRec!.updatedBy).toBe("מערכת");
  });

  // ── Cache paths ──────────────────────────────────────────────────

  it("cache hit: returns cached data without DB query", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());
    const cachedData = {
      type: "custom-table",
      title: "Cached Title",
      data: { columns: [], records: [], hasMore: false, tableSlug: "s", currentSort: { field: "createdAt", direction: "desc" }, tableId: table1.id },
    };
    mockGetCachedTableWidget.mockResolvedValue(cachedData);

    const result = await getCustomTableData(table1.id, {});

    expect(result.success).toBe(true);
    expect(result.data).toEqual(cachedData);
    // buildWidgetHash should have been called with "custom" viewId
    expect(mockBuildWidgetHash).toHaveBeenCalledWith(table1.id, "custom", expect.any(Object));
    // W7 fix: verify exact call count to catch accidental double-calls
    expect(mockGetCachedTableWidget).toHaveBeenCalledTimes(1);
    expect(mockGetCachedTableWidget).toHaveBeenCalledWith(companyA.id, expect.any(String));
    // setCachedTableWidget should NOT be called (data was cached)
    expect(mockSetCachedTableWidget).not.toHaveBeenCalled();
  });

  it("bypassCache: true skips cache lookup", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());
    mockGetCachedTableWidget.mockResolvedValue({ type: "should-not-be-returned" });

    const result = await getCustomTableData(table1.id, {}, true);

    expect(result.success).toBe(true);
    expect(result.data.type).toBe("custom-table");
    expect(result.data.title).toBe("Test Table 1");
    expect(mockGetCachedTableWidget).not.toHaveBeenCalled();
    // Should still cache the fresh result
    expect(mockSetCachedTableWidget).toHaveBeenCalled();
  });

  // ── Error handling ───────────────────────────────────────────────

  it("non-existent table returns 'Table not found'", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const result = await getCustomTableData(999999, {});

    expect(result.success).toBe(false);
    expect(result.error).toBe("Table not found");
  });

  it("unauthorized table returns 'Access denied'", async () => {
    mockGetCurrentUser.mockResolvedValue(makeBasicUser());

    const result = await getCustomTableData(table2.id, {});

    expect(result.success).toBe(false);
    expect(result.error).toBe("Access denied");
  });

  it("basic user with null tablePermissions → Access denied", async () => {
    mockGetCurrentUser.mockResolvedValue({
      ...makeBasicUser(),
      tablePermissions: null,
    });

    const result = await getCustomTableData(table1.id, {});

    expect(result.success).toBe(false);
    expect(result.error).toBe("Access denied");
  });

  it("invalid tableId (0 or negative) returns 'Invalid input'", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const resultZero = await getCustomTableData(0, {});
    expect(resultZero.success).toBe(false);
    expect(resultZero.error).toBe("Invalid input");

    const resultNeg = await getCustomTableData(-5, {});
    expect(resultNeg.success).toBe(false);
    expect(resultNeg.error).toBe("Invalid input");
  });

  it("float tableId (1.5) rejected as Invalid input", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const result = await getCustomTableData(1.5, {});

    expect(result.success).toBe(false);
    expect(result.error).toBe("Invalid input");
  });

  it("invalid settings (bad sort value) returns Zod validation error", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const result = await getCustomTableData(table1.id, { sort: "invalid" as any });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Invalid settings");
  });

  it("rate limited returns rate limit error", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());
    mockCheckActionRateLimit.mockResolvedValue({ error: "Rate limit exceeded. Please try again later." });

    const result = await getCustomTableData(table1.id, {});

    expect(result.success).toBe(false);
    expect(result.error).toContain("Rate limit");
  });

  it("Zod boundary: limit 0 rejected as invalid settings", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const result = await getCustomTableData(table1.id, { limit: 0 });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Invalid settings");
  });

  it("Zod boundary: limit 501 rejected as invalid settings", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const result = await getCustomTableData(table1.id, { limit: 501 });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Invalid settings");
  });

  it("getCustomTableData exception → graceful 'Failed to fetch data'", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());
    // Force an unexpected error by making the cache check throw
    mockBuildWidgetHash.mockImplementation(() => { throw new Error("Unexpected crash"); });

    const result = await getCustomTableData(table1.id, {});

    expect(result.success).toBe(false);
    expect(result.error).toBe("Failed to fetch data");
  });
});

// =====================================================================
// D. getBatchTableData()
// =====================================================================

describe("getBatchTableData()", () => {
  it("multiple widgets fetched in single batch (mix of view + custom)", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());
    mockProcessViewServer.mockResolvedValue({ type: "view-data", data: { records: [] } });

    const result = await getBatchTableData([
      { widgetId: "w1", tableId: table1.id, viewId: view1.id },
      { widgetId: "w2", tableId: table1.id, viewId: "custom", settings: { limit: 2 } },
    ]);

    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(2);
    const w1 = result.results!.find((r: any) => r.widgetId === "w1");
    const w2 = result.results!.find((r: any) => r.widgetId === "w2");
    expect(w1!.success).toBe(true);
    expect(w2!.success).toBe(true);
    // Custom widget should return real DB data
    expect(w2!.data.type).toBe("custom-table");
    expect(w2!.data.data.records.length).toBe(2);
    expect(w2!.data.data.hasMore).toBe(true);
    // W3 fix: verify setCachedTableWidget was called for both cache miss widgets (view + custom)
    expect(mockSetCachedTableWidget).toHaveBeenCalledTimes(2);
  });

  it("unauthorized tables filtered from results", async () => {
    mockGetCurrentUser.mockResolvedValue(makeBasicUser());
    mockProcessViewServer.mockResolvedValue({ type: "view-data", data: { records: [] } });

    const result = await getBatchTableData([
      { widgetId: "w1", tableId: table1.id, viewId: view1.id },
      { widgetId: "w2", tableId: table2.id, viewId: view2Table2.id },
    ]);

    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(1);
    expect(result.results![0].widgetId).toBe("w1");
  });

  it("all tables unauthorized: empty results array", async () => {
    // Basic user with no table permissions
    mockGetCurrentUser.mockResolvedValue({
      ...makeBasicUser(),
      tablePermissions: {},
    });

    const result = await getBatchTableData([
      { widgetId: "w1", tableId: table1.id, viewId: view1.id },
      { widgetId: "w2", tableId: table2.id, viewId: view2Table2.id },
    ]);

    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(0);
  });

  it("null user returns 'Unauthorized'", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const result = await getBatchTableData([
      { widgetId: "w1", tableId: table1.id, viewId: view1.id },
    ]);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Unauthorized");
  });

  it("rate limit error", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());
    mockCheckActionRateLimit.mockResolvedValue({ error: "Rate limit exceeded. Please try again later." });

    const result = await getBatchTableData([
      { widgetId: "w1", tableId: table1.id, viewId: view1.id },
    ]);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Rate limit");
  });

  it("invalid input returns Zod error", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const result = await getBatchTableData([
      { widgetId: "", tableId: table1.id, viewId: view1.id },
    ]);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Invalid input");
  });

  it("partial failure: one widget fails, others succeed", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());
    mockProcessViewServer.mockResolvedValue({ type: "view-data", data: { records: [] } });

    const result = await getBatchTableData([
      { widgetId: "w1", tableId: table1.id, viewId: view1.id },
      { widgetId: "w2", tableId: table1.id, viewId: 999999 },
    ]);

    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(2);
    const w1 = result.results!.find((r: any) => r.widgetId === "w1");
    const w2 = result.results!.find((r: any) => r.widgetId === "w2");
    expect(w1!.success).toBe(true);
    expect(w2!.success).toBe(false);
    expect(w2!.error).toBe("Table or view not found");
  });

  it("large batch processed correctly (tests chunking)", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());
    mockProcessViewServer.mockResolvedValue({ type: "view-data", data: { records: [] } });

    const requests = Array.from({ length: 8 }, (_, i) => ({
      widgetId: `w${i}`,
      tableId: table1.id,
      viewId: view1.id,
    }));

    const result = await getBatchTableData(requests);

    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(8);
    for (const r of result.results!) {
      expect(r.success).toBe(true);
    }
  });

  it("batch cache hit: returns cached widget data directly", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());
    const cachedWidgetData = { type: "cached-view", data: { records: [{ id: 42 }] } };
    mockGetCachedTableWidget.mockResolvedValue(cachedWidgetData);

    const result = await getBatchTableData([
      { widgetId: "w1", tableId: table1.id, viewId: view1.id },
    ]);

    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(1);
    expect(result.results![0].success).toBe(true);
    expect(result.results![0].data).toEqual(cachedWidgetData);
    // processViewServer should NOT be called since cache hit
    expect(mockProcessViewServer).not.toHaveBeenCalled();
    // setCachedTableWidget should NOT be called since data was already cached
    expect(mockSetCachedTableWidget).not.toHaveBeenCalled();
  });

  it("bypassCache: true skips cache for all widgets", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());
    mockGetCachedTableWidget.mockResolvedValue({ type: "cached-data" });
    mockProcessViewServer.mockResolvedValue({ type: "fresh-data", data: { records: [] } });

    const result = await getBatchTableData(
      [{ widgetId: "w1", tableId: table1.id, viewId: view1.id }],
      true,
    );

    expect(result.success).toBe(true);
    expect(result.results![0].success).toBe(true);
    expect(result.results![0].data.type).toBe("fresh-data");
    expect(mockGetCachedTableWidget).not.toHaveBeenCalled();
  });

  it("rate limit called with DASHBOARD_RATE_LIMITS.batch config", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());
    mockProcessViewServer.mockResolvedValue({ type: "view-data", data: { records: [] } });

    await getBatchTableData([
      { widgetId: "w1", tableId: table1.id, viewId: view1.id },
    ]);

    expect(mockCheckActionRateLimit).toHaveBeenCalledWith(
      String(adminUser.id),
      DASHBOARD_RATE_LIMITS.batch,
    );
  });
});

// =====================================================================
// E. Cross-Cutting
// =====================================================================

describe("Cross-cutting concerns", () => {
  it("all 4 actions reject unauthenticated users", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    await expect(getDashboardInitialData()).rejects.toThrow("Unauthorized");

    const viewResult = await getTableViewData(table1.id, view1.id);
    expect(viewResult.success).toBe(false);
    expect(viewResult.error).toBe("Unauthorized");

    const customResult = await getCustomTableData(table1.id, {});
    expect(customResult.success).toBe(false);
    expect(customResult.error).toBe("Unauthorized");

    const batchResult = await getBatchTableData([
      { widgetId: "w1", tableId: table1.id, viewId: view1.id },
    ]);
    expect(batchResult.success).toBe(false);
    expect(batchResult.error).toBe("Unauthorized");
  });

  it("admin vs basic vs manager role permission differentiation", async () => {
    // Admin can access both tables
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());
    const adminT1 = await getCustomTableData(table1.id, {});
    const adminT2 = await getCustomTableData(table2.id, {});
    expect(adminT1.success).toBe(true);
    expect(adminT2.success).toBe(true);

    // Manager can also access both tables
    mockGetCurrentUser.mockResolvedValue(makeManagerUser());
    const mgrT1 = await getCustomTableData(table1.id, {});
    const mgrT2 = await getCustomTableData(table2.id, {});
    expect(mgrT1.success).toBe(true);
    expect(mgrT2.success).toBe(true);

    // Basic user with "read" on table1 only
    mockGetCurrentUser.mockResolvedValue(makeBasicUser());
    const basicT1 = await getCustomTableData(table1.id, {});
    const basicT2 = await getCustomTableData(table2.id, {});
    expect(basicT1.success).toBe(true);
    expect(basicT2.success).toBe(false);
    expect(basicT2.error).toBe("Access denied");

    // Basic user with "write" on table2 can read it
    mockGetCurrentUser.mockResolvedValue(makeWriteBasicUser());
    const writeT2 = await getCustomTableData(table2.id, {});
    const writeT1 = await getCustomTableData(table1.id, {});
    expect(writeT2.success).toBe(true);
    expect(writeT1.success).toBe(false);
    expect(writeT1.error).toBe("Access denied");
  });

  it("table with no records: empty array, hasMore false", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const result = await getCustomTableData(table2.id, {});

    expect(result.success).toBe(true);
    expect(result.data.data.records).toEqual([]);
    expect(result.data.data.hasMore).toBe(false);
  });
});

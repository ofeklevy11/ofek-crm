import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks (accessible inside vi.mock factories) ────────────

const {
  mockGetCurrentUser,
  mockHasUserFlag,
  mockCanReadTable,
  mockCheckActionRateLimit,
  mockGetCachedGoals,
  mockGetCachedTableWidget,
  mockSetCachedTableWidget,
  mockBuildWidgetHash,
  mockGetAnalyticsDataForDashboard,
  mockGetTablesForDashboardInternal,
  mockGetGoalsForCompanyInternal,
  mockInngestSend,
  mockPrismaViewFindMany,
  mockGetTableViewDataInternal,
  mockGetCustomTableDataInternal,
  DASHBOARD_RATE_LIMITS,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockHasUserFlag: vi.fn(),
  mockCanReadTable: vi.fn(),
  mockCheckActionRateLimit: vi.fn(),
  mockGetCachedGoals: vi.fn(),
  mockGetCachedTableWidget: vi.fn(),
  mockSetCachedTableWidget: vi.fn(),
  mockBuildWidgetHash: vi.fn(),
  mockGetAnalyticsDataForDashboard: vi.fn(),
  mockGetTablesForDashboardInternal: vi.fn(),
  mockGetGoalsForCompanyInternal: vi.fn(),
  mockInngestSend: vi.fn(),
  mockPrismaViewFindMany: vi.fn(),
  mockGetTableViewDataInternal: vi.fn(),
  mockGetCustomTableDataInternal: vi.fn(),
  DASHBOARD_RATE_LIMITS: {
    page: { prefix: "dash-page", max: 120, windowSeconds: 60 },
    read: { prefix: "dash-read", max: 60, windowSeconds: 60 },
    write: { prefix: "dash-write", max: 20, windowSeconds: 60 },
    batch: { prefix: "dash-batch", max: 10, windowSeconds: 60 },
    migrate: { prefix: "dash-migrate", max: 3, windowSeconds: 600 },
  },
}));

// ── Module mocks ───────────────────────────────────────────────────

vi.mock("@/lib/permissions-server", () => ({
  getCurrentUser: (...args: any[]) => mockGetCurrentUser(...args),
}));

vi.mock("@/lib/permissions", () => ({
  hasUserFlag: (...args: any[]) => mockHasUserFlag(...args),
  canReadTable: (...args: any[]) => mockCanReadTable(...args),
}));

vi.mock("@/lib/rate-limit-action", () => ({
  checkActionRateLimit: (...args: any[]) => mockCheckActionRateLimit(...args),
  DASHBOARD_RATE_LIMITS,
}));

vi.mock("@/lib/services/dashboard-cache", () => ({
  getCachedGoals: (...args: any[]) => mockGetCachedGoals(...args),
  getCachedTableWidget: (...args: any[]) => mockGetCachedTableWidget(...args),
  setCachedTableWidget: (...args: any[]) => mockSetCachedTableWidget(...args),
  buildWidgetHash: (...args: any[]) => mockBuildWidgetHash(...args),
}));

vi.mock("@/lib/db-retry", () => ({
  withRetry: (fn: () => any) => fn(),
}));

vi.mock("@/app/actions/analytics", () => ({
  getAnalyticsDataForDashboard: (...args: any[]) => mockGetAnalyticsDataForDashboard(...args),
}));

vi.mock("@/app/actions/tables", () => ({
  getTablesForDashboardInternal: (...args: any[]) => mockGetTablesForDashboardInternal(...args),
}));

vi.mock("@/lib/services/goal-computation", () => ({
  getGoalsForCompanyInternal: (...args: any[]) => mockGetGoalsForCompanyInternal(...args),
}));

vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: (...args: any[]) => mockInngestSend(...args) },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    view: { findMany: (...args: any[]) => mockPrismaViewFindMany(...args) },
  },
}));

vi.mock("@/lib/dashboard-internal", () => ({
  getTableViewDataInternal: (...args: any[]) => mockGetTableViewDataInternal(...args),
  getCustomTableDataInternal: (...args: any[]) => mockGetCustomTableDataInternal(...args),
}));

vi.mock("@/lib/constants/dedup", () => ({
  GOALS_DEDUP_WINDOW_MS: 60_000,
}));

// ── Helpers ─────────────────────────────────────────────────────────

function makeUser(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    companyId: 10,
    name: "Admin",
    email: "admin@test.com",
    role: "admin" as const,
    allowedWriteTableIds: [],
    permissions: {},
    tablePermissions: {},
    ...overrides,
  };
}

function setupAuthenticatedAdmin() {
  const user = makeUser();
  mockGetCurrentUser.mockResolvedValue(user);
  mockHasUserFlag.mockReturnValue(true);
  mockCheckActionRateLimit.mockResolvedValue(null);
  mockCanReadTable.mockReturnValue(true);
  return user;
}

// ── Import under test ──────────────────────────────────────────────

import {
  getDashboardInitialData,
  getTableViewData,
  getCustomTableData,
  getBatchTableData,
} from "@/app/actions/dashboard";

// ════════════════════════════════════════════════════════════════════
// 1. getDashboardInitialData
// ════════════════════════════════════════════════════════════════════

describe("getDashboardInitialData", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockBuildWidgetHash.mockReturnValue("hash");
    mockSetCachedTableWidget.mockResolvedValue(undefined);
  });

  it("throws Unauthorized when no user", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    await expect(getDashboardInitialData()).rejects.toThrow("Unauthorized");
  });

  it("throws Forbidden when user lacks canViewDashboardData", async () => {
    const user = makeUser();
    mockGetCurrentUser.mockResolvedValue(user);
    mockHasUserFlag.mockReturnValue(false);
    await expect(getDashboardInitialData()).rejects.toThrow("Forbidden");
    expect(mockHasUserFlag).toHaveBeenCalledWith(user, "canViewDashboardData");
  });

  it("throws rate limit error when rate limited", async () => {
    mockGetCurrentUser.mockResolvedValue(makeUser());
    mockHasUserFlag.mockReturnValue(true);
    mockCheckActionRateLimit.mockResolvedValue({ error: "Rate limit exceeded. Please try again later." });
    await expect(getDashboardInitialData()).rejects.toThrow("Rate limit exceeded");
  });

  it("returns analyticsViews, tables with views, and goals on happy path", async () => {
    setupAuthenticatedAdmin();
    mockGetCachedGoals.mockResolvedValue(null);
    mockGetGoalsForCompanyInternal.mockResolvedValue([{ id: 1, name: "G1" }]);
    mockGetAnalyticsDataForDashboard.mockResolvedValue({ success: true, data: [{ id: 10 }] });
    mockGetTablesForDashboardInternal.mockResolvedValue({ success: true, data: [{ id: 100, name: "T1" }] });
    mockPrismaViewFindMany.mockResolvedValue([
      { id: 200, tableId: 100, name: "V1", config: {} },
    ]);

    const result = await getDashboardInitialData();

    expect(result.analyticsViews).toEqual([{ id: 10 }]);
    expect(result.goals).toEqual([{ id: 1, name: "G1" }]);
    expect(result.tables).toHaveLength(1);
    expect(result.tables[0].id).toBe(100);
    expect(result.tables[0].views).toEqual([{ id: 200, tableId: 100, name: "V1", config: {} }]);
  });

  it("pre-computes allowedTableIds for basic user and filters views", async () => {
    const user = makeUser({
      role: "basic",
      permissions: { canViewDashboardData: true },
      tablePermissions: { "5": "read", "6": "write", "7": "none" },
    });
    mockGetCurrentUser.mockResolvedValue(user);
    mockHasUserFlag.mockReturnValue(true);
    mockCheckActionRateLimit.mockResolvedValue(null);
    mockGetCachedGoals.mockResolvedValue(null);
    mockGetGoalsForCompanyInternal.mockResolvedValue([]);
    mockGetAnalyticsDataForDashboard.mockResolvedValue({ success: true, data: [] });
    mockGetTablesForDashboardInternal.mockResolvedValue({ success: true, data: [] });
    mockPrismaViewFindMany.mockResolvedValue([]);

    await getDashboardInitialData();

    const call = mockPrismaViewFindMany.mock.calls[0][0];
    expect(call.where.tableId).toEqual({ in: [5, 6] });
    expect(call.where.companyId).toBe(user.companyId);
  });

  it("uses cached goals when fresh — skips getGoalsForCompanyInternal", async () => {
    setupAuthenticatedAdmin();
    mockGetCachedGoals.mockResolvedValue({ data: [{ id: 99 }], stale: false });
    mockGetAnalyticsDataForDashboard.mockResolvedValue({ success: true, data: [] });
    mockGetTablesForDashboardInternal.mockResolvedValue({ success: true, data: [] });
    mockPrismaViewFindMany.mockResolvedValue([]);

    const result = await getDashboardInitialData();

    expect(result.goals).toEqual([{ id: 99 }]);
    expect(mockGetGoalsForCompanyInternal).not.toHaveBeenCalled();
    expect(mockInngestSend).not.toHaveBeenCalled();
  });

  it("triggers Inngest refresh when cached goals are stale", async () => {
    setupAuthenticatedAdmin();
    mockGetCachedGoals.mockResolvedValue({ data: [{ id: 99 }], stale: true });
    mockInngestSend.mockResolvedValue(undefined);
    mockGetAnalyticsDataForDashboard.mockResolvedValue({ success: true, data: [] });
    mockGetTablesForDashboardInternal.mockResolvedValue({ success: true, data: [] });
    mockPrismaViewFindMany.mockResolvedValue([]);

    await getDashboardInitialData();

    // inngest.send is called via dynamic import chain — flush microtasks reliably
    await vi.waitFor(() => {
      expect(mockInngestSend).toHaveBeenCalledWith(
        expect.objectContaining({ name: "dashboard/refresh-goals", data: { companyId: 10 } }),
      );
    });
  });

  it("calls getGoalsForCompanyInternal with skipCache when no cached goals", async () => {
    setupAuthenticatedAdmin();
    mockGetCachedGoals.mockResolvedValue(null);
    mockGetGoalsForCompanyInternal.mockResolvedValue([]);
    mockGetAnalyticsDataForDashboard.mockResolvedValue({ success: true, data: [] });
    mockGetTablesForDashboardInternal.mockResolvedValue({ success: true, data: [] });
    mockPrismaViewFindMany.mockResolvedValue([]);

    await getDashboardInitialData();

    expect(mockGetGoalsForCompanyInternal).toHaveBeenCalledWith(10, { skipCache: true });
    expect(mockInngestSend).not.toHaveBeenCalled();
  });

  it("uses fallback empty arrays when analytics rejects — tables and goals unaffected", async () => {
    setupAuthenticatedAdmin();
    mockGetCachedGoals.mockResolvedValue(null);
    mockGetGoalsForCompanyInternal.mockResolvedValue([{ id: 7, name: "G7" }]);
    mockGetAnalyticsDataForDashboard.mockRejectedValue(new Error("analytics down"));
    mockGetTablesForDashboardInternal.mockResolvedValue({
      success: true,
      data: [{ id: 50, name: "T50" }],
    });
    mockPrismaViewFindMany.mockResolvedValue([]);

    const result = await getDashboardInitialData();

    expect(result.analyticsViews).toEqual([]);
    // Verify partial failure isolation — tables and goals still correct
    expect(result.tables).toHaveLength(1);
    expect(result.tables[0].id).toBe(50);
    expect(result.goals).toEqual([{ id: 7, name: "G7" }]);
  });

  it("groups views by table correctly", async () => {
    setupAuthenticatedAdmin();
    mockGetCachedGoals.mockResolvedValue(null);
    mockGetGoalsForCompanyInternal.mockResolvedValue([]);
    mockGetAnalyticsDataForDashboard.mockResolvedValue({ success: true, data: [] });
    mockGetTablesForDashboardInternal.mockResolvedValue({
      success: true,
      data: [{ id: 1 }, { id: 2 }],
    });
    mockPrismaViewFindMany.mockResolvedValue([
      { id: 10, tableId: 1, name: "V1", config: {} },
      { id: 11, tableId: 1, name: "V2", config: {} },
      { id: 20, tableId: 2, name: "V3", config: {} },
    ]);

    const result = await getDashboardInitialData();

    expect(result.tables[0].views).toHaveLength(2);
    expect(result.tables[1].views).toHaveLength(1);
  });

  it("filters out views from unknown tables", async () => {
    setupAuthenticatedAdmin();
    mockGetCachedGoals.mockResolvedValue(null);
    mockGetGoalsForCompanyInternal.mockResolvedValue([]);
    mockGetAnalyticsDataForDashboard.mockResolvedValue({ success: true, data: [] });
    mockGetTablesForDashboardInternal.mockResolvedValue({
      success: true,
      data: [{ id: 1 }],
    });
    mockPrismaViewFindMany.mockResolvedValue([
      { id: 10, tableId: 1, name: "V1", config: {} },
      { id: 99, tableId: 999, name: "Orphan", config: {} },
    ]);

    const result = await getDashboardInitialData();

    expect(result.tables[0].views).toHaveLength(1);
    expect(result.tables[0].views[0].id).toBe(10);
  });

  it("includes companyId in prisma.view.findMany filter", async () => {
    const user = setupAuthenticatedAdmin();
    mockGetCachedGoals.mockResolvedValue(null);
    mockGetGoalsForCompanyInternal.mockResolvedValue([]);
    mockGetAnalyticsDataForDashboard.mockResolvedValue({ success: true, data: [] });
    mockGetTablesForDashboardInternal.mockResolvedValue({ success: true, data: [] });
    mockPrismaViewFindMany.mockResolvedValue([]);

    await getDashboardInitialData();

    expect(mockPrismaViewFindMany.mock.calls[0][0].where.companyId).toBe(user.companyId);
  });

  it("uses fallback empty tables when tables fetch rejects", async () => {
    setupAuthenticatedAdmin();
    mockGetCachedGoals.mockResolvedValue(null);
    mockGetGoalsForCompanyInternal.mockResolvedValue([{ id: 1 }]);
    mockGetAnalyticsDataForDashboard.mockResolvedValue({ success: true, data: [{ id: 10 }] });
    mockGetTablesForDashboardInternal.mockRejectedValue(new Error("tables DB down"));
    mockPrismaViewFindMany.mockResolvedValue([]);

    const result = await getDashboardInitialData();

    expect(result.tables).toEqual([]);
    // Analytics and goals should still be correct
    expect(result.analyticsViews).toEqual([{ id: 10 }]);
    expect(result.goals).toEqual([{ id: 1 }]);
  });

  it("uses fallback empty goals when goals fetch rejects", async () => {
    setupAuthenticatedAdmin();
    mockGetCachedGoals.mockResolvedValue(null);
    mockGetGoalsForCompanyInternal.mockRejectedValue(new Error("goals service down"));
    mockGetAnalyticsDataForDashboard.mockResolvedValue({ success: true, data: [{ id: 10 }] });
    mockGetTablesForDashboardInternal.mockResolvedValue({ success: true, data: [{ id: 100 }] });
    mockPrismaViewFindMany.mockResolvedValue([]);

    const result = await getDashboardInitialData();

    expect(result.goals).toEqual([]);
    // Analytics and tables should still be correct
    expect(result.analyticsViews).toEqual([{ id: 10 }]);
    expect(result.tables).toHaveLength(1);
    expect(result.tables[0].id).toBe(100);
  });

  it("uses fallback empty views when prisma.view.findMany rejects", async () => {
    setupAuthenticatedAdmin();
    mockGetCachedGoals.mockResolvedValue(null);
    mockGetGoalsForCompanyInternal.mockResolvedValue([{ id: 1 }]);
    mockGetAnalyticsDataForDashboard.mockResolvedValue({ success: true, data: [] });
    mockGetTablesForDashboardInternal.mockResolvedValue({
      success: true,
      data: [{ id: 100, name: "T1" }],
    });
    mockPrismaViewFindMany.mockRejectedValue(new Error("views query timeout"));

    const result = await getDashboardInitialData();

    // Tables should be returned but with empty views (fallback)
    expect(result.tables).toHaveLength(1);
    expect(result.tables[0].views).toEqual([]);
    expect(result.goals).toEqual([{ id: 1 }]);
  });

  it("manager role has full access — no tableId filter on views", async () => {
    const user = makeUser({ role: "manager" });
    mockGetCurrentUser.mockResolvedValue(user);
    mockHasUserFlag.mockReturnValue(true);
    mockCheckActionRateLimit.mockResolvedValue(null);
    mockGetCachedGoals.mockResolvedValue(null);
    mockGetGoalsForCompanyInternal.mockResolvedValue([]);
    mockGetAnalyticsDataForDashboard.mockResolvedValue({ success: true, data: [] });
    mockGetTablesForDashboardInternal.mockResolvedValue({ success: true, data: [] });
    mockPrismaViewFindMany.mockResolvedValue([]);

    await getDashboardInitialData();

    const viewQuery = mockPrismaViewFindMany.mock.calls[0][0];
    // Manager should NOT have a tableId filter — same as admin
    expect(viewQuery.where.tableId).toBeUndefined();
    expect(viewQuery.where.companyId).toBe(user.companyId);
  });

  it("view query includes isEnabled: true", async () => {
    setupAuthenticatedAdmin();
    mockGetCachedGoals.mockResolvedValue(null);
    mockGetGoalsForCompanyInternal.mockResolvedValue([]);
    mockGetAnalyticsDataForDashboard.mockResolvedValue({ success: true, data: [] });
    mockGetTablesForDashboardInternal.mockResolvedValue({ success: true, data: [] });
    mockPrismaViewFindMany.mockResolvedValue([]);

    await getDashboardInitialData();

    const viewQuery = mockPrismaViewFindMany.mock.calls[0][0];
    expect(viewQuery.where.isEnabled).toBe(true);
  });

  it("rate limit uses DASHBOARD_RATE_LIMITS.read", async () => {
    const user = setupAuthenticatedAdmin();
    mockGetCachedGoals.mockResolvedValue(null);
    mockGetGoalsForCompanyInternal.mockResolvedValue([]);
    mockGetAnalyticsDataForDashboard.mockResolvedValue({ success: true, data: [] });
    mockGetTablesForDashboardInternal.mockResolvedValue({ success: true, data: [] });
    mockPrismaViewFindMany.mockResolvedValue([]);

    await getDashboardInitialData();

    expect(mockCheckActionRateLimit).toHaveBeenCalledWith(
      String(user.id),
      DASHBOARD_RATE_LIMITS.read,
    );
  });

  it("basic user with null tablePermissions — no tableId filter, no crash", async () => {
    const user = makeUser({
      role: "basic",
      permissions: { canViewDashboardData: true },
      tablePermissions: null,
    });
    mockGetCurrentUser.mockResolvedValue(user);
    mockHasUserFlag.mockReturnValue(true);
    mockCheckActionRateLimit.mockResolvedValue(null);
    mockGetCachedGoals.mockResolvedValue(null);
    mockGetGoalsForCompanyInternal.mockResolvedValue([]);
    mockGetAnalyticsDataForDashboard.mockResolvedValue({ success: true, data: [] });
    mockGetTablesForDashboardInternal.mockResolvedValue({ success: true, data: [] });
    mockPrismaViewFindMany.mockResolvedValue([]);

    const result = await getDashboardInitialData();

    const viewQuery = mockPrismaViewFindMany.mock.calls[0][0];
    // null tablePermissions should NOT produce a tableId filter
    expect(viewQuery.where.tableId).toBeUndefined();
    expect(result.tables).toEqual([]);
  });

  it("view query includes take: 500", async () => {
    setupAuthenticatedAdmin();
    mockGetCachedGoals.mockResolvedValue(null);
    mockGetGoalsForCompanyInternal.mockResolvedValue([]);
    mockGetAnalyticsDataForDashboard.mockResolvedValue({ success: true, data: [] });
    mockGetTablesForDashboardInternal.mockResolvedValue({ success: true, data: [] });
    mockPrismaViewFindMany.mockResolvedValue([]);

    await getDashboardInitialData();

    const viewQuery = mockPrismaViewFindMany.mock.calls[0][0];
    expect(viewQuery.take).toBe(500);
  });

  it("analyticsRes fulfilled with {success: false} returns empty analyticsViews", async () => {
    setupAuthenticatedAdmin();
    mockGetCachedGoals.mockResolvedValue(null);
    mockGetGoalsForCompanyInternal.mockResolvedValue([{ id: 1 }]);
    // Fulfilled (not rejected) with success: false — different code path from rejection
    mockGetAnalyticsDataForDashboard.mockResolvedValue({ success: false, data: null });
    mockGetTablesForDashboardInternal.mockResolvedValue({
      success: true,
      data: [{ id: 100 }],
    });
    mockPrismaViewFindMany.mockResolvedValue([]);

    const result = await getDashboardInitialData();

    expect(result.analyticsViews).toEqual([]);
    // Other data should be unaffected
    expect(result.tables).toHaveLength(1);
    expect(result.goals).toEqual([{ id: 1 }]);
  });

  it("tablesRes fulfilled with {success: false} returns empty tables", async () => {
    setupAuthenticatedAdmin();
    mockGetCachedGoals.mockResolvedValue(null);
    mockGetGoalsForCompanyInternal.mockResolvedValue([{ id: 1 }]);
    mockGetAnalyticsDataForDashboard.mockResolvedValue({ success: true, data: [{ id: 10 }] });
    // Fulfilled (not rejected) with success: false — different code path from rejection
    mockGetTablesForDashboardInternal.mockResolvedValue({ success: false, data: null });
    mockPrismaViewFindMany.mockResolvedValue([]);

    const result = await getDashboardInitialData();

    expect(result.tables).toEqual([]);
    // Other data should be unaffected
    expect(result.analyticsViews).toEqual([{ id: 10 }]);
    expect(result.goals).toEqual([{ id: 1 }]);
  });

  it("calls getAnalyticsDataForDashboard with companyId", async () => {
    const user = setupAuthenticatedAdmin();
    mockGetCachedGoals.mockResolvedValue(null);
    mockGetGoalsForCompanyInternal.mockResolvedValue([]);
    mockGetAnalyticsDataForDashboard.mockResolvedValue({ success: true, data: [] });
    mockGetTablesForDashboardInternal.mockResolvedValue({ success: true, data: [] });
    mockPrismaViewFindMany.mockResolvedValue([]);

    await getDashboardInitialData();

    expect(mockGetAnalyticsDataForDashboard).toHaveBeenCalledWith(user.companyId);
  });

  it("calls getTablesForDashboardInternal with (companyId, role, tablePermissions)", async () => {
    const user = setupAuthenticatedAdmin();
    mockGetCachedGoals.mockResolvedValue(null);
    mockGetGoalsForCompanyInternal.mockResolvedValue([]);
    mockGetAnalyticsDataForDashboard.mockResolvedValue({ success: true, data: [] });
    mockGetTablesForDashboardInternal.mockResolvedValue({ success: true, data: [] });
    mockPrismaViewFindMany.mockResolvedValue([]);

    await getDashboardInitialData();

    expect(mockGetTablesForDashboardInternal).toHaveBeenCalledWith(
      user.companyId,
      user.role,
      user.tablePermissions,
    );
  });

  it("getCachedGoals called with user companyId", async () => {
    const user = setupAuthenticatedAdmin();
    mockGetCachedGoals.mockResolvedValue({ data: [{ id: 1 }], stale: false });
    mockGetAnalyticsDataForDashboard.mockResolvedValue({ success: true, data: [] });
    mockGetTablesForDashboardInternal.mockResolvedValue({ success: true, data: [] });
    mockPrismaViewFindMany.mockResolvedValue([]);

    await getDashboardInitialData();

    expect(mockGetCachedGoals).toHaveBeenCalledWith(user.companyId);
  });

  it("view query includes correct orderBy", async () => {
    setupAuthenticatedAdmin();
    mockGetCachedGoals.mockResolvedValue(null);
    mockGetGoalsForCompanyInternal.mockResolvedValue([]);
    mockGetAnalyticsDataForDashboard.mockResolvedValue({ success: true, data: [] });
    mockGetTablesForDashboardInternal.mockResolvedValue({ success: true, data: [] });
    mockPrismaViewFindMany.mockResolvedValue([]);

    await getDashboardInitialData();

    const viewQuery = mockPrismaViewFindMany.mock.calls[0][0];
    expect(viewQuery.orderBy).toEqual([{ order: "asc" }, { createdAt: "asc" }]);
  });

  it("view query select fields match expected schema", async () => {
    setupAuthenticatedAdmin();
    mockGetCachedGoals.mockResolvedValue(null);
    mockGetGoalsForCompanyInternal.mockResolvedValue([]);
    mockGetAnalyticsDataForDashboard.mockResolvedValue({ success: true, data: [] });
    mockGetTablesForDashboardInternal.mockResolvedValue({ success: true, data: [] });
    mockPrismaViewFindMany.mockResolvedValue([]);

    await getDashboardInitialData();

    const viewQuery = mockPrismaViewFindMany.mock.calls[0][0];
    expect(viewQuery.select).toEqual({ id: true, tableId: true, name: true, config: true });
  });

  it("silently catches Inngest send failure without crashing", async () => {
    setupAuthenticatedAdmin();
    mockGetCachedGoals.mockResolvedValue({ data: [{ id: 99 }], stale: true });
    mockInngestSend.mockRejectedValue(new Error("inngest unreachable"));
    mockGetAnalyticsDataForDashboard.mockResolvedValue({ success: true, data: [] });
    mockGetTablesForDashboardInternal.mockResolvedValue({ success: true, data: [] });
    mockPrismaViewFindMany.mockResolvedValue([]);

    // Should not throw even though inngest.send rejects
    const result = await getDashboardInitialData();

    expect(result.goals).toEqual([{ id: 99 }]);
    // Flush microtasks to ensure the rejected promise is caught
    await vi.waitFor(() => {
      expect(mockInngestSend).toHaveBeenCalled();
    });
  });

  it("Inngest dedup id includes companyId and time-bucket from GOALS_DEDUP_WINDOW_MS", async () => {
    setupAuthenticatedAdmin();
    mockGetCachedGoals.mockResolvedValue({ data: [], stale: true });
    mockInngestSend.mockResolvedValue(undefined);
    mockGetAnalyticsDataForDashboard.mockResolvedValue({ success: true, data: [] });
    mockGetTablesForDashboardInternal.mockResolvedValue({ success: true, data: [] });
    mockPrismaViewFindMany.mockResolvedValue([]);

    const bucketBefore = Math.floor(Date.now() / 60_000);
    await getDashboardInitialData();
    const bucketAfter = Math.floor(Date.now() / 60_000);

    await vi.waitFor(() => {
      const call = mockInngestSend.mock.calls[0][0];
      expect(call.id).toMatch(/^goals-refresh-10-\d+$/);
      const bucket = Number(call.id.replace("goals-refresh-10-", ""));
      expect(bucket).toBeGreaterThanOrEqual(bucketBefore);
      expect(bucket).toBeLessThanOrEqual(bucketAfter);
    });
  });

  it("basic user with empty tablePermissions object produces tableId filter with empty array", async () => {
    const user = makeUser({ role: "basic", tablePermissions: {} });
    mockGetCurrentUser.mockResolvedValue(user);
    mockHasUserFlag.mockReturnValue(true);
    mockCheckActionRateLimit.mockResolvedValue(null);
    mockGetCachedGoals.mockResolvedValue(null);
    mockGetGoalsForCompanyInternal.mockResolvedValue([]);
    mockGetAnalyticsDataForDashboard.mockResolvedValue({ success: true, data: [] });
    mockGetTablesForDashboardInternal.mockResolvedValue({ success: true, data: [] });
    mockPrismaViewFindMany.mockResolvedValue([]);

    await getDashboardInitialData();

    const call = mockPrismaViewFindMany.mock.calls[0][0];
    expect(call.where.tableId).toEqual({ in: [] });
  });
});

// ════════════════════════════════════════════════════════════════════
// 2. getTableViewData
// ════════════════════════════════════════════════════════════════════

describe("getTableViewData", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockBuildWidgetHash.mockReturnValue("hash");
    mockSetCachedTableWidget.mockResolvedValue(undefined);
  });

  it("returns Unauthorized when no user", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const result = await getTableViewData(1, 1);
    expect(result).toEqual({ success: false, error: "Unauthorized" });
  });

  it("returns rate limit error when rate limited", async () => {
    mockGetCurrentUser.mockResolvedValue(makeUser());
    mockCheckActionRateLimit.mockResolvedValue({ error: "Rate limit exceeded. Please try again later." });
    const result = await getTableViewData(1, 1);
    expect(result).toEqual({ success: false, error: "Rate limit exceeded. Please try again later." });
  });

  it("returns Invalid input when Zod validation fails", async () => {
    setupAuthenticatedAdmin();
    const result = await getTableViewData(0, 1);
    expect(result).toEqual({ success: false, error: "Invalid input" });
  });

  it("returns Access denied when user cannot read table", async () => {
    mockGetCurrentUser.mockResolvedValue(makeUser());
    mockCheckActionRateLimit.mockResolvedValue(null);
    mockCanReadTable.mockReturnValue(false);
    const result = await getTableViewData(1, 1);
    expect(result).toEqual({ success: false, error: "Access denied" });
  });

  it("calls canReadTable with correct (user, tableId) arguments", async () => {
    const user = makeUser();
    mockGetCurrentUser.mockResolvedValue(user);
    mockCheckActionRateLimit.mockResolvedValue(null);
    mockCanReadTable.mockReturnValue(true);
    mockGetCachedTableWidget.mockResolvedValue(null);
    mockGetTableViewDataInternal.mockResolvedValue({ rows: [] });
    await getTableViewData(7, 1);
    expect(mockCanReadTable).toHaveBeenCalledWith(user, 7);
  });

  it('returns error for viewId "custom"', async () => {
    setupAuthenticatedAdmin();
    const result = await getTableViewData(1, "custom");
    expect(result).toEqual({
      success: false,
      error: "Use getCustomTableData for custom widgets",
    });
  });

  it("returns cached data on cache hit", async () => {
    setupAuthenticatedAdmin();
    const cachedData = { rows: [1, 2, 3] };
    mockGetCachedTableWidget.mockResolvedValue(cachedData);

    const result = await getTableViewData(1, 2);

    expect(result).toEqual({ success: true, data: cachedData });
    expect(mockGetCachedTableWidget).toHaveBeenCalledWith(10, "hash");
    expect(mockGetTableViewDataInternal).not.toHaveBeenCalled();
  });

  it("computes live data on cache miss and caches it", async () => {
    setupAuthenticatedAdmin();
    mockGetCachedTableWidget.mockResolvedValue(null);
    const liveData = { rows: [4, 5] };
    mockGetTableViewDataInternal.mockResolvedValue(liveData);

    const result = await getTableViewData(1, 2);

    expect(result).toEqual({ success: true, data: liveData });
    expect(mockSetCachedTableWidget).toHaveBeenCalledWith(10, "hash", liveData);
  });

  it("skips cache when bypassCache is true", async () => {
    setupAuthenticatedAdmin();
    const liveData = { rows: [6] };
    mockGetTableViewDataInternal.mockResolvedValue(liveData);

    const result = await getTableViewData(1, 2, true);

    expect(mockGetCachedTableWidget).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true, data: liveData });
    expect(mockSetCachedTableWidget).toHaveBeenCalledWith(10, "hash", liveData);
  });

  it("returns error when table/view not found", async () => {
    setupAuthenticatedAdmin();
    mockGetCachedTableWidget.mockResolvedValue(null);
    mockGetTableViewDataInternal.mockResolvedValue(null);

    const result = await getTableViewData(1, 2);

    expect(result).toEqual({ success: false, error: "Table or view not found" });
    expect(mockSetCachedTableWidget).not.toHaveBeenCalled();
  });

  it("returns generic error on DB exception", async () => {
    setupAuthenticatedAdmin();
    mockGetCachedTableWidget.mockResolvedValue(null);
    mockGetTableViewDataInternal.mockRejectedValue(new Error("connection refused"));

    const result = await getTableViewData(1, 2);

    expect(result).toEqual({ success: false, error: "Failed to fetch data" });
  });

  it("rate limit uses DASHBOARD_RATE_LIMITS.read", async () => {
    const user = setupAuthenticatedAdmin();
    mockGetCachedTableWidget.mockResolvedValue(null);
    mockGetTableViewDataInternal.mockResolvedValue({ rows: [] });

    await getTableViewData(1, 2);

    expect(mockCheckActionRateLimit).toHaveBeenCalledWith(
      String(user.id),
      DASHBOARD_RATE_LIMITS.read,
    );
  });

  it("calls getTableViewDataInternal with (tableId, companyId, Number(viewId)) for string viewId", async () => {
    setupAuthenticatedAdmin();
    mockGetCachedTableWidget.mockResolvedValue(null);
    mockGetTableViewDataInternal.mockResolvedValue({ rows: [] });

    await getTableViewData(5, "99");

    expect(mockGetTableViewDataInternal).toHaveBeenCalledWith(5, 10, 99);
  });

  it("calls buildWidgetHash with correct (tableId, viewId) args", async () => {
    setupAuthenticatedAdmin();
    mockGetCachedTableWidget.mockResolvedValue(null);
    mockGetTableViewDataInternal.mockResolvedValue({ rows: [] });

    await getTableViewData(7, 42);

    expect(mockBuildWidgetHash).toHaveBeenCalledWith(7, 42);
  });

  it("returns Invalid input for float viewId (Zod rejects non-integer)", async () => {
    setupAuthenticatedAdmin();
    const result = await getTableViewData(1, 1.5);
    expect(result).toEqual({ success: false, error: "Invalid input" });
  });

  it("returns Invalid input for viewId string exceeding 200 chars", async () => {
    setupAuthenticatedAdmin();
    const result = await getTableViewData(1, "x".repeat(201));
    expect(result).toEqual({ success: false, error: "Invalid input" });
  });

  it("handles negative integer viewId gracefully (passes Zod, returns not-found)", async () => {
    setupAuthenticatedAdmin();
    mockGetCachedTableWidget.mockResolvedValue(null);
    mockGetTableViewDataInternal.mockResolvedValue(null);
    const result = await getTableViewData(1, -1);
    expect(result).toEqual({ success: false, error: "Table or view not found" });
    expect(mockSetCachedTableWidget).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════
// 3. getCustomTableData
// ════════════════════════════════════════════════════════════════════

describe("getCustomTableData", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockBuildWidgetHash.mockReturnValue("hash");
    mockSetCachedTableWidget.mockResolvedValue(undefined);
  });

  it("returns Unauthorized when no user", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const result = await getCustomTableData(1, {});
    expect(result).toEqual({ success: false, error: "Unauthorized" });
  });

  it("returns rate limit error when rate limited", async () => {
    mockGetCurrentUser.mockResolvedValue(makeUser());
    mockCheckActionRateLimit.mockResolvedValue({ error: "Rate limit exceeded. Please try again later." });
    const result = await getCustomTableData(1, {});
    expect(result).toEqual({ success: false, error: "Rate limit exceeded. Please try again later." });
  });

  it("rate limit uses DASHBOARD_RATE_LIMITS.read", async () => {
    const user = setupAuthenticatedAdmin();
    mockGetCachedTableWidget.mockResolvedValue(null);
    mockGetCustomTableDataInternal.mockResolvedValue({ data: {} });

    await getCustomTableData(1, {});

    expect(mockCheckActionRateLimit).toHaveBeenCalledWith(
      String(user.id),
      DASHBOARD_RATE_LIMITS.read,
    );
  });

  it("returns Invalid input for non-integer tableId", async () => {
    setupAuthenticatedAdmin();
    const result = await getCustomTableData(1.5, {});
    expect(result).toEqual({ success: false, error: "Invalid input" });
  });

  it("returns Invalid input for zero tableId", async () => {
    setupAuthenticatedAdmin();
    const result = await getCustomTableData(0, {});
    expect(result).toEqual({ success: false, error: "Invalid input" });
  });

  it("returns Invalid input for negative tableId", async () => {
    setupAuthenticatedAdmin();
    const result = await getCustomTableData(-1, {});
    expect(result).toEqual({ success: false, error: "Invalid input" });
  });

  it("returns Invalid settings when Zod validation fails", async () => {
    setupAuthenticatedAdmin();
    const result = await getCustomTableData(1, { sort: "invalid" as any });
    expect(result).toEqual({ success: false, error: "Invalid settings" });
  });

  it("returns Access denied when user cannot read table", async () => {
    mockGetCurrentUser.mockResolvedValue(makeUser());
    mockCheckActionRateLimit.mockResolvedValue(null);
    mockCanReadTable.mockReturnValue(false);
    const result = await getCustomTableData(1, {});
    expect(result).toEqual({ success: false, error: "Access denied" });
  });

  it("calls canReadTable with correct (user, tableId) arguments", async () => {
    const user = makeUser();
    mockGetCurrentUser.mockResolvedValue(user);
    mockCheckActionRateLimit.mockResolvedValue(null);
    mockCanReadTable.mockReturnValue(true);
    mockGetCachedTableWidget.mockResolvedValue(null);
    mockGetCustomTableDataInternal.mockResolvedValue({ data: {} });
    await getCustomTableData(9, {});
    expect(mockCanReadTable).toHaveBeenCalledWith(user, 9);
  });

  it("returns cached data on cache hit", async () => {
    setupAuthenticatedAdmin();
    const cachedData = { type: "custom-table", data: {} };
    mockGetCachedTableWidget.mockResolvedValue(cachedData);

    const result = await getCustomTableData(1, {});

    expect(result).toEqual({ success: true, data: cachedData });
    expect(mockGetCachedTableWidget).toHaveBeenCalledWith(10, "hash");
    expect(mockGetCustomTableDataInternal).not.toHaveBeenCalled();
  });

  it("computes live data on cache miss and caches it", async () => {
    setupAuthenticatedAdmin();
    mockGetCachedTableWidget.mockResolvedValue(null);
    const liveData = { type: "custom-table", title: "T1", data: {} };
    mockGetCustomTableDataInternal.mockResolvedValue(liveData);

    const result = await getCustomTableData(1, { limit: 5 });

    expect(result).toEqual({ success: true, data: liveData });
    expect(mockSetCachedTableWidget).toHaveBeenCalledWith(10, "hash", liveData);
  });

  it("skips cache when bypassCache is true", async () => {
    setupAuthenticatedAdmin();
    const liveData = { type: "custom-table", data: {} };
    mockGetCustomTableDataInternal.mockResolvedValue(liveData);

    const result = await getCustomTableData(1, {}, true);

    expect(mockGetCachedTableWidget).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true, data: liveData });
    expect(mockSetCachedTableWidget).toHaveBeenCalledWith(10, "hash", liveData);
  });

  it("returns Table not found when internal returns null", async () => {
    setupAuthenticatedAdmin();
    mockGetCachedTableWidget.mockResolvedValue(null);
    mockGetCustomTableDataInternal.mockResolvedValue(null);

    const result = await getCustomTableData(1, {});

    expect(result).toEqual({ success: false, error: "Table not found" });
    expect(mockSetCachedTableWidget).not.toHaveBeenCalled();
  });

  it("returns generic error on DB exception", async () => {
    setupAuthenticatedAdmin();
    mockGetCachedTableWidget.mockResolvedValue(null);
    mockGetCustomTableDataInternal.mockRejectedValue(new Error("timeout"));

    const result = await getCustomTableData(1, {});

    expect(result).toEqual({ success: false, error: "Failed to fetch data" });
  });

  it("calls buildWidgetHash with (tableId, 'custom', settings)", async () => {
    setupAuthenticatedAdmin();
    const settings = { columns: ["name", "email"], sort: "desc" as const };
    mockGetCachedTableWidget.mockResolvedValue(null);
    mockGetCustomTableDataInternal.mockResolvedValue({ data: {} });

    await getCustomTableData(5, settings);

    expect(mockBuildWidgetHash).toHaveBeenCalledWith(5, "custom", { columns: ["name", "email"], sort: "desc" });
  });

  it("passes complex validated settings through to internal", async () => {
    setupAuthenticatedAdmin();
    const settings = { columns: ["name", "status"], sort: "asc" as const, sortBy: "name", limit: 25 };
    mockGetCachedTableWidget.mockResolvedValue(null);
    const liveData = { type: "custom-table", data: { rows: [] } };
    mockGetCustomTableDataInternal.mockResolvedValue(liveData);

    const result = await getCustomTableData(3, settings);

    expect(result).toEqual({ success: true, data: liveData });
    expect(mockGetCustomTableDataInternal).toHaveBeenCalledWith(
      3,
      10, // companyId from makeUser
      { columns: ["name", "status"], sort: "asc", sortBy: "name", limit: 25 },
    );
  });

  it("returns Invalid input when tableId is a string (type coercion defense)", async () => {
    setupAuthenticatedAdmin();
    const result = await getCustomTableData("5" as any, {});
    expect(result).toEqual({ success: false, error: "Invalid input" });
  });

  it("returns Invalid input for NaN tableId", async () => {
    setupAuthenticatedAdmin();
    const result = await getCustomTableData(NaN, {});
    expect(result).toEqual({ success: false, error: "Invalid input" });
  });

  it("returns Invalid input for Infinity tableId", async () => {
    setupAuthenticatedAdmin();
    const result = await getCustomTableData(Infinity, {});
    expect(result).toEqual({ success: false, error: "Invalid input" });
  });

  it("rejects settings with >50 columns via Zod", async () => {
    setupAuthenticatedAdmin();
    const cols = Array.from({ length: 51 }, (_, i) => `col${i}`);
    const result = await getCustomTableData(1, { columns: cols });
    expect(result).toEqual({ success: false, error: "Invalid settings" });
  });

  it("rejects settings with limit > 500 via Zod", async () => {
    setupAuthenticatedAdmin();
    const result = await getCustomTableData(1, { limit: 501 });
    expect(result).toEqual({ success: false, error: "Invalid settings" });
  });

  it("rejects settings with limit = 0 via Zod", async () => {
    setupAuthenticatedAdmin();
    const result = await getCustomTableData(1, { limit: 0 });
    expect(result).toEqual({ success: false, error: "Invalid settings" });
  });
});

// ════════════════════════════════════════════════════════════════════
// 4. getBatchTableData
// ════════════════════════════════════════════════════════════════════

describe("getBatchTableData", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockBuildWidgetHash.mockReturnValue("hash");
    mockSetCachedTableWidget.mockResolvedValue(undefined);
  });

  it("returns Unauthorized when no user", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const result = await getBatchTableData([{ widgetId: "w1", tableId: 1, viewId: 1 }]);
    expect(result).toEqual({ success: false, error: "Unauthorized" });
  });

  it("returns rate limit error when rate limited", async () => {
    mockGetCurrentUser.mockResolvedValue(makeUser());
    mockCheckActionRateLimit.mockResolvedValue({ error: "Rate limit exceeded. Please try again later." });
    const result = await getBatchTableData([{ widgetId: "w1", tableId: 1, viewId: 1 }]);
    expect(result).toEqual({ success: false, error: "Rate limit exceeded. Please try again later." });
  });

  it("returns Invalid input when Zod validation fails", async () => {
    setupAuthenticatedAdmin();
    const result = await getBatchTableData([{ widgetId: "", tableId: 1, viewId: 1 }]);
    expect(result).toEqual({ success: false, error: "Invalid input" });
  });

  it("rate limit uses DASHBOARD_RATE_LIMITS.batch", async () => {
    const user = setupAuthenticatedAdmin();
    mockGetCachedTableWidget.mockResolvedValue(null);
    mockGetTableViewDataInternal.mockResolvedValue({ rows: [] });

    await getBatchTableData([{ widgetId: "w1", tableId: 1, viewId: 1 }]);

    expect(mockCheckActionRateLimit).toHaveBeenCalledWith(
      String(user.id),
      DASHBOARD_RATE_LIMITS.batch,
    );
  });

  it("rejects batch with >50 requests via Zod", async () => {
    setupAuthenticatedAdmin();
    const requests = Array.from({ length: 51 }, (_, i) => ({
      widgetId: `w${i}`,
      tableId: 1,
      viewId: 1,
    }));

    const result = await getBatchTableData(requests);

    expect(result).toEqual({ success: false, error: "Invalid input" });
  });

  it("filters out unauthorized tables", async () => {
    setupAuthenticatedAdmin();
    mockCanReadTable.mockImplementation((_u: any, tableId: number) => tableId === 1);
    mockGetCachedTableWidget.mockResolvedValue(null);
    const liveData = { rows: [1] };
    mockGetTableViewDataInternal.mockResolvedValue(liveData);

    const result = await getBatchTableData([
      { widgetId: "w1", tableId: 1, viewId: 1 },
      { widgetId: "w2", tableId: 2, viewId: 1 },
    ]);

    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(1);
    expect(result.results![0].widgetId).toBe("w1");
  });

  it("returns cached data per widget on cache hits", async () => {
    setupAuthenticatedAdmin();
    const cached = { rows: [10] };
    mockGetCachedTableWidget.mockResolvedValue(cached);

    const result = await getBatchTableData([
      { widgetId: "w1", tableId: 1, viewId: 1 },
      { widgetId: "w2", tableId: 2, viewId: 2 },
    ]);

    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(2);
    expect(result.results![0]).toEqual({ widgetId: "w1", success: true, data: cached });
    expect(result.results![1]).toEqual({ widgetId: "w2", success: true, data: cached });
    expect(mockGetCachedTableWidget).toHaveBeenCalledTimes(2);
    expect(mockGetCachedTableWidget).toHaveBeenCalledWith(10, "hash");
    expect(mockGetTableViewDataInternal).not.toHaveBeenCalled();
    expect(mockSetCachedTableWidget).not.toHaveBeenCalled();
  });

  it("computes live data on cache misses and caches results", async () => {
    setupAuthenticatedAdmin();
    mockGetCachedTableWidget.mockResolvedValue(null);
    const liveData = { rows: [1] };
    mockGetTableViewDataInternal.mockResolvedValue(liveData);

    const result = await getBatchTableData([
      { widgetId: "w1", tableId: 1, viewId: 1 },
    ]);

    expect(result.success).toBe(true);
    expect(result.results![0]).toEqual({ widgetId: "w1", success: true, data: liveData });
    expect(mockSetCachedTableWidget).toHaveBeenCalledWith(10, "hash", liveData);
  });

  it("handles mixed cache hits and misses in single batch", async () => {
    setupAuthenticatedAdmin();
    const cachedData = { cached: true };
    const liveData = { live: true };
    mockBuildWidgetHash.mockImplementation(
      (tableId: number) => `hash-${tableId}`,
    );
    mockGetCachedTableWidget
      .mockResolvedValueOnce(cachedData)
      .mockResolvedValueOnce(null);
    mockGetTableViewDataInternal.mockResolvedValue(liveData);

    const result = await getBatchTableData([
      { widgetId: "w1", tableId: 1, viewId: 1 },
      { widgetId: "w2", tableId: 2, viewId: 2 },
    ]);

    expect(result.success).toBe(true);
    expect(result.results![0]).toEqual({ widgetId: "w1", success: true, data: cachedData });
    expect(result.results![1]).toEqual({ widgetId: "w2", success: true, data: liveData });
    expect(mockSetCachedTableWidget).toHaveBeenCalledTimes(1);
    expect(mockSetCachedTableWidget).toHaveBeenCalledWith(10, "hash-2", liveData);
  });

  it('uses getCustomTableDataInternal for "custom" viewId widgets', async () => {
    setupAuthenticatedAdmin();
    mockGetCachedTableWidget.mockResolvedValue(null);
    const customData = { type: "custom-table", data: {} };
    mockGetCustomTableDataInternal.mockResolvedValue(customData);

    const result = await getBatchTableData([
      { widgetId: "w1", tableId: 1, viewId: "custom", settings: { limit: 5 } },
    ]);

    expect(result.success).toBe(true);
    expect(result.results![0].data).toEqual(customData);
    expect(mockGetCustomTableDataInternal).toHaveBeenCalledWith(1, 10, { limit: 5 });
    expect(mockBuildWidgetHash).toHaveBeenCalledWith(1, "custom", { limit: 5 });
    expect(mockSetCachedTableWidget).toHaveBeenCalledWith(10, "hash", customData);
    expect(mockGetTableViewDataInternal).not.toHaveBeenCalled();
  });

  it("individual widget error does not break the batch", async () => {
    setupAuthenticatedAdmin();
    mockGetCachedTableWidget.mockResolvedValue(null);
    mockGetTableViewDataInternal
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ rows: [1] });

    const result = await getBatchTableData([
      { widgetId: "w1", tableId: 1, viewId: 1 },
      { widgetId: "w2", tableId: 2, viewId: 2 },
    ]);

    expect(result.success).toBe(true);
    expect(result.results![0]).toEqual({ widgetId: "w1", success: false, error: "Failed to fetch data" });
    expect(result.results![1]).toEqual({ widgetId: "w2", success: true, data: { rows: [1] } });
  });

  it("widget returns error when table/view not found", async () => {
    setupAuthenticatedAdmin();
    mockGetCachedTableWidget.mockResolvedValue(null);
    mockGetTableViewDataInternal.mockResolvedValue(null);

    const result = await getBatchTableData([
      { widgetId: "w1", tableId: 1, viewId: 1 },
    ]);

    expect(result.success).toBe(true);
    expect(result.results![0]).toEqual({ widgetId: "w1", success: false, error: "Table or view not found" });
    expect(mockSetCachedTableWidget).not.toHaveBeenCalled();
  });

  it("skips cache for all widgets when bypassCache is true", async () => {
    setupAuthenticatedAdmin();
    const liveData = { rows: [1] };
    mockGetTableViewDataInternal.mockResolvedValue(liveData);

    const result = await getBatchTableData(
      [{ widgetId: "w1", tableId: 1, viewId: 1 }],
      true,
    );

    expect(mockGetCachedTableWidget).not.toHaveBeenCalled();
    expect(mockSetCachedTableWidget).toHaveBeenCalledWith(10, "hash", liveData);
    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(1);
    expect(result.results![0]).toEqual({ widgetId: "w1", success: true, data: liveData });
  });

  it("returns generic error on top-level DB exception", async () => {
    mockGetCurrentUser.mockRejectedValue(new Error("DB crashed"));
    const result = await getBatchTableData([{ widgetId: "w1", tableId: 1, viewId: 1 }]);
    expect(result).toEqual({ success: false, error: "Failed to fetch batch data" });
  });

  it("processes >5 widgets in multiple chunks — peakConcurrency <= 5", async () => {
    setupAuthenticatedAdmin();
    mockGetCachedTableWidget.mockResolvedValue(null);

    let activeConcurrency = 0;
    let peakConcurrency = 0;
    mockGetTableViewDataInternal.mockImplementation(async (tableId: number) => {
      activeConcurrency++;
      peakConcurrency = Math.max(peakConcurrency, activeConcurrency);
      // Simulate async work so concurrency can overlap within a chunk
      await new Promise((r) => setTimeout(r, 10));
      activeConcurrency--;
      return { rows: [tableId] };
    });

    const requests = Array.from({ length: 7 }, (_, i) => ({
      widgetId: `w${i + 1}`,
      tableId: i + 1,
      viewId: 1,
    }));

    const result = await getBatchTableData(requests);

    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(7);
    // Verify concurrency was limited to BATCH_CONCURRENCY=5
    expect(peakConcurrency).toBeLessThanOrEqual(5);
    // All 7 widgets should have data
    for (let i = 0; i < 7; i++) {
      expect(result.results![i].widgetId).toBe(`w${i + 1}`);
      expect(result.results![i].success).toBe(true);
      expect(result.results![i].data).toEqual({ rows: [i + 1] });
    }
  });

  it("returns empty results array when all requests are unauthorized", async () => {
    setupAuthenticatedAdmin();
    // canReadTable returns false for all tables
    mockCanReadTable.mockReturnValue(false);

    const result = await getBatchTableData([
      { widgetId: "w1", tableId: 1, viewId: 1 },
      { widgetId: "w2", tableId: 2, viewId: 2 },
    ]);

    expect(result.success).toBe(true);
    expect(result.results).toEqual([]);
    expect(mockGetTableViewDataInternal).not.toHaveBeenCalled();
  });

  it("returns success with empty results for empty requests array", async () => {
    setupAuthenticatedAdmin();

    const result = await getBatchTableData([]);

    expect(result).toEqual({ success: true, results: [] });
    expect(mockGetTableViewDataInternal).not.toHaveBeenCalled();
    expect(mockGetCustomTableDataInternal).not.toHaveBeenCalled();
  });

  it("calls getCustomTableDataInternal with {} when custom viewId has no settings", async () => {
    setupAuthenticatedAdmin();
    mockGetCachedTableWidget.mockResolvedValue(null);
    const customData = { type: "custom-table", data: {} };
    mockGetCustomTableDataInternal.mockResolvedValue(customData);

    const result = await getBatchTableData([
      { widgetId: "w1", tableId: 3, viewId: "custom" },
    ]);

    expect(result.success).toBe(true);
    expect(result.results![0].data).toEqual(customData);
    expect(mockGetCustomTableDataInternal).toHaveBeenCalledWith(3, 10, {});
  });

  it("custom widget returns error when getCustomTableDataInternal returns null", async () => {
    setupAuthenticatedAdmin();
    mockGetCachedTableWidget.mockResolvedValue(null);
    mockGetCustomTableDataInternal.mockResolvedValue(null);
    const result = await getBatchTableData([
      { widgetId: "w1", tableId: 1, viewId: "custom", settings: { limit: 10 } },
    ]);
    expect(result.success).toBe(true);
    expect(result.results![0]).toEqual({
      widgetId: "w1", success: false, error: "Table or view not found",
    });
    expect(mockSetCachedTableWidget).not.toHaveBeenCalled();
  });

  it("converts numeric string viewId to Number for getTableViewDataInternal", async () => {
    setupAuthenticatedAdmin();
    mockGetCachedTableWidget.mockResolvedValue(null);
    mockGetTableViewDataInternal.mockResolvedValue({ rows: [] });

    await getBatchTableData([
      { widgetId: "w1", tableId: 1, viewId: "42" },
    ]);

    // viewId "42" should be converted to Number(42)
    expect(mockGetTableViewDataInternal).toHaveBeenCalledWith(1, 10, 42);
  });

  it("accepts batch with exactly 50 requests (boundary)", async () => {
    setupAuthenticatedAdmin();
    mockGetCachedTableWidget.mockResolvedValue(null);
    mockGetTableViewDataInternal.mockResolvedValue({ rows: [] });
    const requests = Array.from({ length: 50 }, (_, i) => ({
      widgetId: `w${i}`, tableId: 1, viewId: 1,
    }));

    const result = await getBatchTableData(requests);

    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(50);
  });

  it("rejects batch when a request has non-positive tableId", async () => {
    setupAuthenticatedAdmin();
    const result = await getBatchTableData([{ widgetId: "w1", tableId: 0, viewId: 1 }]);
    expect(result).toEqual({ success: false, error: "Invalid input" });
  });

  it("rejects batch request with widgetId exceeding 100 chars", async () => {
    setupAuthenticatedAdmin();
    const result = await getBatchTableData([{ widgetId: "x".repeat(101), tableId: 1, viewId: 1 }]);
    expect(result).toEqual({ success: false, error: "Invalid input" });
  });

  it("does not pass settings to buildWidgetHash for non-custom string viewId", async () => {
    setupAuthenticatedAdmin();
    mockGetCachedTableWidget.mockResolvedValue(null);
    mockGetTableViewDataInternal.mockResolvedValue({ rows: [] });

    await getBatchTableData([{ widgetId: "w1", tableId: 1, viewId: "42", settings: { limit: 10 } }]);

    expect(mockBuildWidgetHash).toHaveBeenCalledWith(1, "42", undefined);
  });

  it("per-widget cache read failure is caught as widget error, not batch failure", async () => {
    setupAuthenticatedAdmin();
    mockGetCachedTableWidget.mockRejectedValue(new Error("Redis connection lost"));

    const result = await getBatchTableData([{ widgetId: "w1", tableId: 1, viewId: 1 }]);

    expect(result.success).toBe(true);
    expect(result.results![0]).toEqual({ widgetId: "w1", success: false, error: "Failed to fetch data" });
  });

  it("batch widget returns error when setCachedTableWidget throws (cache write failure)", async () => {
    setupAuthenticatedAdmin();
    mockGetCachedTableWidget.mockResolvedValue(null);
    mockGetTableViewDataInternal.mockResolvedValue({ rows: [1] });
    mockSetCachedTableWidget.mockRejectedValue(new Error("Redis write timeout"));

    const result = await getBatchTableData([
      { widgetId: "w1", tableId: 1, viewId: 1 },
    ]);

    expect(result.success).toBe(true);
    expect(result.results![0]).toEqual({
      widgetId: "w1", success: false, error: "Failed to fetch data",
    });
    expect(mockGetTableViewDataInternal).toHaveBeenCalled();
  });
});

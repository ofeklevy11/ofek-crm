import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---
vi.mock("@/lib/permissions-server", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({
  canManageAnalytics: vi.fn(),
  hasUserFlag: vi.fn(),
}));

const mockTx = {
  analyticsView: {
    groupBy: vi.fn(),
    create: vi.fn(),
  },
  viewFolder: { create: vi.fn() },
  analyticsRefreshLog: { count: vi.fn(), create: vi.fn() },
  $executeRaw: vi.fn(),
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    analyticsView: {
      groupBy: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    automationRule: {
      findMany: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    analyticsRefreshLog: {
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    viewFolder: { create: vi.fn() },
    tableMeta: { findMany: vi.fn() },
    $transaction: vi.fn((fn: any) => fn(mockTx)),
  },
}));

vi.mock("@prisma/client", () => ({
  Prisma: {
    TransactionIsolationLevel: { Serializable: "Serializable" },
  },
}));

vi.mock("@/lib/rate-limit-action", () => ({
  checkActionRateLimit: vi.fn(),
  ANALYTICS_RATE_LIMITS: {
    read: { prefix: "ana-read", max: 60, windowSeconds: 60 },
    mutation: { prefix: "ana-mut", max: 15, windowSeconds: 60 },
    uiUpdate: { prefix: "ana-ui", max: 20, windowSeconds: 60 },
    preview: { prefix: "ana-prev", max: 5, windowSeconds: 30 },
  },
}));

vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: vi.fn() },
}));

vi.mock("@/lib/db-retry", () => ({
  withRetry: vi.fn((fn: any) => fn()),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/analytics/calculate", () => ({
  calculateViewStats: vi.fn(),
  calculateRuleStats: vi.fn(),
  resolveTableNameFromConfig: vi.fn(),
}));

vi.mock("@/lib/services/analytics-cache", () => ({
  getFullAnalyticsCache: vi.fn(),
  invalidateFullCache: vi.fn(),
  invalidateItemCache: vi.fn(),
  isRefreshLockHeld: vi.fn(),
}));

vi.mock("@/lib/security/audit-security", () => ({
  logSecurityEvent: vi.fn(),
  SEC_ANALYTICS_VIEW_DELETED: "SEC_ANALYTICS_VIEW_DELETED",
}));

// --- Imports ---
import {
  getAnalyticsLimits,
  createAnalyticsView,
  createAnalyticsReport,
  deleteAnalyticsView,
  updateAnalyticsView,
  getAnalyticsData,
  getAnalyticsDataAuthed,
  getAnalyticsDataForDashboard,
  updateAnalyticsViewOrder,
  updateAnalyticsViewColor,
  refreshAnalyticsItemWithChecks,
  previewAnalyticsView,
} from "@/app/actions/analytics";
import { getAnalyticsRefreshUsage } from "@/app/actions/analytics-refresh";
import { getCurrentUser } from "@/lib/permissions-server";
import { canManageAnalytics, hasUserFlag } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { checkActionRateLimit } from "@/lib/rate-limit-action";
import { inngest } from "@/lib/inngest/client";
import { revalidatePath } from "next/cache";
import { calculateViewStats, calculateRuleStats, resolveTableNameFromConfig } from "@/lib/analytics/calculate";
import { getFullAnalyticsCache, invalidateFullCache, invalidateItemCache, isRefreshLockHeld } from "@/lib/services/analytics-cache";
import { logSecurityEvent } from "@/lib/security/audit-security";

// --- Fixtures ---
const adminUser = {
  id: 1,
  companyId: 100,
  name: "Admin",
  email: "admin@test.com",
  role: "admin" as const,
  isPremium: "basic",
  allowedWriteTableIds: [] as number[],
  permissions: {} as Record<string, boolean>,
};

const premiumAdmin = {
  ...adminUser,
  id: 2,
  isPremium: "premium",
};

const superAdmin = {
  ...adminUser,
  id: 3,
  isPremium: "super",
};

const basicUserCanView = {
  id: 11,
  companyId: 100,
  name: "Viewer",
  email: "viewer@test.com",
  role: "basic" as const,
  isPremium: "basic",
  allowedWriteTableIds: [] as number[],
  permissions: { canViewAnalytics: true } as Record<string, boolean>,
};

const basicUserNoPerms = {
  id: 12,
  companyId: 100,
  name: "NoPerms",
  email: "none@test.com",
  role: "basic" as const,
  isPremium: "basic",
  allowedWriteTableIds: [] as number[],
  permissions: {} as Record<string, boolean>,
};

// --- Valid config & helpers ---
const validConfig = { model: "Task", filter: {} };

beforeEach(() => {
  vi.clearAllMocks();
  // Defaults: auth passes, rate limit passes
  vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
  vi.mocked(canManageAnalytics).mockReturnValue(true);
  vi.mocked(hasUserFlag).mockReturnValue(true);
  vi.mocked(checkActionRateLimit).mockResolvedValue(null);
  vi.mocked(inngest.send).mockResolvedValue(undefined as any);
  vi.mocked(invalidateFullCache).mockResolvedValue(undefined as any);
  vi.mocked(invalidateItemCache).mockResolvedValue(undefined as any);
  vi.mocked(isRefreshLockHeld).mockResolvedValue(false);
  vi.mocked(getFullAnalyticsCache).mockResolvedValue(null);
  vi.mocked(prisma.$transaction).mockImplementation((fn: any) => fn(mockTx));
  vi.mocked(prisma.analyticsView.groupBy).mockResolvedValue([] as any);
  vi.mocked(prisma.analyticsView.update).mockResolvedValue({} as any);
  vi.mocked(prisma.automationRule.findMany).mockResolvedValue([]);
  vi.mocked(prisma.analyticsView.findMany).mockResolvedValue([]);
  vi.mocked(prisma.tableMeta.findMany).mockResolvedValue([]);
  mockTx.analyticsView.groupBy.mockResolvedValue([]);
  mockTx.analyticsView.create.mockResolvedValue({ id: 1, type: "COUNT", config: validConfig });
  mockTx.viewFolder.create.mockResolvedValue({ id: 50, name: "Report" });
  mockTx.analyticsRefreshLog.count.mockResolvedValue(0);
  mockTx.analyticsRefreshLog.create.mockResolvedValue({});
  mockTx.$executeRaw.mockResolvedValue(0);
  vi.mocked(calculateViewStats).mockResolvedValue({ stats: { total: 10 }, items: [{ id: 1 }], tableName: "TestTable" });
  vi.mocked(calculateRuleStats).mockResolvedValue({ stats: { total: 5 }, items: [{ id: 2 }] });
  vi.mocked(resolveTableNameFromConfig).mockResolvedValue("ResolvedTable");
});

// ═══════════════════════════════════════════════════════════════
// getAnalyticsLimits
// ═══════════════════════════════════════════════════════════════
describe("getAnalyticsLimits", () => {
  it("returns Unauthorized when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await getAnalyticsLimits();
    expect(res).toEqual({ success: false, error: "Unauthorized" });
  });

  it("returns Unauthorized when user lacks canViewAnalytics", async () => {
    vi.mocked(hasUserFlag).mockReturnValue(false);
    const res = await getAnalyticsLimits();
    expect(res).toEqual({ success: false, error: "Unauthorized" });
  });

  it("returns error when user has no companyId", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ ...adminUser, companyId: undefined } as any);
    const res = await getAnalyticsLimits();
    expect(res).toEqual({ success: false, error: "User has no company" });
  });

  it("returns rate limit error when rate limited", async () => {
    vi.mocked(checkActionRateLimit).mockResolvedValue({ error: "Rate limit exceeded. Please try again later." });
    const res = await getAnalyticsLimits();
    expect(res.success).toBe(false);
    expect(res.error).toBe("Rate limit exceeded. Please try again later.");
  });

  it("uses read rate limit config", async () => {
    vi.mocked(prisma.analyticsView.groupBy).mockResolvedValue([] as any);
    await getAnalyticsLimits();
    expect(checkActionRateLimit).toHaveBeenCalledWith("1", expect.objectContaining({ prefix: "ana-read" }));
  });

  it("returns basic limits for admin with isPremium=basic", async () => {
    vi.mocked(prisma.analyticsView.groupBy).mockResolvedValue([] as any);
    const res = await getAnalyticsLimits();
    expect(res.success).toBe(true);
    expect((res as any).limits).toEqual({ regular: 5, graph: 3 });
  });

  it("returns premium limits", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(premiumAdmin as any);
    vi.mocked(prisma.analyticsView.groupBy).mockResolvedValue([] as any);
    const res = await getAnalyticsLimits();
    expect(res.success).toBe(true);
    expect((res as any).limits).toEqual({ regular: 15, graph: 10 });
  });

  it("returns super limits (Infinity)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(superAdmin as any);
    vi.mocked(prisma.analyticsView.groupBy).mockResolvedValue([] as any);
    const res = await getAnalyticsLimits();
    expect(res.success).toBe(true);
    expect((res as any).limits).toEqual({ regular: Infinity, graph: Infinity });
  });

  it("defaults to basic limits for unknown plan", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ ...adminUser, isPremium: "unknown" } as any);
    vi.mocked(prisma.analyticsView.groupBy).mockResolvedValue([] as any);
    const res = await getAnalyticsLimits();
    expect(res.success).toBe(true);
    expect((res as any).limits).toEqual({ regular: 5, graph: 3 });
  });

  it("calculates currentCounts from groupBy result", async () => {
    vi.mocked(prisma.analyticsView.groupBy).mockResolvedValue([
      { type: "CONVERSION", _count: 2 },
      { type: "COUNT", _count: 1 },
      { type: "GRAPH", _count: 2 },
    ] as any);
    const res = await getAnalyticsLimits();
    expect(res.success).toBe(true);
    expect((res as any).currentCounts).toEqual({ regular: 3, graph: 2 });
  });

  it("clamps remaining to 0 when over limit", async () => {
    vi.mocked(prisma.analyticsView.groupBy).mockResolvedValue([
      { type: "CONVERSION", _count: 3 },
      { type: "COUNT", _count: 3 },
      { type: "GRAPH", _count: 5 },
    ] as any);
    const res = await getAnalyticsLimits();
    expect(res.success).toBe(true);
    expect((res as any).remaining).toEqual({ regular: 0, graph: 0 });
  });

  it("returns basic with flag succeeds for non-admin user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserCanView as any);
    vi.mocked(prisma.analyticsView.groupBy).mockResolvedValue([] as any);
    const res = await getAnalyticsLimits();
    expect(res.success).toBe(true);
    expect((res as any).limits).toEqual({ regular: 5, graph: 3 });
    expect((res as any).remaining).toEqual({ regular: 5, graph: 3 });
  });

  it("returns error when DB groupBy fails", async () => {
    vi.mocked(prisma.analyticsView.groupBy).mockRejectedValue(new Error("DB error"));
    const res = await getAnalyticsLimits();
    expect(res.success).toBe(false);
    expect(res.error).toBe("Failed to count views");
  });

  it("returns error on unexpected exception", async () => {
    vi.mocked(getCurrentUser).mockRejectedValue(new Error("unexpected"));
    const res = await getAnalyticsLimits();
    expect(res).toEqual({ success: false, error: "Failed to get limits (Internal Error)" });
  });
});

// ═══════════════════════════════════════════════════════════════
// createAnalyticsView
// ═══════════════════════════════════════════════════════════════
describe("createAnalyticsView", () => {
  const validData = { title: "Test View", type: "COUNT", config: validConfig };

  it("returns Unauthorized when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await createAnalyticsView(validData);
    expect(res).toEqual({ success: false, error: "Unauthorized" });
  });

  it("returns Unauthorized when user cannot manage analytics", async () => {
    vi.mocked(canManageAnalytics).mockReturnValue(false);
    const res = await createAnalyticsView(validData);
    expect(res).toEqual({ success: false, error: "Unauthorized" });
  });

  it("returns rate limit error", async () => {
    vi.mocked(checkActionRateLimit).mockResolvedValue({ error: "Rate limit exceeded. Please try again later." });
    const res = await createAnalyticsView(validData);
    expect(res.success).toBe(false);
    expect(res.error).toBe("Rate limit exceeded. Please try again later.");
  });

  it("rejects empty title", async () => {
    const res = await createAnalyticsView({ ...validData, title: "" });
    expect(res).toEqual({ success: false, error: "Title is required and must be under 200 characters" });
  });

  it("rejects title over 200 characters", async () => {
    const res = await createAnalyticsView({ ...validData, title: "x".repeat(201) });
    expect(res).toEqual({ success: false, error: "Title is required and must be under 200 characters" });
  });

  it("rejects description over 2000 characters", async () => {
    const res = await createAnalyticsView({ ...validData, description: "x".repeat(2001) });
    expect(res).toEqual({ success: false, error: "Description must be under 2000 characters" });
  });

  it("accepts description exactly 2000 characters", async () => {
    const res = await createAnalyticsView({ ...validData, description: "x".repeat(2000) });
    expect(res.success).toBe(true);
  });

  it("rejects invalid type", async () => {
    const res = await createAnalyticsView({ ...validData, type: "INVALID" });
    expect(res).toEqual({ success: false, error: "Invalid analytics view type" });
  });

  it.each(["COUNT", "AVERAGE", "SUM", "CONVERSION", "DISTRIBUTION", "GRAPH"])("accepts valid type %s", async (type) => {
    const created = { id: 1, type, config: validConfig };
    mockTx.analyticsView.create.mockResolvedValue(created);
    const res = await createAnalyticsView({ ...validData, type });
    expect(res.success).toBe(true);
    expect(mockTx.analyticsView.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type }) }),
    );
  });

  it("rejects invalid color", async () => {
    const res = await createAnalyticsView({ ...validData, color: "bg-invalid" });
    expect(res).toEqual({ success: false, error: "Invalid color" });
  });

  it.each(["bg-white", "bg-red-50", "bg-yellow-50", "bg-green-50", "bg-blue-50", "bg-purple-50", "bg-pink-50"])(
    "accepts valid color %s",
    async (color) => {
      const created = { id: 1, type: "COUNT", config: validConfig };
      mockTx.analyticsView.create.mockResolvedValue(created);
      const res = await createAnalyticsView({ ...validData, color });
      expect(res.success).toBe(true);
      expect(mockTx.analyticsView.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ color }) }),
      );
    },
  );

  it("defaults color to bg-white when not provided", async () => {
    const created = { id: 1, type: "COUNT", config: validConfig };
    mockTx.analyticsView.create.mockResolvedValue(created);
    await createAnalyticsView(validData);
    expect(mockTx.analyticsView.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ color: "bg-white" }) }),
    );
  });

  it("rejects invalid config schema", async () => {
    const res = await createAnalyticsView({ ...validData, config: { model: "INVALID_MODEL" } });
    expect(res).toEqual({ success: false, error: "Invalid analytics config" });
  });

  it("rejects oversized config", async () => {
    // Build a config that passes Zod (each value <=1000, <=30 keys) but exceeds 16KB total
    const filter: Record<string, string> = {};
    for (let i = 0; i < 30; i++) filter[`k${i}`.padEnd(200, "x")] = "v".repeat(500);
    const hugeConfig = { model: "Task", filter };
    const res = await createAnalyticsView({ ...validData, config: hugeConfig });
    expect(res).toEqual({ success: false, error: "Config is too large" });
  });

  it("strips unknown fields from config via Zod", async () => {
    const created = { id: 1, type: "COUNT", config: validConfig };
    mockTx.analyticsView.create.mockResolvedValue(created);
    await createAnalyticsView({ ...validData, config: { model: "Task", unknownField: "stripped" } });
    expect(mockTx.analyticsView.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          config: expect.not.objectContaining({ unknownField: "stripped" }),
        }),
      }),
    );
  });

  it("returns limit error for basic plan when regular views at limit", async () => {
    mockTx.analyticsView.groupBy.mockResolvedValue([
      { type: "COUNT", _count: 5 },
    ]);
    const res = await createAnalyticsView(validData);
    expect(res.success).toBe(false);
    expect(res.error).toContain("5");
  });

  it("returns limit error for basic plan when graph views at limit", async () => {
    mockTx.analyticsView.groupBy.mockResolvedValue([
      { type: "GRAPH", _count: 3 },
    ]);
    const res = await createAnalyticsView({ ...validData, type: "GRAPH" });
    expect(res.success).toBe(false);
    expect(res.error).toContain("3");
  });

  it("respects premium limits", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(premiumAdmin as any);
    mockTx.analyticsView.groupBy.mockResolvedValue([
      { type: "COUNT", _count: 14 },
    ]);
    const created = { id: 1, type: "COUNT", config: validConfig };
    mockTx.analyticsView.create.mockResolvedValue(created);
    const res = await createAnalyticsView(validData);
    expect(res.success).toBe(true);
    expect(mockTx.analyticsView.create).toHaveBeenCalled();
  });

  it("super plan has no limits", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(superAdmin as any);
    mockTx.analyticsView.groupBy.mockResolvedValue([
      { type: "COUNT", _count: 999 },
    ]);
    const created = { id: 1, type: "COUNT", config: validConfig };
    mockTx.analyticsView.create.mockResolvedValue(created);
    const res = await createAnalyticsView(validData);
    expect(res.success).toBe(true);
    expect(mockTx.analyticsView.create).toHaveBeenCalled();
  });

  it("CONVERSION+COUNT counted together as regular", async () => {
    mockTx.analyticsView.groupBy.mockResolvedValue([
      { type: "CONVERSION", _count: 3 },
      { type: "COUNT", _count: 2 },
    ]);
    const res = await createAnalyticsView(validData);
    expect(res.success).toBe(false);
    expect(res.error).toContain("5");
  });

  it("creates view with correct data in tx", async () => {
    const created = { id: 1, type: "COUNT", config: validConfig, companyId: 100 };
    mockTx.analyticsView.create.mockResolvedValue(created);
    await createAnalyticsView({ ...validData, description: "desc", color: "bg-red-50" });
    expect(mockTx.analyticsView.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: 100,
        title: "Test View",
        type: "COUNT",
        description: "desc",
        color: "bg-red-50",
        order: 999,
      }),
    });
  });

  it("invalidates cache after creation", async () => {
    const created = { id: 1, type: "COUNT", config: validConfig };
    mockTx.analyticsView.create.mockResolvedValue(created);
    await createAnalyticsView(validData);
    expect(invalidateFullCache).toHaveBeenCalledWith(100);
  });

  it("sends inngest event after creation", async () => {
    const created = { id: 1, type: "COUNT", config: validConfig };
    mockTx.analyticsView.create.mockResolvedValue(created);
    await createAnalyticsView(validData);
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({ name: "analytics/refresh-company", data: { companyId: 100 } }),
    );
  });

  it("calculates inline stats after creation", async () => {
    const created = { id: 1, type: "COUNT", config: validConfig };
    mockTx.analyticsView.create.mockResolvedValue(created);
    await createAnalyticsView(validData);
    expect(calculateViewStats).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, type: "COUNT" }),
      100,
    );
  });

  it("updates cachedStats after inline calculation", async () => {
    const created = { id: 1, type: "COUNT", config: validConfig };
    mockTx.analyticsView.create.mockResolvedValue(created);
    await createAnalyticsView(validData);
    expect(prisma.analyticsView.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1, companyId: 100 },
        data: expect.objectContaining({
          cachedStats: expect.objectContaining({ stats: { total: 10 } }),
        }),
      }),
    );
  });

  it("inline stats failure is non-fatal", async () => {
    const created = { id: 1, type: "COUNT", config: validConfig };
    mockTx.analyticsView.create.mockResolvedValue(created);
    vi.mocked(calculateViewStats).mockRejectedValue(new Error("calc failed"));
    const res = await createAnalyticsView(validData);
    expect(res.success).toBe(true);
    expect((res as any).data).toBeDefined();
    expect((res as any).data.id).toBe(1);
  });

  it("returns error on transaction failure", async () => {
    vi.mocked(prisma.$transaction).mockRejectedValue(new Error("TX failed"));
    const res = await createAnalyticsView(validData);
    expect(res).toEqual({ success: false, error: "Failed to create view" });
  });

  it("inngest.send failure is swallowed", async () => {
    const created = { id: 1, type: "COUNT", config: validConfig };
    mockTx.analyticsView.create.mockResolvedValue(created);
    vi.mocked(inngest.send).mockReturnValue(Promise.reject(new Error("inngest down")) as any);
    const res = await createAnalyticsView(validData);
    expect(res.success).toBe(true);
    expect((res as any).data).toBeDefined();
    expect((res as any).data.id).toBe(1);
  });

  it("uses Serializable isolation with correct timeouts", async () => {
    mockTx.analyticsView.create.mockResolvedValue({ id: 1, type: "COUNT", config: validConfig });
    await createAnalyticsView(validData);
    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: "Serializable", maxWait: 3000, timeout: 5000 }),
    );
  });

  it("accepts title exactly 200 characters", async () => {
    mockTx.analyticsView.create.mockResolvedValue({ id: 1, type: "COUNT", config: validConfig });
    const res = await createAnalyticsView({ ...validData, title: "x".repeat(200) });
    expect(res.success).toBe(true);
  });

  it("SUM views are not counted in regularCount but are blocked when CONVERSION+COUNT reach limit", async () => {
    // 5 existing COUNT views = at limit. SUM is !isGraph so it hits the regular limit check.
    mockTx.analyticsView.groupBy.mockResolvedValue([
      { type: "COUNT", _count: 5 },
    ]);
    const res = await createAnalyticsView({ ...validData, type: "SUM" });
    expect(res.success).toBe(false);
    expect(res.error).toContain("5");
  });

  it("allows SUM view creation when CONVERSION+COUNT below limit", async () => {
    // 3 COUNT + 5 SUM existing. regularCount = 3 (only CONVERSION+COUNT counted). Under limit of 5.
    mockTx.analyticsView.groupBy.mockResolvedValue([
      { type: "COUNT", _count: 3 },
      { type: "SUM", _count: 5 },
    ]);
    const created = { id: 1, type: "SUM", config: validConfig };
    mockTx.analyticsView.create.mockResolvedValue(created);
    const res = await createAnalyticsView({ ...validData, type: "SUM" });
    expect(res.success).toBe(true);
    expect(mockTx.analyticsView.create).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
// createAnalyticsReport
// ═══════════════════════════════════════════════════════════════
describe("createAnalyticsReport", () => {
  const validReport = {
    reportTitle: "My Report",
    views: [
      { title: "View1", type: "COUNT", config: validConfig },
      { title: "View2", type: "GRAPH", config: validConfig },
    ],
  };

  it("returns Unauthorized when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await createAnalyticsReport(validReport);
    expect(res).toEqual({ success: false, error: "Unauthorized" });
  });

  it("returns Unauthorized when user cannot manage analytics", async () => {
    vi.mocked(canManageAnalytics).mockReturnValue(false);
    const res = await createAnalyticsReport(validReport);
    expect(res).toEqual({ success: false, error: "Unauthorized" });
  });

  it("returns rate limit error", async () => {
    vi.mocked(checkActionRateLimit).mockResolvedValue({ error: "Rate limit exceeded. Please try again later." });
    const res = await createAnalyticsReport(validReport);
    expect(res.success).toBe(false);
    expect(res.error).toBe("Rate limit exceeded. Please try again later.");
  });

  it("rejects empty report title", async () => {
    const res = await createAnalyticsReport({ ...validReport, reportTitle: "" });
    expect(res).toEqual({ success: false, error: "Report title is required and must be under 200 characters" });
  });

  it("rejects report title over 200 characters", async () => {
    const res = await createAnalyticsReport({ ...validReport, reportTitle: "x".repeat(201) });
    expect(res).toEqual({ success: false, error: "Report title is required and must be under 200 characters" });
  });

  it("rejects empty views array", async () => {
    const res = await createAnalyticsReport({ ...validReport, views: [] });
    expect(res).toEqual({ success: false, error: "Views array must have 1-20 items" });
  });

  it("rejects more than 20 views", async () => {
    const tooMany = Array.from({ length: 21 }, (_, i) => ({ title: `V${i}`, type: "COUNT", config: validConfig }));
    const res = await createAnalyticsReport({ ...validReport, views: tooMany });
    expect(res).toEqual({ success: false, error: "Views array must have 1-20 items" });
  });

  it("rejects non-array views", async () => {
    const res = await createAnalyticsReport({ ...validReport, views: "not-array" as any });
    expect(res).toEqual({ success: false, error: "Views array must have 1-20 items" });
  });

  it("rejects view with missing title", async () => {
    const res = await createAnalyticsReport({
      ...validReport,
      views: [{ title: "", type: "COUNT", config: validConfig }],
    });
    expect(res).toEqual({ success: false, error: "Each view must have a title under 200 characters" });
  });

  it("rejects view with invalid type", async () => {
    const res = await createAnalyticsReport({
      ...validReport,
      views: [{ title: "V", type: "INVALID", config: validConfig }],
    });
    expect(res.success).toBe(false);
    expect(res.error).toContain("Invalid view type");
  });

  it("rejects view with description over 2000 chars", async () => {
    const res = await createAnalyticsReport({
      ...validReport,
      views: [{ title: "V", type: "COUNT", description: "x".repeat(2001), config: validConfig }],
    });
    expect(res).toEqual({ success: false, error: "View description must be under 2000 characters" });
  });

  it("rejects view with invalid config", async () => {
    const res = await createAnalyticsReport({
      ...validReport,
      views: [{ title: "V", type: "COUNT", config: { model: "INVALID" } }],
    });
    expect(res).toEqual({ success: false, error: "Invalid analytics config in one of the views" });
  });

  it("rejects report view with oversized config", async () => {
    const filter: Record<string, string> = {};
    for (let i = 0; i < 30; i++) filter[`k${i}`.padEnd(200, "x")] = "v".repeat(500);
    const res = await createAnalyticsReport({
      reportTitle: "R",
      views: [{ title: "V", type: "COUNT", config: { model: "Task", filter } }],
    });
    expect(res).toEqual({ success: false, error: "Config is too large" });
  });

  it("accepts report view description exactly 2000 characters", async () => {
    const res = await createAnalyticsReport({
      reportTitle: "R",
      views: [{ title: "V", type: "COUNT", description: "x".repeat(2000), config: validConfig }],
    });
    expect(res.success).toBe(true);
  });

  it("checks plan limits for regular+graph combined", async () => {
    mockTx.analyticsView.groupBy.mockResolvedValue([
      { type: "COUNT", _count: 4 },
    ]);
    // validReport has 1 regular + 1 graph => 4+1=5 regular OK, but let's check graph
    const manyGraphs = {
      reportTitle: "Report",
      views: Array.from({ length: 4 }, () => ({ title: "V", type: "GRAPH", config: validConfig })),
    };
    mockTx.analyticsView.groupBy.mockResolvedValue([
      { type: "GRAPH", _count: 1 },
    ]);
    const res = await createAnalyticsReport(manyGraphs);
    expect(res.success).toBe(false);
    expect(res.error).toContain("3");
  });

  it("super plan has no limits for report", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(superAdmin as any);
    mockTx.analyticsView.groupBy.mockResolvedValue([{ type: "COUNT", _count: 999 }]);
    const views = [{ title: "V", type: "COUNT", config: validConfig }];
    mockTx.analyticsView.create.mockResolvedValue({ id: 1, type: "COUNT", config: validConfig });
    const res = await createAnalyticsReport({ reportTitle: "R", views });
    expect(res.success).toBe(true);
    expect(mockTx.analyticsView.create).toHaveBeenCalled();
  });

  it("creates folder with report title", async () => {
    mockTx.analyticsView.create.mockResolvedValue({ id: 1, type: "COUNT", config: validConfig });
    await createAnalyticsReport(validReport);
    expect(mockTx.viewFolder.create).toHaveBeenCalledWith({
      data: { name: "My Report", companyId: 100 },
    });
  });

  it("creates views in order with folderId", async () => {
    let callIndex = 0;
    mockTx.analyticsView.create.mockImplementation(async (args: any) => {
      const idx = callIndex++;
      return { id: idx + 1, type: args.data.type, config: args.data.config };
    });
    await createAnalyticsReport(validReport);
    const calls = mockTx.analyticsView.create.mock.calls;
    expect(calls[0][0].data.order).toBe(0);
    expect(calls[0][0].data.folderId).toBe(50);
    expect(calls[1][0].data.order).toBe(1);
    expect(calls[1][0].data.folderId).toBe(50);
  });

  it("uses Serializable isolation", async () => {
    mockTx.analyticsView.create.mockResolvedValue({ id: 1, type: "COUNT", config: validConfig });
    await createAnalyticsReport(validReport);
    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: "Serializable", timeout: 15000 }),
    );
  });

  it("invalidates cache after report creation", async () => {
    mockTx.analyticsView.create.mockResolvedValue({ id: 1, type: "COUNT", config: validConfig });
    await createAnalyticsReport(validReport);
    expect(invalidateFullCache).toHaveBeenCalledWith(100);
  });

  it("calculates stats per view", async () => {
    let callIndex = 0;
    mockTx.analyticsView.create.mockImplementation(async () => {
      return { id: ++callIndex, type: "COUNT", config: validConfig };
    });
    await createAnalyticsReport(validReport);
    expect(calculateViewStats).toHaveBeenCalledTimes(2);
  });

  it("persists inline stats to DB for each report view", async () => {
    let createIdx = 0;
    mockTx.analyticsView.create.mockImplementation(async (args: any) => {
      createIdx++;
      return { id: createIdx, type: args.data.type, config: args.data.config };
    });
    await createAnalyticsReport(validReport);
    // Each created view should trigger a DB update with cachedStats
    const updateCalls = vi.mocked(prisma.analyticsView.update).mock.calls;
    expect(updateCalls.length).toBeGreaterThanOrEqual(2);
    for (const call of updateCalls) {
      const arg = call[0] as any;
      expect(arg.data.cachedStats).toBeDefined();
      expect(arg.data.lastCachedAt).toBeInstanceOf(Date);
    }
  });

  it("returns folderId on success", async () => {
    mockTx.analyticsView.create.mockResolvedValue({ id: 1, type: "COUNT", config: validConfig });
    const res = await createAnalyticsReport(validReport);
    expect(res.success).toBe(true);
    expect((res as any).data.folderId).toBe(50);
  });

  it("per-view stats failure is non-fatal", async () => {
    mockTx.analyticsView.create.mockResolvedValue({ id: 1, type: "COUNT", config: validConfig });
    vi.mocked(calculateViewStats).mockRejectedValue(new Error("calc error"));
    const res = await createAnalyticsReport(validReport);
    expect(res.success).toBe(true);
    expect((res as any).data.folderId).toBe(50);
  });

  it("returns error on transaction failure", async () => {
    vi.mocked(prisma.$transaction).mockRejectedValue(new Error("TX failed"));
    const res = await createAnalyticsReport(validReport);
    expect(res).toEqual({ success: false, error: "Failed to create report" });
  });

  it("inngest.send failure is swallowed in report creation", async () => {
    mockTx.analyticsView.create.mockResolvedValue({ id: 1, type: "COUNT", config: validConfig });
    vi.mocked(inngest.send).mockImplementation(() => Promise.reject(new Error("inngest down")) as any);
    const res = await createAnalyticsReport({
      reportTitle: "R",
      views: [{ title: "V", type: "COUNT", config: validConfig }],
    });
    expect(res.success).toBe(true);
    expect((res as any).data.folderId).toBe(50);
  });

  it("report newRegularCount counts all non-GRAPH types against existingRegular (CONVERSION+COUNT only)", async () => {
    // 4 existing COUNT views. Report adds 2 SUM views.
    // existingRegular = 4, newRegularCount = 2, total = 6 > 5 → BLOCKED
    mockTx.analyticsView.groupBy.mockResolvedValue([
      { type: "COUNT", _count: 4 },
    ]);
    const views = [
      { title: "V1", type: "SUM", config: validConfig },
      { title: "V2", type: "AVERAGE", config: validConfig },
    ];
    const res = await createAnalyticsReport({ reportTitle: "R", views });
    expect(res.success).toBe(false);
    expect(res.error).toContain("5");
  });
});

// ═══════════════════════════════════════════════════════════════
// deleteAnalyticsView
// ═══════════════════════════════════════════════════════════════
describe("deleteAnalyticsView", () => {
  it("returns Unauthorized when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await deleteAnalyticsView(1);
    expect(res).toEqual({ success: false, error: "Unauthorized" });
  });

  it("returns Unauthorized when user cannot manage", async () => {
    vi.mocked(canManageAnalytics).mockReturnValue(false);
    const res = await deleteAnalyticsView(1);
    expect(res).toEqual({ success: false, error: "Unauthorized" });
  });

  it("returns rate limit error", async () => {
    vi.mocked(checkActionRateLimit).mockResolvedValue({ error: "Rate limit exceeded. Please try again later." });
    const res = await deleteAnalyticsView(1);
    expect(res.success).toBe(false);
    expect(res.error).toBe("Rate limit exceeded. Please try again later.");
  });

  it("deletes view scoped to companyId", async () => {
    vi.mocked(prisma.analyticsView.delete).mockResolvedValue({} as any);
    await deleteAnalyticsView(42);
    expect(prisma.analyticsView.delete).toHaveBeenCalledWith({ where: { id: 42, companyId: 100 } });
  });

  it("logs security event on delete", async () => {
    vi.mocked(prisma.analyticsView.delete).mockResolvedValue({} as any);
    await deleteAnalyticsView(42);
    expect(logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "SEC_ANALYTICS_VIEW_DELETED",
        companyId: 100,
        userId: 1,
        details: { viewId: 42 },
      }),
    );
  });

  it("invalidates full and item cache", async () => {
    vi.mocked(prisma.analyticsView.delete).mockResolvedValue({} as any);
    await deleteAnalyticsView(42);
    expect(invalidateFullCache).toHaveBeenCalledWith(100);
    expect(invalidateItemCache).toHaveBeenCalledWith(100, "view", 42);
  });

  it("sends inngest event", async () => {
    vi.mocked(prisma.analyticsView.delete).mockResolvedValue({} as any);
    await deleteAnalyticsView(42);
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({ name: "analytics/refresh-company" }),
    );
  });

  it("returns success on delete", async () => {
    vi.mocked(prisma.analyticsView.delete).mockResolvedValue({} as any);
    const res = await deleteAnalyticsView(42);
    expect(res).toEqual({ success: true });
  });

  it("returns error when DB throws on missing record", async () => {
    vi.mocked(prisma.analyticsView.delete).mockRejectedValue(new Error("Record not found"));
    const res = await deleteAnalyticsView(999);
    expect(res).toEqual({ success: false, error: "Failed to delete view" });
  });

  it("returns error on generic DB failure", async () => {
    vi.mocked(prisma.analyticsView.delete).mockRejectedValue(new Error("DB error"));
    const res = await deleteAnalyticsView(1);
    expect(res).toEqual({ success: false, error: "Failed to delete view" });
  });

  it("returns error when cache invalidation throws after delete", async () => {
    vi.mocked(prisma.analyticsView.delete).mockResolvedValue({} as any);
    vi.mocked(invalidateFullCache).mockRejectedValue(new Error("Redis down"));
    const res = await deleteAnalyticsView(42);
    expect(res).toEqual({ success: false, error: "Failed to delete view" });
  });

  it("inngest.send failure is swallowed after delete", async () => {
    vi.mocked(prisma.analyticsView.delete).mockResolvedValue({} as any);
    vi.mocked(inngest.send).mockImplementation(() => Promise.reject(new Error("inngest down")) as any);
    const res = await deleteAnalyticsView(42);
    expect(res).toEqual({ success: true });
  });
});

// ═══════════════════════════════════════════════════════════════
// updateAnalyticsView
// ═══════════════════════════════════════════════════════════════
describe("updateAnalyticsView", () => {
  const updatedView = { id: 1, type: "COUNT", config: validConfig, companyId: 100 };

  beforeEach(() => {
    vi.mocked(prisma.analyticsView.update).mockResolvedValue(updatedView as any);
  });

  it("returns Unauthorized when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await updateAnalyticsView(1, { title: "New" });
    expect(res).toEqual({ success: false, error: "Unauthorized" });
  });

  it("returns Unauthorized when user cannot manage", async () => {
    vi.mocked(canManageAnalytics).mockReturnValue(false);
    const res = await updateAnalyticsView(1, { title: "New" });
    expect(res).toEqual({ success: false, error: "Unauthorized" });
  });

  it("returns rate limit error", async () => {
    vi.mocked(checkActionRateLimit).mockResolvedValue({ error: "Rate limit exceeded. Please try again later." });
    const res = await updateAnalyticsView(1, { title: "New" });
    expect(res.success).toBe(false);
    expect(res.error).toBe("Rate limit exceeded. Please try again later.");
  });

  it("rejects empty title", async () => {
    const res = await updateAnalyticsView(1, { title: "" });
    expect(res).toEqual({ success: false, error: "Title is required and must be under 200 characters" });
  });

  it("rejects title over 200 characters", async () => {
    const res = await updateAnalyticsView(1, { title: "x".repeat(201) });
    expect(res).toEqual({ success: false, error: "Title is required and must be under 200 characters" });
  });

  it("rejects description over 2000 characters", async () => {
    const res = await updateAnalyticsView(1, { description: "x".repeat(2001) });
    expect(res).toEqual({ success: false, error: "Description must be under 2000 characters" });
  });

  it("accepts description exactly 2000 characters", async () => {
    const res = await updateAnalyticsView(1, { description: "x".repeat(2000) });
    expect(res.success).toBe(true);
  });

  it("rejects invalid type", async () => {
    const res = await updateAnalyticsView(1, { type: "BAD" });
    expect(res).toEqual({ success: false, error: "Invalid analytics view type" });
  });

  it("rejects invalid color", async () => {
    const res = await updateAnalyticsView(1, { color: "nope" });
    expect(res).toEqual({ success: false, error: "Invalid color" });
  });

  it("rejects invalid config", async () => {
    const res = await updateAnalyticsView(1, { config: { model: "INVALID" } });
    expect(res).toEqual({ success: false, error: "Invalid analytics config" });
  });

  it("rejects oversized config", async () => {
    const filter: Record<string, string> = {};
    for (let i = 0; i < 30; i++) filter[`k${i}`.padEnd(200, "x")] = "v".repeat(500);
    const res = await updateAnalyticsView(1, { config: { model: "Task", filter } });
    expect(res).toEqual({ success: false, error: "Config is too large" });
  });

  it("allows partial update (undefined fields skip validation)", async () => {
    const res = await updateAnalyticsView(1, { title: "Only Title" });
    expect(res.success).toBe(true);
  });

  it("update scoped to companyId", async () => {
    await updateAnalyticsView(42, { title: "New Title" });
    expect(prisma.analyticsView.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 42, companyId: 100 } }),
    );
  });

  it("invalidates both caches", async () => {
    await updateAnalyticsView(42, { title: "T" });
    expect(invalidateFullCache).toHaveBeenCalledWith(100);
    expect(invalidateItemCache).toHaveBeenCalledWith(100, "view", 42);
  });

  it("sends inngest event", async () => {
    await updateAnalyticsView(1, { title: "T" });
    expect(inngest.send).toHaveBeenCalled();
  });

  it("recalculates stats when config changes", async () => {
    vi.mocked(prisma.analyticsView.update).mockResolvedValue({ ...updatedView } as any);
    await updateAnalyticsView(1, { config: validConfig });
    expect(calculateViewStats).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1 }),
      100,
    );
    // Verify stats were persisted to DB (second update call = stats persist)
    const updateCalls = vi.mocked(prisma.analyticsView.update).mock.calls;
    const lastCall = updateCalls[updateCalls.length - 1][0] as any;
    expect(lastCall.data.cachedStats).toBeDefined();
    expect(lastCall.data.lastCachedAt).toBeInstanceOf(Date);
  });

  it("recalculates stats when type changes", async () => {
    vi.mocked(prisma.analyticsView.update).mockResolvedValue({ ...updatedView, type: "SUM" } as any);
    await updateAnalyticsView(1, { type: "SUM" });
    expect(calculateViewStats).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1 }),
      100,
    );
    const updateCalls = vi.mocked(prisma.analyticsView.update).mock.calls;
    const lastCall = updateCalls[updateCalls.length - 1][0] as any;
    expect(lastCall.data.cachedStats).toBeDefined();
    expect(lastCall.data.lastCachedAt).toBeInstanceOf(Date);
  });

  it("does NOT recalculate when only title changes", async () => {
    await updateAnalyticsView(1, { title: "Only Title" });
    expect(calculateViewStats).not.toHaveBeenCalled();
  });

  it("stats recalculation failure is non-fatal", async () => {
    vi.mocked(calculateViewStats).mockRejectedValue(new Error("calc fail"));
    const res = await updateAnalyticsView(1, { config: validConfig });
    expect(res.success).toBe(true);
    expect((res as any).data).toBeDefined();
    expect((res as any).data.id).toBe(1);
  });

  it("returns error on DB failure", async () => {
    vi.mocked(prisma.analyticsView.update).mockRejectedValue(new Error("DB"));
    const res = await updateAnalyticsView(1, { title: "T" });
    expect(res).toEqual({ success: false, error: "Failed to update view" });
  });

  it("inngest.send failure is swallowed after update", async () => {
    vi.mocked(inngest.send).mockImplementation(() => Promise.reject(new Error("inngest down")) as any);
    const res = await updateAnalyticsView(1, { title: "T" });
    expect(res.success).toBe(true);
    expect((res as any).data).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// getAnalyticsData
// ═══════════════════════════════════════════════════════════════
describe("getAnalyticsData", () => {
  it("returns Unauthorized when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await getAnalyticsData();
    expect(res).toEqual({ success: false, error: "Unauthorized" });
  });

  it("returns Unauthorized when user lacks canViewAnalytics", async () => {
    vi.mocked(hasUserFlag).mockReturnValue(false);
    const res = await getAnalyticsData();
    expect(res).toEqual({ success: false, error: "Unauthorized" });
  });

  it("returns rate limit error", async () => {
    vi.mocked(checkActionRateLimit).mockResolvedValue({ error: "Rate limit exceeded. Please try again later." });
    const res = await getAnalyticsData();
    expect(res.success).toBe(false);
    expect(res.error).toBe("Rate limit exceeded. Please try again later.");
  });

  it("returns cached data immediately from Redis without DB call", async () => {
    const cachedViews = [{ id: "cached_1" }];
    vi.mocked(getFullAnalyticsCache).mockResolvedValue(cachedViews as any);
    const res = await getAnalyticsData();
    expect(res).toEqual({ success: true, data: cachedViews });
    expect(prisma.automationRule.findMany).not.toHaveBeenCalled();
    expect(prisma.analyticsView.findMany).not.toHaveBeenCalled();
  });

  it("falls back to DB when Redis cache misses", async () => {
    vi.mocked(getFullAnalyticsCache).mockResolvedValue(null);
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([]);
    vi.mocked(prisma.analyticsView.findMany).mockResolvedValue([]);
    const res = await getAnalyticsData();
    expect(res.success).toBe(true);
    expect(prisma.automationRule.findMany).toHaveBeenCalled();
  });

  it("uses cached views directly (no inline calc)", async () => {
    vi.mocked(prisma.analyticsView.findMany).mockResolvedValue([
      { id: 1, title: "V1", type: "COUNT", config: {}, cachedStats: { stats: {}, items: [], tableName: "T" }, order: 0, color: "bg-white", folderId: null, lastCachedAt: new Date() } as any,
    ]);
    const res = await getAnalyticsData();
    expect(res.success).toBe(true);
    expect(calculateViewStats).not.toHaveBeenCalled();
  });

  it("calculates inline for uncached views (capped at 10)", async () => {
    const uncachedViews = Array.from({ length: 12 }, (_, i) => ({
      id: i + 1, title: `V${i}`, type: "COUNT", config: { model: "Task" },
      cachedStats: null, order: i, color: "bg-white", folderId: null, lastCachedAt: null,
    }));
    vi.mocked(prisma.analyticsView.findMany).mockResolvedValue(uncachedViews as any);
    const res = await getAnalyticsData();
    expect(res.success).toBe(true);
    // Max 10 uncached views calculated inline
    expect(calculateViewStats).toHaveBeenCalledTimes(10);
  });

  it("builds rule views shape correctly", async () => {
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([
      {
        id: 10, name: "Rule1", actionType: "CALCULATE_DURATION",
        triggerType: "TASK_STATUS_CHANGE", triggerConfig: {},
        cachedStats: { stats: { avg: 5 }, items: [{ id: 1 }] },
        analyticsOrder: 1, analyticsColor: "bg-blue-50", folderId: null, lastCachedAt: new Date(),
      } as any,
    ]);
    const res = await getAnalyticsData();
    expect(res.success).toBe(true);
    const views = (res as any).data;
    const ruleView = views.find((v: any) => v.id === "rule_10");
    expect(ruleView).toBeDefined();
    expect(ruleView.source).toBe("AUTOMATION");
    expect(ruleView.tableName).toBe("משימות");
  });

  it("builds custom views shape correctly", async () => {
    vi.mocked(prisma.analyticsView.findMany).mockResolvedValue([
      {
        id: 20, title: "Custom1", type: "SUM", config: { model: "Task" },
        cachedStats: { stats: { total: 100 }, items: [], tableName: "Tasks" },
        order: 0, color: "bg-green-50", folderId: null, lastCachedAt: new Date(),
      } as any,
    ]);
    const res = await getAnalyticsData();
    expect(res.success).toBe(true);
    const views = (res as any).data;
    const customView = views.find((v: any) => v.id === "view_20");
    expect(customView).toBeDefined();
    expect(customView.source).toBe("CUSTOM");
  });

  it("filters MULTI_ACTION to duration only", async () => {
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([
      {
        id: 11, name: "Multi", actionType: "MULTI_ACTION",
        actionConfig: { actions: [{ type: "SEND_EMAIL" }] },
        triggerType: "RECORD_CHANGE", triggerConfig: { tableId: "5" },
        cachedStats: null, analyticsOrder: 0, analyticsColor: null, folderId: null, lastCachedAt: null,
      } as any,
    ]);
    const res = await getAnalyticsData();
    expect(res.success).toBe(true);
    const views = (res as any).data;
    // No duration action → filtered out
    expect(views.find((v: any) => v.id === "rule_11")).toBeUndefined();
  });

  it("resolves table names from batch map", async () => {
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([
      {
        id: 12, name: "Rule", actionType: "CALCULATE_DURATION",
        triggerType: "RECORD_CHANGE", triggerConfig: { tableId: "7" },
        cachedStats: { stats: {}, items: [] },
        analyticsOrder: 0, analyticsColor: null, folderId: null, lastCachedAt: null,
      } as any,
    ]);
    vi.mocked(prisma.tableMeta.findMany).mockResolvedValue([{ id: 7, name: "Deals" }] as any);
    const res = await getAnalyticsData();
    const views = (res as any).data;
    const ruleView = views.find((v: any) => v.id === "rule_12");
    expect(ruleView.tableName).toBe("Deals");
  });

  it("sorts views by order", async () => {
    vi.mocked(prisma.analyticsView.findMany).mockResolvedValue([
      { id: 1, title: "B", type: "COUNT", config: {}, cachedStats: { stats: {}, items: [], tableName: "T" }, order: 2, color: "bg-white", folderId: null, lastCachedAt: new Date() } as any,
      { id: 2, title: "A", type: "COUNT", config: {}, cachedStats: { stats: {}, items: [], tableName: "T" }, order: 1, color: "bg-white", folderId: null, lastCachedAt: new Date() } as any,
    ]);
    const res = await getAnalyticsData();
    const views = (res as any).data;
    expect(views[0].order).toBeLessThanOrEqual(views[1].order);
  });

  it("DB queries capped at 500", async () => {
    await getAnalyticsData();
    expect(prisma.automationRule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 500 }),
    );
    expect(prisma.analyticsView.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 500 }),
    );
  });

  it("triggers background refresh when no lock held", async () => {
    vi.mocked(isRefreshLockHeld).mockResolvedValue(false);
    await getAnalyticsData();
    await new Promise(process.nextTick);
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({ name: "analytics/refresh-company", data: { companyId: 100 } }),
    );
  });

  it("skips background refresh when lock is held", async () => {
    vi.mocked(isRefreshLockHeld).mockResolvedValue(true);
    await getAnalyticsData();
    await new Promise(process.nextTick);
    expect(inngest.send).not.toHaveBeenCalled();
  });

  it("returns empty data/stats on inline calc failure", async () => {
    vi.mocked(prisma.analyticsView.findMany).mockResolvedValue([
      { id: 1, title: "V", type: "COUNT", config: { model: "Task" }, cachedStats: null, order: 0, color: "bg-white", folderId: null, lastCachedAt: null } as any,
    ]);
    vi.mocked(calculateViewStats).mockRejectedValue(new Error("calc failed"));
    const res = await getAnalyticsData();
    expect(res.success).toBe(true);
    const views = (res as any).data;
    const view = views.find((v: any) => v.id === "view_1");
    expect(view.data).toEqual([]);
    expect(view.stats).toBeNull();
  });

  it("returns error on top-level DB failure", async () => {
    vi.mocked(prisma.automationRule.findMany).mockRejectedValue(new Error("DB"));
    const res = await getAnalyticsData();
    expect(res).toEqual({ success: false, error: "Failed to fetch analytics data" });
  });

  it("isRefreshLockHeld error is swallowed", async () => {
    vi.mocked(isRefreshLockHeld).mockRejectedValue(new Error("redis down"));
    const res = await getAnalyticsData();
    expect(res.success).toBe(true);
  });

  it("calculates inline for uncached rules (capped at 10)", async () => {
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue(
      Array.from({ length: 12 }, (_, i) => ({
        id: i + 1, name: `R${i}`, actionType: "CALCULATE_DURATION",
        triggerType: "TASK_STATUS_CHANGE", triggerConfig: {},
        cachedStats: null, analyticsOrder: i, analyticsColor: null, folderId: null, lastCachedAt: null,
      })) as any,
    );
    await getAnalyticsData();
    expect(calculateRuleStats).toHaveBeenCalledTimes(10);
  });

  it("persists uncached rule stats to DB (fire-and-forget)", async () => {
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([{
      id: 50, name: "Uncached", actionType: "CALCULATE_DURATION",
      triggerType: "TASK_STATUS_CHANGE", triggerConfig: {},
      cachedStats: null, analyticsOrder: 0, analyticsColor: null, folderId: null, lastCachedAt: null,
    }] as any);
    vi.mocked(prisma.automationRule.update).mockResolvedValue({} as any);
    await getAnalyticsData();
    expect(prisma.automationRule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 50, companyId: 100 },
        data: expect.objectContaining({
          cachedStats: expect.objectContaining({ stats: { total: 5 } }),
        }),
      }),
    );
  });

  it("swallows fire-and-forget rule persist failure without affecting response", async () => {
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([{
      id: 51, name: "PersistFail", actionType: "CALCULATE_DURATION",
      triggerType: "TASK_STATUS_CHANGE", triggerConfig: {},
      cachedStats: null, analyticsOrder: 0, analyticsColor: null, folderId: null, lastCachedAt: null,
    }] as any);
    vi.mocked(prisma.automationRule.update).mockRejectedValue(new Error("DB write failed"));
    const res = await getAnalyticsData();
    expect(res.success).toBe(true);
    // Rule should still appear in results with calculated data
    const rule = (res as any).data.find((v: any) => v.id === "rule_51");
    expect(rule).toBeDefined();
    expect(rule.stats).toEqual({ total: 5 });
  });

  it("persists uncached view stats to DB (fire-and-forget)", async () => {
    vi.mocked(prisma.analyticsView.findMany).mockResolvedValue([{
      id: 60, title: "UncachedV", type: "COUNT", config: { model: "Task" },
      cachedStats: null, order: 0, color: "bg-white", folderId: null, lastCachedAt: null,
    }] as any);
    vi.mocked(prisma.analyticsView.update).mockResolvedValue({} as any);
    await getAnalyticsData();
    expect(prisma.analyticsView.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 60, companyId: 100 },
        data: expect.objectContaining({
          cachedStats: expect.objectContaining({ stats: { total: 10 }, tableName: "TestTable" }),
        }),
      }),
    );
  });

  it("includes MULTI_ACTION rule with CALCULATE_DURATION action", async () => {
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([{
      id: 20, name: "MultiDuration", actionType: "MULTI_ACTION",
      actionConfig: { actions: [{ type: "SEND_EMAIL" }, { type: "CALCULATE_DURATION" }] },
      triggerType: "TASK_STATUS_CHANGE", triggerConfig: {},
      cachedStats: { stats: {}, items: [] },
      analyticsOrder: 0, analyticsColor: null, folderId: null, lastCachedAt: new Date(),
    }] as any);
    const res = await getAnalyticsData();
    const views = (res as any).data;
    const rule = views.find((v: any) => v.id === "rule_20");
    expect(rule).toBeDefined();
    expect(rule.type).toBe("single-event");
  });

  it("falls back to 'טבלה לא ידועה' when table not in batch map", async () => {
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([{
      id: 30, name: "MissingTable", actionType: "CALCULATE_DURATION",
      triggerType: "RECORD_CHANGE", triggerConfig: { tableId: "999" },
      cachedStats: { stats: {}, items: [] },
      analyticsOrder: 0, analyticsColor: null, folderId: null, lastCachedAt: new Date(),
    }] as any);
    vi.mocked(prisma.tableMeta.findMany).mockResolvedValue([]);
    const res = await getAnalyticsData();
    const rule = (res as any).data.find((v: any) => v.id === "rule_30");
    expect(rule.tableName).toBe("טבלה לא ידועה");
  });

  it("calls resolveTableNameFromConfig for views without tableId or cached tableName", async () => {
    vi.mocked(prisma.analyticsView.findMany).mockResolvedValue([{
      id: 40, title: "NoTable", type: "COUNT", config: { model: "Task" },
      cachedStats: { stats: {}, items: [] },
      order: 0, color: "bg-white", folderId: null, lastCachedAt: new Date(),
    }] as any);
    const res = await getAnalyticsData();
    expect(res.success).toBe(true);
    expect(resolveTableNameFromConfig).toHaveBeenCalledWith({ model: "Task" }, 100);
    const view = (res as any).data.find((v: any) => v.id === "view_40");
    expect(view.tableName).toBe("ResolvedTable");
  });

  it("resolves custom view table name from batch tableMap when tableId present", async () => {
    vi.mocked(prisma.analyticsView.findMany).mockResolvedValue([{
      id: 70, title: "WithTableId", type: "COUNT", config: { model: "Task", tableId: "8" },
      cachedStats: { stats: {}, items: [] },
      order: 0, color: "bg-white", folderId: null, lastCachedAt: new Date(),
    }] as any);
    vi.mocked(prisma.tableMeta.findMany).mockResolvedValue([{ id: 8, name: "Invoices" }] as any);
    const res = await getAnalyticsData();
    const view = (res as any).data.find((v: any) => v.id === "view_70");
    expect(view.tableName).toBe("Invoices");
    expect(resolveTableNameFromConfig).not.toHaveBeenCalled();
  });

  it("custom view with missing tableId falls back to 'טבלה לא ידועה'", async () => {
    vi.mocked(prisma.analyticsView.findMany).mockResolvedValue([{
      id: 71, title: "MissingTable", type: "COUNT", config: { model: "Task", tableId: "888" },
      cachedStats: { stats: {}, items: [] },
      order: 0, color: "bg-white", folderId: null, lastCachedAt: new Date(),
    }] as any);
    vi.mocked(prisma.tableMeta.findMany).mockResolvedValue([]);
    const res = await getAnalyticsData();
    const view = (res as any).data.find((v: any) => v.id === "view_71");
    expect(view.tableName).toBe("טבלה לא ידועה");
  });

  it("resolves MULTI_ACTION with CALCULATE_MULTI_EVENT_DURATION to multi-event type", async () => {
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([{
      id: 21, name: "MultiEvent", actionType: "MULTI_ACTION",
      actionConfig: { actions: [{ type: "CALCULATE_MULTI_EVENT_DURATION" }] },
      triggerType: "TASK_STATUS_CHANGE", triggerConfig: {},
      cachedStats: { stats: {}, items: [] },
      analyticsOrder: 0, analyticsColor: null, folderId: null, lastCachedAt: new Date(),
    }] as any);
    const res = await getAnalyticsData();
    const rule = (res as any).data.find((v: any) => v.id === "rule_21");
    expect(rule).toBeDefined();
    expect(rule.type).toBe("multi-event");
  });

  it("returns error when getCurrentUser throws unexpectedly", async () => {
    vi.mocked(getCurrentUser).mockRejectedValue(new Error("unexpected crash"));
    const res = await getAnalyticsData();
    expect(res).toEqual({ success: false, error: "Failed to fetch analytics data" });
  });

  it("swallows fire-and-forget view persist failure without affecting response", async () => {
    vi.mocked(prisma.analyticsView.findMany).mockResolvedValue([{
      id: 80, title: "PersistFail", type: "COUNT", config: { model: "Task" },
      cachedStats: null, order: 0, color: "bg-white", folderId: null, lastCachedAt: null,
    }] as any);
    vi.mocked(prisma.analyticsView.update).mockRejectedValue(new Error("DB write failed"));
    const res = await getAnalyticsData();
    expect(res.success).toBe(true);
    const view = (res as any).data.find((v: any) => v.id === "view_80");
    expect(view).toBeDefined();
    expect(view.stats).toEqual({ total: 10 });
  });
});

// ═══════════════════════════════════════════════════════════════
// getAnalyticsDataAuthed
// ═══════════════════════════════════════════════════════════════
describe("getAnalyticsDataAuthed", () => {
  it("returns Unauthorized when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await getAnalyticsDataAuthed(100);
    expect(res).toEqual({ success: false, error: "Unauthorized" });
  });

  it("returns Unauthorized when companyId mismatches", async () => {
    const res = await getAnalyticsDataAuthed(999);
    expect(res).toEqual({ success: false, error: "Unauthorized" });
  });

  it("returns Unauthorized when user lacks canViewAnalytics", async () => {
    vi.mocked(hasUserFlag).mockReturnValue(false);
    const res = await getAnalyticsDataAuthed(100);
    expect(res).toEqual({ success: false, error: "Unauthorized" });
  });

  it("returns rate limit error", async () => {
    vi.mocked(checkActionRateLimit).mockResolvedValue({ error: "Rate limited" });
    const res = await getAnalyticsDataAuthed(100);
    expect(res.success).toBe(false);
    expect(res.error).toBe("Rate limited");
  });

  it("delegates to internal fetch on success", async () => {
    vi.mocked(getFullAnalyticsCache).mockResolvedValue([{ id: "v1" }] as any);
    const res = await getAnalyticsDataAuthed(100);
    expect(res).toEqual({ success: true, data: [{ id: "v1" }] });
  });
});

// ═══════════════════════════════════════════════════════════════
// getAnalyticsDataForDashboard
// ═══════════════════════════════════════════════════════════════
describe("getAnalyticsDataForDashboard", () => {
  it("returns data for companyId without auth check", async () => {
    vi.mocked(getFullAnalyticsCache).mockResolvedValue([{ id: "d1" }] as any);
    // Reset getCurrentUser to verify it is NOT called by the dashboard function
    vi.mocked(getCurrentUser).mockClear();
    const res = await getAnalyticsDataForDashboard(100);
    expect(res).toEqual({ success: true, data: [{ id: "d1" }] });
    expect(getCurrentUser).not.toHaveBeenCalled();
  });

  it("falls back to DB when no cache", async () => {
    vi.mocked(getFullAnalyticsCache).mockResolvedValue(null);
    const res = await getAnalyticsDataForDashboard(100);
    expect(res.success).toBe(true);
    expect(prisma.automationRule.findMany).toHaveBeenCalled();
  });

  it("propagates error from getAnalyticsDataForCompany", async () => {
    vi.mocked(getFullAnalyticsCache).mockResolvedValue(null);
    vi.mocked(prisma.automationRule.findMany).mockRejectedValue(new Error("DB fail"));
    const res = await getAnalyticsDataForDashboard(100);
    expect(res).toEqual({ success: false, error: "Failed to fetch analytics data" });
  });
});

// ═══════════════════════════════════════════════════════════════
// updateAnalyticsViewOrder
// ═══════════════════════════════════════════════════════════════
describe("updateAnalyticsViewOrder", () => {
  it("returns Unauthorized when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await updateAnalyticsViewOrder([]);
    expect(res).toEqual({ success: false, error: "Unauthorized" });
  });

  it("returns Unauthorized when user cannot manage", async () => {
    vi.mocked(canManageAnalytics).mockReturnValue(false);
    const res = await updateAnalyticsViewOrder([]);
    expect(res).toEqual({ success: false, error: "Unauthorized" });
  });

  it("returns rate limit error with uiUpdate config", async () => {
    vi.mocked(checkActionRateLimit).mockResolvedValue({ error: "Rate limit exceeded. Please try again later." });
    const res = await updateAnalyticsViewOrder([]);
    expect(res.success).toBe(false);
    expect(checkActionRateLimit).toHaveBeenCalledWith("1", expect.objectContaining({ prefix: "ana-ui" }));
  });

  it("rejects non-finite id", async () => {
    const res = await updateAnalyticsViewOrder([{ id: NaN, type: "CUSTOM", order: 0 }]);
    expect(res).toEqual({ success: false, error: "Invalid item data" });
  });

  it("rejects non-finite order", async () => {
    const res = await updateAnalyticsViewOrder([{ id: 1, type: "CUSTOM", order: Infinity }]);
    expect(res).toEqual({ success: false, error: "Invalid item data" });
  });

  it("rejects invalid type", async () => {
    const res = await updateAnalyticsViewOrder([{ id: 1, type: "BAD" as any, order: 0 }]);
    expect(res).toEqual({ success: false, error: "Invalid item data" });
  });

  it("caps at 200 items", async () => {
    const items = Array.from({ length: 250 }, (_, i) => ({ id: i + 1, type: "CUSTOM" as const, order: i }));
    await updateAnalyticsViewOrder(items);
    expect(prisma.$transaction).toHaveBeenCalled();
    // Verify only 200 items were processed (not 250) by checking the executeRaw call
    const rawCall = mockTx.$executeRaw.mock.calls[0];
    // The arrays passed to SQL unnest should have length <= 200
    const idsArray = rawCall[1];
    const ordersArray = rawCall[2];
    expect(idsArray).toHaveLength(200);
    expect(ordersArray).toHaveLength(200);
  });

  it("executes SQL unnest for AUTOMATION items", async () => {
    const items = [
      { id: 1, type: "AUTOMATION" as const, order: 0 },
      { id: 2, type: "AUTOMATION" as const, order: 1 },
    ];
    await updateAnalyticsViewOrder(items);
    expect(mockTx.$executeRaw).toHaveBeenCalled();
    const rawCall = mockTx.$executeRaw.mock.calls[0];
    expect(rawCall[1]).toEqual([1, 2]);
    expect(rawCall[2]).toEqual([0, 1]);
  });

  it("executes SQL unnest for CUSTOM items", async () => {
    const items = [
      { id: 3, type: "CUSTOM" as const, order: 0 },
    ];
    await updateAnalyticsViewOrder(items);
    expect(mockTx.$executeRaw).toHaveBeenCalled();
    const rawCall = mockTx.$executeRaw.mock.calls[0];
    expect(rawCall[1]).toEqual([3]);
    expect(rawCall[2]).toEqual([0]);
  });

  it("skips executeRaw when no items of a type", async () => {
    const items = [{ id: 1, type: "AUTOMATION" as const, order: 0 }];
    mockTx.$executeRaw.mockClear();
    await updateAnalyticsViewOrder(items);
    // Only 1 call for AUTOMATION, not 2
    expect(mockTx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("invalidates cache after order update", async () => {
    await updateAnalyticsViewOrder([{ id: 1, type: "CUSTOM" as const, order: 0 }]);
    expect(invalidateFullCache).toHaveBeenCalledWith(100);
  });

  it("returns success", async () => {
    const res = await updateAnalyticsViewOrder([{ id: 1, type: "CUSTOM" as const, order: 0 }]);
    expect(res).toEqual({ success: true });
  });

  it("executes both SQL unnest calls for mixed AUTOMATION+CUSTOM items", async () => {
    const items = [
      { id: 1, type: "AUTOMATION" as const, order: 0 },
      { id: 2, type: "CUSTOM" as const, order: 1 },
    ];
    await updateAnalyticsViewOrder(items);
    expect(mockTx.$executeRaw).toHaveBeenCalledTimes(2);
  });

  it("SQL unnest includes companyId for tenant isolation", async () => {
    const items = [{ id: 5, type: "CUSTOM" as const, order: 0 }];
    await updateAnalyticsViewOrder(items);
    const rawCall = mockTx.$executeRaw.mock.calls[0];
    // Prisma tagged template: rawCall = [templateStrings, ids, orders, companyId]
    // companyId (100) should be the last interpolated value
    const interpolatedValues = rawCall.slice(1);
    expect(interpolatedValues[interpolatedValues.length - 1]).toBe(100);
  });

  it("succeeds with empty items array without executing SQL", async () => {
    const res = await updateAnalyticsViewOrder([]);
    expect(res).toEqual({ success: true });
    expect(mockTx.$executeRaw).not.toHaveBeenCalled();
  });

  it("returns error on transaction failure", async () => {
    vi.mocked(prisma.$transaction).mockRejectedValue(new Error("TX failed"));
    const res = await updateAnalyticsViewOrder([{ id: 1, type: "CUSTOM" as const, order: 0 }]);
    expect(res).toEqual({ success: false, error: "Failed to update order" });
  });
});

// ═══════════════════════════════════════════════════════════════
// updateAnalyticsViewColor
// ═══════════════════════════════════════════════════════════════
describe("updateAnalyticsViewColor", () => {
  it("returns Unauthorized when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await updateAnalyticsViewColor(1, "CUSTOM", "bg-white");
    expect(res).toEqual({ success: false, error: "Unauthorized" });
  });

  it("returns Unauthorized when user cannot manage", async () => {
    vi.mocked(canManageAnalytics).mockReturnValue(false);
    const res = await updateAnalyticsViewColor(1, "CUSTOM", "bg-white");
    expect(res).toEqual({ success: false, error: "Unauthorized" });
  });

  it("returns rate limit error with uiUpdate config", async () => {
    vi.mocked(checkActionRateLimit).mockResolvedValue({ error: "Rate limited" });
    const res = await updateAnalyticsViewColor(1, "CUSTOM", "bg-white");
    expect(res.success).toBe(false);
    expect(res.error).toBe("Rate limited");
    expect(checkActionRateLimit).toHaveBeenCalledWith("1", expect.objectContaining({ prefix: "ana-ui" }));
  });

  it("rejects invalid color", async () => {
    const res = await updateAnalyticsViewColor(1, "CUSTOM", "bg-invalid");
    expect(res).toEqual({ success: false, error: "Invalid color" });
  });

  it("rejects invalid type", async () => {
    const res = await updateAnalyticsViewColor(1, "BAD" as any, "bg-white");
    expect(res).toEqual({ success: false, error: "Invalid type" });
  });

  it("updates automationRule for AUTOMATION type", async () => {
    vi.mocked(prisma.automationRule.update).mockResolvedValue({} as any);
    await updateAnalyticsViewColor(1, "AUTOMATION", "bg-red-50");
    expect(prisma.automationRule.update).toHaveBeenCalledWith({
      where: { id: 1, companyId: 100 },
      data: { analyticsColor: "bg-red-50" },
    });
  });

  it("updates analyticsView for CUSTOM type", async () => {
    vi.mocked(prisma.analyticsView.update).mockResolvedValue({} as any);
    await updateAnalyticsViewColor(1, "CUSTOM", "bg-blue-50");
    expect(prisma.analyticsView.update).toHaveBeenCalledWith({
      where: { id: 1, companyId: 100 },
      data: { color: "bg-blue-50" },
    });
  });

  it("scoped to companyId", async () => {
    vi.mocked(prisma.automationRule.update).mockResolvedValue({} as any);
    await updateAnalyticsViewColor(42, "AUTOMATION", "bg-white");
    expect(prisma.automationRule.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 42, companyId: 100 } }),
    );
  });

  it("invalidates cache after color update", async () => {
    vi.mocked(prisma.analyticsView.update).mockResolvedValue({} as any);
    await updateAnalyticsViewColor(1, "CUSTOM", "bg-white");
    expect(invalidateFullCache).toHaveBeenCalledWith(100);
  });

  it("returns success", async () => {
    vi.mocked(prisma.analyticsView.update).mockResolvedValue({} as any);
    const res = await updateAnalyticsViewColor(1, "CUSTOM", "bg-white");
    expect(res).toEqual({ success: true });
  });

  it("returns error on DB failure", async () => {
    vi.mocked(prisma.analyticsView.update).mockRejectedValue(new Error("DB"));
    const res = await updateAnalyticsViewColor(1, "CUSTOM", "bg-white");
    expect(res).toEqual({ success: false, error: "Failed to update color" });
  });
});

// ═══════════════════════════════════════════════════════════════
// refreshAnalyticsItemWithChecks
// ═══════════════════════════════════════════════════════════════
describe("refreshAnalyticsItemWithChecks", () => {
  beforeEach(() => {
    vi.mocked(prisma.analyticsView.count).mockResolvedValue(1);
    vi.mocked(prisma.automationRule.count).mockResolvedValue(1);
    vi.mocked(prisma.analyticsRefreshLog.findFirst).mockResolvedValue({
      timestamp: new Date("2025-01-01T00:00:00Z"),
    } as any);
  });

  it("returns Unauthorized when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await refreshAnalyticsItemWithChecks(1, "CUSTOM");
    expect(res).toEqual({ success: false, error: "Unauthorized" });
  });

  it("returns Unauthorized when user cannot manage", async () => {
    vi.mocked(canManageAnalytics).mockReturnValue(false);
    const res = await refreshAnalyticsItemWithChecks(1, "CUSTOM");
    expect(res).toEqual({ success: false, error: "Unauthorized" });
  });

  it("returns rate limit error", async () => {
    vi.mocked(checkActionRateLimit).mockResolvedValue({ error: "Rate limited" });
    const res = await refreshAnalyticsItemWithChecks(1, "CUSTOM");
    expect(res.success).toBe(false);
    expect(res.error).toBe("Rate limited");
  });

  it("returns not found for CUSTOM item", async () => {
    vi.mocked(prisma.analyticsView.count).mockResolvedValue(0);
    const res = await refreshAnalyticsItemWithChecks(999, "CUSTOM");
    expect(res).toEqual({ success: false, error: "Item not found" });
  });

  it("returns not found for AUTOMATION item", async () => {
    vi.mocked(prisma.automationRule.count).mockResolvedValue(0);
    const res = await refreshAnalyticsItemWithChecks(999, "AUTOMATION");
    expect(res).toEqual({ success: false, error: "Item not found" });
  });

  it("basic plan has 3 refresh limit", async () => {
    mockTx.analyticsRefreshLog.count.mockResolvedValue(3);
    vi.mocked(prisma.$transaction).mockImplementation((fn: any) => fn(mockTx));
    const res = await refreshAnalyticsItemWithChecks(1, "CUSTOM");
    expect(res.success).toBe(false);
    expect(res.error).toContain("3");
  });

  it("premium plan has 10 refresh limit", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(premiumAdmin as any);
    mockTx.analyticsRefreshLog.count.mockResolvedValue(10);
    vi.mocked(prisma.$transaction).mockImplementation((fn: any) => fn(mockTx));
    const res = await refreshAnalyticsItemWithChecks(1, "CUSTOM");
    expect(res.success).toBe(false);
    expect(res.error).toContain("10");
  });

  it("super plan has 9999 refresh limit", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(superAdmin as any);
    mockTx.analyticsRefreshLog.count.mockResolvedValue(0);
    vi.mocked(prisma.$transaction).mockImplementation((fn: any) => fn(mockTx));
    const res = await refreshAnalyticsItemWithChecks(1, "CUSTOM");
    expect(res.success).toBe(true);
  });

  it("uses Serializable tx for refresh log", async () => {
    await refreshAnalyticsItemWithChecks(1, "CUSTOM");
    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: "Serializable" }),
    );
  });

  it("creates refresh log in transaction", async () => {
    await refreshAnalyticsItemWithChecks(1, "CUSTOM");
    expect(mockTx.analyticsRefreshLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 1, companyId: 100 }) }),
    );
  });

  it("sends inngest event with correct data", async () => {
    await refreshAnalyticsItemWithChecks(42, "AUTOMATION");
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "analytics/refresh-item",
        data: { companyId: 100, itemId: 42, itemType: "AUTOMATION" },
      }),
    );
  });

  it("queries oldest log for nextResetTime", async () => {
    await refreshAnalyticsItemWithChecks(1, "CUSTOM");
    expect(prisma.analyticsRefreshLog.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { timestamp: "asc" } }),
    );
  });

  it("revalidates 3 paths", async () => {
    await refreshAnalyticsItemWithChecks(1, "CUSTOM");
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(revalidatePath).toHaveBeenCalledWith("/analytics");
    expect(revalidatePath).toHaveBeenCalledWith("/analytics/graphs");
  });

  it("returns usage and nextResetTime", async () => {
    const res = await refreshAnalyticsItemWithChecks(1, "CUSTOM");
    expect(res.success).toBe(true);
    expect((res as any).usage).toBe(1);
    expect((res as any).nextResetTime).toBe(new Date("2025-01-01T04:00:00.000Z").toISOString());
  });

  it("returns error on transaction failure", async () => {
    vi.mocked(prisma.$transaction).mockRejectedValue(new Error("TX failed"));
    const res = await refreshAnalyticsItemWithChecks(1, "CUSTOM");
    expect(res).toEqual({ success: false, error: "Failed to refresh item" });
  });

  it("returns error on inngest failure", async () => {
    vi.mocked(inngest.send).mockRejectedValue(new Error("inngest down"));
    const res = await refreshAnalyticsItemWithChecks(1, "CUSTOM");
    expect(res).toEqual({ success: false, error: "Failed to refresh item" });
  });

  it("returns null nextResetTime when findFirst returns null after refresh", async () => {
    vi.mocked(prisma.analyticsRefreshLog.findFirst).mockResolvedValue(null);
    const res = await refreshAnalyticsItemWithChecks(1, "CUSTOM");
    expect(res.success).toBe(true);
    expect((res as any).nextResetTime).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// previewAnalyticsView
// ═══════════════════════════════════════════════════════════════
describe("previewAnalyticsView", () => {
  it("returns Unauthorized when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await previewAnalyticsView({ type: "COUNT", config: validConfig });
    expect(res).toEqual({ success: false, error: "Unauthorized" });
  });

  it("returns Unauthorized when user cannot manage", async () => {
    vi.mocked(canManageAnalytics).mockReturnValue(false);
    const res = await previewAnalyticsView({ type: "COUNT", config: validConfig });
    expect(res).toEqual({ success: false, error: "Unauthorized" });
  });

  it("returns Hebrew rate limit message for preview", async () => {
    vi.mocked(checkActionRateLimit).mockResolvedValue({ error: "Rate limited" });
    const res = await previewAnalyticsView({ type: "COUNT", config: validConfig });
    expect(res.success).toBe(false);
    expect(res.error).toContain("יותר מדי בקשות");
  });

  it("uses preview rate limit config", async () => {
    await previewAnalyticsView({ type: "COUNT", config: validConfig });
    expect(checkActionRateLimit).toHaveBeenCalledWith("1", expect.objectContaining({ prefix: "ana-prev" }));
  });

  it("rejects invalid type", async () => {
    const res = await previewAnalyticsView({ type: "INVALID", config: validConfig });
    expect(res).toEqual({ success: false, error: "Invalid analytics view type" });
  });

  it("rejects invalid config", async () => {
    const res = await previewAnalyticsView({ type: "COUNT", config: { model: "BAD" } });
    expect(res).toEqual({ success: false, error: "Invalid analytics config" });
  });

  it("rejects oversized config", async () => {
    const filter: Record<string, string> = {};
    for (let i = 0; i < 30; i++) filter[`k${i}`.padEnd(200, "x")] = "v".repeat(500);
    const res = await previewAnalyticsView({ type: "COUNT", config: { model: "Task", filter } });
    expect(res).toEqual({ success: false, error: "Config is too large" });
  });

  it("calls calculateViewStats with temp view id=0", async () => {
    await previewAnalyticsView({ type: "COUNT", config: validConfig });
    expect(calculateViewStats).toHaveBeenCalledWith(
      expect.objectContaining({ id: 0, type: "COUNT" }),
      100,
    );
  });

  it("slices items to 10", async () => {
    vi.mocked(calculateViewStats).mockResolvedValue({
      stats: { total: 50 },
      items: Array.from({ length: 50 }, (_, i) => ({ id: i })),
      tableName: "T",
    });
    const res = await previewAnalyticsView({ type: "COUNT", config: validConfig });
    expect(res.success).toBe(true);
    expect((res as any).data.items).toHaveLength(10);
  });

  it("totalRecords = full length", async () => {
    vi.mocked(calculateViewStats).mockResolvedValue({
      stats: { total: 50 },
      items: Array.from({ length: 50 }, (_, i) => ({ id: i })),
      tableName: "T",
    });
    const res = await previewAnalyticsView({ type: "COUNT", config: validConfig });
    expect((res as any).data.totalRecords).toBe(50);
  });

  it("returns stats and tableName", async () => {
    const res = await previewAnalyticsView({ type: "COUNT", config: validConfig });
    expect(res.success).toBe(true);
    expect((res as any).data.stats).toEqual({ total: 10 });
    expect((res as any).data.tableName).toBe("TestTable");
  });

  it("returns error when calculateViewStats throws", async () => {
    vi.mocked(calculateViewStats).mockRejectedValue(new Error("calc failed"));
    const res = await previewAnalyticsView({ type: "COUNT", config: validConfig });
    expect(res).toEqual({ success: false, error: "Failed to preview view" });
  });
});

// ═══════════════════════════════════════════════════════════════
// getAnalyticsRefreshUsage
// ═══════════════════════════════════════════════════════════════
describe("getAnalyticsRefreshUsage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns { success: false, usage: 0 } when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await getAnalyticsRefreshUsage();
    expect(res).toEqual({ success: false, usage: 0 });
  });

  it("returns { success: false, usage: 0 } when no canViewAnalytics", async () => {
    vi.mocked(hasUserFlag).mockReturnValue(false);
    const res = await getAnalyticsRefreshUsage();
    expect(res).toEqual({ success: false, usage: 0 });
  });

  it("returns usage count from 4-hour window", async () => {
    vi.mocked(prisma.analyticsRefreshLog.count).mockResolvedValue(5);
    vi.mocked(prisma.analyticsRefreshLog.findFirst).mockResolvedValue({
      timestamp: new Date("2025-01-01T00:00:00Z"),
    } as any);
    const res = await getAnalyticsRefreshUsage();
    expect(res.success).toBe(true);
    expect((res as any).usage).toBe(5);
  });

  it("returns nextResetTime from oldest + 4h", async () => {
    const oldest = new Date("2025-06-01T10:00:00Z");
    vi.mocked(prisma.analyticsRefreshLog.count).mockResolvedValue(1);
    vi.mocked(prisma.analyticsRefreshLog.findFirst).mockResolvedValue({
      timestamp: oldest,
    } as any);
    const res = await getAnalyticsRefreshUsage();
    expect(res.success).toBe(true);
    const expected = new Date(oldest.getTime() + 4 * 60 * 60 * 1000).toISOString();
    expect((res as any).nextResetTime).toBe(expected);
  });

  it("nextResetTime is null when no logs", async () => {
    vi.mocked(prisma.analyticsRefreshLog.count).mockResolvedValue(0);
    vi.mocked(prisma.analyticsRefreshLog.findFirst).mockResolvedValue(null);
    const res = await getAnalyticsRefreshUsage();
    expect(res.success).toBe(true);
    expect((res as any).nextResetTime).toBeNull();
  });

  it("probabilistic cleanup triggers when Math.random < 0.05", async () => {
    vi.mocked(prisma.analyticsRefreshLog.count).mockResolvedValue(0);
    vi.mocked(prisma.analyticsRefreshLog.findFirst).mockResolvedValue(null);
    vi.spyOn(Math, "random").mockReturnValue(0.01);
    vi.mocked(prisma.analyticsRefreshLog.findMany).mockResolvedValue([
      { id: "old1" }, { id: "old2" },
    ] as any);
    vi.mocked(prisma.analyticsRefreshLog.deleteMany).mockResolvedValue({ count: 2 } as any);

    await getAnalyticsRefreshUsage();

    expect(prisma.analyticsRefreshLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ select: { id: true }, take: 100 }),
    );
    expect(prisma.analyticsRefreshLog.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ["old1", "old2"] } } }),
    );
  });

  it("cleanup does not trigger when Math.random >= 0.05", async () => {
    vi.mocked(prisma.analyticsRefreshLog.count).mockResolvedValue(0);
    vi.mocked(prisma.analyticsRefreshLog.findFirst).mockResolvedValue(null);
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    await getAnalyticsRefreshUsage();

    // findMany for stale records should NOT be called
    expect(prisma.analyticsRefreshLog.findMany).not.toHaveBeenCalled();
  });

  it("cleanup error is swallowed", async () => {
    vi.mocked(prisma.analyticsRefreshLog.count).mockResolvedValue(0);
    vi.mocked(prisma.analyticsRefreshLog.findFirst).mockResolvedValue(null);
    vi.spyOn(Math, "random").mockReturnValue(0.01);
    vi.mocked(prisma.analyticsRefreshLog.findMany).mockRejectedValue(new Error("cleanup fail"));

    const res = await getAnalyticsRefreshUsage();
    expect(res.success).toBe(true);
  });

  it("cleanup skips deleteMany when no stale records found", async () => {
    vi.mocked(prisma.analyticsRefreshLog.count).mockResolvedValue(0);
    vi.mocked(prisma.analyticsRefreshLog.findFirst).mockResolvedValue(null);
    vi.spyOn(Math, "random").mockReturnValue(0.01);
    vi.mocked(prisma.analyticsRefreshLog.findMany).mockResolvedValue([]);
    await getAnalyticsRefreshUsage();
    expect(prisma.analyticsRefreshLog.deleteMany).not.toHaveBeenCalled();
  });

  it("returns { success: false, usage: 0 } on top-level DB failure", async () => {
    vi.mocked(prisma.analyticsRefreshLog.count).mockRejectedValue(new Error("DB"));
    const res = await getAnalyticsRefreshUsage();
    expect(res).toEqual({ success: false, usage: 0 });
  });
});

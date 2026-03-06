/**
 * Integration tests for dashboard Inngest jobs.
 *
 * REAL: Prisma (test DB), company/user/dashboardWidget seeding.
 * MOCKED: @/lib/inngest/client (handler capture), @/lib/services/dashboard-cache,
 *         @/lib/services/goal-computation, @/lib/dashboard-internal,
 *         @/lib/prisma-background (redirected to real prisma),
 *         @/lib/logger (global mock in tests/setup.ts).
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { createMockStep, createMockEvent } from "../helpers/inngest-test-utils";
import { prisma } from "@/lib/prisma";

// ── Handler capture ───────────────────────────────────────────────
const handlers: Record<string, (...args: any[]) => any> = {};
vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    send: vi.fn(),
    createFunction: vi.fn((config: any, _trigger: any, handler: any) => {
      handlers[config.id] = handler;
      return { fn: handler };
    }),
  },
}));

// ── Redirect prisma-background to real prisma ─────────────────────
vi.mock("@/lib/prisma-background", () => {
  return import("@/lib/prisma").then((mod) => ({
    prismaBg: mod.prisma,
  }));
});

// ── Mock dashboard-cache ──────────────────────────────────────────
const mockAcquireLock = vi.fn().mockResolvedValue("lock-value-123");
const mockReleaseLock = vi.fn().mockResolvedValue(undefined);
const mockSetCachedGoals = vi.fn().mockResolvedValue(undefined);
const mockSetCachedTableWidget = vi.fn().mockResolvedValue(undefined);
const mockBuildWidgetHash = vi.fn().mockImplementation(
  (tableId: number, viewId: string, settings?: any) =>
    `hash-${tableId}-${viewId}${settings ? "-custom" : ""}`,
);
const mockInvalidateTableWidgetCaches = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/services/dashboard-cache", () => ({
  acquireDashboardLock: (...args: any[]) => mockAcquireLock(...args),
  releaseDashboardLock: (...args: any[]) => mockReleaseLock(...args),
  setCachedGoals: (...args: any[]) => mockSetCachedGoals(...args),
  setCachedTableWidget: (...args: any[]) => mockSetCachedTableWidget(...args),
  buildWidgetHash: (...args: any[]) => mockBuildWidgetHash(...args),
  invalidateTableWidgetCaches: (...args: any[]) => mockInvalidateTableWidgetCaches(...args),
}));

// ── Mock goal-computation ─────────────────────────────────────────
const mockGetGoals = vi.fn().mockResolvedValue([
  { id: 1, name: "Revenue Goal", progress: 0.75 },
  { id: 2, name: "Sales Goal", progress: 0.5 },
]);

vi.mock("@/lib/services/goal-computation", () => ({
  getGoalsForCompanyInternal: (...args: any[]) => mockGetGoals(...args),
}));

// ── Mock dashboard-internal ───────────────────────────────────────
const mockGetCustomTableData = vi.fn().mockResolvedValue({ rows: [], total: 0 });
const mockGetTableViewData = vi.fn().mockResolvedValue({ rows: [], total: 0 });

vi.mock("@/lib/dashboard-internal", () => ({
  getCustomTableDataInternal: (...args: any[]) => mockGetCustomTableData(...args),
  getTableViewDataInternal: (...args: any[]) => mockGetTableViewData(...args),
}));

// ── Test data ─────────────────────────────────────────────────────
let companyId: number;
let userId: number;
let tableId: number;
let widgetIds: string[] = [];

beforeAll(async () => {
  await import("@/lib/inngest/functions/dashboard-jobs");

  const company = await prisma.company.create({
    data: {
      name: "Dashboard Test Co",
      slug: `dash-co-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    },
  });
  companyId = company.id;

  const user = await prisma.user.create({
    data: {
      companyId,
      name: "Dashboard User",
      email: `dash-user-${Date.now()}@test.com`,
      passwordHash: "not-a-real-hash",
    },
  });
  userId = user.id;

  const table = await prisma.tableMeta.create({
    data: {
      companyId,
      createdBy: userId,
      name: "Dashboard Table",
      slug: `dash-table-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      schemaJson: {},
    },
  });
  tableId = table.id;

  // Seed TABLE widgets
  const widget1 = await prisma.dashboardWidget.create({
    data: {
      companyId,
      userId,
      widgetType: "TABLE",
      referenceId: "1",
      tableId,
      settings: {},
      order: 0,
    },
  });

  const widget2 = await prisma.dashboardWidget.create({
    data: {
      companyId,
      userId,
      widgetType: "TABLE",
      referenceId: "custom",
      tableId,
      settings: { columns: ["name", "status"] },
      order: 1,
    },
  });

  widgetIds = [widget1.id, widget2.id];
});

afterAll(async () => {
  await prisma.dashboardWidget.deleteMany({ where: { id: { in: widgetIds } } });
  await prisma.tableMeta.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
});

beforeEach(() => {
  mockAcquireLock.mockClear().mockResolvedValue("lock-value-123");
  mockReleaseLock.mockClear().mockResolvedValue(undefined);
  mockSetCachedGoals.mockClear().mockResolvedValue(undefined);
  mockSetCachedTableWidget.mockClear().mockResolvedValue(undefined);
  mockBuildWidgetHash.mockClear().mockImplementation(
    (tableId: number, viewId: string, settings?: any) =>
      `hash-${tableId}-${viewId}${settings ? "-custom" : ""}`,
  );
  mockInvalidateTableWidgetCaches.mockClear().mockResolvedValue(undefined);
  mockGetGoals.mockClear().mockResolvedValue([
    { id: 1, name: "Revenue Goal", progress: 0.75 },
    { id: 2, name: "Sales Goal", progress: 0.5 },
  ]);
  mockGetCustomTableData.mockClear().mockResolvedValue({ rows: [], total: 0 });
  mockGetTableViewData.mockClear().mockResolvedValue({ rows: [], total: 0 });
});

// ── refreshDashboardWidgets ───────────────────────────────────────
describe("refreshDashboardWidgets (dashboard-refresh-widgets)", () => {
  it("acquires lock, refreshes goals, computes widgets, then releases lock", async () => {
    const step = createMockStep();
    const event = createMockEvent("dashboard/refresh-widgets", { companyId });

    const result = await handlers["dashboard-refresh-widgets"]({ event, step });

    // Lock acquired
    expect(mockAcquireLock).toHaveBeenCalledWith(companyId);

    // Goals refreshed
    expect(mockGetGoals).toHaveBeenCalledWith(companyId, { skipCache: true });
    expect(mockSetCachedGoals).toHaveBeenCalledWith(companyId, expect.any(Array));

    // Old caches invalidated
    expect(mockInvalidateTableWidgetCaches).toHaveBeenCalledWith(companyId);

    // Widgets computed and cached - at least one standard view and one custom
    expect(mockSetCachedTableWidget).toHaveBeenCalled();

    // Lock released
    expect(mockReleaseLock).toHaveBeenCalledWith(companyId, "lock-value-123");

    // Result shape
    expect(result).toMatchObject({
      success: true,
      goalCount: 2,
    });
  });

  it("skips processing when lock is not acquired", async () => {
    mockAcquireLock.mockResolvedValue(null);

    const step = createMockStep();
    const event = createMockEvent("dashboard/refresh-widgets", { companyId });

    const result = await handlers["dashboard-refresh-widgets"]({ event, step });

    expect(result).toEqual({ skipped: true, reason: "lock-held" });

    // Nothing else should be called
    expect(mockGetGoals).not.toHaveBeenCalled();
    expect(mockSetCachedGoals).not.toHaveBeenCalled();
    expect(mockSetCachedTableWidget).not.toHaveBeenCalled();
    // Lock should NOT be released since it was never acquired
    expect(mockReleaseLock).not.toHaveBeenCalled();
  });

  it("releases lock even when an error occurs", async () => {
    mockGetGoals.mockRejectedValue(new Error("Goal computation failed"));

    const step = createMockStep();
    const event = createMockEvent("dashboard/refresh-widgets", { companyId });

    await expect(
      handlers["dashboard-refresh-widgets"]({ event, step }),
    ).rejects.toThrow("Goal computation failed");

    // Lock must still be released
    expect(mockReleaseLock).toHaveBeenCalledWith(companyId, "lock-value-123");
  });
});

// ── refreshDashboardGoals ─────────────────────────────────────────
describe("refreshDashboardGoals (dashboard-refresh-goals)", () => {
  it("computes goals and caches them", async () => {
    const step = createMockStep();
    const event = createMockEvent("dashboard/refresh-goals", { companyId });

    const result = await handlers["dashboard-refresh-goals"]({ event, step });

    expect(mockGetGoals).toHaveBeenCalledWith(companyId, { skipCache: true });
    expect(mockSetCachedGoals).toHaveBeenCalledWith(companyId, [
      { id: 1, name: "Revenue Goal", progress: 0.75 },
      { id: 2, name: "Sales Goal", progress: 0.5 },
    ]);

    expect(result).toEqual({
      success: true,
      goalCount: 2,
    });
  });

  it("returns goalCount of 0 when no goals exist", async () => {
    mockGetGoals.mockResolvedValue([]);

    const step = createMockStep();
    const event = createMockEvent("dashboard/refresh-goals", { companyId });

    const result = await handlers["dashboard-refresh-goals"]({ event, step });

    expect(result).toEqual({
      success: true,
      goalCount: 0,
    });
    expect(mockSetCachedGoals).toHaveBeenCalledWith(companyId, []);
  });
});

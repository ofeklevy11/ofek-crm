import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { createMockStep, createMockEvent } from "../helpers/inngest-test-utils";
import { prisma } from "@/lib/prisma";

// ── Capture handlers ───────────────────────────────────────────────
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

// ── Mock prisma-background → use real prisma ─────────────────────
vi.mock("@/lib/prisma-background", async () => {
  const { prisma } = await import("@/lib/prisma");
  return { prismaBg: prisma };
});

// ── Mock analytics calculation ────────────────────────────────────
vi.mock("@/lib/analytics/calculate", () => ({
  calculateRuleStats: vi.fn().mockResolvedValue({
    stats: { avg: 100 },
    items: [],
    tableName: "T",
  }),
  calculateViewStats: vi.fn().mockResolvedValue({
    stats: { avg: 100 },
    items: [],
    tableName: "T",
  }),
  getTableName: vi.fn().mockReturnValue("T"),
  buildSourceKey: vi.fn().mockReturnValue("key-1"),
  fetchViewSourceData: vi.fn().mockResolvedValue({
    tableName: "T",
    rawData: [],
  }),
}));

// ── Mock Redis-based analytics cache ──────────────────────────────
vi.mock("@/lib/services/analytics-cache", () => ({
  acquireRefreshLock: vi.fn().mockResolvedValue("lock-123"),
  releaseRefreshLock: vi.fn().mockResolvedValue(undefined),
  setSingleItemCache: vi.fn().mockResolvedValue(undefined),
  setFullAnalyticsCache: vi.fn().mockResolvedValue(undefined),
  getFullAnalyticsCache: vi.fn().mockResolvedValue(null),
}));

// ── Mock automations-core ─────────────────────────────────────────
vi.mock("@/app/actions/automations-core", () => ({
  processViewAutomations: vi.fn().mockResolvedValue(undefined),
}));

// ── State ──────────────────────────────────────────────────────────
let companyId: number;
let userId: number;
let tableId: number;
let ruleId: number;
let viewId: number;

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

beforeAll(async () => {
  // Register handlers by importing the function file
  await import("@/lib/inngest/functions/analytics-jobs");

  // Seed base data
  const company = await prisma.company.create({
    data: { name: "AnalyticsJobs Test Co", slug: `analytics-jobs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` },
  });
  companyId = company.id;

  const user = await prisma.user.create({
    data: {
      companyId,
      name: "Analytics Test User",
      email: `analytics-jobs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`,
      passwordHash: "h",
      role: "admin",
    },
  });
  userId = user.id;

  const table = await prisma.tableMeta.create({
    data: {
      companyId,
      createdBy: userId,
      name: "Analytics Table",
      slug: `analytics-tbl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      schemaJson: {},
    },
  });
  tableId = table.id;

  // Create an AutomationRule (duration type, active)
  const rule = await prisma.automationRule.create({
    data: {
      companyId,
      createdBy: userId,
      name: "Duration Rule",
      triggerType: "RECORD_FIELD_CHANGE",
      actionType: "CALCULATE_DURATION",
      isActive: true,
    },
  });
  ruleId = rule.id;

  // Create an AnalyticsView
  const view = await prisma.analyticsView.create({
    data: {
      companyId,
      title: "Test Count View",
      type: "COUNT",
      config: { sourceType: "table", tableId },
      order: 0,
    },
  });
  viewId = view.id;
}, 15000);

afterAll(async () => {
  await prisma.statusDuration.deleteMany({ where: { companyId } });
  await prisma.multiEventDuration.deleteMany({ where: { companyId } });
  await prisma.analyticsView.deleteMany({ where: { companyId } });
  await prisma.automationRule.deleteMany({ where: { companyId } });
  await prisma.tableMeta.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
}, 15000);

beforeEach(async () => {
  vi.clearAllMocks();

  // Reset mock implementations to defaults
  const {
    acquireRefreshLock,
    releaseRefreshLock,
    setSingleItemCache,
    setFullAnalyticsCache,
    getFullAnalyticsCache,
  } = await import("@/lib/services/analytics-cache");
  (acquireRefreshLock as any).mockResolvedValue("lock-123");
  (releaseRefreshLock as any).mockResolvedValue(undefined);
  (setSingleItemCache as any).mockResolvedValue(undefined);
  (setFullAnalyticsCache as any).mockResolvedValue(undefined);
  (getFullAnalyticsCache as any).mockResolvedValue(null);

  const { calculateRuleStats, calculateViewStats } = await import("@/lib/analytics/calculate");
  (calculateRuleStats as any).mockResolvedValue({
    stats: { avg: 100 },
    items: [],
    tableName: "T",
  });
  (calculateViewStats as any).mockResolvedValue({
    stats: { avg: 100 },
    items: [],
    tableName: "T",
  });
});

// ── Tests: cleanupOldDurationRecords ────────────────────────────────

describe("cleanupOldDurationRecords (analytics-cleanup-old-durations)", () => {
  it(
    "deletes old StatusDuration and MultiEventDuration records",
    async () => {
      // Create a dedicated rule so cleanup-seeded records don't collide
      const durRule = await prisma.automationRule.create({
        data: {
          companyId,
          createdBy: userId,
          name: "Cleanup Duration Rule",
          triggerType: "RECORD_FIELD_CHANGE",
          actionType: "CALCULATE_DURATION",
          isActive: true,
        },
      });

      // Seed old StatusDuration records (> 365 days)
      await prisma.statusDuration.createMany({
        data: [
          {
            companyId,
            automationRuleId: durRule.id,
            durationSeconds: 1000,
            durationString: "16m",
            fromValue: "OPEN",
            toValue: "CLOSED",
            createdAt: daysAgo(400),
          },
          {
            companyId,
            automationRuleId: durRule.id,
            durationSeconds: 2000,
            durationString: "33m",
            fromValue: "OPEN",
            toValue: "IN_PROGRESS",
            createdAt: daysAgo(500),
          },
        ],
      });

      // Seed recent StatusDuration record
      await prisma.statusDuration.createMany({
        data: [
          {
            companyId,
            automationRuleId: durRule.id,
            durationSeconds: 500,
            durationString: "8m",
            fromValue: "NEW",
            toValue: "OPEN",
            createdAt: daysAgo(10),
          },
        ],
      });

      // Seed old MultiEventDuration records (> 365 days)
      await prisma.multiEventDuration.createMany({
        data: [
          {
            companyId,
            automationRuleId: durRule.id,
            eventChain: [{ eventName: "Created", timestamp: daysAgo(450).toISOString() }],
            eventDeltas: [],
            totalDurationSeconds: 3000,
            totalDurationString: "50m",
            createdAt: daysAgo(450),
          },
        ],
      });

      // Seed recent MultiEventDuration record
      await prisma.multiEventDuration.createMany({
        data: [
          {
            companyId,
            automationRuleId: durRule.id,
            eventChain: [{ eventName: "Created", timestamp: daysAgo(5).toISOString() }],
            eventDeltas: [],
            totalDurationSeconds: 600,
            totalDurationString: "10m",
            createdAt: daysAgo(5),
          },
        ],
      });

      const step = createMockStep();
      const result = await handlers["analytics-cleanup-old-durations"]({ step });

      expect(result.statusDeleted).toBeGreaterThanOrEqual(1);
      expect(result.multiDeleted).toBeGreaterThanOrEqual(1);

      // Verify recent records survive
      const remainingStatus = await prisma.statusDuration.findMany({
        where: { companyId, automationRuleId: durRule.id },
      });
      remainingStatus.forEach((sd) => {
        expect(sd.createdAt.getTime()).toBeGreaterThan(daysAgo(365).getTime());
      });

      const remainingMulti = await prisma.multiEventDuration.findMany({
        where: { companyId, automationRuleId: durRule.id },
      });
      remainingMulti.forEach((med) => {
        expect(med.createdAt.getTime()).toBeGreaterThan(daysAgo(365).getTime());
      });

      // Cleanup the extra rule
      await prisma.statusDuration.deleteMany({ where: { automationRuleId: durRule.id } });
      await prisma.multiEventDuration.deleteMany({ where: { automationRuleId: durRule.id } });
      await prisma.automationRule.delete({ where: { id: durRule.id } });
    },
    15000,
  );
});

// ── Tests: refreshCompanyAnalytics ──────────────────────────────────

describe("refreshCompanyAnalytics (analytics-refresh-company)", () => {
  it(
    "acquires lock, processes rules and views, caches results, releases lock",
    async () => {
      const step = createMockStep();
      const event = createMockEvent("analytics/refresh-company", { companyId });

      const result = await handlers["analytics-refresh-company"]({ event, step });

      const {
        acquireRefreshLock,
        releaseRefreshLock,
        setFullAnalyticsCache,
      } = await import("@/lib/services/analytics-cache");
      const { calculateRuleStats } = await import("@/lib/analytics/calculate");

      expect(acquireRefreshLock).toHaveBeenCalledWith(companyId);
      expect(calculateRuleStats).toHaveBeenCalled();
      expect(setFullAnalyticsCache).toHaveBeenCalled();
      expect(releaseRefreshLock).toHaveBeenCalled();
      expect(result.success).toBe(true);
    },
    15000,
  );

  it(
    "skips when lock is not acquired",
    async () => {
      const { acquireRefreshLock } = await import("@/lib/services/analytics-cache");
      (acquireRefreshLock as any).mockResolvedValueOnce(null);

      const step = createMockStep();
      const event = createMockEvent("analytics/refresh-company", { companyId });

      const result = await handlers["analytics-refresh-company"]({ event, step });

      expect(result).toEqual({ skipped: true, reason: "lock-held" });

      const { calculateRuleStats } = await import("@/lib/analytics/calculate");
      expect(calculateRuleStats).not.toHaveBeenCalled();
    },
    15000,
  );

  it(
    "releases lock even when a rule calculation fails",
    async () => {
      const { calculateRuleStats } = await import("@/lib/analytics/calculate");
      (calculateRuleStats as any).mockRejectedValueOnce(new Error("calc-boom"));

      const step = createMockStep();
      const event = createMockEvent("analytics/refresh-company", { companyId });

      // Per-rule errors are caught gracefully — function still succeeds
      const result = await handlers["analytics-refresh-company"]({ event, step });
      expect(result.success).toBe(true);

      // Lock must still be released
      const { releaseRefreshLock } = await import("@/lib/services/analytics-cache");
      expect(releaseRefreshLock).toHaveBeenCalled();
    },
    15000,
  );
});

// ── Tests: refreshAnalyticsItemJob ──────────────────────────────────

describe("refreshAnalyticsItemJob (analytics-refresh-item)", () => {
  it(
    "refreshes a single automation rule item",
    async () => {
      const step = createMockStep();
      const event = createMockEvent("analytics/refresh-item", {
        companyId,
        itemId: ruleId,
        itemType: "AUTOMATION",
      });

      const result = await handlers["analytics-refresh-item"]({ event, step });

      const { calculateRuleStats } = await import("@/lib/analytics/calculate");
      expect(calculateRuleStats).toHaveBeenCalled();

      const { setSingleItemCache } = await import("@/lib/services/analytics-cache");
      expect(setSingleItemCache).toHaveBeenCalledWith(
        companyId,
        "rule",
        ruleId,
        expect.objectContaining({ stats: expect.any(Object) }),
      );

      expect(result.success).toBe(true);
    },
    15000,
  );

  it(
    "skips when lock is held",
    async () => {
      const { acquireRefreshLock } = await import("@/lib/services/analytics-cache");
      (acquireRefreshLock as any).mockResolvedValueOnce(null);

      const step = createMockStep();
      const event = createMockEvent("analytics/refresh-item", {
        companyId,
        itemId: ruleId,
        itemType: "AUTOMATION",
      });

      const result = await handlers["analytics-refresh-item"]({ event, step });

      expect(result).toEqual({ skipped: true, reason: "lock-held" });
    },
    15000,
  );

  it(
    "throws when rule not found",
    async () => {
      const step = createMockStep();
      const event = createMockEvent("analytics/refresh-item", {
        companyId,
        itemId: 999999,
        itemType: "AUTOMATION",
      });

      await expect(
        handlers["analytics-refresh-item"]({ event, step }),
      ).rejects.toThrow("not found");
    },
    15000,
  );
});

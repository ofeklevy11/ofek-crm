import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { createMockStep } from "../helpers/inngest-test-utils";
import { prisma } from "@/lib/prisma";

// ── Capture handlers ───────────────────────────────────────────────
const handlers: Record<string, (...args: any[]) => any> = {};

vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    send: vi.fn(),
    createFunction: vi.fn((config: any, _trigger: any, handler: any) => {
      handlers[config.id] = handler;
      return { id: config.id, fn: handler };
    }),
  },
}));

// Re-export test prisma as prismaBg
vi.mock("@/lib/prisma-background", async () => {
  const { prisma } = await import("@/lib/prisma");
  return { prismaBg: prisma };
});

// ── State ──────────────────────────────────────────────────────────
let companyId: number;
let userId: number;
let tableId: number;
let ticketId: number;
let automationRuleId: number;

// Date helpers
const now = new Date();
const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

beforeAll(async () => {
  // Register handlers
  await import("@/lib/inngest/functions/db-cleanup-jobs");
  await import("@/lib/inngest/functions/automation-cleanup-jobs");

  // Seed base data
  const company = await prisma.company.create({
    data: { name: "Cleanup Test Co", slug: `cleanup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` },
  });
  companyId = company.id;

  const user = await prisma.user.create({
    data: {
      companyId,
      name: "Cleanup User",
      email: `cleanup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`,
      passwordHash: "not-a-real-hash",
      role: "admin",
    },
  });
  userId = user.id;

  const table = await prisma.tableMeta.create({
    data: {
      companyId,
      createdBy: userId,
      name: "Cleanup Table",
      slug: `cleanup-tbl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      schemaJson: {},
    },
  });
  tableId = table.id;

  const ticket = await prisma.ticket.create({
    data: {
      companyId,
      title: "Cleanup Ticket",
      status: "OPEN",
      priority: "MEDIUM",
      type: "SERVICE",
      creatorId: userId,
    },
  });
  ticketId = ticket.id;

  const rule = await prisma.automationRule.create({
    data: {
      companyId,
      createdBy: userId,
      name: "Cleanup Rule",
      triggerType: "RECORD_CREATE",
      actionType: "SEND_NOTIFICATION",
      isActive: true,
    },
  });
  automationRuleId = rule.id;
});

afterAll(async () => {
  // Clean up in FK-safe order
  await prisma.multiEventDuration.deleteMany({ where: { companyId } });
  await prisma.statusDuration.deleteMany({ where: { companyId } });
  await prisma.automationLog.deleteMany({ where: { companyId } });
  await prisma.analyticsRefreshLog.deleteMany({ where: { companyId } });
  await prisma.viewRefreshLog.deleteMany({ where: { companyId } });
  await prisma.ticketActivityLog.deleteMany({ where: { ticket: { companyId } } });
  await prisma.auditLog.deleteMany({ where: { companyId } });
  await prisma.ticket.deleteMany({ where: { companyId } });
  await prisma.record.deleteMany({ where: { companyId } });
  await prisma.automationRule.deleteMany({ where: { companyId } });
  await prisma.tableMeta.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ── cleanupOldLogData (db-cleanup-jobs) ───────────────────────────

describe("cleanupOldLogData", () => {
  it("deletes AuditLog entries older than 90 days and keeps recent ones", async () => {
    // Seed old + recent AuditLog entries
    await prisma.auditLog.createMany({
      data: [
        { companyId, userId, action: "UPDATE", timestamp: daysAgo(100) },
        { companyId, userId, action: "UPDATE", timestamp: daysAgo(95) },
        { companyId, userId, action: "CREATE", timestamp: daysAgo(10) },
      ],
    });

    const beforeCount = await prisma.auditLog.count({ where: { companyId } });

    const step = createMockStep();
    await handlers["cleanup-old-log-data"]({ step });

    const afterCount = await prisma.auditLog.count({ where: { companyId } });

    // 2 old entries should have been deleted, 1 recent survives
    expect(afterCount).toBe(beforeCount - 2);

    const remaining = await prisma.auditLog.findMany({ where: { companyId } });
    remaining.forEach((log) => {
      expect(log.timestamp.getTime()).toBeGreaterThan(daysAgo(90).getTime());
    });
  });

  it("deletes TicketActivityLog entries older than 90 days and keeps recent ones", async () => {
    await prisma.ticketActivityLog.createMany({
      data: [
        {
          ticketId,
          userId,
          fieldName: "status",
          fieldLabel: "Status",
          oldValue: "OPEN",
          newValue: "CLOSED",
          createdAt: daysAgo(120),
        },
        {
          ticketId,
          userId,
          fieldName: "priority",
          fieldLabel: "Priority",
          oldValue: "LOW",
          newValue: "HIGH",
          createdAt: daysAgo(5),
        },
      ],
    });

    const step = createMockStep();
    await handlers["cleanup-old-log-data"]({ step });

    const remaining = await prisma.ticketActivityLog.findMany({
      where: { ticket: { companyId } },
    });

    // Only the recent one should survive
    remaining.forEach((log) => {
      expect(log.createdAt.getTime()).toBeGreaterThan(daysAgo(90).getTime());
    });
  });

  it("deletes AutomationLog entries older than 180 days and keeps recent ones", async () => {
    // Create records for the automation log FK (unique constraint on automationRuleId + recordId)
    const oldRecord = await prisma.record.create({
      data: { companyId, tableId, data: {} },
    });
    const recentRecord = await prisma.record.create({
      data: { companyId, tableId, data: {} },
    });

    await prisma.automationLog.create({
      data: {
        automationRuleId,
        recordId: oldRecord.id,
        companyId,
        executedAt: daysAgo(200),
      },
    });

    await prisma.automationLog.create({
      data: {
        automationRuleId,
        recordId: recentRecord.id,
        companyId,
        executedAt: daysAgo(30),
      },
    });

    const step = createMockStep();
    await handlers["cleanup-old-log-data"]({ step });

    const remaining = await prisma.automationLog.findMany({ where: { companyId } });

    remaining.forEach((log) => {
      expect(log.executedAt.getTime()).toBeGreaterThan(daysAgo(180).getTime());
    });
  });

  it("deletes ViewRefreshLog entries older than 7 days and keeps recent ones", async () => {
    await prisma.viewRefreshLog.createMany({
      data: [
        { companyId, userId, timestamp: daysAgo(10) },
        { companyId, userId, timestamp: daysAgo(2) },
      ],
    });

    const step = createMockStep();
    await handlers["cleanup-old-log-data"]({ step });

    const remaining = await prisma.viewRefreshLog.findMany({ where: { companyId } });

    remaining.forEach((log) => {
      expect(log.timestamp.getTime()).toBeGreaterThan(daysAgo(7).getTime());
    });
  });

  it("deletes AnalyticsRefreshLog entries older than 7 days and keeps recent ones", async () => {
    await prisma.analyticsRefreshLog.createMany({
      data: [
        { companyId, userId, timestamp: daysAgo(14) },
        { companyId, userId, timestamp: daysAgo(1) },
      ],
    });

    const step = createMockStep();
    await handlers["cleanup-old-log-data"]({ step });

    const remaining = await prisma.analyticsRefreshLog.findMany({ where: { companyId } });

    remaining.forEach((log) => {
      expect(log.timestamp.getTime()).toBeGreaterThan(daysAgo(7).getTime());
    });
  });

  it("returns deletion counts for all log types", async () => {
    const step = createMockStep();
    const result = await handlers["cleanup-old-log-data"]({ step });

    expect(result).toHaveProperty("auditLogsDeleted");
    expect(result).toHaveProperty("ticketActivityDeleted");
    expect(result).toHaveProperty("automationLogsDeleted");
    expect(result).toHaveProperty("viewRefreshDeleted");
    expect(result).toHaveProperty("analyticsRefreshDeleted");
    expect(typeof result.auditLogsDeleted).toBe("number");
    expect(typeof result.ticketActivityDeleted).toBe("number");
    expect(typeof result.automationLogsDeleted).toBe("number");
    expect(typeof result.viewRefreshDeleted).toBe("number");
    expect(typeof result.analyticsRefreshDeleted).toBe("number");
  });
});

// ── cleanupOldAutomationData (automation-cleanup-jobs) ────────────

describe("cleanupOldAutomationData", () => {
  it("deletes AutomationLog entries older than 90 days and keeps recent ones", async () => {
    // Clean existing automation logs for a clean state
    await prisma.automationLog.deleteMany({ where: { companyId } });

    // Create records for the unique FK constraint
    const oldRecord = await prisma.record.create({
      data: { companyId, tableId, data: {} },
    });
    const recentRecord = await prisma.record.create({
      data: { companyId, tableId, data: {} },
    });

    await prisma.automationLog.create({
      data: {
        automationRuleId,
        recordId: oldRecord.id,
        companyId,
        executedAt: daysAgo(100),
      },
    });

    await prisma.automationLog.create({
      data: {
        automationRuleId,
        recordId: recentRecord.id,
        companyId,
        executedAt: daysAgo(30),
      },
    });

    const step = createMockStep();
    await handlers["cleanup-old-automation-data"]({ step });

    const remaining = await prisma.automationLog.findMany({ where: { companyId } });

    // Only the recent one (30 days old) should survive
    expect(remaining).toHaveLength(1);
    expect(remaining[0].executedAt.getTime()).toBeGreaterThan(daysAgo(90).getTime());
  });

  it("deletes StatusDuration entries older than 365 days and keeps recent ones", async () => {
    await prisma.statusDuration.deleteMany({ where: { companyId } });

    await prisma.statusDuration.createMany({
      data: [
        {
          companyId,
          automationRuleId,
          durationSeconds: 3600,
          durationString: "1h",
          fromValue: "OPEN",
          toValue: "CLOSED",
          createdAt: daysAgo(400),
        },
        {
          companyId,
          automationRuleId,
          durationSeconds: 7200,
          durationString: "2h",
          fromValue: "OPEN",
          toValue: "IN_PROGRESS",
          createdAt: daysAgo(100),
        },
      ],
    });

    const step = createMockStep();
    await handlers["cleanup-old-automation-data"]({ step });

    const remaining = await prisma.statusDuration.findMany({ where: { companyId } });

    // Only the recent one (100 days old) should survive
    expect(remaining).toHaveLength(1);
    remaining.forEach((sd) => {
      expect(sd.createdAt.getTime()).toBeGreaterThan(daysAgo(365).getTime());
    });
  });

  it("deletes MultiEventDuration entries older than 365 days and keeps recent ones", async () => {
    await prisma.multiEventDuration.deleteMany({ where: { companyId } });

    await prisma.multiEventDuration.createMany({
      data: [
        {
          companyId,
          automationRuleId,
          eventChain: [{ eventName: "Created", timestamp: daysAgo(500).toISOString() }],
          eventDeltas: [],
          totalDurationSeconds: 1000,
          totalDurationString: "16m",
          createdAt: daysAgo(500),
        },
        {
          companyId,
          automationRuleId,
          eventChain: [{ eventName: "Created", timestamp: daysAgo(50).toISOString() }],
          eventDeltas: [],
          totalDurationSeconds: 2000,
          totalDurationString: "33m",
          createdAt: daysAgo(50),
        },
      ],
    });

    const step = createMockStep();
    await handlers["cleanup-old-automation-data"]({ step });

    const remaining = await prisma.multiEventDuration.findMany({ where: { companyId } });

    // Only the recent one (50 days old) should survive
    expect(remaining).toHaveLength(1);
    remaining.forEach((med) => {
      expect(med.createdAt.getTime()).toBeGreaterThan(daysAgo(365).getTime());
    });
  });

  it("returns deletion counts for all data types", async () => {
    const step = createMockStep();
    const result = await handlers["cleanup-old-automation-data"]({ step });

    expect(result).toHaveProperty("logsDeleted");
    expect(result).toHaveProperty("statusDurationsDeleted");
    expect(result).toHaveProperty("multiEventDeleted");
    expect(typeof result.logsDeleted).toBe("number");
    expect(typeof result.statusDurationsDeleted).toBe("number");
    expect(typeof result.multiEventDeleted).toBe("number");
  });
});

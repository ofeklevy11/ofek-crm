import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---
const mockTx = {
  record: { findFirst: vi.fn(), update: vi.fn() },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    automationRule: { findMany: vi.fn(), updateMany: vi.fn() },
    record: { findFirst: vi.fn(), create: vi.fn() },
    tableMeta: { findFirst: vi.fn(), findMany: vi.fn() },
    auditLog: { findMany: vi.fn() },
    task: { create: vi.fn(), update: vi.fn() },
    statusDuration: { create: vi.fn() },
    calendarEvent: { create: vi.fn() },
    nurtureList: { findUnique: vi.fn(), create: vi.fn() },
    nurtureSubscriber: { findFirst: vi.fn(), create: vi.fn() },
    user: { findFirst: vi.fn() },
    file: { findFirst: vi.fn() },
    automationLog: { createMany: vi.fn() },
    analyticsView: { findMany: vi.fn() },
    financeSyncRule: { findMany: vi.fn() },
    financeSyncJob: { findMany: vi.fn(), create: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn((fn: any) => fn(mockTx)),
  },
}));

vi.mock("@/lib/db-retry", () => ({
  withRetry: vi.fn((fn: any) => fn()),
}));

vi.mock("@/lib/notifications-internal", () => ({
  createNotificationForCompany: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@/lib/security/ssrf", () => ({
  isPrivateUrl: vi.fn().mockReturnValue(false),
}));

vi.mock("@/lib/services/analytics-cache", () => ({
  invalidateFullCache: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/services/green-api", () => ({
  sendGreenApiMessage: vi.fn(),
  sendGreenApiFile: vi.fn(),
}));

vi.mock("@/lib/analytics/calculate", () => ({
  calculateViewStats: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkActionRateLimit: vi.fn().mockResolvedValue(false),
  RATE_LIMITS: {
    automationRead: { prefix: "auto-read", max: 60, windowSeconds: 60 },
    automationMutate: { prefix: "auto-mut", max: 30, windowSeconds: 60 },
  },
}));

vi.mock("@/lib/permissions-server", () => ({
  getCurrentUser: vi.fn(),
}));

import {
  executeRuleActions,
  processTaskStatusChange,
  processNewRecordTrigger,
  processRecordUpdate,
  processDirectDialTrigger,
  processTimeBasedAutomations,
  processViewAutomations,
} from "@/app/actions/automations-core";
import { prisma } from "@/lib/prisma";
import { createNotificationForCompany } from "@/lib/notifications-internal";
import { inngest } from "@/lib/inngest/client";
import { isPrivateUrl } from "@/lib/security/ssrf";
import { calculateViewStats } from "@/lib/analytics/calculate";

// --- Helpers ---
const makeRule = (overrides: any = {}) => ({
  id: 1,
  companyId: 100,
  createdBy: 5,
  name: "Test Rule",
  triggerType: "MANUAL",
  triggerConfig: {},
  actionType: "SEND_NOTIFICATION",
  actionConfig: { recipientId: 1, messageTemplate: "Hello" },
  isActive: true,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.financeSyncRule.findMany).mockResolvedValue([]);
  vi.mocked(prisma.financeSyncJob.findMany).mockResolvedValue([]);
  mockTx.record.findFirst.mockReset();
  mockTx.record.update.mockReset();
});

// ─── processTaskStatusChange ─────────────────────────────────────────────

describe("processTaskStatusChange", () => {
  it("scopes query to companyId", async () => {
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([]);
    await processTaskStatusChange("t1", "Test Task", "todo", "done", 100);
    const call = vi.mocked(prisma.automationRule.findMany).mock.calls[0][0] as any;
    expect(call.where.companyId).toBe(100);
    expect(call.where.triggerType).toBe("TASK_STATUS_CHANGE");
  });

  it("filters by fromStatus and toStatus", async () => {
    const matchingRule = makeRule({
      triggerType: "TASK_STATUS_CHANGE",
      triggerConfig: { fromStatus: "todo", toStatus: "done" },
    });
    const nonMatchingRule = makeRule({
      id: 2,
      triggerType: "TASK_STATUS_CHANGE",
      triggerConfig: { fromStatus: "todo", toStatus: "in_progress" },
    });
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([matchingRule, nonMatchingRule] as any);
    vi.mocked(createNotificationForCompany).mockResolvedValue({ success: true } as any);
    await processTaskStatusChange("t1", "My Task", "todo", "done", 100);
    // Only the matching rule should trigger
    expect(createNotificationForCompany).toHaveBeenCalledTimes(1);
    expect(createNotificationForCompany).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 100,
        userId: 1,
        message: "Hello",
        link: "/tasks",
      }),
    );
  });

  it("no rules = no-op", async () => {
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([]);
    await processTaskStatusChange("t1", "Task", "a", "b", 100);
    expect(createNotificationForCompany).not.toHaveBeenCalled();
  });

  it("continues after individual rule failure", async () => {
    const rules = [
      makeRule({ id: 1, triggerType: "TASK_STATUS_CHANGE", triggerConfig: {} }),
      makeRule({ id: 2, triggerType: "TASK_STATUS_CHANGE", triggerConfig: {} }),
      makeRule({ id: 3, triggerType: "TASK_STATUS_CHANGE", triggerConfig: {} }),
    ];
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue(rules as any);
    vi.mocked(createNotificationForCompany)
      .mockRejectedValueOnce(new Error("fail 1"))
      .mockResolvedValueOnce({ success: true } as any)
      .mockResolvedValueOnce({ success: true } as any);
    // Should not throw since only 1/3 failed (< 50%)
    await processTaskStatusChange("t1", "Task", "x", "y", 100);
  });

  it("throws at >=50% failure rate", async () => {
    const rules = [
      makeRule({ id: 1, triggerType: "TASK_STATUS_CHANGE", triggerConfig: {} }),
      makeRule({ id: 2, triggerType: "TASK_STATUS_CHANGE", triggerConfig: {} }),
    ];
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue(rules as any);
    vi.mocked(createNotificationForCompany)
      .mockRejectedValue(new Error("fail"));
    await expect(processTaskStatusChange("t1", "Task", "x", "y", 100))
      .rejects.toThrow("2/2 task status rules failed");
  });

  it("skips rules outside business hours", async () => {
    const rule = makeRule({
      triggerType: "TASK_STATUS_CHANGE",
      triggerConfig: {
        businessHours: { days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" },
      },
    });
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([rule] as any);

    // Mock DateTimeFormat to simulate Saturday 03:00 in Asia/Jerusalem
    const OrigDTF = Intl.DateTimeFormat;
    globalThis.Intl.DateTimeFormat = function () {
      return {
        formatToParts: () => [
          { type: "weekday", value: "Sat" },
          { type: "literal", value: ", " },
          { type: "hour", value: "03" },
          { type: "literal", value: ":" },
          { type: "minute", value: "00" },
        ],
      };
    } as any;

    try {
      await processTaskStatusChange("t1", "Task", "todo", "done", 100);
      // Rule should be skipped — Saturday is not in [1,2,3,4,5]
      expect(createNotificationForCompany).not.toHaveBeenCalled();
    } finally {
      globalThis.Intl.DateTimeFormat = OrigDTF;
    }
  });
});

// ─── processNewRecordTrigger ─────────────────────────────────────────────

describe("processNewRecordTrigger", () => {
  it("returns early when record not found", async () => {
    vi.mocked(prisma.record.findFirst).mockResolvedValue(null);
    await processNewRecordTrigger(1, "Table", 999, 100);
    expect(prisma.automationRule.findMany).not.toHaveBeenCalled();
  });

  it("filters by tableId", async () => {
    vi.mocked(prisma.record.findFirst).mockResolvedValue({ data: { name: "test" }, companyId: 100 } as any);
    const ruleMatchTable = makeRule({ triggerType: "NEW_RECORD", triggerConfig: { tableId: "5" } });
    const ruleOtherTable = makeRule({ id: 2, triggerType: "NEW_RECORD", triggerConfig: { tableId: "99" } });
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([ruleMatchTable, ruleOtherTable] as any);
    vi.mocked(createNotificationForCompany).mockResolvedValue({ success: true } as any);
    await processNewRecordTrigger(5, "Leads", 10, 100);
    // Only ruleMatchTable should fire
    expect(createNotificationForCompany).toHaveBeenCalledTimes(1);
    expect(createNotificationForCompany).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 100,
        userId: 1,
        link: "/tables/5",
      }),
    );
  });

  it("checks condition string equality", async () => {
    vi.mocked(prisma.record.findFirst).mockResolvedValue({ data: { status: "active" }, companyId: 100 } as any);
    const rule = makeRule({
      triggerType: "NEW_RECORD",
      triggerConfig: { tableId: "1", conditionColumnId: "status", conditionValue: "active" },
    });
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([rule] as any);
    vi.mocked(createNotificationForCompany).mockResolvedValue({ success: true } as any);
    await processNewRecordTrigger(1, "T", 10, 100);
    expect(createNotificationForCompany).toHaveBeenCalledTimes(1);
    expect(createNotificationForCompany).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 100, userId: 1 }),
    );
  });

  it("checks condition with numeric operator", async () => {
    vi.mocked(prisma.record.findFirst).mockResolvedValue({ data: { score: 75 }, companyId: 100 } as any);
    const rule = makeRule({
      triggerType: "NEW_RECORD",
      triggerConfig: { tableId: "1", conditionColumnId: "score", conditionValue: 50, operator: "gt" },
    });
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([rule] as any);
    vi.mocked(createNotificationForCompany).mockResolvedValue({ success: true } as any);
    await processNewRecordTrigger(1, "T", 10, 100);
    expect(createNotificationForCompany).toHaveBeenCalledTimes(1);
    expect(createNotificationForCompany).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 100, userId: 1 }),
    );
  });

  it("matches lt operator condition", async () => {
    vi.mocked(prisma.record.findFirst).mockResolvedValue({ data: { score: 30 }, companyId: 100 } as any);
    const rule = makeRule({
      triggerType: "NEW_RECORD",
      triggerConfig: { tableId: "1", conditionColumnId: "score", conditionValue: 50, operator: "lt" },
    });
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([rule] as any);
    vi.mocked(createNotificationForCompany).mockResolvedValue({ success: true } as any);
    await processNewRecordTrigger(1, "T", 10, 100);
    expect(createNotificationForCompany).toHaveBeenCalledTimes(1);
  });

  it("matches eq operator condition", async () => {
    vi.mocked(prisma.record.findFirst).mockResolvedValue({ data: { score: 50 }, companyId: 100 } as any);
    const rule = makeRule({
      triggerType: "NEW_RECORD",
      triggerConfig: { tableId: "1", conditionColumnId: "score", conditionValue: 50, operator: "eq" },
    });
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([rule] as any);
    vi.mocked(createNotificationForCompany).mockResolvedValue({ success: true } as any);
    await processNewRecordTrigger(1, "T", 10, 100);
    expect(createNotificationForCompany).toHaveBeenCalledTimes(1);
  });

  it("skips when neq operator matches equal value", async () => {
    vi.mocked(prisma.record.findFirst).mockResolvedValue({ data: { score: 50 }, companyId: 100 } as any);
    const rule = makeRule({
      triggerType: "NEW_RECORD",
      triggerConfig: { tableId: "1", conditionColumnId: "score", conditionValue: 50, operator: "neq" },
    });
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([rule] as any);
    await processNewRecordTrigger(1, "T", 10, 100);
    expect(createNotificationForCompany).not.toHaveBeenCalled();
  });

  it("skips when unknown operator used (default: false)", async () => {
    vi.mocked(prisma.record.findFirst).mockResolvedValue({ data: { score: 50 }, companyId: 100 } as any);
    const rule = makeRule({
      triggerType: "NEW_RECORD",
      triggerConfig: { tableId: "1", conditionColumnId: "score", conditionValue: 50, operator: "unknown" },
    });
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([rule] as any);
    await processNewRecordTrigger(1, "T", 10, 100);
    expect(createNotificationForCompany).not.toHaveBeenCalled();
  });

  it("skips rules when condition column is undefined/null", async () => {
    vi.mocked(prisma.record.findFirst).mockResolvedValue({ data: {}, companyId: 100 } as any);
    const rule = makeRule({
      triggerType: "NEW_RECORD",
      triggerConfig: { tableId: "1", conditionColumnId: "missing", conditionValue: "x" },
    });
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([rule] as any);
    await processNewRecordTrigger(1, "T", 10, 100);
    expect(createNotificationForCompany).not.toHaveBeenCalled();
  });

  it("throws at >=50% failure threshold", async () => {
    vi.mocked(prisma.record.findFirst).mockResolvedValue({ data: {}, companyId: 100 } as any);
    const rules = [
      makeRule({ id: 1, triggerType: "NEW_RECORD", triggerConfig: { tableId: "1" } }),
      makeRule({ id: 2, triggerType: "NEW_RECORD", triggerConfig: { tableId: "1" } }),
    ];
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue(rules as any);
    vi.mocked(createNotificationForCompany).mockRejectedValue(new Error("fail"));
    await expect(processNewRecordTrigger(1, "T", 10, 100))
      .rejects.toThrow("2/2 new record rules failed");
  });

  it("enqueues finance sync jobs when sync rules exist", async () => {
    vi.mocked(prisma.record.findFirst).mockResolvedValue({ data: {}, companyId: 100 } as any);
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([]);
    vi.mocked(prisma.financeSyncRule.findMany).mockResolvedValue([
      { id: 10, companyId: 100, sourceType: "TABLE", sourceId: 5, isActive: true },
    ] as any);
    vi.mocked(prisma.financeSyncJob.findMany).mockResolvedValue([]);
    vi.mocked(prisma.financeSyncJob.create).mockResolvedValue({ id: 99 } as any);
    await processNewRecordTrigger(5, "T", 1, 100);
    expect(prisma.financeSyncJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          companyId: 100,
          syncRuleId: 10,
          status: "QUEUED",
        }),
      }),
    );
    expect(inngest.send).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          name: "finance-sync/job.started",
          data: expect.objectContaining({ syncRuleId: 10, companyId: 100 }),
        }),
      ]),
    );
  });
});

// ─── processRecordUpdate ─────────────────────────────────────────────────

describe("processRecordUpdate", () => {
  it("filters by tableId", async () => {
    const rule = makeRule({
      triggerType: "RECORD_FIELD_CHANGE",
      triggerConfig: { tableId: "5", columnId: "status" },
    });
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([rule] as any);
    vi.mocked(prisma.tableMeta.findFirst).mockResolvedValue({ name: "Leads" } as any);
    // Table doesn't match
    await processRecordUpdate(99, 1, { status: "old" }, { status: "new" }, 100);
    expect(createNotificationForCompany).not.toHaveBeenCalled();
  });

  it("requires columnId in triggerConfig", async () => {
    const rule = makeRule({
      triggerType: "RECORD_FIELD_CHANGE",
      triggerConfig: { tableId: "5" }, // no columnId
    });
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([rule] as any);
    vi.mocked(prisma.tableMeta.findFirst).mockResolvedValue({ name: "T" } as any);
    await processRecordUpdate(5, 1, {}, {}, 100);
    expect(createNotificationForCompany).not.toHaveBeenCalled();
  });

  it("skips unchanged values", async () => {
    const rule = makeRule({
      triggerType: "RECORD_FIELD_CHANGE",
      triggerConfig: { tableId: "5", columnId: "status" },
    });
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([rule] as any);
    vi.mocked(prisma.tableMeta.findFirst).mockResolvedValue({ name: "T" } as any);
    await processRecordUpdate(5, 1, { status: "same" }, { status: "same" }, 100);
    expect(createNotificationForCompany).not.toHaveBeenCalled();
  });

  it("skips undefined new values", async () => {
    const rule = makeRule({
      triggerType: "RECORD_FIELD_CHANGE",
      triggerConfig: { tableId: "5", columnId: "status" },
    });
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([rule] as any);
    vi.mocked(prisma.tableMeta.findFirst).mockResolvedValue({ name: "T" } as any);
    await processRecordUpdate(5, 1, { status: "old" }, {}, 100);
    expect(createNotificationForCompany).not.toHaveBeenCalled();
  });

  it("matches fromValue and toValue", async () => {
    const rule = makeRule({
      triggerType: "RECORD_FIELD_CHANGE",
      triggerConfig: { tableId: "5", columnId: "status", fromValue: "draft", toValue: "published" },
    });
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([rule] as any);
    vi.mocked(prisma.tableMeta.findFirst).mockResolvedValue({ name: "Posts" } as any);
    vi.mocked(createNotificationForCompany).mockResolvedValue({ success: true } as any);
    await processRecordUpdate(5, 1, { status: "draft" }, { status: "published" }, 100);
    expect(createNotificationForCompany).toHaveBeenCalledTimes(1);
    expect(createNotificationForCompany).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 100, userId: 1, link: "/tables/5" }),
    );
  });

  it("uses numeric operator for matching", async () => {
    const rule = makeRule({
      triggerType: "RECORD_FIELD_CHANGE",
      triggerConfig: { tableId: "5", columnId: "score", operator: "gte", toValue: 80 },
    });
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([rule] as any);
    vi.mocked(prisma.tableMeta.findFirst).mockResolvedValue({ name: "T" } as any);
    vi.mocked(createNotificationForCompany).mockResolvedValue({ success: true } as any);
    await processRecordUpdate(5, 1, { score: 50 }, { score: 85 }, 100);
    expect(createNotificationForCompany).toHaveBeenCalledTimes(1);
    expect(createNotificationForCompany).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 100, userId: 1, link: "/tables/5" }),
    );
  });

  it("skips NaN values in numeric operator", async () => {
    const rule = makeRule({
      triggerType: "RECORD_FIELD_CHANGE",
      triggerConfig: { tableId: "5", columnId: "score", operator: "gt", toValue: 80 },
    });
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([rule] as any);
    vi.mocked(prisma.tableMeta.findFirst).mockResolvedValue({ name: "T" } as any);
    await processRecordUpdate(5, 1, { score: 50 }, { score: "not-a-number" }, 100);
    expect(createNotificationForCompany).not.toHaveBeenCalled();
  });

  it("fetches table name when not passed", async () => {
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([]);
    vi.mocked(prisma.tableMeta.findFirst).mockResolvedValue({ name: "Contacts" } as any);
    await processRecordUpdate(5, 1, {}, {}, 100);
    expect(prisma.tableMeta.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 5, companyId: 100 } }),
    );
  });

  it("enqueues multi-event job and executes matching rule", async () => {
    const rule = makeRule({
      triggerType: "RECORD_FIELD_CHANGE",
      triggerConfig: { tableId: "5", columnId: "status", fromValue: "open", toValue: "closed" },
    });
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([rule] as any);
    vi.mocked(prisma.tableMeta.findFirst).mockResolvedValue({ name: "T" } as any);
    vi.mocked(createNotificationForCompany).mockResolvedValue({ success: true } as any);
    await processRecordUpdate(5, 42, { status: "open" }, { status: "closed" }, 100);
    // Verify the matching rule was executed
    expect(createNotificationForCompany).toHaveBeenCalledTimes(1);
    // Verify multi-event job was also enqueued
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "automation/multi-event-duration",
        data: expect.objectContaining({ tableId: 5, recordId: 42, companyId: 100 }),
      }),
    );
  });
});

// ─── processDirectDialTrigger ────────────────────────────────────────────

describe("processDirectDialTrigger", () => {
  it("returns early when no rules found", async () => {
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([]);
    await processDirectDialTrigger(1, 10, 100);
    expect(prisma.record.findFirst).not.toHaveBeenCalled();
  });

  it("returns early when record not found", async () => {
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([makeRule({ triggerType: "DIRECT_DIAL" })] as any);
    vi.mocked(prisma.record.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.tableMeta.findFirst).mockResolvedValue({ name: "T" } as any);
    await processDirectDialTrigger(1, 999, 100);
    expect(createNotificationForCompany).not.toHaveBeenCalled();
  });

  it("passes previousDialedAt to context and verifies CALCULATE_DURATION consumes it", async () => {
    const rule = makeRule({
      triggerType: "DIRECT_DIAL",
      triggerConfig: { tableId: 5 },
      actionType: "CALCULATE_DURATION",
      actionConfig: {},
    });
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([rule] as any);
    const createdAt = new Date("2025-01-01");
    vi.mocked(prisma.record.findFirst).mockResolvedValue({ data: { name: "Test" }, createdAt } as any);
    vi.mocked(prisma.tableMeta.findFirst).mockResolvedValue({ name: "Leads" } as any);
    vi.mocked(prisma.statusDuration.create).mockResolvedValue({} as any);
    await processDirectDialTrigger(5, 10, 100, "2025-06-01T10:00:00Z");
    // Verify that previousDialedAt was consumed by CALCULATE_DURATION logic
    expect(prisma.statusDuration.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          automationRuleId: 1,
          recordId: 10,
          companyId: 100,
          fromValue: "חיוג קודם",
          toValue: "חיוג נוכחי",
        }),
      }),
    );
  });
});

// ─── processTimeBasedAutomations ─────────────────────────────────────────

describe("processTimeBasedAutomations", () => {
  it("returns early when companyId is falsy", async () => {
    await processTimeBasedAutomations(0);
    expect(prisma.automationRule.findMany).not.toHaveBeenCalled();
  });

  it("filters rules with invalid configs", async () => {
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([
      makeRule({ triggerConfig: { tableId: 1 } }), // missing timeValue, timeUnit
      makeRule({ triggerConfig: { tableId: 1, timeValue: 10, timeUnit: "hours" } }),
    ] as any);
    vi.mocked(prisma.tableMeta.findMany).mockResolvedValue([{ id: 1, name: "T" }] as any);
    vi.mocked(prisma.$queryRaw).mockResolvedValue([]);
    await processTimeBasedAutomations(100);
    // Only valid rule should be processed — tableMeta.findMany is called for valid rules' tableIds
    expect(prisma.tableMeta.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: [1] }, companyId: 100 } }),
    );
    // Only the valid rule should trigger a raw query
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("batch-fetches table names", async () => {
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([
      makeRule({ id: 1, triggerConfig: { tableId: "1", timeValue: 10, timeUnit: "hours" } }),
      makeRule({ id: 2, triggerConfig: { tableId: "2", timeValue: 5, timeUnit: "days" } }),
    ] as any);
    vi.mocked(prisma.tableMeta.findMany).mockResolvedValue([
      { id: 1, name: "T1" }, { id: 2, name: "T2" },
    ] as any);
    vi.mocked(prisma.$queryRaw).mockResolvedValue([]);
    await processTimeBasedAutomations(100);
    expect(prisma.tableMeta.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: [1, 2] }, companyId: 100 } }),
    );
  });

  it("executes actions and creates logs when records are found", async () => {
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([
      makeRule({
        id: 10,
        triggerType: "TIME_SINCE_CREATION",
        triggerConfig: { tableId: "1", timeValue: 10, timeUnit: "hours" },
        createdAt: new Date("2020-01-01"),
      }),
    ] as any);
    vi.mocked(prisma.tableMeta.findMany).mockResolvedValue([{ id: 1, name: "Leads" }] as any);
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      { id: 42, data: { name: "Test Record" } },
    ] as any);
    vi.mocked(createNotificationForCompany).mockResolvedValue({ success: true } as any);
    vi.mocked(prisma.automationLog.createMany).mockResolvedValue({ count: 1 } as any);
    await processTimeBasedAutomations(100);
    // Verify rule actions were executed for the returned records
    expect(createNotificationForCompany).toHaveBeenCalledTimes(1);
    // Verify automation logs were created to prevent re-execution
    expect(prisma.automationLog.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            automationRuleId: 10,
            recordId: 42,
            companyId: 100,
          }),
        ]),
      }),
    );
  });

  it("filters records by conditionColumnId when set in triggerConfig", async () => {
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([
      makeRule({
        id: 20,
        triggerType: "TIME_SINCE_CREATION",
        triggerConfig: {
          tableId: "1",
          timeValue: 10,
          timeUnit: "hours",
          conditionColumnId: "status",
          conditionValue: "active",
        },
        createdAt: new Date("2020-01-01"),
      }),
    ] as any);
    vi.mocked(prisma.tableMeta.findMany).mockResolvedValue([{ id: 1, name: "Leads" }] as any);
    // Return records where some match and some don't
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      { id: 100, data: { name: "Match", status: "active" } },
      { id: 101, data: { name: "NoMatch", status: "inactive" } },
      { id: 102, data: { name: "AlsoMatch", status: "active" } },
    ] as any);
    vi.mocked(createNotificationForCompany).mockResolvedValue({ success: true } as any);
    vi.mocked(prisma.automationLog.createMany).mockResolvedValue({ count: 2 } as any);
    await processTimeBasedAutomations(100);
    // Only 2 of 3 records match conditionColumnId="status" conditionValue="active"
    expect(createNotificationForCompany).toHaveBeenCalledTimes(2);
    // Automation logs should only be created for matching records
    expect(prisma.automationLog.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ automationRuleId: 20, recordId: 100, companyId: 100 }),
          expect.objectContaining({ automationRuleId: 20, recordId: 102, companyId: 100 }),
        ]),
      }),
    );
    // Non-matching record (id: 101) should NOT be in the logs
    const logData = vi.mocked(prisma.automationLog.createMany).mock.calls[0][0] as any;
    expect(logData.data).toHaveLength(2);
    expect(logData.data.every((d: any) => d.recordId !== 101)).toBe(true);
  });
});

// ─── processViewAutomations ──────────────────────────────────────────────

describe("processViewAutomations", () => {
  it("returns early when companyId is falsy", async () => {
    await processViewAutomations(undefined, undefined, 0);
    expect(prisma.automationRule.findMany).not.toHaveBeenCalled();
  });

  it("batch-fetches views and triggers rule when threshold is met", async () => {
    const rule = makeRule({
      triggerType: "VIEW_METRIC_THRESHOLD",
      triggerConfig: { viewId: 10, operator: "gt", threshold: 40 },
    });
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([rule] as any);
    vi.mocked(prisma.analyticsView.findMany).mockResolvedValue([
      { id: 10, config: {}, title: "View 1", companyId: 100 },
    ] as any);
    vi.mocked(calculateViewStats).mockResolvedValue({ stats: { rawMetric: 50 } } as any);
    vi.mocked(createNotificationForCompany).mockResolvedValue({ success: true } as any);
    vi.mocked(prisma.automationRule.updateMany).mockResolvedValue({ count: 1 } as any);
    await processViewAutomations(undefined, undefined, 100);
    expect(prisma.analyticsView.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: [10] }, companyId: 100 } }),
    );
    // Verify the rule actually triggered (not just wiring)
    expect(createNotificationForCompany).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 100, userId: 1 }),
    );
  });

  it("filters rules missing viewId", async () => {
    const rule = makeRule({
      triggerType: "VIEW_METRIC_THRESHOLD",
      triggerConfig: { operator: "gt", threshold: 100 }, // no viewId
    });
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([rule] as any);
    vi.mocked(prisma.analyticsView.findMany).mockResolvedValue([]);
    await processViewAutomations(undefined, undefined, 100);
    expect(calculateViewStats).not.toHaveBeenCalled();
  });

  it("matches context with taskId for Task views", async () => {
    const rule = makeRule({
      triggerType: "VIEW_METRIC_THRESHOLD",
      triggerConfig: { viewId: 10, operator: "gt", threshold: 50 },
    });
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([rule] as any);
    vi.mocked(prisma.analyticsView.findMany).mockResolvedValue([
      { id: 10, config: { model: "Task" }, title: "Tasks", companyId: 100 },
    ] as any);
    vi.mocked(calculateViewStats).mockResolvedValue({ stats: { rawMetric: 60 } } as any);
    vi.mocked(createNotificationForCompany).mockResolvedValue({ success: true } as any);
    vi.mocked(prisma.automationRule.updateMany).mockResolvedValue({ count: 1 } as any);
    await processViewAutomations(undefined, "task-1", 100);
    expect(calculateViewStats).toHaveBeenCalled();
    expect(createNotificationForCompany).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 100, userId: 1 }),
    );
  });

  it("matches context with tableId", async () => {
    const rule = makeRule({
      triggerType: "VIEW_METRIC_THRESHOLD",
      triggerConfig: { viewId: 10, operator: "gt", threshold: 50 },
    });
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([rule] as any);
    vi.mocked(prisma.analyticsView.findMany).mockResolvedValue([
      { id: 10, config: { tableId: 5 }, title: "V", companyId: 100 },
    ] as any);
    vi.mocked(calculateViewStats).mockResolvedValue({ stats: { rawMetric: 60 } } as any);
    vi.mocked(createNotificationForCompany).mockResolvedValue({ success: true } as any);
    vi.mocked(prisma.automationRule.updateMany).mockResolvedValue({ count: 1 } as any);
    await processViewAutomations(5, undefined, 100);
    expect(calculateViewStats).toHaveBeenCalled();
    expect(createNotificationForCompany).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 100, userId: 1 }),
    );
  });

  it("checks frequency: once — skips if already ran", async () => {
    const rule = makeRule({
      triggerType: "VIEW_METRIC_THRESHOLD",
      triggerConfig: { viewId: 10, operator: "gt", threshold: 50, frequency: "once" },
      lastRunAt: new Date("2025-01-01"),
    });
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([rule] as any);
    vi.mocked(prisma.analyticsView.findMany).mockResolvedValue([
      { id: 10, config: {}, title: "V", companyId: 100 },
    ] as any);
    vi.mocked(calculateViewStats).mockResolvedValue({ stats: { rawMetric: 60 } } as any);
    await processViewAutomations(undefined, undefined, 100);
    // Should not execute actions since already ran once
    expect(createNotificationForCompany).not.toHaveBeenCalled();
    // Prove skip reason is frequency, not another filter (CAS update only happens when rule fires)
    expect(prisma.automationRule.updateMany).not.toHaveBeenCalled();
  });

  it("checks frequency: daily — skips if less than 24h", async () => {
    const rule = makeRule({
      triggerType: "VIEW_METRIC_THRESHOLD",
      triggerConfig: { viewId: 10, operator: "gt", threshold: 50, frequency: "daily" },
      lastRunAt: new Date(Date.now() - 12 * 60 * 60 * 1000), // 12h ago
    });
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([rule] as any);
    vi.mocked(prisma.analyticsView.findMany).mockResolvedValue([
      { id: 10, config: {}, title: "V", companyId: 100 },
    ] as any);
    vi.mocked(calculateViewStats).mockResolvedValue({ stats: { rawMetric: 60 } } as any);
    await processViewAutomations(undefined, undefined, 100);
    expect(createNotificationForCompany).not.toHaveBeenCalled();
    // Prove skip reason is frequency, not another filter
    expect(prisma.automationRule.updateMany).not.toHaveBeenCalled();
  });

  it("checks frequency: weekly — skips if less than 7d", async () => {
    const rule = makeRule({
      triggerType: "VIEW_METRIC_THRESHOLD",
      triggerConfig: { viewId: 10, operator: "gt", threshold: 50, frequency: "weekly" },
      lastRunAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
    });
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([rule] as any);
    vi.mocked(prisma.analyticsView.findMany).mockResolvedValue([
      { id: 10, config: {}, title: "V", companyId: 100 },
    ] as any);
    vi.mocked(calculateViewStats).mockResolvedValue({ stats: { rawMetric: 60 } } as any);
    await processViewAutomations(undefined, undefined, 100);
    expect(createNotificationForCompany).not.toHaveBeenCalled();
    // Prove skip reason is frequency, not another filter
    expect(prisma.automationRule.updateMany).not.toHaveBeenCalled();
  });

  it("checks frequency: always — runs when data changed", async () => {
    const rule = makeRule({
      triggerType: "VIEW_METRIC_THRESHOLD",
      triggerConfig: { viewId: 10, operator: "gt", threshold: 50, frequency: "always", lastDataSnapshot: '{"different":"data"}' },
      lastRunAt: new Date(),
    });
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([rule] as any);
    vi.mocked(prisma.analyticsView.findMany).mockResolvedValue([
      { id: 10, config: {}, title: "V", companyId: 100 },
    ] as any);
    vi.mocked(calculateViewStats).mockResolvedValue({ stats: { rawMetric: 60 } } as any);
    vi.mocked(createNotificationForCompany).mockResolvedValue({ success: true } as any);
    vi.mocked(prisma.automationRule.updateMany).mockResolvedValue({ count: 1 } as any);
    await processViewAutomations(undefined, undefined, 100);
    expect(createNotificationForCompany).toHaveBeenCalled();
  });

  it("skips rule when metric threshold is not met", async () => {
    const rule = makeRule({
      triggerType: "VIEW_METRIC_THRESHOLD",
      triggerConfig: { viewId: 10, operator: "gt", threshold: 100 },
    });
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([rule] as any);
    vi.mocked(prisma.analyticsView.findMany).mockResolvedValue([
      { id: 10, config: {}, title: "V", companyId: 100 },
    ] as any);
    vi.mocked(calculateViewStats).mockResolvedValue({ stats: { rawMetric: 50 } } as any);
    await processViewAutomations(undefined, undefined, 100);
    // Metric 50 is NOT > 100, so action should not execute
    expect(createNotificationForCompany).not.toHaveBeenCalled();
  });

  it("skips rule when frequency=always and data snapshot unchanged", async () => {
    const currentSnapshot = JSON.stringify({ rawMetric: 60 });
    const rule = makeRule({
      triggerType: "VIEW_METRIC_THRESHOLD",
      triggerConfig: {
        viewId: 10,
        operator: "gt",
        threshold: 50,
        frequency: "always",
        lastDataSnapshot: currentSnapshot,
      },
      lastRunAt: new Date(),
    });
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([rule] as any);
    vi.mocked(prisma.analyticsView.findMany).mockResolvedValue([
      { id: 10, config: {}, title: "V", companyId: 100 },
    ] as any);
    vi.mocked(calculateViewStats).mockResolvedValue({ stats: { rawMetric: 60 } } as any);
    await processViewAutomations(undefined, undefined, 100);
    // Same data snapshot as lastDataSnapshot → should be skipped
    expect(createNotificationForCompany).not.toHaveBeenCalled();
  });

  it("deduplicates calculateViewStats calls for same viewId", async () => {
    const rule1 = makeRule({
      id: 1,
      triggerType: "VIEW_METRIC_THRESHOLD",
      triggerConfig: { viewId: 10, operator: "gt", threshold: 40 },
    });
    const rule2 = makeRule({
      id: 2,
      triggerType: "VIEW_METRIC_THRESHOLD",
      triggerConfig: { viewId: 10, operator: "gt", threshold: 30 },
    });
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([rule1, rule2] as any);
    vi.mocked(prisma.analyticsView.findMany).mockResolvedValue([
      { id: 10, config: {}, title: "V", companyId: 100 },
    ] as any);
    vi.mocked(calculateViewStats).mockResolvedValue({ stats: { rawMetric: 50 } } as any);
    vi.mocked(createNotificationForCompany).mockResolvedValue({ success: true } as any);
    vi.mocked(prisma.automationRule.updateMany).mockResolvedValue({ count: 1 } as any);
    await processViewAutomations(undefined, undefined, 100);
    // Both rules share viewId=10, so calculateViewStats should be called only once
    expect(calculateViewStats).toHaveBeenCalledTimes(1);
    // Both rules should still trigger (metric 50 > both thresholds)
    expect(createNotificationForCompany).toHaveBeenCalledTimes(2);
  });

  it("CAS lastRunAt update after execution", async () => {
    const lastRunAt = new Date("2025-01-01");
    const rule = makeRule({
      triggerType: "VIEW_METRIC_THRESHOLD",
      triggerConfig: { viewId: 10, operator: "gt", threshold: 50, frequency: "always" },
      lastRunAt,
    });
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([rule] as any);
    vi.mocked(prisma.analyticsView.findMany).mockResolvedValue([
      { id: 10, config: {}, title: "V", companyId: 100 },
    ] as any);
    vi.mocked(calculateViewStats).mockResolvedValue({ stats: { rawMetric: 60 } } as any);
    vi.mocked(createNotificationForCompany).mockResolvedValue({ success: true } as any);
    vi.mocked(prisma.automationRule.updateMany).mockResolvedValue({ count: 1 } as any);
    await processViewAutomations(undefined, undefined, 100);
    const updateCall = vi.mocked(prisma.automationRule.updateMany).mock.calls[0][0] as any;
    expect(updateCall.where.lastRunAt).toEqual(lastRunAt);
  });

  it("throws when >= 50% of rules fail (failure threshold)", async () => {
    const rule1 = makeRule({
      id: 1,
      triggerType: "VIEW_METRIC_THRESHOLD",
      triggerConfig: { viewId: 10, operator: "gt", threshold: 40 },
    });
    const rule2 = makeRule({
      id: 2,
      triggerType: "VIEW_METRIC_THRESHOLD",
      triggerConfig: { viewId: 11, operator: "gt", threshold: 40 },
    });
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([rule1, rule2] as any);
    vi.mocked(prisma.analyticsView.findMany).mockResolvedValue([
      { id: 10, config: {}, title: "V1", companyId: 100 },
      { id: 11, config: {}, title: "V2", companyId: 100 },
    ] as any);
    // Both calculateViewStats calls reject → both rules fail → 2/2 ≥ 50%
    vi.mocked(calculateViewStats).mockRejectedValue(new Error("stats crash"));
    await expect(
      processViewAutomations(undefined, undefined, 100),
    ).rejects.toThrow(/2\/2 view automation rules failed/);
  });

  it("throws at exact 50% boundary (1/2 rules fail)", async () => {
    const rule1 = makeRule({
      id: 1,
      triggerType: "VIEW_METRIC_THRESHOLD",
      triggerConfig: { viewId: 10, operator: "gt", threshold: 40 },
    });
    const rule2 = makeRule({
      id: 2,
      triggerType: "VIEW_METRIC_THRESHOLD",
      triggerConfig: { viewId: 11, operator: "gt", threshold: 40 },
    });
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([rule1, rule2] as any);
    vi.mocked(prisma.analyticsView.findMany).mockResolvedValue([
      { id: 10, config: {}, title: "V1", companyId: 100 },
      { id: 11, config: {}, title: "V2", companyId: 100 },
    ] as any);
    // First rule fails, second succeeds → 1/2 = 50% ≥ 50% → should throw
    vi.mocked(calculateViewStats)
      .mockRejectedValueOnce(new Error("stats crash"))
      .mockResolvedValueOnce({ stats: { rawMetric: 50 } } as any);
    vi.mocked(createNotificationForCompany).mockResolvedValue({ success: true } as any);
    vi.mocked(prisma.automationRule.updateMany).mockResolvedValue({ count: 1 } as any);
    await expect(
      processViewAutomations(undefined, undefined, 100),
    ).rejects.toThrow(/1\/2 view automation rules failed/);
  });
});

// ─── executeRuleActions ──────────────────────────────────────────────────

describe("executeRuleActions", () => {
  describe("SEND_NOTIFICATION", () => {
    it("replaces {tableName} and record data placeholders", async () => {
      const rule = makeRule({
        actionConfig: { recipientId: 1, messageTemplate: "New in {tableName}: {name}", titleTemplate: "{tableName} alert" },
      });
      vi.mocked(createNotificationForCompany).mockResolvedValue({ success: true } as any);
      await executeRuleActions(rule, {
        tableName: "Leads",
        recordData: { name: "Acme Corp" },
        tableId: 5,
      });
      expect(createNotificationForCompany).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "New in Leads: Acme Corp",
          title: "Leads alert",
          link: "/tables/5",
        }),
      );
    });

    it("replaces {taskTitle}, {fromStatus}, {toStatus} and links to /tasks", async () => {
      const rule = makeRule({
        actionConfig: { recipientId: 1, messageTemplate: "{taskTitle}: {fromStatus} -> {toStatus}" },
      });
      vi.mocked(createNotificationForCompany).mockResolvedValue({ success: true } as any);
      await executeRuleActions(rule, { taskTitle: "My Task", fromStatus: "todo", toStatus: "done" });
      expect(createNotificationForCompany).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "My Task: todo -> done",
          link: "/tasks",
        }),
      );
    });

    it("replaces meeting placeholders and links to /meetings", async () => {
      const rule = makeRule({
        actionConfig: {
          recipientId: 1,
          messageTemplate: "{participantName} booked {meetingType}",
          titleTemplate: "Meeting by {participantName}",
        },
      });
      vi.mocked(createNotificationForCompany).mockResolvedValue({ success: true } as any);
      await executeRuleActions(rule, {
        meetingId: "m-1",
        participantName: "John",
        meetingType: "Consultation",
      });
      expect(createNotificationForCompany).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "John booked Consultation",
          title: "Meeting by John",
          link: "/meetings",
        }),
      );
    });

    it("replaces field change placeholders", async () => {
      const rule = makeRule({
        triggerType: "RECORD_FIELD_CHANGE",
        triggerConfig: { columnId: "status" },
        actionConfig: { recipientId: 1, messageTemplate: "{fieldName}: {fromValue} -> {toValue}" },
      });
      vi.mocked(createNotificationForCompany).mockResolvedValue({ success: true } as any);
      await executeRuleActions(rule, {
        oldRecordData: { status: "draft" },
        recordData: { status: "published" },
      });
      expect(createNotificationForCompany).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "status: draft -> published",
        }),
      );
    });

    it("links to /calendar when tableName is Calendar", async () => {
      const rule = makeRule({
        actionConfig: { recipientId: 1, messageTemplate: "Event!" },
      });
      vi.mocked(createNotificationForCompany).mockResolvedValue({ success: true } as any);
      await executeRuleActions(rule, { tableName: "Calendar" });
      expect(createNotificationForCompany).toHaveBeenCalledWith(
        expect.objectContaining({ link: "/calendar" }),
      );
    });

    it("skips when no recipientId", async () => {
      const rule = makeRule({ actionConfig: { messageTemplate: "test" } });
      await executeRuleActions(rule, {});
      expect(createNotificationForCompany).not.toHaveBeenCalled();
    });
  });

  describe("SEND_WHATSAPP", () => {
    it("resolves phone from meeting context", async () => {
      const rule = makeRule({
        actionType: "SEND_WHATSAPP",
        actionConfig: { phoneColumnId: "phone", content: "Hi {participantName}" },
      });
      await executeRuleActions(rule, {
        meetingId: "m-1",
        participantPhone: "0501234567",
        participantName: "Dan",
      });
      expect(inngest.send).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ phone: "0501234567" }),
        }),
      );
    });

    it("resolves phone from manual prefix", async () => {
      const rule = makeRule({
        actionType: "SEND_WHATSAPP",
        actionConfig: { phoneColumnId: "manual:0501111111", content: "Hello" },
      });
      await executeRuleActions(rule, { recordData: {} });
      expect(inngest.send).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ phone: "0501111111" }),
        }),
      );
    });

    it("falls back to direct send when Inngest fails", async () => {
      vi.mocked(inngest.send).mockRejectedValueOnce(new Error("inngest down"));
      const rule = makeRule({
        actionType: "SEND_WHATSAPP",
        actionConfig: { phoneColumnId: "manual:0501234567", content: "Test" },
      });
      const { sendGreenApiMessage } = await import("@/lib/services/green-api");
      await executeRuleActions(rule, { recordData: {} });
      expect(sendGreenApiMessage).toHaveBeenCalledWith(100, "0501234567", "Test");
    });

    it("sends media file when messageType=media", async () => {
      vi.mocked(inngest.send).mockRejectedValueOnce(new Error("inngest down"));
      vi.mocked(prisma.file.findFirst).mockResolvedValue({ url: "https://cdn.example.com/f.pdf", name: "f.pdf" } as any);
      const rule = makeRule({
        actionType: "SEND_WHATSAPP",
        actionConfig: {
          phoneColumnId: "manual:0501234567",
          content: "File",
          messageType: "media",
          mediaFileId: 42,
        },
      });
      const { sendGreenApiFile } = await import("@/lib/services/green-api");
      await executeRuleActions(rule, { recordData: {} });
      expect(sendGreenApiFile).toHaveBeenCalledWith(
        100, "0501234567", "https://cdn.example.com/f.pdf", "f.pdf", "File",
      );
    });

    it("skips when no phone resolved", async () => {
      const rule = makeRule({
        actionType: "SEND_WHATSAPP",
        actionConfig: { content: "Hello" }, // no phoneColumnId
      });
      await executeRuleActions(rule, { recordData: {} });
      expect(inngest.send).not.toHaveBeenCalled();
    });

    it("resolves phone from record column", async () => {
      const rule = makeRule({
        actionType: "SEND_WHATSAPP",
        actionConfig: { phoneColumnId: "phoneCol", content: "Hello {name}" },
      });
      await executeRuleActions(rule, {
        recordData: { phoneCol: "0509999999", name: "Dan" },
      });
      expect(inngest.send).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            phone: "0509999999",
            content: "Hello Dan",
          }),
        }),
      );
    });
  });

  describe("WEBHOOK", () => {
    it("enqueues via Inngest with dedup", async () => {
      const rule = makeRule({
        actionType: "WEBHOOK",
        actionConfig: { webhookUrl: "https://hook.example.com/x" },
      });
      await executeRuleActions(rule, { recordData: { x: 1 }, recordId: 42 });
      expect(inngest.send).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "automation/send-webhook",
          data: expect.objectContaining({ url: "https://hook.example.com/x" }),
        }),
      );
    });

    it("blocks SSRF private URLs", async () => {
      vi.mocked(isPrivateUrl).mockReturnValue(true);
      const rule = makeRule({
        actionType: "WEBHOOK",
        actionConfig: { webhookUrl: "http://169.254.169.254" },
      });
      await executeRuleActions(rule, {});
      expect(inngest.send).not.toHaveBeenCalled();
    });

    it("enriches payload with meeting data", async () => {
      vi.mocked(isPrivateUrl).mockReturnValue(false);
      const rule = makeRule({
        actionType: "WEBHOOK",
        actionConfig: { webhookUrl: "https://hook.example.com" },
      });
      await executeRuleActions(rule, {
        recordData: {},
        meetingId: "m-1",
        participantName: "Alice",
        participantEmail: "a@b.com",
      });
      const sendCall = vi.mocked(inngest.send).mock.calls[0][0] as any;
      expect(sendCall.data.payload.data.meetingId).toBe("m-1");
      expect(sendCall.data.payload.data.participantName).toBe("Alice");
    });

    it("skips when no URL", async () => {
      const rule = makeRule({
        actionType: "WEBHOOK",
        actionConfig: {},
      });
      await executeRuleActions(rule, {});
      expect(inngest.send).not.toHaveBeenCalled();
    });

    it("falls back to direct HTTP with HMAC signing when Inngest fails", async () => {
      vi.mocked(inngest.send).mockRejectedValueOnce(new Error("inngest down"));
      vi.mocked(prisma.$queryRaw).mockResolvedValueOnce(
        [{ webhookSigningSecret: "test-secret-hex" }] as any,
      );

      const origFetch = globalThis.fetch;
      const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      globalThis.fetch = mockFetch as any;

      const rule = makeRule({
        actionType: "WEBHOOK",
        actionConfig: { webhookUrl: "https://hook.example.com/x" },
      });

      try {
        await executeRuleActions(rule, { recordData: { x: 1 }, recordId: 42 });
        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(mockFetch).toHaveBeenCalledWith(
          "https://hook.example.com/x",
          expect.objectContaining({
            method: "POST",
            headers: expect.objectContaining({
              "Content-Type": "application/json",
              "X-Webhook-Signature": expect.stringMatching(/^sha256=/),
              "X-Webhook-Timestamp": expect.any(String),
            }),
            redirect: "error",
          }),
        );
        // Verify payload structure
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body).toEqual(
          expect.objectContaining({
            ruleId: 1,
            companyId: 100,
            data: expect.objectContaining({ recordId: 42 }),
          }),
        );
      } finally {
        globalThis.fetch = origFetch;
      }
    });

    it("blocks fallback when SSRF re-check detects private URL after Inngest failure", async () => {
      vi.mocked(inngest.send).mockRejectedValueOnce(new Error("inngest down"));
      vi.mocked(isPrivateUrl)
        .mockReturnValueOnce(false) // First check: not private (allows Inngest attempt)
        .mockReturnValueOnce(true); // Fallback check: private (blocks direct send)
      const rule = makeRule({
        actionType: "WEBHOOK",
        actionConfig: { webhookUrl: "https://hook.example.com" },
      });

      const origFetch = globalThis.fetch;
      const mockFetch = vi.fn();
      globalThis.fetch = mockFetch as any;

      try {
        await executeRuleActions(rule, { recordData: {} });
        // Fallback should be blocked — fetch should NOT be called
        expect(mockFetch).not.toHaveBeenCalled();
      } finally {
        globalThis.fetch = origFetch;
      }
    });
  });

  describe("CALCULATE_DURATION", () => {
    it("handles task status context", async () => {
      const rule = makeRule({
        actionType: "CALCULATE_DURATION",
        actionConfig: {},
        triggerType: "TASK_STATUS_CHANGE",
        triggerConfig: {},
      });
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue([
        { diffJson: { status: { to: "todo" } }, timestamp: new Date(Date.now() - 60000) },
      ] as any);
      vi.mocked(prisma.task.update).mockResolvedValue({} as any);
      await executeRuleActions(rule, { taskId: "t1", fromStatus: "todo", toStatus: "done" });
      expect(prisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "t1", companyId: 100 },
          data: expect.objectContaining({
            duration_status_change: expect.stringMatching(/^\d+d \d+h \d+m\|->$/),
          }),
        }),
      );
    });

    it("handles direct dial context with previous dial", async () => {
      const rule = makeRule({
        actionType: "CALCULATE_DURATION",
        actionConfig: {},
        triggerType: "DIRECT_DIAL",
      });
      await executeRuleActions(rule, {
        recordId: 10,
        previousDialedAt: new Date(Date.now() - 3600000).toISOString(),
      });
      expect(prisma.statusDuration.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fromValue: "חיוג קודם",
            toValue: "חיוג נוכחי",
          }),
        }),
      );
    });

    it("handles direct dial context with record created (no previous dial)", async () => {
      const rule = makeRule({
        actionType: "CALCULATE_DURATION",
        actionConfig: {},
        triggerType: "DIRECT_DIAL",
      });
      await executeRuleActions(rule, {
        recordId: 10,
        recordCreatedAt: new Date(Date.now() - 7200000).toISOString(),
      });
      expect(prisma.statusDuration.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fromValue: "יצירת רשומה",
            toValue: "חיוג ראשון",
          }),
        }),
      );
    });

    it("returns early when no previousDialedAt and no recordCreatedAt for direct dial", async () => {
      const rule = makeRule({
        actionType: "CALCULATE_DURATION",
        actionConfig: {},
        triggerType: "DIRECT_DIAL",
      });
      await executeRuleActions(rule, { recordId: 10 });
      expect(prisma.statusDuration.create).not.toHaveBeenCalled();
    });

    it("handles record field change context via calculateRecordDuration", async () => {
      const rule = makeRule({
        actionType: "CALCULATE_DURATION",
        actionConfig: {},
        triggerType: "RECORD_FIELD_CHANGE",
        triggerConfig: { columnId: "status" },
      });
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue([
        {
          diffJson: { status: "active" },
          timestamp: new Date(Date.now() - 120000),
          action: "UPDATE",
          recordId: 42,
        },
      ] as any);
      await executeRuleActions(rule, {
        recordId: 42,
        oldRecordData: { status: "active" },
        recordData: { status: "closed" },
      });
      expect(prisma.statusDuration.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            automationRuleId: 1,
            recordId: 42,
            companyId: 100,
            fromValue: "active",
            toValue: "closed",
            durationSeconds: expect.any(Number),
          }),
        }),
      );
      // Verify companyId is used in audit log query (tenant isolation)
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: 100 }),
        }),
      );
    });

    it("returns early when companyId is 0 (calculateTaskDuration guard)", async () => {
      const rule = makeRule({
        actionType: "CALCULATE_DURATION",
        actionConfig: {},
        triggerType: "TASK_STATUS_CHANGE",
        triggerConfig: {},
        companyId: 0,
      });
      await executeRuleActions(rule, { taskId: "t1", fromStatus: "todo", toStatus: "done" });
      expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
    });

    it("returns early when companyId is 0 (calculateRecordDuration guard)", async () => {
      const rule = makeRule({
        actionType: "CALCULATE_DURATION",
        actionConfig: {},
        triggerType: "RECORD_FIELD_CHANGE",
        triggerConfig: { columnId: "status" },
        companyId: 0,
      });
      await executeRuleActions(rule, {
        recordId: 42,
        oldRecordData: { status: "active" },
        recordData: { status: "closed" },
      });
      expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
    });

    it("handles record field change with only CREATE log available", async () => {
      const rule = makeRule({
        actionType: "CALCULATE_DURATION",
        actionConfig: {},
        triggerType: "RECORD_FIELD_CHANGE",
        triggerConfig: { columnId: "status" },
      });
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue([
        {
          diffJson: { status: "new" },
          timestamp: new Date(Date.now() - 300000),
          action: "CREATE",
          recordId: 42,
        },
      ] as any);
      await executeRuleActions(rule, {
        recordId: 42,
        oldRecordData: { status: "new" },
        recordData: { status: "closed" },
      });
      expect(prisma.statusDuration.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fromValue: "new",
            toValue: "closed",
            companyId: 100,
          }),
        }),
      );
    });
  });

  describe("ADD_TO_NURTURE_LIST", () => {
    it("maps fields from record data", async () => {
      const rule = makeRule({
        actionType: "ADD_TO_NURTURE_LIST",
        actionConfig: {
          listId: "hot-leads",
          mapping: { name: "fullName", email: "emailAddr", phone: "phoneNum" },
        },
      });
      vi.mocked(prisma.nurtureList.findUnique).mockResolvedValue({ id: 1 } as any);
      vi.mocked(prisma.nurtureSubscriber.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.nurtureSubscriber.create).mockResolvedValue({} as any);
      await executeRuleActions(rule, {
        recordData: { fullName: "John", emailAddr: "j@x.com", phoneNum: "050" },
        recordId: 10,
      });
      expect(prisma.nurtureSubscriber.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: "John", email: "j@x.com", phone: "050" }),
        }),
      );
    });

    it("handles P2002 race on subscriber creation", async () => {
      const rule = makeRule({
        actionType: "ADD_TO_NURTURE_LIST",
        actionConfig: {
          listId: "hot-leads",
          mapping: { name: "fullName", email: "emailAddr" },
        },
      });
      vi.mocked(prisma.nurtureList.findUnique).mockResolvedValue({ id: 1 } as any);
      vi.mocked(prisma.nurtureSubscriber.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.nurtureSubscriber.create).mockRejectedValue(
        Object.assign(new Error("dup"), { code: "P2002" }),
      );
      // Should not throw — P2002 is handled gracefully
      await executeRuleActions(rule, {
        recordData: { fullName: "John", emailAddr: "j@x.com" },
        recordId: 10,
      });
      expect(prisma.nurtureSubscriber.create).toHaveBeenCalled();
    });

    it("skips when both email and phone are empty", async () => {
      const rule = makeRule({
        actionType: "ADD_TO_NURTURE_LIST",
        actionConfig: { listId: "list", mapping: { name: "n" } },
      });
      await executeRuleActions(rule, { recordData: { n: "Test" }, recordId: 1 });
      expect(prisma.nurtureList.findUnique).not.toHaveBeenCalled();
    });

    it("handles P2002 race on list creation and still creates subscriber", async () => {
      const rule = makeRule({
        actionType: "ADD_TO_NURTURE_LIST",
        actionConfig: {
          listId: "hot-leads",
          mapping: { name: "fullName", email: "emailAddr" },
        },
      });
      vi.mocked(prisma.nurtureList.findUnique)
        .mockResolvedValueOnce(null) // First: list doesn't exist
        .mockResolvedValueOnce({ id: 1 } as any); // Second: re-fetch after P2002
      vi.mocked(prisma.nurtureList.create).mockRejectedValue(
        Object.assign(new Error("dup"), { code: "P2002" }),
      );
      vi.mocked(prisma.nurtureSubscriber.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.nurtureSubscriber.create).mockResolvedValue({} as any);
      await executeRuleActions(rule, {
        recordData: { fullName: "John", emailAddr: "j@x.com" },
        recordId: 10,
      });
      // Verify subscriber was created despite list P2002 race
      expect(prisma.nurtureSubscriber.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: "John", email: "j@x.com" }),
        }),
      );
    });
  });

  describe("UPDATE_RECORD_FIELD", () => {
    it("uses serializable transaction", async () => {
      const rule = makeRule({
        actionType: "UPDATE_RECORD_FIELD",
        actionConfig: { columnId: "status", value: "closed" },
      });
      mockTx.record.findFirst.mockResolvedValue({ id: 10, data: { status: "open" } });
      mockTx.record.update.mockResolvedValue({});
      await executeRuleActions(rule, { recordId: 10 });
      expect(prisma.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({ isolationLevel: "Serializable" }),
      );
    });

    it("retries P2034 serialization conflict up to 2 times", async () => {
      const rule = makeRule({
        actionType: "UPDATE_RECORD_FIELD",
        actionConfig: { columnId: "status", value: "closed" },
      });
      const p2034Error = Object.assign(new Error("serialization"), { code: "P2034" });
      vi.mocked(prisma.$transaction)
        .mockRejectedValueOnce(p2034Error)
        .mockRejectedValueOnce(p2034Error)
        .mockImplementationOnce(async (fn: any) => {
          mockTx.record.findFirst.mockResolvedValue({ id: 10, data: {} });
          mockTx.record.update.mockResolvedValue({});
          return fn(mockTx);
        });
      await executeRuleActions(rule, { recordId: 10 });
      expect(prisma.$transaction).toHaveBeenCalledTimes(3);
    });

    it("rethrows non-P2034 errors", async () => {
      const rule = makeRule({
        actionType: "UPDATE_RECORD_FIELD",
        actionConfig: { columnId: "status", value: "closed" },
      });
      vi.mocked(prisma.$transaction).mockRejectedValue(new Error("some other error"));
      await expect(executeRuleActions(rule, { recordId: 10 })).rejects.toThrow("some other error");
    });
  });

  describe("CREATE_TASK", () => {
    it("replaces template placeholders in title and description", async () => {
      const rule = makeRule({
        actionType: "CREATE_TASK",
        actionConfig: { title: "Follow up {tableName}", description: "For {name}" },
      });
      vi.mocked(prisma.task.create).mockResolvedValue({} as any);
      await executeRuleActions(rule, {
        tableName: "Leads",
        recordData: { name: "Acme" },
      });
      const call = vi.mocked(prisma.task.create).mock.calls[0][0] as any;
      expect(call.data.title).toBe("Follow up Leads");
      expect(call.data.description).toBe("For Acme");
    });

    it("validates assignee belongs to same company", async () => {
      const rule = makeRule({
        actionType: "CREATE_TASK",
        actionConfig: { title: "Task", assigneeId: 999 },
      });
      vi.mocked(prisma.user.findFirst).mockResolvedValue(null); // not in company
      vi.mocked(prisma.task.create).mockResolvedValue({} as any);
      await executeRuleActions(rule, {});
      const call = vi.mocked(prisma.task.create).mock.calls[0][0] as any;
      expect(call.data.assigneeId).toBeNull();
    });

    it("calculates dueDate from dueDays", async () => {
      const rule = makeRule({
        actionType: "CREATE_TASK",
        actionConfig: { title: "T", dueDays: 3 },
      });
      vi.mocked(prisma.task.create).mockResolvedValue({} as any);
      await executeRuleActions(rule, {});
      const call = vi.mocked(prisma.task.create).mock.calls[0][0] as any;
      expect(call.data.dueDate).toBeInstanceOf(Date);
    });

    it("gracefully handles task creation error", async () => {
      const rule = makeRule({
        actionType: "CREATE_TASK",
        actionConfig: { title: "T" },
      });
      vi.mocked(prisma.task.create).mockRejectedValue(new Error("fail"));
      // Should not throw — error is caught internally
      await executeRuleActions(rule, {});
      // Verify the task creation was actually attempted
      expect(prisma.task.create).toHaveBeenCalled();
    });
  });

  describe("CREATE_RECORD", () => {
    it("validates table belongs to same company", async () => {
      const rule = makeRule({
        actionType: "CREATE_RECORD",
        actionConfig: { tableId: 5, fieldMappings: [] },
      });
      vi.mocked(prisma.tableMeta.findFirst).mockResolvedValue(null); // not in company
      await executeRuleActions(rule, {});
      expect(prisma.record.create).not.toHaveBeenCalled();
    });

    it("builds field mappings from config", async () => {
      const rule = makeRule({
        actionType: "CREATE_RECORD",
        actionConfig: {
          tableId: 5,
          fieldMappings: [
            { columnId: "name", value: "Test {tableName}" },
            { columnId: "status", value: "new" },
          ],
        },
      });
      vi.mocked(prisma.tableMeta.findFirst).mockResolvedValue({ id: 5 } as any);
      vi.mocked(prisma.record.create).mockResolvedValue({} as any);
      await executeRuleActions(rule, { tableName: "Leads" });
      const call = vi.mocked(prisma.record.create).mock.calls[0][0] as any;
      expect(call.data.data.name).toBe("Test Leads");
      expect(call.data.data.status).toBe("new");
    });

    it("retries without createdBy on P2003 FK error", async () => {
      const rule = makeRule({
        actionType: "CREATE_RECORD",
        actionConfig: { tableId: 5, fieldMappings: [] },
      });
      vi.mocked(prisma.tableMeta.findFirst).mockResolvedValue({ id: 5 } as any);
      vi.mocked(prisma.record.create)
        .mockRejectedValueOnce(Object.assign(new Error("FK"), { code: "P2003" }))
        .mockResolvedValueOnce({} as any);
      await executeRuleActions(rule, {});
      expect(prisma.record.create).toHaveBeenCalledTimes(2);
      const secondCall = vi.mocked(prisma.record.create).mock.calls[1][0] as any;
      expect(secondCall.data.createdBy).toBeNull();
    });

    it("returns early when no tableId specified", async () => {
      const rule = makeRule({
        actionType: "CREATE_RECORD",
        actionConfig: { fieldMappings: [] },
      });
      await executeRuleActions(rule, {});
      expect(prisma.record.create).not.toHaveBeenCalled();
      expect(prisma.tableMeta.findFirst).not.toHaveBeenCalled();
    });

    it("does not retry non-FK errors from record.create", async () => {
      const rule = makeRule({
        actionType: "CREATE_RECORD",
        actionConfig: { tableId: 5, fieldMappings: [] },
      });
      vi.mocked(prisma.tableMeta.findFirst).mockResolvedValue({ id: 5 } as any);
      vi.mocked(prisma.record.create).mockRejectedValue(Object.assign(new Error("other"), { code: "P9999" }));
      // CREATE_RECORD catches errors internally so it shouldn't throw
      await executeRuleActions(rule, {});
      // Should have attempted create only once (no retry for non-FK errors)
      expect(prisma.record.create).toHaveBeenCalledTimes(1);
    });
  });

  describe("CREATE_CALENDAR_EVENT", () => {
    it("creates event with offset-based start/end times", async () => {
      const rule = makeRule({
        actionType: "CREATE_CALENDAR_EVENT",
        actionConfig: {
          title: "Event",
          startOffset: 1,
          startOffsetUnit: "hours",
          endOffset: 2,
          endOffsetUnit: "hours",
        },
      });
      vi.mocked(prisma.calendarEvent.create).mockResolvedValue({} as any);
      await executeRuleActions(rule, {});
      const call = vi.mocked(prisma.calendarEvent.create).mock.calls[0][0] as any;
      expect(call.data.startTime).toBeInstanceOf(Date);
      expect(call.data.endTime).toBeInstanceOf(Date);
      expect(call.data.endTime.getTime()).toBeGreaterThan(call.data.startTime.getTime());
    });

    it("uses minutes offset unit for start time", async () => {
      const rule = makeRule({
        actionType: "CREATE_CALENDAR_EVENT",
        actionConfig: {
          title: "Quick Event",
          startOffset: 30,
          startOffsetUnit: "minutes",
          endOffset: 1,
          endOffsetUnit: "hours",
        },
      });
      vi.mocked(prisma.calendarEvent.create).mockResolvedValue({} as any);
      const before = Date.now();
      await executeRuleActions(rule, {});
      const call = vi.mocked(prisma.calendarEvent.create).mock.calls[0][0] as any;
      const startTime = call.data.startTime as Date;
      const endTime = call.data.endTime as Date;
      // Start should be ~30 minutes from now (minutes offset, not days)
      const offsetMs = startTime.getTime() - before;
      expect(offsetMs).toBeGreaterThan(29 * 60 * 1000);
      expect(offsetMs).toBeLessThan(31 * 60 * 1000);
      // End should be 1 hour after start
      expect(endTime.getTime() - startTime.getTime()).toBe(60 * 60 * 1000);
    });

    it("uses default color #4f95ff", async () => {
      const rule = makeRule({
        actionType: "CREATE_CALENDAR_EVENT",
        actionConfig: { title: "Ev" },
      });
      vi.mocked(prisma.calendarEvent.create).mockResolvedValue({} as any);
      await executeRuleActions(rule, {});
      const call = vi.mocked(prisma.calendarEvent.create).mock.calls[0][0] as any;
      expect(call.data.color).toBe("#4f95ff");
    });

    it("uses default days offset when no startOffsetUnit specified", async () => {
      const rule = makeRule({
        actionType: "CREATE_CALENDAR_EVENT",
        actionConfig: {
          title: "Event",
          startOffset: 2, // 2 days from now
          endOffset: 1,
        },
      });
      vi.mocked(prisma.calendarEvent.create).mockResolvedValue({} as any);
      const before = Date.now();
      await executeRuleActions(rule, {});
      const call = vi.mocked(prisma.calendarEvent.create).mock.calls[0][0] as any;
      const startTime = call.data.startTime as Date;
      // Start should be ~2 days from now (default days offset)
      const offsetMs = startTime.getTime() - before;
      const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
      expect(offsetMs).toBeGreaterThan(twoDaysMs - 1000);
      expect(offsetMs).toBeLessThan(twoDaysMs + 1000);
    });
  });

  describe("MULTI_ACTION", () => {
    it("executes actions sequentially", async () => {
      const order: string[] = [];
      vi.mocked(createNotificationForCompany).mockImplementation(async () => {
        order.push("notif");
        return { success: true } as any;
      });
      vi.mocked(prisma.task.create).mockImplementation(async () => {
        order.push("task");
        return {} as any;
      });
      const rule = makeRule({
        actionType: "MULTI_ACTION",
        actionConfig: {
          actions: [
            { type: "SEND_NOTIFICATION", config: { recipientId: 1, messageTemplate: "Hi" } },
            { type: "CREATE_TASK", config: { title: "Do" } },
          ],
        },
      });
      await executeRuleActions(rule, {});
      expect(order).toEqual(["notif", "task"]);
    });

    it("continues after failure and throws aggregate error", async () => {
      vi.mocked(createNotificationForCompany).mockRejectedValue(new Error("notif fail"));
      vi.mocked(prisma.task.create).mockResolvedValue({} as any);
      const rule = makeRule({
        actionType: "MULTI_ACTION",
        actionConfig: {
          actions: [
            { type: "SEND_NOTIFICATION", config: { recipientId: 1 } },
            { type: "CREATE_TASK", config: { title: "T" } },
          ],
        },
      });
      await expect(executeRuleActions(rule, {})).rejects.toThrow("MULTI_ACTION: 1/2 action(s) failed");
      // CREATE_TASK should still have been called
      expect(prisma.task.create).toHaveBeenCalled();
    });

    it("rejects >50 actions", async () => {
      const rule = makeRule({
        actionType: "MULTI_ACTION",
        actionConfig: {
          actions: Array.from({ length: 51 }, () => ({ type: "SEND_NOTIFICATION", config: {} })),
        },
      });
      await executeRuleActions(rule, {});
      // Should have returned early — no notifications sent
      expect(createNotificationForCompany).not.toHaveBeenCalled();
    });

    it("handles empty actions array", async () => {
      const rule = makeRule({
        actionType: "MULTI_ACTION",
        actionConfig: { actions: [] },
      });
      await executeRuleActions(rule, {});
      expect(createNotificationForCompany).not.toHaveBeenCalled();
    });
  });
});

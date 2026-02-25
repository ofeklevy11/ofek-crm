import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

vi.mock("@/lib/prisma", () => ({
  prisma: {
    automationRule: { findMany: vi.fn() },
    automationLog: { create: vi.fn(), delete: vi.fn() },
  },
}));

vi.mock("@/app/actions/automations-core", () => ({
  executeRuleActions: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  }),
}));

import { processEventAutomations } from "@/app/actions/event-automations-core";
import { prisma } from "@/lib/prisma";
import { executeRuleActions } from "@/app/actions/automations-core";

const CRON_SECRET = "test-cron-secret-value-32chars!!";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = CRON_SECRET;
});

// Helper to create a rule with a calendar event whose trigger time has already passed
const makeEventRule = (
  id: number,
  eventId: string,
  overrides: Record<string, any> = {},
) => {
  const pastEvent = new Date(Date.now() + 10 * 60 * 1000); // 10 min from now
  return {
    id,
    companyId: 100,
    actionType: "SEND_NOTIFICATION",
    actionConfig: {},
    triggerType: "EVENT_TIME",
    triggerConfig: { minutesBefore: 30 }, // 30 min before = trigger 20 min ago
    calendarEventId: eventId,
    calendarEvent: {
      id: eventId,
      title: `Meeting ${id}`,
      description: "",
      startTime: pastEvent,
      endTime: new Date(pastEvent.getTime() + 60 * 60 * 1000),
    },
    executedLogs: [],
    ...overrides,
  };
};

describe("processEventAutomations", () => {
  // ─── Auth ─────────────────────────────────────────────────────────────

  it("throws when no CRON_SECRET env var", async () => {
    delete process.env.CRON_SECRET;
    await expect(processEventAutomations(1, "token")).rejects.toThrow(
      "Unauthorized",
    );
  });

  it("throws when no internal token provided", async () => {
    await expect(processEventAutomations(1)).rejects.toThrow("Unauthorized");
  });

  it("throws when token length doesn't match secret", async () => {
    await expect(processEventAutomations(1, "short")).rejects.toThrow(
      "Unauthorized",
    );
  });

  it("throws when token content doesn't match secret (timing-safe)", async () => {
    const wrongToken = "x".repeat(CRON_SECRET.length);
    await expect(processEventAutomations(1, wrongToken)).rejects.toThrow(
      "Unauthorized",
    );
  });

  // ─── companyId guard ──────────────────────────────────────────────────

  it("throws when companyId is undefined", async () => {
    await expect(
      processEventAutomations(undefined, CRON_SECRET),
    ).rejects.toThrow("companyId is required");
  });

  it("throws when companyId is 0", async () => {
    await expect(processEventAutomations(0, CRON_SECRET)).rejects.toThrow(
      "companyId is required",
    );
  });

  // ─── Early return ─────────────────────────────────────────────────────

  it("returns early when no rules found", async () => {
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([]);
    await processEventAutomations(100, CRON_SECRET);
    expect(executeRuleActions).not.toHaveBeenCalled();
  });

  // ─── Trigger time filtering ───────────────────────────────────────────

  it("skips rules where trigger time has not yet passed", async () => {
    const futureEvent = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours from now
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([
      {
        id: 1,
        companyId: 100,
        actionType: "SEND_NOTIFICATION",
        actionConfig: {},
        triggerType: "EVENT_TIME",
        triggerConfig: { minutesBefore: 30 }, // trigger 1.5h from now — not yet
        calendarEventId: "evt-1",
        calendarEvent: {
          id: "evt-1",
          title: "Meeting",
          description: "Desc",
          startTime: futureEvent,
          endTime: new Date(futureEvent.getTime() + 30 * 60 * 1000),
        },
        executedLogs: [],
      },
    ] as any);
    await processEventAutomations(100, CRON_SECRET);
    expect(executeRuleActions).not.toHaveBeenCalled();
  });

  it("executes rules where trigger time has passed", async () => {
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([
      makeEventRule(1, "evt-1"),
    ] as any);
    vi.mocked(prisma.automationLog.create).mockResolvedValue({} as any);
    vi.mocked(executeRuleActions).mockResolvedValue(undefined);
    await processEventAutomations(100, CRON_SECRET);
    expect(prisma.automationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          automationRuleId: 1,
          calendarEventId: "evt-1",
          companyId: 100,
        }),
      }),
    );
    expect(executeRuleActions).toHaveBeenCalled();
  });

  // ─── Already executed ─────────────────────────────────────────────────

  it("skips already executed rules", async () => {
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([
      makeEventRule(1, "evt-1", {
        executedLogs: [{ calendarEventId: "evt-1" }],
      }),
    ] as any);
    await processEventAutomations(100, CRON_SECRET);
    expect(executeRuleActions).not.toHaveBeenCalled();
  });

  // ─── Null calendarEvent ───────────────────────────────────────────────

  it("skips rules with no calendarEvent", async () => {
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([
      makeEventRule(1, "evt-1", { calendarEvent: null }),
    ] as any);
    await processEventAutomations(100, CRON_SECRET);
    expect(executeRuleActions).not.toHaveBeenCalled();
  });

  // ─── P2002 dedup claim ────────────────────────────────────────────────

  it("skips rule when P2002 indicates another worker claimed it", async () => {
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([
      makeEventRule(1, "evt-1"),
    ] as any);
    vi.mocked(prisma.automationLog.create).mockRejectedValue(
      Object.assign(new Error("dup"), { code: "P2002" }),
    );
    await processEventAutomations(100, CRON_SECRET);
    expect(executeRuleActions).not.toHaveBeenCalled();
  });

  it("rethrows non-P2002 errors from log creation", async () => {
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([
      makeEventRule(1, "evt-1"),
    ] as any);
    vi.mocked(prisma.automationLog.create).mockRejectedValue(
      new Error("DB down"),
    );
    await expect(
      processEventAutomations(100, CRON_SECRET),
    ).rejects.toThrow("1/1 event rules failed");
  });

  // ─── Rollback on failure ──────────────────────────────────────────────

  it("deletes automation log on execution failure (rollback)", async () => {
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([
      makeEventRule(1, "evt-1"),
    ] as any);
    vi.mocked(prisma.automationLog.create).mockResolvedValue({} as any);
    vi.mocked(executeRuleActions).mockRejectedValue(
      new Error("exec failed"),
    );
    vi.mocked(prisma.automationLog.delete).mockResolvedValue({} as any);
    // 1/1 = 100% >= 50% → should throw
    await expect(
      processEventAutomations(100, CRON_SECRET),
    ).rejects.toThrow("1/1 event rules failed");
    // Verify rollback — log was deleted
    expect(prisma.automationLog.delete).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          automationRuleId_calendarEventId: {
            automationRuleId: 1,
            calendarEventId: "evt-1",
          },
        },
      }),
    );
  });

  // ─── Rollback cleanup error ──────────────────────────────────────────

  it("still throws original error when rollback cleanup fails", async () => {
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([
      makeEventRule(1, "evt-1"),
    ] as any);
    vi.mocked(prisma.automationLog.create).mockResolvedValue({} as any);
    vi.mocked(executeRuleActions).mockRejectedValue(
      new Error("original exec error"),
    );
    // Cleanup (log delete) also fails
    vi.mocked(prisma.automationLog.delete).mockRejectedValue(
      new Error("cleanup failed"),
    );
    // Should still throw the outer error (original exec error wrapped in threshold message)
    const thrownError = await processEventAutomations(100, CRON_SECRET).catch(
      (e: Error) => e,
    );
    expect(thrownError).toBeInstanceOf(Error);
    expect(thrownError.message).toContain("1/1 event rules failed");
    // The thrown error should be the ORIGINAL threshold error, NOT the cleanup error
    expect(thrownError.message).not.toContain("cleanup");
    // Verify cleanup was attempted
    expect(prisma.automationLog.delete).toHaveBeenCalled();
  });

  // ─── 50% failure threshold ────────────────────────────────────────────

  it("does not throw when less than 50% of rules fail", async () => {
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([
      makeEventRule(1, "evt-1"),
      makeEventRule(2, "evt-2"),
      makeEventRule(3, "evt-3"),
    ] as any);
    vi.mocked(prisma.automationLog.create).mockResolvedValue({} as any);
    vi.mocked(prisma.automationLog.delete).mockResolvedValue({} as any);
    vi.mocked(executeRuleActions)
      .mockRejectedValueOnce(new Error("fail")) // 1/3 = 33% < 50%
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);
    // Should not throw
    await processEventAutomations(100, CRON_SECRET);
  });

  it("throws when >= 50% of rules fail", async () => {
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([
      makeEventRule(1, "evt-1"),
      makeEventRule(2, "evt-2"),
    ] as any);
    vi.mocked(prisma.automationLog.create).mockResolvedValue({} as any);
    vi.mocked(prisma.automationLog.delete).mockResolvedValue({} as any);
    vi.mocked(executeRuleActions).mockRejectedValue(new Error("fail"));
    await expect(
      processEventAutomations(100, CRON_SECRET),
    ).rejects.toThrow("2/2 event rules failed");
  });

  // ─── Event record data ────────────────────────────────────────────────

  it("passes event record data with correct fields to executeRuleActions", async () => {
    const eventStart = new Date("2025-06-15T10:00:00Z");
    const eventEnd = new Date("2025-06-15T11:00:00Z");
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([
      {
        id: 1,
        companyId: 100,
        actionType: "SEND_NOTIFICATION",
        actionConfig: {},
        triggerType: "EVENT_TIME",
        triggerConfig: { minutesBefore: 0 },
        calendarEventId: "evt-1",
        calendarEvent: {
          id: "evt-1",
          title: "Team Sync",
          description: "Weekly sync",
          startTime: eventStart,
          endTime: eventEnd,
        },
        executedLogs: [],
      },
    ] as any);
    vi.mocked(prisma.automationLog.create).mockResolvedValue({} as any);
    vi.mocked(executeRuleActions).mockResolvedValue(undefined);
    await processEventAutomations(100, CRON_SECRET);
    expect(executeRuleActions).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1 }),
      expect.objectContaining({
        recordData: expect.objectContaining({
          title: "Team Sync",
          description: "Weekly sync",
          taskTitle: "Team Sync",
          eventTitle: "Team Sync",
        }),
        tableName: "Calendar",
      }),
    );
  });
});

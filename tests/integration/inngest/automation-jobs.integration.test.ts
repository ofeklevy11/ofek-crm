import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { createMockStep, createMockEvent } from "../helpers/inngest-test-utils";

// ── Capture Inngest handlers ───────────────────────────────────────
const handlers: Record<string, (...args: any[]) => any> = {};
const mockSend = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    send: mockSend,
    createFunction: vi.fn((config: any, _trigger: any, handler: any) => {
      handlers[config.id] = handler;
      return { id: config.id, fn: handler };
    }),
  },
}));

// ── Mock action modules (dynamically imported by handlers) ─────────
const mockProcessNewRecordTrigger = vi.fn().mockResolvedValue(undefined);
const mockProcessRecordUpdate = vi.fn().mockResolvedValue(undefined);
const mockProcessTaskStatusChange = vi.fn().mockResolvedValue(undefined);
const mockProcessDirectDialTrigger = vi.fn().mockResolvedValue(undefined);
const mockProcessTimeBasedAutomations = vi.fn().mockResolvedValue(undefined);

vi.mock("@/app/actions/automations-core", () => ({
  processNewRecordTrigger: (...args: any[]) => mockProcessNewRecordTrigger(...args),
  processRecordUpdate: (...args: any[]) => mockProcessRecordUpdate(...args),
  processTaskStatusChange: (...args: any[]) => mockProcessTaskStatusChange(...args),
  processDirectDialTrigger: (...args: any[]) => mockProcessDirectDialTrigger(...args),
  processTimeBasedAutomations: (...args: any[]) => mockProcessTimeBasedAutomations(...args),
}));

const mockProcessEventAutomations = vi.fn().mockResolvedValue(undefined);
vi.mock("@/app/actions/event-automations-core", () => ({
  processEventAutomations: (...args: any[]) => mockProcessEventAutomations(...args),
}));

const mockProcessMeetingReminders = vi.fn().mockResolvedValue(undefined);
vi.mock("@/app/actions/meeting-automations", () => ({
  processMeetingReminders: (...args: any[]) => mockProcessMeetingReminders(...args),
}));

vi.mock("@/lib/env", () => ({
  env: { CRON_SECRET: "test-cron-secret" },
}));

// ── Import to register handlers ────────────────────────────────────
import { inngest } from "@/lib/inngest/client";

beforeAll(async () => {
  await import("@/lib/inngest/functions/automation-jobs");
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ──────────────────────────────────────────────────────────

describe("processNewRecordAutomation", () => {
  it("calls processNewRecordTrigger with correct args", async () => {
    const event = createMockEvent("automation/new-record", {
      tableId: 1,
      tableName: "Leads",
      recordId: 42,
      companyId: 5,
    });

    const result = await handlers["process-new-record-automation"]({ event });

    expect(mockProcessNewRecordTrigger).toHaveBeenCalledWith(1, "Leads", 42, 5);
    expect(result).toEqual({ success: true, recordId: 42 });
  });

  it("triggers analytics refresh when companyId is present", async () => {
    const event = createMockEvent("automation/new-record", {
      tableId: 1,
      tableName: "T",
      recordId: 1,
      companyId: 10,
    });

    await handlers["process-new-record-automation"]({ event });

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "analytics/refresh-company",
        data: { companyId: 10 },
      }),
    );
  });

  it("does not trigger analytics refresh when companyId is falsy", async () => {
    const event = createMockEvent("automation/new-record", {
      tableId: 1,
      tableName: "T",
      recordId: 1,
      companyId: 0,
    });

    await handlers["process-new-record-automation"]({ event });

    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe("processRecordUpdateAutomation", () => {
  it("calls processRecordUpdate with correct args", async () => {
    const event = createMockEvent("automation/record-update", {
      tableId: 2,
      recordId: 99,
      oldData: { a: 1 },
      newData: { a: 2 },
      companyId: 3,
      tableName: "Deals",
    });

    const result = await handlers["process-record-update-automation"]({ event });

    expect(mockProcessRecordUpdate).toHaveBeenCalledWith(2, 99, { a: 1 }, { a: 2 }, 3, "Deals");
    expect(result).toEqual({ success: true, recordId: 99 });
  });

  it("triggers analytics refresh when companyId is present", async () => {
    const event = createMockEvent("automation/record-update", {
      tableId: 2,
      recordId: 99,
      oldData: {},
      newData: {},
      companyId: 7,
      tableName: "Deals",
    });

    await handlers["process-record-update-automation"]({ event });

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "analytics/refresh-company",
        data: { companyId: 7 },
      }),
    );
  });
});

describe("processTaskStatusAutomation", () => {
  it("calls processTaskStatusChange with correct args", async () => {
    const event = createMockEvent("automation/task-status-change", {
      taskId: "task-7",
      taskTitle: "Fix bug",
      fromStatus: "todo",
      toStatus: "in_progress",
      companyId: 1,
    });

    const result = await handlers["process-task-status-automation"]({ event });

    expect(mockProcessTaskStatusChange).toHaveBeenCalledWith("task-7", "Fix bug", "todo", "in_progress", 1);
    expect(result).toEqual({ success: true, taskId: "task-7" });
  });

  it("triggers analytics refresh when companyId is present", async () => {
    const event = createMockEvent("automation/task-status-change", {
      taskId: "task-7",
      taskTitle: "Fix bug",
      fromStatus: "todo",
      toStatus: "done",
      companyId: 4,
    });

    await handlers["process-task-status-automation"]({ event });

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "analytics/refresh-company",
        data: { companyId: 4 },
      }),
    );
  });
});

describe("processDirectDialAutomation", () => {
  it("calls processDirectDialTrigger with correct args", async () => {
    const event = createMockEvent("automation/direct-dial", {
      tableId: 4,
      recordId: 55,
      companyId: 2,
      previousDialedAt: "2025-01-01T00:00:00Z",
    });

    const result = await handlers["process-direct-dial-automation"]({ event });

    expect(mockProcessDirectDialTrigger).toHaveBeenCalledWith(4, 55, 2, "2025-01-01T00:00:00Z");
    expect(result).toEqual({ success: true, recordId: 55 });
  });

  it("triggers analytics refresh when companyId is present", async () => {
    const event = createMockEvent("automation/direct-dial", {
      tableId: 4,
      recordId: 55,
      companyId: 6,
      previousDialedAt: null,
    });

    await handlers["process-direct-dial-automation"]({ event });

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "analytics/refresh-company",
        data: { companyId: 6 },
      }),
    );
  });
});

describe("processTimeBasedAutomationJob", () => {
  it("calls processTimeBasedAutomations with companyId", async () => {
    const event = createMockEvent("automation/time-based", { companyId: 8 });

    const result = await handlers["process-time-based-automation"]({ event });

    expect(mockProcessTimeBasedAutomations).toHaveBeenCalledWith(8);
    expect(result).toEqual({ success: true, companyId: 8 });
  });

  it("does not trigger analytics refresh", async () => {
    const event = createMockEvent("automation/time-based", { companyId: 8 });

    await handlers["process-time-based-automation"]({ event });

    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe("processEventAutomationJob", () => {
  it("calls processEventAutomations with companyId and CRON_SECRET", async () => {
    const event = createMockEvent("automation/event-based", { companyId: 9 });

    const result = await handlers["process-event-automation"]({ event });

    expect(mockProcessEventAutomations).toHaveBeenCalledWith(9, "test-cron-secret");
    expect(result).toEqual({ success: true, companyId: 9 });
  });

  it("does not trigger analytics refresh", async () => {
    const event = createMockEvent("automation/event-based", { companyId: 9 });

    await handlers["process-event-automation"]({ event });

    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe("processMeetingReminderJob", () => {
  it("calls processMeetingReminders with no args", async () => {
    const event = createMockEvent("automation/meeting-reminders", {});

    const result = await handlers["process-meeting-reminders"]({ event });

    expect(mockProcessMeetingReminders).toHaveBeenCalled();
    expect(result).toEqual({ success: true });
  });

  it("does not trigger analytics refresh", async () => {
    const event = createMockEvent("automation/meeting-reminders", {});

    await handlers["process-meeting-reminders"]({ event });

    expect(mockSend).not.toHaveBeenCalled();
  });
});

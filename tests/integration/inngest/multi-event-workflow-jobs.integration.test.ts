import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { createMockStep, createMockEvent } from "../helpers/inngest-test-utils";
import { prisma } from "@/lib/prisma";

// ── Capture Inngest handlers ───────────────────────────────────────
const handlers: Record<string, Function> = {};
const mockSend = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    send: (...args: any[]) => mockSend(...args),
    createFunction: vi.fn((config: any, _trigger: any, handler: any) => {
      handlers[config.id] = handler;
      return { fn: handler };
    }),
  },
}));

// ── Mock prisma-background → redirect to real prisma ─────────────
vi.mock("@/lib/prisma-background", async () => {
  const { prisma } = await import("@/lib/prisma");
  return { prismaBg: prisma };
});

// ── Mock multi-event-automations ─────────────────────────────────
const mockFindMatchingRulesAndSharedData = vi.fn();
const mockCalculateSingleRule = vi.fn();
const mockFetchSharedAuditLogs = vi.fn();

vi.mock("@/app/actions/multi-event-automations", () => ({
  findMatchingRulesAndSharedData: (...args: any[]) =>
    mockFindMatchingRulesAndSharedData(...args),
  calculateSingleRule: (...args: any[]) => mockCalculateSingleRule(...args),
  fetchSharedAuditLogs: (...args: any[]) => mockFetchSharedAuditLogs(...args),
}));

// ── Mock notifications-internal ──────────────────────────────────
const mockCreateNotificationForCompany = vi
  .fn()
  .mockResolvedValue({ success: true });

vi.mock("@/lib/notifications-internal", () => ({
  createNotificationForCompany: (...args: any[]) =>
    mockCreateNotificationForCompany(...args),
}));

// ── Mock company-validation ──────────────────────────────────────
vi.mock("@/lib/company-validation", () => ({
  validateUserInCompany: vi.fn().mockResolvedValue(true),
}));

// ── Mock security/ssrf ──────────────────────────────────────────
const mockIsPrivateUrl = vi.fn().mockReturnValue(false);

vi.mock("@/lib/security/ssrf", () => ({
  isPrivateUrl: (...args: any[]) => mockIsPrivateUrl(...args),
}));

// ── Test state ───────────────────────────────────────────────────
let companyId: number;
let userId: number;
let tableId: number;

beforeAll(async () => {
  // Import function files to register handlers
  await import("@/lib/inngest/functions/multi-event-jobs");
  await import("@/lib/inngest/functions/workflow-automation-jobs");

  const company = await prisma.company.create({
    data: {
      name: "MultiEvent WF Test Co",
      slug: `mewf-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    },
  });
  companyId = company.id;

  const user = await prisma.user.create({
    data: {
      companyId,
      name: "MEWF Admin",
      email: `mewf-admin-${Date.now()}@test.com`,
      passwordHash: "h",
      role: "admin",
    },
  });
  userId = user.id;

  const table = await prisma.tableMeta.create({
    data: {
      companyId,
      name: "MEWF Test Table",
      slug: `mewf-table-${Date.now()}`,
      createdBy: userId,
      schemaJson: [
        { name: "status", type: "text" },
        { name: "name", type: "text" },
        { name: "amount", type: "number" },
      ],
    },
  });
  tableId = table.id;
});

afterAll(async () => {
  await prisma.task.deleteMany({ where: { companyId } });
  await prisma.record.deleteMany({ where: { companyId } });
  await prisma.calendarEvent.deleteMany({ where: { companyId } });
  await prisma.auditLog.deleteMany({ where: { companyId } });
  await prisma.tableMeta.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests: processMultiEventDuration ─────────────────────────────

describe("processMultiEventDuration", () => {
  it(
    "fetches record, finds matching rules, calculates duration",
    async () => {
      const record = await prisma.record.create({
        data: {
          companyId,
          tableId,
          data: { status: "done" },
          createdBy: userId,
        },
      });
      const recordId = record.id;

      await prisma.auditLog.create({
        data: {
          companyId,
          recordId,
          action: "UPDATE",
          diffJson: { status: "done" },
        },
      });

      mockFindMatchingRulesAndSharedData.mockResolvedValue({
        matchingRules: [{ ruleId: 1, eventChain: [], ruleSnapshot: {} }],
        resolvedCompanyId: companyId,
        shared: { recordId, tableId, companyId },
      });
      mockFetchSharedAuditLogs.mockResolvedValue([]);
      mockCalculateSingleRule.mockResolvedValue({ pendingActions: [] });

      const step = createMockStep();
      const event = createMockEvent("automation/multi-event-duration", {
        tableId,
        recordId,
        companyId,
      });

      const result = await handlers["process-multi-event-duration"]({
        event,
        step,
      });

      expect(result.success).toBe(true);
      expect(mockFindMatchingRulesAndSharedData).toHaveBeenCalled();
    },
    15000,
  );

  it(
    "skips when record not found (deleted)",
    async () => {
      const step = createMockStep();
      const event = createMockEvent("automation/multi-event-duration", {
        tableId,
        recordId: 999999,
        companyId,
      });

      const result = await handlers["process-multi-event-duration"]({
        event,
        step,
      });

      expect(result.skipped).toBe(true);
    },
    15000,
  );

  it(
    "skips when no shared data",
    async () => {
      const record = await prisma.record.create({
        data: {
          companyId,
          tableId,
          data: { status: "pending" },
          createdBy: userId,
        },
      });

      mockFindMatchingRulesAndSharedData.mockResolvedValue({
        matchingRules: [],
        resolvedCompanyId: companyId,
        shared: null,
      });

      const step = createMockStep();
      const event = createMockEvent("automation/multi-event-duration", {
        tableId,
        recordId: record.id,
        companyId,
      });

      const result = await handlers["process-multi-event-duration"]({
        event,
        step,
      });

      expect(result.skipped).toBe(true);
      expect(result.reason).toBe("no-shared-data");
    },
    15000,
  );
});

// ── Tests: processWorkflowStageAutomations ───────────────────────

describe("processWorkflowStageAutomations", () => {
  it(
    "creates task via create_task action",
    async () => {
      const step = createMockStep();
      const event = createMockEvent(
        "workflow/execute-stage-automations",
        {
          stageDetails: {
            systemActions: [
              {
                type: "create_task",
                config: {
                  title: "Auto Task",
                  status: "todo",
                  priority: "medium",
                },
              },
            ],
          },
          companyId,
          userId,
          stageName: "Stage 1",
          instanceName: "WF1",
        },
      );

      await handlers["workflow-stage-automations"]({ event, step });

      const task = await prisma.task.findFirst({
        where: { companyId, title: "Auto Task" },
      });
      expect(task).not.toBeNull();
      expect(task!.companyId).toBe(companyId);
    },
    15000,
  );

  it(
    "sends notification via notification action",
    async () => {
      const step = createMockStep();
      const event = createMockEvent(
        "workflow/execute-stage-automations",
        {
          stageDetails: {
            systemActions: [
              {
                type: "notification",
                config: {
                  recipientId: userId,
                  message: "Stage done",
                },
              },
            ],
          },
          companyId,
          userId,
          instanceName: "WF1",
        },
      );

      await handlers["workflow-stage-automations"]({ event, step });

      expect(mockCreateNotificationForCompany).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId,
          userId,
        }),
      );
    },
    15000,
  );

  it(
    "creates record via create_record action",
    async () => {
      const step = createMockStep();
      const event = createMockEvent(
        "workflow/execute-stage-automations",
        {
          stageDetails: {
            systemActions: [
              {
                type: "create_record",
                config: {
                  tableId,
                  values: { name: "auto" },
                },
              },
            ],
          },
          companyId,
          userId,
        },
      );

      await handlers["workflow-stage-automations"]({ event, step });

      const record = await prisma.record.findFirst({
        where: {
          companyId,
          tableId,
          data: { path: ["name"], equals: "auto" },
        },
      });
      expect(record).not.toBeNull();
    },
    15000,
  );

  it(
    "updates record with arithmetic operation",
    async () => {
      const record = await prisma.record.create({
        data: {
          companyId,
          tableId,
          data: { amount: 100 },
          createdBy: userId,
        },
      });

      const step = createMockStep();
      const event = createMockEvent(
        "workflow/execute-stage-automations",
        {
          stageDetails: {
            systemActions: [
              {
                type: "update_record",
                config: {
                  tableId,
                  recordId: record.id,
                  fieldName: "amount",
                  value: 50,
                  operation: "add",
                },
              },
            ],
          },
          companyId,
          userId,
        },
      );

      await handlers["workflow-stage-automations"]({ event, step });

      const updated = await prisma.record.findUnique({
        where: { id: record.id },
      });
      expect((updated!.data as any).amount).toBe(150);
    },
    15000,
  );

  it(
    "skips unknown action types",
    async () => {
      const step = createMockStep();
      const event = createMockEvent(
        "workflow/execute-stage-automations",
        {
          stageDetails: {
            systemActions: [{ type: "unknown_type", config: {} }],
          },
          companyId,
        },
      );

      const result = await handlers["workflow-stage-automations"]({
        event,
        step,
      });

      expect(result.success).toBe(true);
    },
    15000,
  );

  it(
    "caps actions at MAX_ACTIONS_PER_STAGE (20)",
    async () => {
      const actions = Array.from({ length: 25 }, (_, i) => ({
        type: "notification",
        config: {
          recipientId: userId,
          message: `Cap notification ${i}`,
        },
      }));

      const step = createMockStep();
      const event = createMockEvent(
        "workflow/execute-stage-automations",
        {
          stageDetails: { systemActions: actions },
          companyId,
          userId,
          instanceName: "WF-Cap",
        },
      );

      await handlers["workflow-stage-automations"]({ event, step });

      expect(mockCreateNotificationForCompany).toHaveBeenCalledTimes(20);
    },
    15000,
  );

  it(
    "dispatches whatsapp via inngest.send",
    async () => {
      const step = createMockStep();
      const event = createMockEvent(
        "workflow/execute-stage-automations",
        {
          stageDetails: {
            systemActions: [
              {
                type: "whatsapp",
                config: {
                  phoneColumnId: "manual:0501234567",
                  content: "Hello",
                },
              },
            ],
          },
          companyId,
        },
      );

      await handlers["workflow-stage-automations"]({ event, step });

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "automation/send-whatsapp",
        }),
      );
    },
    15000,
  );

  it(
    "blocks private webhook URLs",
    async () => {
      mockIsPrivateUrl.mockReturnValue(true);

      const step = createMockStep();
      const event = createMockEvent(
        "workflow/execute-stage-automations",
        {
          stageDetails: {
            systemActions: [
              {
                type: "webhook",
                config: {
                  url: "http://169.254.169.254/latest/meta-data",
                },
              },
            ],
          },
          companyId,
        },
      );

      await handlers["workflow-stage-automations"]({ event, step });

      expect(mockSend).not.toHaveBeenCalledWith(
        expect.objectContaining({
          name: "automation/send-webhook",
        }),
      );
    },
    15000,
  );
});

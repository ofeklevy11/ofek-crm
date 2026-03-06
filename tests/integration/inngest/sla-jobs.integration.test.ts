import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { createMockStep, createMockEvent } from "../helpers/inngest-test-utils";
import { prisma } from "@/lib/prisma";

// ── Capture handlers ───────────────────────────────────────────────
const handlers: Record<string, Function> = {};
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

// ── Mock external modules ──────────────────────────────────────────
const mockCreateNotification = vi.fn().mockResolvedValue({ success: true });
vi.mock("@/lib/notifications-internal", () => ({
  createNotificationForCompany: (...args: any[]) => mockCreateNotification(...args),
}));

vi.mock("@/lib/security/ssrf", () => ({
  isPrivateUrl: vi.fn().mockReturnValue(false),
}));

// ── State ──────────────────────────────────────────────────────────
let companyId: number;
let adminUserId: number;
let ticketId: number;
let slaPolicyId: number;
let ruleId: number;

beforeAll(async () => {
  await import("@/lib/inngest/functions/sla-jobs");

  const company = await prisma.company.create({
    data: { name: "SLA Test Co", slug: `sla-test-${Date.now()}` },
  });
  companyId = company.id;

  const admin = await prisma.user.create({
    data: {
      companyId,
      name: "SLA Admin",
      email: `sla-admin-${Date.now()}@test.com`,
      passwordHash: "h",
      role: "admin",
    },
  });
  adminUserId = admin.id;

  const policy = await prisma.slaPolicy.create({
    data: {
      companyId,
      name: "High Priority SLA",
      priority: "HIGH",
      responseTimeMinutes: 30,
      resolveTimeMinutes: 120,
    },
  });
  slaPolicyId = policy.id;

  // Ticket with overdue response SLA (due in the past)
  const ticket = await prisma.ticket.create({
    data: {
      companyId,
      title: "Overdue Ticket",
      status: "OPEN",
      priority: "HIGH",
      type: "SERVICE",
      creatorId: adminUserId,
      assigneeId: adminUserId,
      slaResponseDueDate: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
    },
  });
  ticketId = ticket.id;

  // Automation rule for SLA_BREACH
  const rule = await prisma.automationRule.create({
    data: {
      companyId,
      createdBy: adminUserId,
      name: "SLA Breach Notify",
      triggerType: "SLA_BREACH",
      triggerConfig: { priority: "any", breachType: "any" },
      actionType: "SEND_NOTIFICATION",
      actionConfig: {
        recipientId: adminUserId,
        messageTemplate: "Ticket {ticketTitle} breached {breachType}!",
      },
      isActive: true,
    },
  });
  ruleId = rule.id;
});

afterAll(async () => {
  await prisma.slaBreach.deleteMany({ where: { companyId } });
  await prisma.automationRule.deleteMany({ where: { companyId } });
  await prisma.ticket.deleteMany({ where: { companyId } });
  await prisma.slaPolicy.deleteMany({ where: { companyId } });
  await prisma.task.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ──────────────────────────────────────────────────────────

describe("slaScan", () => {
  it("finds overdue ticket companies and creates SlaBreach records", async () => {
    const step = createMockStep();
    // Override sendEvent to handle two-arg form: step.sendEvent(stepId, events)
    const sentEvents: Array<{ name: string; data: unknown }> = [];
    (step as any).sendEvent = async (...args: any[]) => {
      // Inngest step.sendEvent can be (stepId, events) or (events)
      const events = args.length === 2 ? args[1] : args[0];
      const list = Array.isArray(events) ? events : [events];
      sentEvents.push(...list);
    };

    const event = createMockEvent("sla/manual-scan", {});
    const result = await handlers["sla-scan"]({ event, step });

    // Should have found at least our company
    expect(result.companies).toBeGreaterThanOrEqual(1);
    expect(result.totalBreaches).toBeGreaterThanOrEqual(1);

    // Check SlaBreach record was created in DB
    const breaches = await prisma.slaBreach.findMany({
      where: { companyId, ticketId },
    });
    expect(breaches.length).toBeGreaterThanOrEqual(1);
    expect(breaches[0].breachType).toBe("RESPONSE");
    expect(breaches[0].status).toBe("PENDING");

    // Verify fan-out events were sent
    expect(sentEvents.length).toBeGreaterThanOrEqual(1);
    expect(sentEvents[0].name).toBe("sla/breach.detected");
    expect((sentEvents[0].data as any).ticketId).toBe(ticketId);
    expect((sentEvents[0].data as any).companyId).toBe(companyId);
  });
});

describe("slaBreachHandler", () => {
  it("validates ticket belongs to company and executes matching rules", async () => {
    const step = createMockStep();
    const event = createMockEvent("sla/breach.detected", {
      companyId,
      ticketId,
      breachId: 1,
      breachType: "RESPONSE",
      ticketTitle: "Overdue Ticket",
      ticketPriority: "HIGH",
      ticketStatus: "OPEN",
      assigneeName: "SLA Admin",
      assigneeId: adminUserId,
      automationRules: [
        {
          id: ruleId,
          name: "SLA Breach Notify",
          triggerConfig: { priority: "any", breachType: "any" },
          actionType: "SEND_NOTIFICATION",
          actionConfig: {
            recipientId: adminUserId,
            messageTemplate: "Ticket {ticketTitle} breached {breachType}!",
          },
        },
      ],
    });

    const result = await handlers["sla-breach-handler"]({ event, step });

    expect(result.rulesEvaluated).toBe(1);
    expect(result.rulesExecuted).toBe(1);
    expect(result.ticketId).toBe(ticketId);

    // Notification should have been sent
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId,
        userId: adminUserId,
      }),
    );
  });

  it("returns error when ticket does not belong to company", async () => {
    const step = createMockStep();
    const event = createMockEvent("sla/breach.detected", {
      companyId: 999999, // non-existent company
      ticketId,
      breachId: 1,
      breachType: "RESPONSE",
      ticketTitle: "Overdue Ticket",
      ticketPriority: "HIGH",
      ticketStatus: "OPEN",
      assigneeName: null,
      assigneeId: null,
      automationRules: [],
    });

    const result = await handlers["sla-breach-handler"]({ event, step });
    expect(result.error).toBe("Ticket not found for company");
  });

  it("matches rules by priority filter", async () => {
    const step = createMockStep();
    const event = createMockEvent("sla/breach.detected", {
      companyId,
      ticketId,
      breachId: 2,
      breachType: "RESPONSE",
      ticketTitle: "Overdue Ticket",
      ticketPriority: "HIGH",
      ticketStatus: "OPEN",
      assigneeName: "SLA Admin",
      assigneeId: adminUserId,
      automationRules: [
        {
          id: ruleId,
          name: "SLA Breach Notify",
          triggerConfig: { priority: "LOW", breachType: "any" }, // Mismatch — ticket is HIGH
          actionType: "SEND_NOTIFICATION",
          actionConfig: {
            recipientId: adminUserId,
            messageTemplate: "Should not fire",
          },
        },
      ],
    });

    const result = await handlers["sla-breach-handler"]({ event, step });
    expect(result.rulesExecuted).toBe(0);
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it("matches rules by breachType filter", async () => {
    const step = createMockStep();
    const event = createMockEvent("sla/breach.detected", {
      companyId,
      ticketId,
      breachId: 3,
      breachType: "RESPONSE",
      ticketTitle: "Overdue Ticket",
      ticketPriority: "HIGH",
      ticketStatus: "OPEN",
      assigneeName: "SLA Admin",
      assigneeId: adminUserId,
      automationRules: [
        {
          id: ruleId,
          name: "SLA Breach Notify",
          triggerConfig: { priority: "any", breachType: "RESOLVE" }, // Mismatch — breach is RESPONSE
          actionType: "SEND_NOTIFICATION",
          actionConfig: {
            recipientId: adminUserId,
            messageTemplate: "Should not fire",
          },
        },
      ],
    });

    const result = await handlers["sla-breach-handler"]({ event, step });
    expect(result.rulesExecuted).toBe(0);
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it("CREATE_TASK action creates a task in DB", async () => {
    const step = createMockStep();
    const event = createMockEvent("sla/breach.detected", {
      companyId,
      ticketId,
      breachId: 4,
      breachType: "RESPONSE",
      ticketTitle: "Overdue Ticket",
      ticketPriority: "HIGH",
      ticketStatus: "OPEN",
      assigneeName: "SLA Admin",
      assigneeId: adminUserId,
      automationRules: [
        {
          id: ruleId,
          name: "SLA Create Task",
          triggerConfig: { priority: "any", breachType: "any" },
          actionType: "CREATE_TASK",
          actionConfig: {
            title: "Follow up on {ticketTitle}",
            description: "Breach type: {breachType}",
            status: "todo",
            priority: "high",
            assigneeId: adminUserId,
            dueDays: 1,
            tags: ["SLA"],
          },
        },
      ],
    });

    const result = await handlers["sla-breach-handler"]({ event, step });
    expect(result.rulesExecuted).toBe(1);

    // Verify task was created in DB
    const tasks = await prisma.task.findMany({
      where: { companyId, title: { contains: "Follow up on" } },
    });
    expect(tasks.length).toBeGreaterThanOrEqual(1);
    expect(tasks[0].title).toBe("Follow up on Overdue Ticket");
    expect(tasks[0].priority).toBe("high");
  });

  it("returns correct stats shape", async () => {
    const step = createMockStep();
    const event = createMockEvent("sla/breach.detected", {
      companyId,
      ticketId,
      breachId: 5,
      breachType: "RESPONSE",
      ticketTitle: "Overdue Ticket",
      ticketPriority: "HIGH",
      ticketStatus: "OPEN",
      assigneeName: null,
      assigneeId: null,
      automationRules: [],
    });

    const result = await handlers["sla-breach-handler"]({ event, step });
    expect(result).toEqual(
      expect.objectContaining({
        breachId: 5,
        ticketId,
        breachType: "RESPONSE",
        rulesEvaluated: 0,
        rulesExecuted: 0,
      }),
    );
  });
});

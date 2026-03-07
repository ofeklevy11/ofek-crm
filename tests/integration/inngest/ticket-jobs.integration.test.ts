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
      return { id: config.id, fn: handler };
    }),
  },
}));

// ── Mock external modules ──────────────────────────────────────────
const mockCreateNotification = vi.fn().mockResolvedValue({ success: true });
vi.mock("@/lib/notifications-internal", () => ({
  createNotificationForCompany: (...args: any[]) => mockCreateNotification(...args),
}));

const mockCreateTicketActivityLogs = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/ticket-activity-utils", () => ({
  createTicketActivityLogs: (...args: any[]) => mockCreateTicketActivityLogs(...args),
}));

vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(null),
    del: vi.fn().mockResolvedValue(1),
  },
}));

// ── State ──────────────────────────────────────────────────────────
let companyId: number;
let adminUserId: number;
let otherUserId: number;
let ticketId: number;
let ruleId: number;

beforeAll(async () => {
  // Register handlers
  await import("@/lib/inngest/functions/ticket-jobs");

  // Seed data
  const company = await prisma.company.create({
    data: {
      name: "Ticket Test Co",
      slug: `ticket-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      notificationSettings: {
        notifyOnTicketAssigned: true,
        notifyOnTicketReassigned: true,
        notifyOnTicketComment: true,
      },
    },
  });
  companyId = company.id;

  const admin = await prisma.user.create({
    data: {
      companyId,
      name: "Admin User",
      email: `ticket-admin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`,
      passwordHash: "not-a-real-hash",
      role: "admin",
    },
  });
  adminUserId = admin.id;

  const other = await prisma.user.create({
    data: {
      companyId,
      name: "Other User",
      email: `ticket-other-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`,
      passwordHash: "not-a-real-hash",
      role: "basic",
    },
  });
  otherUserId = other.id;

  const ticket = await prisma.ticket.create({
    data: {
      companyId,
      title: "Test Ticket",
      status: "OPEN",
      priority: "HIGH",
      type: "SERVICE",
      assigneeId: adminUserId,
      creatorId: adminUserId,
    },
  });
  ticketId = ticket.id;

  const rule = await prisma.automationRule.create({
    data: {
      companyId,
      createdBy: adminUserId,
      name: "Status Change Notification Rule",
      triggerType: "TICKET_STATUS_CHANGE",
      triggerConfig: { fromStatus: "any", toStatus: "IN_PROGRESS" },
      actionType: "SEND_NOTIFICATION",
      actionConfig: {
        recipientId: adminUserId,
        messageTemplate: "Ticket {ticketTitle} moved to {toStatus}",
        titleTemplate: "Ticket Status Update",
      },
      isActive: true,
    },
  });
  ruleId = rule.id;
});

afterAll(async () => {
  await prisma.automationRule.deleteMany({ where: { companyId } });
  await prisma.ticket.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ── processTicketNotificationJob ──────────────────────────────────

describe("processTicketNotificationJob", () => {
  it("type 'assignee' with isNew=true calls createNotificationForCompany with new-ticket message", async () => {
    const event = createMockEvent("ticket/notification", {
      type: "assignee",
      companyId,
      assigneeId: adminUserId,
      ticketId,
      ticketTitle: "Test Ticket",
      isNew: true,
    });

    const result = await handlers["process-ticket-notification"]({ event });

    expect(result).toEqual({ success: true, type: "assignee" });
    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId,
        userId: adminUserId,
        link: "/service",
      }),
    );
  });

  it("type 'assignee' with isNew=false calls createNotificationForCompany with reassign message", async () => {
    const event = createMockEvent("ticket/notification", {
      type: "assignee",
      companyId,
      assigneeId: otherUserId,
      ticketId,
      ticketTitle: "Test Ticket",
      isNew: false,
    });

    const result = await handlers["process-ticket-notification"]({ event });

    expect(result).toEqual({ success: true, type: "assignee" });
    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId,
        userId: otherUserId,
      }),
    );
  });

  it("type 'comment' notifies assignee when commenter is different", async () => {
    const event = createMockEvent("ticket/notification", {
      type: "comment",
      companyId,
      ticketId,
      userId: otherUserId,
      userName: "Other User",
    });

    const result = await handlers["process-ticket-notification"]({ event });

    expect(result).toEqual({ success: true, type: "comment" });
    // Assignee (adminUserId) should be notified since commenter (otherUserId) != assignee
    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId,
        userId: adminUserId,
      }),
    );
  });

  it("type 'comment' does NOT notify when commenter is the assignee", async () => {
    const event = createMockEvent("ticket/notification", {
      type: "comment",
      companyId,
      ticketId,
      userId: adminUserId,
      userName: "Admin User",
    });

    await handlers["process-ticket-notification"]({ event });

    // Commenter IS the assignee, no notification
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it("type 'comment' does NOT notify when ticket has no assignee", async () => {
    // Create a ticket without an assignee
    const unassignedTicket = await prisma.ticket.create({
      data: {
        companyId,
        title: "Unassigned Ticket",
        status: "OPEN",
        priority: "MEDIUM",
        type: "SERVICE",
        creatorId: adminUserId,
        assigneeId: null,
      },
    });

    const event = createMockEvent("ticket/notification", {
      type: "comment",
      companyId,
      ticketId: unassignedTicket.id,
      userId: otherUserId,
      userName: "Other User",
    });

    await handlers["process-ticket-notification"]({ event });

    expect(mockCreateNotification).not.toHaveBeenCalled();

    // Cleanup
    await prisma.ticket.delete({ where: { id: unassignedTicket.id } });
  });

  // ── Toggle-off tests ──────────────────────────────────────────

  it("type 'assignee' with isNew=true does NOT notify when notifyOnTicketAssigned is OFF", async () => {
    // Create a company with toggles OFF
    const silentCompany = await prisma.company.create({
      data: {
        name: "Silent Co",
        slug: `silent-co-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        notificationSettings: {},
      },
    });
    const silentUser = await prisma.user.create({
      data: {
        companyId: silentCompany.id,
        name: "Silent User",
        email: `silent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`,
        passwordHash: "not-a-real-hash",
        role: "basic",
      },
    });

    const event = createMockEvent("ticket/notification", {
      type: "assignee",
      companyId: silentCompany.id,
      assigneeId: silentUser.id,
      ticketId,
      ticketTitle: "Test Ticket",
      isNew: true,
    });

    const result = await handlers["process-ticket-notification"]({ event });

    expect(result).toEqual({ success: true, type: "assignee" });
    expect(mockCreateNotification).not.toHaveBeenCalled();

    // Cleanup
    await prisma.user.delete({ where: { id: silentUser.id } });
    await prisma.company.delete({ where: { id: silentCompany.id } });
  });

  it("type 'assignee' with isNew=false does NOT notify when notifyOnTicketReassigned is OFF", async () => {
    const silentCompany = await prisma.company.create({
      data: {
        name: "Silent Co 2",
        slug: `silent-co2-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        notificationSettings: { notifyOnTicketAssigned: true },
      },
    });
    const silentUser = await prisma.user.create({
      data: {
        companyId: silentCompany.id,
        name: "Silent User 2",
        email: `silent2-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`,
        passwordHash: "not-a-real-hash",
        role: "basic",
      },
    });

    const event = createMockEvent("ticket/notification", {
      type: "assignee",
      companyId: silentCompany.id,
      assigneeId: silentUser.id,
      ticketId,
      ticketTitle: "Test Ticket",
      isNew: false,
    });

    const result = await handlers["process-ticket-notification"]({ event });

    expect(result).toEqual({ success: true, type: "assignee" });
    // notifyOnTicketReassigned is OFF (default false), so no notification
    expect(mockCreateNotification).not.toHaveBeenCalled();

    await prisma.user.delete({ where: { id: silentUser.id } });
    await prisma.company.delete({ where: { id: silentCompany.id } });
  });

  it("type 'comment' does NOT notify when notifyOnTicketComment is OFF", async () => {
    const silentCompany = await prisma.company.create({
      data: {
        name: "Silent Co 3",
        slug: `silent-co3-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        notificationSettings: {},
      },
    });
    const silentUser = await prisma.user.create({
      data: {
        companyId: silentCompany.id,
        name: "Silent Assignee",
        email: `silent3-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`,
        passwordHash: "not-a-real-hash",
        role: "basic",
      },
    });
    const silentCommenter = await prisma.user.create({
      data: {
        companyId: silentCompany.id,
        name: "Silent Commenter",
        email: `silent4-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`,
        passwordHash: "not-a-real-hash",
        role: "basic",
      },
    });
    const silentTicket = await prisma.ticket.create({
      data: {
        companyId: silentCompany.id,
        title: "Silent Ticket",
        status: "OPEN",
        priority: "LOW",
        type: "SERVICE",
        creatorId: silentUser.id,
        assigneeId: silentUser.id,
      },
    });

    const event = createMockEvent("ticket/notification", {
      type: "comment",
      companyId: silentCompany.id,
      ticketId: silentTicket.id,
      userId: silentCommenter.id,
      userName: "Silent Commenter",
    });

    const result = await handlers["process-ticket-notification"]({ event });

    expect(result).toEqual({ success: true, type: "comment" });
    expect(mockCreateNotification).not.toHaveBeenCalled();

    await prisma.ticket.delete({ where: { id: silentTicket.id } });
    await prisma.user.deleteMany({ where: { companyId: silentCompany.id } });
    await prisma.company.delete({ where: { id: silentCompany.id } });
  });
});

// ── processTicketStatusChangeJob ──────────────────────────────────

describe("processTicketStatusChangeJob", () => {
  it("finds matching rules and sends notifications", async () => {
    const event = createMockEvent("ticket/status-change", {
      ticketId,
      companyId,
      ticketTitle: "Test Ticket",
      fromStatus: "OPEN",
      toStatus: "IN_PROGRESS",
    });

    const result = await handlers["process-ticket-status-change"]({ event });

    expect(result.success).toBe(true);
    expect(result.rulesProcessed).toBeGreaterThanOrEqual(1);
    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId,
        userId: adminUserId,
        title: "Ticket Status Update",
        message: expect.stringContaining("Test Ticket"),
      }),
    );
  });

  it("skips rules that do not match toStatus", async () => {
    const event = createMockEvent("ticket/status-change", {
      ticketId,
      companyId,
      ticketTitle: "Test Ticket",
      fromStatus: "OPEN",
      toStatus: "CLOSED", // Rule expects IN_PROGRESS
    });

    await handlers["process-ticket-status-change"]({ event });

    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it("processes rules where fromStatus is 'any'", async () => {
    const event = createMockEvent("ticket/status-change", {
      ticketId,
      companyId,
      ticketTitle: "Test Ticket",
      fromStatus: "WAITING",
      toStatus: "IN_PROGRESS",
    });

    const result = await handlers["process-ticket-status-change"]({ event });

    expect(result.success).toBe(true);
    // Rule has fromStatus: "any" so any fromStatus should match
    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
  });

  it("returns rulesProcessed count", async () => {
    const event = createMockEvent("ticket/status-change", {
      ticketId,
      companyId,
      ticketTitle: "Test Ticket",
      fromStatus: "OPEN",
      toStatus: "IN_PROGRESS",
    });

    const result = await handlers["process-ticket-status-change"]({ event });

    expect(typeof result.rulesProcessed).toBe("number");
    expect(result.rulesProcessed).toBeGreaterThanOrEqual(1);
  });
});

// ── processTicketActivityLogJob ───────────────────────────────────

describe("processTicketActivityLogJob", () => {
  it("delegates to createTicketActivityLogs with correct args", async () => {
    const event = createMockEvent("ticket/activity-log", {
      ticketId,
      userId: adminUserId,
      companyId,
      previousData: { status: "OPEN" },
      newData: { status: "IN_PROGRESS" },
    });

    const result = await handlers["process-ticket-activity-log"]({ event });

    expect(result).toEqual({ success: true, ticketId });
    expect(mockCreateTicketActivityLogs).toHaveBeenCalledWith(
      ticketId,
      adminUserId,
      { status: "OPEN" },
      { status: "IN_PROGRESS" },
      undefined,
      undefined,
      companyId,
    );
  });

  it("passes through all event data fields", async () => {
    const previousData = { status: "OPEN", priority: "LOW", title: "Old Title" };
    const newData = { status: "CLOSED", priority: "HIGH", title: "New Title" };

    const event = createMockEvent("ticket/activity-log", {
      ticketId,
      userId: otherUserId,
      companyId,
      previousData,
      newData,
    });

    await handlers["process-ticket-activity-log"]({ event });

    expect(mockCreateTicketActivityLogs).toHaveBeenCalledWith(
      ticketId,
      otherUserId,
      previousData,
      newData,
      undefined,
      undefined,
      companyId,
    );
  });
});

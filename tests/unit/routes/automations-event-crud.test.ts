import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

vi.mock("@/lib/permissions-server", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    automationRule: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    calendarEvent: {
      findFirst: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  checkActionRateLimit: vi.fn(),
  RATE_LIMITS: {
    automationRead: { prefix: "auto-read", max: 60, windowSeconds: 60 },
    automationMutate: { prefix: "auto-mut", max: 30, windowSeconds: 60 },
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock("@/lib/calendar-validation", () => ({
  validateActionConfigSize: vi.fn().mockReturnValue(true),
  MAX_TITLE_LENGTH: 200,
}));

// Mock the limit check to pass through to prisma.automationRule.create
vi.mock("@/lib/automation-limit-check", async () => {
  const { prisma } = await import("@/lib/prisma");
  return {
    checkCategoryLimitAndCreate: vi.fn(async (_companyId: number, _userTier: string, _triggerType: string, createData: any) => {
      const rule = await prisma.automationRule.create({ data: createData });
      return { allowed: true, rule };
    }),
    countCategoryAutomations: vi.fn().mockResolvedValue(0),
  };
});

import {
  createGlobalEventAutomation,
  getGlobalEventAutomations,
  updateGlobalEventAutomation,
  deleteGlobalEventAutomation,
  createEventAutomation,
  getEventAutomations,
  getMaxEventAutomationCount,
  getEventModalInitData,
  getGlobalAutomationsModalData,
  updateEventAutomation,
  deleteEventAutomation,
} from "@/app/actions/event-automations";
import { getCurrentUser } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { checkActionRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { validateActionConfigSize } from "@/lib/calendar-validation";
import { revalidatePath } from "next/cache";

// --- Fixtures ---

const adminUser = {
  id: 1,
  companyId: 100,
  name: "Admin",
  email: "admin@test.com",
  role: "admin" as const,
  allowedWriteTableIds: [] as number[],
  permissions: {} as Record<string, boolean>,
};

const basicUserWithCalPerm = {
  id: 2,
  companyId: 100,
  name: "Basic",
  email: "basic@test.com",
  role: "basic" as const,
  allowedWriteTableIds: [] as number[],
  permissions: { canViewCalendar: true } as Record<string, boolean>,
};

const basicUserNoPerms = {
  id: 3,
  companyId: 100,
  name: "NoPerms",
  email: "none@test.com",
  role: "basic" as const,
  allowedWriteTableIds: [] as number[],
  permissions: {} as Record<string, boolean>,
};

const validInput = {
  minutesBefore: 30,
  actionType: "SEND_NOTIFICATION",
  actionConfig: { recipientId: 5, messageTemplate: "Hello" },
};

const validEventInput = {
  ...validInput,
  eventId: "evt-1",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(checkActionRateLimit).mockResolvedValue(false);
  vi.mocked(validateActionConfigSize).mockReturnValue(true);
  vi.mocked(revalidatePath).mockReturnValue(undefined as any);
});

// ════════════════════════════════════════════════════════════════════════════
// createGlobalEventAutomation
// ════════════════════════════════════════════════════════════════════════════

describe("createGlobalEventAutomation", () => {
  it("returns auth error when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await createGlobalEventAutomation(validInput);
    expect(res).toEqual({ success: false, error: "Authentication required" });
  });

  it("returns Forbidden when user lacks canViewCalendar", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserNoPerms as any);
    const res = await createGlobalEventAutomation(validInput);
    expect(res).toEqual({ success: false, error: "Forbidden" });
  });

  it("returns rate limit error when rate limited", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(checkActionRateLimit).mockResolvedValue(true);
    const res = await createGlobalEventAutomation(validInput);
    expect(res).toEqual({ success: false, error: "Rate limit exceeded. Please try again later." });
  });

  it("rejects invalid minutesBefore", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const res = await createGlobalEventAutomation({ ...validInput, minutesBefore: -1 });
    expect(res.success).toBe(false);
    expect(res.error).toBe("minutesBefore must be a number between 0 and 43200 (30 days)");
  });

  it("rejects minutesBefore exceeding 43200", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const res = await createGlobalEventAutomation({ ...validInput, minutesBefore: 50000 });
    expect(res.success).toBe(false);
    expect(res.error).toBe("minutesBefore must be a number between 0 and 43200 (30 days)");
  });

  it("accepts minutesBefore at exact upper boundary (43200)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.create).mockResolvedValue({ id: 1 } as any);
    const res = await createGlobalEventAutomation({ ...validInput, minutesBefore: 43200 });
    expect(res.success).toBe(true);
    const createCall = vi.mocked(prisma.automationRule.create).mock.calls[0][0] as any;
    expect(createCall.data.triggerConfig.minutesBefore).toBe(43200);
  });

  it("rejects invalid action type", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const res = await createGlobalEventAutomation({ ...validInput, actionType: "INVALID_TYPE" });
    expect(res).toEqual({ success: false, error: "Invalid action type" });
  });

  it("rejects oversized actionConfig", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(validateActionConfigSize).mockReturnValue(false);
    const res = await createGlobalEventAutomation(validInput);
    expect(res).toEqual({ success: false, error: "Action configuration is too large" });
  });

  it("rejects empty name after trimming", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const res = await createGlobalEventAutomation({ ...validInput, name: "   " });
    expect(res.success).toBe(false);
    expect(res.error).toBe("Name must be a non-empty string under 200 characters");
  });

  it("rejects name exceeding MAX_TITLE_LENGTH (201 chars)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const res = await createGlobalEventAutomation({ ...validInput, name: "x".repeat(201) });
    expect(res.success).toBe(false);
    expect(res.error).toBe("Name must be a non-empty string under 200 characters");
  });

  it("accepts name at exactly MAX_TITLE_LENGTH (200 chars boundary PASS)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.create).mockResolvedValue({ id: 1 } as any);
    const res = await createGlobalEventAutomation({ ...validInput, name: "x".repeat(200) });
    expect(res.success).toBe(true);
    const createCall = vi.mocked(prisma.automationRule.create).mock.calls[0][0] as any;
    expect(createCall.data.name).toBe("x".repeat(200));
  });

  it("rejects non-string name type", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const res = await createGlobalEventAutomation({ ...validInput, name: 123 as any });
    expect(res.success).toBe(false);
    expect(res.error).toBe("Name must be a string under 200 characters");
  });

  it("does not call revalidatePath after creating global automation", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.create).mockResolvedValue({ id: 1 } as any);
    await createGlobalEventAutomation(validInput);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("auto-injects recipientId for SEND_NOTIFICATION when missing", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.create).mockResolvedValue({ id: 1 } as any);
    await createGlobalEventAutomation({
      minutesBefore: 10,
      actionType: "SEND_NOTIFICATION",
      actionConfig: { messageTemplate: "Hello" }, // no recipientId
    });
    const createCall = vi.mocked(prisma.automationRule.create).mock.calls[0][0] as any;
    expect(createCall.data.actionConfig.recipientId).toBe(adminUser.id);
  });

  it("does not override existing recipientId", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.create).mockResolvedValue({ id: 1 } as any);
    await createGlobalEventAutomation(validInput);
    const createCall = vi.mocked(prisma.automationRule.create).mock.calls[0][0] as any;
    expect(createCall.data.actionConfig.recipientId).toBe(5); // original value
  });

  it("creates rule with correct data and companyId scoping", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.create).mockResolvedValue({ id: 42 } as any);
    const res = await createGlobalEventAutomation({ ...validInput, name: "My Global" });
    expect(res).toEqual({ success: true, data: { id: 42 } });
    const createCall = vi.mocked(prisma.automationRule.create).mock.calls[0][0] as any;
    expect(createCall.data.companyId).toBe(100);
    expect(createCall.data.calendarEventId).toBeNull();
    expect(createCall.data.triggerType).toBe("EVENT_TIME");
    expect(createCall.data.name).toBe("My Global");
    expect(createCall.data.createdBy).toBe(adminUser.id);
  });

  it("uses default Hebrew name when name is not provided", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.create).mockResolvedValue({ id: 1 } as any);
    await createGlobalEventAutomation(validInput);
    const createCall = vi.mocked(prisma.automationRule.create).mock.calls[0][0] as any;
    expect(createCall.data.name).toMatch(/אוטומציה קבועה לאירועים/);
    expect(createCall.data.name).toMatch(/\(30 דקות לפני\)/);
  });

  it("accepts non-SEND_NOTIFICATION action type and does not inject recipientId", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.create).mockResolvedValue({ id: 99 } as any);
    const res = await createGlobalEventAutomation({
      minutesBefore: 10,
      actionType: "CREATE_TASK",
      actionConfig: { taskTitle: "Follow up" },
    });
    expect(res.success).toBe(true);
    const createCall = vi.mocked(prisma.automationRule.create).mock.calls[0][0] as any;
    expect(createCall.data.actionType).toBe("CREATE_TASK");
    expect(createCall.data.actionConfig).toEqual({ taskTitle: "Follow up" });
  });

  it("calls checkActionRateLimit with automationMutate config", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.create).mockResolvedValue({ id: 1 } as any);
    await createGlobalEventAutomation(validInput);
    expect(checkActionRateLimit).toHaveBeenCalledWith("1", RATE_LIMITS.automationMutate);
  });

  it("uses Hebrew default name when name is null", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.create).mockResolvedValue({ id: 1 } as any);
    await createGlobalEventAutomation({ ...validInput, name: null as any });
    const createCall = vi.mocked(prisma.automationRule.create).mock.calls[0][0] as any;
    expect(createCall.data.name).toMatch(/אוטומציה קבועה לאירועים/);
    expect(createCall.data.name).toMatch(/\(30 דקות לפני\)/);
  });

  it("returns error on DB failure", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.create).mockRejectedValue(new Error("DB down"));
    const res = await createGlobalEventAutomation(validInput);
    expect(res).toEqual({ success: false, error: "Failed to create global automation" });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// getGlobalEventAutomations
// ════════════════════════════════════════════════════════════════════════════

describe("getGlobalEventAutomations", () => {
  it("returns auth error when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await getGlobalEventAutomations();
    expect(res).toEqual({ success: false, error: "Authentication required" });
  });

  it("returns Forbidden when user lacks canViewCalendar", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserNoPerms as any);
    const res = await getGlobalEventAutomations();
    expect(res).toEqual({ success: false, error: "Forbidden" });
  });

  it("returns rate limit error", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(checkActionRateLimit).mockResolvedValue(true);
    const res = await getGlobalEventAutomations();
    expect(res).toEqual({ success: false, error: "Rate limit exceeded. Please try again later." });
  });

  it("scopes query to companyId and global rules only with take limit", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([]);
    await getGlobalEventAutomations();
    const call = vi.mocked(prisma.automationRule.findMany).mock.calls[0][0] as any;
    expect(call.where.companyId).toBe(100);
    expect(call.where.triggerType).toBe("EVENT_TIME");
    expect(call.where.calendarEventId).toBeNull();
    expect(call.take).toBe(200);
  });

  it("calls checkActionRateLimit with automationRead config", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([]);
    await getGlobalEventAutomations();
    expect(checkActionRateLimit).toHaveBeenCalledWith("1", RATE_LIMITS.automationRead);
  });

  it("returns data on success", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const rules = [{ id: 1, name: "R1" }];
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue(rules as any);
    const res = await getGlobalEventAutomations();
    expect(res).toEqual({ success: true, data: rules });
  });

  it("returns error on DB failure", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.findMany).mockRejectedValue(new Error("DB"));
    const res = await getGlobalEventAutomations();
    expect(res).toEqual({ success: false, error: "Failed to fetch global automations" });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// updateGlobalEventAutomation
// ════════════════════════════════════════════════════════════════════════════

describe("updateGlobalEventAutomation", () => {
  const updateInput = { ...validInput, id: 1 };

  it("rejects invalid rule ID (non-integer)", async () => {
    const res = await updateGlobalEventAutomation({ ...updateInput, id: 0 });
    expect(res).toEqual({ success: false, error: "Invalid rule ID" });
  });

  it("rejects negative rule ID", async () => {
    const res = await updateGlobalEventAutomation({ ...updateInput, id: -5 });
    expect(res).toEqual({ success: false, error: "Invalid rule ID" });
  });

  it("rejects fractional rule ID", async () => {
    const res = await updateGlobalEventAutomation({ ...updateInput, id: 1.5 });
    expect(res).toEqual({ success: false, error: "Invalid rule ID" });
  });

  it("returns auth error when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await updateGlobalEventAutomation(updateInput);
    expect(res).toEqual({ success: false, error: "Authentication required" });
  });

  it("returns Forbidden when user lacks canViewCalendar", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserNoPerms as any);
    const res = await updateGlobalEventAutomation(updateInput);
    expect(res).toEqual({ success: false, error: "Forbidden" });
  });

  it("returns rate limit error", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(checkActionRateLimit).mockResolvedValue(true);
    const res = await updateGlobalEventAutomation(updateInput);
    expect(res).toEqual({ success: false, error: "Rate limit exceeded. Please try again later." });
  });

  it("rejects invalid minutesBefore", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const res = await updateGlobalEventAutomation({ ...updateInput, minutesBefore: NaN });
    expect(res.success).toBe(false);
    expect(res.error).toBe("minutesBefore must be a number between 0 and 43200 (30 days)");
  });

  it("auto-injects recipientId for SEND_NOTIFICATION", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.update).mockResolvedValue({ id: 1 } as any);
    await updateGlobalEventAutomation({
      id: 1,
      minutesBefore: 10,
      actionType: "SEND_NOTIFICATION",
      actionConfig: { messageTemplate: "Test" },
    });
    const call = vi.mocked(prisma.automationRule.update).mock.calls[0][0] as any;
    expect(call.data.actionConfig.recipientId).toBe(adminUser.id);
  });

  it("scopes update to companyId", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.update).mockResolvedValue({ id: 1 } as any);
    await updateGlobalEventAutomation(updateInput);
    const call = vi.mocked(prisma.automationRule.update).mock.calls[0][0] as any;
    expect(call.where.companyId).toBe(100);
    expect(call.where.id).toBe(1);
  });

  it("uses default Hebrew name when name is not provided", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.update).mockResolvedValue({ id: 1 } as any);
    await updateGlobalEventAutomation({
      id: 1,
      minutesBefore: 15,
      actionType: "SEND_NOTIFICATION",
      actionConfig: { recipientId: 1 },
    });
    const call = vi.mocked(prisma.automationRule.update).mock.calls[0][0] as any;
    expect(call.data.name).toMatch(/אוטומציה קבועה לאירועים/);
    expect(call.data.name).toMatch(/\(15 דקות לפני\)/);
  });

  it("stores explicit custom name instead of Hebrew default", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.update).mockResolvedValue({ id: 1 } as any);
    await updateGlobalEventAutomation({ ...updateInput, name: "Custom Name" });
    const call = vi.mocked(prisma.automationRule.update).mock.calls[0][0] as any;
    expect(call.data.name).toBe("Custom Name");
  });

  it("returns success with data and does not call revalidatePath", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.update).mockResolvedValue({ id: 1 } as any);
    const res = await updateGlobalEventAutomation(updateInput);
    expect(res).toEqual({ success: true, data: { id: 1 } });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("returns error on DB failure", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.update).mockRejectedValue(new Error("DB"));
    const res = await updateGlobalEventAutomation(updateInput);
    expect(res).toEqual({ success: false, error: "Failed to update global automation" });
  });

  it("returns generic error for cross-company update (P2025 record not found)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const p2025 = Object.assign(new Error("Record to update not found."), { code: "P2025" });
    vi.mocked(prisma.automationRule.update).mockRejectedValue(p2025);
    const res = await updateGlobalEventAutomation(updateInput);
    expect(res).toEqual({ success: false, error: "Failed to update global automation" });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// deleteGlobalEventAutomation (delegates to deleteEventAutomation)
// ════════════════════════════════════════════════════════════════════════════

describe("deleteGlobalEventAutomation", () => {
  it("rejects invalid rule ID", async () => {
    const res = await deleteGlobalEventAutomation(0);
    expect(res).toEqual({ success: false, error: "Invalid rule ID" });
  });

  it("returns auth error when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await deleteGlobalEventAutomation(1);
    expect(res).toEqual({ success: false, error: "Authentication required" });
  });

  it("deletes with companyId scoping", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.delete).mockResolvedValue({} as any);
    const res = await deleteGlobalEventAutomation(5);
    expect(res).toEqual({ success: true });
    const call = vi.mocked(prisma.automationRule.delete).mock.calls[0][0] as any;
    expect(call.where.id).toBe(5);
    expect(call.where.companyId).toBe(100);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// createEventAutomation
// ════════════════════════════════════════════════════════════════════════════

describe("createEventAutomation", () => {
  it("returns auth error when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await createEventAutomation(validEventInput);
    expect(res).toEqual({ success: false, error: "Authentication required" });
  });

  it("returns Forbidden when user lacks canViewCalendar", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserNoPerms as any);
    const res = await createEventAutomation(validEventInput);
    expect(res).toEqual({ success: false, error: "Forbidden" });
  });

  it("allows basic user with canViewCalendar permission", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserWithCalPerm as any);
    vi.mocked(prisma.calendarEvent.findFirst).mockResolvedValue({ id: "evt-1" } as any);
    vi.mocked(prisma.automationRule.create).mockResolvedValue({ id: 1 } as any);
    const res = await createEventAutomation(validEventInput);
    expect(res.success).toBe(true);
    const createCall = vi.mocked(prisma.automationRule.create).mock.calls[0][0] as any;
    expect(createCall.data.createdBy).toBe(basicUserWithCalPerm.id);
  });

  it("returns rate limit error", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(checkActionRateLimit).mockResolvedValue(true);
    const res = await createEventAutomation(validEventInput);
    expect(res).toEqual({ success: false, error: "Rate limit exceeded. Please try again later." });
  });

  it("rejects invalid minutesBefore (Infinity)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const res = await createEventAutomation({ ...validEventInput, minutesBefore: Infinity });
    expect(res.success).toBe(false);
    expect(res.error).toBe("minutesBefore must be a number between 0 and 43200 (30 days)");
  });

  it("accepts minutesBefore: 0 (lower boundary)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.calendarEvent.findFirst).mockResolvedValue({ id: "evt-1" } as any);
    vi.mocked(prisma.automationRule.create).mockResolvedValue({ id: 1 } as any);
    const res = await createEventAutomation({ ...validEventInput, minutesBefore: 0 });
    expect(res.success).toBe(true);
    const createCall = vi.mocked(prisma.automationRule.create).mock.calls[0][0] as any;
    expect(createCall.data.triggerConfig.minutesBefore).toBe(0);
    expect(createCall.data.name).toContain("0 דקות לפני");
  });

  it("rejects missing eventId", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const res = await createEventAutomation({ ...validEventInput, eventId: "" });
    expect(res).toEqual({ success: false, error: "Invalid event ID" });
  });

  it("rejects eventId exceeding max length", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const res = await createEventAutomation({ ...validEventInput, eventId: "x".repeat(31) });
    expect(res).toEqual({ success: false, error: "Invalid event ID" });
  });

  it("accepts eventId at exact 30-char boundary", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const eventId30 = "x".repeat(30);
    vi.mocked(prisma.calendarEvent.findFirst).mockResolvedValue({ id: eventId30 } as any);
    vi.mocked(prisma.automationRule.create).mockResolvedValue({ id: 1 } as any);
    const res = await createEventAutomation({ ...validEventInput, eventId: eventId30 });
    expect(res.success).toBe(true);
  });

  it("returns error when event not found (cross-tenant protection)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.calendarEvent.findFirst).mockResolvedValue(null);
    const res = await createEventAutomation(validEventInput);
    expect(res).toEqual({ success: false, error: "Event not found" });
    // Verify companyId was used in the lookup
    const call = vi.mocked(prisma.calendarEvent.findFirst).mock.calls[0][0] as any;
    expect(call.where.companyId).toBe(100);
  });

  it("auto-injects recipientId for SEND_NOTIFICATION when missing", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.calendarEvent.findFirst).mockResolvedValue({ id: "evt-1" } as any);
    vi.mocked(prisma.automationRule.create).mockResolvedValue({ id: 1 } as any);
    await createEventAutomation({
      eventId: "evt-1",
      minutesBefore: 10,
      actionType: "SEND_NOTIFICATION",
      actionConfig: { messageTemplate: "Test" },
    });
    const createCall = vi.mocked(prisma.automationRule.create).mock.calls[0][0] as any;
    expect(createCall.data.actionConfig.recipientId).toBe(adminUser.id);
  });

  it("creates rule with calendarEventId set", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.calendarEvent.findFirst).mockResolvedValue({ id: "evt-1" } as any);
    vi.mocked(prisma.automationRule.create).mockResolvedValue({ id: 10 } as any);
    const res = await createEventAutomation(validEventInput);
    expect(res).toEqual({ success: true, data: { id: 10 } });
    const createCall = vi.mocked(prisma.automationRule.create).mock.calls[0][0] as any;
    expect(createCall.data.calendarEventId).toBe("evt-1");
    expect(createCall.data.companyId).toBe(100);
    expect(createCall.data.triggerType).toBe("EVENT_TIME");
    expect(createCall.data.createdBy).toBe(adminUser.id);
  });

  it("calls revalidatePath on success", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.calendarEvent.findFirst).mockResolvedValue({ id: "evt-1" } as any);
    vi.mocked(prisma.automationRule.create).mockResolvedValue({ id: 1 } as any);
    await createEventAutomation(validEventInput);
    expect(revalidatePath).toHaveBeenCalledWith("/calendar");
  });

  it("uses default Hebrew name when name is not provided", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.calendarEvent.findFirst).mockResolvedValue({ id: "evt-1" } as any);
    vi.mocked(prisma.automationRule.create).mockResolvedValue({ id: 1 } as any);
    await createEventAutomation(validEventInput);
    const createCall = vi.mocked(prisma.automationRule.create).mock.calls[0][0] as any;
    expect(createCall.data.name).toMatch(/אוטומציה לאירוע/);
    expect(createCall.data.name).toMatch(/\(30 דקות לפני\)/);
  });

  it("returns error on DB failure", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.calendarEvent.findFirst).mockResolvedValue({ id: "evt-1" } as any);
    vi.mocked(prisma.automationRule.create).mockRejectedValue(new Error("DB"));
    const res = await createEventAutomation(validEventInput);
    expect(res).toEqual({ success: false, error: "Failed to create automation" });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// getEventAutomations
// ════════════════════════════════════════════════════════════════════════════

describe("getEventAutomations", () => {
  it("returns auth error when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await getEventAutomations("evt-1");
    expect(res).toEqual({ success: false, error: "Authentication required" });
  });

  it("returns Forbidden when user lacks canViewCalendar", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserNoPerms as any);
    const res = await getEventAutomations("evt-1");
    expect(res).toEqual({ success: false, error: "Forbidden" });
  });

  it("returns rate limit error", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(checkActionRateLimit).mockResolvedValue(true);
    const res = await getEventAutomations("evt-1");
    expect(res).toEqual({ success: false, error: "Rate limit exceeded. Please try again later." });
  });

  it("rejects empty eventId", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const res = await getEventAutomations("");
    expect(res).toEqual({ success: false, error: "Invalid event ID" });
  });

  it("rejects eventId exceeding max length", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const res = await getEventAutomations("a".repeat(31));
    expect(res).toEqual({ success: false, error: "Invalid event ID" });
  });

  it("scopes query to companyId and eventId with take limit", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([]);
    await getEventAutomations("evt-1");
    const call = vi.mocked(prisma.automationRule.findMany).mock.calls[0][0] as any;
    expect(call.where.companyId).toBe(100);
    expect(call.where.calendarEventId).toBe("evt-1");
    expect(call.take).toBe(200);
  });

  it("returns data on success", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const rules = [{ id: 1, name: "R1" }];
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue(rules as any);
    const res = await getEventAutomations("evt-1");
    expect(res).toEqual({ success: true, data: rules });
  });

  it("returns error on DB failure", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.findMany).mockRejectedValue(new Error("DB"));
    const res = await getEventAutomations("evt-1");
    expect(res).toEqual({ success: false, error: "Failed to fetch event automations" });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// getMaxEventAutomationCount
// ════════════════════════════════════════════════════════════════════════════

describe("getMaxEventAutomationCount", () => {
  it("returns auth error when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await getMaxEventAutomationCount();
    expect(res).toEqual({ success: false, error: "Authentication required" });
  });

  it("returns Forbidden when user lacks canViewCalendar", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserNoPerms as any);
    const res = await getMaxEventAutomationCount();
    expect(res).toEqual({ success: false, error: "Forbidden" });
  });

  it("returns rate limit error", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(checkActionRateLimit).mockResolvedValue(true);
    const res = await getMaxEventAutomationCount();
    expect(res).toEqual({ success: false, error: "Rate limit exceeded. Please try again later." });
  });

  it("returns count from raw query", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ max_count: BigInt(7) }] as any);
    const res = await getMaxEventAutomationCount();
    expect(res).toEqual({ success: true, count: 7 });
  });

  it("returns 0 when no automations exist", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ max_count: BigInt(0) }] as any);
    const res = await getMaxEventAutomationCount();
    expect(res).toEqual({ success: true, count: 0 });
  });

  it("returns 0 when $queryRaw returns empty array (fallback path)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.$queryRaw).mockResolvedValue([] as any);
    const res = await getMaxEventAutomationCount();
    expect(res).toEqual({ success: true, count: 0 });
  });

  it("returns error on DB failure", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error("DB"));
    const res = await getMaxEventAutomationCount();
    expect(res).toEqual({ success: false, error: "Failed to fetch max count" });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// getEventModalInitData
// ════════════════════════════════════════════════════════════════════════════

describe("getEventModalInitData", () => {
  it("returns auth error when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await getEventModalInitData("evt-1");
    expect(res).toEqual({ success: false, error: "Authentication required" });
  });

  it("returns Forbidden when user lacks canViewCalendar", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserNoPerms as any);
    const res = await getEventModalInitData("evt-1");
    expect(res).toEqual({ success: false, error: "Forbidden" });
  });

  it("returns rate limit error", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(checkActionRateLimit).mockResolvedValue(true);
    const res = await getEventModalInitData("evt-1");
    expect(res).toEqual({ success: false, error: "Rate limit exceeded. Please try again later." });
  });

  it("queries event automations when valid eventId provided", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([{ id: 1 }] as any);
    vi.mocked(prisma.automationRule.count).mockResolvedValue(3);
    const res = await getEventModalInitData("evt-1");
    expect(res.success).toBe(true);
    const data = (res as any).data;
    expect(data.eventAutomations).toEqual([{ id: 1 }]);
    expect(data.globalAutomationCount).toBe(3);
    // Verify findMany was called with eventId
    const call = vi.mocked(prisma.automationRule.findMany).mock.calls[0][0] as any;
    expect(call.where.calendarEventId).toBe("evt-1");
    expect(call.where.companyId).toBe(100);
    // Verify count query filters for global-only automations
    const countCall = vi.mocked(prisma.automationRule.count).mock.calls[0][0] as any;
    expect(countCall.where.calendarEventId).toBeNull();
    expect(countCall.where.triggerType).toBe("EVENT_TIME");
    expect(countCall.where.companyId).toBe(100);
  });

  it("returns empty eventAutomations when no eventId provided", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.count).mockResolvedValue(5);
    const res = await getEventModalInitData();
    expect(res.success).toBe(true);
    const data = (res as any).data;
    expect(data.eventAutomations).toEqual([]);
    expect(data.globalAutomationCount).toBe(5);
    // findMany should NOT be called since no eventId
    expect(prisma.automationRule.findMany).not.toHaveBeenCalled();
  });

  it("falls back to empty when eventId is invalid", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.count).mockResolvedValue(2);
    const res = await getEventModalInitData("x".repeat(31));
    expect(res.success).toBe(true);
    const data = (res as any).data;
    expect(data.eventAutomations).toEqual([]);
    // findMany should NOT be called for invalid eventId
    expect(prisma.automationRule.findMany).not.toHaveBeenCalled();
  });

  it("includes userPlan in response", async () => {
    const premiumUser = { ...adminUser, isPremium: "premium" };
    vi.mocked(getCurrentUser).mockResolvedValue(premiumUser as any);
    vi.mocked(prisma.automationRule.count).mockResolvedValue(0);
    const res = await getEventModalInitData();
    expect((res as any).data.userPlan).toBe("premium");
  });

  it("falls back to 'basic' userPlan when isPremium is undefined", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.count).mockResolvedValue(0);
    const res = await getEventModalInitData();
    expect((res as any).data.userPlan).toBe("basic");
  });

  it("returns error on DB failure", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.count).mockRejectedValue(new Error("DB"));
    const res = await getEventModalInitData();
    expect(res).toEqual({ success: false, error: "Failed to fetch modal data" });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// getGlobalAutomationsModalData
// ════════════════════════════════════════════════════════════════════════════

describe("getGlobalAutomationsModalData", () => {
  it("returns auth error when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await getGlobalAutomationsModalData();
    expect(res).toEqual({ success: false, error: "Authentication required" });
  });

  it("returns Forbidden when user lacks canViewCalendar", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserNoPerms as any);
    const res = await getGlobalAutomationsModalData();
    expect(res).toEqual({ success: false, error: "Forbidden" });
  });

  it("returns rate limit error", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(checkActionRateLimit).mockResolvedValue(true);
    const res = await getGlobalAutomationsModalData();
    expect(res).toEqual({ success: false, error: "Rate limit exceeded. Please try again later." });
  });

  it("returns combined data with automations and maxSpecificCount", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([{ id: 1, name: "G1" }] as any);
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ max_count: BigInt(4) }] as any);
    const res = await getGlobalAutomationsModalData();
    expect(res.success).toBe(true);
    const data = (res as any).data;
    expect(data.automations).toEqual([{ id: 1, name: "G1" }]);
    expect(data.maxSpecificCount).toBe(4);
  });

  it("scopes global rules query to companyId", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([]);
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ max_count: BigInt(0) }] as any);
    await getGlobalAutomationsModalData();
    const call = vi.mocked(prisma.automationRule.findMany).mock.calls[0][0] as any;
    expect(call.where.companyId).toBe(100);
    expect(call.where.triggerType).toBe("EVENT_TIME");
    expect(call.where.calendarEventId).toBeNull();
  });

  it("includes userPlan in response", async () => {
    const premiumUser = { ...adminUser, isPremium: "premium" };
    vi.mocked(getCurrentUser).mockResolvedValue(premiumUser as any);
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([]);
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ max_count: BigInt(0) }] as any);
    const res = await getGlobalAutomationsModalData();
    expect((res as any).data.userPlan).toBe("premium");
  });

  it("falls back to 'basic' userPlan when isPremium is undefined", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([]);
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ max_count: BigInt(0) }] as any);
    const res = await getGlobalAutomationsModalData();
    expect((res as any).data.userPlan).toBe("basic");
  });

  it("returns error on DB failure", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.findMany).mockRejectedValue(new Error("DB"));
    const res = await getGlobalAutomationsModalData();
    expect(res).toEqual({ success: false, error: "Failed to fetch modal data" });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// updateEventAutomation
// ════════════════════════════════════════════════════════════════════════════

describe("updateEventAutomation", () => {
  const updateInput = { ...validInput, id: 1 };

  it("rejects invalid rule ID (0)", async () => {
    const res = await updateEventAutomation({ ...updateInput, id: 0 });
    expect(res).toEqual({ success: false, error: "Invalid rule ID" });
  });

  it("returns auth error when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await updateEventAutomation(updateInput);
    expect(res).toEqual({ success: false, error: "Authentication required" });
  });

  it("returns Forbidden when user lacks canViewCalendar", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserNoPerms as any);
    const res = await updateEventAutomation(updateInput);
    expect(res).toEqual({ success: false, error: "Forbidden" });
  });

  it("returns rate limit error", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(checkActionRateLimit).mockResolvedValue(true);
    const res = await updateEventAutomation(updateInput);
    expect(res).toEqual({ success: false, error: "Rate limit exceeded. Please try again later." });
  });

  it("rejects invalid action type", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const res = await updateEventAutomation({ ...updateInput, actionType: "BOGUS" });
    expect(res).toEqual({ success: false, error: "Invalid action type" });
  });

  it("auto-injects recipientId for SEND_NOTIFICATION", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.update).mockResolvedValue({ id: 1 } as any);
    await updateEventAutomation({
      id: 1,
      minutesBefore: 15,
      actionType: "SEND_NOTIFICATION",
      actionConfig: {},
    });
    const call = vi.mocked(prisma.automationRule.update).mock.calls[0][0] as any;
    expect(call.data.actionConfig.recipientId).toBe(adminUser.id);
  });

  it("scopes update to companyId", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.update).mockResolvedValue({ id: 1 } as any);
    await updateEventAutomation(updateInput);
    const call = vi.mocked(prisma.automationRule.update).mock.calls[0][0] as any;
    expect(call.where.companyId).toBe(100);
    expect(call.where.id).toBe(1);
  });

  it("uses default Hebrew name when name is not provided", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.update).mockResolvedValue({ id: 1 } as any);
    await updateEventAutomation(updateInput);
    const call = vi.mocked(prisma.automationRule.update).mock.calls[0][0] as any;
    expect(call.data.name).toMatch(/אוטומציה לאירוע/);
    expect(call.data.name).toMatch(/\(30 דקות לפני\)/);
  });

  it("calls revalidatePath on success", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.update).mockResolvedValue({ id: 1 } as any);
    await updateEventAutomation(updateInput);
    expect(revalidatePath).toHaveBeenCalledWith("/calendar");
  });

  it("returns error on DB failure", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.update).mockRejectedValue(new Error("DB"));
    const res = await updateEventAutomation(updateInput);
    expect(res).toEqual({ success: false, error: "Failed to update automation" });
  });

  it("returns generic error for cross-company update (P2025 record not found)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    // Prisma throws P2025 when companyId in where clause doesn't match
    const p2025 = Object.assign(new Error("Record to update not found."), { code: "P2025" });
    vi.mocked(prisma.automationRule.update).mockRejectedValue(p2025);
    const res = await updateEventAutomation(updateInput);
    // Should return generic error, NOT leak the P2025 details
    expect(res).toEqual({ success: false, error: "Failed to update automation" });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// deleteEventAutomation
// ════════════════════════════════════════════════════════════════════════════

describe("deleteEventAutomation", () => {
  it("rejects invalid rule ID (0)", async () => {
    const res = await deleteEventAutomation(0);
    expect(res).toEqual({ success: false, error: "Invalid rule ID" });
  });

  it("rejects negative rule ID", async () => {
    const res = await deleteEventAutomation(-1);
    expect(res).toEqual({ success: false, error: "Invalid rule ID" });
  });

  it("rejects fractional rule ID", async () => {
    const res = await deleteEventAutomation(2.5);
    expect(res).toEqual({ success: false, error: "Invalid rule ID" });
  });

  it("returns auth error when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await deleteEventAutomation(1);
    expect(res).toEqual({ success: false, error: "Authentication required" });
  });

  it("returns Forbidden when user lacks canViewCalendar", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserNoPerms as any);
    const res = await deleteEventAutomation(1);
    expect(res).toEqual({ success: false, error: "Forbidden" });
  });

  it("returns rate limit error", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(checkActionRateLimit).mockResolvedValue(true);
    const res = await deleteEventAutomation(1);
    expect(res).toEqual({ success: false, error: "Rate limit exceeded. Please try again later." });
  });

  it("deletes with companyId scoping", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.delete).mockResolvedValue({} as any);
    const res = await deleteEventAutomation(42);
    expect(res).toEqual({ success: true });
    const call = vi.mocked(prisma.automationRule.delete).mock.calls[0][0] as any;
    expect(call.where.id).toBe(42);
    expect(call.where.companyId).toBe(100);
  });

  it("calls revalidatePath on success", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.delete).mockResolvedValue({} as any);
    await deleteEventAutomation(1);
    expect(revalidatePath).toHaveBeenCalledWith("/calendar");
  });

  it("returns error on DB failure", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.delete).mockRejectedValue(new Error("DB"));
    const res = await deleteEventAutomation(1);
    expect(res).toEqual({ success: false, error: "Failed to delete automation" });
  });

  it("returns generic error for cross-company delete (P2025 record not found)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const p2025 = Object.assign(new Error("Record to delete does not exist."), { code: "P2025" });
    vi.mocked(prisma.automationRule.delete).mockRejectedValue(p2025);
    const res = await deleteEventAutomation(1);
    expect(res).toEqual({ success: false, error: "Failed to delete automation" });
  });
});

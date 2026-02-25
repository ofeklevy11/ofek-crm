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
      updateMany: vi.fn(),
    },
    viewFolder: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    $queryRaw: vi.fn(),
    $transaction: vi.fn((fn: any) => fn()),
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  checkActionRateLimit: vi.fn(),
  RATE_LIMITS: {
    automationRead: { prefix: "auto-read", max: 60, windowSeconds: 60 },
    automationMutate: { prefix: "auto-mut", max: 30, windowSeconds: 60 },
  },
}));

vi.mock("@/lib/db-retry", () => ({
  withRetry: vi.fn((fn: any) => fn()),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/security/ssrf", () => ({
  isPrivateUrl: vi.fn(),
}));

vi.mock("@/lib/services/analytics-cache", () => ({
  invalidateFullCache: vi.fn(),
}));

vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: vi.fn() },
}));

vi.mock("@/lib/notifications-internal", () => ({
  createNotificationForCompany: vi.fn(),
}));

import {
  getAutomationRules,
  createAutomationRule,
  updateAutomationRule,
  deleteAutomationRule,
  toggleAutomationRule,
  getViewAutomations,
  getAnalyticsAutomationsActionCount,
} from "@/app/actions/automations-core";
import { getCurrentUser } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { checkActionRateLimit } from "@/lib/rate-limit";
import { isPrivateUrl } from "@/lib/security/ssrf";
import { invalidateFullCache } from "@/lib/services/analytics-cache";
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

const basicUserWithPerm = {
  id: 2,
  companyId: 100,
  name: "Basic",
  email: "basic@test.com",
  role: "basic" as const,
  allowedWriteTableIds: [] as number[],
  permissions: { canViewAutomations: true } as Record<string, boolean>,
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

const validRuleInput = {
  name: "Test Rule",
  triggerType: "MANUAL",
  triggerConfig: {},
  actionType: "SEND_NOTIFICATION",
  actionConfig: { recipientId: 1 },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(checkActionRateLimit).mockResolvedValue(false);
  vi.mocked(isPrivateUrl).mockReturnValue(false);
  vi.mocked(invalidateFullCache).mockResolvedValue(undefined);
  vi.mocked(revalidatePath).mockReturnValue(undefined as any);
});

// ─── getAutomationRules ──────────────────────────────────────────────────

describe("getAutomationRules", () => {
  it("returns auth error when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await getAutomationRules();
    expect(res).toEqual({ success: false, error: "Authentication required" });
  });

  it("returns Forbidden when user lacks canViewAutomations", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserNoPerms as any);
    const res = await getAutomationRules();
    expect(res).toEqual({ success: false, error: "Forbidden" });
  });

  it("returns rate limit error when rate limited", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(checkActionRateLimit).mockResolvedValue(true);
    const res = await getAutomationRules();
    expect(res).toEqual({ success: false, error: "Rate limit exceeded. Please try again later." });
  });

  it("clamps limit to minimum 1", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([]);
    await getAutomationRules({ limit: -5 });
    const call = vi.mocked(prisma.automationRule.findMany).mock.calls[0][0] as any;
    expect(call.take).toBe(2); // 1 + 1 for hasMore check
  });

  it("clamps limit to maximum 500", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([]);
    await getAutomationRules({ limit: 9999 });
    const call = vi.mocked(prisma.automationRule.findMany).mock.calls[0][0] as any;
    expect(call.take).toBe(501); // 500 + 1 for hasMore check
  });

  it("returns data with hasMore and nextCursor when more exist", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const rules = Array.from({ length: 3 }, (_, i) => ({
      id: i + 1, name: `Rule ${i}`, triggerType: "MANUAL", triggerConfig: {},
      actionType: "SEND_NOTIFICATION", actionConfig: {}, isActive: true,
      folderId: null, calendarEventId: null, createdAt: new Date(),
    }));
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue(rules as any);
    const res = await getAutomationRules({ limit: 2 });
    expect(res.success).toBe(true);
    expect((res as any).hasMore).toBe(true);
    expect((res as any).data).toHaveLength(2);
    expect((res as any).nextCursor).toBe(2);
  });

  it("uses cursor for pagination", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([]);
    await getAutomationRules({ cursor: 42, limit: 10 });
    const call = vi.mocked(prisma.automationRule.findMany).mock.calls[0][0] as any;
    expect(call.cursor).toEqual({ id: 42 });
    expect(call.skip).toBe(1);
  });

  it("scopes query to user companyId", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([]);
    await getAutomationRules();
    const call = vi.mocked(prisma.automationRule.findMany).mock.calls[0][0] as any;
    expect(call.where.companyId).toBe(100);
  });

  it("returns error on DB failure", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.findMany).mockRejectedValue(new Error("DB down"));
    const res = await getAutomationRules();
    expect(res).toEqual({ success: false, error: "Failed to fetch automation rules" });
  });
});

// ─── createAutomationRule ────────────────────────────────────────────────

describe("createAutomationRule", () => {
  it("returns auth error when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await createAutomationRule(validRuleInput);
    expect(res).toEqual({ success: false, error: "Authentication required" });
  });

  it("returns Forbidden when user lacks canViewAutomations", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserNoPerms as any);
    const res = await createAutomationRule(validRuleInput);
    expect(res).toEqual({ success: false, error: "Forbidden" });
  });

  it("returns rate limit error when rate limited", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(checkActionRateLimit).mockResolvedValue(true);
    const res = await createAutomationRule(validRuleInput);
    expect(res).toEqual({ success: false, error: "Rate limit exceeded. Please try again later." });
  });

  it("returns validation error for invalid input", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const res = await createAutomationRule({ ...validRuleInput, name: "" });
    expect(res.success).toBe(false);
    expect(res.error).toBe("Name is required");
  });

  it("returns error when max 500 rules reached", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.count).mockResolvedValue(500);
    const res = await createAutomationRule(validRuleInput);
    expect(res.success).toBe(false);
    expect(res.error).toContain("Maximum of 500");
  });

  it("blocks SSRF on top-level webhook URL", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.count).mockResolvedValue(0);
    vi.mocked(isPrivateUrl).mockReturnValue(true);
    const res = await createAutomationRule({
      ...validRuleInput,
      actionType: "WEBHOOK",
      actionConfig: { webhookUrl: "http://169.254.169.254/metadata" },
    });
    expect(res.success).toBe(false);
    expect(res.error).toContain("private/internal");
  });

  it("blocks SSRF on nested MULTI_ACTION webhook", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.count).mockResolvedValue(0);
    vi.mocked(isPrivateUrl).mockReturnValue(true);
    const res = await createAutomationRule({
      ...validRuleInput,
      actionType: "MULTI_ACTION",
      actionConfig: {
        actions: [{ type: "WEBHOOK", config: { url: "http://10.0.0.1" } }],
      },
    });
    expect(res.success).toBe(false);
    expect(res.error).toContain("private/internal");
  });

  it("rejects TIME_SINCE_CREATION with minutes < 5", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.count).mockResolvedValue(0);
    const res = await createAutomationRule({
      ...validRuleInput,
      triggerType: "TIME_SINCE_CREATION",
      triggerConfig: { timeValue: 3, timeUnit: "minutes", tableId: 1 },
    });
    expect(res.success).toBe(false);
    expect(res.error).toContain("5 דקות");
  });

  it("auto-creates folder for TASK_STATUS_CHANGE trigger", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.count).mockResolvedValue(0);
    vi.mocked(prisma.viewFolder.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.viewFolder.create).mockResolvedValue({ id: 55 } as any);
    vi.mocked(prisma.automationRule.create).mockResolvedValue({ id: 1, ...validRuleInput } as any);
    const res = await createAutomationRule({
      ...validRuleInput,
      triggerType: "TASK_STATUS_CHANGE",
      triggerConfig: {},
    });
    expect(res.success).toBe(true);
    expect(vi.mocked(prisma.viewFolder.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          companyId: 100,
          name: "אוטומציות משימות",
          type: "AUTOMATION",
        }),
      }),
    );
  });

  it("handles P2002 race on folder creation", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.count).mockResolvedValue(0);
    vi.mocked(prisma.viewFolder.findFirst)
      .mockResolvedValueOnce(null)   // initial check
      .mockResolvedValueOnce({ id: 99 } as any); // after P2002 retry
    vi.mocked(prisma.viewFolder.create).mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }));
    vi.mocked(prisma.automationRule.create).mockResolvedValue({ id: 1, ...validRuleInput } as any);
    const res = await createAutomationRule({
      ...validRuleInput,
      triggerType: "TICKET_STATUS_CHANGE",
      triggerConfig: {},
    });
    expect(res.success).toBe(true);
  });

  it("trims name before saving", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.count).mockResolvedValue(0);
    vi.mocked(prisma.automationRule.create).mockResolvedValue({ id: 1 } as any);
    await createAutomationRule({ ...validRuleInput, name: "  trimme  " });
    const call = vi.mocked(prisma.automationRule.create).mock.calls[0][0] as any;
    expect(call.data.name).toBe("trimme");
  });

  it("invalidates cache after creation", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.count).mockResolvedValue(0);
    vi.mocked(prisma.automationRule.create).mockResolvedValue({ id: 1 } as any);
    await createAutomationRule(validRuleInput);
    expect(invalidateFullCache).toHaveBeenCalledWith(100);
    expect(revalidatePath).toHaveBeenCalledWith("/automations");
  });

  it("returns error on DB failure", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.count).mockResolvedValue(0);
    vi.mocked(prisma.automationRule.create).mockRejectedValue(new Error("DB fail"));
    const res = await createAutomationRule(validRuleInput);
    expect(res).toEqual({ success: false, error: "Failed to create automation rule" });
  });
});

// ─── updateAutomationRule ────────────────────────────────────────────────

describe("updateAutomationRule", () => {
  it("returns auth error when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await updateAutomationRule(1, validRuleInput);
    expect(res).toEqual({ success: false, error: "Authentication required" });
  });

  it("returns Forbidden when user lacks canViewAutomations", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserNoPerms as any);
    const res = await updateAutomationRule(1, validRuleInput);
    expect(res).toEqual({ success: false, error: "Forbidden" });
  });

  it("returns ID validation error", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const res = await updateAutomationRule(-1, validRuleInput);
    expect(res).toEqual({ success: false, error: "Invalid ID" });
  });

  it("returns rate limit error when rate limited", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(checkActionRateLimit).mockResolvedValue(true);
    const res = await updateAutomationRule(1, validRuleInput);
    expect(res).toEqual({ success: false, error: "Rate limit exceeded. Please try again later." });
  });

  it("returns validation error for invalid input", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const res = await updateAutomationRule(1, { ...validRuleInput, triggerType: "INVALID" });
    expect(res.success).toBe(false);
    expect(res.error).toBe("Invalid trigger type");
  });

  it("blocks SSRF on webhook URL", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(isPrivateUrl).mockReturnValue(true);
    const res = await updateAutomationRule(1, {
      ...validRuleInput,
      actionType: "WEBHOOK",
      actionConfig: { webhookUrl: "http://10.0.0.1" },
    });
    expect(res.success).toBe(false);
    expect(res.error).toContain("private/internal");
  });

  it("rejects TIME_SINCE_CREATION with minutes < 5", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const res = await updateAutomationRule(1, {
      ...validRuleInput,
      triggerType: "TIME_SINCE_CREATION",
      triggerConfig: { timeValue: 2, timeUnit: "minutes", tableId: 1 },
    });
    expect(res.success).toBe(false);
  });

  it("trims name before saving", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.update).mockResolvedValue({ id: 1 } as any);
    await updateAutomationRule(1, { ...validRuleInput, name: "  spaced  " });
    const call = vi.mocked(prisma.automationRule.update).mock.calls[0][0] as any;
    expect(call.data.name).toBe("spaced");
  });

  it("scopes update to company", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.update).mockResolvedValue({ id: 1 } as any);
    await updateAutomationRule(5, validRuleInput);
    const call = vi.mocked(prisma.automationRule.update).mock.calls[0][0] as any;
    expect(call.where).toEqual({ id: 5, companyId: 100 });
  });

  it("returns error on DB failure", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.update).mockRejectedValue(new Error("fail"));
    const res = await updateAutomationRule(1, validRuleInput);
    expect(res).toEqual({ success: false, error: "Failed to update automation rule" });
  });
});

// ─── deleteAutomationRule ────────────────────────────────────────────────

describe("deleteAutomationRule", () => {
  it("returns auth error when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await deleteAutomationRule(1);
    expect(res).toEqual({ success: false, error: "Authentication required" });
  });

  it("returns Forbidden when user lacks canViewAutomations", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserNoPerms as any);
    const res = await deleteAutomationRule(1);
    expect(res).toEqual({ success: false, error: "Forbidden" });
  });

  it("returns ID validation error", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const res = await deleteAutomationRule(0);
    expect(res).toEqual({ success: false, error: "Invalid ID" });
  });

  it("returns rate limit error when rate limited", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(checkActionRateLimit).mockResolvedValue(true);
    const res = await deleteAutomationRule(1);
    expect(res).toEqual({ success: false, error: "Rate limit exceeded. Please try again later." });
  });

  it("scopes delete to company", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.delete).mockResolvedValue({} as any);
    await deleteAutomationRule(7);
    const call = vi.mocked(prisma.automationRule.delete).mock.calls[0][0] as any;
    expect(call.where).toEqual({ id: 7, companyId: 100 });
  });

  it("invalidates cache after deletion", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.delete).mockResolvedValue({} as any);
    await deleteAutomationRule(1);
    expect(invalidateFullCache).toHaveBeenCalledWith(100);
    expect(revalidatePath).toHaveBeenCalledWith("/automations");
  });

  it("returns error on DB failure", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.delete).mockRejectedValue(new Error("fail"));
    const res = await deleteAutomationRule(1);
    expect(res).toEqual({ success: false, error: "Failed to delete automation rule" });
  });
});

// ─── toggleAutomationRule ────────────────────────────────────────────────

describe("toggleAutomationRule", () => {
  it("returns auth error when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await toggleAutomationRule(1, true);
    expect(res).toEqual({ success: false, error: "Authentication required" });
  });

  it("returns Forbidden when user lacks canViewAutomations", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserNoPerms as any);
    const res = await toggleAutomationRule(1, true);
    expect(res).toEqual({ success: false, error: "Forbidden" });
  });

  it("returns ID validation error", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const res = await toggleAutomationRule(-5, true);
    expect(res).toEqual({ success: false, error: "Invalid ID" });
  });

  it("returns rate limit error when rate limited", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(checkActionRateLimit).mockResolvedValue(true);
    const res = await toggleAutomationRule(1, true);
    expect(res).toEqual({ success: false, error: "Rate limit exceeded. Please try again later." });
  });

  it("toggles to true", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.update).mockResolvedValue({} as any);
    await toggleAutomationRule(1, true);
    const call = vi.mocked(prisma.automationRule.update).mock.calls[0][0] as any;
    expect(call.data.isActive).toBe(true);
  });

  it("toggles to false", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.update).mockResolvedValue({} as any);
    await toggleAutomationRule(1, false);
    const call = vi.mocked(prisma.automationRule.update).mock.calls[0][0] as any;
    expect(call.data.isActive).toBe(false);
  });

  it("scopes update to company", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.update).mockResolvedValue({} as any);
    await toggleAutomationRule(10, true);
    const call = vi.mocked(prisma.automationRule.update).mock.calls[0][0] as any;
    expect(call.where).toEqual({ id: 10, companyId: 100 });
  });

  it("returns error on DB failure", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.update).mockRejectedValue(new Error("fail"));
    const res = await toggleAutomationRule(1, true);
    expect(res).toEqual({ success: false, error: "Failed to toggle automation rule" });
  });
});

// ─── getViewAutomations ──────────────────────────────────────────────────

describe("getViewAutomations", () => {
  it("returns Unauthorized when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await getViewAutomations(1);
    expect(res).toEqual({ success: false, error: "Unauthorized" });
  });

  it("returns Forbidden when user lacks canViewAutomations", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserNoPerms as any);
    const res = await getViewAutomations(1);
    expect(res).toEqual({ success: false, error: "Forbidden" });
  });

  it("returns rate limit error when rate limited", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(checkActionRateLimit).mockResolvedValue(true);
    const res = await getViewAutomations(1);
    expect(res).toEqual({ success: false, error: "Rate limit exceeded. Please try again later." });
  });

  it("returns ID validation error for invalid viewId", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const res = await getViewAutomations(-1);
    expect(res).toEqual({ success: false, error: "Invalid ID" });
  });

  it("queries both Number and String viewId", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([]);
    await getViewAutomations(42);
    const call = vi.mocked(prisma.automationRule.findMany).mock.calls[0][0] as any;
    expect(call.where.OR).toEqual([
      { triggerConfig: { path: ["viewId"], equals: 42 } },
      { triggerConfig: { path: ["viewId"], equals: "42" } },
    ]);
  });

  it("returns error on DB failure", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.findMany).mockRejectedValue(new Error("fail"));
    const res = await getViewAutomations(1);
    expect(res).toEqual({ success: false, error: "Failed to fetch view automations" });
  });
});

// ─── getAnalyticsAutomationsActionCount ──────────────────────────────────

describe("getAnalyticsAutomationsActionCount", () => {
  it("returns Unauthorized when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await getAnalyticsAutomationsActionCount();
    expect(res).toEqual({ success: false, error: "Unauthorized", count: 0 });
  });

  it("returns Forbidden when user lacks canViewAutomations", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserNoPerms as any);
    const res = await getAnalyticsAutomationsActionCount();
    expect(res).toEqual({ success: false, error: "Forbidden", count: 0 });
  });

  it("returns rate limit error when rate limited", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(checkActionRateLimit).mockResolvedValue(true);
    const res = await getAnalyticsAutomationsActionCount();
    expect(res).toEqual({ success: false, error: "Rate limit exceeded", count: 0 });
  });

  it("counts single actions as 1 each", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([
      { actionType: "SEND_NOTIFICATION", actionConfig: {} },
      { actionType: "WEBHOOK", actionConfig: {} },
    ] as any);
    const res = await getAnalyticsAutomationsActionCount();
    expect(res).toEqual({ success: true, count: 2 });
  });

  it("counts MULTI_ACTION sub-actions", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([
      {
        actionType: "MULTI_ACTION",
        actionConfig: { actions: [{ type: "WEBHOOK" }, { type: "SEND_NOTIFICATION" }, { type: "CREATE_TASK" }] },
      },
    ] as any);
    const res = await getAnalyticsAutomationsActionCount();
    expect(res).toEqual({ success: true, count: 3 });
  });

  it("combines single + MULTI_ACTION counts", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.findMany).mockResolvedValue([
      { actionType: "SEND_NOTIFICATION", actionConfig: {} },
      {
        actionType: "MULTI_ACTION",
        actionConfig: { actions: [{ type: "A" }, { type: "B" }] },
      },
    ] as any);
    const res = await getAnalyticsAutomationsActionCount();
    expect(res).toEqual({ success: true, count: 3 });
  });

  it("returns error on DB failure", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.automationRule.findMany).mockRejectedValue(new Error("fail"));
    const res = await getAnalyticsAutomationsActionCount();
    expect(res).toEqual({ success: false, error: "Failed to count actions", count: 0 });
  });
});

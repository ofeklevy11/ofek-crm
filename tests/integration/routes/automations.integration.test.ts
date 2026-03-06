import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";

// ── MOCK (infrastructure only — keep everything else real) ──────────────────
vi.mock("@/lib/permissions-server", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkActionRateLimit: vi.fn(),
  RATE_LIMITS: {
    automationMutate: { prefix: "auto-mut", max: 30, windowSeconds: 60 },
    automationRead: { prefix: "auto-read", max: 60, windowSeconds: 60 },
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/services/analytics-cache", () => ({
  invalidateFullCache: vi.fn(),
}));

vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: vi.fn() },
}));

// ── REAL: prisma, validation, permissions, ssrf, db-retry ───────────────────
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { checkActionRateLimit } from "@/lib/rate-limit";
import { revalidatePath } from "next/cache";
import { invalidateFullCache } from "@/lib/services/analytics-cache";

import {
  createAutomationRule,
  getAutomationRules,
  updateAutomationRule,
  deleteAutomationRule,
  toggleAutomationRule,
  getViewAutomations,
  getAnalyticsAutomationsActionCount,
} from "@/app/actions/automations-core";

// ── Helpers ─────────────────────────────────────────────────────────────────

function validRuleInput(overrides?: Record<string, unknown>) {
  return {
    name: "שליחת התראה בשינוי סטטוס",
    triggerType: "MANUAL",
    triggerConfig: {},
    actionType: "SEND_NOTIFICATION",
    actionConfig: { recipientId: 1, messageTemplate: "עדכון חדש במערכת" },
    ...overrides,
  };
}

function mockUser(user: Record<string, unknown>) {
  vi.mocked(getCurrentUser).mockResolvedValue({
    allowedWriteTableIds: [],
    ...user,
  } as any);
}

/** Shared seed helper — used across all describe blocks */
async function seedRule(companyId: number, overrides: Record<string, unknown> = {}) {
  return prisma.automationRule.create({
    data: {
      companyId,
      name: overrides.name as string ?? "אוטומציה לדוגמה",
      triggerType: (overrides.triggerType as any) ?? "MANUAL",
      actionType: (overrides.actionType as any) ?? "SEND_NOTIFICATION",
      triggerConfig: (overrides.triggerConfig as any) ?? {},
      actionConfig: (overrides.actionConfig as any) ?? {},
      isActive: overrides.isActive as boolean ?? true,
      ...(overrides.createdBy !== undefined ? { createdBy: overrides.createdBy as number } : {}),
      ...(overrides.folderId !== undefined ? { folderId: overrides.folderId as number } : {}),
      ...(overrides.calendarEventId !== undefined ? { calendarEventId: overrides.calendarEventId as number } : {}),
    },
  });
}

// ── State ───────────────────────────────────────────────────────────────────
let companyA: number;
let companyB: number;
let adminA: { id: number; companyId: number; name: string; email: string; role: string; permissions: Record<string, boolean> };
let basicWithPermsA: typeof adminA;
let noPermsA: typeof adminA;
let adminB: typeof adminA;

const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// ── Setup / Teardown ────────────────────────────────────────────────────────

beforeAll(async () => {
  const coA = await prisma.company.create({ data: { name: "Auto Co A", slug: `auto-co-a-${suffix}` } });
  const coB = await prisma.company.create({ data: { name: "Auto Co B", slug: `auto-co-b-${suffix}` } });
  companyA = coA.id;
  companyB = coB.id;

  const mkUser = async (compId: number, name: string, role: string, perms: Record<string, boolean>) => {
    const u = await prisma.user.create({
      data: {
        companyId: compId,
        name,
        email: `${name.toLowerCase().replace(/\s/g, "-")}-${suffix}@test.com`,
        passwordHash: "$unused$",
        role: role as any,
        permissions: perms,
        allowedWriteTableIds: [],
      },
    });
    return { id: u.id, companyId: u.companyId, name: u.name, email: u.email, role: u.role, permissions: perms };
  };

  adminA = await mkUser(companyA, "AutoAdmin A", "admin", {});
  basicWithPermsA = await mkUser(companyA, "AutoBasic A", "basic", { canViewAutomations: true });
  noPermsA = await mkUser(companyA, "AutoNoPerms A", "basic", {});
  adminB = await mkUser(companyB, "AutoAdmin B", "admin", {});
});

afterEach(async () => {
  // FK-safe order: AutomationLog → StatusDuration → MultiEventDuration → AutomationRule → ViewFolder
  const companyIds = [companyA, companyB];
  await prisma.automationLog.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.statusDuration.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.multiEventDuration.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.automationRule.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.viewFolder.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.calendarEvent.deleteMany({ where: { companyId: { in: companyIds } } });

  vi.clearAllMocks();
  // Re-default mocks
  vi.mocked(checkActionRateLimit).mockResolvedValue(false);
  vi.mocked(invalidateFullCache).mockResolvedValue(undefined as any);
  vi.mocked(revalidatePath).mockReturnValue(undefined as any);
});

afterAll(async () => {
  if (!companyA) return;
  const companyIds = [companyA, companyB];
  await prisma.automationLog.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.statusDuration.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.multiEventDuration.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.automationRule.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.viewFolder.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.calendarEvent.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.user.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  await prisma.$disconnect();
});

// ═════════════════════════════════════════════════════════════════════════════
// createAutomationRule
// ═════════════════════════════════════════════════════════════════════════════

describe("createAutomationRule", () => {
  // ── Happy paths ────────────────────────────────────────────────────────
  it("creates a minimal MANUAL rule and persists to DB", async () => {
    mockUser(adminA);
    const res = await createAutomationRule(validRuleInput());

    expect(res.success).toBe(true);
    expect(res.data).toBeDefined();
    expect(res.data!.name).toBe("שליחת התראה בשינוי סטטוס");
    expect(res.data!.triggerType).toBe("MANUAL");
    expect(res.data!.actionType).toBe("SEND_NOTIFICATION");
    expect(res.data!.isActive).toBe(true);

    // Verify in DB
    const dbRule = await prisma.automationRule.findUnique({ where: { id: res.data!.id } });
    expect(dbRule).not.toBeNull();
    expect(dbRule!.companyId).toBe(companyA);
    expect(dbRule!.createdBy).toBe(adminA.id);
  });

  it("trims whitespace from the name", async () => {
    mockUser(adminA);
    const res = await createAutomationRule(validRuleInput({ name: "  שם עם רווחים  " }));
    expect(res.success).toBe(true);
    expect(res.data!.name).toBe("שם עם רווחים");

    const dbRule = await prisma.automationRule.findUnique({ where: { id: res.data!.id } });
    expect(dbRule!.name).toBe("שם עם רווחים");
  });

  it("creates a rule with complex configs", async () => {
    mockUser(adminA);
    const triggerConfig = { tableId: 1, columnId: "status", fromValue: "חדש", toValue: "הושלם" };
    const actionConfig = {
      actions: [
        { type: "SEND_NOTIFICATION", config: { recipientId: 1, messageTemplate: "הרשומה עודכנה" } },
        { type: "CREATE_TASK", config: { title: "משימת מעקב" } },
      ],
    };
    const res = await createAutomationRule(validRuleInput({
      name: "עדכון שדה וגם יצירת משימה",
      triggerType: "RECORD_FIELD_CHANGE",
      triggerConfig,
      actionType: "MULTI_ACTION",
      actionConfig,
    }));
    expect(res.success).toBe(true);
    expect(res.data!.triggerType).toBe("RECORD_FIELD_CHANGE");
    expect(res.data!.actionType).toBe("MULTI_ACTION");

    const dbRule = await prisma.automationRule.findUnique({ where: { id: res.data!.id } });
    expect(dbRule!.triggerConfig).toEqual(triggerConfig);
    expect(dbRule!.actionConfig).toEqual(actionConfig);
  });

  it("basic user with canViewAutomations can create rules", async () => {
    mockUser(basicWithPermsA);
    const res = await createAutomationRule(validRuleInput());
    expect(res.success).toBe(true);
    expect(res.data!.name).toBe("שליחת התראה בשינוי סטטוס");
  });

  it("isActive defaults to true", async () => {
    mockUser(adminA);
    const res = await createAutomationRule(validRuleInput());
    expect(res.success).toBe(true);
    expect(res.data!.isActive).toBe(true);

    const dbRule = await prisma.automationRule.findUnique({ where: { id: res.data!.id } });
    expect(dbRule!.isActive).toBe(true);
  });

  it("description defaults to null in DB", async () => {
    mockUser(adminA);
    const res = await createAutomationRule(validRuleInput());
    expect(res.success).toBe(true);

    const dbRule = await prisma.automationRule.findUnique({ where: { id: res.data!.id } });
    expect(dbRule!.description).toBeNull();
  });

  // ── Response shape ──────────────────────────────────────────────────────
  it("response contains all expected fields", async () => {
    mockUser(adminA);
    const res = await createAutomationRule(validRuleInput());
    expect(res.success).toBe(true);

    const expectedKeys = [
      "id", "name", "triggerType", "triggerConfig", "actionType", "actionConfig",
      "isActive", "folderId", "calendarEventId", "createdBy", "createdAt", "updatedAt",
    ];
    const actualKeys = Object.keys(res.data!).sort();
    expect(actualKeys).toEqual(expectedKeys.sort());
    expect(res.data!.createdBy).toBe(adminA.id);
  });

  // ── Side effects ──────────────────────────────────────────────────────
  it("calls invalidateFullCache and revalidatePath after create", async () => {
    mockUser(adminA);
    await createAutomationRule(validRuleInput());

    expect(invalidateFullCache).toHaveBeenCalledWith(companyA);
    expect(revalidatePath).toHaveBeenCalledWith("/automations");
    expect(revalidatePath).toHaveBeenCalledWith("/analytics");
  });

  it("does NOT call side effects on auth failure", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null as any);
    await createAutomationRule(validRuleInput());

    expect(invalidateFullCache).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("does NOT call side effects on validation failure", async () => {
    mockUser(adminA);
    await createAutomationRule(validRuleInput({ name: "" }));

    expect(invalidateFullCache).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("does NOT call side effects on SSRF failure", async () => {
    mockUser(adminA);
    await createAutomationRule(validRuleInput({
      actionType: "WEBHOOK",
      actionConfig: { webhookUrl: "http://127.0.0.1/hook" },
    }));

    expect(invalidateFullCache).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("does NOT call side effects on rate-limit failure", async () => {
    mockUser(adminA);
    vi.mocked(checkActionRateLimit).mockResolvedValue(true);
    await createAutomationRule(validRuleInput());

    expect(invalidateFullCache).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("does NOT call side effects on max-rules-exceeded", async () => {
    mockUser(adminA);
    await prisma.automationRule.createMany({
      data: Array.from({ length: 500 }, (_, i) => ({
        companyId: companyA,
        name: `כלל מס׳ ${i}`,
        triggerType: "MANUAL" as any,
        actionType: "SEND_NOTIFICATION" as any,
        actionConfig: {},
        triggerConfig: {},
      })),
    });
    await createAutomationRule(validRuleInput({ name: "הכלל ה-501" }));
    expect(invalidateFullCache).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  // ── All valid trigger types ────────────────────────────────────────────
  const triggerTypes = [
    "MANUAL", "TASK_STATUS_CHANGE", "RECORD_CREATE", "NEW_RECORD",
    "RECORD_FIELD_CHANGE", "MULTI_EVENT_DURATION", "DIRECT_DIAL",
    "VIEW_METRIC_THRESHOLD", "TIME_SINCE_CREATION", "TICKET_STATUS_CHANGE",
    "SLA_BREACH", "EVENT_TIME",
  ];

  for (const tt of triggerTypes) {
    it(`accepts trigger type: ${tt}`, async () => {
      mockUser(adminA);
      const config = tt === "TIME_SINCE_CREATION"
        ? { timeValue: 10, timeUnit: "minutes" }
        : {};
      const res = await createAutomationRule(validRuleInput({ triggerType: tt, triggerConfig: config }));
      expect(res.success).toBe(true);
      expect(res.data!.triggerType).toBe(tt);
    });
  }

  it("persists a representative trigger type (RECORD_CREATE) to DB", async () => {
    mockUser(adminA);
    const res = await createAutomationRule(validRuleInput({
      triggerType: "RECORD_CREATE",
      triggerConfig: { tableId: 7 },
    }));
    expect(res.success).toBe(true);

    const dbRule = await prisma.automationRule.findUnique({ where: { id: res.data!.id } });
    expect(dbRule!.triggerType).toBe("RECORD_CREATE");
    expect((dbRule!.triggerConfig as any).tableId).toBe(7);
  });

  // ── All valid action types ─────────────────────────────────────────────
  const actionTypes = [
    "SEND_NOTIFICATION", "CALCULATE_DURATION", "CALCULATE_MULTI_EVENT_DURATION",
    "UPDATE_RECORD_FIELD", "SEND_WHATSAPP", "WEBHOOK", "ADD_TO_NURTURE_LIST",
    "CREATE_TASK", "CREATE_RECORD", "CREATE_CALENDAR_EVENT", "MULTI_ACTION",
  ];

  for (const at of actionTypes) {
    it(`accepts action type: ${at}`, async () => {
      mockUser(adminA);
      const config = at === "WEBHOOK"
        ? { webhookUrl: "https://example.com/hook" }
        : at === "MULTI_ACTION"
          ? { actions: [{ type: "SEND_NOTIFICATION", config: { recipientId: 1 } }] }
          : { recipientId: 1 };
      const res = await createAutomationRule(validRuleInput({ actionType: at, actionConfig: config }));
      expect(res.success).toBe(true);
      expect(res.data!.actionType).toBe(at);
    });
  }

  it("persists a representative action type (WEBHOOK) to DB", async () => {
    mockUser(adminA);
    const webhookConfig = { webhookUrl: "https://hooks.example.com/test" };
    const res = await createAutomationRule(validRuleInput({
      actionType: "WEBHOOK",
      actionConfig: webhookConfig,
    }));
    expect(res.success).toBe(true);

    const dbRule = await prisma.automationRule.findUnique({ where: { id: res.data!.id } });
    expect(dbRule!.actionType).toBe("WEBHOOK");
    expect(dbRule!.actionConfig).toEqual(webhookConfig);
  });

  // ── Auto-folder creation ──────────────────────────────────────────────
  it("TICKET_STATUS_CHANGE auto-creates service folder", async () => {
    mockUser(adminA);
    const res = await createAutomationRule(validRuleInput({ triggerType: "TICKET_STATUS_CHANGE" }));
    expect(res.success).toBe(true);
    expect(res.data!.folderId).not.toBeNull();

    const folder = await prisma.viewFolder.findUnique({ where: { id: res.data!.folderId! } });
    expect(folder).not.toBeNull();
    expect(folder!.name).toBe("אוטומציות שירות");
    expect(folder!.type).toBe("AUTOMATION");
  });

  it("SLA_BREACH uses same service folder", async () => {
    mockUser(adminA);
    const r1 = await createAutomationRule(validRuleInput({ name: "התראת שירות 1", triggerType: "TICKET_STATUS_CHANGE" }));
    const r2 = await createAutomationRule(validRuleInput({ name: "התראת שירות 2", triggerType: "SLA_BREACH" }));
    expect(r1.data!.folderId).toBe(r2.data!.folderId);
  });

  it("TASK_STATUS_CHANGE auto-creates tasks folder", async () => {
    mockUser(adminA);
    const res = await createAutomationRule(validRuleInput({ triggerType: "TASK_STATUS_CHANGE" }));
    expect(res.success).toBe(true);
    const folder = await prisma.viewFolder.findUnique({ where: { id: res.data!.folderId! } });
    expect(folder!.name).toBe("אוטומציות משימות");
  });

  it("MULTI_EVENT_DURATION auto-creates multi-event folder", async () => {
    mockUser(adminA);
    const res = await createAutomationRule(validRuleInput({ triggerType: "MULTI_EVENT_DURATION" }));
    expect(res.success).toBe(true);
    const folder = await prisma.viewFolder.findUnique({ where: { id: res.data!.folderId! } });
    expect(folder!.name).toBe("אוטומציות אירועים מרובים");
  });

  it("MANUAL does not create a folder", async () => {
    mockUser(adminA);
    const res = await createAutomationRule(validRuleInput({ triggerType: "MANUAL" }));
    expect(res.success).toBe(true);
    expect(res.data!.folderId).toBeNull();
  });

  it("reuses existing folder (no duplicates)", async () => {
    mockUser(adminA);
    await createAutomationRule(validRuleInput({ name: "אוטומציה 1", triggerType: "TASK_STATUS_CHANGE" }));
    await createAutomationRule(validRuleInput({ name: "אוטומציה 2", triggerType: "TASK_STATUS_CHANGE" }));

    const folders = await prisma.viewFolder.findMany({
      where: { companyId: companyA, name: "אוטומציות משימות", type: "AUTOMATION" },
    });
    expect(folders).toHaveLength(1);
  });

  // ── Auth / Permissions ────────────────────────────────────────────────
  it("null user returns authentication required", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null as any);
    const res = await createAutomationRule(validRuleInput());
    expect(res.success).toBe(false);
    expect(res.error).toBe("Authentication required");
  });

  it("user without canViewAutomations returns Forbidden", async () => {
    mockUser(noPermsA);
    const res = await createAutomationRule(validRuleInput());
    expect(res.success).toBe(false);
    expect(res.error).toBe("Forbidden");
  });

  it("rate-limited user is rejected", async () => {
    mockUser(adminA);
    vi.mocked(checkActionRateLimit).mockResolvedValue(true);
    const res = await createAutomationRule(validRuleInput());
    expect(res.success).toBe(false);
    expect(res.error).toBe("Rate limit exceeded. Please try again later.");
  });

  // ── Validation ────────────────────────────────────────────────────────
  it("rejects empty name", async () => {
    mockUser(adminA);
    const res = await createAutomationRule(validRuleInput({ name: "" }));
    expect(res.success).toBe(false);
    expect(res.error).toBe("Name is required");
  });

  it("rejects whitespace-only name", async () => {
    mockUser(adminA);
    const res = await createAutomationRule(validRuleInput({ name: "   " }));
    expect(res.success).toBe(false);
    expect(res.error).toBe("Name cannot be empty");
  });

  it("rejects name >200 chars", async () => {
    mockUser(adminA);
    const res = await createAutomationRule(validRuleInput({ name: "א".repeat(201) }));
    expect(res.success).toBe(false);
    expect(res.error).toBe("Name must be 200 characters or less");
  });

  it("accepts name at exactly 200 chars and persists to DB", async () => {
    mockUser(adminA);
    const longName = "א".repeat(200);
    const res = await createAutomationRule(validRuleInput({ name: longName }));
    expect(res.success).toBe(true);

    const dbRule = await prisma.automationRule.findUnique({ where: { id: res.data!.id } });
    expect(dbRule!.name).toBe(longName);
  });

  it("rejects invalid trigger type", async () => {
    mockUser(adminA);
    const res = await createAutomationRule(validRuleInput({ triggerType: "INVALID_TRIGGER" }));
    expect(res.success).toBe(false);
    expect(res.error).toBe("Invalid trigger type");
  });

  it("rejects invalid action type", async () => {
    mockUser(adminA);
    const res = await createAutomationRule(validRuleInput({ actionType: "INVALID_ACTION" }));
    expect(res.success).toBe(false);
    expect(res.error).toBe("Invalid action type");
  });

  it("rejects triggerConfig >50KB", async () => {
    mockUser(adminA);
    const res = await createAutomationRule(validRuleInput({
      triggerConfig: { data: "x".repeat(51 * 1024) },
    }));
    expect(res.success).toBe(false);
    expect(res.error).toBe("Trigger configuration is too large");
  });

  it("rejects actionConfig >50KB", async () => {
    mockUser(adminA);
    const res = await createAutomationRule(validRuleInput({
      actionConfig: { data: "x".repeat(51 * 1024) },
    }));
    expect(res.success).toBe(false);
    expect(res.error).toBe("Action configuration is too large");
  });

  it("accepts triggerConfig at exactly 50KB boundary", async () => {
    mockUser(adminA);
    // JSON.stringify({ data: "x".repeat(N) }) = '{"data":"' + 'x'*N + '"}' = N + 11 chars
    // Target: 50 * 1024 = 51200 total, so N = 51189
    const largeConfig = { data: "x".repeat(50 * 1024 - 11) };
    const res = await createAutomationRule(validRuleInput({
      triggerConfig: largeConfig,
    }));
    expect(res.success).toBe(true);

    const dbRule = await prisma.automationRule.findUnique({ where: { id: res.data!.id } });
    expect(JSON.stringify(dbRule!.triggerConfig)).toHaveLength(51200);
  });

  it("rejects nesting >5 levels", async () => {
    mockUser(adminA);
    const deepObj = { a: { b: { c: { d: { e: { f: "too deep" } } } } } };
    const res = await createAutomationRule(validRuleInput({ triggerConfig: deepObj }));
    expect(res.success).toBe(false);
    expect(res.error).toBe("Trigger configuration is too deeply nested");
  });

  it("accepts nesting at exactly 5 levels", async () => {
    mockUser(adminA);
    const okObj = { a: { b: { c: { d: { e: "fine" } } } } };
    const res = await createAutomationRule(validRuleInput({ triggerConfig: okObj }));
    expect(res.success).toBe(true);

    const dbRule = await prisma.automationRule.findUnique({ where: { id: res.data!.id } });
    expect(dbRule!.triggerConfig).toEqual(okObj);
  });

  // ── SSRF ──────────────────────────────────────────────────────────────
  const privateUrls = [
    "http://localhost/hook",
    "http://127.0.0.1/hook",
    "http://10.0.0.1/hook",
    "http://192.168.1.1/hook",
    "http://169.254.169.254/latest/meta-data/",
  ];

  for (const url of privateUrls) {
    it(`blocks private webhook URL: ${url}`, async () => {
      mockUser(adminA);
      const res = await createAutomationRule(validRuleInput({
        actionType: "WEBHOOK",
        actionConfig: { webhookUrl: url },
      }));
      expect(res.success).toBe(false);
      expect(res.error).toBe("Webhook URL targets a private/internal address");
    });
  }

  it("blocks private URL nested in MULTI_ACTION", async () => {
    mockUser(adminA);
    const res = await createAutomationRule(validRuleInput({
      actionType: "MULTI_ACTION",
      actionConfig: {
        actions: [
          { type: "SEND_NOTIFICATION", config: { recipientId: 1 } },
          { type: "WEBHOOK", config: { webhookUrl: "http://127.0.0.1/hook" } },
        ],
      },
    }));
    expect(res.success).toBe(false);
    expect(res.error).toBe("Webhook URL targets a private/internal address");
  });

  it("accepts public webhook URL and persists to DB", async () => {
    mockUser(adminA);
    const webhookUrl = "https://hooks.example.com/webhook";
    const res = await createAutomationRule(validRuleInput({
      actionType: "WEBHOOK",
      actionConfig: { webhookUrl },
    }));
    expect(res.success).toBe(true);

    const dbRule = await prisma.automationRule.findUnique({ where: { id: res.data!.id } });
    expect((dbRule!.actionConfig as any).webhookUrl).toBe(webhookUrl);
  });

  it("blocks private URL via alternative config.url field", async () => {
    mockUser(adminA);
    const res = await createAutomationRule(validRuleInput({
      actionType: "WEBHOOK",
      actionConfig: { url: "http://169.254.169.254/latest/meta-data/" },
    }));
    expect(res.success).toBe(false);
    expect(res.error).toBe("Webhook URL targets a private/internal address");
  });

  it("accepts public URL via alternative config.url field", async () => {
    mockUser(adminA);
    const res = await createAutomationRule(validRuleInput({
      actionType: "WEBHOOK",
      actionConfig: { url: "https://hooks.example.com/alt-webhook" },
    }));
    expect(res.success).toBe(true);

    const dbRule = await prisma.automationRule.findUnique({ where: { id: res.data!.id } });
    expect((dbRule!.actionConfig as any).url).toBe("https://hooks.example.com/alt-webhook");
  });

  // ── Max rules ─────────────────────────────────────────────────────────
  it("rejects 501st rule when 500 already exist", async () => {
    mockUser(adminA);

    // Seed 500 rules directly via Prisma
    await prisma.automationRule.createMany({
      data: Array.from({ length: 500 }, (_, i) => ({
        companyId: companyA,
        name: `כלל מס׳ ${i}`,
        triggerType: "MANUAL" as any,
        actionType: "SEND_NOTIFICATION" as any,
        actionConfig: {},
        triggerConfig: {},
      })),
    });

    const res = await createAutomationRule(validRuleInput({ name: "הכלל ה-501" }));
    expect(res.success).toBe(false);
    expect(res.error).toBe("Maximum of 500 automation rules per company reached");
  });

  // ── TIME_SINCE_CREATION ───────────────────────────────────────────────
  it("rejects TIME_SINCE_CREATION with minutes <5", async () => {
    mockUser(adminA);
    const res = await createAutomationRule(validRuleInput({
      triggerType: "TIME_SINCE_CREATION",
      triggerConfig: { timeValue: 3, timeUnit: "minutes" },
    }));
    expect(res.success).toBe(false);
    expect(res.error).toBe("בעת בחירת דקות, הזמן המינימלי הוא 5 דקות לפחות");
  });

  it("accepts TIME_SINCE_CREATION with exactly 5 minutes", async () => {
    mockUser(adminA);
    const res = await createAutomationRule(validRuleInput({
      triggerType: "TIME_SINCE_CREATION",
      triggerConfig: { timeValue: 5, timeUnit: "minutes" },
    }));
    expect(res.success).toBe(true);
  });

  it("TIME_SINCE_CREATION with hours unit bypasses minutes check", async () => {
    mockUser(adminA);
    const res = await createAutomationRule(validRuleInput({
      triggerType: "TIME_SINCE_CREATION",
      triggerConfig: { timeValue: 1, timeUnit: "hours" },
    }));
    expect(res.success).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// getAutomationRules
// ═════════════════════════════════════════════════════════════════════════════

describe("getAutomationRules", () => {
  // ── Happy paths ────────────────────────────────────────────────────────
  it("returns all rules ordered desc by createdAt", async () => {
    mockUser(adminA);
    const r1 = await seedRule(companyA, { name: "אוטומציה ראשונה" });
    const r2 = await seedRule(companyA, { name: "אוטומציה שנייה" });

    const res = await getAutomationRules();
    expect(res.success).toBe(true);
    expect(res.data).toHaveLength(2);
    expect(res.data![0].id).toBe(r2.id);
    expect(res.data![1].id).toBe(r1.id);
  });

  it("returns empty when no rules exist", async () => {
    mockUser(adminA);
    const res = await getAutomationRules();
    expect(res.success).toBe(true);
    expect(res.data).toHaveLength(0);
  });

  it("response shape excludes companyId, createdBy, and updatedAt", async () => {
    mockUser(adminA);
    await seedRule(companyA);

    const res = await getAutomationRules();
    const rule = res.data![0];
    expect(rule).not.toHaveProperty("companyId");
    expect(rule).not.toHaveProperty("updatedAt");
    expect(rule).not.toHaveProperty("createdBy");

    const expectedKeys = [
      "id", "name", "triggerType", "triggerConfig", "actionType", "actionConfig",
      "isActive", "folderId", "calendarEventId", "createdAt",
    ];
    expect(Object.keys(rule).sort()).toEqual(expectedKeys.sort());
  });

  // ── Pagination ────────────────────────────────────────────────────────
  it("hasMore and nextCursor when more rules exist", async () => {
    mockUser(adminA);
    for (let i = 0; i < 3; i++) await seedRule(companyA, { name: `כלל ${i}` });

    const res = await getAutomationRules({ limit: 2 });
    expect(res.success).toBe(true);
    expect(res.data).toHaveLength(2);
    expect(res.hasMore).toBe(true);
    expect(res.nextCursor).toBeDefined();
  });

  it("second page via cursor returns remaining rules", async () => {
    mockUser(adminA);
    for (let i = 0; i < 5; i++) await seedRule(companyA, { name: `כלל ${i}` });

    const page1 = await getAutomationRules({ limit: 3 });
    expect(page1.data).toHaveLength(3);
    expect(page1.hasMore).toBe(true);

    const page2 = await getAutomationRules({ limit: 3, cursor: page1.nextCursor });
    expect(page2.data).toHaveLength(2);
    expect(page2.hasMore).toBe(false);
  });

  it("pagination pages produce disjoint IDs", async () => {
    mockUser(adminA);
    for (let i = 0; i < 5; i++) await seedRule(companyA, { name: `כלל דיסג׳וינט ${i}` });

    const page1 = await getAutomationRules({ limit: 3 });
    const page2 = await getAutomationRules({ limit: 3, cursor: page1.nextCursor });

    const ids1 = new Set(page1.data!.map((r: any) => r.id));
    const ids2 = new Set(page2.data!.map((r: any) => r.id));
    for (const id of ids2) {
      expect(ids1.has(id)).toBe(false);
    }
  });

  it("limit=0 is clamped to 1", async () => {
    mockUser(adminA);
    await seedRule(companyA, { name: "כלל א" });
    await seedRule(companyA, { name: "כלל ב" });

    const res = await getAutomationRules({ limit: 0 });
    expect(res.data).toHaveLength(1);
    expect(res.hasMore).toBe(true);
  });

  it("limit=9999 is clamped to 500 (returns all seeded rules)", async () => {
    mockUser(adminA);
    await seedRule(companyA, { name: "כלל 1" });
    await seedRule(companyA, { name: "כלל 2" });

    const res = await getAutomationRules({ limit: 9999 });
    expect(res.success).toBe(true);
    expect(res.data).toHaveLength(2);
    expect(res.hasMore).toBe(false);
  });

  it("exact boundary: limit equals rule count", async () => {
    mockUser(adminA);
    for (let i = 0; i < 3; i++) await seedRule(companyA, { name: `כלל ${i}` });

    const res = await getAutomationRules({ limit: 3 });
    expect(res.data).toHaveLength(3);
    expect(res.hasMore).toBe(false);
  });

  it("non-existent cursor returns empty data", async () => {
    mockUser(adminA);
    const res = await getAutomationRules({ cursor: 999999 });
    // Prisma 7 with driver adapter returns empty results for non-existent cursor
    expect(res.success).toBe(true);
    expect(res.data).toHaveLength(0);
  });

  // ── Auth ──────────────────────────────────────────────────────────────
  it("unauthenticated returns error", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null as any);
    const res = await getAutomationRules();
    expect(res.success).toBe(false);
    expect(res.error).toBe("Authentication required");
  });

  it("missing permission returns Forbidden", async () => {
    mockUser(noPermsA);
    const res = await getAutomationRules();
    expect(res.success).toBe(false);
    expect(res.error).toBe("Forbidden");
  });

  it("rate limited returns error", async () => {
    mockUser(adminA);
    vi.mocked(checkActionRateLimit).mockResolvedValue(true);
    const res = await getAutomationRules();
    expect(res.success).toBe(false);
    expect(res.error).toBe("Rate limit exceeded. Please try again later.");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// updateAutomationRule
// ═════════════════════════════════════════════════════════════════════════════

describe("updateAutomationRule", () => {
  // ── Happy paths ────────────────────────────────────────────────────────
  it("updates name and verifies in DB", async () => {
    mockUser(adminA);
    const rule = await seedRule(companyA, { name: "שם מקורי" });

    const res = await updateAutomationRule(rule.id, validRuleInput({ name: "שם מעודכן" }));
    expect(res.success).toBe(true);
    expect(res.data!.name).toBe("שם מעודכן");

    const dbRule = await prisma.automationRule.findUnique({ where: { id: rule.id } });
    expect(dbRule!.name).toBe("שם מעודכן");
  });

  it("updates triggerType and triggerConfig", async () => {
    mockUser(adminA);
    const rule = await seedRule(companyA);

    const res = await updateAutomationRule(rule.id, validRuleInput({
      triggerType: "RECORD_CREATE",
      triggerConfig: { tableId: 5 },
    }));
    expect(res.success).toBe(true);
    expect(res.data!.triggerType).toBe("RECORD_CREATE");
    expect((res.data!.triggerConfig as any).tableId).toBe(5);

    const dbRule = await prisma.automationRule.findUnique({ where: { id: rule.id } });
    expect(dbRule!.triggerType).toBe("RECORD_CREATE");
    expect((dbRule!.triggerConfig as any).tableId).toBe(5);
  });

  it("updates actionType and verifies in DB", async () => {
    mockUser(adminA);
    const rule = await seedRule(companyA);

    const res = await updateAutomationRule(rule.id, validRuleInput({
      actionType: "CREATE_TASK",
      actionConfig: { title: "משימה אוטומטית" },
    }));
    expect(res.success).toBe(true);
    expect(res.data!.actionType).toBe("CREATE_TASK");

    const dbRule = await prisma.automationRule.findUnique({ where: { id: rule.id } });
    expect(dbRule!.actionType).toBe("CREATE_TASK");
    expect((dbRule!.actionConfig as any).title).toBe("משימה אוטומטית");
  });

  it("does not change isActive when updating other fields", async () => {
    mockUser(adminA);
    const rule = await seedRule(companyA, { isActive: false });

    const res = await updateAutomationRule(rule.id, validRuleInput({ name: "שם חדש" }));
    expect(res.success).toBe(true);

    const dbRule = await prisma.automationRule.findUnique({ where: { id: rule.id } });
    expect(dbRule!.isActive).toBe(false);
  });

  it("trims name on update", async () => {
    mockUser(adminA);
    const rule = await seedRule(companyA);

    const res = await updateAutomationRule(rule.id, validRuleInput({ name: "  שם חתוך  " }));
    expect(res.success).toBe(true);
    expect(res.data!.name).toBe("שם חתוך");

    const dbRule = await prisma.automationRule.findUnique({ where: { id: rule.id } });
    expect(dbRule!.name).toBe("שם חתוך");
  });

  // ── @updatedAt ──────────────────────────────────────────────────────────
  it("updatedAt changes after update", async () => {
    mockUser(adminA);
    const rule = await seedRule(companyA);
    const originalUpdatedAt = rule.updatedAt.getTime();

    // Small delay to ensure timestamp difference
    await new Promise((r) => setTimeout(r, 50));

    const res = await updateAutomationRule(rule.id, validRuleInput({ name: "עודכן" }));
    expect(res.success).toBe(true);

    const dbRule = await prisma.automationRule.findUnique({ where: { id: rule.id } });
    expect(dbRule!.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt);
  });

  // ── Response shape ──────────────────────────────────────────────────────
  it("update response contains all expected fields", async () => {
    mockUser(adminA);
    const rule = await seedRule(companyA);

    const res = await updateAutomationRule(rule.id, validRuleInput({ name: "בדיקת מבנה" }));
    expect(res.success).toBe(true);

    const expectedKeys = [
      "id", "name", "triggerType", "triggerConfig", "actionType", "actionConfig",
      "isActive", "folderId", "calendarEventId", "createdBy", "createdAt", "updatedAt",
    ];
    expect(Object.keys(res.data!).sort()).toEqual(expectedKeys.sort());
  });

  // ── Side effects ──────────────────────────────────────────────────────
  it("calls invalidateFullCache and revalidatePath after update", async () => {
    mockUser(adminA);
    const rule = await seedRule(companyA);

    await updateAutomationRule(rule.id, validRuleInput({ name: "עודכן" }));

    expect(invalidateFullCache).toHaveBeenCalledWith(companyA);
    expect(revalidatePath).toHaveBeenCalledWith("/automations");
    expect(revalidatePath).toHaveBeenCalledWith("/analytics");
  });

  it("does NOT call side effects on auth failure", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null as any);
    await updateAutomationRule(1, validRuleInput());

    expect(invalidateFullCache).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("does NOT call side effects on validation failure", async () => {
    mockUser(adminA);
    const rule = await seedRule(companyA);
    await updateAutomationRule(rule.id, validRuleInput({ name: "" }));

    expect(invalidateFullCache).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("does NOT call side effects on SSRF failure", async () => {
    mockUser(adminA);
    const rule = await seedRule(companyA);
    await updateAutomationRule(rule.id, validRuleInput({
      actionType: "WEBHOOK",
      actionConfig: { webhookUrl: "http://127.0.0.1/hook" },
    }));
    expect(invalidateFullCache).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("does NOT call side effects on rate-limit failure", async () => {
    mockUser(adminA);
    vi.mocked(checkActionRateLimit).mockResolvedValue(true);
    await updateAutomationRule(1, validRuleInput());
    expect(invalidateFullCache).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("does NOT call side effects on validateId failure", async () => {
    mockUser(adminA);
    await updateAutomationRule(0, validRuleInput());
    expect(invalidateFullCache).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  // ── Auth ──────────────────────────────────────────────────────────────
  it("unauthenticated returns error", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null as any);
    const res = await updateAutomationRule(1, validRuleInput());
    expect(res.success).toBe(false);
    expect(res.error).toBe("Authentication required");
  });

  it("missing permission returns Forbidden", async () => {
    mockUser(noPermsA);
    const res = await updateAutomationRule(1, validRuleInput());
    expect(res.success).toBe(false);
    expect(res.error).toBe("Forbidden");
  });

  it("rate limited returns error", async () => {
    mockUser(adminA);
    vi.mocked(checkActionRateLimit).mockResolvedValue(true);
    const res = await updateAutomationRule(1, validRuleInput());
    expect(res.success).toBe(false);
    expect(res.error).toBe("Rate limit exceeded. Please try again later.");
  });

  // ── Validation ────────────────────────────────────────────────────────
  it("rejects ID=0", async () => {
    mockUser(adminA);
    const res = await updateAutomationRule(0, validRuleInput());
    expect(res.success).toBe(false);
    expect(res.error).toBe("Invalid ID");
  });

  it("rejects ID=-1", async () => {
    mockUser(adminA);
    const res = await updateAutomationRule(-1, validRuleInput());
    expect(res.success).toBe(false);
    expect(res.error).toBe("Invalid ID");
  });

  it("rejects ID=1.5 (non-integer)", async () => {
    mockUser(adminA);
    const res = await updateAutomationRule(1.5, validRuleInput());
    expect(res.success).toBe(false);
    expect(res.error).toBe("Invalid ID");
  });

  it("rejects empty name", async () => {
    mockUser(adminA);
    const rule = await seedRule(companyA);
    const res = await updateAutomationRule(rule.id, validRuleInput({ name: "" }));
    expect(res.success).toBe(false);
    expect(res.error).toBe("Name is required");
  });

  it("rejects name >200 chars", async () => {
    mockUser(adminA);
    const rule = await seedRule(companyA);
    const res = await updateAutomationRule(rule.id, validRuleInput({ name: "א".repeat(201) }));
    expect(res.success).toBe(false);
    expect(res.error).toBe("Name must be 200 characters or less");
  });

  it("rejects invalid trigger type", async () => {
    mockUser(adminA);
    const rule = await seedRule(companyA);
    const res = await updateAutomationRule(rule.id, validRuleInput({ triggerType: "BOGUS" }));
    expect(res.success).toBe(false);
    expect(res.error).toBe("Invalid trigger type");
  });

  it("rejects invalid action type", async () => {
    mockUser(adminA);
    const rule = await seedRule(companyA);
    const res = await updateAutomationRule(rule.id, validRuleInput({ actionType: "BOGUS" }));
    expect(res.success).toBe(false);
    expect(res.error).toBe("Invalid action type");
  });

  it("rejects oversized triggerConfig", async () => {
    mockUser(adminA);
    const rule = await seedRule(companyA);
    const res = await updateAutomationRule(rule.id, validRuleInput({
      triggerConfig: { data: "x".repeat(51 * 1024) },
    }));
    expect(res.success).toBe(false);
    expect(res.error).toBe("Trigger configuration is too large");
  });

  it("rejects oversized actionConfig", async () => {
    mockUser(adminA);
    const rule = await seedRule(companyA);
    const res = await updateAutomationRule(rule.id, validRuleInput({
      actionConfig: { data: "x".repeat(51 * 1024) },
    }));
    expect(res.success).toBe(false);
    expect(res.error).toBe("Action configuration is too large");
  });

  it("rejects deeply nested config", async () => {
    mockUser(adminA);
    const rule = await seedRule(companyA);
    const deepObj = { a: { b: { c: { d: { e: { f: "too deep" } } } } } };
    const res = await updateAutomationRule(rule.id, validRuleInput({ triggerConfig: deepObj }));
    expect(res.success).toBe(false);
    expect(res.error).toBe("Trigger configuration is too deeply nested");
  });

  // ── SSRF ──────────────────────────────────────────────────────────────
  it("rejects private webhook URL on update", async () => {
    mockUser(adminA);
    const rule = await seedRule(companyA);
    const res = await updateAutomationRule(rule.id, validRuleInput({
      actionType: "WEBHOOK",
      actionConfig: { webhookUrl: "http://192.168.1.1/hook" },
    }));
    expect(res.success).toBe(false);
    expect(res.error).toBe("Webhook URL targets a private/internal address");
  });

  it("rejects nested MULTI_ACTION private webhook on update", async () => {
    mockUser(adminA);
    const rule = await seedRule(companyA);
    const res = await updateAutomationRule(rule.id, validRuleInput({
      actionType: "MULTI_ACTION",
      actionConfig: {
        actions: [{ type: "WEBHOOK", config: { webhookUrl: "http://10.0.0.1/hook" } }],
      },
    }));
    expect(res.success).toBe(false);
    expect(res.error).toBe("Webhook URL targets a private/internal address");
  });

  // ── TIME_SINCE_CREATION ───────────────────────────────────────────────
  it("rejects TIME_SINCE_CREATION <5 minutes on update", async () => {
    mockUser(adminA);
    const rule = await seedRule(companyA);
    const res = await updateAutomationRule(rule.id, validRuleInput({
      triggerType: "TIME_SINCE_CREATION",
      triggerConfig: { timeValue: 2, timeUnit: "minutes" },
    }));
    expect(res.success).toBe(false);
    expect(res.error).toBe("בעת בחירת דקות, הזמן המינימלי הוא 5 דקות לפחות");
  });

  // ── Cross-company ─────────────────────────────────────────────────────
  it("companyA cannot update companyB's rule", async () => {
    mockUser(adminA);
    const ruleB = await seedRule(companyB, { name: "כלל של חברה ב" });

    const res = await updateAutomationRule(ruleB.id, validRuleInput({ name: "ניסיון פריצה" }));
    expect(res.success).toBe(false);

    // Verify DB unchanged
    const dbRule = await prisma.automationRule.findUnique({ where: { id: ruleB.id } });
    expect(dbRule!.name).toBe("כלל של חברה ב");
  });

  // ── Prisma errors ─────────────────────────────────────────────────────
  it("non-existent ID returns error", async () => {
    mockUser(adminA);
    const res = await updateAutomationRule(999999, validRuleInput());
    expect(res.success).toBe(false);
    expect(res.error).toBe("Failed to update automation rule");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// deleteAutomationRule
// ═════════════════════════════════════════════════════════════════════════════

describe("deleteAutomationRule", () => {
  // ── Happy paths ────────────────────────────────────────────────────────
  it("deletes rule and confirms gone from DB", async () => {
    mockUser(adminA);
    const rule = await seedRule(companyA);

    const res = await deleteAutomationRule(rule.id);
    expect(res.success).toBe(true);

    const dbRule = await prisma.automationRule.findUnique({ where: { id: rule.id } });
    expect(dbRule).toBeNull();
  });

  it("calls invalidateFullCache and revalidatePath after delete", async () => {
    mockUser(adminA);
    const rule = await seedRule(companyA);

    await deleteAutomationRule(rule.id);
    expect(invalidateFullCache).toHaveBeenCalledWith(companyA);
    expect(revalidatePath).toHaveBeenCalledWith("/automations");
    expect(revalidatePath).toHaveBeenCalledWith("/analytics");
  });

  it("does NOT call side effects on auth failure", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null as any);
    await deleteAutomationRule(1);

    expect(invalidateFullCache).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("does NOT call side effects on rate-limit failure", async () => {
    mockUser(adminA);
    vi.mocked(checkActionRateLimit).mockResolvedValue(true);
    await deleteAutomationRule(1);
    expect(invalidateFullCache).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("does NOT call side effects on validateId failure", async () => {
    mockUser(adminA);
    await deleteAutomationRule(0);
    expect(invalidateFullCache).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  // ── Cascade deletes ───────────────────────────────────────────────────
  it("deleting rule cascades to AutomationLog", async () => {
    mockUser(adminA);
    const rule = await seedRule(companyA);

    await prisma.automationLog.create({
      data: { automationRuleId: rule.id, companyId: companyA },
    });

    const res = await deleteAutomationRule(rule.id);
    expect(res.success).toBe(true);

    const logs = await prisma.automationLog.findMany({ where: { automationRuleId: rule.id } });
    expect(logs).toHaveLength(0);
  });

  it("deleting rule cascades to StatusDuration", async () => {
    mockUser(adminA);
    const rule = await seedRule(companyA);

    await prisma.statusDuration.create({
      data: {
        automationRuleId: rule.id,
        companyId: companyA,
        durationSeconds: 100,
        durationString: "0d 0h 1m",
      },
    });

    const res = await deleteAutomationRule(rule.id);
    expect(res.success).toBe(true);

    const durations = await prisma.statusDuration.findMany({ where: { automationRuleId: rule.id } });
    expect(durations).toHaveLength(0);
  });

  it("deleting rule cascades to MultiEventDuration", async () => {
    mockUser(adminA);
    const rule = await seedRule(companyA);

    await prisma.multiEventDuration.create({
      data: {
        automationRuleId: rule.id,
        companyId: companyA,
        eventChain: [],
        eventDeltas: [],
        totalDurationSeconds: 60,
        totalDurationString: "1m",
      },
    });

    const res = await deleteAutomationRule(rule.id);
    expect(res.success).toBe(true);

    const meds = await prisma.multiEventDuration.findMany({ where: { automationRuleId: rule.id } });
    expect(meds).toHaveLength(0);
  });

  // ── Auth ──────────────────────────────────────────────────────────────
  it("unauthenticated returns error", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null as any);
    const res = await deleteAutomationRule(1);
    expect(res.success).toBe(false);
    expect(res.error).toBe("Authentication required");
  });

  it("missing permission returns Forbidden", async () => {
    mockUser(noPermsA);
    const res = await deleteAutomationRule(1);
    expect(res.success).toBe(false);
    expect(res.error).toBe("Forbidden");
  });

  it("rate limited returns error", async () => {
    mockUser(adminA);
    vi.mocked(checkActionRateLimit).mockResolvedValue(true);
    const res = await deleteAutomationRule(1);
    expect(res.success).toBe(false);
    expect(res.error).toBe("Rate limit exceeded. Please try again later.");
  });

  // ── Validation ────────────────────────────────────────────────────────
  it("rejects ID=0", async () => {
    mockUser(adminA);
    const res = await deleteAutomationRule(0);
    expect(res.success).toBe(false);
    expect(res.error).toBe("Invalid ID");
  });

  it("rejects ID=-1", async () => {
    mockUser(adminA);
    const res = await deleteAutomationRule(-1);
    expect(res.success).toBe(false);
    expect(res.error).toBe("Invalid ID");
  });

  it("rejects ID=1.5 (non-integer)", async () => {
    mockUser(adminA);
    const res = await deleteAutomationRule(1.5);
    expect(res.success).toBe(false);
    expect(res.error).toBe("Invalid ID");
  });

  // ── Cross-company ─────────────────────────────────────────────────────
  it("companyA cannot delete companyB's rule", async () => {
    mockUser(adminA);
    const ruleB = await seedRule(companyB, { name: "כלל של חברה ב" });

    const res = await deleteAutomationRule(ruleB.id);
    expect(res.success).toBe(false);

    // Verify still exists
    const dbRule = await prisma.automationRule.findUnique({ where: { id: ruleB.id } });
    expect(dbRule).not.toBeNull();
  });

  // ── Prisma errors ─────────────────────────────────────────────────────
  it("non-existent ID returns error", async () => {
    mockUser(adminA);
    const res = await deleteAutomationRule(999999);
    expect(res.success).toBe(false);
    expect(res.error).toBe("Failed to delete automation rule");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// toggleAutomationRule
// ═════════════════════════════════════════════════════════════════════════════

describe("toggleAutomationRule", () => {
  // ── Happy paths ────────────────────────────────────────────────────────
  it("toggles active → inactive", async () => {
    mockUser(adminA);
    const rule = await seedRule(companyA, { isActive: true });

    const res = await toggleAutomationRule(rule.id, false);
    expect(res.success).toBe(true);

    const dbRule = await prisma.automationRule.findUnique({ where: { id: rule.id } });
    expect(dbRule!.isActive).toBe(false);
  });

  it("toggles inactive → active", async () => {
    mockUser(adminA);
    const rule = await seedRule(companyA, { isActive: false });

    const res = await toggleAutomationRule(rule.id, true);
    expect(res.success).toBe(true);

    const dbRule = await prisma.automationRule.findUnique({ where: { id: rule.id } });
    expect(dbRule!.isActive).toBe(true);
  });

  it("idempotent toggle: active → active succeeds", async () => {
    mockUser(adminA);
    const rule = await seedRule(companyA, { isActive: true });

    const res = await toggleAutomationRule(rule.id, true);
    expect(res.success).toBe(true);

    const dbRule = await prisma.automationRule.findUnique({ where: { id: rule.id } });
    expect(dbRule!.isActive).toBe(true);
  });

  it("other fields remain unchanged after toggle", async () => {
    mockUser(adminA);
    const rule = await seedRule(companyA, { name: "אוטומציה שלי", isActive: true });

    await toggleAutomationRule(rule.id, false);
    const dbRule = await prisma.automationRule.findUnique({ where: { id: rule.id } });
    expect(dbRule!.name).toBe("אוטומציה שלי");
    expect(dbRule!.triggerType).toBe("MANUAL");
    expect(dbRule!.actionType).toBe("SEND_NOTIFICATION");
  });

  it("calls invalidateFullCache and both revalidatePath after toggle", async () => {
    mockUser(adminA);
    const rule = await seedRule(companyA);

    await toggleAutomationRule(rule.id, false);
    expect(invalidateFullCache).toHaveBeenCalledWith(companyA);
    expect(revalidatePath).toHaveBeenCalledWith("/automations");
    expect(revalidatePath).toHaveBeenCalledWith("/analytics");
  });

  it("does NOT call side effects on auth failure", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null as any);
    await toggleAutomationRule(1, false);

    expect(invalidateFullCache).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("does NOT call side effects on rate-limit failure", async () => {
    mockUser(adminA);
    vi.mocked(checkActionRateLimit).mockResolvedValue(true);
    await toggleAutomationRule(1, false);
    expect(invalidateFullCache).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("does NOT call side effects on validateId failure", async () => {
    mockUser(adminA);
    await toggleAutomationRule(0, false);
    expect(invalidateFullCache).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  // ── Auth ──────────────────────────────────────────────────────────────
  it("unauthenticated returns error", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null as any);
    const res = await toggleAutomationRule(1, false);
    expect(res.success).toBe(false);
    expect(res.error).toBe("Authentication required");
  });

  it("missing permission returns Forbidden", async () => {
    mockUser(noPermsA);
    const res = await toggleAutomationRule(1, false);
    expect(res.success).toBe(false);
    expect(res.error).toBe("Forbidden");
  });

  it("rate limited returns error", async () => {
    mockUser(adminA);
    vi.mocked(checkActionRateLimit).mockResolvedValue(true);
    const res = await toggleAutomationRule(1, false);
    expect(res.success).toBe(false);
    expect(res.error).toBe("Rate limit exceeded. Please try again later.");
  });

  // ── Validation ────────────────────────────────────────────────────────
  it("rejects ID=0", async () => {
    mockUser(adminA);
    const res = await toggleAutomationRule(0, false);
    expect(res.success).toBe(false);
    expect(res.error).toBe("Invalid ID");
  });

  it("rejects ID=-1", async () => {
    mockUser(adminA);
    const res = await toggleAutomationRule(-1, false);
    expect(res.success).toBe(false);
    expect(res.error).toBe("Invalid ID");
  });

  it("rejects ID=1.5 (non-integer)", async () => {
    mockUser(adminA);
    const res = await toggleAutomationRule(1.5, false);
    expect(res.success).toBe(false);
    expect(res.error).toBe("Invalid ID");
  });

  // ── Cross-company ─────────────────────────────────────────────────────
  it("companyA cannot toggle companyB's rule", async () => {
    mockUser(adminA);
    const ruleB = await seedRule(companyB, { isActive: true });

    const res = await toggleAutomationRule(ruleB.id, false);
    expect(res.success).toBe(false);

    // Verify unchanged
    const dbRule = await prisma.automationRule.findUnique({ where: { id: ruleB.id } });
    expect(dbRule!.isActive).toBe(true);
  });

  // ── Prisma errors ─────────────────────────────────────────────────────
  it("non-existent ID returns error", async () => {
    mockUser(adminA);
    const res = await toggleAutomationRule(999999, false);
    expect(res.success).toBe(false);
    expect(res.error).toBe("Failed to toggle automation rule");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// getViewAutomations
// ═════════════════════════════════════════════════════════════════════════════

describe("getViewAutomations", () => {
  async function seedViewRule(companyId: number, viewId: number | string, overrides: Record<string, unknown> = {}) {
    return prisma.automationRule.create({
      data: {
        companyId,
        name: overrides.name as string ?? "אוטומציית תצוגה",
        triggerType: "VIEW_METRIC_THRESHOLD",
        actionType: (overrides.actionType as any) ?? "SEND_NOTIFICATION",
        triggerConfig: { viewId, operator: "gt", threshold: 100 },
        actionConfig: (overrides.actionConfig as any) ?? {},
      },
    });
  }

  // ── Happy paths ────────────────────────────────────────────────────────
  it("matches viewId stored as number", async () => {
    mockUser(adminA);
    await seedViewRule(companyA, 42);

    const res = await getViewAutomations(42);
    expect(res.success).toBe(true);
    expect(res.data).toHaveLength(1);
  });

  it("matches viewId stored as string", async () => {
    mockUser(adminA);
    await seedViewRule(companyA, "77");

    const res = await getViewAutomations(77);
    expect(res.success).toBe(true);
    expect(res.data).toHaveLength(1);
  });

  it("returns empty when no rules match viewId", async () => {
    mockUser(adminA);
    await seedViewRule(companyA, 10);

    const res = await getViewAutomations(999);
    expect(res.success).toBe(true);
    expect(res.data).toHaveLength(0);
  });

  it("is company-scoped", async () => {
    mockUser(adminA);
    await seedViewRule(companyB, 42); // companyB's rule

    const res = await getViewAutomations(42);
    expect(res.success).toBe(true);
    expect(res.data).toHaveLength(0);
  });

  it("returns rules ordered desc by createdAt", async () => {
    mockUser(adminA);
    const r1 = await seedViewRule(companyA, 42, { name: "ראשונה" });
    const r2 = await seedViewRule(companyA, 42, { name: "שנייה" });

    const res = await getViewAutomations(42);
    expect(res.data![0].id).toBe(r2.id);
    expect(res.data![1].id).toBe(r1.id);
  });

  it("response contains full model (no select clause)", async () => {
    mockUser(adminA);
    await seedViewRule(companyA, 42);

    const res = await getViewAutomations(42);
    const rule = res.data![0];
    // getViewAutomations has no select clause, so full model is returned
    const expectedKeys = [
      "id", "companyId", "name", "description", "triggerType", "triggerConfig",
      "actionType", "actionConfig", "isActive", "createdBy", "createdAt", "updatedAt",
      "lastRunAt", "analyticsOrder", "analyticsColor", "cachedStats", "lastCachedAt",
      "folderId", "calendarEventId", "meetingTypeId", "meetingId",
    ];
    expect(Object.keys(rule).sort()).toEqual(expectedKeys.sort());
  });

  // ── Auth ──────────────────────────────────────────────────────────────
  it("unauthenticated returns error", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null as any);
    const res = await getViewAutomations(1);
    expect(res.success).toBe(false);
    expect(res.error).toBe("Unauthorized");
  });

  it("missing permission returns Forbidden", async () => {
    mockUser(noPermsA);
    const res = await getViewAutomations(1);
    expect(res.success).toBe(false);
    expect(res.error).toBe("Forbidden");
  });

  it("rate limited returns error", async () => {
    mockUser(adminA);
    vi.mocked(checkActionRateLimit).mockResolvedValue(true);
    const res = await getViewAutomations(1);
    expect(res.success).toBe(false);
    expect(res.error).toBe("Rate limit exceeded. Please try again later.");
  });

  // ── Validation ────────────────────────────────────────────────────────
  it("rejects invalid viewId", async () => {
    mockUser(adminA);
    const res = await getViewAutomations(0);
    expect(res.success).toBe(false);
    expect(res.error).toBe("Invalid ID");
  });

  it("rejects viewId=-1", async () => {
    mockUser(adminA);
    const res = await getViewAutomations(-1);
    expect(res.success).toBe(false);
    expect(res.error).toBe("Invalid ID");
  });

  it("rejects viewId=1.5 (non-integer)", async () => {
    mockUser(adminA);
    const res = await getViewAutomations(1.5);
    expect(res.success).toBe(false);
    expect(res.error).toBe("Invalid ID");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// getAnalyticsAutomationsActionCount
// ═════════════════════════════════════════════════════════════════════════════

describe("getAnalyticsAutomationsActionCount", () => {
  async function seedAnalyticsRule(companyId: number, actionType: string, actionConfig: any = {}) {
    return prisma.automationRule.create({
      data: {
        companyId,
        name: "כלל אנליטיקס",
        triggerType: "VIEW_METRIC_THRESHOLD",
        actionType: actionType as any,
        triggerConfig: { viewId: 1 },
        actionConfig,
      },
    });
  }

  // ── Happy paths ────────────────────────────────────────────────────────
  it("returns 0 when no VIEW_METRIC_THRESHOLD rules exist", async () => {
    mockUser(adminA);
    const res = await getAnalyticsAutomationsActionCount();
    expect(res.success).toBe(true);
    expect(res.count).toBe(0);
  });

  it("counts single-action as 1", async () => {
    mockUser(adminA);
    await seedAnalyticsRule(companyA, "SEND_NOTIFICATION");

    const res = await getAnalyticsAutomationsActionCount();
    expect(res.count).toBe(1);
  });

  it("expands MULTI_ACTION sub-actions", async () => {
    mockUser(adminA);
    await seedAnalyticsRule(companyA, "MULTI_ACTION", {
      actions: [
        { type: "SEND_NOTIFICATION", config: {} },
        { type: "CREATE_TASK", config: {} },
        { type: "WEBHOOK", config: { webhookUrl: "https://example.com" } },
      ],
    });

    const res = await getAnalyticsAutomationsActionCount();
    expect(res.count).toBe(3);
  });

  it("MULTI_ACTION with empty actions array returns 0 for that rule", async () => {
    mockUser(adminA);
    await seedAnalyticsRule(companyA, "MULTI_ACTION", { actions: [] });

    const res = await getAnalyticsAutomationsActionCount();
    expect(res.count).toBe(0);
  });

  it("MULTI_ACTION with null/missing actions returns 0 for that rule", async () => {
    mockUser(adminA);
    await seedAnalyticsRule(companyA, "MULTI_ACTION", {});

    const res = await getAnalyticsAutomationsActionCount();
    expect(res.count).toBe(0);
  });

  it("returns combined count across multiple rules", async () => {
    mockUser(adminA);
    await seedAnalyticsRule(companyA, "SEND_NOTIFICATION");
    await seedAnalyticsRule(companyA, "MULTI_ACTION", {
      actions: [
        { type: "SEND_NOTIFICATION", config: {} },
        { type: "CREATE_TASK", config: {} },
      ],
    });

    const res = await getAnalyticsAutomationsActionCount();
    expect(res.count).toBe(3); // 1 + 2
  });

  it("ignores non-VIEW_METRIC_THRESHOLD rules", async () => {
    mockUser(adminA);
    // This is MANUAL, not VIEW_METRIC_THRESHOLD
    await prisma.automationRule.create({
      data: {
        companyId: companyA, name: "כלל ידני", triggerType: "MANUAL",
        actionType: "SEND_NOTIFICATION", triggerConfig: {}, actionConfig: {},
      },
    });

    const res = await getAnalyticsAutomationsActionCount();
    expect(res.count).toBe(0);
  });

  it("is company-scoped", async () => {
    mockUser(adminA);
    await seedAnalyticsRule(companyB, "SEND_NOTIFICATION"); // companyB's rule

    const res = await getAnalyticsAutomationsActionCount();
    expect(res.count).toBe(0);
  });

  it("includes inactive rules in count", async () => {
    mockUser(adminA);
    await prisma.automationRule.create({
      data: {
        companyId: companyA, name: "כלל לא פעיל",
        triggerType: "VIEW_METRIC_THRESHOLD", actionType: "SEND_NOTIFICATION",
        triggerConfig: { viewId: 1 }, actionConfig: {}, isActive: false,
      },
    });
    await seedAnalyticsRule(companyA, "SEND_NOTIFICATION");
    const res = await getAnalyticsAutomationsActionCount();
    expect(res.success).toBe(true);
    expect(res.count).toBe(2);
  });

  // ── Auth ──────────────────────────────────────────────────────────────
  it("unauthenticated returns count: 0", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null as any);
    const res = await getAnalyticsAutomationsActionCount();
    expect(res.success).toBe(false);
    expect(res.error).toBe("Unauthorized");
    expect(res.count).toBe(0);
  });

  it("missing permission returns count: 0", async () => {
    mockUser(noPermsA);
    const res = await getAnalyticsAutomationsActionCount();
    expect(res.success).toBe(false);
    expect(res.error).toBe("Forbidden");
    expect(res.count).toBe(0);
  });

  it("rate limited returns count: 0", async () => {
    mockUser(adminA);
    vi.mocked(checkActionRateLimit).mockResolvedValue(true);
    const res = await getAnalyticsAutomationsActionCount();
    expect(res.success).toBe(false);
    expect(res.error).toBe("Rate limit exceeded");
    expect(res.count).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Cross-company isolation (end-to-end)
// ═════════════════════════════════════════════════════════════════════════════

describe("cross-company isolation", () => {
  it("getAutomationRules sees only own company's rules", async () => {
    // Seed rules for both companies
    await prisma.automationRule.create({
      data: {
        companyId: companyA, name: "כלל חברה א", triggerType: "MANUAL",
        actionType: "SEND_NOTIFICATION", triggerConfig: {}, actionConfig: {},
      },
    });
    await prisma.automationRule.create({
      data: {
        companyId: companyB, name: "כלל חברה ב", triggerType: "MANUAL",
        actionType: "SEND_NOTIFICATION", triggerConfig: {}, actionConfig: {},
      },
    });

    // Admin A sees only A's rules
    mockUser(adminA);
    const resA = await getAutomationRules();
    expect(resA.data).toHaveLength(1);
    expect(resA.data![0].name).toBe("כלל חברה א");

    // Admin B sees only B's rules
    mockUser(adminB);
    const resB = await getAutomationRules();
    expect(resB.data).toHaveLength(1);
    expect(resB.data![0].name).toBe("כלל חברה ב");
  });

  it("getViewAutomations sees only own company's rules", async () => {
    const viewId = 99;
    await prisma.automationRule.create({
      data: {
        companyId: companyA, name: "תצוגת חברה א", triggerType: "VIEW_METRIC_THRESHOLD",
        actionType: "SEND_NOTIFICATION", triggerConfig: { viewId },
        actionConfig: {},
      },
    });
    await prisma.automationRule.create({
      data: {
        companyId: companyB, name: "תצוגת חברה ב", triggerType: "VIEW_METRIC_THRESHOLD",
        actionType: "SEND_NOTIFICATION", triggerConfig: { viewId },
        actionConfig: {},
      },
    });

    mockUser(adminA);
    const resA = await getViewAutomations(viewId);
    expect(resA.data).toHaveLength(1);
    expect(resA.data![0].name).toBe("תצוגת חברה א");

    mockUser(adminB);
    const resB = await getViewAutomations(viewId);
    expect(resB.data).toHaveLength(1);
    expect(resB.data![0].name).toBe("תצוגת חברה ב");
  });

  it("full CRUD cycle isolated per company", async () => {
    // Company A creates
    mockUser(adminA);
    const createA = await createAutomationRule(validRuleInput({ name: "אוטומציה של א" }));
    expect(createA.success).toBe(true);

    // Company B creates
    mockUser(adminB);
    const createB = await createAutomationRule(validRuleInput({ name: "אוטומציה של ב" }));
    expect(createB.success).toBe(true);

    // A can't update B's rule
    mockUser(adminA);
    const updateCross = await updateAutomationRule(createB.data!.id, validRuleInput({ name: "ניסיון פריצה" }));
    expect(updateCross.success).toBe(false);

    // A can't delete B's rule
    const deleteCross = await deleteAutomationRule(createB.data!.id);
    expect(deleteCross.success).toBe(false);

    // A can't toggle B's rule
    const toggleCross = await toggleAutomationRule(createB.data!.id, false);
    expect(toggleCross.success).toBe(false);

    // B's rule is untouched
    const dbRuleB = await prisma.automationRule.findUnique({ where: { id: createB.data!.id } });
    expect(dbRuleB!.name).toBe("אוטומציה של ב");
    expect(dbRuleB!.isActive).toBe(true);

    // A can still manage own rule
    const updateA = await updateAutomationRule(createA.data!.id, validRuleInput({ name: "עודכן על ידי א" }));
    expect(updateA.success).toBe(true);
    expect(updateA.data!.name).toBe("עודכן על ידי א");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// onDelete:SetNull relations
// ═════════════════════════════════════════════════════════════════════════════

describe("onDelete:SetNull relations", () => {
  it("deleting creator user sets createdBy to null", async () => {
    // Create a temporary user to be the creator
    const tempUser = await prisma.user.create({
      data: {
        companyId: companyA,
        name: "Temp Creator",
        email: `temp-creator-${suffix}@test.com`,
        passwordHash: "$unused$",
        role: "basic" as any,
        permissions: {},
        allowedWriteTableIds: [],
      },
    });

    // Create a rule with this user as creator
    const rule = await seedRule(companyA, { createdBy: tempUser.id });

    // Verify createdBy is set
    const before = await prisma.automationRule.findUnique({ where: { id: rule.id } });
    expect(before!.createdBy).toBe(tempUser.id);

    // Delete the user
    await prisma.user.delete({ where: { id: tempUser.id } });

    // Verify createdBy is now null (onDelete:SetNull)
    const after = await prisma.automationRule.findUnique({ where: { id: rule.id } });
    expect(after).not.toBeNull();
    expect(after!.createdBy).toBeNull();
  });

  it("deleting ViewFolder sets folderId to null on rules", async () => {
    // Create a folder
    const folder = await prisma.viewFolder.create({
      data: { companyId: companyA, name: "תיקייה זמנית", type: "AUTOMATION" },
    });

    // Create a rule referencing this folder
    const rule = await seedRule(companyA, { folderId: folder.id });

    // Verify folderId is set
    const before = await prisma.automationRule.findUnique({ where: { id: rule.id } });
    expect(before!.folderId).toBe(folder.id);

    // Delete the folder
    await prisma.viewFolder.delete({ where: { id: folder.id } });

    // Verify folderId is now null (onDelete:SetNull)
    const after = await prisma.automationRule.findUnique({ where: { id: rule.id } });
    expect(after).not.toBeNull();
    expect(after!.folderId).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// onDelete:Cascade relations (parent deletion)
// ═════════════════════════════════════════════════════════════════════════════

describe("onDelete:Cascade relations (parent deletion)", () => {
  it("deleting CalendarEvent cascades to linked AutomationRule", async () => {
    const event = await prisma.calendarEvent.create({
      data: {
        companyId: companyA,
        title: "אירוע לבדיקת קסקייד",
        startTime: new Date("2026-06-01T10:00:00Z"),
        endTime: new Date("2026-06-01T11:00:00Z"),
      },
    });

    const rule = await seedRule(companyA, { calendarEventId: event.id });

    // Verify rule exists
    const before = await prisma.automationRule.findUnique({ where: { id: rule.id } });
    expect(before).not.toBeNull();
    expect(before!.calendarEventId).toBe(event.id);

    // Delete the CalendarEvent
    await prisma.calendarEvent.delete({ where: { id: event.id } });

    // Verify rule is cascade-deleted
    const after = await prisma.automationRule.findUnique({ where: { id: rule.id } });
    expect(after).toBeNull();
  });
});

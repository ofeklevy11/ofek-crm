import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";

// ── MOCK (infrastructure only — keep everything else real) ──────────────────
vi.mock("@/lib/permissions-server", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/rate-limit-action", () => ({
  checkActionRateLimit: vi.fn(),
  ANALYTICS_RATE_LIMITS: {
    read: { prefix: "ana-read", max: 60, windowSeconds: 60 },
    mutation: { prefix: "ana-mut", max: 15, windowSeconds: 60 },
    uiUpdate: { prefix: "ana-ui", max: 20, windowSeconds: 60 },
    preview: { prefix: "ana-prev", max: 5, windowSeconds: 30 },
  },
}));

vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: vi.fn() },
}));

vi.mock("@/lib/services/analytics-cache", () => ({
  getFullAnalyticsCache: vi.fn(),
  setFullAnalyticsCache: vi.fn(),
  invalidateFullCache: vi.fn(),
  invalidateItemCache: vi.fn(),
  isRefreshLockHeld: vi.fn(),
  getSingleItemCache: vi.fn(),
  setSingleItemCache: vi.fn(),
  acquireRefreshLock: vi.fn(),
  releaseRefreshLock: vi.fn(),
}));

vi.mock("@/lib/db-retry", () => ({
  withRetry: vi.fn((fn: () => any) => fn()),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/security/audit-security", () => ({
  logSecurityEvent: vi.fn(),
  SEC_ANALYTICS_VIEW_DELETED: "SEC_ANALYTICS_VIEW_DELETED",
}));

vi.mock("@/lib/analytics/calculate", () => ({
  calculateViewStats: vi.fn().mockResolvedValue({ stats: { count: 0 }, items: [], tableName: "Test" }),
  calculateRuleStats: vi.fn().mockResolvedValue({ stats: { count: 0 }, items: [] }),
  resolveTableNameFromConfig: vi.fn().mockResolvedValue("Test Table"),
}));

vi.mock("@/lib/company-validation", () => ({
  validateViewFolderInCompany: vi.fn().mockResolvedValue(true),
}));

// ── REAL: prisma, permissions, server actions, zod validation ───────────────
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { checkActionRateLimit } from "@/lib/rate-limit-action";
import { inngest } from "@/lib/inngest/client";
import { invalidateFullCache, invalidateItemCache, getFullAnalyticsCache, isRefreshLockHeld } from "@/lib/services/analytics-cache";
import { logSecurityEvent, SEC_ANALYTICS_VIEW_DELETED } from "@/lib/security/audit-security";
import { calculateViewStats } from "@/lib/analytics/calculate";
import { revalidatePath } from "next/cache";
import { validateViewFolderInCompany } from "@/lib/company-validation";

import {
  getAnalyticsLimits,
  createAnalyticsView,
  createAnalyticsReport,
  deleteAnalyticsView,
  updateAnalyticsView,
  getAnalyticsData,
  getAnalyticsDataAuthed,
  getAnalyticsDataForDashboard,
  updateAnalyticsViewOrder,
  updateAnalyticsViewColor,
  refreshAnalyticsItemWithChecks,
  previewAnalyticsView,
} from "@/app/actions/analytics";

import {
  createViewFolder,
  getViewFolders,
  deleteViewFolder,
  moveViewToFolder,
} from "@/app/actions/view-folders";

import { getAnalyticsRefreshUsage } from "@/app/actions/analytics-refresh";

// ── Helpers ─────────────────────────────────────────────────────────────────

function mockUser(user: TestUser | null) {
  vi.mocked(getCurrentUser).mockResolvedValue(
    user
      ? ({ allowedWriteTableIds: [], ...user } as any)
      : null,
  );
}

const VALID_CONFIG = { model: "Task" as const };
const VALID_VIEW_DATA = { title: "Monthly Task Count", type: "COUNT", config: VALID_CONFIG };

async function seedView(companyId: number, overrides: Record<string, unknown> = {}) {
  return prisma.analyticsView.create({
    data: {
      companyId,
      title: (overrides.title as string) ?? "Task Completion Tracker",
      type: (overrides.type as any) ?? "COUNT",
      config: (overrides.config as any) ?? VALID_CONFIG,
      order: (overrides.order as number) ?? 0,
      color: (overrides.color as string) ?? "bg-white",
      folderId: (overrides.folderId as number) ?? undefined,
    },
  });
}

async function seedRule(companyId: number, overrides: Record<string, unknown> = {}) {
  return prisma.automationRule.create({
    data: {
      companyId,
      name: (overrides.name as string) ?? "Task Duration Calculator",
      triggerType: (overrides.triggerType as any) ?? "TASK_STATUS_CHANGE",
      triggerConfig: (overrides.triggerConfig as any) ?? {},
      actionType: (overrides.actionType as any) ?? "CALCULATE_DURATION",
      actionConfig: (overrides.actionConfig as any) ?? {},
      isActive: (overrides.isActive as boolean) ?? true,
      analyticsOrder: (overrides.analyticsOrder as number) ?? undefined,
      analyticsColor: (overrides.analyticsColor as string) ?? undefined,
      folderId: (overrides.folderId as number) ?? undefined,
    },
  });
}

// ── State ───────────────────────────────────────────────────────────────────
let companyA: number;
let companyB: number;

interface TestUser {
  id: number;
  companyId: number;
  name: string;
  email: string;
  role: string;
  isPremium?: string;
  permissions: Record<string, boolean>;
}

let adminA: TestUser;
let managerA: TestUser;
let viewerA: TestUser;
let noPermsA: TestUser;
let premiumA: TestUser;
let superA: TestUser;
let adminB: TestUser;

const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// ── Setup / Teardown ────────────────────────────────────────────────────────

beforeAll(async () => {
  const coA = await prisma.company.create({ data: { name: "Analytics Co A", slug: `analytics-co-a-${suffix}` } });
  const coB = await prisma.company.create({ data: { name: "Analytics Co B", slug: `analytics-co-b-${suffix}` } });
  companyA = coA.id;
  companyB = coB.id;

  const mkUser = async (
    compId: number,
    name: string,
    role: string,
    perms: Record<string, boolean>,
    isPremium?: string,
  ): Promise<TestUser> => {
    const u = await prisma.user.create({
      data: {
        companyId: compId,
        name,
        email: `${name.toLowerCase().replace(/\s/g, "-")}-${suffix}@test.com`,
        passwordHash: "$unused$",
        role: role as any,
        isPremium: (isPremium as any) ?? "basic",
        permissions: perms,
        allowedWriteTableIds: [],
      },
    });
    return {
      id: u.id,
      companyId: u.companyId,
      name: u.name,
      email: u.email,
      role: u.role,
      isPremium: isPremium,
      permissions: perms,
    };
  };

  adminA = await mkUser(companyA, "Admin A", "admin", {});
  managerA = await mkUser(companyA, "Manager A", "basic", { canViewAnalytics: true, canManageAnalytics: true });
  viewerA = await mkUser(companyA, "Viewer A", "basic", { canViewAnalytics: true });
  noPermsA = await mkUser(companyA, "NoPerms A", "basic", {});
  premiumA = await mkUser(companyA, "Premium A", "admin", {}, "premium");
  superA = await mkUser(companyA, "Super A", "admin", {}, "super");
  adminB = await mkUser(companyB, "Admin B", "admin", {});
});

afterEach(async () => {
  // FK-safe order
  await prisma.analyticsRefreshLog.deleteMany({ where: { companyId: { in: [companyA, companyB] } } });
  await prisma.analyticsView.deleteMany({ where: { companyId: { in: [companyA, companyB] } } });
  await prisma.viewFolder.deleteMany({ where: { companyId: { in: [companyA, companyB] } } });
  await prisma.automationRule.deleteMany({ where: { companyId: { in: [companyA, companyB] } } });

  vi.clearAllMocks();
  // Re-default mocks
  vi.mocked(checkActionRateLimit).mockResolvedValue(null as any);
  vi.mocked(inngest.send).mockResolvedValue(undefined as any);
  vi.mocked(getFullAnalyticsCache).mockResolvedValue(null);
  vi.mocked(isRefreshLockHeld).mockResolvedValue(false);
  vi.mocked(invalidateFullCache).mockResolvedValue(undefined);
  vi.mocked(invalidateItemCache).mockResolvedValue(undefined);
  vi.mocked(calculateViewStats).mockResolvedValue({ stats: { count: 0 }, items: [], tableName: "Test" } as any);
  vi.mocked(validateViewFolderInCompany).mockResolvedValue(true);
});

afterAll(async () => {
  if (!companyA) return;
  await prisma.analyticsRefreshLog.deleteMany({ where: { companyId: { in: [companyA, companyB] } } });
  await prisma.analyticsView.deleteMany({ where: { companyId: { in: [companyA, companyB] } } });
  await prisma.viewFolder.deleteMany({ where: { companyId: { in: [companyA, companyB] } } });
  await prisma.automationRule.deleteMany({ where: { companyId: { in: [companyA, companyB] } } });
  await prisma.user.deleteMany({ where: { companyId: { in: [companyA, companyB] } } });
  await prisma.company.deleteMany({ where: { id: { in: [companyA, companyB] } } });
  await prisma.$disconnect();
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. Authentication & Authorization
// ═════════════════════════════════════════════════════════════════════════════

describe("Authentication & Authorization", () => {
  it("unauthenticated user gets error on getAnalyticsLimits", async () => {
    mockUser(null);
    const res = await getAnalyticsLimits();
    expect(res).toMatchObject({ success: false, error: "Unauthorized" });
  });

  it("unauthenticated user gets error on createAnalyticsView", async () => {
    mockUser(null);
    const res = await createAnalyticsView(VALID_VIEW_DATA);
    expect(res).toMatchObject({ success: false, error: "Unauthorized" });
  });

  it("unauthenticated user gets error on getAnalyticsData", async () => {
    mockUser(null);
    const res = await getAnalyticsData();
    expect(res).toMatchObject({ success: false, error: "Unauthorized" });
  });

  it("user without canViewAnalytics cannot read", async () => {
    mockUser(noPermsA);
    const res = await getAnalyticsLimits();
    expect(res).toMatchObject({ success: false, error: "Unauthorized" });
  });

  it("user without canManageAnalytics cannot create", async () => {
    mockUser(viewerA);
    const res = await createAnalyticsView(VALID_VIEW_DATA);
    expect(res).toMatchObject({ success: false, error: "Unauthorized" });
  });

  it("user without canManageAnalytics cannot delete", async () => {
    mockUser(viewerA);
    const res = await deleteAnalyticsView(999);
    expect(res).toMatchObject({ success: false, error: "Unauthorized" });
  });

  it("user without canManageAnalytics cannot update", async () => {
    mockUser(viewerA);
    const res = await updateAnalyticsView(999, { title: "New" });
    expect(res).toMatchObject({ success: false, error: "Unauthorized" });
  });

  it("admin user can perform all operations", async () => {
    mockUser(adminA);
    // Create
    const created = await createAnalyticsView(VALID_VIEW_DATA);
    expect(created.success).toBe(true);
    const viewId = (created as any).data.id;

    // Read limits
    const limits = await getAnalyticsLimits();
    expect(limits.success).toBe(true);

    // Read data
    const data = await getAnalyticsData();
    expect(data.success).toBe(true);

    // Update
    const updated = await updateAnalyticsView(viewId, { title: "Updated" });
    expect(updated.success).toBe(true);

    // Delete
    const deleted = await deleteAnalyticsView(viewId);
    expect(deleted.success).toBe(true);
  });

  it("basic user with canManageAnalytics can create/update/delete", async () => {
    mockUser(managerA);
    const created = await createAnalyticsView(VALID_VIEW_DATA);
    expect(created.success).toBe(true);
    const viewId = (created as any).data.id;

    const updated = await updateAnalyticsView(viewId, { title: "Manager Updated" });
    expect(updated.success).toBe(true);

    const deleted = await deleteAnalyticsView(viewId);
    expect(deleted.success).toBe(true);
  });

  it("basic user with only canViewAnalytics can read but not mutate", async () => {
    mockUser(viewerA);
    const data = await getAnalyticsData();
    expect(data.success).toBe(true);

    const limits = await getAnalyticsLimits();
    expect(limits.success).toBe(true);

    const createRes = await createAnalyticsView(VALID_VIEW_DATA);
    expect(createRes.success).toBe(false);
    expect(createRes.error).toBe("Unauthorized");

    const updateRes = await updateAnalyticsView(999, { title: "x" });
    expect(updateRes.success).toBe(false);
    expect(updateRes.error).toBe("Unauthorized");

    const deleteRes = await deleteAnalyticsView(999);
    expect(deleteRes.success).toBe(false);
    expect(deleteRes.error).toBe("Unauthorized");
  });

  // ── Auth tests for remaining actions ──────────────────────────────────────

  it("unauthenticated user gets error on updateAnalyticsViewOrder", async () => {
    mockUser(null);
    const res = await updateAnalyticsViewOrder([{ id: 1, type: "CUSTOM", order: 0 }]);
    expect(res).toMatchObject({ success: false, error: "Unauthorized" });
  });

  it("unauthenticated user gets error on updateAnalyticsViewColor", async () => {
    mockUser(null);
    const res = await updateAnalyticsViewColor(1, "CUSTOM", "bg-white");
    expect(res).toMatchObject({ success: false, error: "Unauthorized" });
  });

  it("unauthenticated user gets error on refreshAnalyticsItemWithChecks", async () => {
    mockUser(null);
    const res = await refreshAnalyticsItemWithChecks(1, "CUSTOM");
    expect(res).toMatchObject({ success: false, error: "Unauthorized" });
  });

  it("unauthenticated user gets error on previewAnalyticsView", async () => {
    mockUser(null);
    const res = await previewAnalyticsView({ type: "COUNT", config: VALID_CONFIG });
    expect(res).toMatchObject({ success: false, error: "Unauthorized" });
  });

  it("viewer cannot updateAnalyticsViewOrder", async () => {
    mockUser(viewerA);
    const res = await updateAnalyticsViewOrder([{ id: 1, type: "CUSTOM", order: 0 }]);
    expect(res).toMatchObject({ success: false, error: "Unauthorized" });
  });

  it("viewer cannot updateAnalyticsViewColor", async () => {
    mockUser(viewerA);
    const res = await updateAnalyticsViewColor(1, "CUSTOM", "bg-white");
    expect(res).toMatchObject({ success: false, error: "Unauthorized" });
  });

  it("viewer cannot previewAnalyticsView", async () => {
    mockUser(viewerA);
    const res = await previewAnalyticsView({ type: "COUNT", config: VALID_CONFIG });
    expect(res).toMatchObject({ success: false, error: "Unauthorized" });
  });

  it("unauthenticated user gets error on deleteAnalyticsView", async () => {
    mockUser(null);
    const res = await deleteAnalyticsView(999);
    expect(res).toMatchObject({ success: false, error: "Unauthorized" });
  });

  it("unauthenticated user gets error on createAnalyticsReport", async () => {
    mockUser(null);
    const res = await createAnalyticsReport({
      reportTitle: "Unauthorized Report",
      views: [{ title: "Revenue Count", type: "COUNT", config: VALID_CONFIG }],
    });
    expect(res).toMatchObject({ success: false, error: "Unauthorized" });
  });

  it("viewer cannot refreshAnalyticsItemWithChecks", async () => {
    mockUser(viewerA);
    const res = await refreshAnalyticsItemWithChecks(1, "CUSTOM");
    expect(res).toMatchObject({ success: false, error: "Unauthorized" });
  });

  it("unauthenticated user gets error on deleteViewFolder", async () => {
    mockUser(null);
    const res = await deleteViewFolder(999);
    expect(res).toMatchObject({ success: false, error: "Unauthorized" });
  });

  it("unauthenticated user gets error on moveViewToFolder", async () => {
    mockUser(null);
    const res = await moveViewToFolder(1, "CUSTOM", null);
    expect(res).toMatchObject({ success: false, error: "Unauthorized" });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. createAnalyticsView
// ═════════════════════════════════════════════════════════════════════════════

describe("createAnalyticsView", () => {
  it("creates a COUNT view with valid data and returns correct response shape", async () => {
    mockUser(adminA);
    const res = await createAnalyticsView({
      title: "Monthly Task Completion Rate",
      type: "COUNT",
      config: { model: "Task" },
      description: "Tracks monthly completions",
      color: "bg-blue-50",
    });
    expect(res.success).toBe(true);
    const data = (res as any).data;

    // Verify response shape
    expect(data.id).toEqual(expect.any(Number));
    expect(data.title).toBe("Monthly Task Completion Rate");
    expect(data.type).toBe("COUNT");
    expect(data.companyId).toBe(companyA);
    expect(data.config).toEqual({ model: "Task" });
    expect(data.color).toBe("bg-blue-50");
    expect(data.order).toBe(999);
    expect(data.description).toBe("Tracks monthly completions");

    // Verify DB record
    const view = await prisma.analyticsView.findFirst({ where: { id: data.id } });
    expect(view).not.toBeNull();
    expect(view!.type).toBe("COUNT");
    expect(view!.companyId).toBe(companyA);
    expect(view!.config).toEqual({ model: "Task" });
    expect(view!.color).toBe("bg-blue-50");
    expect(view!.order).toBe(999);
    expect(view!.description).toBe("Tracks monthly completions");
    expect(view!.createdAt).toBeInstanceOf(Date);
  });

  it("creates all 6 view types", async () => {
    mockUser(superA); // use super to avoid plan limits
    const types = ["COUNT", "AVERAGE", "SUM", "CONVERSION", "DISTRIBUTION", "GRAPH"];
    for (const type of types) {
      const res = await createAnalyticsView({ title: `Client Analytics ${type}`, type, config: VALID_CONFIG });
      expect(res.success).toBe(true);
      const view = await prisma.analyticsView.findFirst({ where: { companyId: companyA, title: `Client Analytics ${type}` } });
      expect(view!.type).toBe(type);
    }
  });

  it("defaults color to bg-white", async () => {
    mockUser(adminA);
    const res = await createAnalyticsView({ title: "Task Count Default Style", type: "COUNT", config: VALID_CONFIG });
    expect(res.success).toBe(true);
    const view = await prisma.analyticsView.findFirst({ where: { companyId: companyA, title: "Task Count Default Style" } });
    expect(view!.color).toBe("bg-white");
  });

  it("applies specified valid color", async () => {
    mockUser(adminA);
    const res = await createAnalyticsView({ title: "Revenue Highlight View", type: "COUNT", config: VALID_CONFIG, color: "bg-blue-50" });
    expect(res.success).toBe(true);
    const view = await prisma.analyticsView.findFirst({ where: { companyId: companyA, title: "Revenue Highlight View" } });
    expect(view!.color).toBe("bg-blue-50");
  });

  it("rejects empty title", async () => {
    mockUser(adminA);
    const res = await createAnalyticsView({ title: "", type: "COUNT", config: VALID_CONFIG });
    expect(res.success).toBe(false);
    expect(res.error).toBe("Title is required and must be under 200 characters");
  });

  it("rejects title > 200 chars", async () => {
    mockUser(adminA);
    const res = await createAnalyticsView({ title: "x".repeat(201), type: "COUNT", config: VALID_CONFIG });
    expect(res.success).toBe(false);
    expect(res.error).toBe("Title is required and must be under 200 characters");
  });

  it("rejects description > 2000 chars", async () => {
    mockUser(adminA);
    const res = await createAnalyticsView({ title: "X", type: "COUNT", config: VALID_CONFIG, description: "x".repeat(2001) });
    expect(res.success).toBe(false);
    expect(res.error).toBe("Description must be under 2000 characters");
  });

  it("rejects invalid type", async () => {
    mockUser(adminA);
    const res = await createAnalyticsView({ title: "Invalid Type Test View", type: "INVALID", config: VALID_CONFIG });
    expect(res).toMatchObject({ success: false, error: "Invalid analytics view type" });
  });

  it("rejects invalid color", async () => {
    mockUser(adminA);
    const res = await createAnalyticsView({ title: "Bad Color", type: "COUNT", config: VALID_CONFIG, color: "bg-invalid" });
    expect(res).toMatchObject({ success: false, error: "Invalid color" });
  });

  it("rejects invalid config (invalid model)", async () => {
    mockUser(adminA);
    const res = await createAnalyticsView({ title: "Bad Config", type: "COUNT", config: { model: "INVALID_MODEL" } });
    expect(res).toMatchObject({ success: false, error: "Invalid analytics config" });
  });

  it("rejects config > 16KB", async () => {
    mockUser(adminA);
    // Build a config that passes Zod schema but is over 16KB
    const bigFilter: Record<string, string> = {};
    for (let i = 0; i < 30; i++) {
      bigFilter[`key${i}`] = "x".repeat(600);
    }
    const res = await createAnalyticsView({ title: "Large Config Validation Test", type: "COUNT", config: { model: "Task", filter: bigFilter } });
    expect(res).toMatchObject({ success: false, error: "Config is too large" });
  });

  it("accepts config exactly at 16KB boundary", async () => {
    mockUser(adminA);
    // Build a config that after Zod stripping is exactly at or just under 16384 bytes
    const filter: Record<string, string> = {};
    // Start with base JSON: {"model":"Task","filter":{...}} which is small
    // Each entry adds: "keyNN":"value..." — fill to approach 16384
    for (let i = 0; i < 29; i++) {
      filter[`k${String(i).padStart(2, "0")}`] = "x".repeat(540);
    }
    const config = { model: "Task" as const, filter };
    const configSize = JSON.stringify(config).length;
    // Ensure we're under the limit (the exact size may vary but should be < 16384)
    expect(configSize).toBeLessThanOrEqual(16384);
    expect(configSize).toBeGreaterThan(15000); // verify it's meaningfully large

    const res = await createAnalyticsView({ title: "Boundary Config Size Test", type: "COUNT", config });
    expect(res.success).toBe(true);
    const view = await prisma.analyticsView.findFirst({ where: { companyId: companyA, title: "Boundary Config Size Test" } });
    expect(view).not.toBeNull();
  });

  it("valid config with all fields passes", async () => {
    mockUser(adminA);
    const res = await createAnalyticsView({
      title: "Completed Tasks Last Month",
      type: "COUNT",
      config: { model: "Task", filter: { status: "done" }, dateRangeType: "last_30_days" },
    });
    expect(res.success).toBe(true);
    const view = await prisma.analyticsView.findFirst({ where: { companyId: companyA, title: "Completed Tasks Last Month" } });
    expect(view).not.toBeNull();
    expect((view!.config as any).model).toBe("Task");
  });

  it("order defaults to 999", async () => {
    mockUser(adminA);
    await createAnalyticsView(VALID_VIEW_DATA);
    const view = await prisma.analyticsView.findFirst({ where: { companyId: companyA } });
    expect(view!.order).toBe(999);
  });

  it("invalidates cache after create", async () => {
    mockUser(adminA);
    await createAnalyticsView(VALID_VIEW_DATA);
    expect(invalidateFullCache).toHaveBeenCalledWith(companyA);
  });

  it("triggers background refresh job", async () => {
    mockUser(adminA);
    await createAnalyticsView(VALID_VIEW_DATA);
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({ name: "analytics/refresh-company", data: { companyId: companyA } }),
    );
  });

  it("accepts title exactly 200 chars (boundary)", async () => {
    mockUser(adminA);
    const res = await createAnalyticsView({ title: "A".repeat(200), type: "COUNT", config: VALID_CONFIG });
    expect(res.success).toBe(true);
    const view = await prisma.analyticsView.findFirst({ where: { companyId: companyA } });
    expect(view!.title).toHaveLength(200);
  });

  it("accepts description exactly 2000 chars (boundary)", async () => {
    mockUser(adminA);
    const res = await createAnalyticsView({
      title: "Boundary Description Test",
      type: "COUNT",
      config: VALID_CONFIG,
      description: "D".repeat(2000),
    });
    expect(res.success).toBe(true);
    const view = await prisma.analyticsView.findFirst({ where: { companyId: companyA, title: "Boundary Description Test" } });
    expect(view!.description).toHaveLength(2000);
  });

  it("rejected create leaves DB unchanged (0 records)", async () => {
    mockUser(adminA);
    const before = await prisma.analyticsView.count({ where: { companyId: companyA } });
    await createAnalyticsView({ title: "", type: "COUNT", config: VALID_CONFIG }); // empty title
    await createAnalyticsView({ title: "X", type: "INVALID", config: VALID_CONFIG }); // bad type
    await createAnalyticsView({ title: "X", type: "COUNT", config: { model: "INVALID" } }); // bad config
    const after = await prisma.analyticsView.count({ where: { companyId: companyA } });
    expect(after).toBe(before);
  });

  it("strips extra keys from config via Zod .strip()", async () => {
    mockUser(adminA);
    const res = await createAnalyticsView({
      title: "Config Strip Verification",
      type: "COUNT",
      config: { model: "Task", extraKey: "should-be-stripped", anotherExtra: 123 } as any,
    });
    expect(res.success).toBe(true);
    const view = await prisma.analyticsView.findFirst({ where: { companyId: companyA, title: "Config Strip Verification" } });
    const config = view!.config as any;
    expect(config.model).toBe("Task");
    expect(config.extraKey).toBeUndefined();
    expect(config.anotherExtra).toBeUndefined();
  });

  it("rate-limit triggered returns error without DB change", async () => {
    mockUser(adminA);
    vi.mocked(checkActionRateLimit).mockResolvedValueOnce({ error: "Rate limit exceeded" } as any);
    const before = await prisma.analyticsView.count({ where: { companyId: companyA } });
    const res = await createAnalyticsView({ title: "Rate Limited View", type: "COUNT", config: VALID_CONFIG });
    expect(res).toMatchObject({ success: false, error: "Rate limit exceeded" });
    const after = await prisma.analyticsView.count({ where: { companyId: companyA } });
    expect(after).toBe(before);
  });

  it("returns success even when initial stats calculation fails", async () => {
    mockUser(adminA);
    vi.mocked(calculateViewStats).mockRejectedValueOnce(new Error("Stats engine timeout"));

    const res = await createAnalyticsView({ title: "Resilient View Creation", type: "COUNT", config: VALID_CONFIG });
    expect(res.success).toBe(true);
    const viewId = (res as any).data.id;

    // View should exist in DB despite stats failure
    const view = await prisma.analyticsView.findFirst({ where: { id: viewId } });
    expect(view).not.toBeNull();
    expect(view!.title).toBe("Resilient View Creation");
    // cachedStats should be null since stats calc failed
    expect(view!.cachedStats).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. createAnalyticsView - Plan Limits
// ═════════════════════════════════════════════════════════════════════════════

describe("createAnalyticsView - Plan Limits", () => {
  it("basic plan: blocks 6th regular view (DB count unchanged)", async () => {
    mockUser(adminA);
    for (let i = 0; i < 5; i++) await seedView(companyA, { title: `Active Client View ${i + 1}` });

    const res = await createAnalyticsView({ title: "Over Limit View", type: "COUNT", config: VALID_CONFIG });
    expect(res.success).toBe(false);
    expect(res.error).toContain("הגעת למגבלת האנליטיקות");
    // Verify DB still has exactly 5 views
    const total = await prisma.analyticsView.count({ where: { companyId: companyA } });
    expect(total).toBe(5);
  });

  it("basic plan: blocks 4th graph view (DB count unchanged)", async () => {
    mockUser(adminA);
    for (let i = 0; i < 3; i++) await seedView(companyA, { title: `Revenue Graph ${i + 1}`, type: "GRAPH" });

    const res = await createAnalyticsView({ title: "4th Graph", type: "GRAPH", config: VALID_CONFIG });
    expect(res.success).toBe(false);
    expect(res.error).toContain("הגעת למגבלת הגרפים");
    const total = await prisma.analyticsView.count({ where: { companyId: companyA, type: "GRAPH" } });
    expect(total).toBe(3);
  });

  it("basic plan: regular and graph limits are independent", async () => {
    mockUser(adminA);
    for (let i = 0; i < 5; i++) await seedView(companyA, { title: `Task Counter ${i + 1}`, type: "COUNT" });

    const res = await createAnalyticsView({ title: "Graph OK", type: "GRAPH", config: VALID_CONFIG });
    expect(res.success).toBe(true);
    const graph = await prisma.analyticsView.findFirst({ where: { companyId: companyA, type: "GRAPH" } });
    expect(graph).not.toBeNull();
  });

  it("premium plan: allows up to 15 regular views", async () => {
    mockUser(premiumA);
    for (let i = 0; i < 14; i++) await seedView(companyA, { title: `Premium Metric ${i + 1}`, type: "COUNT" });

    const res = await createAnalyticsView({ title: "Premium Revenue Tracker", type: "COUNT", config: VALID_CONFIG });
    expect(res.success).toBe(true);

    const over = await createAnalyticsView({ title: "Over Premium Limit View", type: "COUNT", config: VALID_CONFIG });
    expect(over.success).toBe(false);
    expect(over.error).toContain("הגעת למגבלת האנליטיקות");
  });

  it("super plan: unlimited views", async () => {
    mockUser(superA);
    for (let i = 0; i < 20; i++) await seedView(companyA, { title: `Enterprise Metric ${i + 1}`, type: "COUNT" });

    const res = await createAnalyticsView({ title: "Enterprise Custom Metric", type: "COUNT", config: VALID_CONFIG });
    expect(res.success).toBe(true);
    const total = await prisma.analyticsView.count({ where: { companyId: companyA } });
    expect(total).toBe(21);
  });

  it("TOCTOU prevention: serializable transaction ensures atomic limit check", async () => {
    mockUser(adminA);
    for (let i = 0; i < 4; i++) await seedView(companyA, { title: `Concurrent Test View ${i + 1}`, type: "COUNT" });

    // Two concurrent creates — only one should succeed (limit is 5)
    const [r1, r2] = await Promise.all([
      createAnalyticsView({ title: "Race A", type: "COUNT", config: VALID_CONFIG }),
      createAnalyticsView({ title: "Race B", type: "COUNT", config: VALID_CONFIG }),
    ]);
    const successes = [r1, r2].filter((r) => r.success);
    // At least one succeeds, and total views should not exceed 5
    expect(successes.length).toBeGreaterThanOrEqual(1);
    const total = await prisma.analyticsView.count({ where: { companyId: companyA, type: "COUNT" } });
    expect(total).toBeLessThanOrEqual(5);
  });

  it("SUM/AVERAGE/DISTRIBUTION are not counted in regular or graph limits", async () => {
    mockUser(adminA);
    // Fill regular slots to limit (5 COUNT)
    for (let i = 0; i < 5; i++) await seedView(companyA, { title: `Count View ${i + 1}`, type: "COUNT" });

    // SUM should succeed — not counted as regular or graph
    const sumRes = await createAnalyticsView({ title: "Revenue Sum", type: "SUM", config: VALID_CONFIG });
    expect(sumRes.success).toBe(true);

    // AVERAGE should succeed
    const avgRes = await createAnalyticsView({ title: "Avg Task Duration", type: "AVERAGE", config: VALID_CONFIG });
    expect(avgRes.success).toBe(true);

    // DISTRIBUTION should succeed
    const distRes = await createAnalyticsView({ title: "Status Distribution", type: "DISTRIBUTION", config: VALID_CONFIG });
    expect(distRes.success).toBe(true);

    // But another COUNT should still fail (still at regular limit)
    const countRes = await createAnalyticsView({ title: "Over Regular Limit", type: "COUNT", config: VALID_CONFIG });
    expect(countRes.success).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. createAnalyticsReport
// ═════════════════════════════════════════════════════════════════════════════

describe("createAnalyticsReport", () => {
  it("creates folder + views with correct types, colors, and companyId", async () => {
    mockUser(adminA);
    const res = await createAnalyticsReport({
      reportTitle: "Q4 Revenue Analysis",
      views: [
        { title: "Monthly Revenue Count", type: "COUNT", config: VALID_CONFIG },
        { title: "Total Revenue Sum", type: "SUM", config: VALID_CONFIG },
      ],
    });
    expect(res.success).toBe(true);
    const folderId = (res as any).data.folderId;
    const folder = await prisma.viewFolder.findFirst({ where: { id: folderId, companyId: companyA } });
    expect(folder).not.toBeNull();
    expect(folder!.name).toBe("Q4 Revenue Analysis");

    const views = await prisma.analyticsView.findMany({ where: { folderId, companyId: companyA }, orderBy: { order: "asc" } });
    expect(views).toHaveLength(2);
    expect(views[0].title).toBe("Monthly Revenue Count");
    expect(views[0].type).toBe("COUNT");
    expect(views[0].color).toBe("bg-white");
    expect(views[0].companyId).toBe(companyA);
    expect(views[1].title).toBe("Total Revenue Sum");
    expect(views[1].type).toBe("SUM");
    expect(views[1].color).toBe("bg-white");
    expect(views[1].companyId).toBe(companyA);
  });

  it("all views get correct 0-based order", async () => {
    mockUser(adminA);
    const res = await createAnalyticsReport({
      reportTitle: "Ordered Sales Report",
      views: [
        { title: "New Deals Count", type: "COUNT", config: VALID_CONFIG },
        { title: "Pipeline Value", type: "COUNT", config: VALID_CONFIG },
        { title: "Win Rate", type: "COUNT", config: VALID_CONFIG },
      ],
    });
    expect(res.success).toBe(true);
    const folderId = (res as any).data.folderId;
    const views = await prisma.analyticsView.findMany({ where: { folderId }, orderBy: { order: "asc" } });
    expect(views.map((v) => v.order)).toEqual([0, 1, 2]);
  });

  it("rejects empty reportTitle", async () => {
    mockUser(adminA);
    const res = await createAnalyticsReport({ reportTitle: "", views: [{ title: "Revenue Count", type: "COUNT", config: VALID_CONFIG }] });
    expect(res.success).toBe(false);
    expect(res.error).toBe("Report title is required and must be under 200 characters");
  });

  it("rejects reportTitle > 200 chars", async () => {
    mockUser(adminA);
    const res = await createAnalyticsReport({ reportTitle: "x".repeat(201), views: [{ title: "Revenue Count", type: "COUNT", config: VALID_CONFIG }] });
    expect(res.success).toBe(false);
    expect(res.error).toBe("Report title is required and must be under 200 characters");
  });

  it("rejects empty views array", async () => {
    mockUser(adminA);
    const res = await createAnalyticsReport({ reportTitle: "X", views: [] });
    expect(res.success).toBe(false);
    expect(res.error).toBe("Views array must have 1-20 items");
  });

  it("rejects > 20 views", async () => {
    mockUser(adminA);
    const views = Array.from({ length: 21 }, (_, i) => ({ title: `Metric View ${i + 1}`, type: "COUNT", config: VALID_CONFIG }));
    const res = await createAnalyticsReport({ reportTitle: "Too many", views });
    expect(res.success).toBe(false);
    expect(res.error).toBe("Views array must have 1-20 items");
  });

  it("validates each view in array", async () => {
    mockUser(adminA);
    const res = await createAnalyticsReport({
      reportTitle: "Mixed Validity Report",
      views: [
        { title: "Valid Revenue Count", type: "COUNT", config: VALID_CONFIG },
        { title: "Invalid Type View", type: "INVALID", config: VALID_CONFIG },
      ],
    });
    expect(res.success).toBe(false);
    expect(res.error).toBe("Invalid view type: INVALID");
  });

  it("rejects report with per-view empty title", async () => {
    mockUser(adminA);
    const res = await createAnalyticsReport({
      reportTitle: "Empty Title Report",
      views: [{ title: "", type: "COUNT", config: VALID_CONFIG }],
    });
    expect(res.success).toBe(false);
    expect(res.error).toBe("Each view must have a title under 200 characters");
  });

  it("plan limits apply to batch total", async () => {
    mockUser(adminA);
    // Seed 4 COUNT views to approach limit of 5
    for (let i = 0; i < 4; i++) await seedView(companyA, { title: `Existing Client View ${i + 1}`, type: "COUNT" });

    const res = await createAnalyticsReport({
      reportTitle: "Over Limit Report",
      views: [
        { title: "New View A", type: "COUNT", config: VALID_CONFIG },
        { title: "New View B", type: "COUNT", config: VALID_CONFIG },
      ],
    });
    expect(res.success).toBe(false);
    expect(res.error).toContain("הגעת למגבלת האנליטיקות");
  });

  it("rejects report with per-view description > 2000 chars", async () => {
    mockUser(adminA);
    const res = await createAnalyticsReport({
      reportTitle: "Long Desc Report",
      views: [{ title: "View With Long Desc", type: "COUNT", config: VALID_CONFIG, description: "x".repeat(2001) }],
    });
    expect(res.success).toBe(false);
    expect(res.error).toBe("View description must be under 2000 characters");
  });

  it("rejects report with per-view config > 16KB", async () => {
    mockUser(adminA);
    const bigFilter: Record<string, string> = {};
    for (let i = 0; i < 30; i++) {
      bigFilter[`key${i}`] = "x".repeat(600);
    }
    const res = await createAnalyticsReport({
      reportTitle: "Large Config Report",
      views: [{ title: "View With Big Config", type: "COUNT", config: { model: "Task", filter: bigFilter } }],
    });
    expect(res.success).toBe(false);
    expect(res.error).toBe("Config is too large");
  });

  it("rejects report with per-view invalid config", async () => {
    mockUser(adminA);
    const res = await createAnalyticsReport({
      reportTitle: "Invalid Config Report",
      views: [{ title: "Bad Config View", type: "COUNT", config: { model: "INVALID" } }],
    });
    expect(res.success).toBe(false);
    expect(res.error).toBe("Invalid analytics config in one of the views");
  });

  it("viewer cannot create analytics report", async () => {
    mockUser(viewerA);
    const foldersBefore = await prisma.viewFolder.count({ where: { companyId: companyA } });
    const viewsBefore = await prisma.analyticsView.count({ where: { companyId: companyA } });
    const res = await createAnalyticsReport({
      reportTitle: "Viewer Report Attempt",
      views: [{ title: "Revenue Count", type: "COUNT", config: VALID_CONFIG }],
    });
    expect(res).toMatchObject({ success: false, error: "Unauthorized" });
    // Verify no DB records created
    const foldersAfter = await prisma.viewFolder.count({ where: { companyId: companyA } });
    const viewsAfter = await prisma.analyticsView.count({ where: { companyId: companyA } });
    expect(foldersAfter).toBe(foldersBefore);
    expect(viewsAfter).toBe(viewsBefore);
  });

  it("rejected report leaves no folder or views (transaction rollback)", async () => {
    mockUser(adminA);
    // Seed 5 COUNT views to hit basic plan limit
    for (let i = 0; i < 5; i++) await seedView(companyA, { title: `Pre-existing View ${i + 1}`, type: "COUNT" });

    const foldersBefore = await prisma.viewFolder.count({ where: { companyId: companyA } });
    const viewsBefore = await prisma.analyticsView.count({ where: { companyId: companyA } });

    const res = await createAnalyticsReport({
      reportTitle: "Should Fail Report",
      views: [{ title: "Over Limit View", type: "COUNT", config: VALID_CONFIG }],
    });
    expect(res.success).toBe(false);

    // Verify no folder or views were created (transaction rolled back)
    const foldersAfter = await prisma.viewFolder.count({ where: { companyId: companyA } });
    const viewsAfter = await prisma.analyticsView.count({ where: { companyId: companyA } });
    expect(foldersAfter).toBe(foldersBefore);
    expect(viewsAfter).toBe(viewsBefore);
  });

  it("triggers background refresh after report creation", async () => {
    mockUser(adminA);
    const res = await createAnalyticsReport({
      reportTitle: "Refresh Trigger Report",
      views: [{ title: "Revenue Count", type: "COUNT", config: VALID_CONFIG }],
    });
    expect(res.success).toBe(true);
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({ name: "analytics/refresh-company", data: { companyId: companyA } }),
    );
  });

  it("returns success even when per-view stats calculation fails", async () => {
    mockUser(adminA);
    // Make every calculateViewStats call reject
    vi.mocked(calculateViewStats).mockRejectedValue(new Error("Stats failure"));

    const res = await createAnalyticsReport({
      reportTitle: "Resilient Stats Report",
      views: [
        { title: "Failing Stats View A", type: "COUNT", config: VALID_CONFIG },
        { title: "Failing Stats View B", type: "SUM", config: VALID_CONFIG },
      ],
    });
    expect(res.success).toBe(true);
    const folderId = (res as any).data.folderId;

    // Folder and views should exist in DB despite stats failures
    const folder = await prisma.viewFolder.findFirst({ where: { id: folderId, companyId: companyA } });
    expect(folder).not.toBeNull();
    expect(folder!.name).toBe("Resilient Stats Report");

    const views = await prisma.analyticsView.findMany({ where: { folderId, companyId: companyA }, orderBy: { order: "asc" } });
    expect(views).toHaveLength(2);
    expect(views[0].title).toBe("Failing Stats View A");
    expect(views[1].title).toBe("Failing Stats View B");
    // cachedStats should be null since all stats calcs failed
    expect(views[0].cachedStats).toBeNull();
    expect(views[1].cachedStats).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. updateAnalyticsView
// ═════════════════════════════════════════════════════════════════════════════

describe("updateAnalyticsView", () => {
  it("updates title and changes updatedAt", async () => {
    mockUser(adminA);
    const view = await seedView(companyA, { title: "Original Client Report" });
    const createdAt = view.createdAt;
    // Small delay to ensure updatedAt differs
    await new Promise((r) => setTimeout(r, 50));

    const res = await updateAnalyticsView(view.id, { title: "Updated Client Report" });
    expect(res.success).toBe(true);
    const updated = await prisma.analyticsView.findFirst({ where: { id: view.id } });
    expect(updated!.title).toBe("Updated Client Report");
    expect(updated!.type).toBe("COUNT"); // unchanged
    expect(updated!.updatedAt.getTime()).toBeGreaterThan(createdAt.getTime());
  });

  it("updates description", async () => {
    mockUser(adminA);
    const view = await seedView(companyA);
    const res = await updateAnalyticsView(view.id, { description: "New desc" });
    expect(res.success).toBe(true);
    const updated = await prisma.analyticsView.findFirst({ where: { id: view.id } });
    expect(updated!.description).toBe("New desc");
  });

  it("updates type", async () => {
    mockUser(adminA);
    const view = await seedView(companyA, { type: "COUNT" });
    const res = await updateAnalyticsView(view.id, { type: "GRAPH" });
    expect(res.success).toBe(true);
    const updated = await prisma.analyticsView.findFirst({ where: { id: view.id } });
    expect(updated!.type).toBe("GRAPH");
  });

  it("updates config", async () => {
    mockUser(adminA);
    const view = await seedView(companyA);
    const newConfig = { model: "Retainer" as const };
    const res = await updateAnalyticsView(view.id, { config: newConfig });
    expect(res.success).toBe(true);
    const updated = await prisma.analyticsView.findFirst({ where: { id: view.id } });
    expect((updated!.config as any).model).toBe("Retainer");
  });

  it("updates color", async () => {
    mockUser(adminA);
    const view = await seedView(companyA);
    const res = await updateAnalyticsView(view.id, { color: "bg-red-50" });
    expect(res.success).toBe(true);
    const updated = await prisma.analyticsView.findFirst({ where: { id: view.id } });
    expect(updated!.color).toBe("bg-red-50");
  });

  it("rejects update with invalid title (empty)", async () => {
    mockUser(adminA);
    const view = await seedView(companyA);
    const res = await updateAnalyticsView(view.id, { title: "" });
    expect(res.success).toBe(false);
    expect(res.error).toBe("Title is required and must be under 200 characters");
  });

  it("rejects update with title > 200 chars", async () => {
    mockUser(adminA);
    const view = await seedView(companyA);
    const res = await updateAnalyticsView(view.id, { title: "x".repeat(201) });
    expect(res.success).toBe(false);
    expect(res.error).toBe("Title is required and must be under 200 characters");
    // Verify DB unchanged
    const check = await prisma.analyticsView.findFirst({ where: { id: view.id } });
    expect(check!.title).toBe("Task Completion Tracker");
  });

  it("rejects update with invalid type", async () => {
    mockUser(adminA);
    const view = await seedView(companyA);
    const res = await updateAnalyticsView(view.id, { type: "BAD" });
    expect(res).toMatchObject({ success: false, error: "Invalid analytics view type" });
  });

  it("rejects update with invalid color", async () => {
    mockUser(adminA);
    const view = await seedView(companyA);
    const res = await updateAnalyticsView(view.id, { color: "nope" });
    expect(res).toMatchObject({ success: false, error: "Invalid color" });
  });

  it("rejects update with invalid config", async () => {
    mockUser(adminA);
    const view = await seedView(companyA);
    const res = await updateAnalyticsView(view.id, { config: { model: "INVALID" } });
    expect(res).toMatchObject({ success: false, error: "Invalid analytics config" });
  });

  it("rejects update with config > 16KB", async () => {
    mockUser(adminA);
    const view = await seedView(companyA);
    const bigFilter: Record<string, string> = {};
    for (let i = 0; i < 30; i++) bigFilter[`key${i}`] = "x".repeat(600);
    const res = await updateAnalyticsView(view.id, { config: { model: "Task", filter: bigFilter } });
    expect(res).toMatchObject({ success: false, error: "Config is too large" });
    // Verify DB unchanged
    const check = await prisma.analyticsView.findFirst({ where: { id: view.id } });
    expect((check!.config as any).model).toBe("Task");
  });

  it("update non-existent view returns error", async () => {
    mockUser(adminA);
    const res = await updateAnalyticsView(999999, { title: "Ghost" });
    expect(res.success).toBe(false);
    expect(res.error).toBe("Failed to update view");
  });

  it("recalculates stats when config is updated", async () => {
    mockUser(adminA);
    const view = await seedView(companyA);
    vi.mocked(calculateViewStats).mockClear();
    await updateAnalyticsView(view.id, { config: { model: "Retainer" } });
    expect(calculateViewStats).toHaveBeenCalled();
  });

  it("recalculates stats when type is updated", async () => {
    mockUser(adminA);
    const view = await seedView(companyA, { type: "COUNT" });
    vi.mocked(calculateViewStats).mockClear();
    await updateAnalyticsView(view.id, { type: "GRAPH" });
    expect(calculateViewStats).toHaveBeenCalled();
  });

  it("does NOT recalculate stats when only title is updated", async () => {
    mockUser(adminA);
    const view = await seedView(companyA);
    vi.mocked(calculateViewStats).mockClear();
    await updateAnalyticsView(view.id, { title: "Title Only Change" });
    expect(calculateViewStats).not.toHaveBeenCalled();
  });

  it("strips extra keys from config via Zod .strip() on update", async () => {
    mockUser(adminA);
    const view = await seedView(companyA);
    const res = await updateAnalyticsView(view.id, {
      config: { model: "Task", extraKey: "should-be-stripped", anotherExtra: 123 } as any,
    });
    expect(res.success).toBe(true);
    const updated = await prisma.analyticsView.findFirst({ where: { id: view.id } });
    const config = updated!.config as any;
    expect(config.model).toBe("Task");
    expect(config.extraKey).toBeUndefined();
    expect(config.anotherExtra).toBeUndefined();
  });

  it("rejects update with description > 2000 chars", async () => {
    mockUser(adminA);
    const view = await seedView(companyA, { title: "Description Limit Test" });
    const res = await updateAnalyticsView(view.id, { description: "x".repeat(2001) });
    expect(res).toMatchObject({ success: false, error: "Description must be under 2000 characters" });
    // Verify DB unchanged
    const check = await prisma.analyticsView.findFirst({ where: { id: view.id } });
    expect(check!.title).toBe("Description Limit Test");
    expect(check!.description).toBeNull();
  });

  it("invalidates caches and triggers refresh after update", async () => {
    mockUser(adminA);
    const view = await seedView(companyA);
    await updateAnalyticsView(view.id, { title: "Cache Invalidation Update" });

    expect(invalidateFullCache).toHaveBeenCalledWith(companyA);
    expect(invalidateItemCache).toHaveBeenCalledWith(companyA, "view", view.id);
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({ name: "analytics/refresh-company", data: { companyId: companyA } }),
    );
  });

  it("returns success even when stats recalculation fails on config update", async () => {
    mockUser(adminA);
    const view = await seedView(companyA);
    vi.mocked(calculateViewStats).mockRejectedValueOnce(new Error("Stats recalc failure"));

    const res = await updateAnalyticsView(view.id, { config: { model: "Retainer" } });
    expect(res.success).toBe(true);

    // Config should be updated in DB despite stats failure
    const updated = await prisma.analyticsView.findFirst({ where: { id: view.id } });
    expect((updated!.config as any).model).toBe("Retainer");
  });

  it("cross-company: cannot update another company's view", async () => {
    const viewB = await seedView(companyB, { title: "External Company Metric" });
    mockUser(adminA);
    const res = await updateAnalyticsView(viewB.id, { title: "Hijacked" });
    expect(res.success).toBe(false);
    expect(res.error).toBe("Failed to update view");
    // Verify view is unchanged
    const check = await prisma.analyticsView.findFirst({ where: { id: viewB.id } });
    expect(check!.title).toBe("External Company Metric");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. deleteAnalyticsView
// ═════════════════════════════════════════════════════════════════════════════

describe("deleteAnalyticsView", () => {
  it("deletes existing view", async () => {
    mockUser(adminA);
    const view = await seedView(companyA);
    const res = await deleteAnalyticsView(view.id);
    expect(res.success).toBe(true);
    const check = await prisma.analyticsView.findFirst({ where: { id: view.id } });
    expect(check).toBeNull();
  });

  it("logs security event on delete", async () => {
    mockUser(adminA);
    const view = await seedView(companyA);
    await deleteAnalyticsView(view.id);
    expect(logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: SEC_ANALYTICS_VIEW_DELETED, companyId: companyA }),
    );
  });

  it("invalidates caches after delete", async () => {
    mockUser(adminA);
    const view = await seedView(companyA);
    await deleteAnalyticsView(view.id);
    expect(invalidateFullCache).toHaveBeenCalledWith(companyA);
    expect(invalidateItemCache).toHaveBeenCalledWith(companyA, "view", view.id);
  });

  it("triggers background refresh after delete", async () => {
    mockUser(adminA);
    const view = await seedView(companyA);
    await deleteAnalyticsView(view.id);
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({ name: "analytics/refresh-company", data: { companyId: companyA } }),
    );
  });

  it("delete non-existent view returns error", async () => {
    mockUser(adminA);
    const res = await deleteAnalyticsView(999999);
    expect(res.success).toBe(false);
    expect(res.error).toBe("Failed to delete view");
  });

  it("cross-company: cannot delete another company's view", async () => {
    const viewB = await seedView(companyB);
    mockUser(adminA);
    const res = await deleteAnalyticsView(viewB.id);
    expect(res.success).toBe(false);
    expect(res.error).toBe("Failed to delete view");
    // Verify view still exists
    const check = await prisma.analyticsView.findFirst({ where: { id: viewB.id } });
    expect(check).not.toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. getAnalyticsData
// ═════════════════════════════════════════════════════════════════════════════

describe("getAnalyticsData", () => {
  it("returns empty array when no views exist", async () => {
    mockUser(adminA);
    const res = await getAnalyticsData();
    expect(res.success).toBe(true);
    expect((res as any).data).toEqual([]);
  });

  it("returns custom views sorted by order", async () => {
    mockUser(adminA);
    await seedView(companyA, { title: "Quarterly Revenue", order: 2 });
    await seedView(companyA, { title: "Active Clients Count", order: 0 });
    await seedView(companyA, { title: "Monthly Retention Rate", order: 1 });

    const res = await getAnalyticsData();
    expect(res.success).toBe(true);
    const data = (res as any).data;
    expect(data[0].ruleName).toBe("Active Clients Count");
    expect(data[1].ruleName).toBe("Monthly Retention Rate");
    expect(data[2].ruleName).toBe("Quarterly Revenue");
  });

  it("returns automation rules alongside custom views with correct sources", async () => {
    mockUser(adminA);
    await seedView(companyA, { title: "Customer Conversion Rate", order: 1 });
    await seedRule(companyA, { name: "Task Duration Tracker", analyticsOrder: 0 });

    const res = await getAnalyticsData();
    expect(res.success).toBe(true);
    const data = (res as any).data;
    expect(data.length).toBe(2);
    // Verify specific items by source
    const automation = data.find((d: any) => d.source === "AUTOMATION");
    const custom = data.find((d: any) => d.source === "CUSTOM");
    expect(automation).toBeDefined();
    expect(automation.ruleName).toBe("Task Duration Tracker");
    expect(custom).toBeDefined();
    expect(custom.ruleName).toBe("Customer Conversion Rate");
  });

  it("custom view response shape", async () => {
    mockUser(adminA);
    await seedView(companyA, { title: "Client Conversion Rate", order: 5 });

    const res = await getAnalyticsData();
    const view = (res as any).data[0];
    expect(view.id).toMatch(/^view_/);
    expect(view.viewId).toBeDefined();
    expect(view.ruleName).toBe("Client Conversion Rate");
    expect(view.type).toBe("COUNT");
    expect(view.source).toBe("CUSTOM");
    expect(view.config).toBeDefined();
    expect(view.color).toBe("bg-white");
    expect(view.order).toBe(5);
    expect(view.folderId).toBeNull();
    expect(view.data).toEqual([]);
    expect(view.stats).toEqual({ count: 0 });
    expect(view.tableName).toBe("Test");
    expect(view.lastRefreshed).toBeNull();
  });

  it("views in folder include folderId in response", async () => {
    mockUser(adminA);
    const folder = await prisma.viewFolder.create({
      data: { name: "Folder For Shape Test", companyId: companyA },
    });
    await seedView(companyA, { title: "Folder View Shape Test", folderId: folder.id });

    const res = await getAnalyticsData();
    expect(res.success).toBe(true);
    const folderView = (res as any).data.find((d: any) => d.ruleName === "Folder View Shape Test");
    expect(folderView).toBeDefined();
    expect(folderView.folderId).toBe(folder.id);
  });

  it("rule view response shape", async () => {
    mockUser(adminA);
    await seedRule(companyA, { name: "Onboarding Duration Metric", analyticsOrder: 3 });

    const res = await getAnalyticsData();
    const rule = (res as any).data.find((d: any) => d.source === "AUTOMATION");
    expect(rule.id).toMatch(/^rule_/);
    expect(rule.ruleId).toBeDefined();
    expect(rule.source).toBe("AUTOMATION");
    expect(rule.ruleName).toBe("Onboarding Duration Metric");
    expect(rule.tableName).toBe("משימות");
    expect(rule.type).toBe("single-event");
    expect(rule.data).toEqual([]);
    expect(rule.stats).toEqual({ count: 0 });
    expect(rule.order).toBe(3);
    expect(rule.color).toBe("bg-white");
    expect(rule.folderId).toBeNull();
    expect(rule.lastRefreshed).toBeNull();
  });

  it("cross-company isolation", async () => {
    mockUser(adminA);
    await seedView(companyA, { title: "Company A Revenue" });
    await seedView(companyB, { title: "Company B Revenue" });

    const res = await getAnalyticsData();
    expect(res.success).toBe(true);
    const titles = (res as any).data.map((d: any) => d.ruleName);
    expect(titles).toContain("Company A Revenue");
    expect(titles).not.toContain("Company B Revenue");
  });

  it("returns cached data when Redis cache is available (cache hit)", async () => {
    mockUser(adminA);
    const cachedData = [
      { id: "view_1", ruleName: "Cached Revenue View", source: "CUSTOM", order: 0 },
    ];
    vi.mocked(getFullAnalyticsCache).mockResolvedValueOnce(cachedData as any);

    const res = await getAnalyticsData();
    expect(res.success).toBe(true);
    expect((res as any).data).toEqual(cachedData);
  });

  it("rate-limited user gets error", async () => {
    mockUser(adminA);
    vi.mocked(checkActionRateLimit).mockResolvedValueOnce({ error: "Too many requests" } as any);
    const res = await getAnalyticsData();
    expect(res).toMatchObject({ success: false, error: "Too many requests" });
  });

  it("skips background refresh when refresh lock is held", async () => {
    mockUser(adminA);
    await seedView(companyA, { title: "Lock Test View" });
    vi.mocked(isRefreshLockHeld).mockResolvedValueOnce(true);

    const res = await getAnalyticsData();
    expect(res.success).toBe(true);
    // Flush fire-and-forget microtask chain (isRefreshLockHeld → .then → inngest.send)
    await new Promise((r) => setTimeout(r, 50));
    // inngest.send should NOT be called with analytics/refresh-company for background refresh
    const refreshCalls = vi.mocked(inngest.send).mock.calls.filter(
      (call) => (call[0] as any)?.name === "analytics/refresh-company",
    );
    expect(refreshCalls).toHaveLength(0);
  });

  it("excludes inactive automation rules (isActive: false)", async () => {
    mockUser(adminA);
    await seedRule(companyA, { name: "Active Duration Rule", isActive: true });
    await seedRule(companyA, { name: "Disabled Duration Rule", isActive: false });

    const res = await getAnalyticsData();
    expect(res.success).toBe(true);
    const ruleNames = (res as any).data
      .filter((d: any) => d.source === "AUTOMATION")
      .map((d: any) => d.ruleName);
    expect(ruleNames).toContain("Active Duration Rule");
    expect(ruleNames).not.toContain("Disabled Duration Rule");
  });

  it("includes MULTI_ACTION rule with CALCULATE_DURATION action", async () => {
    mockUser(adminA);
    await seedRule(companyA, {
      name: "Multi Action With Duration",
      actionType: "MULTI_ACTION",
      actionConfig: {
        actions: [
          { type: "CALCULATE_DURATION", config: {} },
          { type: "SEND_NOTIFICATION", config: {} },
        ],
      },
    });

    const res = await getAnalyticsData();
    expect(res.success).toBe(true);
    const ruleNames = (res as any).data
      .filter((d: any) => d.source === "AUTOMATION")
      .map((d: any) => d.ruleName);
    expect(ruleNames).toContain("Multi Action With Duration");
  });

  it("excludes MULTI_ACTION rule without any duration action", async () => {
    mockUser(adminA);
    await seedRule(companyA, {
      name: "Multi Action No Duration",
      actionType: "MULTI_ACTION",
      actionConfig: {
        actions: [
          { type: "SEND_NOTIFICATION", config: {} },
          { type: "UPDATE_FIELD", config: {} },
        ],
      },
    });

    const res = await getAnalyticsData();
    expect(res.success).toBe(true);
    const ruleNames = (res as any).data
      .filter((d: any) => d.source === "AUTOMATION")
      .map((d: any) => d.ruleName);
    expect(ruleNames).not.toContain("Multi Action No Duration");
  });

  it("rule with non-existent tableId falls back to 'טבלה לא ידועה'", async () => {
    mockUser(adminA);
    await seedRule(companyA, {
      name: "Unknown Table Rule",
      triggerType: "RECORD_CREATE",
      triggerConfig: { tableId: "99999" },
    });

    const res = await getAnalyticsData();
    expect(res.success).toBe(true);
    const rule = (res as any).data.find((d: any) => d.ruleName === "Unknown Table Rule");
    expect(rule).toBeDefined();
    expect(rule.tableName).toBe("טבלה לא ידועה");
  });

  it("rule with TASK_STATUS_CHANGE triggerType has tableName 'משימות'", async () => {
    mockUser(adminA);
    await seedRule(companyA, { name: "Task Status Duration Rule", triggerType: "TASK_STATUS_CHANGE" });

    const res = await getAnalyticsData();
    expect(res.success).toBe(true);
    const rule = (res as any).data.find((d: any) => d.ruleName === "Task Status Duration Rule");
    expect(rule).toBeDefined();
    expect(rule.tableName).toBe("משימות");
  });

  it("uncached views trigger inline calculateViewStats and include calculated data in response", async () => {
    mockUser(adminA);
    // Seed a view without cachedStats (default is null)
    await seedView(companyA, { title: "Uncached Inline Calc View" });
    vi.mocked(calculateViewStats).mockClear();
    vi.mocked(calculateViewStats).mockResolvedValueOnce({
      stats: { count: 7 },
      items: [{ id: 1 }],
      tableName: "Tasks",
    } as any);

    const res = await getAnalyticsData();
    expect(res.success).toBe(true);
    expect(calculateViewStats).toHaveBeenCalled();
    // Verify calculated data appears in response
    const viewData = (res as any).data.find((d: any) => d.ruleName === "Uncached Inline Calc View");
    expect(viewData).toBeDefined();
    expect(viewData.stats).toEqual({ count: 7 });
    expect(viewData.data).toEqual([{ id: 1 }]);
  });

  it("MULTI_ACTION rule with CALCULATE_MULTI_EVENT_DURATION maps to multi-event type", async () => {
    mockUser(adminA);
    await seedRule(companyA, {
      name: "Multi Event Duration Rule",
      actionType: "MULTI_ACTION",
      actionConfig: {
        actions: [
          { type: "CALCULATE_MULTI_EVENT_DURATION", config: {} },
        ],
      },
    });

    const res = await getAnalyticsData();
    expect(res.success).toBe(true);
    const rule = (res as any).data.find((d: any) => d.ruleName === "Multi Event Duration Rule");
    expect(rule).toBeDefined();
    expect(rule.type).toBe("multi-event");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. getAnalyticsLimits
// ═════════════════════════════════════════════════════════════════════════════

describe("getAnalyticsLimits", () => {
  it("basic plan returns correct limits", async () => {
    mockUser(adminA);
    await seedView(companyA, { type: "COUNT" });
    await seedView(companyA, { type: "COUNT" });

    const res = await getAnalyticsLimits();
    expect(res.success).toBe(true);
    expect(res).toMatchObject({
      plan: "basic",
      limits: { regular: 5, graph: 3 },
      currentCounts: { regular: 2, graph: 0 },
      remaining: { regular: 3, graph: 3 },
    });
  });

  it("counts CONVERSION as regular (not graph)", async () => {
    mockUser(adminA);
    await seedView(companyA, { type: "CONVERSION" });

    const res = await getAnalyticsLimits();
    expect((res as any).currentCounts.regular).toBe(1);
    expect((res as any).currentCounts.graph).toBe(0);
  });

  it("counts GRAPH separately", async () => {
    mockUser(adminA);
    await seedView(companyA, { type: "GRAPH" });
    await seedView(companyA, { type: "COUNT" });

    const res = await getAnalyticsLimits();
    expect((res as any).currentCounts.graph).toBe(1);
    expect((res as any).currentCounts.regular).toBe(1);
  });

  it("premium plan returns higher limits", async () => {
    mockUser(premiumA);
    const res = await getAnalyticsLimits();
    expect(res.success).toBe(true);
    expect((res as any).limits).toEqual({ regular: 15, graph: 10 });
  });

  it("super plan returns Infinity", async () => {
    mockUser(superA);
    const res = await getAnalyticsLimits();
    expect(res.success).toBe(true);
    expect((res as any).limits.regular).toBe(Infinity);
    expect((res as any).limits.graph).toBe(Infinity);
  });

  it("user with no companyId gets 'User has no company' error", async () => {
    // Inline fixture: user with canViewAnalytics but falsy companyId (0)
    mockUser({
      id: adminA.id,
      companyId: 0,
      name: "No Company User",
      email: "nocompany@test.com",
      role: "admin",
      permissions: {},
    });
    const res = await getAnalyticsLimits();
    expect(res).toMatchObject({ success: false, error: "User has no company" });
  });

  it("SUM/AVERAGE/DISTRIBUTION views are not counted in regular or graph counts", async () => {
    mockUser(adminA);
    await seedView(companyA, { type: "SUM" });
    await seedView(companyA, { type: "AVERAGE" });
    await seedView(companyA, { type: "DISTRIBUTION" });
    await seedView(companyA, { type: "COUNT" });
    await seedView(companyA, { type: "GRAPH" });

    const res = await getAnalyticsLimits();
    expect(res.success).toBe(true);
    expect((res as any).currentCounts.regular).toBe(1); // only COUNT
    expect((res as any).currentCounts.graph).toBe(1); // only GRAPH
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 9. updateAnalyticsViewOrder
// ═════════════════════════════════════════════════════════════════════════════

describe("updateAnalyticsViewOrder", () => {
  it("reorders CUSTOM views", async () => {
    mockUser(adminA);
    const v1 = await seedView(companyA, { title: "Revenue Overview", order: 0 });
    const v2 = await seedView(companyA, { title: "Client Retention", order: 1 });
    const v3 = await seedView(companyA, { title: "Task Throughput", order: 2 });

    const res = await updateAnalyticsViewOrder([
      { id: v1.id, type: "CUSTOM", order: 2 },
      { id: v2.id, type: "CUSTOM", order: 0 },
      { id: v3.id, type: "CUSTOM", order: 1 },
    ]);
    expect(res.success).toBe(true);

    const updated = await prisma.analyticsView.findMany({ where: { companyId: companyA }, orderBy: { order: "asc" } });
    expect(updated[0].title).toBe("Client Retention");
    expect(updated[1].title).toBe("Task Throughput");
    expect(updated[2].title).toBe("Revenue Overview");
  });

  it("reorders AUTOMATION rules (analyticsOrder)", async () => {
    mockUser(adminA);
    const r1 = await seedRule(companyA, { name: "Deal Close Duration", analyticsOrder: 0 });
    const r2 = await seedRule(companyA, { name: "Onboarding Duration", analyticsOrder: 1 });

    const res = await updateAnalyticsViewOrder([
      { id: r1.id, type: "AUTOMATION", order: 1 },
      { id: r2.id, type: "AUTOMATION", order: 0 },
    ]);
    expect(res.success).toBe(true);

    const updated = await prisma.automationRule.findMany({
      where: { companyId: companyA },
      orderBy: { analyticsOrder: "asc" },
    });
    expect(updated[0].name).toBe("Onboarding Duration");
    expect(updated[1].name).toBe("Deal Close Duration");
  });

  it("mixed CUSTOM + AUTOMATION reorder", async () => {
    mockUser(adminA);
    const v = await seedView(companyA, { title: "Weekly Revenue", order: 0 });
    const r = await seedRule(companyA, { name: "Support Ticket Duration", analyticsOrder: 1 });

    const res = await updateAnalyticsViewOrder([
      { id: v.id, type: "CUSTOM", order: 1 },
      { id: r.id, type: "AUTOMATION", order: 0 },
    ]);
    expect(res.success).toBe(true);

    const view = await prisma.analyticsView.findFirst({ where: { id: v.id } });
    const rule = await prisma.automationRule.findFirst({ where: { id: r.id } });
    expect(view!.order).toBe(1);
    expect(rule!.analyticsOrder).toBe(0);
  });

  it("rejects invalid items (non-finite IDs)", async () => {
    mockUser(adminA);
    const res = await updateAnalyticsViewOrder([{ id: NaN, type: "CUSTOM", order: 0 }]);
    expect(res).toMatchObject({ success: false, error: "Invalid item data" });
  });

  it("rejects invalid type string", async () => {
    mockUser(adminA);
    const res = await updateAnalyticsViewOrder([{ id: 1, type: "BAD" as any, order: 0 }]);
    expect(res).toMatchObject({ success: false, error: "Invalid item data" });
  });

  it("caps at 200 items (items beyond 200 ignored)", async () => {
    mockUser(adminA);
    const v = await seedView(companyA, { title: "Bulk Reorder Target", order: 0 });
    const items = Array.from({ length: 201 }, (_, i) => ({ id: v.id, type: "CUSTOM" as const, order: i }));
    const res = await updateAnalyticsViewOrder(items);
    // Should not error — first 200 are processed
    expect(res.success).toBe(true);
  });

  it("cross-company: raw SQL WHERE includes companyId", async () => {
    const viewB = await seedView(companyB, { title: "Protected External View", order: 0 });
    mockUser(adminA);
    await updateAnalyticsViewOrder([{ id: viewB.id, type: "CUSTOM", order: 99 }]);
    // B's view should be unchanged because companyId doesn't match
    const check = await prisma.analyticsView.findFirst({ where: { id: viewB.id } });
    expect(check!.order).toBe(0);
  });

  it("empty items array succeeds (no-op)", async () => {
    mockUser(adminA);
    const res = await updateAnalyticsViewOrder([]);
    expect(res.success).toBe(true);
  });

  it("invalidates full cache after reorder", async () => {
    mockUser(adminA);
    const v = await seedView(companyA, { title: "Cache Reorder Test", order: 0 });
    await updateAnalyticsViewOrder([{ id: v.id, type: "CUSTOM", order: 1 }]);
    expect(invalidateFullCache).toHaveBeenCalledWith(companyA);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 10. updateAnalyticsViewColor
// ═════════════════════════════════════════════════════════════════════════════

describe("updateAnalyticsViewColor", () => {
  it("updates CUSTOM view color", async () => {
    mockUser(adminA);
    const v = await seedView(companyA);
    const res = await updateAnalyticsViewColor(v.id, "CUSTOM", "bg-red-50");
    expect(res.success).toBe(true);
    const updated = await prisma.analyticsView.findFirst({ where: { id: v.id } });
    expect(updated!.color).toBe("bg-red-50");
  });

  it("updates AUTOMATION rule color", async () => {
    mockUser(adminA);
    const r = await seedRule(companyA);
    const res = await updateAnalyticsViewColor(r.id, "AUTOMATION", "bg-green-50");
    expect(res.success).toBe(true);
    const updated = await prisma.automationRule.findFirst({ where: { id: r.id } });
    expect(updated!.analyticsColor).toBe("bg-green-50");
  });

  it("rejects invalid color", async () => {
    mockUser(adminA);
    const v = await seedView(companyA);
    const res = await updateAnalyticsViewColor(v.id, "CUSTOM", "bg-invalid");
    expect(res).toMatchObject({ success: false, error: "Invalid color" });
  });

  it("rejects invalid type", async () => {
    mockUser(adminA);
    const v = await seedView(companyA);
    const res = await updateAnalyticsViewColor(v.id, "BAD" as any, "bg-white");
    expect(res).toMatchObject({ success: false, error: "Invalid type" });
  });

  it("cross-company: cannot update other company's item", async () => {
    const viewB = await seedView(companyB);
    mockUser(adminA);
    const res = await updateAnalyticsViewColor(viewB.id, "CUSTOM", "bg-red-50");
    expect(res.success).toBe(false);
    expect(res.error).toBe("Failed to update color");
    // Verify unchanged
    const check = await prisma.analyticsView.findFirst({ where: { id: viewB.id } });
    expect(check!.color).toBe("bg-white");
  });

  it("calls invalidateFullCache after color update", async () => {
    mockUser(adminA);
    const v = await seedView(companyA);
    vi.mocked(invalidateFullCache).mockClear();
    await updateAnalyticsViewColor(v.id, "CUSTOM", "bg-blue-50");
    expect(invalidateFullCache).toHaveBeenCalledWith(companyA);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 11. refreshAnalyticsItemWithChecks
// ═════════════════════════════════════════════════════════════════════════════

describe("refreshAnalyticsItemWithChecks", () => {
  it("refreshes existing CUSTOM view", async () => {
    mockUser(adminA);
    const v = await seedView(companyA);
    const res = await refreshAnalyticsItemWithChecks(v.id, "CUSTOM");
    expect(res.success).toBe(true);
    expect((res as any).data).toEqual({ refreshing: true });
    expect((res as any).usage).toBe(1);

    const logCount = await prisma.analyticsRefreshLog.count({ where: { companyId: companyA } });
    expect(logCount).toBe(1);
  });

  it("refreshes existing AUTOMATION rule with usage tracking", async () => {
    mockUser(adminA);
    const r = await seedRule(companyA);
    const res = await refreshAnalyticsItemWithChecks(r.id, "AUTOMATION");
    expect(res.success).toBe(true);
    expect((res as any).data).toEqual({ refreshing: true });
    expect((res as any).usage).toBe(1);
    expect((res as any).nextResetTime).toBeTruthy();
    // Verify refresh log was created
    const logCount = await prisma.analyticsRefreshLog.count({ where: { companyId: companyA } });
    expect(logCount).toBe(1);
  });

  it("returns error for non-existent item", async () => {
    mockUser(adminA);
    const res = await refreshAnalyticsItemWithChecks(999999, "CUSTOM");
    expect(res).toMatchObject({ success: false, error: "Item not found" });
  });

  it("basic plan: blocks after 3 refreshes in 4-hour window", async () => {
    mockUser(adminA);
    const v = await seedView(companyA);

    // Seed 3 recent refresh logs
    for (let i = 0; i < 3; i++) {
      await prisma.analyticsRefreshLog.create({
        data: { userId: adminA.id, companyId: companyA },
      });
    }

    const res = await refreshAnalyticsItemWithChecks(v.id, "CUSTOM");
    expect(res.success).toBe(false);
    expect(res.error).toContain("הגעת למגבלת הרענונים");
    // Verify no extra log was created — DB count should still be 3
    const logCount = await prisma.analyticsRefreshLog.count({ where: { userId: adminA.id } });
    expect(logCount).toBe(3);
  });

  it("premium plan: allows up to 10 refreshes", async () => {
    mockUser(premiumA);
    const v = await seedView(companyA);

    // Seed 9 refresh logs
    for (let i = 0; i < 9; i++) {
      await prisma.analyticsRefreshLog.create({
        data: { userId: premiumA.id, companyId: companyA },
      });
    }

    const res = await refreshAnalyticsItemWithChecks(v.id, "CUSTOM");
    expect(res.success).toBe(true);
    expect((res as any).usage).toBe(10);
  });

  it("refresh log is created atomically", async () => {
    mockUser(adminA);
    const v = await seedView(companyA);
    const before = await prisma.analyticsRefreshLog.count({ where: { companyId: companyA } });
    await refreshAnalyticsItemWithChecks(v.id, "CUSTOM");
    const after = await prisma.analyticsRefreshLog.count({ where: { companyId: companyA } });
    expect(after - before).toBe(1);
  });

  it("returns nextResetTime based on oldest log", async () => {
    mockUser(adminA);
    const v = await seedView(companyA);
    const res = await refreshAnalyticsItemWithChecks(v.id, "CUSTOM");
    expect(res.success).toBe(true);
    expect((res as any).nextResetTime).toBeTruthy();
    // nextResetTime should be approximately 4 hours from now
    const reset = new Date((res as any).nextResetTime);
    const fourHoursFromNow = new Date(Date.now() + 4 * 60 * 60 * 1000);
    expect(Math.abs(reset.getTime() - fourHoursFromNow.getTime())).toBeLessThan(5000);
  });

  it("triggers inngest refresh-item event", async () => {
    mockUser(adminA);
    const v = await seedView(companyA);
    await refreshAnalyticsItemWithChecks(v.id, "CUSTOM");
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({ name: "analytics/refresh-item", data: { companyId: companyA, itemId: v.id, itemType: "CUSTOM" } }),
    );
  });

  it("calls revalidatePath for /, /analytics, /analytics/graphs after refresh", async () => {
    mockUser(adminA);
    const v = await seedView(companyA);
    await refreshAnalyticsItemWithChecks(v.id, "CUSTOM");
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(revalidatePath).toHaveBeenCalledWith("/analytics");
    expect(revalidatePath).toHaveBeenCalledWith("/analytics/graphs");
  });

  it("cross-company: cannot refresh another company's view", async () => {
    const viewB = await seedView(companyB);
    mockUser(adminA);
    const res = await refreshAnalyticsItemWithChecks(viewB.id, "CUSTOM");
    expect(res).toMatchObject({ success: false, error: "Item not found" });
    // Verify no refresh log was created
    const logCount = await prisma.analyticsRefreshLog.count({ where: { userId: adminA.id } });
    expect(logCount).toBe(0);
  });

  it("super plan: allows many refreshes (50 existing logs)", async () => {
    mockUser(superA);
    const v = await seedView(companyA);

    // Seed 50 recent refresh logs
    const logPromises = [];
    for (let i = 0; i < 50; i++) {
      logPromises.push(prisma.analyticsRefreshLog.create({
        data: { userId: superA.id, companyId: companyA },
      }));
    }
    await Promise.all(logPromises);

    const res = await refreshAnalyticsItemWithChecks(v.id, "CUSTOM");
    expect(res.success).toBe(true);
    expect((res as any).usage).toBe(51);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 12. previewAnalyticsView
// ═════════════════════════════════════════════════════════════════════════════

describe("previewAnalyticsView", () => {
  it("previews COUNT type without saving and passes correct args to calculateViewStats", async () => {
    mockUser(adminA);
    vi.mocked(calculateViewStats).mockResolvedValueOnce({
      stats: { count: 42 },
      items: [{ id: 1 }, { id: 2 }],
      tableName: "Tasks",
    } as any);

    const res = await previewAnalyticsView({ type: "COUNT", config: VALID_CONFIG });
    expect(res.success).toBe(true);
    expect((res as any).data.stats).toEqual({ count: 42 });
    expect((res as any).data.tableName).toBe("Tasks");

    // W5: Verify calculateViewStats was called with temporary view object (id: 0) and companyA
    expect(calculateViewStats).toHaveBeenCalledWith(
      expect.objectContaining({ id: 0, type: "COUNT", config: { model: "Task" } }),
      companyA,
    );
  });

  it("does not create DB record", async () => {
    mockUser(adminA);
    const before = await prisma.analyticsView.count({ where: { companyId: companyA } });
    await previewAnalyticsView({ type: "COUNT", config: VALID_CONFIG });
    const after = await prisma.analyticsView.count({ where: { companyId: companyA } });
    expect(after).toBe(before);
  });

  it("limits preview items to 10", async () => {
    mockUser(adminA);
    const manyItems = Array.from({ length: 20 }, (_, i) => ({ id: i }));
    vi.mocked(calculateViewStats).mockResolvedValueOnce({
      stats: { count: 20 },
      items: manyItems,
      tableName: "Tasks",
    } as any);

    const res = await previewAnalyticsView({ type: "COUNT", config: VALID_CONFIG });
    expect((res as any).data.items.length).toBeLessThanOrEqual(10);
    expect((res as any).data.totalRecords).toBe(20);
  });

  it("rejects invalid type", async () => {
    mockUser(adminA);
    const res = await previewAnalyticsView({ type: "BAD", config: VALID_CONFIG });
    expect(res).toMatchObject({ success: false, error: "Invalid analytics view type" });
  });

  it("rejects invalid config", async () => {
    mockUser(adminA);
    const res = await previewAnalyticsView({ type: "COUNT", config: { model: "INVALID" } });
    expect(res).toMatchObject({ success: false, error: "Invalid analytics config" });
  });

  it("strips extra config keys before passing to calculateViewStats", async () => {
    mockUser(adminA);
    vi.mocked(calculateViewStats).mockClear();
    vi.mocked(calculateViewStats).mockResolvedValueOnce({
      stats: { count: 0 },
      items: [],
      tableName: "Test",
    } as any);

    await previewAnalyticsView({
      type: "COUNT",
      config: { model: "Task", extraKey: "should-be-stripped" } as any,
    });

    // Verify the config passed to calculateViewStats has no extra keys
    const callArgs = vi.mocked(calculateViewStats).mock.calls[0];
    expect((callArgs[0] as any).config.model).toBe("Task");
    expect((callArgs[0] as any).config.extraKey).toBeUndefined();
  });

  it("rejects config > 16KB", async () => {
    mockUser(adminA);
    const bigFilter: Record<string, string> = {};
    for (let i = 0; i < 30; i++) {
      bigFilter[`key${i}`] = "x".repeat(600);
    }
    const res = await previewAnalyticsView({ type: "COUNT", config: { model: "Task", filter: bigFilter } });
    expect(res).toMatchObject({ success: false, error: "Config is too large" });
  });

  it("returns error when calculateViewStats throws", async () => {
    mockUser(adminA);
    vi.mocked(calculateViewStats).mockRejectedValueOnce(new Error("Engine unavailable"));

    const res = await previewAnalyticsView({ type: "COUNT", config: VALID_CONFIG });
    expect(res).toMatchObject({ success: false, error: "Failed to preview view" });
  });

  it("preview-specific rate limit returns Hebrew error", async () => {
    mockUser(adminA);
    vi.mocked(checkActionRateLimit).mockResolvedValueOnce({ error: "Rate limited" } as any);
    const res = await previewAnalyticsView({ type: "COUNT", config: VALID_CONFIG });
    expect(res.success).toBe(false);
    // The preview function returns a custom Hebrew rate limit message
    expect(res.error).toBe("יותר מדי בקשות תצוגה מקדימה. נסה שוב בעוד מספר שניות.");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 13. View Folders
// ═════════════════════════════════════════════════════════════════════════════

describe("View Folders", () => {
  describe("createViewFolder", () => {
    it("creates folder with name", async () => {
      mockUser(adminA);
      const res = await createViewFolder("Revenue Reports");
      expect(res.success).toBe(true);
      const folder = await prisma.viewFolder.findFirst({ where: { companyId: companyA, name: "Revenue Reports" } });
      expect(folder).not.toBeNull();
      expect(folder!.companyId).toBe(companyA);
    });

    it("response includes id, name, order, createdAt, updatedAt", async () => {
      mockUser(adminA);
      const res = await createViewFolder("Client Metrics");
      expect(res.success).toBe(true);
      const data = (res as any).data;
      expect(data.id).toEqual(expect.any(Number));
      expect(data.name).toBe("Client Metrics");
      expect(data.order).toEqual(expect.any(Number));
      expect(data.createdAt).toBeDefined();
      expect(data.updatedAt).toBeDefined();
    });

    it("defaults type to ANALYTICS and order to 0", async () => {
      mockUser(adminA);
      await createViewFolder("Defaults Test Folder");
      const folder = await prisma.viewFolder.findFirst({ where: { companyId: companyA, name: "Defaults Test Folder" } });
      expect(folder!.type).toBe("ANALYTICS");
      expect(folder!.order).toBe(0);
    });

    it("unauthenticated → error", async () => {
      mockUser(null);
      const res = await createViewFolder("Fail");
      expect(res).toMatchObject({ success: false, error: "Unauthorized" });
    });

    it("user without canManageAnalytics → Forbidden", async () => {
      mockUser(viewerA);
      const res = await createViewFolder("Fail");
      expect(res).toMatchObject({ success: false, error: "Forbidden" });
    });

    it("calls revalidatePath('/analytics') after creating folder", async () => {
      mockUser(adminA);
      await createViewFolder("Revalidate Test Folder");
      expect(revalidatePath).toHaveBeenCalledWith("/analytics");
    });

    it("calls invalidateFullCache after creating folder", async () => {
      mockUser(adminA);
      await createViewFolder("Cache Invalidation Test Folder");
      expect(invalidateFullCache).toHaveBeenCalledWith(companyA);
    });
  });

  describe("getViewFolders", () => {
    it("returns folders ordered by order", async () => {
      mockUser(adminA);
      await prisma.viewFolder.create({ data: { companyId: companyA, name: "Q4 Reports", order: 2 } });
      await prisma.viewFolder.create({ data: { companyId: companyA, name: "Client Metrics", order: 0 } });
      await prisma.viewFolder.create({ data: { companyId: companyA, name: "Monthly KPIs", order: 1 } });

      const res = await getViewFolders();
      expect(res.success).toBe(true);
      const names = (res as any).data.map((f: any) => f.name);
      expect(names).toEqual(["Client Metrics", "Monthly KPIs", "Q4 Reports"]);
    });

    it("user without canViewAnalytics → Forbidden", async () => {
      mockUser(noPermsA);
      const res = await getViewFolders();
      expect(res).toMatchObject({ success: false, error: "Forbidden" });
    });

    it("cross-company isolation", async () => {
      mockUser(adminA);
      await prisma.viewFolder.create({ data: { companyId: companyA, name: "Our Team Reports" } });
      await prisma.viewFolder.create({ data: { companyId: companyB, name: "External Team Reports" } });

      const res = await getViewFolders();
      const names = (res as any).data.map((f: any) => f.name);
      expect(names).toContain("Our Team Reports");
      expect(names).not.toContain("External Team Reports");
    });
  });

  describe("deleteViewFolder", () => {
    it("deletes folder and unsets folderId on child views", async () => {
      mockUser(adminA);
      const folder = await prisma.viewFolder.create({ data: { companyId: companyA, name: "Archived Reports" } });
      const v1 = await seedView(companyA, { folderId: folder.id });
      const v2 = await seedView(companyA, { folderId: folder.id });

      const res = await deleteViewFolder(folder.id);
      expect(res.success).toBe(true);

      const f = await prisma.viewFolder.findFirst({ where: { id: folder.id } });
      expect(f).toBeNull();

      const updatedV1 = await prisma.analyticsView.findFirst({ where: { id: v1.id } });
      const updatedV2 = await prisma.analyticsView.findFirst({ where: { id: v2.id } });
      expect(updatedV1!.folderId).toBeNull();
      expect(updatedV2!.folderId).toBeNull();
    });

    it("deletes folder and unsets folderId on child rules", async () => {
      mockUser(adminA);
      const folder = await prisma.viewFolder.create({ data: { companyId: companyA, name: "Automation Reports" } });
      const r = await seedRule(companyA, { folderId: folder.id });

      await deleteViewFolder(folder.id);

      const updatedR = await prisma.automationRule.findFirst({ where: { id: r.id } });
      expect(updatedR!.folderId).toBeNull();
    });

    it("non-existent folder → error", async () => {
      mockUser(adminA);
      const res = await deleteViewFolder(999999);
      expect(res.success).toBe(false);
      expect(res.error).toBe("Unauthorized or not found");
    });

    it("calls revalidatePath('/analytics') after deleting folder", async () => {
      mockUser(adminA);
      const folder = await prisma.viewFolder.create({ data: { companyId: companyA, name: "Revalidate Delete Test" } });
      await deleteViewFolder(folder.id);
      expect(revalidatePath).toHaveBeenCalledWith("/analytics");
    });

    it("calls invalidateFullCache after deleting folder", async () => {
      mockUser(adminA);
      const folder = await prisma.viewFolder.create({ data: { companyId: companyA, name: "Cache Invalidation Delete Test" } });
      await deleteViewFolder(folder.id);
      expect(invalidateFullCache).toHaveBeenCalledWith(companyA);
    });

    it("viewer without canManageAnalytics → Forbidden and folder unchanged", async () => {
      mockUser(adminA);
      const folder = await prisma.viewFolder.create({ data: { companyId: companyA, name: "Viewer Protected Folder" } });
      mockUser(viewerA);
      const res = await deleteViewFolder(folder.id);
      expect(res).toMatchObject({ success: false, error: "Forbidden" });
      // Verify folder still exists
      const check = await prisma.viewFolder.findFirst({ where: { id: folder.id } });
      expect(check).not.toBeNull();
      expect(check!.name).toBe("Viewer Protected Folder");
    });

    it("cross-company folder → error and folder still exists", async () => {
      const folderB = await prisma.viewFolder.create({ data: { companyId: companyB, name: "Protected External Folder" } });
      mockUser(adminA);
      const res = await deleteViewFolder(folderB.id);
      expect(res.success).toBe(false);
      expect(res.error).toBe("Unauthorized or not found");
      // Verify folder still exists in DB
      const check = await prisma.viewFolder.findFirst({ where: { id: folderB.id } });
      expect(check).not.toBeNull();
      expect(check!.name).toBe("Protected External Folder");
    });
  });

  describe("moveViewToFolder", () => {
    it("moves CUSTOM view to folder", async () => {
      mockUser(adminA);
      const folder = await prisma.viewFolder.create({ data: { companyId: companyA, name: "Sales Dashboard" } });
      const v = await seedView(companyA);

      const res = await moveViewToFolder(v.id, "CUSTOM", folder.id);
      expect(res.success).toBe(true);
      const updated = await prisma.analyticsView.findFirst({ where: { id: v.id } });
      expect(updated!.folderId).toBe(folder.id);
    });

    it("moves AUTOMATION rule to folder", async () => {
      mockUser(adminA);
      const folder = await prisma.viewFolder.create({ data: { companyId: companyA, name: "Performance Reports" } });
      const r = await seedRule(companyA);

      const res = await moveViewToFolder(r.id, "AUTOMATION", folder.id);
      expect(res.success).toBe(true);
      const updated = await prisma.automationRule.findFirst({ where: { id: r.id } });
      expect(updated!.folderId).toBe(folder.id);
    });

    it("moves view out of folder (null)", async () => {
      mockUser(adminA);
      const folder = await prisma.viewFolder.create({ data: { companyId: companyA, name: "Quarterly Reports" } });
      const v = await seedView(companyA, { folderId: folder.id });

      const res = await moveViewToFolder(v.id, "CUSTOM", null);
      expect(res.success).toBe(true);
      const updated = await prisma.analyticsView.findFirst({ where: { id: v.id } });
      expect(updated!.folderId).toBeNull();
    });

    it("cross-company folder validation", async () => {
      mockUser(adminA);
      const v = await seedView(companyA);
      vi.mocked(validateViewFolderInCompany).mockResolvedValueOnce(false);

      const res = await moveViewToFolder(v.id, "CUSTOM", 999);
      expect(res).toMatchObject({ success: false, error: "Invalid folder" });
    });

    it("calls invalidateFullCache after moving view to folder", async () => {
      mockUser(adminA);
      const folder = await prisma.viewFolder.create({ data: { companyId: companyA, name: "Cache Invalidation Folder" } });
      const v = await seedView(companyA);
      await moveViewToFolder(v.id, "CUSTOM", folder.id);
      expect(invalidateFullCache).toHaveBeenCalledWith(companyA);
    });

    it("calls revalidatePath('/analytics') after moving view", async () => {
      mockUser(adminA);
      const folder = await prisma.viewFolder.create({ data: { companyId: companyA, name: "Revalidate Move Folder" } });
      const v = await seedView(companyA);
      await moveViewToFolder(v.id, "CUSTOM", folder.id);
      expect(revalidatePath).toHaveBeenCalledWith("/analytics");
    });

    it("viewer without canManageAnalytics → Forbidden and view unchanged", async () => {
      mockUser(adminA);
      const folder = await prisma.viewFolder.create({ data: { companyId: companyA, name: "Move Target Folder" } });
      const v = await seedView(companyA);
      mockUser(viewerA);
      const res = await moveViewToFolder(v.id, "CUSTOM", folder.id);
      expect(res).toMatchObject({ success: false, error: "Forbidden" });
      // Verify view folderId unchanged
      const check = await prisma.analyticsView.findFirst({ where: { id: v.id } });
      expect(check!.folderId).toBeNull();
    });

    it("cross-company: cannot move another company's view", async () => {
      const viewB = await seedView(companyB);
      const folder = await prisma.viewFolder.create({ data: { companyId: companyA, name: "Target Folder" } });
      mockUser(adminA);
      const res = await moveViewToFolder(viewB.id, "CUSTOM", folder.id);
      expect(res.success).toBe(false);
      expect(res.error).toBe("Failed to move view");
      // Verify B's view is unchanged
      const check = await prisma.analyticsView.findFirst({ where: { id: viewB.id } });
      expect(check!.folderId).toBeNull();
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 14. getAnalyticsRefreshUsage
// ═════════════════════════════════════════════════════════════════════════════

describe("getAnalyticsRefreshUsage", () => {
  it("returns 0 when no logs exist", async () => {
    mockUser(adminA);
    const res = await getAnalyticsRefreshUsage();
    expect(res).toMatchObject({ success: true, usage: 0, nextResetTime: null });
  });

  it("returns correct count within 4-hour window", async () => {
    mockUser(adminA);
    await prisma.analyticsRefreshLog.create({ data: { userId: adminA.id, companyId: companyA } });
    await prisma.analyticsRefreshLog.create({ data: { userId: adminA.id, companyId: companyA } });

    const res = await getAnalyticsRefreshUsage();
    expect(res.success).toBe(true);
    expect(res.usage).toBe(2);
  });

  it("ignores logs older than 4 hours", async () => {
    mockUser(adminA);
    await prisma.analyticsRefreshLog.create({
      data: {
        userId: adminA.id,
        companyId: companyA,
        timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000), // 5 hours ago
      },
    });

    const res = await getAnalyticsRefreshUsage();
    expect(res.usage).toBe(0);
  });

  it("returns nextResetTime from oldest log", async () => {
    mockUser(adminA);
    const oldTs = new Date(Date.now() - 1 * 60 * 60 * 1000); // 1 hour ago
    await prisma.analyticsRefreshLog.create({
      data: { userId: adminA.id, companyId: companyA, timestamp: oldTs },
    });
    await prisma.analyticsRefreshLog.create({
      data: { userId: adminA.id, companyId: companyA },
    });

    const res = await getAnalyticsRefreshUsage();
    expect(res.success).toBe(true);
    const expected = new Date(oldTs.getTime() + 4 * 60 * 60 * 1000).toISOString();
    // Allow 1 second tolerance for timing
    const resetTime = new Date((res as any).nextResetTime);
    const expectedTime = new Date(expected);
    expect(Math.abs(resetTime.getTime() - expectedTime.getTime())).toBeLessThan(1000);
  });

  it("unauthenticated → false", async () => {
    mockUser(null);
    const res = await getAnalyticsRefreshUsage();
    expect(res).toMatchObject({ success: false, usage: 0 });
  });

  it("user without canViewAnalytics → false", async () => {
    mockUser(noPermsA);
    const res = await getAnalyticsRefreshUsage();
    expect(res).toMatchObject({ success: false, usage: 0 });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 15. getAnalyticsDataAuthed
// ═════════════════════════════════════════════════════════════════════════════

describe("getAnalyticsDataAuthed", () => {
  it("unauthenticated user gets error", async () => {
    mockUser(null);
    const res = await getAnalyticsDataAuthed(companyA);
    expect(res).toMatchObject({ success: false, error: "Unauthorized" });
  });

  it("companyId mismatch → Unauthorized", async () => {
    mockUser(adminA);
    // adminA belongs to companyA, passing companyB should fail
    const res = await getAnalyticsDataAuthed(companyB);
    expect(res).toMatchObject({ success: false, error: "Unauthorized" });
  });

  it("user without canViewAnalytics → Unauthorized", async () => {
    mockUser(noPermsA);
    const res = await getAnalyticsDataAuthed(companyA);
    expect(res).toMatchObject({ success: false, error: "Unauthorized" });
  });

  it("valid call returns analytics data", async () => {
    mockUser(adminA);
    await seedView(companyA, { title: "Authed Revenue View", order: 0 });

    const res = await getAnalyticsDataAuthed(companyA);
    expect(res.success).toBe(true);
    expect(Array.isArray((res as any).data)).toBe(true);
    const titles = (res as any).data.map((d: any) => d.ruleName);
    expect(titles).toContain("Authed Revenue View");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 16. getAnalyticsDataForDashboard
// ═════════════════════════════════════════════════════════════════════════════

describe("getAnalyticsDataForDashboard", () => {
  it("returns views for given companyId (no auth check)", async () => {
    await seedView(companyA, { title: "Dashboard Revenue View", order: 0 });
    await seedView(companyA, { title: "Dashboard Task Count", order: 1 });

    const res = await getAnalyticsDataForDashboard(companyA);
    expect(res.success).toBe(true);
    expect(Array.isArray((res as any).data)).toBe(true);
    expect((res as any).data.length).toBe(2);
    const titles = (res as any).data.map((d: any) => d.ruleName);
    expect(titles).toContain("Dashboard Revenue View");
    expect(titles).toContain("Dashboard Task Count");
  });

  it("returns empty array when no views exist", async () => {
    const res = await getAnalyticsDataForDashboard(companyA);
    expect(res.success).toBe(true);
    expect((res as any).data).toEqual([]);
  });

  it("only returns data for the specified companyId", async () => {
    await seedView(companyA, { title: "Company A Dashboard Metric" });
    await seedView(companyB, { title: "Company B Dashboard Metric" });

    const res = await getAnalyticsDataForDashboard(companyA);
    expect(res.success).toBe(true);
    const titles = (res as any).data.map((d: any) => d.ruleName);
    expect(titles).toContain("Company A Dashboard Metric");
    expect(titles).not.toContain("Company B Dashboard Metric");
  });
});

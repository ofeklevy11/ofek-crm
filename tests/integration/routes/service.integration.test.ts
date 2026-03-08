import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";

// ── MOCK (infrastructure only — keep everything else real) ──────────────────
vi.mock("@/lib/permissions-server", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkActionRateLimit: vi.fn().mockResolvedValue(false),
  RATE_LIMITS: {
    serviceRead: { prefix: "svc-r", max: 60, windowSeconds: 60 },
    serviceMutation: { prefix: "svc-m", max: 20, windowSeconds: 60 },
  },
}));

vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: vi.fn() },
}));

vi.mock("@/lib/redis", () => ({
  redis: { del: vi.fn() },
}));

vi.mock("@/lib/notifications-internal", () => ({
  createNotificationForCompany: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/services/cache-service", () => ({
  getCachedMetric: vi.fn((_companyId: number, _keyParts: string[], fetcher: () => Promise<any>) => fetcher()),
  buildCacheKey: (companyId: number, keyParts: string[]) => `cache:metric:${companyId}:${keyParts.join(":")}`,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// ── REAL: prisma, db-retry, company-validation, permissions ─────────────────
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { revalidatePath } from "next/cache";
import { checkActionRateLimit } from "@/lib/rate-limit";
import { inngest } from "@/lib/inngest/client";
import { redis } from "@/lib/redis";
import { createNotificationForCompany } from "@/lib/notifications-internal";

import {
  getTickets,
  getTicketDetails,
  createTicket,
  updateTicket,
  deleteTicket,
  addTicketComment,
  updateTicketComment,
  deleteTicketComment,
  getSlaPolicies,
  updateSlaPolicy,
  updateSlaPolicies,
  getTicketStats,
  getServiceAutomationRules,
  getServiceUsers,
} from "@/app/actions/tickets";

// ── Helpers ─────────────────────────────────────────────────────────────────

function mockUser(user: Record<string, unknown> | null) {
  vi.mocked(getCurrentUser).mockResolvedValue(
    user ? ({ allowedWriteTableIds: [], ...user } as any) : null,
  );
}

async function seedTicket(
  companyId: number,
  creatorId: number,
  overrides: Record<string, unknown> = {},
) {
  return prisma.ticket.create({
    data: {
      companyId,
      creatorId,
      title: (overrides.title as string) ?? "תקלה בחיבור לאינטרנט",
      status: (overrides.status as any) ?? "OPEN",
      priority: (overrides.priority as any) ?? "MEDIUM",
      type: (overrides.type as any) ?? "SERVICE",
      description: overrides.description as string | undefined,
      clientId: overrides.clientId as number | undefined,
      assigneeId: overrides.assigneeId as number | undefined,
      tags: (overrides.tags as string[]) ?? undefined,
      slaDueDate: overrides.slaDueDate as Date | undefined,
      slaResponseDueDate: overrides.slaResponseDueDate as Date | undefined,
    },
  });
}

const VALID_CREATE = {
  title: "בדיקת חיבור רשת",
  status: "OPEN",
  priority: "MEDIUM",
  type: "SERVICE",
} as const;

// ── State ───────────────────────────────────────────────────────────────────
type TestUser = {
  id: number;
  companyId: number;
  name: string;
  email: string;
  role: string;
  permissions: Record<string, boolean>;
};

let companyA: number;
let companyB: number;
let adminUserA: TestUser;
let serviceUserA: TestUser;
let noPermsUserA: TestUser;
let managerUserA: TestUser;
let adminUserB: TestUser;
let clientA: { id: number; name: string };
let clientB: { id: number; name: string };

const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// ── Setup / Teardown ────────────────────────────────────────────────────────

beforeAll(async () => {
  const coA = await prisma.company.create({ data: { name: "אלקטרו-טק שירות", slug: `tkt-co-a-${suffix}` } });
  const coB = await prisma.company.create({ data: { name: "מגה-סרוויס בע\"מ", slug: `tkt-co-b-${suffix}` } });
  companyA = coA.id;
  companyB = coB.id;

  const mkUser = async (
    compId: number,
    name: string,
    role: string,
    perms: Record<string, boolean>,
  ) => {
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
    return {
      id: u.id,
      companyId: u.companyId,
      name: u.name,
      email: u.email,
      role: u.role,
      permissions: perms,
    };
  };

  adminUserA = await mkUser(companyA, "יוסי כהן", "admin", {});
  serviceUserA = await mkUser(companyA, "דנה לוי", "basic", { canViewServiceCalls: true });
  noPermsUserA = await mkUser(companyA, "רון אברהם", "basic", {});
  managerUserA = await mkUser(companyA, "מיכל שרון", "manager", {});
  adminUserB = await mkUser(companyB, "אבי מזרחי", "admin", {});

  const cA = await prisma.client.create({ data: { companyId: companyA, name: "לקוח ישראלי בע\"מ" } });
  const cB = await prisma.client.create({ data: { companyId: companyB, name: "חברת הדרום" } });
  clientA = { id: cA.id, name: cA.name };
  clientB = { id: cB.id, name: cB.name };
});

afterEach(async () => {
  const ids = [companyA, companyB];
  await prisma.ticketActivityLog.deleteMany({ where: { ticket: { companyId: { in: ids } } } });
  await prisma.ticketComment.deleteMany({ where: { ticket: { companyId: { in: ids } } } });
  await prisma.slaBreach.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.ticket.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.slaPolicy.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.automationRule.deleteMany({ where: { companyId: { in: ids } } });
  vi.clearAllMocks();
});

afterAll(async () => {
  if (!companyA) return;
  const ids = [companyA, companyB];
  await prisma.ticketActivityLog.deleteMany({ where: { ticket: { companyId: { in: ids } } } });
  await prisma.ticketComment.deleteMany({ where: { ticket: { companyId: { in: ids } } } });
  await prisma.slaBreach.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.ticket.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.slaPolicy.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.automationRule.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.client.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.user.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.company.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

// ═════════════════════════════════════════════════════════════════════════════
// Auth & Permissions
// ═════════════════════════════════════════════════════════════════════════════

describe("Auth & Permissions", () => {
  it("null user on mutation → throws Unauthorized", async () => {
    mockUser(null);
    await expect(createTicket(VALID_CREATE)).rejects.toThrow("Unauthorized");
  });

  it("null user on read → returns empty", async () => {
    mockUser(null);
    const result = await getTickets();
    expect(result).toEqual({ items: [], nextCursor: null });
  });

  it("basic without canViewServiceCalls → throws Unauthorized on mutation", async () => {
    mockUser(noPermsUserA);
    await expect(createTicket(VALID_CREATE)).rejects.toThrow("Unauthorized");
  });

  it("basic without canViewServiceCalls → throws Unauthorized on read", async () => {
    mockUser(noPermsUserA);
    await expect(getTickets()).rejects.toThrow("Unauthorized");
  });

  it("manager without canViewServiceCalls → throws Unauthorized", async () => {
    mockUser(managerUserA);
    await expect(getTickets()).rejects.toThrow("Unauthorized");
  });

  it("admin → allowed", async () => {
    mockUser(adminUserA);
    const result = await getTickets();
    expect(result.items).toBeDefined();
  });

  it("basic with canViewServiceCalls → allowed", async () => {
    mockUser(serviceUserA);
    const result = await getTickets();
    expect(result.items).toBeDefined();
  });

  it("rate limit exceeded → throws Rate limit exceeded, no DB write", async () => {
    mockUser(adminUserA);
    vi.mocked(checkActionRateLimit).mockResolvedValue(true);

    await expect(createTicket(VALID_CREATE)).rejects.toThrow("Rate limit exceeded");

    const dbRows = await prisma.ticket.findMany({ where: { companyId: companyA } });
    expect(dbRows).toHaveLength(0);

    vi.mocked(checkActionRateLimit).mockResolvedValue(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// getTickets
// ═════════════════════════════════════════════════════════════════════════════

describe("getTickets", () => {
  it("returns company-scoped tickets excluding CLOSED", async () => {
    mockUser(adminUserA);
    await seedTicket(companyA, adminUserA.id, { title: "תקלת חשמל", status: "OPEN" });
    await seedTicket(companyA, adminUserA.id, { title: "תיקון מזגן", status: "IN_PROGRESS" });
    await seedTicket(companyA, adminUserA.id, { title: "המתנה לחלק", status: "WAITING" });
    await seedTicket(companyA, adminUserA.id, { title: "החלפת מסנן", status: "RESOLVED" });
    await seedTicket(companyA, adminUserA.id, { title: "סגורה - ישנה", status: "CLOSED" });

    const result = await getTickets();
    expect(result.items).toHaveLength(4);
    const titles = result.items.map((t: any) => t.title);
    expect(titles).not.toContain("סגורה - ישנה");
  });

  it("cursor-based pagination (PAGE_SIZE=100)", async () => {
    mockUser(adminUserA);
    const data = Array.from({ length: 101 }, (_, i) => ({
      companyId: companyA,
      creatorId: adminUserA.id,
      title: `קריאה ${String(i).padStart(3, "0")}`,
      status: "OPEN" as const,
      priority: "MEDIUM" as const,
      type: "SERVICE" as const,
    }));
    await prisma.ticket.createMany({ data });

    const page1 = await getTickets();
    expect(page1.items).toHaveLength(100);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await getTickets(page1.nextCursor!);
    expect(page2.items).toHaveLength(1);
    expect(page2.nextCursor).toBeNull();
  });

  it("ordering: updatedAt desc, id desc", async () => {
    mockUser(adminUserA);
    await seedTicket(companyA, adminUserA.id, { title: "פנייה ישנה" });
    await new Promise((r) => setTimeout(r, 50));
    await seedTicket(companyA, adminUserA.id, { title: "פנייה חדשה" });

    const result = await getTickets();
    expect(result.items[0].title).toBe("פנייה חדשה");
    expect(result.items[1].title).toBe("פנייה ישנה");
  });

  it("response shape: select fields with nested relations and _count", async () => {
    mockUser(adminUserA);
    await seedTicket(companyA, adminUserA.id, {
      title: "בדיקת מבנה תגובה",
      assigneeId: serviceUserA.id,
      clientId: clientA.id,
    });

    const result = await getTickets();
    const item = result.items[0];
    expect(Object.keys(item).sort()).toEqual([
      "_count", "assignee", "client", "createdAt", "creator",
      "id", "priority", "status", "title", "type", "updatedAt",
    ]);
    expect(item.assignee).toEqual({ id: serviceUserA.id, name: serviceUserA.name });
    expect(item.client).toEqual({ id: clientA.id, name: clientA.name });
    expect(item.creator).toEqual({ id: adminUserA.id, name: adminUserA.name });
    expect(item._count).toEqual({ comments: 0 });
  });

  it("response contract: no companyId leaked in items", async () => {
    mockUser(adminUserA);
    await seedTicket(companyA, adminUserA.id, { title: "בדיקת חסימת שדות" });

    const result = await getTickets();
    const item = result.items[0];
    expect(item).not.toHaveProperty("companyId");
    expect(item).not.toHaveProperty("description");
    expect(item).not.toHaveProperty("tags");
  });

  it("null assignee/client in response items", async () => {
    mockUser(adminUserA);
    await seedTicket(companyA, adminUserA.id, { title: "ללא שיוך" });

    const result = await getTickets();
    const item = result.items[0];
    expect(item.assignee).toBeNull();
    expect(item.client).toBeNull();
  });

  it("empty result → { items: [], nextCursor: null }", async () => {
    mockUser(adminUserA);
    const result = await getTickets();
    expect(result).toEqual({ items: [], nextCursor: null });
  });

  it("_count.comments reflects actual comment count", async () => {
    mockUser(adminUserA);
    const ticket = await seedTicket(companyA, adminUserA.id, { title: "קריאה עם הערות" });
    await prisma.ticketComment.createMany({
      data: [
        { ticketId: ticket.id, userId: adminUserA.id, content: "הערה ראשונה" },
        { ticketId: ticket.id, userId: adminUserA.id, content: "הערה שנייה" },
      ],
    });

    const result = await getTickets();
    const item = result.items.find((t: any) => t.id === ticket.id);
    expect(item._count.comments).toBe(2);
  });

  it("company isolation: company B tickets invisible to company A", async () => {
    mockUser(adminUserA);
    await seedTicket(companyB, adminUserB.id, { title: "קריאה של חברה ב" });

    const result = await getTickets();
    expect(result.items).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// getTicketDetails
// ═════════════════════════════════════════════════════════════════════════════

describe("getTicketDetails", () => {
  it("returns full ticket with comments, activityLogs, nested relations", async () => {
    mockUser(adminUserA);
    const ticket = await seedTicket(companyA, adminUserA.id, {
      title: "תקלה בשרת ראשי",
      clientId: clientA.id,
      assigneeId: serviceUserA.id,
      tags: ["דחוף", "תשתית"],
    });

    // Add comment via action
    await addTicketComment(ticket.id, "בודק את השרת עכשיו", false);
    vi.clearAllMocks(); // clear so we can test getTicketDetails in isolation
    mockUser(adminUserA);

    // Add activity log directly
    await prisma.ticketActivityLog.create({
      data: {
        ticketId: ticket.id,
        userId: adminUserA.id,
        fieldName: "status",
        fieldLabel: "סטטוס",
        oldValue: "OPEN",
        newValue: "IN_PROGRESS",
      },
    });

    const detail = await getTicketDetails(ticket.id);
    expect(detail).not.toBeNull();
    expect(detail!.id).toBe(ticket.id);
    expect(detail!.title).toBe("תקלה בשרת ראשי");
    expect(detail!.tags).toEqual(["דחוף", "תשתית"]);
    expect(detail!.assignee).toEqual({ id: serviceUserA.id, name: serviceUserA.name });
    expect(detail!.client).toMatchObject({ id: clientA.id, name: clientA.name });
    expect(detail!.creator).toEqual({ id: adminUserA.id, name: adminUserA.name });
    expect(detail!.comments).toHaveLength(1);
    expect(detail!.comments[0].content).toBe("בודק את השרת עכשיו");
    expect(detail!.activityLogs).toHaveLength(1);
    expect(detail!.activityLogs[0].fieldName).toBe("status");
  });

  it("response shape: all expected fields present, no companyId", async () => {
    mockUser(adminUserA);
    const ticket = await seedTicket(companyA, adminUserA.id, {
      title: "בדיקת מבנה פרטים",
      description: "תיאור מלא",
      clientId: clientA.id,
      assigneeId: serviceUserA.id,
    });

    const detail = await getTicketDetails(ticket.id);
    expect(detail).not.toBeNull();
    // Should have these fields
    expect(detail).toHaveProperty("id");
    expect(detail).toHaveProperty("title");
    expect(detail).toHaveProperty("description");
    expect(detail).toHaveProperty("status");
    expect(detail).toHaveProperty("priority");
    expect(detail).toHaveProperty("type");
    expect(detail).toHaveProperty("clientId");
    expect(detail).toHaveProperty("assigneeId");
    expect(detail).toHaveProperty("creatorId");
    expect(detail).toHaveProperty("tags");
    expect(detail).toHaveProperty("slaDueDate");
    expect(detail).toHaveProperty("slaResponseDueDate");
    expect(detail).toHaveProperty("createdAt");
    expect(detail).toHaveProperty("updatedAt");
    expect(detail).toHaveProperty("assignee");
    expect(detail).toHaveProperty("client");
    expect(detail).toHaveProperty("creator");
    expect(detail).toHaveProperty("comments");
    expect(detail).toHaveProperty("activityLogs");
    // Should NOT have companyId
    expect(detail).not.toHaveProperty("companyId");
  });

  it("client includes email and businessName in detail view", async () => {
    mockUser(adminUserA);
    const ticket = await seedTicket(companyA, adminUserA.id, {
      title: "פרטי לקוח מורחבים",
      clientId: clientA.id,
    });

    const detail = await getTicketDetails(ticket.id);
    expect(detail!.client).toHaveProperty("email");
    expect(detail!.client).toHaveProperty("businessName");
  });

  it("non-existent ticket → null", async () => {
    mockUser(adminUserA);
    const result = await getTicketDetails(999999);
    expect(result).toBeNull();
  });

  it("other company ticket → null", async () => {
    const ticket = await seedTicket(companyB, adminUserB.id, { title: "קריאה פנימית של ב" });
    mockUser(adminUserA);
    const result = await getTicketDetails(ticket.id);
    expect(result).toBeNull();
  });

  it("comments ordered by createdAt desc", async () => {
    mockUser(adminUserA);
    const ticket = await seedTicket(companyA, adminUserA.id, { title: "סדר הערות" });

    await prisma.ticketComment.create({
      data: { ticketId: ticket.id, userId: adminUserA.id, content: "הערה ראשונה" },
    });
    await new Promise((r) => setTimeout(r, 50));
    await prisma.ticketComment.create({
      data: { ticketId: ticket.id, userId: adminUserA.id, content: "הערה שנייה" },
    });

    const detail = await getTicketDetails(ticket.id);
    expect(detail!.comments[0].content).toBe("הערה שנייה");
    expect(detail!.comments[1].content).toBe("הערה ראשונה");
  });

  it("activityLogs ordered by createdAt desc", async () => {
    mockUser(adminUserA);
    const ticket = await seedTicket(companyA, adminUserA.id, { title: "סדר לוג" });

    await prisma.ticketActivityLog.create({
      data: { ticketId: ticket.id, userId: adminUserA.id, fieldName: "title", fieldLabel: "כותרת", oldValue: "א", newValue: "ב" },
    });
    await new Promise((r) => setTimeout(r, 50));
    await prisma.ticketActivityLog.create({
      data: { ticketId: ticket.id, userId: adminUserA.id, fieldName: "status", fieldLabel: "סטטוס", oldValue: "OPEN", newValue: "CLOSED" },
    });

    const detail = await getTicketDetails(ticket.id);
    expect(detail!.activityLogs[0].fieldName).toBe("status");
    expect(detail!.activityLogs[1].fieldName).toBe("title");
  });

  it("comment user relation nested in detail", async () => {
    mockUser(adminUserA);
    const ticket = await seedTicket(companyA, adminUserA.id, { title: "הערה עם פרטי משתמש" });

    await addTicketComment(ticket.id, "הערה לבדיקה");
    vi.clearAllMocks();
    mockUser(adminUserA);

    const detail = await getTicketDetails(ticket.id);
    expect(detail!.comments[0].user).toEqual({ id: adminUserA.id, name: adminUserA.name });
  });

  it("null assignee and client in detail view", async () => {
    mockUser(adminUserA);
    const ticket = await seedTicket(companyA, adminUserA.id, { title: "ללא שיוך בפירוט" });

    const detail = await getTicketDetails(ticket.id);
    expect(detail).not.toBeNull();
    expect(detail!.assignee).toBeNull();
    expect(detail!.client).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// createTicket
// ═════════════════════════════════════════════════════════════════════════════

describe("createTicket", () => {
  it("minimal fields → verify DB state", async () => {
    mockUser(adminUserA);
    const result = await createTicket(VALID_CREATE);

    expect(result).toBeDefined();
    expect(result.title).toBe("בדיקת חיבור רשת");
    expect(result.status).toBe("OPEN");
    expect(result.priority).toBe("MEDIUM");
    expect(result.type).toBe("SERVICE");

    const dbRow = await prisma.ticket.findUnique({ where: { id: result.id } });
    expect(dbRow).not.toBeNull();
    expect(dbRow!.companyId).toBe(companyA);
    expect(dbRow!.creatorId).toBe(adminUserA.id);
    expect(dbRow!.title).toBe("בדיקת חיבור רשת");
  });

  it("full fields → verify response AND DB state", async () => {
    mockUser(adminUserA);
    const slaDue = new Date(Date.now() + 3600_000);
    const slaResp = new Date(Date.now() + 1800_000);
    const result = await createTicket({
      title: "תקלה מורכבת בציוד",
      description: "הציוד לא מגיב לפקודות מרחוק, צריך בדיקה פיזית",
      status: "IN_PROGRESS",
      priority: "HIGH",
      type: "COMPLAINT",
      clientId: clientA.id,
      assigneeId: serviceUserA.id,
      tags: ["ציוד", "חשמל"],
      slaDueDate: slaDue,
      slaResponseDueDate: slaResp,
    });

    expect(result.title).toBe("תקלה מורכבת בציוד");
    expect(result.description).toBe("הציוד לא מגיב לפקודות מרחוק, צריך בדיקה פיזית");
    expect(result.status).toBe("IN_PROGRESS");
    expect(result.priority).toBe("HIGH");
    expect(result.type).toBe("COMPLAINT");
    expect(result.clientId).toBe(clientA.id);
    expect(result.assigneeId).toBe(serviceUserA.id);
    expect(result.tags).toEqual(["ציוד", "חשמל"]);
    expect(result.creatorId).toBe(adminUserA.id);

    // DB readback
    const dbRow = await prisma.ticket.findUnique({ where: { id: result.id } });
    expect(dbRow!.title).toBe("תקלה מורכבת בציוד");
    expect(dbRow!.description).toBe("הציוד לא מגיב לפקודות מרחוק, צריך בדיקה פיזית");
    expect(dbRow!.status).toBe("IN_PROGRESS");
    expect(dbRow!.priority).toBe("HIGH");
    expect(dbRow!.type).toBe("COMPLAINT");
    expect(dbRow!.clientId).toBe(clientA.id);
    expect(dbRow!.assigneeId).toBe(serviceUserA.id);
    expect(dbRow!.tags).toEqual(["ציוד", "חשמל"]);
    expect(dbRow!.companyId).toBe(companyA);
    expect(dbRow!.creatorId).toBe(adminUserA.id);
  });

  it("response contract: no companyId leaked", async () => {
    mockUser(adminUserA);
    const result = await createTicket(VALID_CREATE);

    expect(result).not.toHaveProperty("companyId");
  });

  it("auto SLA date calculation from SlaPolicy", async () => {
    mockUser(adminUserA);
    await prisma.slaPolicy.create({
      data: {
        companyId: companyA,
        priority: "CRITICAL",
        name: "מדיניות קריטית",
        responseTimeMinutes: 30,
        resolveTimeMinutes: 120,
      },
    });

    const before = Date.now();
    const result = await createTicket({
      title: "תקלה קריטית בייצור",
      status: "OPEN",
      priority: "CRITICAL",
      type: "SERVICE",
    });

    expect(result.slaDueDate).not.toBeNull();
    expect(result.slaResponseDueDate).not.toBeNull();

    const resolveDelta = new Date(result.slaDueDate!).getTime() - before;
    const responseDelta = new Date(result.slaResponseDueDate!).getTime() - before;
    expect(resolveDelta).toBeGreaterThanOrEqual(120 * 60 * 1000 - 5000);
    expect(resolveDelta).toBeLessThanOrEqual(120 * 60 * 1000 + 5000);
    expect(responseDelta).toBeGreaterThanOrEqual(30 * 60 * 1000 - 5000);
    expect(responseDelta).toBeLessThanOrEqual(30 * 60 * 1000 + 5000);

    // DB readback
    const dbRow = await prisma.ticket.findUnique({ where: { id: result.id } });
    expect(dbRow!.slaDueDate).not.toBeNull();
    expect(dbRow!.slaResponseDueDate).not.toBeNull();
    const dbResolveDelta = dbRow!.slaDueDate!.getTime() - before;
    const dbResponseDelta = dbRow!.slaResponseDueDate!.getTime() - before;
    expect(dbResolveDelta).toBeGreaterThanOrEqual(120 * 60 * 1000 - 5000);
    expect(dbResolveDelta).toBeLessThanOrEqual(120 * 60 * 1000 + 5000);
    expect(dbResponseDelta).toBeGreaterThanOrEqual(30 * 60 * 1000 - 5000);
    expect(dbResponseDelta).toBeLessThanOrEqual(30 * 60 * 1000 + 5000);
  });

  it("auto SLA does NOT override explicit slaDueDate/slaResponseDueDate", async () => {
    mockUser(adminUserA);
    await prisma.slaPolicy.create({
      data: {
        companyId: companyA,
        priority: "HIGH",
        name: "מדיניות גבוהה",
        responseTimeMinutes: 60,
        resolveTimeMinutes: 240,
      },
    });

    const explicitSlaDue = new Date("2035-01-15T10:00:00.000Z");
    const explicitSlaResp = new Date("2035-01-15T05:00:00.000Z");

    const result = await createTicket({
      title: "קריאה עם SLA ידני",
      status: "OPEN",
      priority: "HIGH",
      type: "SERVICE",
      slaDueDate: explicitSlaDue,
      slaResponseDueDate: explicitSlaResp,
    });

    expect(new Date(result.slaDueDate!).toISOString()).toBe("2035-01-15T10:00:00.000Z");
    expect(new Date(result.slaResponseDueDate!).toISOString()).toBe("2035-01-15T05:00:00.000Z");
  });

  it("companyId set from user, creatorId set from user", async () => {
    mockUser(serviceUserA);
    const result = await createTicket(VALID_CREATE);

    const dbRow = await prisma.ticket.findUnique({ where: { id: result.id } });
    expect(dbRow!.companyId).toBe(companyA);
    expect(dbRow!.creatorId).toBe(serviceUserA.id);
  });

  it("validation: empty title → Invalid title", async () => {
    mockUser(adminUserA);
    await expect(createTicket({ ...VALID_CREATE, title: "" })).rejects.toThrow("Invalid title");
  });

  it("validation: title > 500 → Invalid title", async () => {
    mockUser(adminUserA);
    await expect(createTicket({ ...VALID_CREATE, title: "x".repeat(501) })).rejects.toThrow("Invalid title");
  });

  it("validation: description > 10000 → Description too long", async () => {
    mockUser(adminUserA);
    await expect(
      createTicket({ ...VALID_CREATE, description: "x".repeat(10_001) }),
    ).rejects.toThrow("Description too long");
  });

  it("validation: tags > 20 → Too many tags", async () => {
    mockUser(adminUserA);
    await expect(
      createTicket({ ...VALID_CREATE, tags: Array.from({ length: 21 }, (_, i) => `תג${i}`) }),
    ).rejects.toThrow("Too many tags");
  });

  it("validation: tag > 100 chars → Tag too long", async () => {
    mockUser(adminUserA);
    await expect(
      createTicket({ ...VALID_CREATE, tags: ["א".repeat(101)] }),
    ).rejects.toThrow("Tag too long");
  });

  it("validation: invalid status → Invalid status", async () => {
    mockUser(adminUserA);
    await expect(
      createTicket({ ...VALID_CREATE, status: "INVALID" }),
    ).rejects.toThrow("Invalid status");
  });

  it("validation: invalid priority → Invalid priority", async () => {
    mockUser(adminUserA);
    await expect(
      createTicket({ ...VALID_CREATE, priority: "INVALID" }),
    ).rejects.toThrow("Invalid priority");
  });

  it("validation: invalid type → Invalid type", async () => {
    mockUser(adminUserA);
    await expect(
      createTicket({ ...VALID_CREATE, type: "INVALID" }),
    ).rejects.toThrow("Invalid type");
  });

  it("cross-company: assigneeId from other company → Invalid assignee", async () => {
    mockUser(adminUserA);
    await expect(
      createTicket({ ...VALID_CREATE, assigneeId: adminUserB.id }),
    ).rejects.toThrow("Invalid assignee");
  });

  it("cross-company: clientId from other company → Invalid client", async () => {
    mockUser(adminUserA);
    await expect(
      createTicket({ ...VALID_CREATE, clientId: clientB.id }),
    ).rejects.toThrow("Invalid client");
  });

  it("inngest.send called for assignee notification", async () => {
    mockUser(adminUserA);
    await createTicket({ ...VALID_CREATE, assigneeId: serviceUserA.id });

    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "ticket/notification",
        data: expect.objectContaining({
          type: "assignee",
          isNew: true,
          assigneeId: serviceUserA.id,
        }),
      }),
    );
  });

  it("inngest.send NOT called when assignee is self", async () => {
    mockUser(adminUserA);
    await createTicket({ ...VALID_CREATE, assigneeId: adminUserA.id });

    expect(inngest.send).not.toHaveBeenCalled();
  });

  it("redis.del called to invalidate cache", async () => {
    mockUser(adminUserA);
    await createTicket(VALID_CREATE);

    expect(redis.del).toHaveBeenCalledWith(
      `cache:metric:${companyA}:service:stats`,
      `cache:metric:${companyA}:service:sla-policies`,
    );
  });

  it("revalidatePath(/service) called", async () => {
    mockUser(adminUserA);
    await createTicket(VALID_CREATE);
    expect(revalidatePath).toHaveBeenCalledWith("/service");
  });

  it("SLA dates null when no matching SlaPolicy", async () => {
    mockUser(adminUserA);
    // No SlaPolicy seeded for LOW priority
    const result = await createTicket({
      title: "קריאה ללא מדיניות SLA",
      status: "OPEN",
      priority: "LOW",
      type: "SERVICE",
    });

    expect(result.slaDueDate).toBeNull();
    expect(result.slaResponseDueDate).toBeNull();

    // DB readback
    const dbRow = await prisma.ticket.findUnique({ where: { id: result.id } });
    expect(dbRow!.slaDueDate).toBeNull();
    expect(dbRow!.slaResponseDueDate).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// updateTicket
// ═════════════════════════════════════════════════════════════════════════════

describe("updateTicket", () => {
  it("single field update → verify response AND DB", async () => {
    mockUser(adminUserA);
    const ticket = await seedTicket(companyA, adminUserA.id, { title: "לפני שינוי" });

    const result = await updateTicket(ticket.id, { title: "אחרי שינוי" });
    expect(result.title).toBe("אחרי שינוי");

    const dbRow = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    expect(dbRow!.title).toBe("אחרי שינוי");
  });

  it("multi-field update → verify response AND DB", async () => {
    mockUser(adminUserA);
    const ticket = await seedTicket(companyA, adminUserA.id, { title: "עדכון מרובה" });

    const result = await updateTicket(ticket.id, {
      title: "כותרת חדשה",
      description: "תיאור מעודכן",
      tags: ["תג-חדש"],
    });

    expect(result.title).toBe("כותרת חדשה");
    expect(result.description).toBe("תיאור מעודכן");
    expect(result.tags).toEqual(["תג-חדש"]);

    // DB readback
    const dbRow = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    expect(dbRow!.title).toBe("כותרת חדשה");
    expect(dbRow!.description).toBe("תיאור מעודכן");
    expect(dbRow!.tags).toEqual(["תג-חדש"]);
  });

  it("status change (enum transition)", async () => {
    mockUser(adminUserA);
    const ticket = await seedTicket(companyA, adminUserA.id, { status: "OPEN" });

    const result = await updateTicket(ticket.id, { status: "IN_PROGRESS" });
    expect(result.status).toBe("IN_PROGRESS");

    const dbRow = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    expect(dbRow!.status).toBe("IN_PROGRESS");
  });

  it("set clientId to null (disconnect client)", async () => {
    mockUser(adminUserA);
    const ticket = await seedTicket(companyA, adminUserA.id, { clientId: clientA.id });

    const result = await updateTicket(ticket.id, { clientId: null });
    expect(result.clientId).toBeNull();

    const dbRow = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    expect(dbRow!.clientId).toBeNull();
  });

  it("priority change → SLA dates recalculated from SlaPolicy", async () => {
    mockUser(adminUserA);
    await prisma.slaPolicy.create({
      data: {
        companyId: companyA,
        priority: "HIGH",
        name: "מדיניות גבוהה",
        responseTimeMinutes: 60,
        resolveTimeMinutes: 240,
      },
    });

    const ticket = await seedTicket(companyA, adminUserA.id, {
      priority: "MEDIUM",
      status: "OPEN",
    });

    const before = Date.now();
    const result = await updateTicket(ticket.id, { priority: "HIGH" });

    expect(result.slaDueDate).not.toBeNull();
    const resolveDelta = new Date(result.slaDueDate!).getTime() - before;
    expect(resolveDelta).toBeGreaterThanOrEqual(240 * 60 * 1000 - 5000);
    expect(resolveDelta).toBeLessThanOrEqual(240 * 60 * 1000 + 5000);

    // slaResponseDueDate set because status is OPEN
    expect(result.slaResponseDueDate).not.toBeNull();
    const responseDelta = new Date(result.slaResponseDueDate!).getTime() - before;
    expect(responseDelta).toBeGreaterThanOrEqual(60 * 60 * 1000 - 5000);
    expect(responseDelta).toBeLessThanOrEqual(60 * 60 * 1000 + 5000);

    // DB readback
    const dbRow = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    expect(dbRow!.slaDueDate).not.toBeNull();
    const dbResolveDelta = dbRow!.slaDueDate!.getTime() - before;
    expect(dbResolveDelta).toBeGreaterThanOrEqual(240 * 60 * 1000 - 5000);
    expect(dbResolveDelta).toBeLessThanOrEqual(240 * 60 * 1000 + 5000);
    expect(dbRow!.slaResponseDueDate).not.toBeNull();
    const dbResponseDelta = dbRow!.slaResponseDueDate!.getTime() - before;
    expect(dbResponseDelta).toBeGreaterThanOrEqual(60 * 60 * 1000 - 5000);
    expect(dbResponseDelta).toBeLessThanOrEqual(60 * 60 * 1000 + 5000);
  });

  it("SLA responseDate NOT set when status is not OPEN", async () => {
    mockUser(adminUserA);
    await prisma.slaPolicy.create({
      data: {
        companyId: companyA,
        priority: "CRITICAL",
        name: "מדיניות קריטית",
        responseTimeMinutes: 15,
        resolveTimeMinutes: 60,
      },
    });

    const ticket = await seedTicket(companyA, adminUserA.id, {
      priority: "MEDIUM",
      status: "IN_PROGRESS",
    });

    const result = await updateTicket(ticket.id, { priority: "CRITICAL" });

    // slaDueDate should be set (resolve time)
    expect(result.slaDueDate).not.toBeNull();
    // slaResponseDueDate should NOT be set — status is IN_PROGRESS, not OPEN
    // The code only sets slaResponseDueDate when newStatus === "OPEN"
    const dbRow = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    // When status is not OPEN, slaResponseDueDate stays as whatever it was before (null in this case)
    expect(dbRow!.slaResponseDueDate).toBeNull();
  });

  it("priority change with no SlaPolicy → dates unchanged", async () => {
    mockUser(adminUserA);
    const slaDue = new Date(Date.now() + 999_999_000);
    const slaResp = new Date(Date.now() + 500_000_000);
    const ticket = await seedTicket(companyA, adminUserA.id, {
      priority: "HIGH",
      slaDueDate: slaDue,
      slaResponseDueDate: slaResp,
    });

    // No SLA policy for LOW — the code sets undefined which Prisma ignores
    const result = await updateTicket(ticket.id, { priority: "LOW" });

    const dbRow = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    expect(dbRow!.slaDueDate!.getTime()).toBe(slaDue.getTime());
    expect(dbRow!.slaResponseDueDate!.getTime()).toBe(slaResp.getTime());
  });

  it("non-existent ticket → Ticket not found", async () => {
    mockUser(adminUserA);
    await expect(updateTicket(999999, { title: "רוח רפאים" })).rejects.toThrow("Ticket not found");
  });

  it("other company ticket → Ticket not found", async () => {
    const ticket = await seedTicket(companyB, adminUserB.id, { title: "קריאה של חברה ב" });
    mockUser(adminUserA);
    await expect(updateTicket(ticket.id, { title: "ניסיון חדירה" })).rejects.toThrow("Ticket not found");
  });

  it("validation: empty title → Invalid title", async () => {
    mockUser(adminUserA);
    const ticket = await seedTicket(companyA, adminUserA.id);
    await expect(updateTicket(ticket.id, { title: "" })).rejects.toThrow("Invalid title");
  });

  it("validation: title > 500 → Invalid title", async () => {
    mockUser(adminUserA);
    const ticket = await seedTicket(companyA, adminUserA.id);
    await expect(updateTicket(ticket.id, { title: "x".repeat(501) })).rejects.toThrow("Invalid title");
  });

  it("validation: description > 10000 → Description too long", async () => {
    mockUser(adminUserA);
    const ticket = await seedTicket(companyA, adminUserA.id);
    await expect(updateTicket(ticket.id, { description: "x".repeat(10_001) })).rejects.toThrow("Description too long");
  });

  it("validation: tags > 20 → Too many tags", async () => {
    mockUser(adminUserA);
    const ticket = await seedTicket(companyA, adminUserA.id);
    await expect(
      updateTicket(ticket.id, { tags: Array.from({ length: 21 }, (_, i) => `תג${i}`) }),
    ).rejects.toThrow("Too many tags");
  });

  it("validation: tag > 100 chars → Tag too long", async () => {
    mockUser(adminUserA);
    const ticket = await seedTicket(companyA, adminUserA.id);
    await expect(
      updateTicket(ticket.id, { tags: ["א".repeat(101)] }),
    ).rejects.toThrow("Tag too long");
  });

  it("validation: invalid status → Invalid status", async () => {
    mockUser(adminUserA);
    const ticket = await seedTicket(companyA, adminUserA.id);
    await expect(updateTicket(ticket.id, { status: "INVALID" })).rejects.toThrow("Invalid status");
  });

  it("validation: invalid priority → Invalid priority", async () => {
    mockUser(adminUserA);
    const ticket = await seedTicket(companyA, adminUserA.id);
    await expect(updateTicket(ticket.id, { priority: "INVALID" })).rejects.toThrow("Invalid priority");
  });

  it("validation: invalid type → Invalid type", async () => {
    mockUser(adminUserA);
    const ticket = await seedTicket(companyA, adminUserA.id);
    await expect(updateTicket(ticket.id, { type: "INVALID" })).rejects.toThrow("Invalid type");
  });

  it("cross-company: invalid assigneeId → Invalid assignee", async () => {
    mockUser(adminUserA);
    const ticket = await seedTicket(companyA, adminUserA.id);
    await expect(updateTicket(ticket.id, { assigneeId: adminUserB.id })).rejects.toThrow("Invalid assignee");
  });

  it("cross-company: invalid clientId → Invalid client", async () => {
    mockUser(adminUserA);
    const ticket = await seedTicket(companyA, adminUserA.id);
    await expect(updateTicket(ticket.id, { clientId: clientB.id })).rejects.toThrow("Invalid client");
  });

  it("inngest events: activity-log always sent", async () => {
    mockUser(adminUserA);
    const ticket = await seedTicket(companyA, adminUserA.id, { title: "לפני שינוי אירוע" });

    await updateTicket(ticket.id, { title: "אחרי שינוי אירוע" });

    expect(inngest.send).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ name: "ticket/activity-log" }),
      ]),
    );
  });

  it("inngest events: status-change when status differs", async () => {
    mockUser(adminUserA);
    const ticket = await seedTicket(companyA, adminUserA.id, { status: "OPEN" });

    await updateTicket(ticket.id, { status: "RESOLVED" });

    expect(inngest.send).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ name: "ticket/status-change" }),
      ]),
    );
  });

  it("inngest events: status-change NOT sent when status unchanged", async () => {
    mockUser(adminUserA);
    const ticket = await seedTicket(companyA, adminUserA.id, { status: "OPEN" });

    await updateTicket(ticket.id, { title: "שינוי כותרת בלבד" });

    const calls = vi.mocked(inngest.send).mock.calls;
    for (const call of calls) {
      const events = Array.isArray(call[0]) ? call[0] : [call[0]];
      for (const event of events) {
        if ((event as any).name === "ticket/status-change") {
          throw new Error("status-change should not be sent when status is unchanged");
        }
      }
    }
  });

  it("inngest events: notification when assignee changes to another user", async () => {
    mockUser(adminUserA);
    const ticket = await seedTicket(companyA, adminUserA.id);

    await updateTicket(ticket.id, { assigneeId: serviceUserA.id });

    expect(inngest.send).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          name: "ticket/notification",
          data: expect.objectContaining({
            type: "assignee",
            isNew: false,
            assigneeId: serviceUserA.id,
          }),
        }),
      ]),
    );
  });

  it("inngest events: no notification when assignee is self", async () => {
    mockUser(adminUserA);
    const ticket = await seedTicket(companyA, adminUserA.id);

    await updateTicket(ticket.id, { assigneeId: adminUserA.id });

    // inngest.send IS called (activity-log), but notification should NOT be in array
    const calls = vi.mocked(inngest.send).mock.calls;
    for (const call of calls) {
      const events = Array.isArray(call[0]) ? call[0] : [call[0]];
      for (const event of events) {
        if ((event as any).name === "ticket/notification") {
          throw new Error("notification should not be sent when assigning to self");
        }
      }
    }
  });

  it("redis.del called to invalidate cache", async () => {
    mockUser(adminUserA);
    const ticket = await seedTicket(companyA, adminUserA.id);

    await updateTicket(ticket.id, { title: "בדיקת Redis" });

    expect(redis.del).toHaveBeenCalledWith(
      `cache:metric:${companyA}:service:stats`,
      `cache:metric:${companyA}:service:sla-policies`,
    );
  });

  it("revalidatePath called on success", async () => {
    mockUser(adminUserA);
    const ticket = await seedTicket(companyA, adminUserA.id);

    await updateTicket(ticket.id, { title: "עדכון לבדיקת revalidate" });
    expect(revalidatePath).toHaveBeenCalledWith("/service");
  });

  it("response contract: no companyId leaked", async () => {
    mockUser(adminUserA);
    const ticket = await seedTicket(companyA, adminUserA.id);
    const result = await updateTicket(ticket.id, { title: "בדיקת חסימה" });
    expect(result).not.toHaveProperty("companyId");
  });

  it("validation failure → ticket unchanged in DB", async () => {
    mockUser(adminUserA);
    const ticket = await seedTicket(companyA, adminUserA.id, {
      title: "כותרת מקורית",
      description: "תיאור מקורי",
      status: "OPEN",
      priority: "MEDIUM",
      tags: ["תג-מקורי"],
    });

    const before = await prisma.ticket.findUnique({ where: { id: ticket.id } });

    await expect(
      updateTicket(ticket.id, { title: "x".repeat(501) }),
    ).rejects.toThrow("Invalid title");

    const after = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    expect(after!.title).toBe(before!.title);
    expect(after!.description).toBe(before!.description);
    expect(after!.status).toBe(before!.status);
    expect(after!.priority).toBe(before!.priority);
    expect(after!.tags).toEqual(before!.tags);
    expect(after!.updatedAt.getTime()).toBe(before!.updatedAt.getTime());
  });

  it("inngest fallback: direct automation when inngest.send throws", async () => {
    mockUser(adminUserA);
    await prisma.automationRule.create({
      data: {
        companyId: companyA,
        name: "כלל התראת סטטוס",
        triggerType: "TICKET_STATUS_CHANGE",
        actionType: "SEND_NOTIFICATION",
        isActive: true,
        triggerConfig: { fromStatus: "OPEN", toStatus: "IN_PROGRESS" },
        actionConfig: { recipientId: serviceUserA.id, messageTemplate: "הקריאה {ticketTitle} עברה ל{toStatus}" },
      },
    });
    const ticket = await seedTicket(companyA, adminUserA.id, { status: "OPEN", title: "קריאה לבדיקת פולבק" });

    vi.mocked(inngest.send).mockRejectedValueOnce(new Error("Inngest unavailable"));

    const updated = await updateTicket(ticket.id, { status: "IN_PROGRESS" });
    expect(updated.status).toBe("IN_PROGRESS");

    expect(createNotificationForCompany).toHaveBeenCalledWith({
      companyId: companyA,
      userId: serviceUserA.id,
      title: "עדכון בקריאת שירות",
      message: "הקריאה קריאה לבדיקת פולבק עברה לבטיפול",
      link: "/service",
    });
  });

  it("explicit slaDueDate set directly (no priority change)", async () => {
    mockUser(adminUserA);
    const ticket = await seedTicket(companyA, adminUserA.id);
    const explicitDate = new Date("2030-01-15T10:00:00.000Z");

    const result = await updateTicket(ticket.id, { slaDueDate: explicitDate });
    expect(new Date(result.slaDueDate!).toISOString()).toBe("2030-01-15T10:00:00.000Z");

    const dbRow = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    expect(dbRow!.slaDueDate!.toISOString()).toBe("2030-01-15T10:00:00.000Z");
  });

  it("inngest fallback: 'any' wildcard matches, non-matching rule skipped", async () => {
    mockUser(adminUserA);
    await prisma.automationRule.create({
      data: {
        companyId: companyA,
        name: "כלל כללי (any)",
        triggerType: "TICKET_STATUS_CHANGE",
        actionType: "SEND_NOTIFICATION",
        isActive: true,
        triggerConfig: { fromStatus: "any", toStatus: "IN_PROGRESS" },
        actionConfig: { recipientId: serviceUserA.id, messageTemplate: "כללי: {ticketTitle}" },
      },
    });
    await prisma.automationRule.create({
      data: {
        companyId: companyA,
        name: "כלל לא תואם",
        triggerType: "TICKET_STATUS_CHANGE",
        actionType: "SEND_NOTIFICATION",
        isActive: true,
        triggerConfig: { fromStatus: "RESOLVED", toStatus: "IN_PROGRESS" },
        actionConfig: { recipientId: adminUserA.id, messageTemplate: "לא צריך להישלח" },
      },
    });
    const ticket = await seedTicket(companyA, adminUserA.id, { status: "OPEN", title: "בדיקת any" });

    vi.mocked(inngest.send).mockRejectedValueOnce(new Error("Inngest unavailable"));

    await updateTicket(ticket.id, { status: "IN_PROGRESS" });

    expect(createNotificationForCompany).toHaveBeenCalledTimes(1);
    expect(createNotificationForCompany).toHaveBeenCalledWith({
      companyId: companyA,
      userId: serviceUserA.id,
      title: "עדכון בקריאת שירות",
      message: "כללי: בדיקת any",
      link: "/service",
    });
  });

  it("inngest fallback: title-only update does NOT trigger automation rules", async () => {
    mockUser(adminUserA);
    await prisma.automationRule.create({
      data: {
        companyId: companyA,
        name: "כלל שלא צריך לרוץ",
        triggerType: "TICKET_STATUS_CHANGE",
        actionType: "SEND_NOTIFICATION",
        isActive: true,
        triggerConfig: { fromStatus: "any", toStatus: "any" },
        actionConfig: { recipientId: serviceUserA.id, messageTemplate: "לא צריך להישלח" },
      },
    });
    const ticket = await seedTicket(companyA, adminUserA.id, { status: "OPEN" });

    vi.mocked(inngest.send).mockRejectedValueOnce(new Error("Inngest unavailable"));

    await updateTicket(ticket.id, { title: "כותרת חדשה בלבד" });

    expect(createNotificationForCompany).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// deleteTicket
// ═════════════════════════════════════════════════════════════════════════════

describe("deleteTicket", () => {
  it("deletes ticket → verify DB", async () => {
    mockUser(adminUserA);
    const ticket = await seedTicket(companyA, adminUserA.id);

    await deleteTicket(ticket.id);

    const dbRow = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    expect(dbRow).toBeNull();
  });

  it("cascades: comments, activityLogs, breaches deleted", async () => {
    mockUser(adminUserA);
    const ticket = await seedTicket(companyA, adminUserA.id);

    await prisma.ticketComment.create({
      data: { ticketId: ticket.id, userId: adminUserA.id, content: "בדיקת מחיקה" },
    });
    await prisma.ticketActivityLog.create({
      data: { ticketId: ticket.id, userId: adminUserA.id, fieldName: "x", fieldLabel: "X" },
    });
    await prisma.slaBreach.create({
      data: {
        companyId: companyA,
        ticketId: ticket.id,
        priority: "MEDIUM",
        slaDueDate: new Date(),
      },
    });

    await deleteTicket(ticket.id);

    const comments = await prisma.ticketComment.findMany({ where: { ticketId: ticket.id } });
    const logs = await prisma.ticketActivityLog.findMany({ where: { ticketId: ticket.id } });
    const breaches = await prisma.slaBreach.findMany({ where: { ticketId: ticket.id } });
    expect(comments).toHaveLength(0);
    expect(logs).toHaveLength(0);
    expect(breaches).toHaveLength(0);
  });

  it("non-existent → Ticket not found", async () => {
    mockUser(adminUserA);
    await expect(deleteTicket(999999)).rejects.toThrow("Ticket not found");
  });

  it("other company → Ticket not found", async () => {
    const ticket = await seedTicket(companyB, adminUserB.id);
    mockUser(adminUserA);
    await expect(deleteTicket(ticket.id)).rejects.toThrow("Ticket not found");
  });

  it("redis.del called to invalidate cache", async () => {
    mockUser(adminUserA);
    const ticket = await seedTicket(companyA, adminUserA.id);

    await deleteTicket(ticket.id);

    expect(redis.del).toHaveBeenCalledWith(
      `cache:metric:${companyA}:service:stats`,
      `cache:metric:${companyA}:service:sla-policies`,
    );
  });

  it("revalidatePath called", async () => {
    mockUser(adminUserA);
    const ticket = await seedTicket(companyA, adminUserA.id);

    await deleteTicket(ticket.id);
    expect(revalidatePath).toHaveBeenCalledWith("/service");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// addTicketComment
// ═════════════════════════════════════════════════════════════════════════════

describe("addTicketComment", () => {
  it("creates comment → verify DB", async () => {
    mockUser(adminUserA);
    const ticket = await seedTicket(companyA, adminUserA.id);

    const comment = await addTicketComment(ticket.id, "הערה חדשה לקריאה", true);

    expect(comment.ticketId).toBe(ticket.id);
    expect(comment.userId).toBe(adminUserA.id);
    expect(comment.content).toBe("הערה חדשה לקריאה");
    expect(comment.isInternal).toBe(true);

    const dbRow = await prisma.ticketComment.findUnique({ where: { id: comment.id } });
    expect(dbRow).not.toBeNull();
    expect(dbRow!.content).toBe("הערה חדשה לקריאה");
    expect(dbRow!.isInternal).toBe(true);
  });

  it("non-existent ticket → Unauthorized", async () => {
    mockUser(adminUserA);
    await expect(addTicketComment(999999, "הערה לקריאה לא קיימת")).rejects.toThrow("Unauthorized");
  });

  it("other company ticket → Unauthorized", async () => {
    const ticket = await seedTicket(companyB, adminUserB.id);
    mockUser(adminUserA);
    await expect(addTicketComment(ticket.id, "הערה חוצת חברות")).rejects.toThrow("Unauthorized");
  });

  it("validation: empty content → Invalid comment", async () => {
    mockUser(adminUserA);
    const ticket = await seedTicket(companyA, adminUserA.id);
    await expect(addTicketComment(ticket.id, "")).rejects.toThrow("Invalid comment");
  });

  it("validation: content > 5000 → Invalid comment", async () => {
    mockUser(adminUserA);
    const ticket = await seedTicket(companyA, adminUserA.id);
    await expect(addTicketComment(ticket.id, "x".repeat(5001))).rejects.toThrow("Invalid comment");
  });

  it("inngest notification sent", async () => {
    mockUser(adminUserA);
    const ticket = await seedTicket(companyA, adminUserA.id);

    await addTicketComment(ticket.id, "בדיקת התראה");

    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "ticket/notification",
        data: {
          type: "comment",
          companyId: companyA,
          ticketId: ticket.id,
          userId: adminUserA.id,
          userName: adminUserA.name,
        },
      }),
    );
  });

  it("response shape", async () => {
    mockUser(adminUserA);
    const ticket = await seedTicket(companyA, adminUserA.id);

    const comment = await addTicketComment(ticket.id, "בדיקת מבנה");

    expect(Object.keys(comment).sort()).toEqual([
      "content", "createdAt", "id", "isInternal", "ticketId", "updatedAt", "userId",
    ]);
  });

  it("isInternal defaults to false", async () => {
    mockUser(adminUserA);
    const ticket = await seedTicket(companyA, adminUserA.id);

    const comment = await addTicketComment(ticket.id, "ברירת מחדל");
    expect(comment.isInternal).toBe(false);

    const dbRow = await prisma.ticketComment.findUnique({ where: { id: comment.id } });
    expect(dbRow!.isInternal).toBe(false);
  });

  it("revalidatePath(/service) called", async () => {
    mockUser(adminUserA);
    const ticket = await seedTicket(companyA, adminUserA.id);

    await addTicketComment(ticket.id, "בדיקת revalidate");
    expect(revalidatePath).toHaveBeenCalledWith("/service");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// updateTicketComment
// ═════════════════════════════════════════════════════════════════════════════

describe("updateTicketComment", () => {
  it("author updates own comment → verify DB", async () => {
    mockUser(serviceUserA);
    const ticket = await seedTicket(companyA, adminUserA.id);
    const comment = await prisma.ticketComment.create({
      data: { ticketId: ticket.id, userId: serviceUserA.id, content: "הערה מקורית" },
    });

    await updateTicketComment(comment.id, "הערה מעודכנת");

    const dbRow = await prisma.ticketComment.findUnique({ where: { id: comment.id } });
    expect(dbRow!.content).toBe("הערה מעודכנת");
  });

  it("admin updates another user's comment → allowed", async () => {
    mockUser(adminUserA);
    const ticket = await seedTicket(companyA, adminUserA.id);
    const comment = await prisma.ticketComment.create({
      data: { ticketId: ticket.id, userId: serviceUserA.id, content: "הערה של דנה" },
    });

    await updateTicketComment(comment.id, "עריכה על ידי מנהל");

    const dbRow = await prisma.ticketComment.findUnique({ where: { id: comment.id } });
    expect(dbRow!.content).toBe("עריכה על ידי מנהל");
  });

  it("non-admin updates another user's comment → throws Hebrew error", async () => {
    mockUser(serviceUserA);
    const ticket = await seedTicket(companyA, adminUserA.id);
    const comment = await prisma.ticketComment.create({
      data: { ticketId: ticket.id, userId: adminUserA.id, content: "הערה של המנהל" },
    });

    await expect(updateTicketComment(comment.id, "ניסיון עריכה")).rejects.toThrow(
      "רק מי ששלח את ההודעה או מנהל יכול לערוך",
    );
  });

  it("non-existent comment → Unauthorized", async () => {
    mockUser(adminUserA);
    await expect(updateTicketComment(999999, "רוח רפאים")).rejects.toThrow("Unauthorized");
  });

  it("other company comment → Unauthorized", async () => {
    const ticket = await seedTicket(companyB, adminUserB.id);
    const comment = await prisma.ticketComment.create({
      data: { ticketId: ticket.id, userId: adminUserB.id, content: "הערה של חברה ב" },
    });
    mockUser(adminUserA);
    await expect(updateTicketComment(comment.id, "חדירה")).rejects.toThrow("Unauthorized");
  });

  it("validation: empty content → Invalid comment", async () => {
    mockUser(adminUserA);
    const ticket = await seedTicket(companyA, adminUserA.id);
    const comment = await prisma.ticketComment.create({
      data: { ticketId: ticket.id, userId: adminUserA.id, content: "תוכן תקין" },
    });
    await expect(updateTicketComment(comment.id, "")).rejects.toThrow("Invalid comment");
  });

  it("validation: content > 5000 → Invalid comment", async () => {
    mockUser(adminUserA);
    const ticket = await seedTicket(companyA, adminUserA.id);
    const comment = await prisma.ticketComment.create({
      data: { ticketId: ticket.id, userId: adminUserA.id, content: "תוכן תקין" },
    });
    await expect(updateTicketComment(comment.id, "x".repeat(5001))).rejects.toThrow("Invalid comment");
  });

  it("revalidatePath(/service) called", async () => {
    mockUser(adminUserA);
    const ticket = await seedTicket(companyA, adminUserA.id);
    const comment = await prisma.ticketComment.create({
      data: { ticketId: ticket.id, userId: adminUserA.id, content: "לעדכון" },
    });

    await updateTicketComment(comment.id, "מעודכן");
    expect(revalidatePath).toHaveBeenCalledWith("/service");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// deleteTicketComment
// ═════════════════════════════════════════════════════════════════════════════

describe("deleteTicketComment", () => {
  it("author deletes own comment → verify DB", async () => {
    mockUser(serviceUserA);
    const ticket = await seedTicket(companyA, adminUserA.id);
    const comment = await prisma.ticketComment.create({
      data: { ticketId: ticket.id, userId: serviceUserA.id, content: "למחיקה" },
    });

    await deleteTicketComment(comment.id);

    const dbRow = await prisma.ticketComment.findFirst({ where: { id: comment.id } });
    expect(dbRow).toBeNull();
  });

  it("admin deletes another user's comment → allowed", async () => {
    mockUser(adminUserA);
    const ticket = await seedTicket(companyA, adminUserA.id);
    const comment = await prisma.ticketComment.create({
      data: { ticketId: ticket.id, userId: serviceUserA.id, content: "הערה של דנה" },
    });

    await deleteTicketComment(comment.id);

    const dbRow = await prisma.ticketComment.findFirst({ where: { id: comment.id } });
    expect(dbRow).toBeNull();
  });

  it("non-admin deletes another's → throws Hebrew error", async () => {
    mockUser(serviceUserA);
    const ticket = await seedTicket(companyA, adminUserA.id);
    const comment = await prisma.ticketComment.create({
      data: { ticketId: ticket.id, userId: adminUserA.id, content: "הערה של יוסי" },
    });

    await expect(deleteTicketComment(comment.id)).rejects.toThrow(
      "רק מי ששלח את ההודעה או מנהל יכול למחוק",
    );
  });

  it("non-existent → Unauthorized", async () => {
    mockUser(adminUserA);
    await expect(deleteTicketComment(999999)).rejects.toThrow("Unauthorized");
  });

  it("other company → Unauthorized", async () => {
    const ticket = await seedTicket(companyB, adminUserB.id);
    const comment = await prisma.ticketComment.create({
      data: { ticketId: ticket.id, userId: adminUserB.id, content: "הערה של חברה ב" },
    });
    mockUser(adminUserA);
    await expect(deleteTicketComment(comment.id)).rejects.toThrow("Unauthorized");
  });

  it("revalidatePath(/service) called", async () => {
    mockUser(adminUserA);
    const ticket = await seedTicket(companyA, adminUserA.id);
    const comment = await prisma.ticketComment.create({
      data: { ticketId: ticket.id, userId: adminUserA.id, content: "למחיקה" },
    });

    await deleteTicketComment(comment.id);
    expect(revalidatePath).toHaveBeenCalledWith("/service");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SLA Policies
// ═════════════════════════════════════════════════════════════════════════════

describe("SLA Policies", () => {
  it("getSlaPolicies: returns company policies", async () => {
    mockUser(adminUserA);
    await prisma.slaPolicy.create({
      data: {
        companyId: companyA,
        priority: "HIGH",
        name: "מדיניות גבוהה",
        responseTimeMinutes: 30,
        resolveTimeMinutes: 120,
      },
    });

    const result = await getSlaPolicies();
    expect(result).toHaveLength(1);
    expect(result[0].priority).toBe("HIGH");
    expect(result[0].responseTimeMinutes).toBe(30);
    expect(result[0].resolveTimeMinutes).toBe(120);
  });

  it("getSlaPolicies: response shape", async () => {
    mockUser(adminUserA);
    await prisma.slaPolicy.create({
      data: {
        companyId: companyA,
        priority: "MEDIUM",
        name: "מדיניות בינונית",
        responseTimeMinutes: 60,
        resolveTimeMinutes: 240,
      },
    });

    const result = await getSlaPolicies();
    expect(result).toHaveLength(1);
    expect(Object.keys(result[0]).sort()).toEqual([
      "description", "id", "name", "priority", "resolveTimeMinutes", "responseTimeMinutes",
    ]);
    // Should NOT have companyId
    expect(result[0]).not.toHaveProperty("companyId");
  });

  it("getSlaPolicies: company isolation", async () => {
    await prisma.slaPolicy.create({
      data: {
        companyId: companyB,
        priority: "LOW",
        name: "מדיניות נמוכה של ב",
        responseTimeMinutes: 60,
        resolveTimeMinutes: 240,
      },
    });
    mockUser(adminUserA);
    const result = await getSlaPolicies();
    expect(result).toHaveLength(0);
  });

  it("getSlaPolicies: null user → empty array", async () => {
    mockUser(null);
    const result = await getSlaPolicies();
    expect(result).toEqual([]);
  });

  it("updateSlaPolicy: create new (upsert)", async () => {
    mockUser(adminUserA);
    const result = await updateSlaPolicy({
      priority: "MEDIUM",
      responseTimeMinutes: 45,
      resolveTimeMinutes: 180,
    });

    expect(result.priority).toBe("MEDIUM");
    expect(result.responseTimeMinutes).toBe(45);
    expect(result.resolveTimeMinutes).toBe(180);

    const dbRow = await prisma.slaPolicy.findFirst({
      where: { companyId: companyA, priority: "MEDIUM" },
    });
    expect(dbRow).not.toBeNull();
    expect(dbRow!.responseTimeMinutes).toBe(45);
    expect(dbRow!.resolveTimeMinutes).toBe(180);
  });

  it("updateSlaPolicy: update existing (upsert)", async () => {
    mockUser(adminUserA);
    await prisma.slaPolicy.create({
      data: {
        companyId: companyA,
        priority: "LOW",
        name: "LOW Policy",
        responseTimeMinutes: 10,
        resolveTimeMinutes: 60,
      },
    });

    const result = await updateSlaPolicy({
      priority: "LOW",
      responseTimeMinutes: 20,
      resolveTimeMinutes: 90,
    });

    expect(result.responseTimeMinutes).toBe(20);
    expect(result.resolveTimeMinutes).toBe(90);

    const dbRow = await prisma.slaPolicy.findFirst({
      where: { companyId: companyA, priority: "LOW" },
    });
    expect(dbRow!.responseTimeMinutes).toBe(20);
    expect(dbRow!.resolveTimeMinutes).toBe(90);
  });

  it("updateSlaPolicy: validation (invalid priority)", async () => {
    mockUser(adminUserA);
    await expect(
      updateSlaPolicy({ priority: "INVALID", responseTimeMinutes: 10, resolveTimeMinutes: 60 }),
    ).rejects.toThrow("Invalid priority");
  });

  it("updateSlaPolicy: validation (out-of-range minutes)", async () => {
    mockUser(adminUserA);
    await expect(
      updateSlaPolicy({ priority: "HIGH", responseTimeMinutes: 0, resolveTimeMinutes: 60 }),
    ).rejects.toThrow("Invalid response time");

    await expect(
      updateSlaPolicy({ priority: "HIGH", responseTimeMinutes: 10, resolveTimeMinutes: 525_601 }),
    ).rejects.toThrow("Invalid resolve time");
  });

  it("updateSlaPolicy: validation (float minutes rejected)", async () => {
    mockUser(adminUserA);
    await expect(
      updateSlaPolicy({ priority: "HIGH", responseTimeMinutes: 10.5, resolveTimeMinutes: 60 }),
    ).rejects.toThrow("Invalid response time");
  });

  it("updateSlaPolicy: boundary (min=1, max=525600)", async () => {
    mockUser(adminUserA);
    const min = await updateSlaPolicy({ priority: "LOW", responseTimeMinutes: 1, resolveTimeMinutes: 1 });
    expect(min.responseTimeMinutes).toBe(1);

    const minDb = await prisma.slaPolicy.findFirst({ where: { companyId: companyA, priority: "LOW" } });
    expect(minDb!.responseTimeMinutes).toBe(1);
    expect(minDb!.resolveTimeMinutes).toBe(1);

    vi.clearAllMocks();
    mockUser(adminUserA);

    const max = await updateSlaPolicy({ priority: "HIGH", responseTimeMinutes: 525_600, resolveTimeMinutes: 525_600 });
    expect(max.resolveTimeMinutes).toBe(525_600);

    const maxDb = await prisma.slaPolicy.findFirst({ where: { companyId: companyA, priority: "HIGH" } });
    expect(maxDb!.responseTimeMinutes).toBe(525_600);
    expect(maxDb!.resolveTimeMinutes).toBe(525_600);
  });

  it("updateSlaPolicies: batch upsert in transaction → verify DB values", async () => {
    mockUser(adminUserA);
    await updateSlaPolicies([
      { priority: "LOW", responseTimeMinutes: 60, resolveTimeMinutes: 240 },
      { priority: "HIGH", responseTimeMinutes: 15, resolveTimeMinutes: 60 },
    ]);

    const policies = await prisma.slaPolicy.findMany({
      where: { companyId: companyA },
      orderBy: { priority: "asc" },
    });
    expect(policies).toHaveLength(2);

    const highPolicy = policies.find((p) => p.priority === "HIGH");
    const lowPolicy = policies.find((p) => p.priority === "LOW");
    expect(highPolicy!.responseTimeMinutes).toBe(15);
    expect(highPolicy!.resolveTimeMinutes).toBe(60);
    expect(lowPolicy!.responseTimeMinutes).toBe(60);
    expect(lowPolicy!.resolveTimeMinutes).toBe(240);
  });

  it("updateSlaPolicies: validation fails → no partial writes", async () => {
    mockUser(adminUserA);
    await expect(
      updateSlaPolicies([
        { priority: "LOW", responseTimeMinutes: 60, resolveTimeMinutes: 240 },
        { priority: "INVALID", responseTimeMinutes: 10, resolveTimeMinutes: 60 },
      ]),
    ).rejects.toThrow("Invalid priority");

    // First valid config should NOT have been written
    const policies = await prisma.slaPolicy.findMany({ where: { companyId: companyA } });
    expect(policies).toHaveLength(0);
  });

  it("updateSlaPolicies: redis.del + revalidatePath called", async () => {
    mockUser(adminUserA);
    await updateSlaPolicies([
      { priority: "LOW", responseTimeMinutes: 30, resolveTimeMinutes: 120 },
    ]);

    expect(redis.del).toHaveBeenCalledWith(
      `cache:metric:${companyA}:service:stats`,
      `cache:metric:${companyA}:service:sla-policies`,
    );
    expect(revalidatePath).toHaveBeenCalledWith("/service");
  });

  it("updateSlaPolicy: redis.del called", async () => {
    mockUser(adminUserA);
    await updateSlaPolicy({ priority: "MEDIUM", responseTimeMinutes: 30, resolveTimeMinutes: 120 });

    expect(redis.del).toHaveBeenCalledWith(
      `cache:metric:${companyA}:service:stats`,
      `cache:metric:${companyA}:service:sla-policies`,
    );
  });

  it("updateSlaPolicy: revalidatePath called", async () => {
    mockUser(adminUserA);
    await updateSlaPolicy({ priority: "MEDIUM", responseTimeMinutes: 30, resolveTimeMinutes: 120 });
    expect(revalidatePath).toHaveBeenCalledWith("/service");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// getTicketStats
// ═════════════════════════════════════════════════════════════════════════════

describe("getTicketStats", () => {
  it("returns correct counts by status", async () => {
    mockUser(adminUserA);
    await seedTicket(companyA, adminUserA.id, { status: "OPEN" });
    await seedTicket(companyA, adminUserA.id, { status: "OPEN" });
    await seedTicket(companyA, adminUserA.id, { status: "IN_PROGRESS" });
    await seedTicket(companyA, adminUserA.id, { status: "WAITING" });
    await seedTicket(companyA, adminUserA.id, { status: "RESOLVED" });
    await seedTicket(companyA, adminUserA.id, { status: "CLOSED" });

    const stats = await getTicketStats();
    expect(stats.open).toBe(2);
    expect(stats.inProgress).toBe(1);
    expect(stats.waiting).toBe(1);
    expect(stats.closed).toBe(1);
    expect(stats.breached).toBe(0);
  });

  it("RESOLVED tickets not included in any status counter", async () => {
    mockUser(adminUserA);
    await seedTicket(companyA, adminUserA.id, { status: "RESOLVED" });
    await seedTicket(companyA, adminUserA.id, { status: "RESOLVED" });

    const stats = await getTicketStats();
    // RESOLVED not in open, inProgress, waiting, or closed
    expect(stats.open).toBe(0);
    expect(stats.inProgress).toBe(0);
    expect(stats.waiting).toBe(0);
    expect(stats.closed).toBe(0);
    expect(stats.breached).toBe(0);
  });

  it("includes breached count (SlaBreach with PENDING status)", async () => {
    mockUser(adminUserA);
    const ticket = await seedTicket(companyA, adminUserA.id);

    await prisma.slaBreach.create({
      data: {
        companyId: companyA,
        ticketId: ticket.id,
        priority: "MEDIUM",
        slaDueDate: new Date(),
        status: "PENDING",
      },
    });
    await prisma.slaBreach.create({
      data: {
        companyId: companyA,
        ticketId: ticket.id,
        priority: "MEDIUM",
        slaDueDate: new Date(Date.now() + 1000),
        breachType: "RESPONSE",
        status: "REVIEWED",
      },
    });

    const stats = await getTicketStats();
    expect(stats.breached).toBe(1); // only PENDING counted
  });

  it("empty → all zeros", async () => {
    mockUser(adminUserA);
    const stats = await getTicketStats();
    expect(stats).toEqual({
      open: 0,
      inProgress: 0,
      waiting: 0,
      closed: 0,
      breached: 0,
    });
  });

  it("null user → all zeros", async () => {
    mockUser(null);
    const stats = await getTicketStats();
    expect(stats).toEqual({
      open: 0,
      inProgress: 0,
      waiting: 0,
      closed: 0,
      breached: 0,
    });
  });

  it("company isolation", async () => {
    await seedTicket(companyB, adminUserB.id, { status: "OPEN" });
    mockUser(adminUserA);
    const stats = await getTicketStats();
    expect(stats.open).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// getServiceAutomationRules
// ═════════════════════════════════════════════════════════════════════════════

describe("getServiceAutomationRules", () => {
  it("returns only TICKET_STATUS_CHANGE and SLA_BREACH rules", async () => {
    mockUser(adminUserA);
    await prisma.automationRule.createMany({
      data: [
        {
          companyId: companyA,
          name: "כלל שינוי סטטוס",
          triggerType: "TICKET_STATUS_CHANGE",
          actionType: "SEND_NOTIFICATION",
        },
        {
          companyId: companyA,
          name: "כלל הפרת SLA",
          triggerType: "SLA_BREACH",
          actionType: "SEND_NOTIFICATION",
        },
        {
          companyId: companyA,
          name: "כלל ידני",
          triggerType: "MANUAL",
          actionType: "SEND_NOTIFICATION",
        },
      ],
    });

    const result = await getServiceAutomationRules();
    expect(result).toHaveLength(2);
    const types = result.map((r: any) => r.triggerType).sort();
    expect(types).toEqual(["SLA_BREACH", "TICKET_STATUS_CHANGE"]);
  });

  it("company isolation", async () => {
    await prisma.automationRule.create({
      data: {
        companyId: companyB,
        name: "כלל של חברה ב",
        triggerType: "TICKET_STATUS_CHANGE",
        actionType: "SEND_NOTIFICATION",
      },
    });
    mockUser(adminUserA);
    const result = await getServiceAutomationRules();
    expect(result).toHaveLength(0);
  });

  it("response shape: no companyId leaked", async () => {
    mockUser(adminUserA);
    await prisma.automationRule.create({
      data: {
        companyId: companyA,
        name: "כלל בדיקת מבנה",
        triggerType: "TICKET_STATUS_CHANGE",
        actionType: "SEND_NOTIFICATION",
        triggerConfig: { fromStatus: "OPEN" },
        actionConfig: { recipientId: 1 },
      },
    });

    const result = await getServiceAutomationRules();
    expect(result).toHaveLength(1);
    expect(Object.keys(result[0]).sort()).toEqual([
      "actionConfig", "actionType", "calendarEventId", "createdAt",
      "folderId", "id", "isActive", "name", "triggerConfig", "triggerType",
    ]);
    expect(result[0]).not.toHaveProperty("companyId");
  });

  it("null user → empty array", async () => {
    mockUser(null);
    const result = await getServiceAutomationRules();
    expect(result).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// getServiceUsers
// ═════════════════════════════════════════════════════════════════════════════

describe("getServiceUsers", () => {
  it("returns exactly 4 users in companyA with id, name only", async () => {
    mockUser(adminUserA);
    const result = await getServiceUsers();

    // 4 users in companyA: adminUserA, serviceUserA, noPermsUserA, managerUserA
    expect(result).toHaveLength(4);
    for (const u of result) {
      expect(Object.keys(u).sort()).toEqual(["id", "name"]);
    }
  });

  it("response contract: no email, passwordHash, companyId leaked", async () => {
    mockUser(adminUserA);
    const result = await getServiceUsers();

    for (const u of result) {
      expect(u).not.toHaveProperty("email");
      expect(u).not.toHaveProperty("passwordHash");
      expect(u).not.toHaveProperty("companyId");
      expect(u).not.toHaveProperty("role");
      expect(u).not.toHaveProperty("permissions");
    }
  });

  it("ordered by name asc", async () => {
    mockUser(adminUserA);
    const result = await getServiceUsers();
    const names = result.map((u: any) => u.name);
    const sorted = [...names].sort((a: string, b: string) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });

  it("company isolation", async () => {
    mockUser(adminUserA);
    const result = await getServiceUsers();
    const ids = result.map((u: any) => u.id);
    expect(ids).not.toContain(adminUserB.id);
  });

  it("null user → empty array", async () => {
    mockUser(null);
    const result = await getServiceUsers();
    expect(result).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Full lifecycle
// ═════════════════════════════════════════════════════════════════════════════

describe("Full lifecycle", () => {
  it("create → getTickets → getDetails → addComment → updateTicket → deleteComment → deleteTicket → verify all cleaned", async () => {
    mockUser(adminUserA);

    // Create
    const ticket = await createTicket({
      title: "קריאת שירות מלאה",
      status: "OPEN",
      priority: "HIGH",
      type: "SERVICE",
      assigneeId: serviceUserA.id,
    });
    expect(ticket.id).toBeDefined();

    // getTickets
    const list = await getTickets();
    expect(list.items).toHaveLength(1);
    expect(list.items[0].title).toBe("קריאת שירות מלאה");

    // getTicketDetails
    const detail1 = await getTicketDetails(ticket.id);
    expect(detail1).not.toBeNull();
    expect(detail1!.title).toBe("קריאת שירות מלאה");
    expect(detail1!.comments).toHaveLength(0);

    // addComment
    const comment = await addTicketComment(ticket.id, "הערה למעקב", false);
    expect(comment.id).toBeDefined();

    // getDetails again — comment visible
    const detail2 = await getTicketDetails(ticket.id);
    expect(detail2!.comments).toHaveLength(1);
    expect(detail2!.comments[0].content).toBe("הערה למעקב");

    // updateTicket
    const updated = await updateTicket(ticket.id, { status: "IN_PROGRESS", title: "קריאה מעודכנת" });
    expect(updated.status).toBe("IN_PROGRESS");
    expect(updated.title).toBe("קריאה מעודכנת");

    // deleteComment
    await deleteTicketComment(comment.id);
    const detail3 = await getTicketDetails(ticket.id);
    expect(detail3!.comments).toHaveLength(0);

    // deleteTicket
    await deleteTicket(ticket.id);

    // Verify cleaned
    const finalList = await getTickets();
    expect(finalList.items).toHaveLength(0);

    const dbRow = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    expect(dbRow).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Tenant isolation
// ═════════════════════════════════════════════════════════════════════════════

describe("Tenant isolation", () => {
  it("company A data invisible to company B across all operations", async () => {
    mockUser(adminUserA);
    const ticket = await createTicket({ ...VALID_CREATE, title: "סודי של חברה א" });
    await addTicketComment(ticket.id, "הערה סודית");

    mockUser(adminUserB);

    const tickets = await getTickets();
    expect(tickets.items).toHaveLength(0);

    const detail = await getTicketDetails(ticket.id);
    expect(detail).toBeNull();

    const stats = await getTicketStats();
    expect(stats.open).toBe(0);

    const users = await getServiceUsers();
    const ids = users.map((u: any) => u.id);
    expect(ids).not.toContain(adminUserA.id);
  });

  it("cross-company mutation attempts all fail", async () => {
    mockUser(adminUserA);
    const ticket = await createTicket(VALID_CREATE);
    const comment = await addTicketComment(ticket.id, "הערה של חברה א");

    mockUser(adminUserB);

    await expect(updateTicket(ticket.id, { title: "ניסיון חדירה" })).rejects.toThrow("Ticket not found");
    await expect(deleteTicket(ticket.id)).rejects.toThrow("Ticket not found");
    await expect(addTicketComment(ticket.id, "חדירה")).rejects.toThrow("Unauthorized");
    await expect(updateTicketComment(comment.id, "חדירה")).rejects.toThrow("Unauthorized");
    await expect(deleteTicketComment(comment.id)).rejects.toThrow("Unauthorized");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// DB constraints & cascades
// ═════════════════════════════════════════════════════════════════════════════

describe("DB constraints & cascades", () => {
  it("TicketComment cascade on ticket delete", async () => {
    const ticket = await seedTicket(companyA, adminUserA.id);
    const comment = await prisma.ticketComment.create({
      data: { ticketId: ticket.id, userId: adminUserA.id, content: "למחיקה בקסקייד" },
    });

    await prisma.ticket.delete({ where: { id: ticket.id } });

    const dbComment = await prisma.ticketComment.findUnique({ where: { id: comment.id } });
    expect(dbComment).toBeNull();
  });

  it("SlaBreach cascade on ticket delete", async () => {
    const ticket = await seedTicket(companyA, adminUserA.id);
    const breach = await prisma.slaBreach.create({
      data: {
        companyId: companyA,
        ticketId: ticket.id,
        priority: "HIGH",
        slaDueDate: new Date(),
      },
    });

    await prisma.ticket.delete({ where: { id: ticket.id } });

    const dbBreach = await prisma.slaBreach.findUnique({ where: { id: breach.id } });
    expect(dbBreach).toBeNull();
  });

  it("TicketActivityLog cascade on ticket delete", async () => {
    const ticket = await seedTicket(companyA, adminUserA.id);
    const log = await prisma.ticketActivityLog.create({
      data: {
        ticketId: ticket.id,
        userId: adminUserA.id,
        fieldName: "status",
        fieldLabel: "סטטוס",
      },
    });

    await prisma.ticket.delete({ where: { id: ticket.id } });

    const dbLog = await prisma.ticketActivityLog.findUnique({ where: { id: log.id } });
    expect(dbLog).toBeNull();
  });

  it("Client deletion → ticket.clientId set to null (SetNull)", async () => {
    const tempClient = await prisma.client.create({
      data: { companyId: companyA, name: "לקוח זמני" },
    });
    const ticket = await seedTicket(companyA, adminUserA.id, { clientId: tempClient.id });
    expect(ticket.clientId).toBe(tempClient.id);

    await prisma.client.delete({ where: { id: tempClient.id } });

    const dbTicket = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    expect(dbTicket!.clientId).toBeNull();
  });

  it("User (assignee) deletion → ticket.assigneeId set to null (SetNull)", async () => {
    const tempUser = await prisma.user.create({
      data: {
        companyId: companyA,
        name: "משתמש זמני",
        email: `temp-assignee-${suffix}@test.com`,
        passwordHash: "$unused$",
        role: "basic",
        permissions: { canViewServiceCalls: true },
        allowedWriteTableIds: [],
      },
    });
    const ticket = await seedTicket(companyA, adminUserA.id, { assigneeId: tempUser.id });
    expect(ticket.assigneeId).toBe(tempUser.id);

    await prisma.user.delete({ where: { id: tempUser.id } });

    const dbTicket = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    expect(dbTicket!.assigneeId).toBeNull();
  });

  it("User (creator) deletion BLOCKED by onDelete: Restrict", async () => {
    const tempCreator = await prisma.user.create({
      data: {
        companyId: companyA,
        name: "יוצר זמני",
        email: `temp-creator-${suffix}@test.com`,
        passwordHash: "$unused$",
        role: "basic",
        permissions: { canViewServiceCalls: true },
        allowedWriteTableIds: [],
      },
    });
    const ticket = await seedTicket(companyA, tempCreator.id, { title: "קריאה של יוצר" });

    // Attempt to delete creator — should be blocked by Restrict FK
    await expect(
      prisma.user.delete({ where: { id: tempCreator.id } }),
    ).rejects.toThrow();

    // Verify both still exist
    const dbUser = await prisma.user.findUnique({ where: { id: tempCreator.id } });
    expect(dbUser).not.toBeNull();
    const dbTicket = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    expect(dbTicket!.creatorId).toBe(tempCreator.id);

    // Cleanup: ticket first (FK), then user
    await prisma.ticket.delete({ where: { id: ticket.id } });
    await prisma.user.delete({ where: { id: tempCreator.id } });
  });

  it("SlaPolicy unique constraint: duplicate companyId+priority handled by upsert", async () => {
    mockUser(adminUserA);
    await updateSlaPolicy({ priority: "CRITICAL", responseTimeMinutes: 10, resolveTimeMinutes: 30 });
    await updateSlaPolicy({ priority: "CRITICAL", responseTimeMinutes: 20, resolveTimeMinutes: 60 });

    const policies = await prisma.slaPolicy.findMany({
      where: { companyId: companyA, priority: "CRITICAL" },
    });
    expect(policies).toHaveLength(1);
    expect(policies[0].responseTimeMinutes).toBe(20);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Edge cases
// ═════════════════════════════════════════════════════════════════════════════

describe("Edge cases", () => {
  it("Unicode/Hebrew in title, description, tags, comments", async () => {
    mockUser(adminUserA);
    const ticket = await createTicket({
      title: "קריאת שירות בדיקה",
      description: "תיאור מפורט בעברית עם סימנים מיוחדים",
      status: "OPEN",
      priority: "MEDIUM",
      type: "SERVICE",
      tags: ["תג-ראשון", "תג-שני"],
    });

    expect(ticket.title).toBe("קריאת שירות בדיקה");
    expect(ticket.description).toBe("תיאור מפורט בעברית עם סימנים מיוחדים");
    expect(ticket.tags).toEqual(["תג-ראשון", "תג-שני"]);

    // DB readback
    const dbRow = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    expect(dbRow!.title).toBe("קריאת שירות בדיקה");
    expect(dbRow!.tags).toEqual(["תג-ראשון", "תג-שני"]);

    const comment = await addTicketComment(ticket.id, "הערה בעברית");
    expect(comment.content).toBe("הערה בעברית");
  });

  it("empty tags array", async () => {
    mockUser(adminUserA);
    const ticket = await createTicket({ ...VALID_CREATE, tags: [] });
    expect(ticket.tags).toEqual([]);
  });

  it("SQL injection in string fields → harmless", async () => {
    mockUser(adminUserA);
    const malicious = "'; DROP TABLE \"Ticket\"; --";
    const ticket = await createTicket({ ...VALID_CREATE, title: malicious });
    expect(ticket.title).toBe(malicious);

    const dbRow = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    expect(dbRow!.title).toBe(malicious);
  });

  it("all enum values work for status", async () => {
    mockUser(adminUserA);
    for (const status of ["OPEN", "IN_PROGRESS", "WAITING", "RESOLVED", "CLOSED"]) {
      const t = await createTicket({ ...VALID_CREATE, status });
      expect(t.status).toBe(status);
    }
  });

  it("all enum values work for priority", async () => {
    mockUser(adminUserA);
    for (const priority of ["LOW", "MEDIUM", "HIGH", "CRITICAL"]) {
      const t = await createTicket({ ...VALID_CREATE, priority });
      expect(t.priority).toBe(priority);
    }
  });

  it("all enum values work for type", async () => {
    mockUser(adminUserA);
    for (const type of ["SERVICE", "COMPLAINT", "RETENTION", "OTHER"]) {
      const t = await createTicket({ ...VALID_CREATE, type });
      expect(t.type).toBe(type);
    }
  });

  it("createdAt/updatedAt auto-populated", async () => {
    mockUser(adminUserA);
    const before = new Date();
    const ticket = await createTicket(VALID_CREATE);

    expect(ticket.createdAt).toBeInstanceOf(Date);
    expect(ticket.updatedAt).toBeInstanceOf(Date);
    expect(new Date(ticket.createdAt).getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
    expect(new Date(ticket.createdAt).getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it("updatedAt changes after update", async () => {
    mockUser(adminUserA);
    const ticket = await createTicket(VALID_CREATE);
    const originalUpdatedAt = new Date(ticket.updatedAt).getTime();

    await new Promise((r) => setTimeout(r, 50));

    const updated = await updateTicket(ticket.id, { title: "בדיקת updatedAt" });
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(originalUpdatedAt);
  });

  it("DateTime serialization (slaDueDate, slaResponseDueDate)", async () => {
    mockUser(adminUserA);
    const slaDue = new Date("2030-06-15T12:00:00.000Z");
    const slaResp = new Date("2030-06-15T06:00:00.000Z");

    const ticket = await createTicket({
      ...VALID_CREATE,
      slaDueDate: slaDue,
      slaResponseDueDate: slaResp,
    });

    expect(new Date(ticket.slaDueDate!).toISOString()).toBe("2030-06-15T12:00:00.000Z");
    expect(new Date(ticket.slaResponseDueDate!).toISOString()).toBe("2030-06-15T06:00:00.000Z");
  });

  it("title at max boundary (500 chars)", async () => {
    mockUser(adminUserA);
    const longTitle = "א".repeat(500);
    const ticket = await createTicket({ ...VALID_CREATE, title: longTitle });
    expect(ticket.title).toBe(longTitle);

    const dbRow = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    expect(dbRow!.title).toBe(longTitle);
  });

  it("description at max boundary (10000 chars)", async () => {
    mockUser(adminUserA);
    const longDesc = "ב".repeat(10_000);
    const ticket = await createTicket({ ...VALID_CREATE, description: longDesc });
    expect(ticket.description).toBe(longDesc);

    const dbRow = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    expect(dbRow!.description).toBe(longDesc);
  });

  it("tags at max boundary (20 tags, each 100 chars)", async () => {
    mockUser(adminUserA);
    const tags = Array.from({ length: 20 }, (_, i) => `${"א".repeat(97)}${String(i).padStart(3, "0")}`);
    const ticket = await createTicket({ ...VALID_CREATE, tags });
    expect(ticket.tags).toEqual(tags);

    const dbRow = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    expect(dbRow!.tags).toEqual(tags);
  });

  it("comment at max boundary (5000 chars)", async () => {
    mockUser(adminUserA);
    const ticket = await seedTicket(companyA, adminUserA.id);
    const expected = "ג".repeat(5000);
    const comment = await addTicketComment(ticket.id, expected);
    expect(comment.content).toBe(expected);

    const dbRow = await prisma.ticketComment.findUnique({ where: { id: comment.id } });
    expect(dbRow!.content).toBe(expected);
  });
});

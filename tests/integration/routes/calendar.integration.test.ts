import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";

// ── MOCK (infrastructure only) ──────────────────────────────────────────────
vi.mock("@/lib/permissions-server", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(),
  checkActionRateLimit: vi.fn(),
  RATE_LIMITS: {
    calendarRead: { prefix: "cal-read", max: 60, windowSeconds: 60 },
    calendarMutation: { prefix: "cal-mut", max: 30, windowSeconds: 60 },
    webhook: { prefix: "webhook", max: 60, windowSeconds: 60 },
  },
}));

vi.mock("@/lib/make-auth", () => ({
  validateMakeApiKey: vi.fn(),
}));

vi.mock("@/lib/webhook-auth", () => ({
  checkIdempotencyKey: vi.fn(),
  setIdempotencyResult: vi.fn(),
}));

// ── REAL: prisma, permissions, calendar-validation, calendar-helpers, actions ─

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { checkRateLimit, checkActionRateLimit } from "@/lib/rate-limit";
import { validateMakeApiKey } from "@/lib/make-auth";
import { checkIdempotencyKey, setIdempotencyResult } from "@/lib/webhook-auth";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { GET, POST } from "@/app/api/calendar/route";
import { PUT, DELETE } from "@/app/api/calendar/[id]/route";
import { POST as WEBHOOK_POST } from "@/app/api/make/calendar/route";

// ── Helpers ─────────────────────────────────────────────────────────────────

function validEventBody(overrides?: Record<string, unknown>) {
  return {
    title: "Quarterly Planning Meeting",
    startTime: "2026-03-01T10:00:00Z",
    endTime: "2026-03-01T11:00:00Z",
    ...overrides,
  };
}

function validWebhookBody(overrides?: Record<string, unknown>) {
  return {
    title: "Client Onboarding - Acme Corp",
    start_time: "2026-03-01T10:00:00Z",
    end_time: "2026-03-01T11:00:00Z",
    ...overrides,
  };
}

function makeGetRequest(params?: Record<string, string>) {
  const url = new URL("http://localhost:3000/api/calendar");
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }
  return new Request(url.toString(), { method: "GET" });
}

function makePostRequest(body: unknown) {
  return new Request("http://localhost:3000/api/calendar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makePutRequest(id: string, body: unknown) {
  return new Request("http://localhost:3000/api/calendar/" + id, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDeleteRequest(id: string) {
  return new Request("http://localhost:3000/api/calendar/" + id, { method: "DELETE" });
}

function makeWebhookRequest(body: unknown) {
  return new Request("http://localhost:3000/api/make/calendar", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": "test-key",
    },
    body: JSON.stringify(body),
  });
}

function buildParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

/**
 * Assert that an event response object has exactly the expected shape
 * and does NOT leak internal fields.
 */
function expectEventShape(obj: Record<string, unknown>) {
  expect(Object.keys(obj).sort()).toEqual(
    ["color", "description", "endTime", "id", "startTime", "title"]
  );
}

async function seedEvent(companyId: number, overrides?: Record<string, unknown>) {
  return prisma.calendarEvent.create({
    data: {
      companyId,
      title: "Team Standup",
      startTime: new Date("2026-03-01T10:00:00Z"),
      endTime: new Date("2026-03-01T11:00:00Z"),
      color: "#4285F4",
      ...overrides,
    },
  });
}

async function seedGlobalRule(companyId: number, overrides?: Record<string, unknown>) {
  return prisma.automationRule.create({
    data: {
      companyId,
      name: "Pre-event Reminder",
      triggerType: "EVENT_TIME",
      actionType: "SEND_NOTIFICATION",
      calendarEventId: null,
      isActive: true,
      createdBy: null,
      triggerConfig: {},
      actionConfig: { message: "test" },
      ...overrides,
    },
  });
}

function mockUserForCompany(compId: number, overrides?: Record<string, unknown>) {
  vi.mocked(getCurrentUser).mockResolvedValue({
    id: 1,
    companyId: compId,
    name: "Test Admin",
    email: "admin@test.com",
    role: "admin",
    allowedWriteTableIds: [],
    permissions: {},
    ...overrides,
  } as any);
}

// ── State ───────────────────────────────────────────────────────────────────
let companyId: number;
let companyId2: number;
const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// ── Setup / Teardown ────────────────────────────────────────────────────────

beforeAll(async () => {
  const coA = await prisma.company.create({
    data: { name: "Test Co A", slug: `test-co-a-${suffix}` },
  });
  companyId = coA.id;

  const coB = await prisma.company.create({
    data: { name: "Test Co B", slug: `test-co-b-${suffix}` },
  });
  companyId2 = coB.id;
});

beforeEach(async () => {
  vi.clearAllMocks();

  // Clean DB (FK-safe order) — guard against undefined if beforeAll failed
  const ids = [companyId, companyId2].filter(Boolean);
  if (ids.length > 0) {
    await prisma.automationRule.deleteMany({ where: { companyId: { in: ids } } });
    await prisma.calendarEvent.deleteMany({ where: { companyId: { in: ids } } });
  }

  // Default mocks
  mockUserForCompany(companyId);
  vi.mocked(checkRateLimit).mockResolvedValue(null as any);
  vi.mocked(checkActionRateLimit).mockResolvedValue(false as any);
  vi.mocked(validateMakeApiKey).mockResolvedValue({
    success: true,
    keyRecord: { companyId, isActive: true, createdBy: 1 },
  } as any);
  vi.mocked(checkIdempotencyKey).mockResolvedValue({ key: null, cachedResponse: null });
});

afterAll(async () => {
  // Cascading delete cleans CalendarEvent + AutomationRule — guard against undefined
  const ids = [companyId, companyId2].filter(Boolean);
  if (ids.length > 0) {
    await prisma.company.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.$disconnect();
});

// ═════════════════════════════════════════════════════════════════════════════
// GET /api/calendar
// ═════════════════════════════════════════════════════════════════════════════

describe("GET /api/calendar", () => {
  it("returns empty array when no events exist", async () => {
    const res = await GET(makeGetRequest());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual([]);
  });

  it("returns seeded events for the authenticated user's company", async () => {
    await seedEvent(companyId, { title: "Sprint Review" });
    await seedEvent(companyId, { title: "Design Sync" });
    await seedEvent(companyId, { title: "Retrospective" });

    const res = await GET(makeGetRequest());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toHaveLength(3);
    for (const ev of body) {
      expectEventShape(ev);
    }
  });

  it("filters events by rangeStart and rangeEnd (overlap query)", async () => {
    await seedEvent(companyId, {
      title: "Jan",
      startTime: new Date("2026-01-10T10:00:00Z"),
      endTime: new Date("2026-01-10T11:00:00Z"),
    });
    await seedEvent(companyId, {
      title: "Feb",
      startTime: new Date("2026-02-10T10:00:00Z"),
      endTime: new Date("2026-02-10T11:00:00Z"),
    });
    await seedEvent(companyId, {
      title: "Mar",
      startTime: new Date("2026-03-10T10:00:00Z"),
      endTime: new Date("2026-03-10T11:00:00Z"),
    });

    const res = await GET(
      makeGetRequest({ rangeStart: "2026-01-15", rangeEnd: "2026-02-15" }),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].title).toBe("Feb");
  });

  it("returns events ordered by startTime ascending", async () => {
    await seedEvent(companyId, {
      title: "C",
      startTime: new Date("2026-03-03T10:00:00Z"),
      endTime: new Date("2026-03-03T11:00:00Z"),
    });
    await seedEvent(companyId, {
      title: "A",
      startTime: new Date("2026-03-01T10:00:00Z"),
      endTime: new Date("2026-03-01T11:00:00Z"),
    });
    await seedEvent(companyId, {
      title: "B",
      startTime: new Date("2026-03-02T10:00:00Z"),
      endTime: new Date("2026-03-02T11:00:00Z"),
    });

    const res = await GET(makeGetRequest());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.map((e: any) => e.title)).toEqual(["A", "B", "C"]);
  });

  it("does not return events from another company", async () => {
    await seedEvent(companyId, { title: "Mine" });
    await seedEvent(companyId2, { title: "Theirs" });

    const res = await GET(makeGetRequest());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].title).toBe("Mine");
  });

  it("returns 400 for invalid rangeStart date", async () => {
    const res = await GET(makeGetRequest({ rangeStart: "not-a-date", rangeEnd: "2026-03-01" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("rangeStart");
  });

  it("returns 400 for invalid rangeEnd date", async () => {
    const res = await GET(makeGetRequest({ rangeStart: "2026-01-01", rangeEnd: "not-a-date" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("rangeEnd");
  });

  it("returns 400 for date range exceeding 1 year", async () => {
    const res = await GET(
      makeGetRequest({ rangeStart: "2025-01-01", rangeEnd: "2026-02-01" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("1 year");
  });

  it("returns 500 when DB throws", async () => {
    const spy = vi.spyOn(prisma.calendarEvent, "findMany").mockRejectedValueOnce(new Error("DB down"));

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("Failed to fetch");

    spy.mockRestore();
  });

  it("returns 401 for unauthenticated user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null as any);

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain("Unauthorized");
  });

  it("returns 403 for basic user without canViewCalendar", async () => {
    mockUserForCompany(companyId, { role: "basic", permissions: {} });

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("Forbidden");
  });

  it("allows basic user with canViewCalendar permission", async () => {
    await seedEvent(companyId, { title: "Permitted Event" });
    mockUserForCompany(companyId, {
      role: "basic",
      permissions: { canViewCalendar: true },
    });

    const res = await GET(makeGetRequest());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].title).toBe("Permitted Event");
  });

  it("returns all events when only rangeStart is provided", async () => {
    await seedEvent(companyId, {
      title: "Jan",
      startTime: new Date("2026-01-10T10:00:00Z"),
      endTime: new Date("2026-01-10T11:00:00Z"),
    });
    await seedEvent(companyId, {
      title: "Mar",
      startTime: new Date("2026-03-10T10:00:00Z"),
      endTime: new Date("2026-03-10T11:00:00Z"),
    });

    const res = await GET(makeGetRequest({ rangeStart: "2026-02-01" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    // rangeStart without rangeEnd → no filter applied, returns all events
    expect(body).toHaveLength(2);
    expect(body.map((e: any) => e.title)).toEqual(["Jan", "Mar"]);
  });

  it("response objects exclude companyId, createdAt, and updatedAt", async () => {
    await seedEvent(companyId, { title: "Shape Check" });

    const res = await GET(makeGetRequest());
    const body = await res.json();
    expect(body).toHaveLength(1);
    expectEventShape(body[0]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/calendar
// ═════════════════════════════════════════════════════════════════════════════

describe("POST /api/calendar", () => {
  it("creates event and returns it", async () => {
    const res = await POST(makePostRequest(validEventBody()));
    const body = await res.json();
    expect(res.status).toBe(200);
    expectEventShape(body);
    expect(body.title).toBe("Quarterly Planning Meeting");

    const dbEvent = await prisma.calendarEvent.findUnique({ where: { id: body.id } });
    expect(dbEvent).not.toBeNull();
    expect(dbEvent!.title).toBe("Quarterly Planning Meeting");
    expect(dbEvent!.startTime.toISOString()).toBe("2026-03-01T10:00:00.000Z");
    expect(dbEvent!.endTime.toISOString()).toBe("2026-03-01T11:00:00.000Z");
    expect(dbEvent!.companyId).toBe(companyId);

    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith("/calendar");
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith("/");
  });

  it("stores correct companyId from authenticated user", async () => {
    const res = await POST(makePostRequest(validEventBody()));
    const body = await res.json();
    expect(res.status).toBe(200);

    const dbEvent = await prisma.calendarEvent.findUnique({ where: { id: body.id } });
    expect(dbEvent!.companyId).toBe(companyId);
  });

  it("trims title before storing", async () => {
    const res = await POST(makePostRequest(validEventBody({ title: "  My Event  " })));
    const body = await res.json();
    expect(res.status).toBe(200);

    const dbEvent = await prisma.calendarEvent.findUnique({ where: { id: body.id } });
    expect(dbEvent!.title).toBe("My Event");
  });

  it("stores optional description and color", async () => {
    const res = await POST(
      makePostRequest(validEventBody({ description: "A note", color: "#EA4335" })),
    );
    const body = await res.json();
    expect(res.status).toBe(200);

    const dbEvent = await prisma.calendarEvent.findUnique({ where: { id: body.id } });
    expect(dbEvent!.description).toBe("A note");
    expect(dbEvent!.color).toBe("#EA4335");
  });

  it("returns 400 for missing title", async () => {
    const res = await POST(
      makePostRequest({ startTime: "2026-03-01T10:00:00Z", endTime: "2026-03-01T11:00:00Z" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("required");

    const count = await prisma.calendarEvent.count({ where: { companyId } });
    expect(count).toBe(0);
  });

  it("returns 400 when startTime and endTime are missing", async () => {
    const res = await POST(makePostRequest({ title: "No Dates Event" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("required");

    const count = await prisma.calendarEvent.count({ where: { companyId } });
    expect(count).toBe(0);
  });

  it("returns 400 for whitespace-only title", async () => {
    const res = await POST(makePostRequest(validEventBody({ title: "   " })));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("empty");

    const count = await prisma.calendarEvent.count({ where: { companyId } });
    expect(count).toBe(0);
  });

  it("returns 400 for title exceeding 200 chars", async () => {
    const res = await POST(makePostRequest(validEventBody({ title: "x".repeat(201) })));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("200");

    const count = await prisma.calendarEvent.count({ where: { companyId } });
    expect(count).toBe(0);
  });

  it("accepts title at exactly 200 chars", async () => {
    const title = "x".repeat(200);
    const res = await POST(makePostRequest(validEventBody({ title })));
    expect(res.status).toBe(200);
    const body = await res.json();

    const dbEvent = await prisma.calendarEvent.findUnique({ where: { id: body.id } });
    expect(dbEvent!.title).toBe(title);
  });

  it("returns 400 for description exceeding 2000 chars", async () => {
    const res = await POST(
      makePostRequest(validEventBody({ description: "x".repeat(2001) })),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("2000");

    const count = await prisma.calendarEvent.count({ where: { companyId } });
    expect(count).toBe(0);
  });

  it("returns 400 for endTime before/equal to startTime", async () => {
    const res = await POST(
      makePostRequest(
        validEventBody({
          startTime: "2026-03-01T11:00:00Z",
          endTime: "2026-03-01T10:00:00Z",
        }),
      ),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("after");

    const count = await prisma.calendarEvent.count({ where: { companyId } });
    expect(count).toBe(0);
  });

  it("returns 400 for invalid color value", async () => {
    const res = await POST(makePostRequest(validEventBody({ color: "rainbow" })));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("color");

    const count = await prisma.calendarEvent.count({ where: { companyId } });
    expect(count).toBe(0);
  });

  it("stores null color when color is omitted", async () => {
    const res = await POST(makePostRequest(validEventBody()));
    const body = await res.json();
    expect(res.status).toBe(200);

    const dbEvent = await prisma.calendarEvent.findUnique({ where: { id: body.id } });
    expect(dbEvent!.color).toBeNull();
  });

  it("sets createdAt automatically", async () => {
    const before = new Date();
    const res = await POST(makePostRequest(validEventBody({ title: "Auto Timestamp" })));
    const body = await res.json();
    const after = new Date();

    const dbEvent = await prisma.calendarEvent.findUnique({ where: { id: body.id } });
    expect(dbEvent!.createdAt).toBeInstanceOf(Date);
    expect(dbEvent!.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
    expect(dbEvent!.createdAt.getTime()).toBeLessThanOrEqual(after.getTime() + 1000);
  });

  it("response excludes companyId, createdAt, and updatedAt", async () => {
    const res = await POST(makePostRequest(validEventBody()));
    const body = await res.json();
    expect(res.status).toBe(200);
    expectEventShape(body);
  });

  it("returns 403 for basic user without canViewCalendar", async () => {
    mockUserForCompany(companyId, { role: "basic", permissions: {} });

    const res = await POST(makePostRequest(validEventBody()));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("Forbidden");
  });

  it("returns 401 for unauthenticated user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null as any);

    const res = await POST(makePostRequest(validEventBody()));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain("Unauthorized");

    const count = await prisma.calendarEvent.count({ where: { companyId } });
    expect(count).toBe(0);
  });

  it("returns 400 for startTime year before 1970", async () => {
    const res = await POST(
      makePostRequest(validEventBody({
        startTime: "1969-06-15T10:00:00Z",
        endTime: "1969-06-15T11:00:00Z",
      })),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("1970");

    const count = await prisma.calendarEvent.count({ where: { companyId } });
    expect(count).toBe(0);
  });

  it("returns 400 for endTime year after 2200", async () => {
    const res = await POST(
      makePostRequest(validEventBody({
        startTime: "2026-03-01T10:00:00Z",
        endTime: "2201-01-01T11:00:00Z",
      })),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("2200");

    const count = await prisma.calendarEvent.count({ where: { companyId } });
    expect(count).toBe(0);
  });

  it("returns 400 for startTime year after 2200", async () => {
    const res = await POST(
      makePostRequest(validEventBody({
        startTime: "2201-03-01T10:00:00Z",
        endTime: "2201-03-01T11:00:00Z",
      })),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("2200");

    const count = await prisma.calendarEvent.count({ where: { companyId } });
    expect(count).toBe(0);
  });

  it("returns 400 for endTime year before 1970", async () => {
    const res = await POST(
      makePostRequest(validEventBody({
        startTime: "2026-03-01T10:00:00Z",
        endTime: "1969-03-01T11:00:00Z",
      })),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("1970");

    const count = await prisma.calendarEvent.count({ where: { companyId } });
    expect(count).toBe(0);
  });

  it("returns 400 when event limit is reached", async () => {
    const countSpy = vi
      .spyOn(prisma.calendarEvent, "count")
      .mockResolvedValueOnce(10_000);

    const res = await POST(makePostRequest(validEventBody()));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("limit");

    countSpy.mockRestore();
  });

  it("copies global automation rules to new event in transaction", async () => {
    await seedGlobalRule(companyId, { name: "Rule A", actionConfig: { msg: "a" } });
    await seedGlobalRule(companyId, { name: "Rule B", actionConfig: { msg: "b" } });

    const res = await POST(makePostRequest(validEventBody()));
    const body = await res.json();
    expect(res.status).toBe(200);

    const copiedRules = await prisma.automationRule.findMany({
      where: { calendarEventId: body.id },
    });
    expect(copiedRules).toHaveLength(2);
    expect(copiedRules.map((r) => r.name).sort()).toEqual(["Rule A", "Rule B"]);
  });

  it("does NOT copy inactive global rules", async () => {
    await seedGlobalRule(companyId, { name: "Active", isActive: true });
    await seedGlobalRule(companyId, { name: "Inactive", isActive: false });

    const res = await POST(makePostRequest(validEventBody()));
    const body = await res.json();
    expect(res.status).toBe(200);

    const copiedRules = await prisma.automationRule.findMany({
      where: { calendarEventId: body.id },
    });
    expect(copiedRules).toHaveLength(1);
    expect(copiedRules[0].name).toBe("Active");
  });

  it("does NOT copy event-specific (non-global) rules", async () => {
    const otherEvent = await seedEvent(companyId, { title: "Other" });
    await seedGlobalRule(companyId, { calendarEventId: otherEvent.id, name: "Event-Specific" });

    const res = await POST(makePostRequest(validEventBody()));
    const body = await res.json();
    expect(res.status).toBe(200);

    const copiedRules = await prisma.automationRule.findMany({
      where: { calendarEventId: body.id },
    });
    expect(copiedRules).toHaveLength(0);
  });

  it("returns 500 on unexpected error", async () => {
    vi.mocked(getCurrentUser).mockRejectedValueOnce(new Error("unexpected"));

    const res = await POST(makePostRequest(validEventBody()));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("Failed to create");

    const count = await prisma.calendarEvent.count({ where: { companyId } });
    expect(count).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// PUT /api/calendar/[id]
// ═════════════════════════════════════════════════════════════════════════════

describe("PUT /api/calendar/[id]", () => {
  it("updates title in DB", async () => {
    const ev = await seedEvent(companyId, { title: "Old Title" });

    const res = await PUT(makePutRequest(ev.id, { title: "New Title" }), buildParams(ev.id));
    expect(res.status).toBe(200);

    const dbEvent = await prisma.calendarEvent.findUnique({ where: { id: ev.id } });
    expect(dbEvent!.title).toBe("New Title");

    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith("/calendar");
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith("/");
  });

  it("updates description", async () => {
    const ev = await seedEvent(companyId, { description: "Old desc" });

    const res = await PUT(makePutRequest(ev.id, { description: "New desc" }), buildParams(ev.id));
    expect(res.status).toBe(200);

    const dbEvent = await prisma.calendarEvent.findUnique({ where: { id: ev.id } });
    expect(dbEvent!.description).toBe("New desc");
  });

  it("updates startTime and endTime together", async () => {
    const ev = await seedEvent(companyId);
    const newStart = "2026-04-01T09:00:00Z";
    const newEnd = "2026-04-01T10:00:00Z";

    const res = await PUT(
      makePutRequest(ev.id, { startTime: newStart, endTime: newEnd }),
      buildParams(ev.id),
    );
    expect(res.status).toBe(200);

    const dbEvent = await prisma.calendarEvent.findUnique({ where: { id: ev.id } });
    expect(dbEvent!.startTime.toISOString()).toBe(newStart);
    expect(dbEvent!.endTime.toISOString()).toBe(newEnd);
  });

  it("updates color", async () => {
    const ev = await seedEvent(companyId, { color: "#4285F4" });

    const res = await PUT(makePutRequest(ev.id, { color: "#EA4335" }), buildParams(ev.id));
    expect(res.status).toBe(200);

    const dbEvent = await prisma.calendarEvent.findUnique({ where: { id: ev.id } });
    expect(dbEvent!.color).toBe("#EA4335");
  });

  it("returns 400 when providing startTime without endTime", async () => {
    const ev = await seedEvent(companyId);

    const res = await PUT(
      makePutRequest(ev.id, { startTime: "2026-04-01T09:00:00Z" }),
      buildParams(ev.id),
    );
    expect(res.status).toBe(400);

    // DB unchanged
    const dbEvent = await prisma.calendarEvent.findUnique({ where: { id: ev.id } });
    expect(dbEvent!.startTime.toISOString()).toBe("2026-03-01T10:00:00.000Z");
  });

  it("returns 400 when providing endTime without startTime", async () => {
    const ev = await seedEvent(companyId);

    const res = await PUT(
      makePutRequest(ev.id, { endTime: "2026-04-01T10:00:00Z" }),
      buildParams(ev.id),
    );
    expect(res.status).toBe(400);

    const dbEvent = await prisma.calendarEvent.findUnique({ where: { id: ev.id } });
    expect(dbEvent!.endTime.toISOString()).toBe("2026-03-01T11:00:00.000Z");
  });

  it("returns 404 for non-existent event ID (P2025 mapped)", async () => {
    const res = await PUT(
      makePutRequest("nonexistentid123", { title: "Updated" }),
      buildParams("nonexistentid123"),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("not found");
  });

  it("returns 404 when updating event from another company", async () => {
    const ev = await seedEvent(companyId2, { title: "Co B Event" });

    // Authenticated as Co A
    const res = await PUT(makePutRequest(ev.id, { title: "Hacked" }), buildParams(ev.id));
    expect(res.status).toBe(404);

    const dbEvent = await prisma.calendarEvent.findUnique({ where: { id: ev.id } });
    expect(dbEvent!.title).toBe("Co B Event");
  });

  it("returns 400 for invalid event ID (empty or >30 chars)", async () => {
    const res1 = await PUT(makePutRequest("", { title: "Updated" }), buildParams(""));
    expect(res1.status).toBe(400);
    const body1 = await res1.json();
    expect(body1.error).toContain("Invalid");

    const res2 = await PUT(
      makePutRequest("x".repeat(31), { title: "Updated" }),
      buildParams("x".repeat(31)),
    );
    expect(res2.status).toBe(400);
  });

  it("preserves untouched fields on partial update", async () => {
    const ev = await seedEvent(companyId, {
      title: "Original",
      description: "Keep this",
      color: "#34A853",
    });

    const res = await PUT(makePutRequest(ev.id, { title: "Changed" }), buildParams(ev.id));
    expect(res.status).toBe(200);

    const dbEvent = await prisma.calendarEvent.findUnique({ where: { id: ev.id } });
    expect(dbEvent!.title).toBe("Changed");
    expect(dbEvent!.description).toBe("Keep this");
    expect(dbEvent!.color).toBe("#34A853");
  });

  it("returns 403 for basic user without canViewCalendar", async () => {
    const ev = await seedEvent(companyId);
    mockUserForCompany(companyId, { role: "basic", permissions: {} });

    const res = await PUT(makePutRequest(ev.id, { title: "Blocked" }), buildParams(ev.id));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("Forbidden");

    const dbEvent = await prisma.calendarEvent.findUnique({ where: { id: ev.id } });
    expect(dbEvent!.title).toBe("Team Standup");
  });

  it("returns 401 for unauthenticated user", async () => {
    const ev = await seedEvent(companyId);
    vi.mocked(getCurrentUser).mockResolvedValue(null as any);

    const res = await PUT(makePutRequest(ev.id, { title: "Hacked" }), buildParams(ev.id));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain("Unauthorized");

    const dbEvent = await prisma.calendarEvent.findUnique({ where: { id: ev.id } });
    expect(dbEvent!.title).toBe("Team Standup");
  });

  it("updates @updatedAt timestamp", async () => {
    const ev = await seedEvent(companyId);
    const beforeUpdate = await prisma.calendarEvent.findUnique({ where: { id: ev.id } });
    const oldUpdatedAt = beforeUpdate!.updatedAt;

    const res = await PUT(
      makePutRequest(ev.id, { title: "Trigger updatedAt" }),
      buildParams(ev.id),
    );
    expect(res.status).toBe(200);

    const afterUpdate = await prisma.calendarEvent.findUnique({ where: { id: ev.id } });
    expect(afterUpdate!.updatedAt.getTime()).toBeGreaterThan(oldUpdatedAt.getTime());
  });

  it("response excludes companyId, createdAt, and updatedAt", async () => {
    const ev = await seedEvent(companyId);

    const res = await PUT(makePutRequest(ev.id, { title: "Shape Check" }), buildParams(ev.id));
    const body = await res.json();
    expect(res.status).toBe(200);
    expectEventShape(body);
  });

  it("returns 500 on unexpected error", async () => {
    vi.mocked(getCurrentUser).mockRejectedValueOnce(new Error("unexpected"));
    const ev = await seedEvent(companyId);

    const res = await PUT(makePutRequest(ev.id, { title: "Updated" }), buildParams(ev.id));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("Failed to update");

    const dbEvent = await prisma.calendarEvent.findUnique({ where: { id: ev.id } });
    expect(dbEvent!.title).toBe("Team Standup");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// DELETE /api/calendar/[id]
// ═════════════════════════════════════════════════════════════════════════════

describe("DELETE /api/calendar/[id]", () => {
  it("deletes event from DB", async () => {
    const ev = await seedEvent(companyId);

    const res = await DELETE(makeDeleteRequest(ev.id), buildParams(ev.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    const dbEvent = await prisma.calendarEvent.findUnique({ where: { id: ev.id } });
    expect(dbEvent).toBeNull();

    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith("/calendar");
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith("/");
  });

  it("returns 404 for non-existent event ID (P2025)", async () => {
    const res = await DELETE(makeDeleteRequest("nonexistentid123"), buildParams("nonexistentid123"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("not found");
  });

  it("returns 404 when deleting event from another company", async () => {
    const ev = await seedEvent(companyId2, { title: "Co B Event" });

    const res = await DELETE(makeDeleteRequest(ev.id), buildParams(ev.id));
    expect(res.status).toBe(404);

    const dbEvent = await prisma.calendarEvent.findUnique({ where: { id: ev.id } });
    expect(dbEvent).not.toBeNull();
  });

  it("cascade-deletes automation rules when event deleted", async () => {
    const ev = await seedEvent(companyId);
    await prisma.automationRule.createMany({
      data: [
        {
          companyId,
          name: "R1",
          triggerType: "EVENT_TIME",
          actionType: "SEND_NOTIFICATION",
          calendarEventId: ev.id,
          isActive: true,
        },
        {
          companyId,
          name: "R2",
          triggerType: "EVENT_TIME",
          actionType: "SEND_NOTIFICATION",
          calendarEventId: ev.id,
          isActive: true,
        },
      ],
    });

    const res = await DELETE(makeDeleteRequest(ev.id), buildParams(ev.id));
    expect(res.status).toBe(200);

    const rules = await prisma.automationRule.findMany({
      where: { calendarEventId: ev.id },
    });
    expect(rules).toHaveLength(0);
  });

  it("returns 403 for basic user without canViewCalendar", async () => {
    const ev = await seedEvent(companyId);
    mockUserForCompany(companyId, { role: "basic", permissions: {} });

    const res = await DELETE(makeDeleteRequest(ev.id), buildParams(ev.id));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("Forbidden");

    const dbEvent = await prisma.calendarEvent.findUnique({ where: { id: ev.id } });
    expect(dbEvent).not.toBeNull();
  });

  it("returns 401 for unauthenticated user", async () => {
    const ev = await seedEvent(companyId);
    vi.mocked(getCurrentUser).mockResolvedValue(null as any);

    const res = await DELETE(makeDeleteRequest(ev.id), buildParams(ev.id));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain("Unauthorized");

    const dbEvent = await prisma.calendarEvent.findUnique({ where: { id: ev.id } });
    expect(dbEvent).not.toBeNull();
  });

  it("returns 400 for invalid event ID (empty or >30 chars)", async () => {
    const res1 = await DELETE(makeDeleteRequest(""), buildParams(""));
    expect(res1.status).toBe(400);
    const body1 = await res1.json();
    expect(body1.error).toContain("Invalid");

    const res2 = await DELETE(makeDeleteRequest("x".repeat(31)), buildParams("x".repeat(31)));
    expect(res2.status).toBe(400);
  });

  it("returns 500 on unexpected error", async () => {
    vi.mocked(getCurrentUser).mockRejectedValueOnce(new Error("unexpected"));
    const ev = await seedEvent(companyId);

    const res = await DELETE(makeDeleteRequest(ev.id), buildParams(ev.id));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("Failed to delete");

    const dbEvent = await prisma.calendarEvent.findUnique({ where: { id: ev.id } });
    expect(dbEvent).not.toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/make/calendar — webhook
// ═════════════════════════════════════════════════════════════════════════════

describe("POST /api/make/calendar — webhook", () => {
  it("creates event with valid payload", async () => {
    const res = await WEBHOOK_POST(makeWebhookRequest(validWebhookBody()));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.event).toHaveProperty("id");
    expectEventShape(body.event);

    const dbEvent = await prisma.calendarEvent.findUnique({ where: { id: body.event.id } });
    expect(dbEvent).not.toBeNull();
    expect(dbEvent!.companyId).toBe(companyId);
  });

  it("defaults color to 'blue' when not provided", async () => {
    const res = await WEBHOOK_POST(makeWebhookRequest(validWebhookBody()));
    const body = await res.json();
    expect(res.status).toBe(200);

    const dbEvent = await prisma.calendarEvent.findUnique({ where: { id: body.event.id } });
    expect(dbEvent!.color).toBe("blue");
  });

  it("stores valid hex color in DB", async () => {
    const res = await WEBHOOK_POST(
      makeWebhookRequest(validWebhookBody({ color: "#FF5733" })),
    );
    const body = await res.json();
    expect(res.status).toBe(200);

    const dbEvent = await prisma.calendarEvent.findUnique({ where: { id: body.event.id } });
    expect(dbEvent!.color).toBe("#FF5733");
  });

  it("stores null description when empty string provided", async () => {
    const res = await WEBHOOK_POST(
      makeWebhookRequest(validWebhookBody({ description: "" })),
    );
    const body = await res.json();
    expect(res.status).toBe(200);

    const dbEvent = await prisma.calendarEvent.findUnique({ where: { id: body.event.id } });
    expect(dbEvent!.description).toBeNull();
  });

  it("returns 400 for missing title", async () => {
    const res = await WEBHOOK_POST(
      makeWebhookRequest({ start_time: "2026-03-01T10:00:00Z", end_time: "2026-03-01T11:00:00Z" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("title");

    const count = await prisma.calendarEvent.count({ where: { companyId } });
    expect(count).toBe(0);
  });

  it("returns 400 for missing start_time or end_time", async () => {
    const res = await WEBHOOK_POST(makeWebhookRequest({ title: "Event" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("start_time");

    const count = await prisma.calendarEvent.count({ where: { companyId } });
    expect(count).toBe(0);
  });

  it("returns 400 for end_time before start_time", async () => {
    const res = await WEBHOOK_POST(
      makeWebhookRequest(
        validWebhookBody({
          start_time: "2026-03-01T11:00:00Z",
          end_time: "2026-03-01T10:00:00Z",
        }),
      ),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("after");

    const count = await prisma.calendarEvent.count({ where: { companyId } });
    expect(count).toBe(0);
  });

  it("returns 400 for title exceeding 200 chars", async () => {
    const res = await WEBHOOK_POST(
      makeWebhookRequest(validWebhookBody({ title: "x".repeat(201) })),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("characters");

    const count = await prisma.calendarEvent.count({ where: { companyId } });
    expect(count).toBe(0);
  });

  it("returns 400 for invalid color", async () => {
    const res = await WEBHOOK_POST(
      makeWebhookRequest(validWebhookBody({ color: "rainbow" })),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("color");

    const count = await prisma.calendarEvent.count({ where: { companyId } });
    expect(count).toBe(0);
  });

  it("returns 400 for description exceeding 2000 chars", async () => {
    const res = await WEBHOOK_POST(
      makeWebhookRequest(validWebhookBody({ description: "x".repeat(2001) })),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("string");

    const count = await prisma.calendarEvent.count({ where: { companyId } });
    expect(count).toBe(0);
  });

  it("copies global automation rules in transaction", async () => {
    await seedGlobalRule(companyId, { name: "Webhook Rule A" });
    await seedGlobalRule(companyId, { name: "Webhook Rule B" });

    const res = await WEBHOOK_POST(makeWebhookRequest(validWebhookBody()));
    const body = await res.json();
    expect(res.status).toBe(200);

    const copiedRules = await prisma.automationRule.findMany({
      where: { calendarEventId: body.event.id },
    });
    expect(copiedRules).toHaveLength(2);
  });

  it("returns error for invalid API key", async () => {
    vi.mocked(validateMakeApiKey).mockResolvedValue({
      success: false,
      response: NextResponse.json({ error: "Invalid API key" }, { status: 401 }),
    } as any);

    const res = await WEBHOOK_POST(makeWebhookRequest(validWebhookBody()));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain("API key");

    const count = await prisma.calendarEvent.count({ where: { companyId } });
    expect(count).toBe(0);
  });

  it("returns 429 when MAX_EVENTS_PER_COMPANY reached", async () => {
    const countSpy = vi.spyOn(prisma.calendarEvent, "count").mockResolvedValueOnce(10_000);

    const res = await WEBHOOK_POST(makeWebhookRequest(validWebhookBody()));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toContain("limit");

    countSpy.mockRestore();
  });

  it("returns 400 for non-string start_time/end_time", async () => {
    const res = await WEBHOOK_POST(
      makeWebhookRequest(validWebhookBody({ start_time: 12345, end_time: 67890 })),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("string");
  });

  it("returns 400 for non-string color", async () => {
    const res = await WEBHOOK_POST(
      makeWebhookRequest(validWebhookBody({ color: 123 })),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("string");
  });

  it("returns 400 for unparseable date format", async () => {
    const res = await WEBHOOK_POST(
      makeWebhookRequest(validWebhookBody({
        start_time: "not-a-date",
        end_time: "also-not-a-date",
      })),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("date format");
  });

  it("calls setIdempotencyResult when idempotency key present", async () => {
    vi.mocked(checkIdempotencyKey).mockResolvedValue({
      key: "unique-key-123",
      cachedResponse: null,
    });

    const res = await WEBHOOK_POST(makeWebhookRequest(validWebhookBody()));
    expect(res.status).toBe(200);

    expect(setIdempotencyResult).toHaveBeenCalledOnce();
    expect(setIdempotencyResult).toHaveBeenCalledWith(
      "calendar",
      "unique-key-123",
      200,
      expect.objectContaining({ success: true, event: expect.any(Object) }),
    );
  });

  it("returns cached response for duplicate idempotency key", async () => {
    const cachedBody = { success: true, event: { id: "cached-id" } };
    vi.mocked(checkIdempotencyKey).mockResolvedValue({
      key: "dup-key",
      cachedResponse: new Response(JSON.stringify(cachedBody), {
        status: 200,
        headers: { "Content-Type": "application/json", "X-Idempotent-Replayed": "true" },
      }),
    });

    const res = await WEBHOOK_POST(makeWebhookRequest(validWebhookBody()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(cachedBody);

    // No new event should be created
    const count = await prisma.calendarEvent.count({ where: { companyId } });
    expect(count).toBe(0);
  });

  it("response event excludes companyId, createdAt, and updatedAt", async () => {
    const res = await WEBHOOK_POST(makeWebhookRequest(validWebhookBody()));
    const body = await res.json();
    expect(res.status).toBe(200);
    expectEventShape(body.event);
  });

  it("does not call setIdempotencyResult when key is null", async () => {
    const res = await WEBHOOK_POST(makeWebhookRequest(validWebhookBody()));
    expect(res.status).toBe(200);

    expect(setIdempotencyResult).not.toHaveBeenCalled();
  });

  it("returns 500 when DB throws", async () => {
    const spy = vi.spyOn(prisma.calendarEvent, "count").mockRejectedValueOnce(new Error("DB down"));

    const res = await WEBHOOK_POST(makeWebhookRequest(validWebhookBody()));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("Internal Server Error");

    spy.mockRestore();
  });

  it("returns 400 for whitespace-only title", async () => {
    const res = await WEBHOOK_POST(
      makeWebhookRequest(validWebhookBody({ title: "   " })),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("characters");

    const count = await prisma.calendarEvent.count({ where: { companyId } });
    expect(count).toBe(0);
  });

  it("returns 400 for non-string description", async () => {
    const res = await WEBHOOK_POST(
      makeWebhookRequest(validWebhookBody({ description: 12345 })),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("string");

    const count = await prisma.calendarEvent.count({ where: { companyId } });
    expect(count).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// CRUD Lifecycle
// ═════════════════════════════════════════════════════════════════════════════

describe("CRUD Lifecycle", () => {
  it("Create → GET → PUT → GET → DELETE → GET", async () => {
    // 1. Create
    const createRes = await POST(makePostRequest(validEventBody({ title: "Lifecycle Event" })));
    const created = await createRes.json();
    expect(createRes.status).toBe(200);
    expect(created.id).toBeDefined();

    // 2. GET — verify in list
    const listRes1 = await GET(makeGetRequest());
    const list1 = await listRes1.json();
    expect(list1.some((e: any) => e.id === created.id)).toBe(true);

    // DB check
    const dbAfterCreate = await prisma.calendarEvent.findUnique({ where: { id: created.id } });
    expect(dbAfterCreate!.title).toBe("Lifecycle Event");

    // 3. PUT — update title
    const updateRes = await PUT(
      makePutRequest(created.id, { title: "Updated Lifecycle" }),
      buildParams(created.id),
    );
    expect(updateRes.status).toBe(200);

    // 4. GET — verify updated
    const listRes2 = await GET(makeGetRequest());
    const list2 = await listRes2.json();
    const updated = list2.find((e: any) => e.id === created.id);
    expect(updated.title).toBe("Updated Lifecycle");

    // DB check
    const dbAfterUpdate = await prisma.calendarEvent.findUnique({ where: { id: created.id } });
    expect(dbAfterUpdate!.title).toBe("Updated Lifecycle");

    // 5. DELETE
    const deleteRes = await DELETE(makeDeleteRequest(created.id), buildParams(created.id));
    expect(deleteRes.status).toBe(200);

    // 6. GET — verify gone
    const listRes3 = await GET(makeGetRequest());
    const list3 = await listRes3.json();
    expect(list3.some((e: any) => e.id === created.id)).toBe(false);

    // DB check
    const dbAfterDelete = await prisma.calendarEvent.findUnique({ where: { id: created.id } });
    expect(dbAfterDelete).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Multi-tenancy Isolation
// ═════════════════════════════════════════════════════════════════════════════

describe("Multi-tenancy Isolation", () => {
  it("company A cannot see company B's events via GET", async () => {
    await seedEvent(companyId, { title: "A's event" });
    await seedEvent(companyId2, { title: "B's event" });

    // GET as Co A
    mockUserForCompany(companyId);
    const resA = await GET(makeGetRequest());
    const bodyA = await resA.json();
    expect(resA.status).toBe(200);
    expect(bodyA).toHaveLength(1);
    expect(bodyA[0].title).toBe("A's event");

    // GET as Co B
    mockUserForCompany(companyId2);
    const resB = await GET(makeGetRequest());
    const bodyB = await resB.json();
    expect(resB.status).toBe(200);
    expect(bodyB).toHaveLength(1);
    expect(bodyB[0].title).toBe("B's event");
  });

  it("company A cannot update company B's event", async () => {
    const ev = await seedEvent(companyId2, { title: "B's event" });
    mockUserForCompany(companyId);

    const res = await PUT(makePutRequest(ev.id, { title: "Hacked by A" }), buildParams(ev.id));
    expect(res.status).toBe(404);

    const dbEvent = await prisma.calendarEvent.findUnique({ where: { id: ev.id } });
    expect(dbEvent!.title).toBe("B's event");
  });

  it("company A cannot delete company B's event", async () => {
    const ev = await seedEvent(companyId2, { title: "B's event" });
    mockUserForCompany(companyId);

    const res = await DELETE(makeDeleteRequest(ev.id), buildParams(ev.id));
    expect(res.status).toBe(404);

    const dbEvent = await prisma.calendarEvent.findUnique({ where: { id: ev.id } });
    expect(dbEvent).not.toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Transaction Atomicity
// ═════════════════════════════════════════════════════════════════════════════

describe("Transaction Atomicity", () => {
  it("event + automation rules created atomically", async () => {
    await seedGlobalRule(companyId, { name: "G1", actionConfig: { x: 1 } });
    await seedGlobalRule(companyId, { name: "G2", actionConfig: { x: 2 } });
    await seedGlobalRule(companyId, { name: "G3", actionConfig: { x: 3 } });

    const res = await POST(makePostRequest(validEventBody()));
    const body = await res.json();
    expect(res.status).toBe(200);

    const dbEvent = await prisma.calendarEvent.findUnique({ where: { id: body.id } });
    expect(dbEvent).not.toBeNull();

    const rules = await prisma.automationRule.findMany({
      where: { calendarEventId: body.id },
    });
    expect(rules).toHaveLength(3);
  });

  it("copied rules have correct calendarEventId FK", async () => {
    await seedGlobalRule(companyId, { name: "FK Test" });

    const res = await POST(makePostRequest(validEventBody()));
    const body = await res.json();

    const rules = await prisma.automationRule.findMany({
      where: { calendarEventId: body.id },
    });
    expect(rules).toHaveLength(1);
    expect(rules[0].calendarEventId).toBe(body.id);
  });

  it("copied rules preserve name/triggerType/actionType/configs", async () => {
    const globalRule = await seedGlobalRule(companyId, {
      name: "Preserve Me",
      triggerConfig: { offset: -15 },
      actionConfig: { recipientId: 42, message: "Hello" },
    });

    const res = await POST(makePostRequest(validEventBody()));
    const body = await res.json();

    const copiedRules = await prisma.automationRule.findMany({
      where: { calendarEventId: body.id },
    });
    expect(copiedRules).toHaveLength(1);

    const copied = copiedRules[0];
    expect(copied.name).toBe(globalRule.name);
    expect(copied.triggerType).toBe(globalRule.triggerType);
    expect(copied.actionType).toBe(globalRule.actionType);
    expect(copied.triggerConfig).toEqual(globalRule.triggerConfig);
    expect(copied.actionConfig).toEqual(globalRule.actionConfig);
    expect(copied.isActive).toBe(true);
  });
});

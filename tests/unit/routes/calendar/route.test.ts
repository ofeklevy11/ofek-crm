import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// --- Mocks ---
vi.mock("@/lib/permissions-server", () => ({
  getCurrentUser: vi.fn(),
}));
vi.mock("@/lib/permissions", () => ({
  hasUserFlag: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(),
  checkActionRateLimit: vi.fn(),
  RATE_LIMITS: {
    calendarRead: { prefix: "cal-read", max: 60, windowSeconds: 60 },
    webhook: { prefix: "webhook", max: 60, windowSeconds: 60 },
  },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    calendarEvent: { findMany: vi.fn(), count: vi.fn() },
  },
}));
vi.mock("@/app/actions/calendar", () => ({
  createCalendarEvent: vi.fn(),
  updateCalendarEvent: vi.fn(),
  deleteCalendarEvent: vi.fn(),
}));
vi.mock("@/lib/make-auth", () => ({
  validateMakeApiKey: vi.fn(),
}));
vi.mock("@/lib/webhook-auth", () => ({
  checkIdempotencyKey: vi.fn(),
  setIdempotencyResult: vi.fn(),
}));
vi.mock("@/lib/calendar-helpers", () => ({
  createCalendarEventForCompany: vi.fn(),
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { GET, POST } from "@/app/api/calendar/route";
import { PUT, DELETE } from "@/app/api/calendar/[id]/route";
import { POST as WEBHOOK_POST } from "@/app/api/make/calendar/route";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { checkRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from "@/app/actions/calendar";
import { validateMakeApiKey } from "@/lib/make-auth";
import { checkIdempotencyKey, setIdempotencyResult } from "@/lib/webhook-auth";
import { createCalendarEventForCompany } from "@/lib/calendar-helpers";

// --- Fixtures ---
function makeUser(overrides?: Partial<{ id: number; companyId: number; role: string; permissions: Record<string, boolean> }>) {
  return {
    id: 1,
    companyId: 100,
    name: "Test User",
    email: "test@test.com",
    role: "admin" as const,
    allowedWriteTableIds: [] as number[],
    permissions: {} as Record<string, boolean>,
    ...overrides,
  };
}

function makeGetRequest(params?: Record<string, string>) {
  const url = new URL("http://localhost/api/calendar");
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }
  return new Request(url.toString(), { method: "GET" });
}

function makePostRequest(body: unknown) {
  return new Request("http://localhost/api/calendar", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function makeWebhookRequest(body: unknown, headers?: Record<string, string>) {
  return new Request("http://localhost/api/make/calendar", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", "x-company-api-key": "key-123", ...headers },
  });
}

function setupAuthenticatedUser(overrides?: Parameters<typeof makeUser>[0]) {
  const user = makeUser(overrides);
  vi.mocked(getCurrentUser).mockResolvedValue(user as any);
  vi.mocked(hasUserFlag).mockReturnValue(true);
  return user;
}

const keyRecord = { companyId: 100, isActive: true, createdBy: 1 };

function setupWebhookAuth() {
  vi.mocked(validateMakeApiKey).mockResolvedValue({ success: true, keyRecord } as any);
  vi.mocked(checkIdempotencyKey).mockResolvedValue({ key: null, cachedResponse: null });
  vi.mocked(setIdempotencyResult).mockResolvedValue(undefined as any);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(checkRateLimit).mockResolvedValue(null);
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/calendar
// ═══════════════════════════════════════════════════════════════════════════
describe("GET /api/calendar", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 403 when missing canViewCalendar permission", async () => {
    const user = makeUser();
    vi.mocked(getCurrentUser).mockResolvedValue(user as any);
    vi.mocked(hasUserFlag).mockReturnValue(false);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
    expect(hasUserFlag).toHaveBeenCalledWith(expect.anything(), "canViewCalendar");
  });

  it("returns 429 when rate limited", async () => {
    const user = setupAuthenticatedUser();
    const rl = NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
    vi.mocked(checkRateLimit).mockResolvedValue(rl);

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(429);
    expect(checkRateLimit).toHaveBeenCalledWith(
      String(user.id),
      { prefix: "cal-read", max: 60, windowSeconds: 60 },
    );
  });

  it("returns 200 with events and take:2000 when no date range", async () => {
    setupAuthenticatedUser();
    const events = [{ id: "e1", title: "Event 1" }];
    vi.mocked(prisma.calendarEvent.findMany).mockResolvedValue(events as any);

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(events);

    const call = vi.mocked(prisma.calendarEvent.findMany).mock.calls[0][0] as any;
    expect(call.take).toBe(2000);
    expect(call.orderBy).toEqual({ startTime: "asc" });
    expect(call.select).toEqual({
      id: true,
      title: true,
      description: true,
      startTime: true,
      endTime: true,
      color: true,
    });
  });

  it("returns 200 with take:2000 when only rangeStart is provided (no rangeEnd)", async () => {
    setupAuthenticatedUser();
    vi.mocked(prisma.calendarEvent.findMany).mockResolvedValue([]);

    const res = await GET(makeGetRequest({ rangeStart: "2025-01-01T00:00:00Z" }));
    expect(res.status).toBe(200);

    const call = vi.mocked(prisma.calendarEvent.findMany).mock.calls[0][0] as any;
    expect(call.take).toBe(2000);
    expect(call.where.startTime).toBeUndefined();
    expect(call.where.endTime).toBeUndefined();
  });

  it("returns 200 with take:2000 when only rangeEnd is provided (no rangeStart)", async () => {
    setupAuthenticatedUser();
    vi.mocked(prisma.calendarEvent.findMany).mockResolvedValue([]);

    const res = await GET(makeGetRequest({ rangeEnd: "2025-02-01T00:00:00Z" }));
    expect(res.status).toBe(200);

    const call = vi.mocked(prisma.calendarEvent.findMany).mock.calls[0][0] as any;
    expect(call.take).toBe(2000);
    expect(call.where.startTime).toBeUndefined();
    expect(call.where.endTime).toBeUndefined();
  });

  it("returns 200 with take:500 and correct filters when date range provided", async () => {
    setupAuthenticatedUser();
    vi.mocked(prisma.calendarEvent.findMany).mockResolvedValue([]);

    const res = await GET(makeGetRequest({
      rangeStart: "2025-01-01T00:00:00Z",
      rangeEnd: "2025-02-01T00:00:00Z",
    }));
    expect(res.status).toBe(200);

    const call = vi.mocked(prisma.calendarEvent.findMany).mock.calls[0][0] as any;
    expect(call.take).toBe(500);
    expect(call.where.startTime).toEqual({ lte: new Date("2025-02-01T00:00:00Z") });
    expect(call.where.endTime).toEqual({ gte: new Date("2025-01-01T00:00:00Z") });
  });

  it("returns 400 for invalid rangeStart date", async () => {
    setupAuthenticatedUser();
    const res = await GET(makeGetRequest({ rangeStart: "not-a-date" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid rangeStart date" });
  });

  it("returns 400 for invalid rangeEnd date", async () => {
    setupAuthenticatedUser();
    const res = await GET(makeGetRequest({ rangeEnd: "not-a-date" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid rangeEnd date" });
  });

  it("returns 400 for date range exceeding 1 year", async () => {
    setupAuthenticatedUser();
    const res = await GET(makeGetRequest({
      rangeStart: "2024-01-01T00:00:00Z",
      rangeEnd: "2025-01-02T00:00:00Z",
    }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Date range cannot exceed 1 year" });
  });

  it("always filters by companyId for multi-tenancy", async () => {
    setupAuthenticatedUser({ companyId: 42 });
    vi.mocked(prisma.calendarEvent.findMany).mockResolvedValue([]);

    await GET(makeGetRequest());
    const call = vi.mocked(prisma.calendarEvent.findMany).mock.calls[0][0] as any;
    expect(call.where.companyId).toBe(42);
  });

  it("returns 500 when DB throws", async () => {
    setupAuthenticatedUser();
    vi.mocked(prisma.calendarEvent.findMany).mockRejectedValue(new Error("DB down"));

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to fetch calendar events" });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/calendar
// ═══════════════════════════════════════════════════════════════════════════
describe("POST /api/calendar", () => {
  const validBody = {
    title: "Team Meeting",
    startTime: "2025-06-01T10:00:00Z",
    endTime: "2025-06-01T11:00:00Z",
  };

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await POST(makePostRequest(validBody));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 403 when missing permission", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(makeUser() as any);
    vi.mocked(hasUserFlag).mockReturnValue(false);
    const res = await POST(makePostRequest(validBody));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
    expect(hasUserFlag).toHaveBeenCalledWith(expect.anything(), "canViewCalendar");
  });

  it("returns 400 when title is missing", async () => {
    setupAuthenticatedUser();
    const res = await POST(makePostRequest({
      startTime: "2025-06-01T10:00:00Z",
      endTime: "2025-06-01T11:00:00Z",
    }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Title is required" });
  });

  it("returns 400 when title is empty string", async () => {
    setupAuthenticatedUser();
    const res = await POST(makePostRequest({
      title: "",
      startTime: "2025-06-01T10:00:00Z",
      endTime: "2025-06-01T11:00:00Z",
    }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Title cannot be empty" });
  });

  it("returns 400 when title is whitespace only", async () => {
    setupAuthenticatedUser();
    const res = await POST(makePostRequest({
      title: "   ",
      startTime: "2025-06-01T10:00:00Z",
      endTime: "2025-06-01T11:00:00Z",
    }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Title cannot be empty" });
  });

  it("returns 400 when title is not a string", async () => {
    setupAuthenticatedUser();
    const res = await POST(makePostRequest({
      title: 123,
      startTime: "2025-06-01T10:00:00Z",
      endTime: "2025-06-01T11:00:00Z",
    }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Title must be a string" });
  });

  it("returns 400 when dates are missing", async () => {
    setupAuthenticatedUser();
    const res = await POST(makePostRequest({ title: "No dates" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "startTime and endTime are required" });
  });

  it("returns 400 when endTime is before startTime", async () => {
    setupAuthenticatedUser();
    const res = await POST(makePostRequest({
      title: "Bad dates",
      startTime: "2025-06-01T12:00:00Z",
      endTime: "2025-06-01T10:00:00Z",
    }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "endTime must be after startTime" });
  });

  it("returns 400 when endTime equals startTime", async () => {
    setupAuthenticatedUser();
    const res = await POST(makePostRequest({
      title: "Same times",
      startTime: "2025-06-01T10:00:00Z",
      endTime: "2025-06-01T10:00:00Z",
    }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "endTime must be after startTime" });
  });

  it("returns 400 when startTime is not a valid date", async () => {
    setupAuthenticatedUser();
    const res = await POST(makePostRequest({
      title: "Test Event",
      startTime: "not-a-date",
      endTime: "2025-06-01T11:00:00Z",
    }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "startTime is not a valid date" });
  });

  it("returns 400 when endTime is not a valid date", async () => {
    setupAuthenticatedUser();
    const res = await POST(makePostRequest({
      title: "Test Event",
      startTime: "2025-06-01T10:00:00Z",
      endTime: "not-a-date",
    }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "endTime is not a valid date" });
  });

  it("returns 400 when title exceeds max length", async () => {
    setupAuthenticatedUser();
    const res = await POST(makePostRequest({
      title: "a".repeat(201),
      startTime: "2025-06-01T10:00:00Z",
      endTime: "2025-06-01T11:00:00Z",
    }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Title cannot exceed 200 characters" });
  });

  it("returns 200 and calls createCalendarEvent with correct args", async () => {
    setupAuthenticatedUser();
    const eventData = { id: "e1", title: "Team Meeting" };
    vi.mocked(createCalendarEvent).mockResolvedValue({ success: true, data: eventData } as any);

    const res = await POST(makePostRequest(validBody));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(eventData);
    expect(createCalendarEvent).toHaveBeenCalledWith({
      title: "Team Meeting",
      description: undefined,
      startTime: new Date("2025-06-01T10:00:00Z").toISOString(),
      endTime: new Date("2025-06-01T11:00:00Z").toISOString(),
      color: undefined,
    });
  });

  it("returns 400 when action returns success:false", async () => {
    setupAuthenticatedUser();
    vi.mocked(createCalendarEvent).mockResolvedValue({ success: false, error: "Something went wrong" } as any);

    const res = await POST(makePostRequest(validBody));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Something went wrong" });
  });

  it("returns 200 and passes description and color to createCalendarEvent", async () => {
    setupAuthenticatedUser();
    const eventData = { id: "e2", title: "Meeting", description: "A desc", color: "red" };
    vi.mocked(createCalendarEvent).mockResolvedValue({ success: true, data: eventData } as any);

    const res = await POST(makePostRequest({
      title: "Meeting",
      startTime: "2025-06-01T10:00:00Z",
      endTime: "2025-06-01T11:00:00Z",
      description: "A desc",
      color: "red",
    }));
    expect(res.status).toBe(200);
    expect(createCalendarEvent).toHaveBeenCalledWith({
      title: "Meeting",
      description: "A desc",
      startTime: new Date("2025-06-01T10:00:00Z").toISOString(),
      endTime: new Date("2025-06-01T11:00:00Z").toISOString(),
      color: "red",
    });
  });

  it("returns 500 on unexpected error", async () => {
    setupAuthenticatedUser();
    vi.mocked(createCalendarEvent).mockRejectedValue(new Error("Unexpected"));

    const res = await POST(makePostRequest(validBody));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to create calendar event" });
  });

  it("returns 500 when request body is invalid JSON", async () => {
    setupAuthenticatedUser();
    const req = new Request("http://localhost/api/calendar", {
      method: "POST",
      body: "not-json{{{",
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to create calendar event" });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PUT /api/calendar/[id]
// ═══════════════════════════════════════════════════════════════════════════
describe("PUT /api/calendar/[id]", () => {
  const validUpdate = { title: "Updated Title" };

  function callPut(id: string, body: unknown) {
    const req = new Request("http://localhost/api/calendar/" + id, {
      method: "PUT",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
    return PUT(req, { params: Promise.resolve({ id }) });
  }

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await callPut("abc123", validUpdate);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 403 when missing permission", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(makeUser() as any);
    vi.mocked(hasUserFlag).mockReturnValue(false);
    const res = await callPut("abc123", validUpdate);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
    expect(hasUserFlag).toHaveBeenCalledWith(expect.anything(), "canViewCalendar");
  });

  it("returns 400 for empty event ID", async () => {
    setupAuthenticatedUser();
    const res = await callPut("", validUpdate);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid event ID" });
  });

  it("returns 400 for ID longer than 30 chars", async () => {
    setupAuthenticatedUser();
    const res = await callPut("a".repeat(31), validUpdate);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid event ID" });
  });

  it("returns 400 for validation failure (startTime without endTime)", async () => {
    setupAuthenticatedUser();
    const res = await callPut("abc123", { startTime: "2025-06-01T10:00:00Z" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Both startTime and endTime must be provided when updating times" });
  });

  it("returns 400 for validation failure (endTime without startTime)", async () => {
    setupAuthenticatedUser();
    const res = await callPut("abc123", { endTime: "2025-06-01T11:00:00Z" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Both startTime and endTime must be provided when updating times" });
  });

  it("returns 400 for whitespace-only title", async () => {
    setupAuthenticatedUser();
    const res = await callPut("abc123", { title: "   " });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Title cannot be empty" });
  });

  it("returns 200 with empty body {} (no fields to update)", async () => {
    setupAuthenticatedUser();
    const eventData = { id: "abc123", title: "Unchanged" };
    vi.mocked(updateCalendarEvent).mockResolvedValue({ success: true, data: eventData } as any);

    const res = await callPut("abc123", {});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(eventData);
    expect(updateCalendarEvent).toHaveBeenCalledWith("abc123", {});
  });

  it("returns 200 and updates event successfully", async () => {
    setupAuthenticatedUser();
    const eventData = { id: "abc123", title: "Updated Title" };
    vi.mocked(updateCalendarEvent).mockResolvedValue({ success: true, data: eventData } as any);

    const res = await callPut("abc123", validUpdate);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(eventData);
    expect(updateCalendarEvent).toHaveBeenCalledWith("abc123", { title: "Updated Title" });
  });

  it("returns 200 and updates only description", async () => {
    setupAuthenticatedUser();
    const eventData = { id: "abc123", title: "Same", description: "New desc" };
    vi.mocked(updateCalendarEvent).mockResolvedValue({ success: true, data: eventData } as any);

    const res = await callPut("abc123", { description: "New desc" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(eventData);
    expect(updateCalendarEvent).toHaveBeenCalledWith("abc123", { description: "New desc" });
  });

  it("returns 200 and updates only color", async () => {
    setupAuthenticatedUser();
    const eventData = { id: "abc123", title: "Same", color: "green" };
    vi.mocked(updateCalendarEvent).mockResolvedValue({ success: true, data: eventData } as any);

    const res = await callPut("abc123", { color: "green" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(eventData);
    expect(updateCalendarEvent).toHaveBeenCalledWith("abc123", { color: "green" });
  });

  it("returns 200 and updates only dates", async () => {
    setupAuthenticatedUser();
    const eventData = { id: "abc123", title: "Same", startTime: "2025-07-01T09:00:00.000Z", endTime: "2025-07-01T17:00:00.000Z" };
    vi.mocked(updateCalendarEvent).mockResolvedValue({ success: true, data: eventData } as any);

    const res = await callPut("abc123", {
      startTime: "2025-07-01T09:00:00Z",
      endTime: "2025-07-01T17:00:00Z",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(eventData);
    expect(updateCalendarEvent).toHaveBeenCalledWith("abc123", {
      startTime: new Date("2025-07-01T09:00:00Z").toISOString(),
      endTime: new Date("2025-07-01T17:00:00Z").toISOString(),
    });
  });

  it("returns 200 with full multi-field update (title + dates + description + color)", async () => {
    setupAuthenticatedUser();
    const eventData = { id: "abc123", title: "Full Update" };
    vi.mocked(updateCalendarEvent).mockResolvedValue({ success: true, data: eventData } as any);

    const res = await callPut("abc123", {
      title: "Full Update",
      startTime: "2025-07-01T09:00:00Z",
      endTime: "2025-07-01T17:00:00Z",
      description: "All day event",
      color: "green",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(eventData);
    expect(updateCalendarEvent).toHaveBeenCalledWith("abc123", {
      title: "Full Update",
      startTime: new Date("2025-07-01T09:00:00Z").toISOString(),
      endTime: new Date("2025-07-01T17:00:00Z").toISOString(),
      description: "All day event",
      color: "green",
    });
  });

  it("returns 404 when action returns 'Event not found'", async () => {
    setupAuthenticatedUser();
    vi.mocked(updateCalendarEvent).mockResolvedValue({ success: false, error: "Event not found" } as any);

    const res = await callPut("abc123", validUpdate);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Event not found" });
  });

  it("returns 400 for other action errors", async () => {
    setupAuthenticatedUser();
    vi.mocked(updateCalendarEvent).mockResolvedValue({ success: false, error: "Bad data" } as any);

    const res = await callPut("abc123", validUpdate);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Bad data" });
  });

  it("returns 500 on unexpected error", async () => {
    setupAuthenticatedUser();
    vi.mocked(updateCalendarEvent).mockRejectedValue(new Error("Unexpected"));

    const res = await callPut("abc123", validUpdate);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to update calendar event" });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DELETE /api/calendar/[id]
// ═══════════════════════════════════════════════════════════════════════════
describe("DELETE /api/calendar/[id]", () => {
  function callDelete(id: string) {
    const req = new Request("http://localhost/api/calendar/" + id, { method: "DELETE" });
    return DELETE(req, { params: Promise.resolve({ id }) });
  }

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await callDelete("abc123");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 403 when missing permission", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(makeUser() as any);
    vi.mocked(hasUserFlag).mockReturnValue(false);
    const res = await callDelete("abc123");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
    expect(hasUserFlag).toHaveBeenCalledWith(expect.anything(), "canViewCalendar");
  });

  it("returns 400 for empty event ID", async () => {
    setupAuthenticatedUser();
    const res = await callDelete("");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid event ID" });
  });

  it("returns 400 for ID longer than 30 chars", async () => {
    setupAuthenticatedUser();
    const res = await callDelete("a".repeat(31));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid event ID" });
  });

  it("returns 200 with success:true when deleted", async () => {
    setupAuthenticatedUser();
    vi.mocked(deleteCalendarEvent).mockResolvedValue({ success: true } as any);

    const res = await callDelete("abc123");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });

  it("returns 404 when action returns 'Event not found'", async () => {
    setupAuthenticatedUser();
    vi.mocked(deleteCalendarEvent).mockResolvedValue({ success: false, error: "Event not found" } as any);

    const res = await callDelete("abc123");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Event not found" });
  });

  it("returns 400 for other action errors", async () => {
    setupAuthenticatedUser();
    vi.mocked(deleteCalendarEvent).mockResolvedValue({ success: false, error: "Cannot delete" } as any);

    const res = await callDelete("abc123");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Cannot delete" });
  });

  it("returns 500 on unexpected error", async () => {
    setupAuthenticatedUser();
    vi.mocked(deleteCalendarEvent).mockRejectedValue(new Error("Unexpected"));

    const res = await callDelete("abc123");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to delete calendar event" });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/make/calendar (webhook)
// ═══════════════════════════════════════════════════════════════════════════
describe("POST /api/make/calendar", () => {
  const validWebhookBody = {
    title: "Webhook Event",
    start_time: "2025-06-01T10:00:00Z",
    end_time: "2025-06-01T11:00:00Z",
  };

  beforeEach(() => {
    setupWebhookAuth();
  });

  // ── Auth ──
  it("returns 401 when API key is missing/invalid", async () => {
    const authResp = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    vi.mocked(validateMakeApiKey).mockResolvedValue({ success: false, response: authResp } as any);

    const res = await WEBHOOK_POST(makeWebhookRequest(validWebhookBody));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  // ── Rate limit ──
  it("returns 429 when rate limited", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue(
      NextResponse.json({ error: "Rate limited" }, { status: 429 }),
    );
    const res = await WEBHOOK_POST(makeWebhookRequest(validWebhookBody));
    expect(res.status).toBe(429);
    expect(checkRateLimit).toHaveBeenCalledWith(
      String(keyRecord.companyId),
      { prefix: "webhook", max: 60, windowSeconds: 60 },
    );
  });

  // ── Idempotency ──
  it("returns cached response for duplicate idempotency key", async () => {
    const cached = new Response(JSON.stringify({ success: true, event: { id: "e1" } }), {
      status: 200,
      headers: { "Content-Type": "application/json", "X-Idempotent-Replayed": "true" },
    });
    vi.mocked(checkIdempotencyKey).mockResolvedValue({ key: "idem-1", cachedResponse: cached });

    const res = await WEBHOOK_POST(makeWebhookRequest(validWebhookBody));
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Idempotent-Replayed")).toBe("true");
    expect(createCalendarEventForCompany).not.toHaveBeenCalled();
  });

  // ── Title validation ──
  it("returns 400 when title is missing", async () => {
    const res = await WEBHOOK_POST(makeWebhookRequest({
      start_time: "2025-06-01T10:00:00Z",
      end_time: "2025-06-01T11:00:00Z",
    }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing required field: title" });
  });

  it("returns 400 when title is not a string", async () => {
    const res = await WEBHOOK_POST(makeWebhookRequest({
      title: 123,
      start_time: "2025-06-01T10:00:00Z",
      end_time: "2025-06-01T11:00:00Z",
    }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing required field: title" });
  });

  it("returns 400 when title is empty (whitespace only)", async () => {
    const res = await WEBHOOK_POST(makeWebhookRequest({
      title: "   ",
      start_time: "2025-06-01T10:00:00Z",
      end_time: "2025-06-01T11:00:00Z",
    }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Title must be 1-200 characters" });
  });

  it("returns 400 when title exceeds 200 chars", async () => {
    const res = await WEBHOOK_POST(makeWebhookRequest({
      title: "a".repeat(201),
      start_time: "2025-06-01T10:00:00Z",
      end_time: "2025-06-01T11:00:00Z",
    }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Title must be 1-200 characters" });
  });

  // ── Description validation ──
  it("returns 400 for invalid description type", async () => {
    const res = await WEBHOOK_POST(makeWebhookRequest({
      ...validWebhookBody,
      description: 12345,
    }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Description must be a string under 2000 characters" });
  });

  it("returns 400 when description exceeds 2000 chars", async () => {
    const res = await WEBHOOK_POST(makeWebhookRequest({
      ...validWebhookBody,
      description: "a".repeat(2001),
    }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Description must be a string under 2000 characters" });
  });

  // ── Date validation ──
  it("returns 400 when start_time and end_time are missing", async () => {
    const res = await WEBHOOK_POST(makeWebhookRequest({ title: "Event" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Missing required fields: start_time and end_time are required",
    });
  });

  it("returns 400 when dates are not strings", async () => {
    const res = await WEBHOOK_POST(makeWebhookRequest({
      title: "Event",
      start_time: 123,
      end_time: 456,
    }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "start_time and end_time must be strings",
    });
  });

  it("returns 400 for invalid date format", async () => {
    const res = await WEBHOOK_POST(makeWebhookRequest({
      title: "Event",
      start_time: "not-a-date",
      end_time: "also-bad",
    }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid date format. Use ISO-8601 (e.g. 2024-01-25T14:00:00Z)" });
  });

  it("returns 400 when end_time is before start_time", async () => {
    const res = await WEBHOOK_POST(makeWebhookRequest({
      title: "Event",
      start_time: "2025-06-01T12:00:00Z",
      end_time: "2025-06-01T10:00:00Z",
    }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "end_time must be after start_time" });
  });

  it("returns 400 when end_time equals start_time", async () => {
    const res = await WEBHOOK_POST(makeWebhookRequest({
      title: "Event",
      start_time: "2025-06-01T12:00:00Z",
      end_time: "2025-06-01T12:00:00Z",
    }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "end_time must be after start_time" });
  });

  // ── Color validation ──
  it("returns 400 for invalid color value", async () => {
    const res = await WEBHOOK_POST(makeWebhookRequest({
      ...validWebhookBody,
      color: "neon-rainbow",
    }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid color value" });
  });

  it("returns 400 for non-string color", async () => {
    const res = await WEBHOOK_POST(makeWebhookRequest({
      ...validWebhookBody,
      color: 42,
    }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Color must be a string" });
  });

  // ── Event limit ──
  it("returns 429 when event limit reached (>=10,000)", async () => {
    vi.mocked(prisma.calendarEvent.count).mockResolvedValue(10_000);

    const res = await WEBHOOK_POST(makeWebhookRequest(validWebhookBody));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "Event limit reached (10000). Delete old events first." });
    expect(prisma.calendarEvent.count).toHaveBeenCalledWith({ where: { companyId: 100 } });
  });

  // ── Happy paths ──
  it("returns 200 and creates event with default color 'blue'", async () => {
    vi.mocked(prisma.calendarEvent.count).mockResolvedValue(0);
    const event = { id: "e1", title: "Webhook Event" };
    vi.mocked(createCalendarEventForCompany).mockResolvedValue(event as any);

    const res = await WEBHOOK_POST(makeWebhookRequest(validWebhookBody));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, event });

    expect(createCalendarEventForCompany).toHaveBeenCalledWith(
      100,
      1,
      {
        title: "Webhook Event",
        description: null,
        startTime: new Date("2025-06-01T10:00:00Z"),
        endTime: new Date("2025-06-01T11:00:00Z"),
        color: "blue",
      },
    );
  });

  it("parses timezone-absent dates as Israel time", async () => {
    vi.mocked(prisma.calendarEvent.count).mockResolvedValue(0);
    vi.mocked(createCalendarEventForCompany).mockResolvedValue({ id: "e-il" } as any);

    const res = await WEBHOOK_POST(makeWebhookRequest({
      title: "Israel Event",
      start_time: "2025-06-01T10:00:00",
      end_time: "2025-06-01T11:00:00",
    }));
    expect(res.status).toBe(200);
    expect(createCalendarEventForCompany).toHaveBeenCalledWith(
      100, 1,
      {
        title: "Israel Event",
        description: null,
        startTime: new Date("2025-06-01T07:00:00Z"),
        endTime: new Date("2025-06-01T08:00:00Z"),
        color: "blue",
      },
    );
  });

  it("parses offset timezone dates directly (+03:00)", async () => {
    vi.mocked(prisma.calendarEvent.count).mockResolvedValue(0);
    vi.mocked(createCalendarEventForCompany).mockResolvedValue({ id: "e-offset" } as any);

    const res = await WEBHOOK_POST(makeWebhookRequest({
      title: "Offset TZ Event",
      start_time: "2025-06-01T10:00:00+03:00",
      end_time: "2025-06-01T11:00:00+03:00",
    }));
    expect(res.status).toBe(200);
    expect(createCalendarEventForCompany).toHaveBeenCalledWith(
      100, 1,
      {
        title: "Offset TZ Event",
        description: null,
        startTime: new Date("2025-06-01T07:00:00Z"),
        endTime: new Date("2025-06-01T08:00:00Z"),
        color: "blue",
      },
    );
  });

  it("parses timezone-absent winter dates with IST offset (UTC+2)", async () => {
    vi.mocked(prisma.calendarEvent.count).mockResolvedValue(0);
    vi.mocked(createCalendarEventForCompany).mockResolvedValue({ id: "e-ist" } as any);

    const res = await WEBHOOK_POST(makeWebhookRequest({
      title: "Winter Event",
      start_time: "2025-01-15T10:00:00",
      end_time: "2025-01-15T11:00:00",
    }));
    expect(res.status).toBe(200);
    expect(createCalendarEventForCompany).toHaveBeenCalledWith(
      100, 1,
      {
        title: "Winter Event",
        description: null,
        startTime: new Date("2025-01-15T08:00:00Z"),
        endTime: new Date("2025-01-15T09:00:00Z"),
        color: "blue",
      },
    );
  });

  it("returns 200 with valid hex color (#FF5733)", async () => {
    vi.mocked(prisma.calendarEvent.count).mockResolvedValue(0);
    vi.mocked(createCalendarEventForCompany).mockResolvedValue({ id: "e2" } as any);

    const res = await WEBHOOK_POST(makeWebhookRequest({
      ...validWebhookBody,
      color: "#FF5733",
    }));
    expect(res.status).toBe(200);
    expect(createCalendarEventForCompany).toHaveBeenCalledWith(
      100,
      1,
      {
        title: "Webhook Event",
        description: null,
        startTime: new Date("2025-06-01T10:00:00Z"),
        endTime: new Date("2025-06-01T11:00:00Z"),
        color: "#FF5733",
      },
    );
  });

  it("returns 200 with valid named color (blue)", async () => {
    vi.mocked(prisma.calendarEvent.count).mockResolvedValue(0);
    vi.mocked(createCalendarEventForCompany).mockResolvedValue({ id: "e3" } as any);

    const res = await WEBHOOK_POST(makeWebhookRequest({
      ...validWebhookBody,
      color: "blue",
    }));
    expect(res.status).toBe(200);
    expect(createCalendarEventForCompany).toHaveBeenCalledWith(
      100,
      1,
      {
        title: "Webhook Event",
        description: null,
        startTime: new Date("2025-06-01T10:00:00Z"),
        endTime: new Date("2025-06-01T11:00:00Z"),
        color: "blue",
      },
    );
  });

  it("returns 200 with valid defaultEventColors hex (#4285F4)", async () => {
    vi.mocked(prisma.calendarEvent.count).mockResolvedValue(0);
    vi.mocked(createCalendarEventForCompany).mockResolvedValue({ id: "e5" } as any);

    const res = await WEBHOOK_POST(makeWebhookRequest({
      ...validWebhookBody,
      color: "#4285F4",
    }));
    expect(res.status).toBe(200);
    expect(createCalendarEventForCompany).toHaveBeenCalledWith(
      100,
      1,
      {
        title: "Webhook Event",
        description: null,
        startTime: new Date("2025-06-01T10:00:00Z"),
        endTime: new Date("2025-06-01T11:00:00Z"),
        color: "#4285F4",
      },
    );
  });

  // ── Idempotency caching ──
  it("caches idempotency result after successful creation", async () => {
    vi.mocked(checkIdempotencyKey).mockResolvedValue({ key: "idem-99", cachedResponse: null });
    vi.mocked(prisma.calendarEvent.count).mockResolvedValue(0);
    const event = { id: "e4", title: "Webhook Event" };
    vi.mocked(createCalendarEventForCompany).mockResolvedValue(event as any);

    const res = await WEBHOOK_POST(makeWebhookRequest(validWebhookBody, { "x-idempotency-key": "idem-99" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, event });
    expect(checkIdempotencyKey).toHaveBeenCalledWith(expect.anything(), "calendar");
    expect(setIdempotencyResult).toHaveBeenCalledWith(
      "calendar",
      "idem-99",
      200,
      { success: true, event },
    );
  });

  it("does NOT call setIdempotencyResult when no idempotency key", async () => {
    vi.mocked(checkIdempotencyKey).mockResolvedValue({ key: null, cachedResponse: null });
    vi.mocked(prisma.calendarEvent.count).mockResolvedValue(0);
    vi.mocked(createCalendarEventForCompany).mockResolvedValue({ id: "e6" } as any);

    const res = await WEBHOOK_POST(makeWebhookRequest(validWebhookBody));
    expect(res.status).toBe(200);
    expect(setIdempotencyResult).not.toHaveBeenCalled();
  });

  // ── Trim & passthrough ──
  it("trims whitespace from title before creating event", async () => {
    vi.mocked(prisma.calendarEvent.count).mockResolvedValue(0);
    vi.mocked(createCalendarEventForCompany).mockResolvedValue({ id: "e-trim" } as any);

    const res = await WEBHOOK_POST(makeWebhookRequest({
      title: "  Spaced Title  ",
      start_time: "2025-06-01T10:00:00Z",
      end_time: "2025-06-01T11:00:00Z",
    }));
    expect(res.status).toBe(200);
    expect(createCalendarEventForCompany).toHaveBeenCalledWith(
      100,
      1,
      {
        title: "Spaced Title",
        description: null,
        startTime: new Date("2025-06-01T10:00:00Z"),
        endTime: new Date("2025-06-01T11:00:00Z"),
        color: "blue",
      },
    );
  });

  it("passes through trimmed description when provided", async () => {
    vi.mocked(prisma.calendarEvent.count).mockResolvedValue(0);
    vi.mocked(createCalendarEventForCompany).mockResolvedValue({ id: "e-desc" } as any);

    const res = await WEBHOOK_POST(makeWebhookRequest({
      title: "Event With Desc",
      start_time: "2025-06-01T10:00:00Z",
      end_time: "2025-06-01T11:00:00Z",
      description: "  Team sync notes  ",
    }));
    expect(res.status).toBe(200);
    expect(createCalendarEventForCompany).toHaveBeenCalledWith(
      100,
      1,
      {
        title: "Event With Desc",
        description: "Team sync notes",
        startTime: new Date("2025-06-01T10:00:00Z"),
        endTime: new Date("2025-06-01T11:00:00Z"),
        color: "blue",
      },
    );
  });

  it("treats empty description string as null", async () => {
    vi.mocked(prisma.calendarEvent.count).mockResolvedValue(0);
    vi.mocked(createCalendarEventForCompany).mockResolvedValue({ id: "e-empty-desc" } as any);

    const res = await WEBHOOK_POST(makeWebhookRequest({
      ...validWebhookBody,
      description: "",
    }));
    expect(res.status).toBe(200);
    expect(createCalendarEventForCompany).toHaveBeenCalledWith(
      100,
      1,
      {
        title: "Webhook Event",
        description: null,
        startTime: new Date("2025-06-01T10:00:00Z"),
        endTime: new Date("2025-06-01T11:00:00Z"),
        color: "blue",
      },
    );
  });

  it("treats whitespace-only description as null", async () => {
    vi.mocked(prisma.calendarEvent.count).mockResolvedValue(0);
    vi.mocked(createCalendarEventForCompany).mockResolvedValue({ id: "e-ws-desc" } as any);

    const res = await WEBHOOK_POST(makeWebhookRequest({
      ...validWebhookBody,
      description: "   ",
    }));
    expect(res.status).toBe(200);
    expect(createCalendarEventForCompany).toHaveBeenCalledWith(
      100,
      1,
      {
        title: "Webhook Event",
        description: null,
        startTime: new Date("2025-06-01T10:00:00Z"),
        endTime: new Date("2025-06-01T11:00:00Z"),
        color: "blue",
      },
    );
  });

  it("defaults to 'blue' when color is explicitly null", async () => {
    vi.mocked(prisma.calendarEvent.count).mockResolvedValue(0);
    vi.mocked(createCalendarEventForCompany).mockResolvedValue({ id: "e-null-color" } as any);

    const res = await WEBHOOK_POST(makeWebhookRequest({
      ...validWebhookBody,
      color: null,
    }));
    expect(res.status).toBe(200);
    expect(createCalendarEventForCompany).toHaveBeenCalledWith(
      100,
      1,
      {
        title: "Webhook Event",
        description: null,
        startTime: new Date("2025-06-01T10:00:00Z"),
        endTime: new Date("2025-06-01T11:00:00Z"),
        color: "blue",
      },
    );
  });

  // ── Error ──
  it("returns 500 on unexpected error", async () => {
    vi.mocked(prisma.calendarEvent.count).mockResolvedValue(0);
    vi.mocked(createCalendarEventForCompany).mockRejectedValue(new Error("DB crash"));

    const res = await WEBHOOK_POST(makeWebhookRequest(validWebhookBody));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal Server Error" });
  });
});

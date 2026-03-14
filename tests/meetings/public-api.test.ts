import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ──────────────────────────────────────────────────────────

vi.mock("@/lib/prisma", () => {
  const meetingType = { findFirst: vi.fn() };
  const meeting = { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), create: vi.fn() };
  const calendarEvent = { findMany: vi.fn(), create: vi.fn(), update: vi.fn() };
  const client = { findFirst: vi.fn(), create: vi.fn() };
  const user = { findMany: vi.fn().mockResolvedValue([]) };
  return { prisma: { meetingType, meeting, calendarEvent, client, user, $transaction: vi.fn() } };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(),
  RATE_LIMITS: {
    publicBooking: { prefix: "pub-book", max: 10, windowSeconds: 60 },
    publicManageRead: { prefix: "pub-manage", max: 20, windowSeconds: 60 },
  },
}));
vi.mock("@/lib/meeting-validation", () => ({
  validateBookingInput: vi.fn(),
}));
vi.mock("@/lib/meeting-slots", () => ({
  isSlotAvailable: vi.fn(),
}));
vi.mock("@/lib/notifications-internal", () => ({
  createNotificationForCompany: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/app/actions/meeting-automations", () => ({
  fireMeetingAutomations: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/notification-settings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/notification-settings")>();
  return {
    ...actual,
    isNotificationEnabled: vi.fn().mockResolvedValue(false),
  };
});
vi.mock("@/lib/crypto-tokens", () => ({
  SECURE_TOKEN_RE: /^[A-Za-z0-9_-]{20,64}$/,
  generateSecureToken: vi.fn().mockReturnValue("mock-manage-token-12345678"),
}));
vi.mock("@/lib/security/audit-security", () => ({
  logSecurityEvent: vi.fn(),
  SEC_MEETING_BOOKED: "MEETING_BOOKED",
  SEC_MEETING_RESCHEDULED: "MEETING_RESCHEDULED",
  SEC_MEETING_CANCELLED: "MEETING_CANCELLED",
}));
vi.mock("@/lib/with-metrics", () => ({
  withMetrics: vi.fn((_name: string, handler: any) => handler),
}));
vi.mock("@/lib/request-ip", () => ({
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));
vi.mock("@/lib/server-action-utils", () => ({
  validateJsonValue: vi.fn((val: any) => val),
}));

import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { validateBookingInput } from "@/lib/meeting-validation";
import { isSlotAvailable } from "@/lib/meeting-slots";
import { createNotificationForCompany } from "@/lib/notifications-internal";
import { fireMeetingAutomations } from "@/app/actions/meeting-automations";
import { isNotificationEnabled } from "@/lib/notification-settings";

// Route handlers
import { GET as getToken } from "@/app/api/p/meetings/[token]/route";
import { POST as postBook } from "@/app/api/p/meetings/[token]/book/route";
import { GET as getManage } from "@/app/api/p/meetings/manage/[manageToken]/route";
import { POST as postReschedule } from "@/app/api/p/meetings/manage/[manageToken]/reschedule/route";
import { POST as postCancel } from "@/app/api/p/meetings/manage/[manageToken]/cancel/route";

// ── Helpers ────────────────────────────────────────────────────────

function makeRequest(opts: { method?: string; body?: any; ip?: string; headers?: Record<string, string> } = {}) {
  const h = new Headers(opts.headers || {});
  if (opts.ip) h.set("x-forwarded-for", opts.ip);
  if (opts.body !== undefined && !h.has("content-type")) {
    h.set("content-type", "application/json");
  }
  return new NextRequest("http://localhost/api/p/meetings/test", {
    method: opts.method || "GET",
    headers: h,
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
}

function params(token: string) {
  return { params: Promise.resolve({ token }) };
}

function manageParams(manageToken: string) {
  return { params: Promise.resolve({ manageToken }) };
}

async function jsonBody(response: Response) {
  return response.json();
}

beforeEach(() => {
  vi.clearAllMocks();
  (checkRateLimit as any).mockResolvedValue(null);
});

// ════════════════════════════════════════════════════════════════════
// GET /api/p/meetings/[token] — meeting type info
// ════════════════════════════════════════════════════════════════════
describe("GET /api/p/meetings/[token]", () => {
  it("returns 404 for token shorter than 20 chars", async () => {
    const res = await getToken(makeRequest(), params("short"));
    expect(res.status).toBe(404);
    expect(await jsonBody(res)).toEqual({ error: "Not found" });
  });

  it("returns 404 for token longer than 64 chars", async () => {
    const res = await getToken(makeRequest(), params("a".repeat(65)));
    expect(res.status).toBe(404);
    expect(await jsonBody(res)).toEqual({ error: "Not found" });
  });

  it("returns 404 for token with special chars", async () => {
    const res = await getToken(makeRequest(), params("abcde!@#$%fgh"));
    expect(res.status).toBe(404);
    expect(await jsonBody(res)).toEqual({ error: "Not found" });
  });

  it("accepts 20-char alphanumeric token", async () => {
    (prisma as any).meetingType.findFirst.mockResolvedValue(null);
    const res = await getToken(makeRequest(), params("a".repeat(20)));
    // Should reach DB lookup, not fail token validation
    expect(res.status).toBe(404);
  });

  it("accepts 64-char alphanumeric token", async () => {
    (prisma as any).meetingType.findFirst.mockResolvedValue(null);
    const res = await getToken(makeRequest(), params("a".repeat(64)));
    expect(res.status).toBe(404);
  });

  it("returns 404 when no active meeting type found", async () => {
    (prisma as any).meetingType.findFirst.mockResolvedValue(null);
    const res = await getToken(makeRequest(), params("abcdefghij1234567890"));
    expect(res.status).toBe(404);
    expect(await jsonBody(res)).toEqual({ error: "Not found" });
  });

  it("queries with isActive:true", async () => {
    (prisma as any).meetingType.findFirst.mockResolvedValue(null);
    await getToken(makeRequest(), params("abcdefghij1234567890"));
    expect((prisma as any).meetingType.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { shareToken: "abcdefghij1234567890", isActive: true } }),
    );
  });

  it("uses availabilityOverride when present", async () => {
    const override = { "0": [{ start: "10:00", end: "14:00" }], "3": [{ start: "08:00", end: "12:00" }] };
    (prisma as any).meetingType.findFirst.mockResolvedValue({
      id: 1, name: "Test", duration: 30, availabilityOverride: override,
      companyId: 10, company: { name: "Co", logoUrl: null, companyAvailability: null },
    });
    const res = await getToken(makeRequest(), params("abcdefghij1234567890"));
    const body = await jsonBody(res);
    expect(body.availableDays).toEqual([0, 3]);
  });

  it("falls back to company schedule when no override", async () => {
    const companySchedule = {
      "0": [{ start: "09:00", end: "17:00" }],
      "1": [{ start: "09:00", end: "17:00" }],
      "2": [],
      "3": [],
      "4": [],
      "5": [],
      "6": [],
    };
    (prisma as any).meetingType.findFirst.mockResolvedValue({
      id: 1, name: "Test", duration: 30, availabilityOverride: null,
      companyId: 10, company: { name: "Co", logoUrl: null, companyAvailability: { weeklySchedule: companySchedule } },
    });
    const res = await getToken(makeRequest(), params("abcdefghij1234567890"));
    const body = await jsonBody(res);
    expect(body.availableDays).toEqual([0, 1]);
  });

  it("falls back to default Sun-Thu 09-17 when no override or company schedule", async () => {
    (prisma as any).meetingType.findFirst.mockResolvedValue({
      id: 1, name: "Test", duration: 30, availabilityOverride: null,
      companyId: 10, company: { name: "Co", logoUrl: null, companyAvailability: null },
    });
    const res = await getToken(makeRequest(), params("abcdefghij1234567890"));
    const body = await jsonBody(res);
    // Default: days 0-4 have windows, 5-6 are empty
    expect(body.availableDays).toEqual([0, 1, 2, 3, 4]);
  });

  it("omits companyId and availabilityOverride from response", async () => {
    (prisma as any).meetingType.findFirst.mockResolvedValue({
      id: 1, name: "Test", duration: 30, availabilityOverride: null,
      companyId: 10, company: { name: "Co", logoUrl: null, companyAvailability: null },
    });
    const res = await getToken(makeRequest(), params("abcdefghij1234567890"));
    const body = await jsonBody(res);
    expect(body.companyId).toBeUndefined();
    expect(body.availabilityOverride).toBeUndefined();
  });

  it("propagates DB error as unhandled (no try/catch in route)", async () => {
    (prisma as any).meetingType.findFirst.mockRejectedValue(new Error("DB down"));
    await expect(getToken(makeRequest(), params("abcdefghij1234567890"))).rejects.toThrow("DB down");
  });

  it("returns availableDays as number array", async () => {
    (prisma as any).meetingType.findFirst.mockResolvedValue({
      id: 1, name: "Test", duration: 30, availabilityOverride: null,
      companyId: 10, company: { name: "Co", logoUrl: null, companyAvailability: null },
    });
    const res = await getToken(makeRequest(), params("abcdefghij1234567890"));
    const body = await jsonBody(res);
    for (const day of body.availableDays) {
      expect(typeof day).toBe("number");
    }
  });
});

// ════════════════════════════════════════════════════════════════════
// POST /api/p/meetings/[token]/book
// ════════════════════════════════════════════════════════════════════
describe("POST /api/p/meetings/[token]/book", () => {
  const validBookingData = {
    participantName: "John",
    participantEmail: "john@test.com",
    participantPhone: "0501234567",
    startTime: "2027-06-01T10:00:00Z",
  };

  const meetingType = {
    id: 1, companyId: 10, name: "Consultation", duration: 30,
    color: "#blue", bufferBefore: 5, bufferAfter: 5,
    company: { notificationSettings: { autoCreateClientOnBooking: true, notifyOnMeetingBooked: true } },
  };

  function setupBookingMocks() {
    (validateBookingInput as any).mockReturnValue({
      valid: true,
      data: {
        participantName: "John",
        participantEmail: "john@test.com",
        participantPhone: "0501234567",
        startTime: new Date("2027-06-01T10:00:00Z"),
        customFieldData: undefined,
      },
    });
    (prisma as any).meetingType.findFirst.mockResolvedValue(meetingType);
    (isSlotAvailable as any).mockReturnValue(true);
    (prisma as any).meeting.findMany.mockResolvedValue([]);
    (prisma as any).calendarEvent.findMany.mockResolvedValue([]);

    // Transaction mock: execute the callback with the same prisma mock
    (prisma as any).$transaction.mockImplementation(async (fn: any) => fn((prisma as any)));
    (prisma as any).calendarEvent.create.mockResolvedValue({ id: "ce1" });
    (prisma as any).client.findFirst.mockResolvedValue({ id: 5 });
    (prisma as any).meeting.create.mockResolvedValue({ id: "m1", manageToken: "mgmt123456" });
  }

  it("returns 404 for invalid token", async () => {
    const req = makeRequest({ method: "POST", body: validBookingData });
    const res = await postBook(req, params("bad!"));
    expect(res.status).toBe(404);
    expect(await jsonBody(res)).toEqual({ error: "Not found" });
  });

  it("returns 429 when rate limited", async () => {
    const rateLimitResponse = new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429 });
    (checkRateLimit as any).mockResolvedValue(rateLimitResponse);
    const req = makeRequest({ method: "POST", body: validBookingData, ip: "1.2.3.4" });
    const res = await postBook(req, params("abcdefghij1234567890"));
    expect(res.status).toBe(429);
  });

  it("passes getClientIp result to checkRateLimit", async () => {
    const { getClientIp } = await import("@/lib/request-ip");
    (getClientIp as any).mockReturnValue("1.2.3.4");
    (checkRateLimit as any).mockResolvedValue(null);
    (validateBookingInput as any).mockReturnValue({ valid: false, error: "test" });
    const req = makeRequest({ method: "POST", body: validBookingData });
    await postBook(req, params("abcdefghij1234567890"));
    expect(checkRateLimit).toHaveBeenCalledWith("1.2.3.4", expect.any(Object));
    // Reset mock
    (getClientIp as any).mockReturnValue("127.0.0.1");
  });

  it("returns 400 when body validation fails", async () => {
    (validateBookingInput as any).mockReturnValue({ valid: false, error: "שם נדרש" });
    const req = makeRequest({ method: "POST", body: {} });
    const res = await postBook(req, params("abcdefghij1234567890"));
    expect(res.status).toBe(400);
    expect(await jsonBody(res)).toEqual({ error: "שם נדרש" });
  });

  it("returns 404 when meeting type not found", async () => {
    (validateBookingInput as any).mockReturnValue({
      valid: true,
      data: { participantName: "J", participantEmail: "j@e.com", startTime: new Date() },
    });
    (prisma as any).meetingType.findFirst.mockResolvedValue(null);
    const req = makeRequest({ method: "POST", body: validBookingData });
    const res = await postBook(req, params("abcdefghij1234567890"));
    expect(res.status).toBe(404);
    expect(await jsonBody(res)).toEqual({ error: "Not found" });
  });

  it("returns 400 when pre-check slot unavailable", async () => {
    (validateBookingInput as any).mockReturnValue({
      valid: true,
      data: { participantName: "J", participantEmail: "j@e.com", startTime: new Date("2027-06-01T10:00:00Z") },
    });
    (prisma as any).meetingType.findFirst.mockResolvedValue(meetingType);
    (prisma as any).meeting.findMany.mockResolvedValue([]);
    (prisma as any).calendarEvent.findMany.mockResolvedValue([]);
    (isSlotAvailable as any).mockReturnValue(false);
    const req = makeRequest({ method: "POST", body: validBookingData });
    const res = await postBook(req, params("abcdefghij1234567890"));
    expect(res.status).toBe(400);
    expect(await jsonBody(res)).toEqual({ error: "Slot is no longer available" });
  });

  it("returns 400 when SLOT_TAKEN inside transaction", async () => {
    (validateBookingInput as any).mockReturnValue({
      valid: true,
      data: { participantName: "J", participantEmail: "j@e.com", startTime: new Date("2027-06-01T10:00:00Z") },
    });
    (prisma as any).meetingType.findFirst.mockResolvedValue(meetingType);
    (prisma as any).meeting.findMany.mockResolvedValue([]);
    (prisma as any).calendarEvent.findMany.mockResolvedValue([]);
    // First call (pre-check) returns true, second (in-transaction) returns false
    (isSlotAvailable as any).mockReturnValueOnce(true).mockReturnValueOnce(false);
    (prisma as any).$transaction.mockImplementation(async (fn: any) => fn((prisma as any)));

    const req = makeRequest({ method: "POST", body: validBookingData });
    const res = await postBook(req, params("abcdefghij1234567890"));
    expect(res.status).toBe(400);
    expect(await jsonBody(res)).toEqual({ error: "Slot is no longer available" });
  });

  it("creates calendarEvent, finds client, creates meeting in transaction (happy path)", async () => {
    setupBookingMocks();
    const req = makeRequest({ method: "POST", body: validBookingData });
    const res = await postBook(req, params("abcdefghij1234567890"));
    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.success).toBe(true);
    expect(body.manageToken).toBe("mgmt123456");

    // P1: Verify calendarEvent.create called with correct data
    const ceArgs = (prisma as any).calendarEvent.create.mock.calls[0][0];
    expect(ceArgs.data).toEqual({
      companyId: 10,
      title: "Consultation - John",
      startTime: new Date("2027-06-01T10:00:00Z"),
      endTime: new Date("2027-06-01T10:30:00Z"),
      color: "#blue",
    });

    // Client looked up
    expect((prisma as any).client.findFirst).toHaveBeenCalled();

    // P5: Verify meeting.create called with correct data
    const meetingArgs = (prisma as any).meeting.create.mock.calls[0][0];
    expect(meetingArgs.data).toEqual(expect.objectContaining({
      companyId: 10,
      meetingTypeId: 1,
      participantName: "John",
      participantEmail: "john@test.com",
      participantPhone: "0501234567",
      startTime: new Date("2027-06-01T10:00:00Z"),
      endTime: new Date("2027-06-01T10:30:00Z"),
      clientId: 5,
      calendarEventId: "ce1",
    }));
  });

  it("creates new client when none found", async () => {
    setupBookingMocks();
    (prisma as any).client.findFirst.mockResolvedValue(null);
    (prisma as any).client.create.mockResolvedValue({ id: 99 });
    const req = makeRequest({ method: "POST", body: validBookingData });
    await postBook(req, params("abcdefghij1234567890"));
    const clientArgs = (prisma as any).client.create.mock.calls[0][0];
    expect(clientArgs.data).toEqual({
      companyId: 10,
      name: "John",
      email: "john@test.com",
      phone: "0501234567",
    });
  });

  it("looks up client using OR (email/phone) + companyId", async () => {
    setupBookingMocks();
    const req = makeRequest({ method: "POST", body: validBookingData });
    await postBook(req, params("abcdefghij1234567890"));
    const clientCall = (prisma as any).client.findFirst.mock.calls[0][0];
    expect(clientCall.where.companyId).toBe(10);
    expect(clientCall.where.OR).toEqual(
      expect.arrayContaining([
        { email: "john@test.com" },
        { phone: "0501234567" },
      ]),
    );
  });

  it("calculates endTime = startTime + duration * 60_000", async () => {
    setupBookingMocks();
    const req = makeRequest({ method: "POST", body: validBookingData });
    await postBook(req, params("abcdefghij1234567890"));
    const ceArgs = (prisma as any).calendarEvent.create.mock.calls[0][0];
    const startMs = new Date("2027-06-01T10:00:00Z").getTime();
    const expectedEnd = new Date(startMs + 30 * 60_000);
    expect(ceArgs.data.endTime).toEqual(expectedEnd);
    const meetingArgs = (prisma as any).meeting.create.mock.calls[0][0];
    expect(meetingArgs.data.endTime).toEqual(expectedEnd);
  });

  it("builds client OR with email only (no phone)", async () => {
    setupBookingMocks();
    (validateBookingInput as any).mockReturnValue({
      valid: true,
      data: {
        participantName: "John",
        participantEmail: "john@test.com",
        participantPhone: undefined,
        startTime: new Date("2027-06-01T10:00:00Z"),
        customFieldData: undefined,
      },
    });
    const req = makeRequest({ method: "POST", body: { ...validBookingData, participantPhone: undefined } });
    await postBook(req, params("abcdefghij1234567890"));
    const clientCall = (prisma as any).client.findFirst.mock.calls[0][0];
    expect(clientCall.where.OR).toEqual([{ email: "john@test.com" }]);
  });

  it("builds client OR with phone only (no email)", async () => {
    setupBookingMocks();
    (validateBookingInput as any).mockReturnValue({
      valid: true,
      data: {
        participantName: "John",
        participantEmail: undefined,
        participantPhone: "0501234567",
        startTime: new Date("2027-06-01T10:00:00Z"),
        customFieldData: undefined,
      },
    });
    const req = makeRequest({ method: "POST", body: { ...validBookingData, participantEmail: undefined } });
    await postBook(req, params("abcdefghij1234567890"));
    const clientCall = (prisma as any).client.findFirst.mock.calls[0][0];
    expect(clientCall.where.OR).toEqual([{ phone: "0501234567" }]);
  });

  it("skips client lookup and creates client when no email AND no phone", async () => {
    setupBookingMocks();
    (validateBookingInput as any).mockReturnValue({
      valid: true,
      data: {
        participantName: "John",
        participantEmail: undefined,
        participantPhone: undefined,
        startTime: new Date("2027-06-01T10:00:00Z"),
        customFieldData: undefined,
      },
    });
    (prisma as any).client.create.mockResolvedValue({ id: 77 });

    const req = makeRequest({ method: "POST", body: { participantName: "John", startTime: "2027-06-01T10:00:00Z" } });
    const res = await postBook(req, params("abcdefghij1234567890"));
    expect(res.status).toBe(200);

    // client.findFirst should NOT have been called (clientWhereConditions is empty)
    expect((prisma as any).client.findFirst).not.toHaveBeenCalled();
    // client.create should have been called with null email and phone
    const clientCreateData = (prisma as any).client.create.mock.calls[0][0].data;
    expect(clientCreateData).toEqual({
      companyId: 10,
      name: "John",
      email: null,
      phone: null,
    });
  });

  it("dispatches admin notification after successful booking", async () => {
    setupBookingMocks();
    (prisma as any).user.findMany.mockResolvedValue([{ id: 100 }, { id: 200 }]);
    const req = makeRequest({ method: "POST", body: validBookingData });
    await postBook(req, params("abcdefghij1234567890"));

    // Flush fire-and-forget .then() chain
    await new Promise(r => setTimeout(r, 0));

    expect((prisma as any).user.findMany).toHaveBeenCalledWith({
      where: { companyId: 10, role: "admin" },
      select: { id: true },
      take: 25,
    });
    expect(createNotificationForCompany).toHaveBeenCalledTimes(2);
    expect(createNotificationForCompany).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 10,
        userId: 100,
        title: expect.stringContaining("John - Consultation"),
        link: "/meetings",
      }),
    );
    expect(createNotificationForCompany).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 10,
        userId: 200,
        title: expect.stringContaining("John - Consultation"),
        link: "/meetings",
      }),
    );
  });

  it("fires MEETING_BOOKED automation after successful booking", async () => {
    setupBookingMocks();
    const req = makeRequest({ method: "POST", body: validBookingData });
    await postBook(req, params("abcdefghij1234567890"));

    // Flush microtask for import(...).then(...)
    await new Promise(r => setTimeout(r, 0));

    expect(fireMeetingAutomations).toHaveBeenCalledWith(
      10,
      "MEETING_BOOKED",
      {
        id: "m1",
        meetingTypeId: 1,
        participantName: "John",
        participantEmail: "john@test.com",
        participantPhone: "0501234567",
        startTime: new Date("2027-06-01T10:00:00Z"),
        endTime: new Date("2027-06-01T10:30:00Z"),
        meetingTypeName: "Consultation",
      },
    );
  });

  it("returns 415 when content-type is missing", async () => {
    const req = new NextRequest("http://localhost/api/p/meetings/test", {
      method: "POST",
    });
    const res = await postBook(req, params("abcdefghij1234567890"));
    expect(res.status).toBe(415);
    expect(await jsonBody(res)).toEqual({ error: "Content-Type must be application/json" });
  });

  it("returns 500 when request body is invalid JSON", async () => {
    const req = new NextRequest("http://localhost/api/p/meetings/test", {
      method: "POST",
      body: "not json",
      headers: { "content-type": "application/json" },
    });
    const res = await postBook(req, params("abcdefghij1234567890"));
    expect(res.status).toBe(500);
    expect(await jsonBody(res)).toEqual({ error: "Internal server error" });
  });

  it("returns 500 on unexpected error", async () => {
    setupBookingMocks();
    (prisma as any).$transaction.mockRejectedValue(new Error("Unexpected"));
    const req = makeRequest({ method: "POST", body: validBookingData });
    const res = await postBook(req, params("abcdefghij1234567890"));
    expect(res.status).toBe(500);
    expect(await jsonBody(res)).toEqual({ error: "Internal server error" });
  });

  // ── Toggle-specific tests ────────────────────────────────────────

  it("does NOT create client when autoCreateClientOnBooking is OFF", async () => {
    const meetingTypeNoClient = {
      ...meetingType,
      company: { notificationSettings: { autoCreateClientOnBooking: false } },
    };
    (validateBookingInput as any).mockReturnValue({
      valid: true,
      data: {
        participantName: "John",
        participantEmail: "john@test.com",
        participantPhone: "0501234567",
        startTime: new Date("2027-06-01T10:00:00Z"),
        customFieldData: undefined,
      },
    });
    (prisma as any).meetingType.findFirst.mockResolvedValue(meetingTypeNoClient);
    (isSlotAvailable as any).mockReturnValue(true);
    (prisma as any).meeting.findMany.mockResolvedValue([]);
    (prisma as any).calendarEvent.findMany.mockResolvedValue([]);
    (prisma as any).$transaction.mockImplementation(async (fn: any) => fn((prisma as any)));
    (prisma as any).calendarEvent.create.mockResolvedValue({ id: "ce1" });
    (prisma as any).meeting.create.mockResolvedValue({ id: "m1", manageToken: "mgmt123456" });

    const req = makeRequest({ method: "POST", body: validBookingData });
    const res = await postBook(req, params("abcdefghij1234567890"));
    expect(res.status).toBe(200);

    // Client should NOT be looked up or created
    expect((prisma as any).client.findFirst).not.toHaveBeenCalled();
    expect((prisma as any).client.create).not.toHaveBeenCalled();

    // Meeting should be created with clientId: null
    const meetingArgs = (prisma as any).meeting.create.mock.calls[0][0];
    expect(meetingArgs.data.clientId).toBeNull();
  });

  it("does NOT send notification when notifyOnMeetingBooked is OFF", async () => {
    const meetingTypeNoNotif = {
      ...meetingType,
      company: { notificationSettings: { autoCreateClientOnBooking: true, notifyOnMeetingBooked: false } },
    };
    (validateBookingInput as any).mockReturnValue({
      valid: true,
      data: {
        participantName: "John",
        participantEmail: "john@test.com",
        participantPhone: "0501234567",
        startTime: new Date("2027-06-01T10:00:00Z"),
        customFieldData: undefined,
      },
    });
    (prisma as any).meetingType.findFirst.mockResolvedValue(meetingTypeNoNotif);
    (isSlotAvailable as any).mockReturnValue(true);
    (prisma as any).meeting.findMany.mockResolvedValue([]);
    (prisma as any).calendarEvent.findMany.mockResolvedValue([]);
    (prisma as any).$transaction.mockImplementation(async (fn: any) => fn((prisma as any)));
    (prisma as any).calendarEvent.create.mockResolvedValue({ id: "ce1" });
    (prisma as any).client.findFirst.mockResolvedValue({ id: 5 });
    (prisma as any).meeting.create.mockResolvedValue({ id: "m1", manageToken: "mgmt123456" });
    (prisma as any).user.findMany.mockResolvedValue([{ id: 100 }]);

    const req = makeRequest({ method: "POST", body: validBookingData });
    await postBook(req, params("abcdefghij1234567890"));

    await new Promise(r => setTimeout(r, 0));

    // Notification should NOT be sent — admin lookup should not even happen
    expect(createNotificationForCompany).not.toHaveBeenCalled();
  });

  it("does NOT send notification when company has no notificationSettings (default OFF)", async () => {
    const meetingTypeEmpty = {
      ...meetingType,
      company: { notificationSettings: null },
    };
    (validateBookingInput as any).mockReturnValue({
      valid: true,
      data: {
        participantName: "John",
        participantEmail: "john@test.com",
        participantPhone: "0501234567",
        startTime: new Date("2027-06-01T10:00:00Z"),
        customFieldData: undefined,
      },
    });
    (prisma as any).meetingType.findFirst.mockResolvedValue(meetingTypeEmpty);
    (isSlotAvailable as any).mockReturnValue(true);
    (prisma as any).meeting.findMany.mockResolvedValue([]);
    (prisma as any).calendarEvent.findMany.mockResolvedValue([]);
    (prisma as any).$transaction.mockImplementation(async (fn: any) => fn((prisma as any)));
    (prisma as any).calendarEvent.create.mockResolvedValue({ id: "ce1" });
    (prisma as any).meeting.create.mockResolvedValue({ id: "m1", manageToken: "mgmt123456" });

    const req = makeRequest({ method: "POST", body: validBookingData });
    const res = await postBook(req, params("abcdefghij1234567890"));
    expect(res.status).toBe(200);

    await new Promise(r => setTimeout(r, 0));

    // Both client and notification should be skipped
    expect((prisma as any).client.findFirst).not.toHaveBeenCalled();
    expect((prisma as any).client.create).not.toHaveBeenCalled();
    expect(createNotificationForCompany).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════
// GET /api/p/meetings/manage/[manageToken]
// ════════════════════════════════════════════════════════════════════
describe("GET /api/p/meetings/manage/[manageToken]", () => {
  it("returns 404 for invalid token", async () => {
    const res = await getManage(makeRequest(), manageParams("short"));
    expect(res.status).toBe(404);
    expect(await jsonBody(res)).toEqual({ error: "Not found" });
  });

  it("returns 404 for token with special chars", async () => {
    const res = await getManage(makeRequest(), manageParams("abc!@#de123"));
    expect(res.status).toBe(404);
    expect(await jsonBody(res)).toEqual({ error: "Not found" });
  });

  it("returns 404 when not found", async () => {
    (prisma as any).meeting.findUnique.mockResolvedValue(null);
    const res = await getManage(makeRequest(), manageParams("abcdefghij1234567890"));
    expect(res.status).toBe(404);
    expect(await jsonBody(res)).toEqual({ error: "Not found" });
  });

  it("returns meeting data with meetingType and company", async () => {
    const meeting = {
      participantName: "John", participantEmail: "j@e.com",
      startTime: new Date(), endTime: new Date(), status: "PENDING",
      meetingType: { name: "Test", duration: 30, color: "#red", shareToken: "abc" },
      company: { name: "Co", logoUrl: null },
    };
    (prisma as any).meeting.findUnique.mockResolvedValue(meeting);
    const res = await getManage(makeRequest(), manageParams("abcdefghij1234567890"));
    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.participantName).toBe("John");
    expect(body.meetingType.name).toBe("Test");
    expect(body.company.name).toBe("Co");
  });

  it("queries by manageToken (findUnique)", async () => {
    (prisma as any).meeting.findUnique.mockResolvedValue(null);
    await getManage(makeRequest(), manageParams("abcdefghij1234567890"));
    expect((prisma as any).meeting.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { manageToken: "abcdefghij1234567890" } }),
    );
  });

  it("propagates DB error as unhandled (no try/catch in route)", async () => {
    (prisma as any).meeting.findUnique.mockRejectedValue(new Error("DB down"));
    await expect(getManage(makeRequest(), manageParams("abcdefghij1234567890"))).rejects.toThrow("DB down");
  });
});

// ════════════════════════════════════════════════════════════════════
// POST /api/p/meetings/manage/[manageToken]/reschedule
// ════════════════════════════════════════════════════════════════════
describe("POST /api/p/meetings/manage/[manageToken]/reschedule", () => {
  const meetingData = {
    id: "m1", companyId: 10, status: "PENDING", participantName: "John",
    calendarEventId: "ce1",
    meetingType: { name: "Test", duration: 30, bufferBefore: 5, bufferAfter: 5 },
  };

  it("returns 404 for invalid token", async () => {
    const req = makeRequest({ method: "POST", body: { startTime: "2027-06-01T10:00:00Z" } });
    const res = await postReschedule(req, manageParams("bad!"));
    expect(res.status).toBe(404);
    expect(await jsonBody(res)).toEqual({ error: "Not found" });
  });

  it("returns 429 when rate limited", async () => {
    const rateLimitResponse = new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429 });
    (checkRateLimit as any).mockResolvedValue(rateLimitResponse);
    const req = makeRequest({ method: "POST", body: { startTime: "2027-06-01T10:00:00Z" }, ip: "1.2.3.4" });
    const res = await postReschedule(req, manageParams("abcdefghij1234567890"));
    expect(res.status).toBe(429);
  });

  it("returns 404 when not found", async () => {
    (prisma as any).meeting.findUnique.mockResolvedValue(null);
    const req = makeRequest({ method: "POST", body: { startTime: "2027-06-01T10:00:00Z" } });
    const res = await postReschedule(req, manageParams("abcdefghij1234567890"));
    expect(res.status).toBe(404);
    expect(await jsonBody(res)).toEqual({ error: "Not found" });
  });

  it("returns 400 for CANCELLED meeting", async () => {
    (prisma as any).meeting.findUnique.mockResolvedValue({ ...meetingData, status: "CANCELLED" });
    const req = makeRequest({ method: "POST", body: { startTime: "2027-06-01T10:00:00Z" } });
    const res = await postReschedule(req, manageParams("abcdefghij1234567890"));
    expect(res.status).toBe(400);
    expect(await jsonBody(res)).toEqual({ error: "Meeting cannot be rescheduled" });
  });

  it("returns 400 for COMPLETED meeting", async () => {
    (prisma as any).meeting.findUnique.mockResolvedValue({ ...meetingData, status: "COMPLETED" });
    const req = makeRequest({ method: "POST", body: { startTime: "2027-06-01T10:00:00Z" } });
    const res = await postReschedule(req, manageParams("abcdefghij1234567890"));
    expect(res.status).toBe(400);
    expect(await jsonBody(res)).toEqual({ error: "Meeting cannot be rescheduled" });
  });

  it("allows rescheduling CONFIRMED meeting", async () => {
    (prisma as any).meeting.findUnique.mockResolvedValue({ ...meetingData, status: "CONFIRMED" });
    (isSlotAvailable as any).mockReturnValue(true);
    (prisma as any).$transaction.mockImplementation(async (fn: any) => fn((prisma as any)));
    (prisma as any).meeting.update.mockResolvedValue({});
    (prisma as any).calendarEvent.update.mockResolvedValue({});
    (prisma as any).meeting.findMany.mockResolvedValue([]);
    (prisma as any).calendarEvent.findMany.mockResolvedValue([]);

    const req = makeRequest({ method: "POST", body: { startTime: "2027-06-01T10:00:00Z" } });
    const res = await postReschedule(req, manageParams("abcdefghij1234567890"));
    expect(res.status).toBe(200);
    expect(await jsonBody(res)).toEqual({ success: true });
  });

  it("returns 400 when startTime is missing", async () => {
    (prisma as any).meeting.findUnique.mockResolvedValue(meetingData);
    const req = makeRequest({ method: "POST", body: {} });
    const res = await postReschedule(req, manageParams("abcdefghij1234567890"));
    expect(res.status).toBe(400);
    expect(await jsonBody(res)).toEqual({ error: "startTime is required" });
  });

  it("returns 400 when startTime is not a string", async () => {
    (prisma as any).meeting.findUnique.mockResolvedValue(meetingData);
    const req = makeRequest({ method: "POST", body: { startTime: 12345 } });
    const res = await postReschedule(req, manageParams("abcdefghij1234567890"));
    expect(res.status).toBe(400);
    expect(await jsonBody(res)).toEqual({ error: "startTime is required" });
  });

  it("returns 400 for invalid startTime", async () => {
    (prisma as any).meeting.findUnique.mockResolvedValue(meetingData);
    const req = makeRequest({ method: "POST", body: { startTime: "not-a-date" } });
    const res = await postReschedule(req, manageParams("abcdefghij1234567890"));
    expect(res.status).toBe(400);
    expect(await jsonBody(res)).toEqual({ error: "Invalid startTime" });
  });

  it("calculates newEnd = newStart + duration*60000", async () => {
    (prisma as any).meeting.findUnique.mockResolvedValue(meetingData);
    (isSlotAvailable as any).mockReturnValue(true);
    (prisma as any).$transaction.mockImplementation(async (fn: any) => fn((prisma as any)));
    (prisma as any).meeting.update.mockResolvedValue({});
    (prisma as any).calendarEvent.update.mockResolvedValue({});

    const req = makeRequest({ method: "POST", body: { startTime: "2027-06-01T10:00:00Z" } });
    await postReschedule(req, manageParams("abcdefghij1234567890"));

    // The meeting.update call inside transaction should have endTime = start + 30min
    const updateCall = (prisma as any).meeting.update.mock.calls[0][0];
    const expectedEnd = new Date("2027-06-01T10:30:00Z");
    expect(updateCall.data.endTime).toEqual(expectedEnd);
  });

  it("returns 400 when SLOT_TAKEN in transaction", async () => {
    (prisma as any).meeting.findUnique.mockResolvedValue(meetingData);
    (isSlotAvailable as any).mockReturnValue(false);
    (prisma as any).$transaction.mockImplementation(async (fn: any) => fn((prisma as any)));
    (prisma as any).meeting.findMany.mockResolvedValue([]);
    (prisma as any).calendarEvent.findMany.mockResolvedValue([]);

    const req = makeRequest({ method: "POST", body: { startTime: "2027-06-01T10:00:00Z" } });
    const res = await postReschedule(req, manageParams("abcdefghij1234567890"));
    expect(res.status).toBe(400);
    expect(await jsonBody(res)).toEqual({ error: "Slot is no longer available" });
  });

  it("excludes current meeting id from overlap check", async () => {
    (prisma as any).meeting.findUnique.mockResolvedValue(meetingData);
    (isSlotAvailable as any).mockReturnValue(true);
    (prisma as any).$transaction.mockImplementation(async (fn: any) => fn((prisma as any)));
    (prisma as any).meeting.update.mockResolvedValue({});
    (prisma as any).calendarEvent.update.mockResolvedValue({});
    (prisma as any).meeting.findMany.mockResolvedValue([]);
    (prisma as any).calendarEvent.findMany.mockResolvedValue([]);

    const req = makeRequest({ method: "POST", body: { startTime: "2027-06-01T10:00:00Z" } });
    await postReschedule(req, manageParams("abcdefghij1234567890"));

    const meetingQuery = (prisma as any).meeting.findMany.mock.calls[0][0];
    expect(meetingQuery.where.id).toEqual({ not: "m1" });
  });

  it("excludes current calendarEvent from overlap check", async () => {
    (prisma as any).meeting.findUnique.mockResolvedValue(meetingData);
    (isSlotAvailable as any).mockReturnValue(true);
    (prisma as any).$transaction.mockImplementation(async (fn: any) => fn((prisma as any)));
    (prisma as any).meeting.update.mockResolvedValue({});
    (prisma as any).calendarEvent.update.mockResolvedValue({});
    (prisma as any).meeting.findMany.mockResolvedValue([]);
    (prisma as any).calendarEvent.findMany.mockResolvedValue([]);

    const req = makeRequest({ method: "POST", body: { startTime: "2027-06-01T10:00:00Z" } });
    await postReschedule(req, manageParams("abcdefghij1234567890"));

    const ceQuery = (prisma as any).calendarEvent.findMany.mock.calls[0][0];
    expect(ceQuery.where.id).toEqual({ not: "ce1" });
  });

  it("updates both meeting and calendarEvent in transaction", async () => {
    (prisma as any).meeting.findUnique.mockResolvedValue(meetingData);
    (isSlotAvailable as any).mockReturnValue(true);
    (prisma as any).$transaction.mockImplementation(async (fn: any) => fn((prisma as any)));
    (prisma as any).meeting.update.mockResolvedValue({});
    (prisma as any).calendarEvent.update.mockResolvedValue({});
    (prisma as any).meeting.findMany.mockResolvedValue([]);
    (prisma as any).calendarEvent.findMany.mockResolvedValue([]);

    const req = makeRequest({ method: "POST", body: { startTime: "2027-06-01T10:00:00Z" } });
    const res = await postReschedule(req, manageParams("abcdefghij1234567890"));
    expect(res.status).toBe(200);
    expect(await jsonBody(res)).toEqual({ success: true });

    const meetingUpdateCall = (prisma as any).meeting.update.mock.calls[0][0];
    expect(meetingUpdateCall.where).toEqual({ id: "m1" });
    expect(meetingUpdateCall.data.startTime).toEqual(new Date("2027-06-01T10:00:00Z"));
    expect(meetingUpdateCall.data.endTime).toEqual(new Date("2027-06-01T10:30:00Z"));

    const ceUpdateCall = (prisma as any).calendarEvent.update.mock.calls[0][0];
    expect(ceUpdateCall.where).toEqual({ id: "ce1" });
    expect(ceUpdateCall.data.startTime).toEqual(new Date("2027-06-01T10:00:00Z"));
    expect(ceUpdateCall.data.endTime).toEqual(new Date("2027-06-01T10:30:00Z"));
  });

  it("skips calendarEvent update when calendarEventId is null", async () => {
    (prisma as any).meeting.findUnique.mockResolvedValue({ ...meetingData, calendarEventId: null });
    (isSlotAvailable as any).mockReturnValue(true);
    (prisma as any).$transaction.mockImplementation(async (fn: any) => fn((prisma as any)));
    (prisma as any).meeting.update.mockResolvedValue({});
    (prisma as any).meeting.findMany.mockResolvedValue([]);
    (prisma as any).calendarEvent.findMany.mockResolvedValue([]);

    const req = makeRequest({ method: "POST", body: { startTime: "2027-06-01T10:00:00Z" } });
    await postReschedule(req, manageParams("abcdefghij1234567890"));
    expect((prisma as any).calendarEvent.update).not.toHaveBeenCalled();
  });

  it("dispatches admin notification after successful reschedule", async () => {
    (isNotificationEnabled as any).mockResolvedValue(true);
    (prisma as any).meeting.findUnique.mockResolvedValue(meetingData);
    (isSlotAvailable as any).mockReturnValue(true);
    (prisma as any).$transaction.mockImplementation(async (fn: any) => fn((prisma as any)));
    (prisma as any).meeting.update.mockResolvedValue({});
    (prisma as any).calendarEvent.update.mockResolvedValue({});
    (prisma as any).meeting.findMany.mockResolvedValue([]);
    (prisma as any).calendarEvent.findMany.mockResolvedValue([]);
    (prisma as any).user.findMany.mockResolvedValue([{ id: 100 }, { id: 200 }]);

    const req = makeRequest({ method: "POST", body: { startTime: "2027-06-01T10:00:00Z" } });
    await postReschedule(req, manageParams("abcdefghij1234567890"));

    // Flush fire-and-forget .then() chain
    await new Promise(r => setTimeout(r, 0));

    expect((prisma as any).user.findMany).toHaveBeenCalledWith({
      where: { companyId: 10, role: "admin" },
      select: { id: true },
      take: 25,
    });
    expect(createNotificationForCompany).toHaveBeenCalledTimes(2);
    expect(createNotificationForCompany).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 10,
        userId: 100,
        title: expect.stringContaining("John - Test"),
        link: "/meetings",
      }),
    );
    expect(createNotificationForCompany).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 10,
        userId: 200,
        title: expect.stringContaining("John - Test"),
        link: "/meetings",
      }),
    );
  });

  it("does NOT send notification when notifyOnMeetingRescheduled is OFF (default)", async () => {
    (isNotificationEnabled as any).mockResolvedValue(false);
    (prisma as any).meeting.findUnique.mockResolvedValue(meetingData);
    (isSlotAvailable as any).mockReturnValue(true);
    (prisma as any).$transaction.mockImplementation(async (fn: any) => fn((prisma as any)));
    (prisma as any).meeting.update.mockResolvedValue({});
    (prisma as any).calendarEvent.update.mockResolvedValue({});
    (prisma as any).meeting.findMany.mockResolvedValue([]);
    (prisma as any).calendarEvent.findMany.mockResolvedValue([]);
    (prisma as any).user.findMany.mockResolvedValue([{ id: 100 }]);

    const req = makeRequest({ method: "POST", body: { startTime: "2027-06-01T10:00:00Z" } });
    await postReschedule(req, manageParams("abcdefghij1234567890"));

    await new Promise(r => setTimeout(r, 0));

    expect(createNotificationForCompany).not.toHaveBeenCalled();
  });

  it("allows rescheduling NO_SHOW meeting (not blocked like CANCELLED/COMPLETED)", async () => {
    (prisma as any).meeting.findUnique.mockResolvedValue({ ...meetingData, status: "NO_SHOW" });
    (isSlotAvailable as any).mockReturnValue(true);
    (prisma as any).$transaction.mockImplementation(async (fn: any) => fn((prisma as any)));
    (prisma as any).meeting.update.mockResolvedValue({});
    (prisma as any).calendarEvent.update.mockResolvedValue({});
    (prisma as any).meeting.findMany.mockResolvedValue([]);
    (prisma as any).calendarEvent.findMany.mockResolvedValue([]);

    const req = makeRequest({ method: "POST", body: { startTime: "2027-06-01T10:00:00Z" } });
    const res = await postReschedule(req, manageParams("abcdefghij1234567890"));
    expect(res.status).toBe(200);
    expect(await jsonBody(res)).toEqual({ success: true });
  });

  it("does not exclude any calendarEvent from overlap check when calendarEventId is null", async () => {
    (prisma as any).meeting.findUnique.mockResolvedValue({ ...meetingData, calendarEventId: null });
    (isSlotAvailable as any).mockReturnValue(true);
    (prisma as any).$transaction.mockImplementation(async (fn: any) => fn((prisma as any)));
    (prisma as any).meeting.update.mockResolvedValue({});
    (prisma as any).meeting.findMany.mockResolvedValue([]);
    (prisma as any).calendarEvent.findMany.mockResolvedValue([]);

    const req = makeRequest({ method: "POST", body: { startTime: "2027-06-01T10:00:00Z" } });
    const res = await postReschedule(req, manageParams("abcdefghij1234567890"));

    const ceQuery = (prisma as any).calendarEvent.findMany.mock.calls[0][0];
    expect(ceQuery.where.id).toBeUndefined();
    expect(res.status).toBe(200);
    expect(await jsonBody(res)).toEqual({ success: true });
  });

  it("returns 415 when content-type is missing", async () => {
    (prisma as any).meeting.findUnique.mockResolvedValue(meetingData);
    const req = new NextRequest("http://localhost/api/p/meetings/manage/abcdefghij1234567890/reschedule", {
      method: "POST",
    });
    const res = await postReschedule(req, manageParams("abcdefghij1234567890"));
    expect(res.status).toBe(415);
    expect(await jsonBody(res)).toEqual({ error: "Content-Type must be application/json" });
  });

  it("returns 500 when request body is invalid JSON", async () => {
    (prisma as any).meeting.findUnique.mockResolvedValue(meetingData);
    const req = new NextRequest("http://localhost/api/p/meetings/manage/abcdefghij1234567890/reschedule", {
      method: "POST",
      body: "not json",
      headers: { "content-type": "application/json" },
    });
    const res = await postReschedule(req, manageParams("abcdefghij1234567890"));
    expect(res.status).toBe(500);
    expect(await jsonBody(res)).toEqual({ error: "Internal server error" });
  });

  it("returns 500 on unexpected error", async () => {
    (prisma as any).meeting.findUnique.mockRejectedValue(new Error("Unexpected"));
    const req = makeRequest({ method: "POST", body: { startTime: "2027-06-01T10:00:00Z" } });
    const res = await postReschedule(req, manageParams("abcdefghij1234567890"));
    expect(res.status).toBe(500);
    expect(await jsonBody(res)).toEqual({ error: "Internal server error" });
  });
});

// ════════════════════════════════════════════════════════════════════
// POST /api/p/meetings/manage/[manageToken]/cancel
// ════════════════════════════════════════════════════════════════════
describe("POST /api/p/meetings/manage/[manageToken]/cancel", () => {
  const meetingData = {
    id: "m1", companyId: 10, status: "PENDING", participantName: "John",
    participantEmail: "j@e.com", participantPhone: "0501234567",
    startTime: new Date("2027-06-01T10:00:00Z"), endTime: new Date("2027-06-01T10:30:00Z"),
    meetingTypeId: 1, meetingType: { name: "Test" },
  };

  it("returns 404 for invalid token", async () => {
    const req = makeRequest({ method: "POST", body: {} });
    const res = await postCancel(req, manageParams("bad!"));
    expect(res.status).toBe(404);
    expect(await jsonBody(res)).toEqual({ error: "Not found" });
  });

  it("returns 429 when rate limited", async () => {
    const rateLimitResponse = new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429 });
    (checkRateLimit as any).mockResolvedValue(rateLimitResponse);
    const req = makeRequest({ method: "POST", body: {}, ip: "1.2.3.4" });
    const res = await postCancel(req, manageParams("abcdefghij1234567890"));
    expect(res.status).toBe(429);
  });

  it("returns 404 when not found", async () => {
    (prisma as any).meeting.findUnique.mockResolvedValue(null);
    const req = makeRequest({ method: "POST", body: {} });
    const res = await postCancel(req, manageParams("abcdefghij1234567890"));
    expect(res.status).toBe(404);
    expect(await jsonBody(res)).toEqual({ error: "Not found" });
  });

  it("returns 400 for CANCELLED meeting", async () => {
    (prisma as any).meeting.findUnique.mockResolvedValue({ ...meetingData, status: "CANCELLED" });
    const req = makeRequest({ method: "POST", body: {} });
    const res = await postCancel(req, manageParams("abcdefghij1234567890"));
    expect(res.status).toBe(400);
    expect(await jsonBody(res)).toEqual({ error: "Meeting cannot be cancelled" });
  });

  it("returns 400 for COMPLETED meeting", async () => {
    (prisma as any).meeting.findUnique.mockResolvedValue({ ...meetingData, status: "COMPLETED" });
    const req = makeRequest({ method: "POST", body: {} });
    const res = await postCancel(req, manageParams("abcdefghij1234567890"));
    expect(res.status).toBe(400);
    expect(await jsonBody(res)).toEqual({ error: "Meeting cannot be cancelled" });
  });

  it("sets cancelledBy to 'participant' (not 'owner')", async () => {
    (prisma as any).meeting.findUnique.mockResolvedValue(meetingData);
    (prisma as any).meeting.update.mockResolvedValue({});
    const req = makeRequest({ method: "POST", body: {} });
    await postCancel(req, manageParams("abcdefghij1234567890"));
    const data = (prisma as any).meeting.update.mock.calls[0][0].data;
    expect(data.cancelledBy).toBe("participant");
    expect(data.status).toBe("CANCELLED");
    expect(data.cancelledAt).toBeInstanceOf(Date);
  });

  it("parses optional reason from body and truncates to 1000", async () => {
    (prisma as any).meeting.findUnique.mockResolvedValue(meetingData);
    (prisma as any).meeting.update.mockResolvedValue({});
    const longReason = "r".repeat(2000);
    const req = makeRequest({ method: "POST", body: { reason: longReason } });
    await postCancel(req, manageParams("abcdefghij1234567890"));
    const data = (prisma as any).meeting.update.mock.calls[0][0].data;
    expect(data.cancelReason!.length).toBe(1000);
  });

  it("stores normal-length reason as-is (under 1000 chars)", async () => {
    (prisma as any).meeting.findUnique.mockResolvedValue(meetingData);
    (prisma as any).meeting.update.mockResolvedValue({});
    const reason = "I have a conflict";
    const req = makeRequest({ method: "POST", body: { reason } });
    await postCancel(req, manageParams("abcdefghij1234567890"));
    const data = (prisma as any).meeting.update.mock.calls[0][0].data;
    expect(data.cancelReason).toBe("I have a conflict");
  });

  it("ignores non-string reason (e.g. number)", async () => {
    (prisma as any).meeting.findUnique.mockResolvedValue(meetingData);
    (prisma as any).meeting.update.mockResolvedValue({});
    const req = makeRequest({ method: "POST", body: { reason: 123 } });
    await postCancel(req, manageParams("abcdefghij1234567890"));
    const data = (prisma as any).meeting.update.mock.calls[0][0].data;
    expect(data.cancelReason).toBeUndefined();
  });

  it("returns 415 when content-type is missing", async () => {
    (prisma as any).meeting.findUnique.mockResolvedValue(meetingData);
    (prisma as any).meeting.update.mockResolvedValue({});
    const req = new NextRequest("http://localhost/api/p/meetings/manage/abcdefghij1234567890/cancel", {
      method: "POST",
    });
    const res = await postCancel(req, manageParams("abcdefghij1234567890"));
    expect(res.status).toBe(415);
    expect(await jsonBody(res)).toEqual({ error: "Content-Type must be application/json" });
  });

  it("handles invalid JSON body gracefully", async () => {
    (prisma as any).meeting.findUnique.mockResolvedValue(meetingData);
    (prisma as any).meeting.update.mockResolvedValue({});
    const req = new NextRequest("http://localhost/api/p/meetings/manage/abcdefghij1234567890/cancel", {
      method: "POST",
      body: "not json",
      headers: { "content-type": "application/json" },
    });
    const res = await postCancel(req, manageParams("abcdefghij1234567890"));
    expect(res.status).toBe(200);
    expect(await jsonBody(res)).toEqual({ success: true });
  });

  it("returns success on happy path", async () => {
    (prisma as any).meeting.findUnique.mockResolvedValue(meetingData);
    (prisma as any).meeting.update.mockResolvedValue({});
    const req = makeRequest({ method: "POST", body: { reason: "Can't make it" } });
    const res = await postCancel(req, manageParams("abcdefghij1234567890"));
    expect(res.status).toBe(200);
    expect(await jsonBody(res)).toEqual({ success: true });
  });

  it("dispatches admin notification after successful cancellation", async () => {
    (isNotificationEnabled as any).mockResolvedValue(true);
    (prisma as any).meeting.findUnique.mockResolvedValue(meetingData);
    (prisma as any).meeting.update.mockResolvedValue({});
    (prisma as any).user.findMany.mockResolvedValue([{ id: 100 }, { id: 200 }]);
    const req = makeRequest({ method: "POST", body: {} });
    await postCancel(req, manageParams("abcdefghij1234567890"));

    // Flush fire-and-forget .then() chain
    await new Promise(r => setTimeout(r, 0));

    expect((prisma as any).user.findMany).toHaveBeenCalledWith({
      where: { companyId: 10, role: "admin" },
      select: { id: true },
      take: 25,
    });
    expect(createNotificationForCompany).toHaveBeenCalledTimes(2);
    expect(createNotificationForCompany).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 10,
        userId: 100,
        title: expect.stringContaining("John - Test"),
        link: "/meetings",
      }),
    );
    expect(createNotificationForCompany).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 10,
        userId: 200,
        title: expect.stringContaining("John - Test"),
        link: "/meetings",
      }),
    );
  });

  it("fires MEETING_CANCELLED automation after successful cancellation", async () => {
    (prisma as any).meeting.findUnique.mockResolvedValue(meetingData);
    (prisma as any).meeting.update.mockResolvedValue({});
    const req = makeRequest({ method: "POST", body: {} });
    await postCancel(req, manageParams("abcdefghij1234567890"));

    // Flush microtask for import(...).then(...)
    await new Promise(r => setTimeout(r, 0));

    expect(fireMeetingAutomations).toHaveBeenCalledWith(
      10,
      "MEETING_CANCELLED",
      {
        id: "m1",
        meetingTypeId: 1,
        participantName: "John",
        participantEmail: "j@e.com",
        participantPhone: "0501234567",
        startTime: new Date("2027-06-01T10:00:00Z"),
        endTime: new Date("2027-06-01T10:30:00Z"),
        meetingTypeName: "Test",
      },
    );
  });

  it("allows cancelling NO_SHOW meeting (not blocked like CANCELLED/COMPLETED)", async () => {
    (prisma as any).meeting.findUnique.mockResolvedValue({ ...meetingData, status: "NO_SHOW" });
    (prisma as any).meeting.update.mockResolvedValue({});
    const req = makeRequest({ method: "POST", body: {} });
    const res = await postCancel(req, manageParams("abcdefghij1234567890"));
    expect(res.status).toBe(200);
    expect(await jsonBody(res)).toEqual({ success: true });
  });

  it("does NOT send notification when notifyOnMeetingCancelled is OFF (default)", async () => {
    (isNotificationEnabled as any).mockResolvedValue(false);
    (prisma as any).meeting.findUnique.mockResolvedValue(meetingData);
    (prisma as any).meeting.update.mockResolvedValue({});
    (prisma as any).user.findMany.mockResolvedValue([{ id: 100 }]);
    const req = makeRequest({ method: "POST", body: {} });
    await postCancel(req, manageParams("abcdefghij1234567890"));

    await new Promise(r => setTimeout(r, 0));

    expect(createNotificationForCompany).not.toHaveBeenCalled();
  });

  it("returns 500 on unexpected error", async () => {
    (prisma as any).meeting.findUnique.mockRejectedValue(new Error("Unexpected"));
    const req = makeRequest({ method: "POST", body: {} });
    const res = await postCancel(req, manageParams("abcdefghij1234567890"));
    expect(res.status).toBe(500);
    expect(await jsonBody(res)).toEqual({ error: "Internal server error" });
  });
});

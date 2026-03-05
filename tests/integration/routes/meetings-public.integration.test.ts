import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";

// ── Hoisted mocks ────────────────────────────────────────────────────
const {
  mockCheckRateLimit,
  mockCreateNotification,
  mockFireMeetingAutomations,
} = vi.hoisted(() => ({
  mockCheckRateLimit: vi.fn(),
  mockCreateNotification: vi.fn(),
  mockFireMeetingAutomations: vi.fn(),
}));

// ── Module mocks (external dependencies only) ────────────────────────

vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return {
    ...actual,
    checkRateLimit: mockCheckRateLimit,
  };
});

vi.mock("@/lib/notifications-internal", () => ({
  createNotificationForCompany: mockCreateNotification,
}));

vi.mock("@/app/actions/meeting-automations", () => ({
  fireMeetingAutomations: mockFireMeetingAutomations,
}));

vi.mock("@/lib/redis", () => {
  const noop = vi.fn().mockResolvedValue(null);
  return {
    redis: {
      get: noop,
      set: noop,
      del: noop,
      mget: noop.mockResolvedValue([null, null]),
      multi: vi.fn(() => ({
        incr: vi.fn().mockReturnThis(),
        expire: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([[null, 1]]),
      })),
      pipeline: vi.fn(() => ({
        set: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([]),
      })),
      scan: noop.mockResolvedValue(["0", []]),
      options: { keyPrefix: "" },
    },
    redisPublisher: { get: noop, set: noop, del: noop },
  };
});

// ── Import route handlers AFTER mocks ────────────────────────────────
import { GET as getMeetingTypeInfo } from "@/app/api/p/meetings/[token]/route";
import { GET as getSlots } from "@/app/api/p/meetings/[token]/slots/route";
import { POST as bookMeeting } from "@/app/api/p/meetings/[token]/book/route";
import { GET as getManageMeeting } from "@/app/api/p/meetings/manage/[manageToken]/route";
import { POST as rescheduleMeeting } from "@/app/api/p/meetings/manage/[manageToken]/reschedule/route";
import { POST as cancelMeeting } from "@/app/api/p/meetings/manage/[manageToken]/cancel/route";

// ── Helpers ──────────────────────────────────────────────────────────

function makeRequest(url: string, options?: RequestInit) {
  return new Request(url, options) as any;
}

function makeParams<T>(value: T): { params: Promise<T> } {
  return { params: Promise.resolve(value) };
}

/** Returns a future UTC date at the given hour, suitable for slot booking. */
function futureDate(daysAhead: number, hour: number, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setUTCHours(hour, minute, 0, 0);
  return d;
}

/** Shorthand to build a book request. */
function bookRequest(token: string, body: Record<string, unknown>) {
  return bookMeeting(
    makeRequest(`http://localhost/api/p/meetings/${token}/book`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    makeParams({ token }),
  );
}

// ── Seeded IDs ───────────────────────────────────────────────────────
let company: { id: number };
let companyNoAvail: { id: number };
let meetingType: { id: number; shareToken: string };
let availability: { id: number };
let adminUser: { id: number };

// ── Seed + Cleanup ───────────────────────────────────────────────────

beforeAll(async () => {
  company = await prisma.company.create({
    data: { name: "Cohen Digital Agency", slug: `cohen-digital-${Date.now()}` },
  });

  // Second company with NO CompanyAvailability — for fallback testing
  companyNoAvail = await prisma.company.create({
    data: { name: "Levi Consulting", slug: `levi-consult-${Date.now()}` },
  });

  adminUser = await prisma.user.create({
    data: {
      companyId: company.id,
      name: "David Cohen",
      email: `david.cohen-${Date.now()}@cohendigital.co.il`,
      passwordHash: "$2b$10$fakehashedpassword",
      role: "admin",
      permissions: {},
      tablePermissions: {},
    },
  });

  meetingType = await prisma.meetingType.create({
    data: {
      companyId: company.id,
      name: "ייעוץ עסקי",
      slug: `business-consult-${Date.now()}`,
      duration: 30,
      bufferBefore: 5,
      bufferAfter: 5,
      minAdvanceHours: 1,
      maxAdvanceDays: 60,
      dailyLimit: null,
      isActive: true,
    },
  });

  availability = await prisma.companyAvailability.create({
    data: {
      companyId: company.id,
      timezone: "UTC",
      weeklySchedule: {
        "0": [{ start: "08:00", end: "18:00" }],
        "1": [{ start: "08:00", end: "18:00" }],
        "2": [{ start: "08:00", end: "18:00" }],
        "3": [{ start: "08:00", end: "18:00" }],
        "4": [{ start: "08:00", end: "18:00" }],
        "5": [{ start: "08:00", end: "18:00" }],
        "6": [{ start: "08:00", end: "18:00" }],
      },
    },
  });
}, 30_000);

afterAll(async () => {
  const companyIds = [company?.id, companyNoAvail?.id].filter(Boolean) as number[];
  if (companyIds.length === 0) return;

  // Delete in FK-safe order: children before parents
  await prisma.meeting.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.calendarEvent.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.availabilityBlock.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.companyAvailability.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.meetingType.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.client.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.user.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  await prisma.$disconnect();
}, 15_000);

beforeEach(async () => {
  vi.clearAllMocks();
  mockCheckRateLimit.mockResolvedValue(null);
  mockCreateNotification.mockResolvedValue(undefined);
  mockFireMeetingAutomations.mockResolvedValue(undefined);

  // Clean per-test ephemeral data
  const companyIds = [company.id, companyNoAvail.id];
  await prisma.meeting.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.calendarEvent.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.client.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.availabilityBlock.deleteMany({ where: { companyId: { in: companyIds } } });
});

// =====================================================================
// A. GET /api/p/meetings/[token] — Meeting type info
// =====================================================================

describe("GET /api/p/meetings/[token]", () => {
  it("returns meeting type info + availableDays for valid token", async () => {
    const res = await getMeetingTypeInfo(
      makeRequest("http://localhost/api/p/meetings/" + meetingType.shareToken),
      makeParams({ token: meetingType.shareToken }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("ייעוץ עסקי");
    expect(body.duration).toBe(30);
    expect(body.id).toBe(meetingType.id);
    expect(body.minAdvanceHours).toBe(1);
    expect(body.maxAdvanceDays).toBe(60);
    expect(Array.isArray(body.customFields)).toBe(true);
    expect(Array.isArray(body.availableDays)).toBe(true);
    expect(body.availableDays.length).toBe(7); // All days open in our seed
    expect(body.company).toBeDefined();
    expect(body.company.name).toBe("Cohen Digital Agency");
  });

  it("returns 404 for unknown token", async () => {
    const res = await getMeetingTypeInfo(
      makeRequest("http://localhost/api/p/meetings/nonexistentToken1234"),
      makeParams({ token: "nonexistentToken1234" }),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Not found");
  });

  it("returns 404 for inactive meeting type", async () => {
    const inactive = await prisma.meetingType.create({
      data: {
        companyId: company.id,
        name: "שיחת היכרות (מושבת)",
        slug: `inactive-intro-${Date.now()}`,
        duration: 15,
        isActive: false,
      },
    });

    const res = await getMeetingTypeInfo(
      makeRequest("http://localhost/api/p/meetings/" + inactive.shareToken),
      makeParams({ token: inactive.shareToken }),
    );
    expect(res.status).toBe(404);

    await prisma.meetingType.delete({ where: { id: inactive.id } });
  });

  it("returns 400 for invalid token format (too short / special chars)", async () => {
    const res = await getMeetingTypeInfo(
      makeRequest("http://localhost/api/p/meetings/ab"),
      makeParams({ token: "ab" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid token");
  });

  it("uses availabilityOverride when present instead of company schedule", async () => {
    const overrideType = await prisma.meetingType.create({
      data: {
        companyId: company.id,
        name: "דמו מוצר",
        slug: `product-demo-${Date.now()}`,
        duration: 60,
        isActive: true,
        availabilityOverride: {
          "1": [{ start: "10:00", end: "12:00" }],
        },
      },
    });

    const res = await getMeetingTypeInfo(
      makeRequest("http://localhost/api/p/meetings/" + overrideType.shareToken),
      makeParams({ token: overrideType.shareToken }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // Only Monday (day 1) has windows in the override
    expect(body.availableDays).toEqual([1]);

    await prisma.meetingType.delete({ where: { id: overrideType.id } });
  });

  it("falls back to default schedule when no CompanyAvailability exists", async () => {
    const noAvailType = await prisma.meetingType.create({
      data: {
        companyId: companyNoAvail.id,
        name: "ייעוץ ראשוני",
        slug: `initial-consult-${Date.now()}`,
        duration: 30,
        isActive: true,
      },
    });

    const res = await getMeetingTypeInfo(
      makeRequest("http://localhost/api/p/meetings/" + noAvailType.shareToken),
      makeParams({ token: noAvailType.shareToken }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // Default schedule: Sun-Thu (0-4) have windows, Fri-Sat (5-6) are off
    expect(body.availableDays).toEqual([0, 1, 2, 3, 4]);

    await prisma.meetingType.delete({ where: { id: noAvailType.id } });
  });

  it("omits internal fields (companyId, availabilityOverride) from response", async () => {
    const res = await getMeetingTypeInfo(
      makeRequest("http://localhost/api/p/meetings/" + meetingType.shareToken),
      makeParams({ token: meetingType.shareToken }),
    );
    const body = await res.json();
    expect(body.companyId).toBeUndefined();
    expect(body.availabilityOverride).toBeUndefined();
    // But public fields are present
    expect(body.id).toBeDefined();
    expect(body.name).toBeDefined();
    expect(body.description).toBeDefined();
  });
});

// =====================================================================
// B. GET /api/p/meetings/[token]/slots — Available slots
// =====================================================================

describe("GET /api/p/meetings/[token]/slots", () => {
  it("returns available slots for valid date range with correct shape", async () => {
    const start = futureDate(3, 0).toISOString().slice(0, 10);
    const end = futureDate(5, 0).toISOString().slice(0, 10);
    const url = `http://localhost/api/p/meetings/${meetingType.shareToken}/slots?start=${start}&end=${end}`;

    const res = await getSlots(
      makeRequest(url),
      makeParams({ token: meetingType.shareToken }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.slots)).toBe(true);
    expect(body.slots.length).toBeGreaterThan(0);
    // Each slot has start and end
    for (const slot of body.slots.slice(0, 3)) {
      expect(slot.start).toBeDefined();
      expect(slot.end).toBeDefined();
      const slotDuration = (new Date(slot.end).getTime() - new Date(slot.start).getTime()) / 60_000;
      expect(slotDuration).toBe(30); // matches meeting type duration
    }
  });

  it("returns 400 when start/end params missing", async () => {
    const url = `http://localhost/api/p/meetings/${meetingType.shareToken}/slots`;
    const res = await getSlots(
      makeRequest(url),
      makeParams({ token: meetingType.shareToken }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("start and end");
  });

  it("returns 400 for invalid date format", async () => {
    const url = `http://localhost/api/p/meetings/${meetingType.shareToken}/slots?start=not-a-date&end=also-bad`;
    const res = await getSlots(
      makeRequest(url),
      makeParams({ token: meetingType.shareToken }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid date");
  });

  it("returns 404 for unknown token", async () => {
    const url = `http://localhost/api/p/meetings/nonexistentToken1234/slots?start=2026-03-01&end=2026-03-02`;
    const res = await getSlots(
      makeRequest(url),
      makeParams({ token: "nonexistentToken1234" }),
    );
    expect(res.status).toBe(404);
  });

  it("excludes slots that overlap existing PENDING/CONFIRMED meetings", async () => {
    const slotStart = futureDate(4, 10);
    const slotEnd = new Date(slotStart.getTime() + 30 * 60_000);

    await prisma.meeting.create({
      data: {
        companyId: company.id,
        meetingTypeId: meetingType.id,
        participantName: "נועה ישראלי",
        startTime: slotStart,
        endTime: slotEnd,
        status: "PENDING",
      },
    });

    const dateStr = slotStart.toISOString().slice(0, 10);
    const url = `http://localhost/api/p/meetings/${meetingType.shareToken}/slots?start=${dateStr}&end=${dateStr}`;

    const res = await getSlots(makeRequest(url), makeParams({ token: meetingType.shareToken }));
    const body = await res.json();

    const has1000 = body.slots.some((s: any) => {
      const d = new Date(s.start);
      return d.getUTCHours() === 10 && d.getUTCMinutes() === 0;
    });
    expect(has1000).toBe(false);
  });

  it("CANCELLED meetings do NOT block slots", async () => {
    const slotStart = futureDate(4, 10);
    const slotEnd = new Date(slotStart.getTime() + 30 * 60_000);

    await prisma.meeting.create({
      data: {
        companyId: company.id,
        meetingTypeId: meetingType.id,
        participantName: "רחל כהן (בוטל)",
        startTime: slotStart,
        endTime: slotEnd,
        status: "CANCELLED",
      },
    });

    const dateStr = slotStart.toISOString().slice(0, 10);
    const url = `http://localhost/api/p/meetings/${meetingType.shareToken}/slots?start=${dateStr}&end=${dateStr}`;

    const res = await getSlots(makeRequest(url), makeParams({ token: meetingType.shareToken }));
    const body = await res.json();

    // The 10:00 slot SHOULD still be available since the meeting is CANCELLED
    const has1000 = body.slots.some((s: any) => {
      const d = new Date(s.start);
      return d.getUTCHours() === 10 && d.getUTCMinutes() === 0;
    });
    expect(has1000).toBe(true);
  });

  it("buffer zones block adjacent slots (bufferBefore/bufferAfter)", async () => {
    // meetingType has bufferBefore=5, bufferAfter=5, duration=30
    // Meeting at 10:00-10:30 → busy interval [9:55, 10:35]
    // Slot 10:30-11:00 → occupied range [10:25, 11:05] overlaps [9:55, 10:35] → blocked
    // Slot 11:00-11:30 → occupied range [10:55, 11:35] does NOT overlap → available
    const slotStart = futureDate(4, 10);
    const slotEnd = new Date(slotStart.getTime() + 30 * 60_000);

    await prisma.meeting.create({
      data: {
        companyId: company.id,
        meetingTypeId: meetingType.id,
        participantName: "בדיקת באפר",
        startTime: slotStart,
        endTime: slotEnd,
        status: "PENDING",
      },
    });

    const dateStr = slotStart.toISOString().slice(0, 10);
    const url = `http://localhost/api/p/meetings/${meetingType.shareToken}/slots?start=${dateStr}&end=${dateStr}`;

    const res = await getSlots(makeRequest(url), makeParams({ token: meetingType.shareToken }));
    const body = await res.json();

    // 10:00 blocked (meeting itself)
    const has1000 = body.slots.some((s: any) => {
      const d = new Date(s.start);
      return d.getUTCHours() === 10 && d.getUTCMinutes() === 0;
    });
    expect(has1000).toBe(false);

    // 10:30 blocked (buffer overlap — the critical assertion)
    const has1030 = body.slots.some((s: any) => {
      const d = new Date(s.start);
      return d.getUTCHours() === 10 && d.getUTCMinutes() === 30;
    });
    expect(has1030).toBe(false);

    // 11:00 available (clear of buffer window)
    const has1100 = body.slots.some((s: any) => {
      const d = new Date(s.start);
      return d.getUTCHours() === 11 && d.getUTCMinutes() === 0;
    });
    expect(has1100).toBe(true);
  });

  it("excludes slots that overlap existing calendar events", async () => {
    const eventStart = futureDate(5, 12);
    const eventEnd = new Date(eventStart.getTime() + 60 * 60_000);

    await prisma.calendarEvent.create({
      data: {
        companyId: company.id,
        title: "כנס צוות שבועי",
        startTime: eventStart,
        endTime: eventEnd,
      },
    });

    const dateStr = eventStart.toISOString().slice(0, 10);
    const url = `http://localhost/api/p/meetings/${meetingType.shareToken}/slots?start=${dateStr}&end=${dateStr}`;

    const res = await getSlots(makeRequest(url), makeParams({ token: meetingType.shareToken }));
    const body = await res.json();

    const has1200 = body.slots.some((s: any) => {
      const d = new Date(s.start);
      return d.getUTCHours() === 12 && d.getUTCMinutes() === 0;
    });
    expect(has1200).toBe(false);
  });

  it("respects dailyLimit — no slots when limit reached", async () => {
    const limited = await prisma.meetingType.create({
      data: {
        companyId: company.id,
        name: "פגישה מוגבלת",
        slug: `limited-${Date.now()}`,
        duration: 30,
        dailyLimit: 1,
        minAdvanceHours: 1,
        maxAdvanceDays: 60,
        isActive: true,
      },
    });

    const day = futureDate(6, 10);
    const dayEnd = new Date(day.getTime() + 30 * 60_000);
    await prisma.meeting.create({
      data: {
        companyId: company.id,
        meetingTypeId: limited.id,
        participantName: "אורי לוי",
        startTime: day,
        endTime: dayEnd,
        status: "CONFIRMED",
      },
    });

    const dateStr = day.toISOString().slice(0, 10);
    const url = `http://localhost/api/p/meetings/${limited.shareToken}/slots?start=${dateStr}&end=${dateStr}`;

    const res = await getSlots(makeRequest(url), makeParams({ token: limited.shareToken }));
    const body = await res.json();

    const slotsOnDay = body.slots.filter((s: any) =>
      new Date(s.start).toISOString().startsWith(dateStr),
    );
    expect(slotsOnDay.length).toBe(0);

    await prisma.meetingType.delete({ where: { id: limited.id } });
  });

  it("returns empty when AvailabilityBlock covers entire day", async () => {
    const dayStart = futureDate(7, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCHours(23, 59, 59, 999);

    await prisma.availabilityBlock.create({
      data: {
        companyId: company.id,
        title: "חופשת חנוכה",
        startDate: dayStart,
        endDate: dayEnd,
        allDay: true,
      },
    });

    const dateStr = dayStart.toISOString().slice(0, 10);
    const url = `http://localhost/api/p/meetings/${meetingType.shareToken}/slots?start=${dateStr}&end=${dateStr}`;

    const res = await getSlots(makeRequest(url), makeParams({ token: meetingType.shareToken }));
    const body = await res.json();

    const slotsOnDay = body.slots.filter((s: any) =>
      new Date(s.start).toISOString().startsWith(dateStr),
    );
    expect(slotsOnDay.length).toBe(0);
  });

  it("respects minAdvanceHours — no slots too close to now", async () => {
    // Create meeting type with 48h advance requirement
    const advanceMt = await prisma.meetingType.create({
      data: {
        companyId: company.id,
        name: "פגישה עם התראה מוקדמת",
        slug: `advance-${Date.now()}`,
        duration: 30,
        minAdvanceHours: 48,
        maxAdvanceDays: 60,
        isActive: true,
      },
    });

    // Query slots for tomorrow (within 48h window) — should all be filtered out
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);
    const url = `http://localhost/api/p/meetings/${advanceMt.shareToken}/slots?start=${tomorrowStr}&end=${tomorrowStr}`;

    const res = await getSlots(makeRequest(url), makeParams({ token: advanceMt.shareToken }));
    const body = await res.json();

    // All slots tomorrow are within 48h from now, so none should appear
    expect(body.slots.length).toBe(0);

    // But 3 days from now should have slots
    const dayAfter = new Date();
    dayAfter.setUTCDate(dayAfter.getUTCDate() + 3);
    const dayAfterStr = dayAfter.toISOString().slice(0, 10);
    const url2 = `http://localhost/api/p/meetings/${advanceMt.shareToken}/slots?start=${dayAfterStr}&end=${dayAfterStr}`;

    const res2 = await getSlots(makeRequest(url2), makeParams({ token: advanceMt.shareToken }));
    const body2 = await res2.json();
    // This day is 72h+ out, so slots should be available
    expect(body2.slots.length).toBeGreaterThan(0);

    await prisma.meetingType.delete({ where: { id: advanceMt.id } });
  });

  it("respects maxAdvanceDays — no slots too far in future", async () => {
    // Create meeting type with only 2 days advance max
    const shortMt = await prisma.meetingType.create({
      data: {
        companyId: company.id,
        name: "פגישה קרובה בלבד",
        slug: `short-${Date.now()}`,
        duration: 30,
        minAdvanceHours: 1,
        maxAdvanceDays: 2,
        isActive: true,
      },
    });

    // Query slots 10 days from now — beyond maxAdvanceDays, should be empty
    const farDate = new Date();
    farDate.setUTCDate(farDate.getUTCDate() + 10);
    const farStr = farDate.toISOString().slice(0, 10);
    const url = `http://localhost/api/p/meetings/${shortMt.shareToken}/slots?start=${farStr}&end=${farStr}`;

    const res = await getSlots(makeRequest(url), makeParams({ token: shortMt.shareToken }));
    const body = await res.json();

    expect(body.slots.length).toBe(0);

    await prisma.meetingType.delete({ where: { id: shortMt.id } });
  });
});

// =====================================================================
// C. POST /api/p/meetings/[token]/book — Book a meeting
// =====================================================================

describe("POST /api/p/meetings/[token]/book", () => {
  it("books successfully: creates Meeting, CalendarEvent, Client with correct DB state", async () => {
    const startTime = futureDate(3, 10);

    const res = await bookRequest(meetingType.shareToken, {
      participantName: "שרה לוי",
      participantEmail: "sarah.levi@example.co.il",
      participantPhone: "054-7654321",
      startTime: startTime.toISOString(),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(typeof body.manageToken).toBe("string");
    expect(body.manageToken.length).toBeGreaterThan(10);

    // Verify full DB state
    const meeting = await prisma.meeting.findFirst({
      where: { manageToken: body.manageToken },
      include: { calendarEvent: true, client: true, meetingType: true },
    });
    expect(meeting).not.toBeNull();
    expect(meeting!.status).toBe("PENDING");
    expect(meeting!.companyId).toBe(company.id);
    expect(meeting!.meetingTypeId).toBe(meetingType.id);
    expect(meeting!.participantName).toBe("שרה לוי");
    expect(meeting!.participantEmail).toBe("sarah.levi@example.co.il");
    expect(meeting!.participantPhone).toBe("054-7654321");
    expect(meeting!.startTime.getTime()).toBe(startTime.getTime());
    // endTime = startTime + 30min (duration)
    expect(meeting!.endTime.getTime()).toBe(startTime.getTime() + 30 * 60_000);

    // CalendarEvent
    expect(meeting!.calendarEvent).not.toBeNull();
    expect(meeting!.calendarEvent!.title).toBe("ייעוץ עסקי - שרה לוי");
    expect(meeting!.calendarEvent!.startTime.getTime()).toBe(startTime.getTime());

    // Client
    expect(meeting!.client).not.toBeNull();
    expect(meeting!.client!.email).toBe("sarah.levi@example.co.il");
    expect(meeting!.client!.name).toBe("שרה לוי");

    // Side effects: notification and automation should fire after successful booking
    // These are fire-and-forget in production (prisma.user.findMany().then(...)), so wait for async chains
    await vi.waitFor(() => {
      expect(mockCreateNotification).toHaveBeenCalled();
    });
    await vi.waitFor(() => {
      expect(mockFireMeetingAutomations).toHaveBeenCalled();
    });
  });

  it("returns 400 with error message for missing participantName", async () => {
    const res = await bookRequest(meetingType.shareToken, {
      participantEmail: "noname@example.com",
      startTime: futureDate(3, 11).toISOString(),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("שם");
  });

  it("returns 400 for missing email AND phone (need at least one)", async () => {
    const res = await bookRequest(meetingType.shareToken, {
      participantName: "ללא פרטי קשר",
      startTime: futureDate(3, 11).toISOString(),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("אימייל");
  });

  it("returns 400 for invalid email format", async () => {
    const res = await bookRequest(meetingType.shareToken, {
      participantName: "אימייל שגוי",
      participantEmail: "not-an-email",
      startTime: futureDate(3, 11).toISOString(),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("אימייל");
  });

  it("returns 400 for invalid phone format", async () => {
    const res = await bookRequest(meetingType.shareToken, {
      participantName: "טלפון שגוי",
      participantPhone: "12",
      startTime: futureDate(3, 11).toISOString(),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("טלפון");
  });

  it("returns 400 for missing startTime", async () => {
    const res = await bookRequest(meetingType.shareToken, {
      participantName: "ללא זמן",
      participantEmail: "notime@example.com",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("שעת התחלה");
  });

  it("returns 404 for unknown/inactive token", async () => {
    const res = await bookRequest("nonexistentToken1234", {
      participantName: "אינו קיים",
      participantEmail: "ghost@example.com",
      startTime: futureDate(3, 11).toISOString(),
    });
    expect(res.status).toBe(404);
  });

  it("returns rate limit response when rate limited", async () => {
    mockCheckRateLimit.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Rate limited" }), { status: 429 }),
    );
    const res = await bookRequest(meetingType.shareToken, {
      participantName: "בדיקת הגבלה",
      participantEmail: "rate@example.com",
      startTime: futureDate(3, 10).toISOString(),
    });
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("Rate limited");

    // Verify no DB writes occurred
    const meeting = await prisma.meeting.findFirst({
      where: { companyId: company.id, participantEmail: "rate@example.com" },
    });
    expect(meeting).toBeNull();

    // When rate limited, no side effects should fire (route returns before side-effect code)
    expect(mockCreateNotification).not.toHaveBeenCalled();
    expect(mockFireMeetingAutomations).not.toHaveBeenCalled();
  });

  it("returns 400 when slot already taken (double-booking protection)", async () => {
    const startTime = futureDate(7, 14);

    const res1 = await bookRequest(meetingType.shareToken, {
      participantName: "יעל כהן",
      participantEmail: "yael@example.com",
      startTime: startTime.toISOString(),
    });
    expect(res1.status).toBe(200);

    const res2 = await bookRequest(meetingType.shareToken, {
      participantName: "מיכל דוד",
      participantEmail: "michal@example.com",
      startTime: startTime.toISOString(),
    });
    expect(res2.status).toBe(400);
    const body = await res2.json();
    expect(body.error).toContain("no longer available");

    // Verify only ONE meeting was created at that time
    const meetings = await prisma.meeting.findMany({
      where: { companyId: company.id, startTime },
    });
    expect(meetings.length).toBe(1);
    expect(meetings[0].participantName).toBe("יעל כהן");

    // Verify $transaction rollback: no orphaned CalendarEvent or Client for the failed participant
    const orphanedEvents = await prisma.calendarEvent.findMany({
      where: { companyId: company.id, title: { contains: "מיכל דוד" } },
    });
    expect(orphanedEvents.length).toBe(0);

    const orphanedClient = await prisma.client.findFirst({
      where: { companyId: company.id, email: "michal@example.com" },
    });
    expect(orphanedClient).toBeNull();
  });

  it("reuses existing client if email matches", async () => {
    const email = `returning-client-${Date.now()}@example.co.il`;
    const startTime1 = futureDate(8, 10);
    const startTime2 = futureDate(9, 10);

    await bookRequest(meetingType.shareToken, {
      participantName: "לקוח חוזר",
      participantEmail: email,
      startTime: startTime1.toISOString(),
    });

    await bookRequest(meetingType.shareToken, {
      participantName: "לקוח חוזר",
      participantEmail: email,
      startTime: startTime2.toISOString(),
    });

    const clients = await prisma.client.findMany({
      where: { companyId: company.id, email },
    });
    expect(clients.length).toBe(1);

    const meetings = await prisma.meeting.findMany({
      where: { companyId: company.id, clientId: clients[0].id },
    });
    expect(meetings.length).toBe(2);
  });

  it("books with phone only (no email) and verifies DB state", async () => {
    const startTime = futureDate(10, 10);

    const res = await bookRequest(meetingType.shareToken, {
      participantName: "אבי מזרחי",
      participantPhone: "050-9876543",
      startTime: startTime.toISOString(),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Verify DB: client created with phone, no email
    const meeting = await prisma.meeting.findUnique({
      where: { manageToken: body.manageToken },
      include: { client: true },
    });
    expect(meeting).not.toBeNull();
    expect(meeting!.participantPhone).toBe("050-9876543");
    expect(meeting!.participantEmail).toBeNull();
    expect(meeting!.client).not.toBeNull();
    expect(meeting!.client!.phone).toBe("050-9876543");
    expect(meeting!.client!.email).toBeNull();
  });

  it("@default values: manageToken auto-generated, status=PENDING, timezone=Asia/Jerusalem", async () => {
    const res = await bookRequest(meetingType.shareToken, {
      participantName: "בדיקת ברירות מחדל",
      participantEmail: "defaults@example.com",
      startTime: futureDate(11, 10).toISOString(),
    });
    const body = await res.json();

    const meeting = await prisma.meeting.findUnique({
      where: { manageToken: body.manageToken },
    });
    expect(meeting!.manageToken).toBeTruthy();
    expect(meeting!.manageToken.length).toBeGreaterThan(10);
    expect(meeting!.status).toBe("PENDING");
    expect(meeting!.timezone).toBe("Asia/Jerusalem");
    expect(meeting!.tags).toEqual([]);
    expect(meeting!.notesBefore).toBeNull();
    expect(meeting!.notesAfter).toBeNull();
    expect(meeting!.cancelledAt).toBeNull();
    expect(meeting!.cancelledBy).toBeNull();
  });

  it("stores customFieldData correctly in booking", async () => {
    const customData = { companySize: "10-50", referralSource: "Google" };

    const res = await bookRequest(meetingType.shareToken, {
      participantName: "בדיקת שדות מותאמים",
      participantEmail: "custom@example.com",
      startTime: futureDate(12, 10).toISOString(),
      customFieldData: customData,
    });
    expect(res.status).toBe(200);
    const body = await res.json();

    const meeting = await prisma.meeting.findUnique({
      where: { manageToken: body.manageToken },
    });
    expect(meeting).not.toBeNull();
    expect(meeting!.customFieldData).toEqual(customData);
  });

  it("returns 400 for name exceeding MAX_NAME_LENGTH (200 chars)", async () => {
    const longName = "א".repeat(201);

    const res = await bookRequest(meetingType.shareToken, {
      participantName: longName,
      participantEmail: "longname@example.com",
      startTime: futureDate(13, 10).toISOString(),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();

    // Verify no meeting was created
    const meeting = await prisma.meeting.findFirst({
      where: { companyId: company.id, participantEmail: "longname@example.com" },
    });
    expect(meeting).toBeNull();
  });
});

// =====================================================================
// D. GET /api/p/meetings/manage/[manageToken] — View meeting
// =====================================================================

describe("GET /api/p/meetings/manage/[manageToken]", () => {
  let bookedManageToken: string;

  beforeEach(async () => {
    const res = await bookRequest(meetingType.shareToken, {
      participantName: "תמר אברהם",
      participantEmail: "tamar.a@example.co.il",
      participantPhone: "054-7654321",
      startTime: futureDate(4, 10).toISOString(),
    });
    const body = await res.json();
    bookedManageToken = body.manageToken;
  });

  it("returns meeting details with correct response shape (all 13 fields)", async () => {
    const res = await getManageMeeting(
      makeRequest("http://localhost/api/p/meetings/manage/" + bookedManageToken),
      makeParams({ manageToken: bookedManageToken }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    // All selected scalar fields
    expect(body.participantName).toBe("תמר אברהם");
    expect(body.participantEmail).toBe("tamar.a@example.co.il");
    expect(body.participantPhone).toBe("054-7654321");
    expect(body.status).toBe("PENDING");
    expect(body.startTime).toBeDefined();
    expect(body.endTime).toBeDefined();
    expect(body.notesBefore).toBeNull();
    expect(body.cancelReason).toBeNull();
    expect(body.cancelledAt).toBeNull();
    // Relations included with all sub-fields
    expect(body.meetingType).toBeDefined();
    expect(body.meetingType.name).toBe("ייעוץ עסקי");
    expect(body.meetingType.duration).toBe(30);
    expect(body.meetingType).toHaveProperty("color");
    expect(body.meetingType.shareToken).toBeDefined();
    expect(body.company).toBeDefined();
    expect(body.company.name).toBe("Cohen Digital Agency");
    expect(body.company).toHaveProperty("logoUrl");
    // Internal IDs NOT exposed (no id, no companyId)
    expect(body.id).toBeUndefined();
    expect(body.companyId).toBeUndefined();
    expect(body.meetingTypeId).toBeUndefined();
    expect(body.clientId).toBeUndefined();
    expect(body.calendarEventId).toBeUndefined();
    expect(body.manageToken).toBeUndefined();
  });

  it("returns 404 for unknown manageToken", async () => {
    const res = await getManageMeeting(
      makeRequest("http://localhost/api/p/meetings/manage/nonexistentToken1234"),
      makeParams({ manageToken: "nonexistentToken1234" }),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Not found");
  });

  it("returns 400 for invalid token format", async () => {
    const res = await getManageMeeting(
      makeRequest("http://localhost/api/p/meetings/manage/ab"),
      makeParams({ manageToken: "ab" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid token");
  });
});

// =====================================================================
// E. POST /api/p/meetings/manage/[manageToken]/reschedule
// =====================================================================

describe("POST /api/p/meetings/manage/[manageToken]/reschedule", () => {
  let testManageToken: string;

  beforeEach(async () => {
    const res = await bookRequest(meetingType.shareToken, {
      participantName: "דנה גולדשטיין",
      participantEmail: "dana.g@example.co.il",
      startTime: futureDate(5, 10).toISOString(),
    });
    const body = await res.json();
    testManageToken = body.manageToken;
  });

  it("reschedules to new time: updates meeting + calendar event in DB", async () => {
    // Clear side-effect mocks polluted by beforeEach booking
    mockCreateNotification.mockClear();
    mockFireMeetingAutomations.mockClear();

    const newStart = futureDate(6, 14);
    const expectedEnd = new Date(newStart.getTime() + 30 * 60_000);

    const res = await rescheduleMeeting(
      makeRequest("http://localhost/api/p/meetings/manage/" + testManageToken + "/reschedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startTime: newStart.toISOString() }),
      }),
      makeParams({ manageToken: testManageToken }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Verify DB state
    const meeting = await prisma.meeting.findUnique({
      where: { manageToken: testManageToken },
      include: { calendarEvent: true },
    });
    expect(meeting!.startTime.getTime()).toBe(newStart.getTime());
    expect(meeting!.endTime.getTime()).toBe(expectedEnd.getTime());
    expect(meeting!.calendarEvent!.startTime.getTime()).toBe(newStart.getTime());
    expect(meeting!.calendarEvent!.endTime.getTime()).toBe(expectedEnd.getTime());
    // @updatedAt should be updated after reschedule
    expect(meeting!.updatedAt.getTime()).toBeGreaterThan(meeting!.createdAt.getTime());

    // Reschedule fires notification but NOT automations (per production code)
    await vi.waitFor(() => {
      expect(mockCreateNotification).toHaveBeenCalled();
    });
    expect(mockFireMeetingAutomations).not.toHaveBeenCalled();
  });

  it("returns 400 for cancelled meeting", async () => {
    await prisma.meeting.update({
      where: { manageToken: testManageToken },
      data: { status: "CANCELLED" },
    });

    const res = await rescheduleMeeting(
      makeRequest("http://localhost/api/p/meetings/manage/" + testManageToken + "/reschedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startTime: futureDate(7, 10).toISOString() }),
      }),
      makeParams({ manageToken: testManageToken }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("cannot be rescheduled");
  });

  it("returns 400 for completed meeting", async () => {
    await prisma.meeting.update({
      where: { manageToken: testManageToken },
      data: { status: "COMPLETED" },
    });

    const res = await rescheduleMeeting(
      makeRequest("http://localhost/api/p/meetings/manage/" + testManageToken + "/reschedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startTime: futureDate(7, 10).toISOString() }),
      }),
      makeParams({ manageToken: testManageToken }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("cannot be rescheduled");
  });

  it("returns 400 when new slot conflicts with another meeting", async () => {
    const conflictTime = futureDate(11, 15);
    await bookRequest(meetingType.shareToken, {
      participantName: "חסימת זמן",
      participantEmail: "block@example.com",
      startTime: conflictTime.toISOString(),
    });

    const res = await rescheduleMeeting(
      makeRequest("http://localhost/api/p/meetings/manage/" + testManageToken + "/reschedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startTime: conflictTime.toISOString() }),
      }),
      makeParams({ manageToken: testManageToken }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("no longer available");

    // Verify original meeting was NOT changed in DB
    const meeting = await prisma.meeting.findUnique({
      where: { manageToken: testManageToken },
    });
    expect(meeting!.startTime.getTime()).not.toBe(conflictTime.getTime());
  });

  it("returns 400 for missing/invalid startTime", async () => {
    const res1 = await rescheduleMeeting(
      makeRequest("http://localhost/api/p/meetings/manage/" + testManageToken + "/reschedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      makeParams({ manageToken: testManageToken }),
    );
    expect(res1.status).toBe(400);
    const body1 = await res1.json();
    expect(body1.error).toContain("startTime");

    const res2 = await rescheduleMeeting(
      makeRequest("http://localhost/api/p/meetings/manage/" + testManageToken + "/reschedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startTime: "not-a-date" }),
      }),
      makeParams({ manageToken: testManageToken }),
    );
    expect(res2.status).toBe(400);
    const body2 = await res2.json();
    expect(body2.error).toContain("Invalid");
  });

  it("returns 404 for unknown token", async () => {
    const res = await rescheduleMeeting(
      makeRequest("http://localhost/api/p/meetings/manage/nonexistentToken1234/reschedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startTime: futureDate(7, 10).toISOString() }),
      }),
      makeParams({ manageToken: "nonexistentToken1234" }),
    );
    expect(res.status).toBe(404);
  });
});

// =====================================================================
// F. POST /api/p/meetings/manage/[manageToken]/cancel
// =====================================================================

describe("POST /api/p/meetings/manage/[manageToken]/cancel", () => {
  let testManageToken: string;

  beforeEach(async () => {
    const res = await bookRequest(meetingType.shareToken, {
      participantName: "יוסי מזרחי",
      participantEmail: "yossi.m@example.co.il",
      startTime: futureDate(5, 10).toISOString(),
    });
    const body = await res.json();
    testManageToken = body.manageToken;
  });

  it("cancels meeting: sets status=CANCELLED, cancelledBy=participant, stores reason", async () => {
    // Clear side-effect mocks polluted by beforeEach booking
    mockCreateNotification.mockClear();
    mockFireMeetingAutomations.mockClear();

    const res = await cancelMeeting(
      makeRequest("http://localhost/api/p/meetings/manage/" + testManageToken + "/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "אין לי זמן השבוע" }),
      }),
      makeParams({ manageToken: testManageToken }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Verify full DB state
    const meeting = await prisma.meeting.findUnique({
      where: { manageToken: testManageToken },
    });
    expect(meeting!.status).toBe("CANCELLED");
    expect(meeting!.cancelledBy).toBe("participant");
    expect(meeting!.cancelReason).toBe("אין לי זמן השבוע");
    expect(meeting!.cancelledAt).toBeInstanceOf(Date);
    // @updatedAt should be updated after cancel
    expect(meeting!.updatedAt.getTime()).toBeGreaterThan(meeting!.createdAt.getTime());

    // Side effects: notification and automation should fire after cancel
    await vi.waitFor(() => {
      expect(mockCreateNotification).toHaveBeenCalled();
    });
    await vi.waitFor(() => {
      expect(mockFireMeetingAutomations).toHaveBeenCalled();
    });
  });

  it("cancels without reason — cancelReason is null (not undefined)", async () => {
    const res = await cancelMeeting(
      makeRequest("http://localhost/api/p/meetings/manage/" + testManageToken + "/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      makeParams({ manageToken: testManageToken }),
    );
    expect(res.status).toBe(200);

    const meeting = await prisma.meeting.findUnique({
      where: { manageToken: testManageToken },
    });
    expect(meeting!.status).toBe("CANCELLED");
    // Prisma returns null for unset nullable fields, not undefined
    expect(meeting!.cancelReason).toBeNull();
  });

  it("returns 400 for already cancelled meeting", async () => {
    await prisma.meeting.update({
      where: { manageToken: testManageToken },
      data: { status: "CANCELLED" },
    });

    const res = await cancelMeeting(
      makeRequest("http://localhost/api/p/meetings/manage/" + testManageToken + "/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      makeParams({ manageToken: testManageToken }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("cannot be cancelled");
  });

  it("returns 400 for completed meeting", async () => {
    await prisma.meeting.update({
      where: { manageToken: testManageToken },
      data: { status: "COMPLETED" },
    });

    const res = await cancelMeeting(
      makeRequest("http://localhost/api/p/meetings/manage/" + testManageToken + "/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      makeParams({ manageToken: testManageToken }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 for unknown token", async () => {
    const res = await cancelMeeting(
      makeRequest("http://localhost/api/p/meetings/manage/nonexistentToken1234/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      makeParams({ manageToken: "nonexistentToken1234" }),
    );
    expect(res.status).toBe(404);
  });

  it("truncates cancel reason at 1000 characters", async () => {
    const longReason = "א".repeat(1500);

    const res = await cancelMeeting(
      makeRequest("http://localhost/api/p/meetings/manage/" + testManageToken + "/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: longReason }),
      }),
      makeParams({ manageToken: testManageToken }),
    );
    expect(res.status).toBe(200);

    const meeting = await prisma.meeting.findUnique({
      where: { manageToken: testManageToken },
    });
    expect(meeting!.cancelReason!.length).toBeLessThanOrEqual(1000);
  });
});

// =====================================================================
// G. Multi-step flows
// =====================================================================

describe("Multi-step flows", () => {
  it("book -> view via manageToken -> cancel -> verify full DB state", async () => {
    const startTime = futureDate(12, 10);

    // 1. Book
    const bookRes = await bookRequest(meetingType.shareToken, {
      participantName: "רונית שמעוני",
      participantEmail: "ronit.s@example.co.il",
      startTime: startTime.toISOString(),
    });
    const { manageToken } = await bookRes.json();

    // 2. View
    const viewRes = await getManageMeeting(
      makeRequest("http://localhost/api/p/meetings/manage/" + manageToken),
      makeParams({ manageToken }),
    );
    expect(viewRes.status).toBe(200);
    const viewBody = await viewRes.json();
    expect(viewBody.participantName).toBe("רונית שמעוני");
    expect(viewBody.status).toBe("PENDING");

    // 3. Cancel
    const cancelRes = await cancelMeeting(
      makeRequest("http://localhost/api/p/meetings/manage/" + manageToken + "/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "שינוי תוכניות" }),
      }),
      makeParams({ manageToken }),
    );
    expect(cancelRes.status).toBe(200);

    // 4. Verify DB
    const meeting = await prisma.meeting.findUnique({ where: { manageToken } });
    expect(meeting!.status).toBe("CANCELLED");
    expect(meeting!.cancelledBy).toBe("participant");
    expect(meeting!.cancelReason).toBe("שינוי תוכניות");
  });

  it("book -> reschedule -> verify DB state -> cancel", async () => {
    const startTime = futureDate(13, 10);
    const newStart = futureDate(14, 15);

    // 1. Book
    const bookRes = await bookRequest(meetingType.shareToken, {
      participantName: "עמית ברקוביץ",
      participantEmail: "amit.b@example.co.il",
      startTime: startTime.toISOString(),
    });
    const { manageToken } = await bookRes.json();

    // 2. Reschedule
    const reschedRes = await rescheduleMeeting(
      makeRequest("http://localhost/api/p/meetings/manage/" + manageToken + "/reschedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startTime: newStart.toISOString() }),
      }),
      makeParams({ manageToken }),
    );
    expect(reschedRes.status).toBe(200);

    // 3. Verify DB
    const meeting = await prisma.meeting.findUnique({
      where: { manageToken },
      include: { calendarEvent: true },
    });
    expect(meeting!.startTime.getTime()).toBe(newStart.getTime());
    expect(meeting!.calendarEvent!.startTime.getTime()).toBe(newStart.getTime());

    // 4. Cancel
    const cancelRes = await cancelMeeting(
      makeRequest("http://localhost/api/p/meetings/manage/" + manageToken + "/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      makeParams({ manageToken }),
    );
    expect(cancelRes.status).toBe(200);

    const cancelled = await prisma.meeting.findUnique({ where: { manageToken } });
    expect(cancelled!.status).toBe("CANCELLED");
  });

  it("book two meetings at same time — second gets 400, first remains", async () => {
    const startTime = futureDate(15, 10);

    const res1 = await bookRequest(meetingType.shareToken, {
      participantName: "נועה פרידמן",
      participantEmail: "noa.f@example.co.il",
      startTime: startTime.toISOString(),
    });
    expect(res1.status).toBe(200);

    const res2 = await bookRequest(meetingType.shareToken, {
      participantName: "ליאור כהן",
      participantEmail: "lior.c@example.co.il",
      startTime: startTime.toISOString(),
    });
    expect(res2.status).toBe(400);

    // Only one meeting should exist
    const meetings = await prisma.meeting.findMany({
      where: { companyId: company.id, startTime },
    });
    expect(meetings.length).toBe(1);
    expect(meetings[0].participantName).toBe("נועה פרידמן");
  });

  it("book -> verify client created -> book again same email -> same client reused", async () => {
    const email = `returning-${Date.now()}@example.co.il`;

    await bookRequest(meetingType.shareToken, {
      participantName: "חנה גרינבלט",
      participantEmail: email,
      startTime: futureDate(16, 10).toISOString(),
    });

    const clients1 = await prisma.client.findMany({
      where: { companyId: company.id, email },
    });
    expect(clients1.length).toBe(1);

    await bookRequest(meetingType.shareToken, {
      participantName: "חנה גרינבלט",
      participantEmail: email,
      startTime: futureDate(17, 10).toISOString(),
    });

    const clients2 = await prisma.client.findMany({
      where: { companyId: company.id, email },
    });
    expect(clients2.length).toBe(1);
    expect(clients2[0].id).toBe(clients1[0].id);
  });

  it("cancelled meeting frees the slot for re-booking", async () => {
    const startTime = futureDate(18, 10);

    // Book
    const res1 = await bookRequest(meetingType.shareToken, {
      participantName: "לביטול",
      participantEmail: "cancel-rebook@example.com",
      startTime: startTime.toISOString(),
    });
    const { manageToken } = await res1.json();

    // Cancel
    await cancelMeeting(
      makeRequest("http://localhost/api/p/meetings/manage/" + manageToken + "/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      makeParams({ manageToken }),
    );

    // Re-book same slot — should succeed since the old meeting is CANCELLED
    const res2 = await bookRequest(meetingType.shareToken, {
      participantName: "הזמנה חדשה",
      participantEmail: "new-booking@example.com",
      startTime: startTime.toISOString(),
    });
    expect(res2.status).toBe(200);

    // Two meetings at this time: one CANCELLED, one PENDING
    const meetings = await prisma.meeting.findMany({
      where: { companyId: company.id, startTime },
      orderBy: { createdAt: "asc" },
    });
    expect(meetings.length).toBe(2);
    expect(meetings[0].status).toBe("CANCELLED");
    expect(meetings[1].status).toBe("PENDING");
  });
});

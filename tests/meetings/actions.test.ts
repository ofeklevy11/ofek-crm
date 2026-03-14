import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────

vi.mock("@/lib/prisma", () => {
  const meetingType = { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() };
  const meeting = { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), count: vi.fn(), groupBy: vi.fn() };
  const calendarEvent = { update: vi.fn() };
  const client = { findFirst: vi.fn() };
  const user = { findMany: vi.fn() };
  return { prisma: { meetingType, meeting, calendarEvent, client, user, $transaction: vi.fn() } };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/permissions-server", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/permissions", () => ({ hasUserFlag: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  checkActionRateLimit: vi.fn(),
  RATE_LIMITS: {
    meetingRead: { prefix: "mtg-read", max: 60, windowSeconds: 60 },
    meetingMutation: { prefix: "mtg-mut", max: 30, windowSeconds: 60 },
  },
}));
vi.mock("@/lib/meeting-validation", () => ({
  validateMeetingTypeInput: vi.fn(),
  validateNotes: vi.fn(),
  validateTags: vi.fn(),
  MAX_MEETING_TYPES_PER_COMPANY: 50,
}));
vi.mock("@/lib/notifications-internal", () => ({
  createNotificationForCompany: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/services/cache-service", () => ({
  getCachedMetric: vi.fn(async (_companyId: number, _keyParts: string[], fetcher: () => Promise<any>) => fetcher()),
  buildCacheKey: vi.fn((_companyId: number, keyParts: string[]) => `cache:metric:${keyParts.join(":")}`),
}));
vi.mock("@/lib/redis", () => ({
  redis: { del: vi.fn().mockResolvedValue(1) },
}));
vi.mock("@/app/actions/meeting-automations", () => ({
  fireMeetingAutomations: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/notification-settings", () => ({
  isNotificationEnabled: vi.fn().mockResolvedValue(true),
  parseNotificationSettings: vi.fn().mockReturnValue({
    notifyOnMeetingBooked: true,
    notifyOnMeetingCancelled: true,
    notifyOnMeetingRescheduled: true,
    notifyOnMeetingStatusChange: true,
    notifyOnTicketAssigned: true,
    notifyOnTicketReassigned: true,
    notifyOnTicketComment: true,
    autoCreateClientOnBooking: true,
  }),
  invalidateNotificationSettingsCache: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { checkActionRateLimit } from "@/lib/rate-limit";
import { validateMeetingTypeInput, validateNotes, validateTags } from "@/lib/meeting-validation";
import { fireMeetingAutomations } from "@/app/actions/meeting-automations";
import { createNotificationForCompany } from "@/lib/notifications-internal";
import { isNotificationEnabled } from "@/lib/notification-settings";
import { getCachedMetric } from "@/lib/services/cache-service";

import {
  getMeetingTypes,
  createMeetingType,
  updateMeetingType,
  deleteMeetingType,
  getMeetings,
  getMeetingById,
  updateMeetingStatus,
  updateMeetingNotes,
  cancelMeeting,
  rescheduleMeeting,
  linkMeetingToClient,
  updateMeetingTags,
  getTodaysMeetings,
  getMeetingStats,
} from "@/app/actions/meetings";

// ── Helpers ────────────────────────────────────────────────────────

const mockUser = { id: 1, companyId: 10, role: "admin" };

function setupAuth(user: any = mockUser, flag = true) {
  (getCurrentUser as any).mockResolvedValue(user);
  (hasUserFlag as any).mockReturnValue(flag);
  (checkActionRateLimit as any).mockResolvedValue(false);
}

function setupNoAuth() {
  (getCurrentUser as any).mockResolvedValue(null);
}

function setupForbidden() {
  (getCurrentUser as any).mockResolvedValue(mockUser);
  (hasUserFlag as any).mockReturnValue(false);
}

function setupRateLimited() {
  (getCurrentUser as any).mockResolvedValue(mockUser);
  (hasUserFlag as any).mockReturnValue(true);
  (checkActionRateLimit as any).mockResolvedValue(true);
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ════════════════════════════════════════════════════════════════════
// getMeetingTypes
// ════════════════════════════════════════════════════════════════════
describe("getMeetingTypes", () => {
  it("returns Unauthorized when no user", async () => {
    setupNoAuth();
    const res = await getMeetingTypes();
    expect(res).toEqual({ success: false, error: "Unauthorized" });
  });

  it("returns Forbidden when missing canViewMeetings", async () => {
    setupForbidden();
    const res = await getMeetingTypes();
    expect(res).toEqual({ success: false, error: "Forbidden" });
  });

  it("returns rate limit error when limited", async () => {
    setupRateLimited();
    const res = await getMeetingTypes();
    expect(res.success).toBe(false);
    expect(res.error).toBe("Rate limit exceeded. Please try again later.");
  });

  it("returns meeting types on success", async () => {
    setupAuth();
    const types = [{ id: 1, name: "Consultation" }];
    (prisma.meetingType.findMany as any).mockResolvedValue(types);

    const res = await getMeetingTypes();
    expect(res).toEqual({ success: true, data: types });
    expect(prisma.meetingType.findMany).toHaveBeenCalledWith({
      where: { companyId: mockUser.companyId },
      orderBy: [{ order: "asc" }, { createdAt: "desc" }],
      take: 100,
    });
  });

  it("returns generic error on DB failure", async () => {
    setupAuth();
    (prisma.meetingType.findMany as any).mockRejectedValue(new Error("DB down"));
    const res = await getMeetingTypes();
    expect(res.success).toBe(false);
    expect(res.error).toBe("Failed to fetch meeting types");
  });
});

// ════════════════════════════════════════════════════════════════════
// createMeetingType
// ════════════════════════════════════════════════════════════════════
describe("createMeetingType", () => {
  const validInput = { name: "Test", slug: "test", duration: 30 };
  const validatedData = {
    name: "Test", slug: "test", duration: 30,
    bufferBefore: 0, bufferAfter: 0, minAdvanceHours: 24, maxAdvanceDays: 30,
    customFields: [], isActive: true, order: 0,
  };

  beforeEach(() => {
    (validateMeetingTypeInput as any).mockReturnValue({ valid: true, data: validatedData });
  });

  it("returns Unauthorized when no user", async () => {
    setupNoAuth();
    const res = await createMeetingType(validInput);
    expect(res).toEqual({ success: false, error: "Unauthorized" });
  });

  it("returns Forbidden without canManageMeetings", async () => {
    setupForbidden();
    expect((await createMeetingType(validInput)).error).toBe("Forbidden");
  });

  it("returns rate limit error", async () => {
    setupRateLimited();
    const res = await createMeetingType(validInput);
    expect(res.error).toBe("Rate limit exceeded. Please try again later.");
  });

  it("returns validation error", async () => {
    setupAuth();
    (validateMeetingTypeInput as any).mockReturnValue({ valid: false, error: "שם נדרש" });
    const res = await createMeetingType({});
    expect(res).toEqual({ success: false, error: "שם נדרש" });
  });

  it("returns max limit error when count >= 50", async () => {
    setupAuth();
    (prisma.meetingType.count as any).mockResolvedValue(50);
    const res = await createMeetingType(validInput);
    expect(res.success).toBe(false);
    expect(res.error).toContain("50");
  });

  it("creates meeting type with defaults on success", async () => {
    setupAuth();
    (prisma.meetingType.count as any).mockResolvedValue(5);
    const created = { id: 1, ...validatedData, companyId: 10 };
    (prisma.meetingType.create as any).mockResolvedValue(created);

    const res = await createMeetingType(validInput);
    expect(res).toEqual({ success: true, data: created });
    expect(prisma.meetingType.create).toHaveBeenCalledWith({
      data: {
        companyId: mockUser.companyId,
        name: "Test",
        slug: "test",
        description: undefined,
        duration: 30,
        color: undefined,
        bufferBefore: 0,
        bufferAfter: 0,
        dailyLimit: undefined,
        minAdvanceHours: 24,
        maxAdvanceDays: 30,
        customFields: [],
        availabilityOverride: undefined,
        isActive: true,
        order: 0,
      },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/meetings");
  });

  it("returns slug duplicate error on P2002", async () => {
    setupAuth();
    (prisma.meetingType.count as any).mockResolvedValue(0);
    const err: any = new Error("P2002");
    err.code = "P2002";
    (prisma.meetingType.create as any).mockRejectedValue(err);

    const res = await createMeetingType(validInput);
    expect(res.error).toBe("slug כבר קיים עבור חברה זו");
  });

  it("returns generic error on unexpected DB failure", async () => {
    setupAuth();
    (prisma.meetingType.count as any).mockResolvedValue(0);
    (prisma.meetingType.create as any).mockRejectedValue(new Error("unexpected"));
    const res = await createMeetingType(validInput);
    expect(res.error).toBe("Failed to create meeting type");
  });
});

// ════════════════════════════════════════════════════════════════════
// updateMeetingType
// ════════════════════════════════════════════════════════════════════
describe("updateMeetingType", () => {
  beforeEach(() => {
    (validateMeetingTypeInput as any).mockReturnValue({ valid: true, data: { name: "Updated" } });
  });

  it("returns Unauthorized when no user", async () => {
    setupNoAuth();
    expect((await updateMeetingType(1, {})).error).toBe("Unauthorized");
  });

  it("returns Forbidden", async () => {
    setupForbidden();
    expect((await updateMeetingType(1, {})).error).toBe("Forbidden");
  });

  it("rejects non-integer id", async () => {
    setupAuth();
    expect((await updateMeetingType(1.5, {})).error).toBe("Invalid ID");
  });

  it("rejects id <= 0", async () => {
    setupAuth();
    expect((await updateMeetingType(0, {})).error).toBe("Invalid ID");
    expect((await updateMeetingType(-1, {})).error).toBe("Invalid ID");
  });

  it("returns rate limit error", async () => {
    setupRateLimited();
    expect((await updateMeetingType(1, {})).error).toBe("Rate limit exceeded. Please try again later.");
  });

  it("returns validation error", async () => {
    setupAuth();
    (validateMeetingTypeInput as any).mockReturnValue({ valid: false, error: "bad input" });
    expect((await updateMeetingType(1, {})).error).toBe("bad input");
  });

  it("only includes defined fields in updateData", async () => {
    setupAuth();
    (validateMeetingTypeInput as any).mockReturnValue({ valid: true, data: { name: "X", slug: undefined } });
    (prisma.meetingType.update as any).mockResolvedValue({ id: 1, name: "X" });

    await updateMeetingType(1, { name: "X" });
    const call = (prisma.meetingType.update as any).mock.calls[0][0];
    expect(call.data).toEqual({ name: "X" });
    expect(call.data.slug).toBeUndefined();
  });

  it("includes companyId in where clause", async () => {
    setupAuth();
    (prisma.meetingType.update as any).mockResolvedValue({ id: 1 });
    await updateMeetingType(1, {});
    expect((prisma.meetingType.update as any).mock.calls[0][0].where).toEqual({
      id: 1,
      companyId: mockUser.companyId,
    });
  });

  it("returns not found on P2025", async () => {
    setupAuth();
    const err: any = new Error("P2025");
    err.code = "P2025";
    (prisma.meetingType.update as any).mockRejectedValue(err);
    expect((await updateMeetingType(1, {})).error).toBe("סוג פגישה לא נמצא");
  });

  it("returns slug duplicate error on P2002", async () => {
    setupAuth();
    const err: any = new Error("P2002");
    err.code = "P2002";
    (prisma.meetingType.update as any).mockRejectedValue(err);
    expect((await updateMeetingType(1, {})).error).toBe("slug כבר קיים עבור חברה זו");
  });

  it("revalidates /meetings on success", async () => {
    setupAuth();
    (prisma.meetingType.update as any).mockResolvedValue({ id: 1 });
    await updateMeetingType(1, {});
    expect(revalidatePath).toHaveBeenCalledWith("/meetings");
  });

  it("returns generic error on unexpected DB failure (not P2025/P2002)", async () => {
    setupAuth();
    (prisma.meetingType.update as any).mockRejectedValue(new Error("connection lost"));
    const res = await updateMeetingType(1, {});
    expect(res).toEqual({ success: false, error: "Failed to update meeting type" });
  });
});

// ════════════════════════════════════════════════════════════════════
// deleteMeetingType
// ════════════════════════════════════════════════════════════════════
describe("deleteMeetingType", () => {
  it("returns Unauthorized when no user", async () => {
    setupNoAuth();
    expect((await deleteMeetingType(1)).error).toBe("Unauthorized");
  });

  it("returns Forbidden", async () => {
    setupForbidden();
    expect((await deleteMeetingType(1)).error).toBe("Forbidden");
  });

  it("rejects invalid id", async () => {
    setupAuth();
    expect((await deleteMeetingType(0)).error).toBe("Invalid ID");
    expect((await deleteMeetingType(1.5)).error).toBe("Invalid ID");
  });

  it("returns rate limit error", async () => {
    setupRateLimited();
    expect((await deleteMeetingType(1)).error).toBe("Rate limit exceeded. Please try again later.");
  });

  it("soft-deletes by setting isActive:false (not delete)", async () => {
    setupAuth();
    (prisma.meetingType.update as any).mockResolvedValue({});
    await deleteMeetingType(1);
    expect(prisma.meetingType.update).toHaveBeenCalledWith({
      where: { id: 1, companyId: mockUser.companyId },
      data: { isActive: false },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/meetings");
  });

  it("returns not found on P2025", async () => {
    setupAuth();
    const err: any = new Error("P2025");
    err.code = "P2025";
    (prisma.meetingType.update as any).mockRejectedValue(err);
    expect((await deleteMeetingType(1)).error).toBe("סוג פגישה לא נמצא");
  });

  it("returns success on happy path", async () => {
    setupAuth();
    (prisma.meetingType.update as any).mockResolvedValue({});
    const res = await deleteMeetingType(1);
    expect(res).toEqual({ success: true });
  });

  it("returns generic error on unexpected DB failure (not P2025)", async () => {
    setupAuth();
    (prisma.meetingType.update as any).mockRejectedValue(new Error("connection lost"));
    const res = await deleteMeetingType(1);
    expect(res).toEqual({ success: false, error: "Failed to delete meeting type" });
  });
});

// ════════════════════════════════════════════════════════════════════
// getMeetings
// ════════════════════════════════════════════════════════════════════
describe("getMeetings", () => {
  it("returns Unauthorized when no user", async () => {
    setupNoAuth();
    expect((await getMeetings()).error).toBe("Unauthorized");
  });

  it("returns Forbidden", async () => {
    setupForbidden();
    expect((await getMeetings()).error).toBe("Forbidden");
  });

  it("returns rate limit error", async () => {
    setupRateLimited();
    expect((await getMeetings()).error).toBe("Rate limit exceeded. Please try again later.");
  });

  it("uses default page=1 limit=20", async () => {
    setupAuth();
    (prisma.meeting.findMany as any).mockResolvedValue([]);
    (prisma.meeting.count as any).mockResolvedValue(0);
    await getMeetings();
    const call = (prisma.meeting.findMany as any).mock.calls[0][0];
    expect(call.skip).toBe(0);
    expect(call.take).toBe(20);
  });

  it("clamps limit to max 500", async () => {
    setupAuth();
    (prisma.meeting.findMany as any).mockResolvedValue([]);
    (prisma.meeting.count as any).mockResolvedValue(0);
    await getMeetings({ limit: 1000 });
    expect((prisma.meeting.findMany as any).mock.calls[0][0].take).toBe(500);
  });

  it("clamps limit to min 1", async () => {
    setupAuth();
    (prisma.meeting.findMany as any).mockResolvedValue([]);
    (prisma.meeting.count as any).mockResolvedValue(0);
    await getMeetings({ limit: -5 });
    expect((prisma.meeting.findMany as any).mock.calls[0][0].take).toBe(1);
  });

  it("clamps page to min 1", async () => {
    setupAuth();
    (prisma.meeting.findMany as any).mockResolvedValue([]);
    (prisma.meeting.count as any).mockResolvedValue(0);
    await getMeetings({ page: -1 });
    expect((prisma.meeting.findMany as any).mock.calls[0][0].skip).toBe(0);
  });

  it("calculates skip correctly for page 3 limit 10", async () => {
    setupAuth();
    (prisma.meeting.findMany as any).mockResolvedValue([]);
    (prisma.meeting.count as any).mockResolvedValue(0);
    await getMeetings({ page: 3, limit: 10 });
    expect((prisma.meeting.findMany as any).mock.calls[0][0].skip).toBe(20);
  });

  it("applies status filter", async () => {
    setupAuth();
    (prisma.meeting.findMany as any).mockResolvedValue([]);
    (prisma.meeting.count as any).mockResolvedValue(0);
    await getMeetings({ status: "CONFIRMED" });
    const where = (prisma.meeting.findMany as any).mock.calls[0][0].where;
    expect(where.status).toBe("CONFIRMED");
  });

  it("applies meetingTypeId filter", async () => {
    setupAuth();
    (prisma.meeting.findMany as any).mockResolvedValue([]);
    (prisma.meeting.count as any).mockResolvedValue(0);
    await getMeetings({ meetingTypeId: 5 });
    const where = (prisma.meeting.findMany as any).mock.calls[0][0].where;
    expect(where.meetingTypeId).toBe(5);
  });

  it("applies date range filters", async () => {
    setupAuth();
    (prisma.meeting.findMany as any).mockResolvedValue([]);
    (prisma.meeting.count as any).mockResolvedValue(0);
    await getMeetings({ startDate: "2025-01-01", endDate: "2025-12-31" });
    const where = (prisma.meeting.findMany as any).mock.calls[0][0].where;
    expect(where.startTime.gte).toEqual(new Date("2025-01-01"));
    expect(where.startTime.lte).toEqual(new Date("2025-12-31"));
  });

  it("applies startDate-only filter (no endDate)", async () => {
    setupAuth();
    (prisma.meeting.findMany as any).mockResolvedValue([]);
    (prisma.meeting.count as any).mockResolvedValue(0);
    await getMeetings({ startDate: "2025-01-01" });
    const where = (prisma.meeting.findMany as any).mock.calls[0][0].where;
    expect(where.startTime.gte).toEqual(new Date("2025-01-01"));
    expect(where.startTime.lte).toBeUndefined();
  });

  it("applies endDate-only filter (no startDate)", async () => {
    setupAuth();
    (prisma.meeting.findMany as any).mockResolvedValue([]);
    (prisma.meeting.count as any).mockResolvedValue(0);
    await getMeetings({ endDate: "2025-12-31" });
    const where = (prisma.meeting.findMany as any).mock.calls[0][0].where;
    expect(where.startTime.lte).toEqual(new Date("2025-12-31"));
    expect(where.startTime.gte).toBeUndefined();
  });

  it("always includes companyId in where", async () => {
    setupAuth();
    (prisma.meeting.findMany as any).mockResolvedValue([]);
    (prisma.meeting.count as any).mockResolvedValue(0);
    await getMeetings({ status: "PENDING" });
    const where = (prisma.meeting.findMany as any).mock.calls[0][0].where;
    expect(where.companyId).toBe(mockUser.companyId);
  });

  it("returns meetings, total, page, limit", async () => {
    setupAuth();
    const meetings = [{ id: "m1" }];
    (prisma.meeting.findMany as any).mockResolvedValue(meetings);
    (prisma.meeting.count as any).mockResolvedValue(1);
    const res = await getMeetings();
    expect(res).toEqual({
      success: true,
      data: { meetings, total: 1, page: 1, limit: 20 },
    });
  });

  it("orders by startTime desc", async () => {
    setupAuth();
    (prisma.meeting.findMany as any).mockResolvedValue([]);
    (prisma.meeting.count as any).mockResolvedValue(0);
    await getMeetings();
    const call = (prisma.meeting.findMany as any).mock.calls[0][0];
    expect(call.orderBy).toEqual({ startTime: "desc" });
  });

  it("returns generic error on DB failure", async () => {
    setupAuth();
    (prisma.meeting.findMany as any).mockRejectedValue(new Error("DB"));
    (prisma.meeting.count as any).mockRejectedValue(new Error("DB"));
    const res = await getMeetings();
    expect(res.error).toBe("Failed to fetch meetings");
  });
});

// ════════════════════════════════════════════════════════════════════
// getMeetingById
// ════════════════════════════════════════════════════════════════════
describe("getMeetingById", () => {
  it("returns Unauthorized when no user", async () => {
    setupNoAuth();
    expect((await getMeetingById("abc")).error).toBe("Unauthorized");
  });

  it("returns Forbidden", async () => {
    setupForbidden();
    expect((await getMeetingById("abc")).error).toBe("Forbidden");
  });

  it("rejects empty id", async () => {
    setupAuth();
    expect((await getMeetingById("")).error).toBe("Invalid ID");
  });

  it("rejects id longer than 30 chars", async () => {
    setupAuth();
    const longId = "a".repeat(31);
    expect((await getMeetingById(longId)).error).toBe("Invalid ID");
  });

  it("returns not found when meeting is null", async () => {
    setupAuth();
    (prisma.meeting.findFirst as any).mockResolvedValue(null);
    expect((await getMeetingById("m1")).error).toBe("פגישה לא נמצאה");
  });

  it("returns meeting data on success with correct includes", async () => {
    setupAuth();
    const meeting = { id: "m1", participantName: "John" };
    (prisma.meeting.findFirst as any).mockResolvedValue(meeting);
    const res = await getMeetingById("m1");
    expect(res).toEqual({ success: true, data: meeting });
    const call = (prisma.meeting.findFirst as any).mock.calls[0][0];
    expect(call.where).toEqual({ id: "m1", companyId: mockUser.companyId });
    expect(call.include.meetingType).toBeDefined();
    expect(call.include.client).toBeDefined();
    expect(call.include.calendarEvent).toBeDefined();
  });

  it("returns generic error on DB failure", async () => {
    setupAuth();
    (prisma.meeting.findFirst as any).mockRejectedValue(new Error("DB"));
    expect((await getMeetingById("m1")).error).toBe("Failed to fetch meeting");
  });
});

// ════════════════════════════════════════════════════════════════════
// updateMeetingStatus
// ════════════════════════════════════════════════════════════════════
describe("updateMeetingStatus", () => {
  it("returns Unauthorized", async () => {
    setupNoAuth();
    expect((await updateMeetingStatus("m1", "CONFIRMED")).error).toBe("Unauthorized");
  });

  it("returns Forbidden", async () => {
    setupForbidden();
    expect((await updateMeetingStatus("m1", "CONFIRMED")).error).toBe("Forbidden");
  });

  it("rejects empty id", async () => {
    setupAuth();
    expect((await updateMeetingStatus("", "CONFIRMED")).error).toBe("Invalid ID");
  });

  it("rejects id > 30 chars", async () => {
    setupAuth();
    expect((await updateMeetingStatus("a".repeat(31), "CONFIRMED")).error).toBe("Invalid ID");
  });

  it("rejects invalid status", async () => {
    setupAuth();
    expect((await updateMeetingStatus("m1", "INVALID")).error).toBe("סטטוס לא תקין");
  });

  it.each(["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"])(
    "accepts valid status: %s",
    async (status) => {
      setupAuth();
      const meeting = { id: "m1", participantName: "John", meetingType: { name: "X" } };
      (prisma.meeting.update as any).mockResolvedValue(meeting);
      (prisma.user.findMany as any).mockResolvedValue([]);
      const res = await updateMeetingStatus("m1", status);
      expect(res.success).toBe(true);
    }
  );

  it("sets cancelledAt and cancelledBy for CANCELLED", async () => {
    setupAuth();
    (prisma.meeting.update as any).mockResolvedValue({ id: "m1", participantName: "J", meetingType: { name: "T" } });
    (prisma.user.findMany as any).mockResolvedValue([]);
    await updateMeetingStatus("m1", "CANCELLED");
    const data = (prisma.meeting.update as any).mock.calls[0][0].data;
    expect(data.cancelledAt).toBeInstanceOf(Date);
    expect(data.cancelledBy).toBe("owner");
  });

  it("does NOT set cancelledAt for non-CANCELLED statuses", async () => {
    setupAuth();
    (prisma.meeting.update as any).mockResolvedValue({ id: "m1", participantName: "J", meetingType: { name: "T" } });
    (prisma.user.findMany as any).mockResolvedValue([]);
    await updateMeetingStatus("m1", "CONFIRMED");
    const data = (prisma.meeting.update as any).mock.calls[0][0].data;
    expect(data.cancelledAt).toBeUndefined();
    expect(data.cancelledBy).toBeUndefined();
  });

  it("returns rate limit error", async () => {
    setupRateLimited();
    expect((await updateMeetingStatus("m1", "CONFIRMED")).error).toBe("Rate limit exceeded. Please try again later.");
  });

  it("revalidates /meetings and /calendar", async () => {
    setupAuth();
    (prisma.meeting.update as any).mockResolvedValue({ id: "m1", participantName: "J", meetingType: { name: "T" } });
    (prisma.user.findMany as any).mockResolvedValue([]);
    await updateMeetingStatus("m1", "CONFIRMED");
    expect(revalidatePath).toHaveBeenCalledWith("/meetings");
    expect(revalidatePath).toHaveBeenCalledWith("/calendar");
  });

  it("returns not found on P2025", async () => {
    setupAuth();
    const err: any = new Error("P2025");
    err.code = "P2025";
    (prisma.meeting.update as any).mockRejectedValue(err);
    expect((await updateMeetingStatus("m1", "CONFIRMED")).error).toBe("פגישה לא נמצאה");
  });

  it("notification failure does not affect result", async () => {
    setupAuth();
    (prisma.meeting.update as any).mockResolvedValue({ id: "m1", participantName: "J", meetingType: { name: "T" } });
    (prisma.user.findMany as any).mockRejectedValue(new Error("notification fail"));
    const res = await updateMeetingStatus("m1", "CONFIRMED");
    expect(res.success).toBe(true);
  });

  it("includes companyId in where clause", async () => {
    setupAuth();
    (prisma.meeting.update as any).mockResolvedValue({ id: "m1", participantName: "J", meetingType: { name: "T" } });
    (prisma.user.findMany as any).mockResolvedValue([]);
    await updateMeetingStatus("m1", "CONFIRMED");
    const call = (prisma.meeting.update as any).mock.calls[0][0];
    expect(call.where).toEqual({ id: "m1", companyId: mockUser.companyId });
  });

  it("dispatches notification to each admin on success", async () => {
    setupAuth();
    (prisma.meeting.update as any).mockResolvedValue({ id: "m1", participantName: "J", meetingType: { name: "T" } });
    (prisma.user.findMany as any).mockResolvedValue([{ id: 100 }, { id: 200 }]);
    await updateMeetingStatus("m1", "CONFIRMED");
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { companyId: mockUser.companyId, role: "admin" },
      select: { id: true },
      take: 25,
    });
    expect(createNotificationForCompany).toHaveBeenCalledTimes(2);
    expect(createNotificationForCompany).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: mockUser.companyId,
        userId: 100,
        title: expect.stringContaining("J - מאושר"),
        link: "/meetings",
      }),
    );
    expect(createNotificationForCompany).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: mockUser.companyId,
        userId: 200,
        title: expect.stringContaining("J - מאושר"),
        link: "/meetings",
      }),
    );
  });

  it("returns generic error on unexpected DB failure (not P2025)", async () => {
    setupAuth();
    (prisma.meeting.update as any).mockRejectedValue(new Error("connection lost"));
    const res = await updateMeetingStatus("m1", "CONFIRMED");
    expect(res).toEqual({ success: false, error: "Failed to update meeting status" });
  });

  it("does NOT send notification when notifyOnMeetingStatusChange is OFF", async () => {
    setupAuth();
    (isNotificationEnabled as any).mockResolvedValue(false);
    (prisma.meeting.update as any).mockResolvedValue({ id: "m1", participantName: "J", meetingType: { name: "T" } });
    (prisma.user.findMany as any).mockResolvedValue([{ id: 100 }]);
    const res = await updateMeetingStatus("m1", "CONFIRMED");
    expect(res.success).toBe(true);
    expect(createNotificationForCompany).not.toHaveBeenCalled();
    // Restore for other tests
    (isNotificationEnabled as any).mockResolvedValue(true);
  });
});

// ════════════════════════════════════════════════════════════════════
// updateMeetingNotes
// ════════════════════════════════════════════════════════════════════
describe("updateMeetingNotes", () => {
  it("returns Unauthorized", async () => {
    setupNoAuth();
    expect((await updateMeetingNotes("m1", "hi")).error).toBe("Unauthorized");
  });

  it("returns Forbidden", async () => {
    setupForbidden();
    expect((await updateMeetingNotes("m1", "hi")).error).toBe("Forbidden");
  });

  it("rejects invalid id", async () => {
    setupAuth();
    expect((await updateMeetingNotes("", "hi")).error).toBe("Invalid ID");
  });

  it("returns rate limit error", async () => {
    setupRateLimited();
    expect((await updateMeetingNotes("m1", "hi")).error).toBe("Rate limit exceeded. Please try again later.");
  });

  it("returns error when notesBefore validation fails (null)", async () => {
    setupAuth();
    (validateNotes as any).mockReturnValue(null);
    const res = await updateMeetingNotes("m1", "too long");
    expect(res.error).toBe("הערות לפני ארוכות מדי");
  });

  it("returns error when notesAfter validation fails (null)", async () => {
    setupAuth();
    (validateNotes as any).mockReturnValueOnce("ok").mockReturnValueOnce(null);
    const res = await updateMeetingNotes("m1", "ok", "too long");
    expect(res.error).toBe("הערות אחרי ארוכות מדי");
  });

  it("only includes provided note fields in update", async () => {
    setupAuth();
    (validateNotes as any).mockReturnValue("validated note");
    (prisma.meeting.update as any).mockResolvedValue({ id: "m1" });
    await updateMeetingNotes("m1", "some note");
    const data = (prisma.meeting.update as any).mock.calls[0][0].data;
    expect(data.notesBefore).toBe("validated note");
    expect(data.notesAfter).toBeUndefined();
  });

  it("sets null when validated is empty string", async () => {
    setupAuth();
    (validateNotes as any).mockReturnValue("");
    (prisma.meeting.update as any).mockResolvedValue({ id: "m1" });
    await updateMeetingNotes("m1", "");
    const data = (prisma.meeting.update as any).mock.calls[0][0].data;
    expect(data.notesBefore).toBeNull();
  });

  it("includes both notesBefore and notesAfter when both provided", async () => {
    setupAuth();
    (validateNotes as any).mockReturnValueOnce("before note").mockReturnValueOnce("after note");
    (prisma.meeting.update as any).mockResolvedValue({ id: "m1" });
    const res = await updateMeetingNotes("m1", "before", "after");
    expect(res.success).toBe(true);
    const data = (prisma.meeting.update as any).mock.calls[0][0].data;
    expect(data.notesBefore).toBe("before note");
    expect(data.notesAfter).toBe("after note");
  });

  it("returns not found on P2025", async () => {
    setupAuth();
    (validateNotes as any).mockReturnValue("ok");
    const err: any = new Error("P2025");
    err.code = "P2025";
    (prisma.meeting.update as any).mockRejectedValue(err);
    expect((await updateMeetingNotes("m1", "hi")).error).toBe("פגישה לא נמצאה");
  });

  it("revalidates /meetings on success", async () => {
    setupAuth();
    (validateNotes as any).mockReturnValue("ok");
    (prisma.meeting.update as any).mockResolvedValue({ id: "m1" });
    await updateMeetingNotes("m1", "hi");
    expect(revalidatePath).toHaveBeenCalledWith("/meetings");
  });

  it("includes companyId in where clause", async () => {
    setupAuth();
    (validateNotes as any).mockReturnValue("ok");
    (prisma.meeting.update as any).mockResolvedValue({ id: "m1" });
    await updateMeetingNotes("m1", "hi");
    const call = (prisma.meeting.update as any).mock.calls[0][0];
    expect(call.where).toEqual({ id: "m1", companyId: mockUser.companyId });
  });

  it("returns generic error on unexpected DB failure (not P2025)", async () => {
    setupAuth();
    (validateNotes as any).mockReturnValue("ok");
    (prisma.meeting.update as any).mockRejectedValue(new Error("connection lost"));
    const res = await updateMeetingNotes("m1", "hi");
    expect(res).toEqual({ success: false, error: "Failed to update meeting notes" });
  });
});

// ════════════════════════════════════════════════════════════════════
// cancelMeeting
// ════════════════════════════════════════════════════════════════════
describe("cancelMeeting", () => {
  it("returns Unauthorized", async () => {
    setupNoAuth();
    expect((await cancelMeeting("m1")).error).toBe("Unauthorized");
  });

  it("returns Forbidden", async () => {
    setupForbidden();
    expect((await cancelMeeting("m1")).error).toBe("Forbidden");
  });

  it("rejects invalid id", async () => {
    setupAuth();
    expect((await cancelMeeting("")).error).toBe("Invalid ID");
    expect((await cancelMeeting("a".repeat(31))).error).toBe("Invalid ID");
  });

  it("returns rate limit error", async () => {
    setupRateLimited();
    expect((await cancelMeeting("m1")).error).toBe("Rate limit exceeded. Please try again later.");
  });

  it("sets CANCELLED, cancelledAt, cancelledBy:owner, truncated reason", async () => {
    setupAuth();
    const meeting = {
      id: "m1", meetingTypeId: 1, participantName: "J", participantEmail: "j@e.com",
      participantPhone: "123", startTime: new Date(), endTime: new Date(),
      meetingType: { name: "Test" },
    };
    (prisma.meeting.update as any).mockResolvedValue(meeting);
    (prisma.user.findMany as any).mockResolvedValue([]);

    const longReason = "a".repeat(2000);
    await cancelMeeting("m1", longReason);
    const data = (prisma.meeting.update as any).mock.calls[0][0].data;
    expect(data.status).toBe("CANCELLED");
    expect(data.cancelledAt).toBeInstanceOf(Date);
    expect(data.cancelledBy).toBe("owner");
    expect(data.cancelReason!.length).toBe(1000);
  });

  it("sets cancelReason to undefined when no reason provided", async () => {
    setupAuth();
    const meeting = {
      id: "m1", meetingTypeId: 1, participantName: "J", participantEmail: "j@e.com",
      participantPhone: "123", startTime: new Date(), endTime: new Date(),
      meetingType: { name: "Test" },
    };
    (prisma.meeting.update as any).mockResolvedValue(meeting);
    (prisma.user.findMany as any).mockResolvedValue([]);

    await cancelMeeting("m1");
    const data = (prisma.meeting.update as any).mock.calls[0][0].data;
    expect(data.cancelReason).toBeUndefined();
  });

  it("revalidates /meetings and /calendar", async () => {
    setupAuth();
    (prisma.meeting.update as any).mockResolvedValue({
      id: "m1", meetingTypeId: 1, participantName: "J",
      startTime: new Date(), endTime: new Date(), meetingType: { name: "T" },
    });
    (prisma.user.findMany as any).mockResolvedValue([]);
    await cancelMeeting("m1");
    expect(revalidatePath).toHaveBeenCalledWith("/meetings");
    expect(revalidatePath).toHaveBeenCalledWith("/calendar");
  });

  it("notification failure does not affect result", async () => {
    setupAuth();
    (prisma.meeting.update as any).mockResolvedValue({
      id: "m1", meetingTypeId: 1, participantName: "J",
      startTime: new Date(), endTime: new Date(), meetingType: { name: "T" },
    });
    (prisma.user.findMany as any).mockRejectedValue(new Error("notif fail"));
    const res = await cancelMeeting("m1");
    expect(res.success).toBe(true);
  });

  it("returns not found on P2025", async () => {
    setupAuth();
    const err: any = new Error("P2025");
    err.code = "P2025";
    (prisma.meeting.update as any).mockRejectedValue(err);
    expect((await cancelMeeting("m1")).error).toBe("פגישה לא נמצאה");
  });

  it("fires MEETING_CANCELLED automation with correct payload", async () => {
    const startTime = new Date("2025-06-01T10:00:00Z");
    const endTime = new Date("2025-06-01T10:30:00Z");
    setupAuth();
    const meeting = {
      id: "m1", meetingTypeId: 1, participantName: "J", participantEmail: "j@e.com",
      participantPhone: "123", startTime, endTime,
      meetingType: { name: "Test" },
    };
    (prisma.meeting.update as any).mockResolvedValue(meeting);
    (prisma.user.findMany as any).mockResolvedValue([]);

    await cancelMeeting("m1");

    expect(fireMeetingAutomations).toHaveBeenCalledWith(
      mockUser.companyId,
      "MEETING_CANCELLED",
      {
        id: "m1",
        meetingTypeId: 1,
        participantName: "J",
        participantEmail: "j@e.com",
        participantPhone: "123",
        startTime,
        endTime,
        meetingTypeName: "Test",
      },
    );
  });

  it("includes companyId in where clause", async () => {
    setupAuth();
    const meeting = {
      id: "m1", meetingTypeId: 1, participantName: "J", participantEmail: "j@e.com",
      participantPhone: "123", startTime: new Date(), endTime: new Date(),
      meetingType: { name: "Test" },
    };
    (prisma.meeting.update as any).mockResolvedValue(meeting);
    (prisma.user.findMany as any).mockResolvedValue([]);
    await cancelMeeting("m1");
    const call = (prisma.meeting.update as any).mock.calls[0][0];
    expect(call.where).toEqual({ id: "m1", companyId: mockUser.companyId });
  });

  it("queries admin users and dispatches notification on success", async () => {
    setupAuth();
    const meeting = {
      id: "m1", meetingTypeId: 1, participantName: "J", participantEmail: "j@e.com",
      participantPhone: "123", startTime: new Date(), endTime: new Date(),
      meetingType: { name: "Test" },
    };
    (prisma.meeting.update as any).mockResolvedValue(meeting);
    (prisma.user.findMany as any).mockResolvedValue([{ id: 100 }]);

    await cancelMeeting("m1");
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { companyId: mockUser.companyId, role: "admin" },
      select: { id: true },
      take: 25,
    });
    expect(createNotificationForCompany).toHaveBeenCalledTimes(1);
    expect(createNotificationForCompany).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: mockUser.companyId,
        userId: 100,
        title: expect.stringContaining("J - Test"),
        link: "/meetings",
      }),
    );
  });

  it("returns generic error on unexpected DB failure (not P2025)", async () => {
    setupAuth();
    (prisma.meeting.update as any).mockRejectedValue(new Error("connection lost"));
    const res = await cancelMeeting("m1");
    expect(res).toEqual({ success: false, error: "Failed to cancel meeting" });
  });

  it("does NOT send notification when notifyOnMeetingCancelled is OFF", async () => {
    setupAuth();
    (isNotificationEnabled as any).mockResolvedValue(false);
    (prisma.meeting.update as any).mockResolvedValue({
      id: "m1", meetingTypeId: 1, participantName: "J", participantEmail: "j@e.com",
      participantPhone: "123", startTime: new Date(), endTime: new Date(),
      meetingType: { name: "Test" },
    });
    (prisma.user.findMany as any).mockResolvedValue([{ id: 100 }]);
    const res = await cancelMeeting("m1");
    expect(res.success).toBe(true);
    expect(createNotificationForCompany).not.toHaveBeenCalled();
    (isNotificationEnabled as any).mockResolvedValue(true);
  });
});

// ════════════════════════════════════════════════════════════════════
// rescheduleMeeting
// ════════════════════════════════════════════════════════════════════
describe("rescheduleMeeting", () => {
  const validStart = "2025-06-01T10:00:00Z";
  const validEnd = "2025-06-01T11:00:00Z";

  it("returns Unauthorized", async () => {
    setupNoAuth();
    expect((await rescheduleMeeting("m1", validStart, validEnd)).error).toBe("Unauthorized");
  });

  it("returns Forbidden", async () => {
    setupForbidden();
    expect((await rescheduleMeeting("m1", validStart, validEnd)).error).toBe("Forbidden");
  });

  it("rejects invalid id", async () => {
    setupAuth();
    expect((await rescheduleMeeting("", validStart, validEnd)).error).toBe("Invalid ID");
  });

  it("returns rate limit error", async () => {
    setupRateLimited();
    expect((await rescheduleMeeting("m1", validStart, validEnd)).error).toBe("Rate limit exceeded. Please try again later.");
  });

  it("rejects invalid dates", async () => {
    setupAuth();
    expect((await rescheduleMeeting("m1", "not-a-date", validEnd)).error).toBe("תאריכים לא תקינים");
  });

  it("rejects endTime <= startTime", async () => {
    setupAuth();
    expect((await rescheduleMeeting("m1", validEnd, validStart)).error).toBe("שעת סיום חייבת להיות אחרי שעת התחלה");
  });

  it("rejects endTime == startTime", async () => {
    setupAuth();
    expect((await rescheduleMeeting("m1", validStart, validStart)).error).toBe("שעת סיום חייבת להיות אחרי שעת התחלה");
  });

  it("updates meeting times on success", async () => {
    setupAuth();
    const meeting = {
      id: "m1", calendarEventId: null, participantName: "J", meetingType: { name: "T" },
    };
    (prisma.meeting.update as any).mockResolvedValue(meeting);
    (prisma.user.findMany as any).mockResolvedValue([]);

    const res = await rescheduleMeeting("m1", validStart, validEnd);
    expect(res.success).toBe(true);
    const data = (prisma.meeting.update as any).mock.calls[0][0].data;
    expect(data.startTime).toEqual(new Date(validStart));
    expect(data.endTime).toEqual(new Date(validEnd));
  });

  it("updates calendarEvent when calendarEventId exists", async () => {
    setupAuth();
    const meeting = {
      id: "m1", calendarEventId: "ce1", participantName: "J", meetingType: { name: "T" },
    };
    (prisma.meeting.update as any).mockResolvedValue(meeting);
    (prisma.user.findMany as any).mockResolvedValue([]);

    await rescheduleMeeting("m1", validStart, validEnd);
    expect(prisma.calendarEvent.update).toHaveBeenCalledWith({
      where: { id: "ce1" },
      data: { startTime: new Date(validStart), endTime: new Date(validEnd) },
    });
  });

  it("skips calendarEvent update when calendarEventId is null", async () => {
    setupAuth();
    const meeting = { id: "m1", calendarEventId: null, participantName: "J", meetingType: { name: "T" } };
    (prisma.meeting.update as any).mockResolvedValue(meeting);
    (prisma.user.findMany as any).mockResolvedValue([]);

    await rescheduleMeeting("m1", validStart, validEnd);
    expect(prisma.calendarEvent.update).not.toHaveBeenCalled();
  });

  it("revalidates /meetings and /calendar", async () => {
    setupAuth();
    (prisma.meeting.update as any).mockResolvedValue({
      id: "m1", calendarEventId: null, participantName: "J", meetingType: { name: "T" },
    });
    (prisma.user.findMany as any).mockResolvedValue([]);
    await rescheduleMeeting("m1", validStart, validEnd);
    expect(revalidatePath).toHaveBeenCalledWith("/meetings");
    expect(revalidatePath).toHaveBeenCalledWith("/calendar");
  });

  it("notification failure does not affect result", async () => {
    setupAuth();
    (prisma.meeting.update as any).mockResolvedValue({
      id: "m1", calendarEventId: null, participantName: "J", meetingType: { name: "T" },
    });
    (prisma.user.findMany as any).mockRejectedValue(new Error("notification fail"));
    const res = await rescheduleMeeting("m1", validStart, validEnd);
    expect(res.success).toBe(true);
  });

  it("includes companyId in where clause", async () => {
    setupAuth();
    (prisma.meeting.update as any).mockResolvedValue({
      id: "m1", calendarEventId: null, participantName: "J", meetingType: { name: "T" },
    });
    (prisma.user.findMany as any).mockResolvedValue([]);
    await rescheduleMeeting("m1", validStart, validEnd);
    const call = (prisma.meeting.update as any).mock.calls[0][0];
    expect(call.where).toEqual({ id: "m1", companyId: mockUser.companyId });
  });

  it("dispatches notification to each admin on success", async () => {
    setupAuth();
    (prisma.meeting.update as any).mockResolvedValue({
      id: "m1", calendarEventId: null, participantName: "J", meetingType: { name: "T" },
    });
    (prisma.user.findMany as any).mockResolvedValue([{ id: 100 }, { id: 200 }]);
    await rescheduleMeeting("m1", validStart, validEnd);
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { companyId: mockUser.companyId, role: "admin" },
      select: { id: true },
      take: 25,
    });
    expect(createNotificationForCompany).toHaveBeenCalledTimes(2);
    expect(createNotificationForCompany).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: mockUser.companyId,
        userId: 100,
        title: expect.stringContaining("J - T"),
        link: "/meetings",
      }),
    );
    expect(createNotificationForCompany).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: mockUser.companyId,
        userId: 200,
        title: expect.stringContaining("J - T"),
        link: "/meetings",
      }),
    );
  });

  it("returns not found on P2025", async () => {
    setupAuth();
    const err: any = new Error("P2025");
    err.code = "P2025";
    (prisma.meeting.update as any).mockRejectedValue(err);
    expect((await rescheduleMeeting("m1", validStart, validEnd)).error).toBe("פגישה לא נמצאה");
  });

  it("returns generic error on unexpected DB failure (not P2025)", async () => {
    setupAuth();
    (prisma.meeting.update as any).mockRejectedValue(new Error("connection lost"));
    const res = await rescheduleMeeting("m1", validStart, validEnd);
    expect(res).toEqual({ success: false, error: "Failed to reschedule meeting" });
  });

  it("returns generic error when calendarEvent.update fails after meeting.update succeeds", async () => {
    setupAuth();
    (prisma.meeting.update as any).mockResolvedValue({
      id: "m1", calendarEventId: "ce1", participantName: "J", meetingType: { name: "T" },
    });
    (prisma.calendarEvent.update as any).mockRejectedValue(new Error("CE update failed"));

    const res = await rescheduleMeeting("m1", validStart, validEnd);
    expect(res).toEqual({ success: false, error: "Failed to reschedule meeting" });

    // meeting.update was called and succeeded
    expect(prisma.meeting.update).toHaveBeenCalledWith({
      where: { id: "m1", companyId: mockUser.companyId },
      data: { startTime: new Date(validStart), endTime: new Date(validEnd) },
      include: { meetingType: { select: { name: true } } },
    });

    // calendarEvent.update was attempted
    expect(prisma.calendarEvent.update).toHaveBeenCalledWith({
      where: { id: "ce1" },
      data: { startTime: new Date(validStart), endTime: new Date(validEnd) },
    });
  });

  it("does NOT send notification when notifyOnMeetingRescheduled is OFF", async () => {
    setupAuth();
    (isNotificationEnabled as any).mockResolvedValue(false);
    (prisma.meeting.update as any).mockResolvedValue({
      id: "m1", calendarEventId: null, participantName: "J", meetingType: { name: "T" },
    });
    (prisma.user.findMany as any).mockResolvedValue([{ id: 100 }]);
    const res = await rescheduleMeeting("m1", validStart, validEnd);
    expect(res.success).toBe(true);
    expect(createNotificationForCompany).not.toHaveBeenCalled();
    (isNotificationEnabled as any).mockResolvedValue(true);
  });
});

// ════════════════════════════════════════════════════════════════════
// linkMeetingToClient
// ════════════════════════════════════════════════════════════════════
describe("linkMeetingToClient", () => {
  it("returns Unauthorized", async () => {
    setupNoAuth();
    expect((await linkMeetingToClient("m1", 1)).error).toBe("Unauthorized");
  });

  it("returns Forbidden", async () => {
    setupForbidden();
    expect((await linkMeetingToClient("m1", 1)).error).toBe("Forbidden");
  });

  it("returns rate limit error", async () => {
    setupRateLimited();
    expect((await linkMeetingToClient("m1", 1)).error).toBe("Rate limit exceeded. Please try again later.");
  });

  it("accepts empty meetingId (no ID validation - known source gap)", async () => {
    setupAuth();
    (prisma.client.findFirst as any).mockResolvedValue({ id: 5 });
    (prisma.meeting.update as any).mockResolvedValue({ id: "" });
    const res = await linkMeetingToClient("", 5);
    // Unlike peer functions, no "Invalid ID" guard — passes through to Prisma
    expect(res.success).toBe(true);
    expect(prisma.meeting.update).toHaveBeenCalledWith({
      where: { id: "", companyId: mockUser.companyId },
      data: { clientId: 5 },
    });
  });

  it("accepts oversized meetingId (no length guard - known source gap)", async () => {
    setupAuth();
    const longId = "a".repeat(100);
    (prisma.client.findFirst as any).mockResolvedValue({ id: 5 });
    (prisma.meeting.update as any).mockResolvedValue({ id: longId });
    const res = await linkMeetingToClient(longId, 5);
    // Unlike peer functions, no id.length > 30 guard — passes through to Prisma
    expect(res.success).toBe(true);
    expect(prisma.meeting.update).toHaveBeenCalledWith({
      where: { id: longId, companyId: mockUser.companyId },
      data: { clientId: 5 },
    });
  });

  it("returns error when client not in company", async () => {
    setupAuth();
    (prisma.client.findFirst as any).mockResolvedValue(null);
    expect((await linkMeetingToClient("m1", 999)).error).toBe("לקוח לא נמצא");
  });

  it("verifies client with id and companyId", async () => {
    setupAuth();
    (prisma.client.findFirst as any).mockResolvedValue({ id: 5 });
    (prisma.meeting.update as any).mockResolvedValue({ id: "m1" });
    await linkMeetingToClient("m1", 5);
    expect(prisma.client.findFirst).toHaveBeenCalledWith({
      where: { id: 5, companyId: mockUser.companyId },
      select: { id: true },
    });
  });

  it("updates meeting with clientId and companyId in where", async () => {
    setupAuth();
    (prisma.client.findFirst as any).mockResolvedValue({ id: 5 });
    (prisma.meeting.update as any).mockResolvedValue({ id: "m1" });
    await linkMeetingToClient("m1", 5);
    expect(prisma.meeting.update).toHaveBeenCalledWith({
      where: { id: "m1", companyId: mockUser.companyId },
      data: { clientId: 5 },
    });
  });

  it("revalidates /meetings on success", async () => {
    setupAuth();
    (prisma.client.findFirst as any).mockResolvedValue({ id: 5 });
    (prisma.meeting.update as any).mockResolvedValue({ id: "m1" });
    await linkMeetingToClient("m1", 5);
    expect(revalidatePath).toHaveBeenCalledWith("/meetings");
  });

  it("returns not found on P2025", async () => {
    setupAuth();
    (prisma.client.findFirst as any).mockResolvedValue({ id: 5 });
    const err: any = new Error("P2025");
    err.code = "P2025";
    (prisma.meeting.update as any).mockRejectedValue(err);
    expect((await linkMeetingToClient("m1", 5)).error).toBe("פגישה לא נמצאה");
  });

  it("returns generic error on unexpected DB failure (not P2025)", async () => {
    setupAuth();
    (prisma.client.findFirst as any).mockResolvedValue({ id: 5 });
    (prisma.meeting.update as any).mockRejectedValue(new Error("connection lost"));
    const res = await linkMeetingToClient("m1", 5);
    expect(res).toEqual({ success: false, error: "Failed to link meeting to client" });
  });
});

// ════════════════════════════════════════════════════════════════════
// updateMeetingTags
// ════════════════════════════════════════════════════════════════════
describe("updateMeetingTags", () => {
  it("returns Unauthorized", async () => {
    setupNoAuth();
    expect((await updateMeetingTags("m1", ["a"])).error).toBe("Unauthorized");
  });

  it("returns Forbidden", async () => {
    setupForbidden();
    expect((await updateMeetingTags("m1", ["a"])).error).toBe("Forbidden");
  });

  it("rejects invalid id", async () => {
    setupAuth();
    expect((await updateMeetingTags("", ["a"])).error).toBe("Invalid ID");
    expect((await updateMeetingTags("a".repeat(31), ["a"])).error).toBe("Invalid ID");
  });

  it("returns rate limit error", async () => {
    setupRateLimited();
    expect((await updateMeetingTags("m1", ["a"])).error).toBe("Rate limit exceeded. Please try again later.");
  });

  it("returns error when validateTags returns null", async () => {
    setupAuth();
    (validateTags as any).mockReturnValue(null);
    expect((await updateMeetingTags("m1", "bad")).error).toBe("תגיות לא תקינות");
  });

  it("updates tags on success", async () => {
    setupAuth();
    (validateTags as any).mockReturnValue(["tag1", "tag2"]);
    (prisma.meeting.update as any).mockResolvedValue({ id: "m1" });
    await updateMeetingTags("m1", ["tag1", "tag2"]);
    expect(prisma.meeting.update).toHaveBeenCalledWith({
      where: { id: "m1", companyId: mockUser.companyId },
      data: { tags: ["tag1", "tag2"] },
    });
  });

  it("revalidates /meetings on success", async () => {
    setupAuth();
    (validateTags as any).mockReturnValue(["a"]);
    (prisma.meeting.update as any).mockResolvedValue({ id: "m1" });
    await updateMeetingTags("m1", ["a"]);
    expect(revalidatePath).toHaveBeenCalledWith("/meetings");
  });

  it("returns not found on P2025", async () => {
    setupAuth();
    (validateTags as any).mockReturnValue(["a"]);
    const err: any = new Error("P2025");
    err.code = "P2025";
    (prisma.meeting.update as any).mockRejectedValue(err);
    expect((await updateMeetingTags("m1", ["a"])).error).toBe("פגישה לא נמצאה");
  });

  it("returns generic error on unexpected DB failure (not P2025)", async () => {
    setupAuth();
    (validateTags as any).mockReturnValue(["a"]);
    (prisma.meeting.update as any).mockRejectedValue(new Error("connection lost"));
    const res = await updateMeetingTags("m1", ["a"]);
    expect(res).toEqual({ success: false, error: "Failed to update meeting tags" });
  });
});

// ════════════════════════════════════════════════════════════════════
// getTodaysMeetings
// ════════════════════════════════════════════════════════════════════
describe("getTodaysMeetings", () => {
  it("returns Unauthorized", async () => {
    setupNoAuth();
    expect((await getTodaysMeetings()).error).toBe("Unauthorized");
  });

  it("returns Forbidden", async () => {
    setupForbidden();
    expect((await getTodaysMeetings()).error).toBe("Forbidden");
  });

  it("returns rate limit error", async () => {
    setupRateLimited();
    expect((await getTodaysMeetings()).error).toBe("Rate limit exceeded. Please try again later.");
  });

  it("queries with correct date range and excludes CANCELLED", async () => {
    setupAuth();
    (prisma.meeting.findMany as any).mockResolvedValue([]);
    await getTodaysMeetings();
    const call = (prisma.meeting.findMany as any).mock.calls[0][0];
    expect(call.where.companyId).toBe(mockUser.companyId);
    expect(call.where.status).toEqual({ notIn: ["CANCELLED"] });
    expect(call.where.startTime.gte).toBeInstanceOf(Date);
    expect(call.where.startTime.lte).toBeInstanceOf(Date);
    // Check the date boundaries are within today
    const gte = call.where.startTime.gte as Date;
    const lte = call.where.startTime.lte as Date;
    expect(gte.getHours()).toBe(0);
    expect(gte.getMinutes()).toBe(0);
    expect(lte.getHours()).toBe(23);
    expect(lte.getMinutes()).toBe(59);
  });

  it("takes 20 and orders by startTime asc", async () => {
    setupAuth();
    (prisma.meeting.findMany as any).mockResolvedValue([]);
    await getTodaysMeetings();
    const call = (prisma.meeting.findMany as any).mock.calls[0][0];
    expect(call.take).toBe(20);
    expect(call.orderBy).toEqual({ startTime: "asc" });
  });

  it("returns meetings on success", async () => {
    setupAuth();
    const meetings = [{ id: "m1" }];
    (prisma.meeting.findMany as any).mockResolvedValue(meetings);
    const res = await getTodaysMeetings();
    expect(res).toEqual({ success: true, data: meetings });
  });

  it("returns generic error on failure", async () => {
    setupAuth();
    (prisma.meeting.findMany as any).mockRejectedValue(new Error("DB"));
    expect((await getTodaysMeetings()).error).toBe("Failed to fetch today's meetings");
  });

  it("uses getCachedMetric with 60s TTL and today's date key", async () => {
    setupAuth();
    (prisma.meeting.findMany as any).mockResolvedValue([]);
    await getTodaysMeetings();
    const call = (getCachedMetric as any).mock.calls.find(
      (c: any[]) => c[1]?.[0] === "todays-meetings"
    );
    expect(call).toBeDefined();
    expect(call[0]).toBe(mockUser.companyId);
    expect(call[1][0]).toBe("todays-meetings");
    expect(call[3]).toBe(60); // 60s TTL
  });
});

// ════════════════════════════════════════════════════════════════════
// getMeetingStats
// ════════════════════════════════════════════════════════════════════
describe("getMeetingStats", () => {
  it("returns Unauthorized", async () => {
    setupNoAuth();
    expect((await getMeetingStats()).error).toBe("Unauthorized");
  });

  it("returns Forbidden", async () => {
    setupForbidden();
    expect((await getMeetingStats()).error).toBe("Forbidden");
  });

  it("returns rate limit error", async () => {
    setupRateLimited();
    expect((await getMeetingStats()).error).toBe("Rate limit exceeded. Please try again later.");
  });

  it("returns 0 rates when total=0", async () => {
    setupAuth();
    (prisma.meeting.groupBy as any).mockResolvedValue([]);
    const res = await getMeetingStats();
    expect(res.success).toBe(true);
    const data = (res as any).data;
    expect(data.total).toBe(0);
    expect(data.cancellationRate).toBe(0);
    expect(data.noShowRate).toBe(0);
    expect(data.completedRate).toBe(0);
  });

  it("calculates rates correctly (Math.round percentages)", async () => {
    setupAuth();
    // First call: groupBy status, second call: groupBy meetingTypeId
    (prisma.meeting.groupBy as any)
      .mockResolvedValueOnce([
        { status: "COMPLETED", _count: { _all: 2 } },
        { status: "CANCELLED", _count: { _all: 1 } },
        { status: "NO_SHOW", _count: { _all: 1 } },
        { status: "PENDING", _count: { _all: 1 } },
        { status: "CONFIRMED", _count: { _all: 1 } },
      ])
      .mockResolvedValueOnce([
        { meetingTypeId: 1, _count: { _all: 4 } },
        { meetingTypeId: 2, _count: { _all: 2 } },
      ]);
    const res = await getMeetingStats();
    const data = (res as any).data;
    expect(data.total).toBe(6);
    // 1/6 ≈ 16.67 → 17
    expect(data.cancellationRate).toBe(17);
    expect(data.noShowRate).toBe(17);
    // 2/6 ≈ 33.33 → 33
    expect(data.completedRate).toBe(33);
  });

  it("groups by status and meetingTypeId", async () => {
    setupAuth();
    (prisma.meeting.groupBy as any)
      .mockResolvedValueOnce([
        { status: "COMPLETED", _count: { _all: 2 } },
        { status: "CANCELLED", _count: { _all: 1 } },
      ])
      .mockResolvedValueOnce([
        { meetingTypeId: 1, _count: { _all: 2 } },
        { meetingTypeId: 2, _count: { _all: 1 } },
      ]);
    const res = await getMeetingStats();
    const data = (res as any).data;
    expect(data.byStatus).toEqual({ COMPLETED: 2, CANCELLED: 1 });
    expect(data.byType).toEqual({ 1: 2, 2: 1 });
  });

  it("uses ~30 days for default (month) period", async () => {
    setupAuth();
    (prisma.meeting.groupBy as any).mockResolvedValue([]);
    await getMeetingStats();
    const where = (prisma.meeting.groupBy as any).mock.calls[0][0].where;
    const gte = where.startTime.gte as Date;
    const diffDays = (Date.now() - gte.getTime()) / 86400000;
    // Should be approximately 30 days (28-31 depending on month)
    expect(diffDays).toBeGreaterThanOrEqual(27);
    expect(diffDays).toBeLessThanOrEqual(32);
  });

  it("uses 7 days for week period", async () => {
    setupAuth();
    (prisma.meeting.groupBy as any).mockResolvedValue([]);
    await getMeetingStats("week");
    const where = (prisma.meeting.groupBy as any).mock.calls[0][0].where;
    const gte = where.startTime.gte as Date;
    const diffDays = (Date.now() - gte.getTime()) / 86400000;
    expect(diffDays).toBeGreaterThanOrEqual(6.9);
    expect(diffDays).toBeLessThanOrEqual(7.1);
  });

  it("calculates 100% cancellation rate when all cancelled (1/1)", async () => {
    setupAuth();
    (prisma.meeting.groupBy as any)
      .mockResolvedValueOnce([
        { status: "CANCELLED", _count: { _all: 1 } },
      ])
      .mockResolvedValueOnce([
        { meetingTypeId: 1, _count: { _all: 1 } },
      ]);
    const res = await getMeetingStats();
    const data = (res as any).data;
    expect(data.total).toBe(1);
    expect(data.cancellationRate).toBe(100);
    expect(data.completedRate).toBe(0);
    expect(data.noShowRate).toBe(0);
  });

  it("returns generic error on failure", async () => {
    setupAuth();
    (prisma.meeting.groupBy as any).mockRejectedValue(new Error("DB"));
    expect((await getMeetingStats()).error).toBe("Failed to fetch meeting stats");
  });
});

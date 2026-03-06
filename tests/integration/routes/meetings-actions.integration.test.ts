import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import type { User } from "@/lib/permissions";

// ── Hoisted mocks ────────────────────────────────────────────────────
const {
  mockGetCurrentUser,
  mockCheckActionRateLimit,
  mockCreateNotification,
  mockFireMeetingAutomations,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockCheckActionRateLimit: vi.fn(),
  mockCreateNotification: vi.fn(),
  mockFireMeetingAutomations: vi.fn(),
}));

// ── Module mocks (external dependencies only) ────────────────────────

vi.mock("@/lib/permissions-server", () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return {
    ...actual,
    checkActionRateLimit: mockCheckActionRateLimit,
  };
});

vi.mock("@/lib/notifications-internal", () => ({
  createNotificationForCompany: mockCreateNotification,
}));

vi.mock("@/app/actions/meeting-automations", () => ({
  fireMeetingAutomations: mockFireMeetingAutomations,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(null),
    del: vi.fn().mockResolvedValue(null),
    mget: vi.fn().mockResolvedValue([null, null]),
    multi: vi.fn(() => ({
      incr: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([[null, 1]]),
    })),
    pipeline: vi.fn(() => ({
      set: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([]),
    })),
    scan: vi.fn().mockResolvedValue(["0", []]),
    options: { keyPrefix: "" },
  },
  redisPublisher: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(null),
    del: vi.fn().mockResolvedValue(null),
  },
}));

// ── Import server actions AFTER mocks ────────────────────────────────
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

// ── Seeded IDs ───────────────────────────────────────────────────────
let company: { id: number };
let companyB: { id: number };
let adminUser: { id: number };
let basicUser: { id: number };
let otherUser: { id: number };
let seedMeetingType: { id: number };

function makeAdminUser(): User {
  return {
    id: adminUser.id,
    companyId: company.id,
    name: "David Cohen",
    email: "david.cohen@cohenbiz.co.il",
    role: "admin",
    allowedWriteTableIds: [],
    permissions: {},
    tablePermissions: {},
  };
}

function makeBasicUserWithView(): User {
  return {
    id: basicUser.id,
    companyId: company.id,
    name: "Sarah Levi",
    email: "sarah.levi@cohenbiz.co.il",
    role: "basic",
    allowedWriteTableIds: [],
    permissions: { canViewMeetings: true },
    tablePermissions: {},
  };
}

function makeBasicUserNoPermissions(): User {
  return {
    id: basicUser.id,
    companyId: company.id,
    name: "Sarah Levi",
    email: "sarah.levi@cohenbiz.co.il",
    role: "basic",
    allowedWriteTableIds: [],
    permissions: {},
    tablePermissions: {},
  };
}

function makeOtherCompanyAdmin(): User {
  return {
    id: otherUser.id,
    companyId: companyB.id,
    name: "Amit Berkovich",
    email: "amit.b@levitech.co.il",
    role: "admin",
    allowedWriteTableIds: [],
    permissions: {},
    tablePermissions: {},
  };
}

function futureDate(daysAhead: number, hour: number, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setUTCHours(hour, minute, 0, 0);
  return d;
}

// ── Seed + Cleanup ───────────────────────────────────────────────────

beforeAll(async () => {
  company = await prisma.company.create({
    data: { name: "Cohen Business Ltd", slug: `cohen-biz-${Date.now()}` },
  });
  companyB = await prisma.company.create({
    data: { name: "Levi Tech Ltd", slug: `levi-tech-${Date.now()}` },
  });

  adminUser = await prisma.user.create({
    data: {
      companyId: company.id,
      name: "David Cohen",
      email: `david.cohen-${Date.now()}@cohenbiz.co.il`,
      passwordHash: "$2b$10$fakehashedpassword",
      role: "admin",
      permissions: {},
      tablePermissions: {},
    },
  });
  basicUser = await prisma.user.create({
    data: {
      companyId: company.id,
      name: "Sarah Levi",
      email: `sarah.levi-${Date.now()}@cohenbiz.co.il`,
      passwordHash: "$2b$10$fakehashedpassword",
      role: "basic",
      permissions: { canViewMeetings: true },
      tablePermissions: {},
    },
  });
  otherUser = await prisma.user.create({
    data: {
      companyId: companyB.id,
      name: "Amit Berkovich",
      email: `amit.b-${Date.now()}@levitech.co.il`,
      passwordHash: "$2b$10$fakehashedpassword",
      role: "admin",
      permissions: {},
      tablePermissions: {},
    },
  });

  seedMeetingType = await prisma.meetingType.create({
    data: {
      companyId: company.id,
      name: "שיחת היכרות",
      slug: `intro-call-${Date.now()}`,
      duration: 30,
      isActive: true,
    },
  });
}, 30_000);

afterAll(async () => {
  const companyIds = [company?.id, companyB?.id].filter(Boolean) as number[];
  if (companyIds.length === 0) return;

  // FK-safe order: children first
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
  mockCheckActionRateLimit.mockResolvedValue(false);
  mockCreateNotification.mockResolvedValue(undefined);
  mockFireMeetingAutomations.mockResolvedValue(undefined);

  // Clean per-test ephemeral data
  const companyIds = [company.id, companyB.id];
  await prisma.meeting.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.calendarEvent.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.client.deleteMany({ where: { companyId: { in: companyIds } } });

  // Reset seed meeting type to active
  await prisma.meetingType.update({
    where: { id: seedMeetingType.id },
    data: { isActive: true },
  });
});

// =====================================================================
// A. getMeetingTypes
// =====================================================================

describe("getMeetingTypes", () => {
  it("returns all meeting types for company with correct fields", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const result = await getMeetingTypes();
    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data!.length).toBeGreaterThanOrEqual(1);

    const seed = result.data!.find((t: any) => t.id === seedMeetingType.id);
    expect(seed).toBeDefined();
    expect(seed.name).toBe("שיחת היכרות");
    expect(seed.duration).toBe(30);
    expect(seed.companyId).toBe(company.id);
  });

  it("returns empty array when company has no meeting types", async () => {
    mockGetCurrentUser.mockResolvedValue(makeOtherCompanyAdmin());

    const result = await getMeetingTypes();
    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
  });

  it("returns Unauthorized when no user", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const result = await getMeetingTypes();
    expect(result.success).toBe(false);
    expect(result.error).toBe("Unauthorized");
  });

  it("returns Forbidden when basic user lacks canViewMeetings", async () => {
    mockGetCurrentUser.mockResolvedValue(makeBasicUserNoPermissions());

    const result = await getMeetingTypes();
    expect(result.success).toBe(false);
    expect(result.error).toBe("Forbidden");
  });

  it("basic user WITH canViewMeetings can read meeting types", async () => {
    mockGetCurrentUser.mockResolvedValue(makeBasicUserWithView());

    const result = await getMeetingTypes();
    expect(result.success).toBe(true);
    expect(result.data!.length).toBeGreaterThanOrEqual(1);
  });
});

// =====================================================================
// B. createMeetingType
// =====================================================================

describe("createMeetingType", () => {
  it("creates with valid data and verifies DB state including @default values", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const slug = `new-consult-${Date.now()}`;
    const result = await createMeetingType({
      name: "ייעוץ מתקדם",
      slug,
      duration: 45,
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data.id).toBeGreaterThan(0);

    const inDb = await prisma.meetingType.findFirst({
      where: { companyId: company.id, slug },
    });
    expect(inDb).not.toBeNull();
    expect(inDb!.name).toBe("ייעוץ מתקדם");
    expect(inDb!.duration).toBe(45);
    expect(inDb!.companyId).toBe(company.id);
    // Verify @default values
    expect(inDb!.bufferBefore).toBe(0);
    expect(inDb!.bufferAfter).toBe(0);
    expect(inDb!.minAdvanceHours).toBe(24);
    expect(inDb!.maxAdvanceDays).toBe(30);
    expect(inDb!.isActive).toBe(true);
    expect(inDb!.order).toBe(0);
    expect(inDb!.dailyLimit).toBeNull();
    // shareToken auto-generated
    expect(typeof inDb!.shareToken).toBe("string");
    expect(inDb!.shareToken.length).toBeGreaterThan(10);

    await prisma.meetingType.delete({ where: { id: inDb!.id } });
  });

  it("returns P2002 error for duplicate slug within company", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const slug = `dup-slug-${Date.now()}`;
    const r1 = await createMeetingType({ name: "סוג ראשון", slug, duration: 30 });
    expect(r1.success).toBe(true);

    const r2 = await createMeetingType({ name: "סוג שני", slug, duration: 30 });
    expect(r2.success).toBe(false);
    expect(r2.error).toContain("slug");

    await prisma.meetingType.delete({ where: { id: r1.data!.id } });
  });

  it("enforces MAX_MEETING_TYPES_PER_COMPANY limit (50)", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const existing = await prisma.meetingType.count({ where: { companyId: company.id } });
    const toCreate = 50 - existing;

    // Use createMany for efficiency
    if (toCreate > 0) {
      await prisma.meetingType.createMany({
        data: Array.from({ length: toCreate }, (_, i) => ({
          companyId: company.id,
          name: `Filler Type ${i}`,
          slug: `filler-${Date.now()}-${i}`,
          duration: 15,
        })),
      });
    }

    const result = await createMeetingType({
      name: "Over Limit Type",
      slug: `over-limit-${Date.now()}`,
      duration: 30,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("50");

    // Cleanup fillers
    await prisma.meetingType.deleteMany({
      where: { companyId: company.id, name: { startsWith: "Filler Type" } },
    });
  });

  it("rejects invalid slug format", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const result = await createMeetingType({
      name: "Slug שגוי",
      slug: "UPPER CASE SPACES!",
      duration: 30,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("slug");
  });

  it("rejects duration out of range (< 5 or > 480)", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const tooShort = await createMeetingType({
      name: "קצר מדי",
      slug: `too-short-${Date.now()}`,
      duration: 2,
    });
    expect(tooShort.success).toBe(false);

    const tooLong = await createMeetingType({
      name: "ארוך מדי",
      slug: `too-long-${Date.now()}`,
      duration: 500,
    });
    expect(tooLong.success).toBe(false);
  });

  it("returns Unauthorized for null user, Forbidden for basic user without canManageMeetings", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const r1 = await createMeetingType({ name: "X", slug: "x", duration: 30 });
    expect(r1.success).toBe(false);
    expect(r1.error).toBe("Unauthorized");

    mockGetCurrentUser.mockResolvedValue(makeBasicUserWithView());
    const r2 = await createMeetingType({ name: "X", slug: "x", duration: 30 });
    expect(r2.success).toBe(false);
    expect(r2.error).toBe("Forbidden");
  });
});

// =====================================================================
// C. updateMeetingType
// =====================================================================

describe("updateMeetingType", () => {
  it("updates fields selectively — only changed fields updated, rest unchanged", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const mt = await prisma.meetingType.create({
      data: {
        companyId: company.id,
        name: "לעדכון",
        slug: `to-update-${Date.now()}`,
        duration: 30,
        color: "#FF5733",
      },
    });
    const originalUpdatedAt = mt.updatedAt;

    // Small delay to ensure updatedAt changes
    await new Promise((r) => setTimeout(r, 50));

    const result = await updateMeetingType(mt.id, { name: "שם מעודכן" });
    expect(result.success).toBe(true);

    const inDb = await prisma.meetingType.findUnique({ where: { id: mt.id } });
    expect(inDb!.name).toBe("שם מעודכן");
    expect(inDb!.duration).toBe(30); // unchanged
    expect(inDb!.color).toBe("#FF5733"); // unchanged
    // @updatedAt should change
    expect(inDb!.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());

    await prisma.meetingType.delete({ where: { id: mt.id } });
  });

  it("returns P2025 error for non-existent ID", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const result = await updateMeetingType(999999, { name: "Ghost" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("לא נמצא");
  });

  it("returns P2002 for duplicate slug within same company", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const slug1 = `slug-a-${Date.now()}`;
    const slug2 = `slug-b-${Date.now()}`;
    const mt1 = await prisma.meetingType.create({
      data: { companyId: company.id, name: "סוג א", slug: slug1, duration: 30 },
    });
    const mt2 = await prisma.meetingType.create({
      data: { companyId: company.id, name: "סוג ב", slug: slug2, duration: 30 },
    });

    const result = await updateMeetingType(mt2.id, { slug: slug1 });
    expect(result.success).toBe(false);
    expect(result.error).toContain("slug");

    await prisma.meetingType.deleteMany({ where: { id: { in: [mt1.id, mt2.id] } } });
  });

  it("rejects invalid ID (0 or negative)", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const r1 = await updateMeetingType(0, { name: "Zero" });
    expect(r1.success).toBe(false);
    expect(r1.error).toBe("Invalid ID");

    const r2 = await updateMeetingType(-5, { name: "Negative" });
    expect(r2.success).toBe(false);
    expect(r2.error).toBe("Invalid ID");
  });
});

// =====================================================================
// D. deleteMeetingType (soft delete)
// =====================================================================

describe("deleteMeetingType", () => {
  it("sets isActive = false in DB (soft delete, not hard delete)", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const mt = await prisma.meetingType.create({
      data: {
        companyId: company.id,
        name: "למחיקה רכה",
        slug: `to-soft-delete-${Date.now()}`,
        duration: 30,
        isActive: true,
      },
    });

    const result = await deleteMeetingType(mt.id);
    expect(result.success).toBe(true);

    const inDb = await prisma.meetingType.findUnique({ where: { id: mt.id } });
    expect(inDb).not.toBeNull(); // NOT hard-deleted
    expect(inDb!.isActive).toBe(false);

    await prisma.meetingType.delete({ where: { id: mt.id } });
  });

  it("returns P2025 for non-existent ID", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const result = await deleteMeetingType(999999);
    expect(result.success).toBe(false);
    expect(result.error).toContain("לא נמצא");
  });

  it("rejects invalid ID (0 or negative)", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const r1 = await deleteMeetingType(0);
    expect(r1.success).toBe(false);
    expect(r1.error).toBe("Invalid ID");
  });
});

// =====================================================================
// E. getMeetings
// =====================================================================

describe("getMeetings", () => {
  it("returns paginated meetings with meetingType and client includes", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const client = await prisma.client.create({
      data: { companyId: company.id, name: "לקוח לבדיקה", email: "client@example.co.il" },
    });

    await prisma.meeting.create({
      data: {
        companyId: company.id,
        meetingTypeId: seedMeetingType.id,
        participantName: "נועה ישראלי",
        participantEmail: "noa.i@example.co.il",
        startTime: futureDate(3, 10),
        endTime: futureDate(3, 10, 30),
        status: "PENDING",
        clientId: client.id,
      },
    });

    const result = await getMeetings();
    expect(result.success).toBe(true);
    expect(result.data!.meetings.length).toBe(1);
    expect(result.data!.total).toBe(1);
    // Verify includes
    expect(result.data!.meetings[0].meetingType).toBeDefined();
    expect(result.data!.meetings[0].meetingType.name).toBe("שיחת היכרות");
    expect(result.data!.meetings[0].client).toBeDefined();
    expect(result.data!.meetings[0].client.name).toBe("לקוח לבדיקה");
  });

  it("filters by status", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    await prisma.meeting.createMany({
      data: [
        {
          companyId: company.id,
          meetingTypeId: seedMeetingType.id,
          participantName: "ממתין",
          startTime: futureDate(3, 10),
          endTime: futureDate(3, 10, 30),
          status: "PENDING",
        },
        {
          companyId: company.id,
          meetingTypeId: seedMeetingType.id,
          participantName: "מאושר",
          startTime: futureDate(3, 11),
          endTime: futureDate(3, 11, 30),
          status: "CONFIRMED",
        },
      ],
    });

    const result = await getMeetings({ status: "PENDING" });
    expect(result.success).toBe(true);
    expect(result.data!.meetings.length).toBe(1);
    expect(result.data!.meetings[0].participantName).toBe("ממתין");
  });

  it("filters by meetingTypeId", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const otherType = await prisma.meetingType.create({
      data: { companyId: company.id, name: "סוג אחר", slug: `other-type-${Date.now()}`, duration: 60 },
    });

    await prisma.meeting.createMany({
      data: [
        {
          companyId: company.id,
          meetingTypeId: seedMeetingType.id,
          participantName: "סוג 1",
          startTime: futureDate(3, 10),
          endTime: futureDate(3, 10, 30),
          status: "PENDING",
        },
        {
          companyId: company.id,
          meetingTypeId: otherType.id,
          participantName: "סוג 2",
          startTime: futureDate(3, 11),
          endTime: futureDate(3, 12),
          status: "PENDING",
        },
      ],
    });

    const result = await getMeetings({ meetingTypeId: otherType.id });
    expect(result.success).toBe(true);
    expect(result.data!.meetings.length).toBe(1);
    expect(result.data!.meetings[0].participantName).toBe("סוג 2");

    await prisma.meeting.deleteMany({ where: { meetingTypeId: otherType.id } });
    await prisma.meetingType.delete({ where: { id: otherType.id } });
  });

  it("filters by date range", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    await prisma.meeting.createMany({
      data: [
        {
          companyId: company.id,
          meetingTypeId: seedMeetingType.id,
          participantName: "בטווח",
          startTime: futureDate(5, 10),
          endTime: futureDate(5, 10, 30),
          status: "PENDING",
        },
        {
          companyId: company.id,
          meetingTypeId: seedMeetingType.id,
          participantName: "מחוץ לטווח",
          startTime: futureDate(20, 10),
          endTime: futureDate(20, 10, 30),
          status: "PENDING",
        },
      ],
    });

    const result = await getMeetings({
      startDate: futureDate(4, 0).toISOString(),
      endDate: futureDate(6, 23).toISOString(),
    });
    expect(result.success).toBe(true);
    expect(result.data!.meetings.length).toBe(1);
    expect(result.data!.meetings[0].participantName).toBe("בטווח");
  });

  it("respects page/limit pagination with correct total", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    for (let i = 0; i < 5; i++) {
      await prisma.meeting.create({
        data: {
          companyId: company.id,
          meetingTypeId: seedMeetingType.id,
          participantName: `עמוד ${i}`,
          startTime: futureDate(3 + i, 10),
          endTime: futureDate(3 + i, 10, 30),
          status: "PENDING",
        },
      });
    }

    const page1 = await getMeetings({ page: 1, limit: 2 });
    expect(page1.success).toBe(true);
    expect(page1.data!.meetings.length).toBe(2);
    expect(page1.data!.total).toBe(5);
    expect(page1.data!.page).toBe(1);
    expect(page1.data!.limit).toBe(2);

    const page2 = await getMeetings({ page: 2, limit: 2 });
    expect(page2.success).toBe(true);
    expect(page2.data!.meetings.length).toBe(2);

    // Verify descending order within page 1
    const p1Times = page1.data!.meetings.map((m: any) => new Date(m.startTime).getTime());
    expect(p1Times[0]).toBeGreaterThan(p1Times[1]);

    // Verify descending order within page 2
    const p2Times = page2.data!.meetings.map((m: any) => new Date(m.startTime).getTime());
    expect(p2Times[0]).toBeGreaterThan(p2Times[1]);

    // Verify cross-page ordering: last item on page 1 >= first item on page 2
    expect(p1Times[p1Times.length - 1]).toBeGreaterThan(p2Times[0]);
  });

  it("company isolation: does not return other company's meetings", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const otherMt = await prisma.meetingType.create({
      data: { companyId: companyB.id, name: "סוג חברה ב", slug: `other-co-${Date.now()}`, duration: 30 },
    });
    await prisma.meeting.create({
      data: {
        companyId: companyB.id,
        meetingTypeId: otherMt.id,
        participantName: "לקוח חברה ב",
        startTime: futureDate(3, 10),
        endTime: futureDate(3, 10, 30),
        status: "PENDING",
      },
    });

    const result = await getMeetings();
    expect(result.success).toBe(true);
    const names = result.data!.meetings.map((m: any) => m.participantName);
    expect(names).not.toContain("לקוח חברה ב");

    await prisma.meeting.deleteMany({ where: { meetingTypeId: otherMt.id } });
    await prisma.meetingType.delete({ where: { id: otherMt.id } });
  });

  it("returns rate limit error when rate limited", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());
    mockCheckActionRateLimit.mockResolvedValueOnce(true);

    const result = await getMeetings();
    expect(result.success).toBe(false);
    expect(result.error).toContain("Rate limit");
  });
});

// =====================================================================
// F. getMeetingById
// =====================================================================

describe("getMeetingById", () => {
  it("returns full meeting with all relations", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const calEvent = await prisma.calendarEvent.create({
      data: {
        companyId: company.id,
        title: "פגישה מפורטת",
        startTime: futureDate(3, 10),
        endTime: futureDate(3, 10, 30),
      },
    });

    const client = await prisma.client.create({
      data: { companyId: company.id, name: "רחל כהן", email: "rachel.c@example.co.il" },
    });

    const meeting = await prisma.meeting.create({
      data: {
        companyId: company.id,
        meetingTypeId: seedMeetingType.id,
        participantName: "רחל כהן",
        participantEmail: "rachel.c@example.co.il",
        startTime: futureDate(3, 10),
        endTime: futureDate(3, 10, 30),
        status: "PENDING",
        clientId: client.id,
        calendarEventId: calEvent.id,
      },
    });

    const result = await getMeetingById(meeting.id);
    expect(result.success).toBe(true);
    expect(result.data!.participantName).toBe("רחל כהן");
    expect(result.data!.meetingType).toBeDefined();
    expect(result.data!.meetingType.name).toBe("שיחת היכרות");
    expect(result.data!.client).toBeDefined();
    expect(result.data!.client.name).toBe("רחל כהן");
    expect(result.data!.calendarEvent).toBeDefined();
    expect(result.data!.calendarEvent.title).toBe("פגישה מפורטת");
  });

  it("returns null client when meeting has no linked client (optional relation)", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const meeting = await prisma.meeting.create({
      data: {
        companyId: company.id,
        meetingTypeId: seedMeetingType.id,
        participantName: "ללא לקוח",
        startTime: futureDate(3, 10),
        endTime: futureDate(3, 10, 30),
        status: "PENDING",
      },
    });

    const result = await getMeetingById(meeting.id);
    expect(result.success).toBe(true);
    expect(result.data!.client).toBeNull();
    expect(result.data!.calendarEvent).toBeNull();
  });

  it("returns not-found for other company's meeting (company isolation)", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const otherMt = await prisma.meetingType.create({
      data: { companyId: companyB.id, name: "סוג חיצוני", slug: `other-byid-${Date.now()}`, duration: 30 },
    });
    const otherMeeting = await prisma.meeting.create({
      data: {
        companyId: companyB.id,
        meetingTypeId: otherMt.id,
        participantName: "אדם אחר",
        startTime: futureDate(3, 10),
        endTime: futureDate(3, 10, 30),
        status: "PENDING",
      },
    });

    const result = await getMeetingById(otherMeeting.id);
    expect(result.success).toBe(false);
    expect(result.error).toContain("לא נמצאה");

    await prisma.meeting.deleteMany({ where: { meetingTypeId: otherMt.id } });
    await prisma.meetingType.delete({ where: { id: otherMt.id } });
  });
});

// =====================================================================
// G. updateMeetingStatus
// =====================================================================

describe("updateMeetingStatus", () => {
  it("updates status in DB (PENDING → CONFIRMED)", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const meeting = await prisma.meeting.create({
      data: {
        companyId: company.id,
        meetingTypeId: seedMeetingType.id,
        participantName: "שינוי סטטוס",
        startTime: futureDate(3, 10),
        endTime: futureDate(3, 10, 30),
        status: "PENDING",
      },
    });

    const result = await updateMeetingStatus(meeting.id, "CONFIRMED");
    expect(result.success).toBe(true);

    const inDb = await prisma.meeting.findUnique({ where: { id: meeting.id } });
    expect(inDb!.status).toBe("CONFIRMED");
    // cancelledAt should NOT be set for non-CANCELLED status
    expect(inDb!.cancelledAt).toBeNull();
    expect(inDb!.cancelledBy).toBeNull();
    // @updatedAt should be updated after status change
    expect(inDb!.updatedAt.getTime()).toBeGreaterThan(meeting.createdAt.getTime());
  });

  it("sets cancelledAt/cancelledBy=owner when status = CANCELLED", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const meeting = await prisma.meeting.create({
      data: {
        companyId: company.id,
        meetingTypeId: seedMeetingType.id,
        participantName: "ביטול דרך סטטוס",
        startTime: futureDate(3, 10),
        endTime: futureDate(3, 10, 30),
        status: "PENDING",
      },
    });

    await updateMeetingStatus(meeting.id, "CANCELLED");

    const inDb = await prisma.meeting.findUnique({ where: { id: meeting.id } });
    expect(inDb!.status).toBe("CANCELLED");
    expect(inDb!.cancelledAt).toBeInstanceOf(Date);
    expect(inDb!.cancelledBy).toBe("owner");
  });

  it("rejects invalid status string", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const meeting = await prisma.meeting.create({
      data: {
        companyId: company.id,
        meetingTypeId: seedMeetingType.id,
        participantName: "סטטוס שגוי",
        startTime: futureDate(3, 10),
        endTime: futureDate(3, 10, 30),
        status: "PENDING",
      },
    });

    const result = await updateMeetingStatus(meeting.id, "INVALID_STATUS");
    expect(result.success).toBe(false);

    // Verify status unchanged in DB
    const inDb = await prisma.meeting.findUnique({ where: { id: meeting.id } });
    expect(inDb!.status).toBe("PENDING");
  });

  it("returns P2025 for non-existent meeting", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const result = await updateMeetingStatus("nonexistent12345678901", "CONFIRMED");
    expect(result.success).toBe(false);
    expect(result.error).toContain("לא נמצאה");
  });
});

// =====================================================================
// H. updateMeetingNotes
// =====================================================================

describe("updateMeetingNotes", () => {
  it("updates notesBefore/notesAfter in DB", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const meeting = await prisma.meeting.create({
      data: {
        companyId: company.id,
        meetingTypeId: seedMeetingType.id,
        participantName: "הערות בדיקה",
        startTime: futureDate(3, 10),
        endTime: futureDate(3, 10, 30),
        status: "PENDING",
      },
    });

    const result = await updateMeetingNotes(meeting.id, "להכין מצגת", "סיכום: לקוח מעוניין");
    expect(result.success).toBe(true);

    const inDb = await prisma.meeting.findUnique({ where: { id: meeting.id } });
    expect(inDb!.notesBefore).toBe("להכין מצגת");
    expect(inDb!.notesAfter).toBe("סיכום: לקוח מעוניין");
    expect(inDb!.updatedAt.getTime()).toBeGreaterThan(meeting.createdAt.getTime());
  });

  it("updates only notesBefore when notesAfter is undefined", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const meeting = await prisma.meeting.create({
      data: {
        companyId: company.id,
        meetingTypeId: seedMeetingType.id,
        participantName: "הערות חלקיות",
        startTime: futureDate(3, 10),
        endTime: futureDate(3, 10, 30),
        status: "PENDING",
        notesAfter: "הערה קיימת",
      },
    });

    const result = await updateMeetingNotes(meeting.id, "הערה חדשה לפני");
    expect(result.success).toBe(true);

    const inDb = await prisma.meeting.findUnique({ where: { id: meeting.id } });
    expect(inDb!.notesBefore).toBe("הערה חדשה לפני");
    expect(inDb!.notesAfter).toBe("הערה קיימת"); // unchanged
  });

  it("rejects notes exceeding MAX_NOTES_LENGTH (5000)", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const meeting = await prisma.meeting.create({
      data: {
        companyId: company.id,
        meetingTypeId: seedMeetingType.id,
        participantName: "הערות ארוכות",
        startTime: futureDate(3, 10),
        endTime: futureDate(3, 10, 30),
        status: "PENDING",
      },
    });

    const longNotes = "א".repeat(5001);
    const result = await updateMeetingNotes(meeting.id, longNotes);
    expect(result.success).toBe(false);

    // Verify DB unchanged
    const inDb = await prisma.meeting.findUnique({ where: { id: meeting.id } });
    expect(inDb!.notesBefore).toBeNull();
  });

  it("stores null for empty notes (clears existing)", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const meeting = await prisma.meeting.create({
      data: {
        companyId: company.id,
        meetingTypeId: seedMeetingType.id,
        participantName: "ניקוי הערות",
        startTime: futureDate(3, 10),
        endTime: futureDate(3, 10, 30),
        status: "PENDING",
        notesBefore: "הערה ישנה",
      },
    });

    const result = await updateMeetingNotes(meeting.id, "");
    expect(result.success).toBe(true);

    const inDb = await prisma.meeting.findUnique({ where: { id: meeting.id } });
    expect(inDb!.notesBefore).toBeNull();
  });
});

// =====================================================================
// I. cancelMeeting
// =====================================================================

describe("cancelMeeting", () => {
  it("sets status=CANCELLED, cancelledBy=owner, stores cancelReason", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const meeting = await prisma.meeting.create({
      data: {
        companyId: company.id,
        meetingTypeId: seedMeetingType.id,
        participantName: "מוריה אברהם",
        startTime: futureDate(3, 10),
        endTime: futureDate(3, 10, 30),
        status: "PENDING",
      },
    });

    const result = await cancelMeeting(meeting.id, "הלקוח ביקש לבטל");
    expect(result.success).toBe(true);

    const inDb = await prisma.meeting.findUnique({ where: { id: meeting.id } });
    expect(inDb!.status).toBe("CANCELLED");
    expect(inDb!.cancelledBy).toBe("owner");
    expect(inDb!.cancelReason).toBe("הלקוח ביקש לבטל");
    expect(inDb!.cancelledAt).toBeInstanceOf(Date);
    // @updatedAt should change
    expect(inDb!.updatedAt.getTime()).toBeGreaterThan(meeting.createdAt.getTime());
    // Side effects: notification and automation should fire
    expect(mockCreateNotification).toHaveBeenCalled();
    expect(mockFireMeetingAutomations).toHaveBeenCalled();
  });

  it("truncates cancel reason at 1000 characters", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const meeting = await prisma.meeting.create({
      data: {
        companyId: company.id,
        meetingTypeId: seedMeetingType.id,
        participantName: "סיבה ארוכה",
        startTime: futureDate(3, 10),
        endTime: futureDate(3, 10, 30),
        status: "PENDING",
      },
    });

    const longReason = "א".repeat(1500);
    const result = await cancelMeeting(meeting.id, longReason);
    expect(result.success).toBe(true);

    const inDb = await prisma.meeting.findUnique({ where: { id: meeting.id } });
    expect(inDb!.cancelReason!.length).toBeLessThanOrEqual(1000);
  });

  it("returns P2025 for non-existent meeting", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const result = await cancelMeeting("nonexistent12345678901");
    expect(result.success).toBe(false);
    expect(result.error).toContain("לא נמצאה");
  });
});

// =====================================================================
// J. rescheduleMeeting
// =====================================================================

describe("rescheduleMeeting", () => {
  it("updates startTime/endTime in DB and linked calendarEvent", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const calEvent = await prisma.calendarEvent.create({
      data: {
        companyId: company.id,
        title: "פגישה לדחייה",
        startTime: futureDate(3, 10),
        endTime: futureDate(3, 10, 30),
      },
    });

    const meeting = await prisma.meeting.create({
      data: {
        companyId: company.id,
        meetingTypeId: seedMeetingType.id,
        participantName: "דחייה עם אירוע",
        startTime: futureDate(3, 10),
        endTime: futureDate(3, 10, 30),
        status: "PENDING",
        calendarEventId: calEvent.id,
      },
    });

    const newStart = futureDate(5, 14);
    const newEnd = futureDate(5, 14, 30);

    const result = await rescheduleMeeting(meeting.id, newStart.toISOString(), newEnd.toISOString());
    expect(result.success).toBe(true);

    const meetingDb = await prisma.meeting.findUnique({ where: { id: meeting.id } });
    expect(meetingDb!.startTime.getTime()).toBe(newStart.getTime());
    expect(meetingDb!.endTime.getTime()).toBe(newEnd.getTime());

    const calDb = await prisma.calendarEvent.findUnique({ where: { id: calEvent.id } });
    expect(calDb!.startTime.getTime()).toBe(newStart.getTime());
    expect(calDb!.endTime.getTime()).toBe(newEnd.getTime());
    expect(meetingDb!.updatedAt.getTime()).toBeGreaterThan(meeting.createdAt.getTime());
  });

  it("succeeds without linked calendarEvent (calendarEventId null)", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const meeting = await prisma.meeting.create({
      data: {
        companyId: company.id,
        meetingTypeId: seedMeetingType.id,
        participantName: "ללא אירוע יומן",
        startTime: futureDate(3, 10),
        endTime: futureDate(3, 10, 30),
        status: "PENDING",
        // No calendarEventId
      },
    });

    const newStart = futureDate(5, 14);
    const newEnd = futureDate(5, 14, 30);

    const result = await rescheduleMeeting(meeting.id, newStart.toISOString(), newEnd.toISOString());
    expect(result.success).toBe(true);

    const inDb = await prisma.meeting.findUnique({ where: { id: meeting.id } });
    expect(inDb!.startTime.getTime()).toBe(newStart.getTime());
    expect(inDb!.calendarEventId).toBeNull();
  });

  it("rejects endTime <= startTime", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const meeting = await prisma.meeting.create({
      data: {
        companyId: company.id,
        meetingTypeId: seedMeetingType.id,
        participantName: "זמנים שגויים",
        startTime: futureDate(3, 10),
        endTime: futureDate(3, 10, 30),
        status: "PENDING",
      },
    });

    const sameTime = futureDate(5, 14);
    const result = await rescheduleMeeting(meeting.id, sameTime.toISOString(), sameTime.toISOString());
    expect(result.success).toBe(false);

    // Verify DB unchanged
    const inDb = await prisma.meeting.findUnique({ where: { id: meeting.id } });
    expect(inDb!.startTime.getTime()).not.toBe(sameTime.getTime());
  });

  it("rejects invalid date strings", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const meeting = await prisma.meeting.create({
      data: {
        companyId: company.id,
        meetingTypeId: seedMeetingType.id,
        participantName: "תאריך שגוי",
        startTime: futureDate(3, 10),
        endTime: futureDate(3, 10, 30),
        status: "PENDING",
      },
    });

    const result = await rescheduleMeeting(meeting.id, "not-a-date", "also-not");
    expect(result.success).toBe(false);
  });

  it("returns P2025 for non-existent meeting", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const result = await rescheduleMeeting(
      "nonexistent12345678901",
      futureDate(5, 14).toISOString(),
      futureDate(5, 14, 30).toISOString(),
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("לא נמצאה");
  });
});

// =====================================================================
// K. linkMeetingToClient
// =====================================================================

describe("linkMeetingToClient", () => {
  it("links meeting to existing client and verifies DB", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const client = await prisma.client.create({
      data: { companyId: company.id, name: "אורי לוי", email: "ori.l@example.co.il" },
    });

    const meeting = await prisma.meeting.create({
      data: {
        companyId: company.id,
        meetingTypeId: seedMeetingType.id,
        participantName: "אורי לוי",
        startTime: futureDate(3, 10),
        endTime: futureDate(3, 10, 30),
        status: "PENDING",
      },
    });

    const result = await linkMeetingToClient(meeting.id, client.id);
    expect(result.success).toBe(true);

    const inDb = await prisma.meeting.findUnique({ where: { id: meeting.id } });
    expect(inDb!.clientId).toBe(client.id);
  });

  it("overwrites existing client link with new client", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const clientA = await prisma.client.create({
      data: { companyId: company.id, name: "לקוח א", email: "clienta@example.co.il" },
    });
    const clientB = await prisma.client.create({
      data: { companyId: company.id, name: "לקוח ב", email: "clientb@example.co.il" },
    });

    const meeting = await prisma.meeting.create({
      data: {
        companyId: company.id,
        meetingTypeId: seedMeetingType.id,
        participantName: "בדיקת החלפה",
        startTime: futureDate(3, 10),
        endTime: futureDate(3, 10, 30),
        status: "PENDING",
        clientId: clientA.id,
      },
    });

    // Verify initially linked to clientA
    const before = await prisma.meeting.findUnique({ where: { id: meeting.id } });
    expect(before!.clientId).toBe(clientA.id);

    // Overwrite with clientB
    const result = await linkMeetingToClient(meeting.id, clientB.id);
    expect(result.success).toBe(true);

    const after = await prisma.meeting.findUnique({ where: { id: meeting.id } });
    expect(after!.clientId).toBe(clientB.id);
  });

  it("rejects non-existent client", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const meeting = await prisma.meeting.create({
      data: {
        companyId: company.id,
        meetingTypeId: seedMeetingType.id,
        participantName: "לקוח חסר",
        startTime: futureDate(3, 10),
        endTime: futureDate(3, 10, 30),
        status: "PENDING",
      },
    });

    const result = await linkMeetingToClient(meeting.id, 999999);
    expect(result.success).toBe(false);
    expect(result.error).toContain("לקוח");

    // Verify meeting clientId unchanged
    const inDb = await prisma.meeting.findUnique({ where: { id: meeting.id } });
    expect(inDb!.clientId).toBeNull();
  });

  it("rejects client from different company (cross-company isolation)", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const otherClient = await prisma.client.create({
      data: { companyId: companyB.id, name: "לקוח חברה אחרת" },
    });

    const meeting = await prisma.meeting.create({
      data: {
        companyId: company.id,
        meetingTypeId: seedMeetingType.id,
        participantName: "בדיקת בידוד",
        startTime: futureDate(3, 10),
        endTime: futureDate(3, 10, 30),
        status: "PENDING",
      },
    });

    const result = await linkMeetingToClient(meeting.id, otherClient.id);
    expect(result.success).toBe(false);
    expect(result.error).toContain("לקוח");
  });

  it("returns P2025 for non-existent meeting", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const client = await prisma.client.create({
      data: { companyId: company.id, name: "לקוח תקין" },
    });

    const result = await linkMeetingToClient("nonexistent12345678901", client.id);
    expect(result.success).toBe(false);
    expect(result.error).toContain("לא נמצאה");
  });
});

// =====================================================================
// L. updateMeetingTags
// =====================================================================

describe("updateMeetingTags", () => {
  let meetingId: string;

  beforeEach(async () => {
    const meeting = await prisma.meeting.create({
      data: {
        companyId: company.id,
        meetingTypeId: seedMeetingType.id,
        participantName: "בדיקת תגיות",
        startTime: futureDate(3, 10),
        endTime: futureDate(3, 10, 30),
        status: "PENDING",
      },
    });
    meetingId = meeting.id;
  });

  it("stores valid tags array and verifies in DB", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const result = await updateMeetingTags(meetingId, ["חשוב", "מעקב", "VIP"]);
    expect(result.success).toBe(true);

    const inDb = await prisma.meeting.findUnique({ where: { id: meetingId } });
    expect(inDb!.tags).toEqual(["חשוב", "מעקב", "VIP"]);
  });

  it("stores empty tags array (valid)", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    // First set some tags
    await prisma.meeting.update({ where: { id: meetingId }, data: { tags: ["old"] } });

    const result = await updateMeetingTags(meetingId, []);
    expect(result.success).toBe(true);

    const inDb = await prisma.meeting.findUnique({ where: { id: meetingId } });
    expect(inDb!.tags).toEqual([]);
  });

  it("rejects non-string tags", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const result = await updateMeetingTags(meetingId, [123, true]);
    expect(result.success).toBe(false);

    // DB unchanged
    const inDb = await prisma.meeting.findUnique({ where: { id: meetingId } });
    expect(inDb!.tags).toEqual([]);
  });

  it("rejects too many tags (> 20)", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const tooMany = Array.from({ length: 21 }, (_, i) => `תגית-${i}`);
    const result = await updateMeetingTags(meetingId, tooMany);
    expect(result.success).toBe(false);
  });

  it("rejects tag exceeding MAX_TAG_LENGTH (50)", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const result = await updateMeetingTags(meetingId, ["א".repeat(51)]);
    expect(result.success).toBe(false);
  });

  it("returns P2025 for non-existent meeting", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const result = await updateMeetingTags("nonexistent12345678901", ["tag"]);
    expect(result.success).toBe(false);
    expect(result.error).toContain("לא נמצאה");
  });
});

// =====================================================================
// M. getTodaysMeetings
// =====================================================================

describe("getTodaysMeetings", () => {
  it("returns meetings with startTime today in ascending order, excludes CANCELLED", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const now = new Date();

    const todayAt08 = new Date(now);
    todayAt08.setHours(8, 0, 0, 0);
    const todayAt0830 = new Date(now);
    todayAt0830.setHours(8, 30, 0, 0);

    const todayAt14 = new Date(now);
    todayAt14.setHours(14, 0, 0, 0);
    const todayAt1430 = new Date(now);
    todayAt1430.setHours(14, 30, 0, 0);

    const todayAt10 = new Date(now);
    todayAt10.setHours(10, 0, 0, 0);
    const todayAt1030 = new Date(now);
    todayAt1030.setHours(10, 30, 0, 0);

    // Create meetings intentionally out of order to test sorting
    await prisma.meeting.createMany({
      data: [
        {
          companyId: company.id,
          meetingTypeId: seedMeetingType.id,
          participantName: "פגישה 14:00",
          startTime: todayAt14,
          endTime: todayAt1430,
          status: "CONFIRMED",
        },
        {
          companyId: company.id,
          meetingTypeId: seedMeetingType.id,
          participantName: "פגישה 08:00",
          startTime: todayAt08,
          endTime: todayAt0830,
          status: "PENDING",
        },
        {
          companyId: company.id,
          meetingTypeId: seedMeetingType.id,
          participantName: "פגישה 10:00",
          startTime: todayAt10,
          endTime: todayAt1030,
          status: "CONFIRMED",
        },
        {
          companyId: company.id,
          meetingTypeId: seedMeetingType.id,
          participantName: "פגישה מבוטלת היום",
          startTime: todayAt10,
          endTime: todayAt1030,
          status: "CANCELLED",
        },
      ],
    });

    const result = await getTodaysMeetings();
    expect(result.success).toBe(true);
    // 3 active meetings, CANCELLED excluded
    expect(result.data!.length).toBe(3);
    // Verify ascending order by startTime
    expect(result.data![0].participantName).toBe("פגישה 08:00");
    expect(result.data![1].participantName).toBe("פגישה 10:00");
    expect(result.data![2].participantName).toBe("פגישה 14:00");
    const times = result.data!.map((m: any) => new Date(m.startTime).getTime());
    expect(times[0]).toBeLessThan(times[1]);
    expect(times[1]).toBeLessThan(times[2]);
    // Includes meetingType relation
    expect(result.data![0].meetingType).toBeDefined();
    expect(result.data![0].meetingType.name).toBe("שיחת היכרות");
  });

  it("returns empty when no meetings today", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    await prisma.meeting.create({
      data: {
        companyId: company.id,
        meetingTypeId: seedMeetingType.id,
        participantName: "פגישה מחר",
        startTime: futureDate(1, 10),
        endTime: futureDate(1, 10, 30),
        status: "PENDING",
      },
    });

    const result = await getTodaysMeetings();
    expect(result.success).toBe(true);
    expect(result.data!.length).toBe(0);
  });
});

// =====================================================================
// N. getMeetingStats
// =====================================================================

describe("getMeetingStats", () => {
  it("returns correct aggregation for week period", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 2);

    await prisma.meeting.createMany({
      data: [
        {
          companyId: company.id,
          meetingTypeId: seedMeetingType.id,
          participantName: "הושלם",
          startTime: recentDate,
          endTime: new Date(recentDate.getTime() + 30 * 60_000),
          status: "COMPLETED",
        },
        {
          companyId: company.id,
          meetingTypeId: seedMeetingType.id,
          participantName: "בוטל",
          startTime: recentDate,
          endTime: new Date(recentDate.getTime() + 30 * 60_000),
          status: "CANCELLED",
        },
        {
          companyId: company.id,
          meetingTypeId: seedMeetingType.id,
          participantName: "לא הגיע",
          startTime: recentDate,
          endTime: new Date(recentDate.getTime() + 30 * 60_000),
          status: "NO_SHOW",
        },
        {
          companyId: company.id,
          meetingTypeId: seedMeetingType.id,
          participantName: "ממתין",
          startTime: recentDate,
          endTime: new Date(recentDate.getTime() + 30 * 60_000),
          status: "PENDING",
        },
      ],
    });

    const result = await getMeetingStats("week");
    expect(result.success).toBe(true);
    expect(result.data!.total).toBe(4);
    expect(result.data!.byStatus.COMPLETED).toBe(1);
    expect(result.data!.byStatus.CANCELLED).toBe(1);
    expect(result.data!.byStatus.NO_SHOW).toBe(1);
    expect(result.data!.byStatus.PENDING).toBe(1);
    expect(result.data!.cancellationRate).toBe(25);
    expect(result.data!.completedRate).toBe(25);
    expect(result.data!.noShowRate).toBe(25);
    expect(result.data!.byType[seedMeetingType.id]).toBe(4);
  });

  it("returns zeroes when no meetings exist (no division by zero)", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const result = await getMeetingStats("week");
    expect(result.success).toBe(true);
    expect(result.data!.total).toBe(0);
    expect(result.data!.cancellationRate).toBe(0);
    expect(result.data!.completedRate).toBe(0);
    expect(result.data!.noShowRate).toBe(0);
  });

  it("month period includes meetings from 15 days ago", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser());

    const fifteenDaysAgo = new Date();
    fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

    await prisma.meeting.create({
      data: {
        companyId: company.id,
        meetingTypeId: seedMeetingType.id,
        participantName: "לפני 15 יום",
        startTime: fifteenDaysAgo,
        endTime: new Date(fifteenDaysAgo.getTime() + 30 * 60_000),
        status: "COMPLETED",
      },
    });

    const result = await getMeetingStats("month");
    expect(result.success).toBe(true);
    expect(result.data!.total).toBeGreaterThanOrEqual(1);
    expect(result.data!.byType[seedMeetingType.id]).toBeGreaterThanOrEqual(1);
  });
});

// =====================================================================
// O. Cross-Cutting Concerns
// =====================================================================

describe("Cross-cutting concerns", () => {
  it("all 14 actions reject unauthenticated users", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const results = await Promise.all([
      getMeetingTypes(),
      createMeetingType({ name: "X", slug: "x", duration: 30 }),
      updateMeetingType(1, { name: "X" }),
      deleteMeetingType(1),
      getMeetings(),
      getMeetingById("fake-id-for-auth-test"),
      updateMeetingStatus("fake-id-for-auth", "CONFIRMED"),
      updateMeetingNotes("fake-id-for-auth", "note"),
      cancelMeeting("fake-id-for-auth-test1"),
      rescheduleMeeting("fake-id-for-auth", new Date().toISOString(), new Date().toISOString()),
      linkMeetingToClient("fake-id-for-auth", 1),
      updateMeetingTags("fake-id-for-auth-t", ["tag"]),
      getTodaysMeetings(),
      getMeetingStats(),
    ]);

    for (const r of results) {
      expect(r.success).toBe(false);
      expect(r.error).toBe("Unauthorized");
    }
  });

  it("mutation actions reject basic user without canManageMeetings", async () => {
    mockGetCurrentUser.mockResolvedValue(makeBasicUserWithView());

    const mutations = await Promise.all([
      createMeetingType({ name: "X", slug: "x", duration: 30 }),
      updateMeetingType(seedMeetingType.id, { name: "X" }),
      deleteMeetingType(seedMeetingType.id),
      updateMeetingStatus("fake-id-for-perm", "CONFIRMED"),
      updateMeetingNotes("fake-id-for-perms", "note"),
      cancelMeeting("fake-id-for-perms-test"),
      rescheduleMeeting("fake-id-for-per", new Date().toISOString(), new Date().toISOString()),
      linkMeetingToClient("fake-id-perm-tes", 1),
      updateMeetingTags("fake-id-perm-test", ["tag"]),
    ]);

    for (const r of mutations) {
      expect(r.success).toBe(false);
      expect(r.error).toBe("Forbidden");
    }
  });
});

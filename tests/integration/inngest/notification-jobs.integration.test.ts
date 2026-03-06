/**
 * Integration tests for notification Inngest jobs.
 *
 * REAL: Prisma (test DB), company/user/notification seeding.
 * MOCKED: @/lib/inngest/client (handler capture), @/lib/redis (pipeline),
 *         @/lib/prisma-background (redirected to real prisma),
 *         @/lib/logger (global mock in tests/setup.ts).
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { createMockStep, createMockEvent } from "../helpers/inngest-test-utils";
import { prisma } from "@/lib/prisma";

// ── Handler capture ───────────────────────────────────────────────
const handlers: Record<string, Function> = {};
vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    send: vi.fn(),
    createFunction: vi.fn((config: any, _trigger: any, handler: any) => {
      handlers[config.id] = handler;
      return { fn: handler };
    }),
  },
}));

// ── Mock Redis with pipeline ──────────────────────────────────────
const mockPublish = vi.fn();
const mockExec = vi.fn().mockResolvedValue([]);
vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(null),
    del: vi.fn().mockResolvedValue(null),
  },
  redisPublisher: {
    pipeline: vi.fn(() => ({
      publish: mockPublish,
      exec: mockExec,
    })),
  },
}));

// ── Redirect prisma-background to real prisma ─────────────────────
vi.mock("@/lib/prisma-background", () => {
  return import("@/lib/prisma").then((mod) => ({
    prismaBg: mod.prisma,
  }));
});

// ── Test data ─────────────────────────────────────────────────────
let companyId: number;
let userId: number;
let otherCompanyId: number;
let notificationIds: bigint[] = [];

beforeAll(async () => {
  await import("@/lib/inngest/functions/notification-jobs");

  const company = await prisma.company.create({
    data: {
      name: "Notif Test Co",
      slug: `notif-co-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    },
  });
  companyId = company.id;

  const user = await prisma.user.create({
    data: {
      companyId,
      name: "Notif User",
      email: `notif-user-${Date.now()}@test.com`,
      passwordHash: "not-a-real-hash",
    },
  });
  userId = user.id;

  const otherCompany = await prisma.company.create({
    data: {
      name: "Other Co",
      slug: `other-co-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    },
  });
  otherCompanyId = otherCompany.id;
});

afterAll(async () => {
  // Clean up notifications first (FK constraint)
  if (notificationIds.length > 0) {
    await prisma.notification.deleteMany({ where: { id: { in: notificationIds } } });
  }
  await prisma.user.deleteMany({ where: { companyId: { in: [companyId, otherCompanyId] } } });
  await prisma.company.deleteMany({ where: { id: { in: [companyId, otherCompanyId] } } });
});

// ── broadcastNotifications ────────────────────────────────────────
describe("broadcastNotifications (broadcast-notifications)", () => {
  it("publishes via Redis pipeline for valid user-company pairs", async () => {
    mockPublish.mockClear();
    mockExec.mockClear();
    mockExec.mockResolvedValue([[null, 1]]);

    const events = [
      {
        data: {
          companyId,
          userId,
          notification: { title: "Hello", message: "World" },
        },
      },
    ];

    const result = await handlers["broadcast-notifications"]({ events });

    expect(mockPublish).toHaveBeenCalledTimes(1);
    const [channel, payload] = mockPublish.mock.calls[0];
    expect(channel).toBe(`company:${companyId}:user:${userId}:notifications`);
    expect(JSON.parse(payload)).toEqual({ title: "Hello", message: "World" });
    expect(mockExec).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ broadcasted: 1, failed: 0 });
  });

  it("skips events where userId does not belong to companyId", async () => {
    mockPublish.mockClear();
    mockExec.mockClear();
    mockExec.mockResolvedValue([]);

    // userId belongs to companyId, not otherCompanyId
    const events = [
      {
        data: {
          companyId: otherCompanyId,
          userId,
          notification: { title: "Spoofed" },
        },
      },
    ];

    const result = await handlers["broadcast-notifications"]({ events });

    // publish should not be called because userId doesn't belong to otherCompanyId
    expect(mockPublish).not.toHaveBeenCalled();
    expect(result).toEqual({ broadcasted: 1, failed: 0 });
  });

  it("skips events with missing companyId", async () => {
    mockPublish.mockClear();
    mockExec.mockClear();
    mockExec.mockResolvedValue([]);

    const events = [
      {
        data: {
          companyId: undefined,
          userId,
          notification: { title: "No Company" },
        },
      },
    ];

    await handlers["broadcast-notifications"]({ events });

    expect(mockPublish).not.toHaveBeenCalled();
  });
});

// ── cleanupOldNotifications ───────────────────────────────────────
describe("cleanupOldNotifications (cleanup-old-notifications)", () => {
  it("deletes read notifications >90d and unread >180d, keeps recent ones", async () => {
    const now = new Date();
    const d100 = new Date(now.getTime() - 100 * 24 * 60 * 60 * 1000); // 100 days ago (read > 90d)
    const d200 = new Date(now.getTime() - 200 * 24 * 60 * 60 * 1000); // 200 days ago (unread > 180d)
    const d10 = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);   // 10 days ago (recent)

    // Seed notifications
    const oldRead = await prisma.notification.create({
      data: {
        companyId,
        userId,
        title: "Old Read",
        read: true,
        createdAt: d100,
      },
    });

    const oldUnread = await prisma.notification.create({
      data: {
        companyId,
        userId,
        title: "Old Unread",
        read: false,
        createdAt: d200,
      },
    });

    const recentRead = await prisma.notification.create({
      data: {
        companyId,
        userId,
        title: "Recent Read",
        read: true,
        createdAt: d10,
      },
    });

    const recentUnread = await prisma.notification.create({
      data: {
        companyId,
        userId,
        title: "Recent Unread",
        read: false,
        createdAt: d10,
      },
    });

    notificationIds.push(oldRead.id, oldUnread.id, recentRead.id, recentUnread.id);

    const step = createMockStep();
    const event = createMockEvent("cleanup-old-notifications", {});

    const result = await handlers["cleanup-old-notifications"]({ event, step });

    expect(result.deletedRead).toBeGreaterThanOrEqual(1);
    expect(result.deletedUnread).toBeGreaterThanOrEqual(1);

    // Verify old ones are gone
    const remainingOldRead = await prisma.notification.findUnique({ where: { id: oldRead.id } });
    const remainingOldUnread = await prisma.notification.findUnique({ where: { id: oldUnread.id } });
    expect(remainingOldRead).toBeNull();
    expect(remainingOldUnread).toBeNull();

    // Verify recent ones survive
    const remainingRecentRead = await prisma.notification.findUnique({ where: { id: recentRead.id } });
    const remainingRecentUnread = await prisma.notification.findUnique({ where: { id: recentUnread.id } });
    expect(remainingRecentRead).not.toBeNull();
    expect(remainingRecentUnread).not.toBeNull();

    // Remove from cleanup list since old ones are already deleted
    notificationIds = notificationIds.filter(
      (id) => id !== oldRead.id && id !== oldUnread.id,
    );
  });
});

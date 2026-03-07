import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────

const { mockRedis } = vi.hoisted(() => ({
  mockRedis: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  },
}));

vi.mock("@/lib/redis", () => ({
  redis: mockRedis,
}));

vi.mock("@/lib/prisma", () => {
  const company = { findUnique: vi.fn() };
  return { prisma: { company } };
});

import { prisma } from "@/lib/prisma";
import {
  parseNotificationSettings,
  isNotificationEnabled,
  invalidateNotificationSettingsCache,
} from "@/lib/notification-settings";

// ── Setup ──────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ════════════════════════════════════════════════════════════════════
// parseNotificationSettings
// ════════════════════════════════════════════════════════════════════

describe("parseNotificationSettings", () => {
  it("returns all-false defaults when raw is null", () => {
    const result = parseNotificationSettings(null);
    expect(result).toEqual({
      notifyOnMeetingBooked: false,
      notifyOnMeetingCancelled: false,
      notifyOnMeetingRescheduled: false,
      notifyOnMeetingStatusChange: false,
      notifyOnTicketAssigned: false,
      notifyOnTicketReassigned: false,
      notifyOnTicketComment: false,
      autoCreateClientOnBooking: false,
    });
  });

  it("returns all-false defaults when raw is undefined", () => {
    const result = parseNotificationSettings(undefined);
    expect(result.notifyOnMeetingBooked).toBe(false);
    expect(result.autoCreateClientOnBooking).toBe(false);
  });

  it("returns all-false defaults when raw is a string", () => {
    const result = parseNotificationSettings("not an object");
    expect(result.notifyOnMeetingBooked).toBe(false);
  });

  it("returns all-false defaults when raw is a number", () => {
    const result = parseNotificationSettings(42);
    expect(result.notifyOnMeetingBooked).toBe(false);
  });

  it("returns all-false defaults when raw is empty object", () => {
    const result = parseNotificationSettings({});
    expect(result.notifyOnMeetingBooked).toBe(false);
    expect(result.autoCreateClientOnBooking).toBe(false);
  });

  it("picks up true values for known keys", () => {
    const result = parseNotificationSettings({
      notifyOnMeetingBooked: true,
      autoCreateClientOnBooking: true,
    });
    expect(result.notifyOnMeetingBooked).toBe(true);
    expect(result.autoCreateClientOnBooking).toBe(true);
    // others remain false
    expect(result.notifyOnMeetingCancelled).toBe(false);
    expect(result.notifyOnTicketComment).toBe(false);
  });

  it("picks up false values explicitly set", () => {
    const result = parseNotificationSettings({
      notifyOnMeetingBooked: false,
      notifyOnMeetingCancelled: true,
    });
    expect(result.notifyOnMeetingBooked).toBe(false);
    expect(result.notifyOnMeetingCancelled).toBe(true);
  });

  it("ignores unknown keys", () => {
    const result = parseNotificationSettings({
      unknownKey: true,
      anotherFake: false,
    });
    expect(result.notifyOnMeetingBooked).toBe(false);
    expect((result as any).unknownKey).toBeUndefined();
  });

  it("ignores non-boolean values for known keys", () => {
    const result = parseNotificationSettings({
      notifyOnMeetingBooked: "yes",
      notifyOnMeetingCancelled: 1,
      notifyOnTicketAssigned: null,
    });
    expect(result.notifyOnMeetingBooked).toBe(false);
    expect(result.notifyOnMeetingCancelled).toBe(false);
    expect(result.notifyOnTicketAssigned).toBe(false);
  });

  it("handles all keys set to true", () => {
    const all = {
      notifyOnMeetingBooked: true,
      notifyOnMeetingCancelled: true,
      notifyOnMeetingRescheduled: true,
      notifyOnMeetingStatusChange: true,
      notifyOnTicketAssigned: true,
      notifyOnTicketReassigned: true,
      notifyOnTicketComment: true,
      autoCreateClientOnBooking: true,
    };
    const result = parseNotificationSettings(all);
    for (const key of Object.keys(all)) {
      expect(result[key as keyof typeof result]).toBe(true);
    }
  });

  it("is forward-compatible — extra keys in DB are ignored", () => {
    const result = parseNotificationSettings({
      notifyOnMeetingBooked: true,
      futureFeatureToggle: true,
    });
    expect(result.notifyOnMeetingBooked).toBe(true);
    expect(Object.keys(result)).not.toContain("futureFeatureToggle");
  });
});

// ════════════════════════════════════════════════════════════════════
// isNotificationEnabled
// ════════════════════════════════════════════════════════════════════

describe("isNotificationEnabled", () => {
  it("returns cached value from Redis when cache hit", async () => {
    mockRedis.get.mockResolvedValue(
      JSON.stringify({ notifyOnMeetingBooked: true }),
    );

    const result = await isNotificationEnabled(10, "notifyOnMeetingBooked");

    expect(result).toBe(true);
    expect(mockRedis.get).toHaveBeenCalledWith("company:notif-settings:10");
    // Should NOT query DB when cache hit
    expect((prisma as any).company.findUnique).not.toHaveBeenCalled();
  });

  it("returns false from cache when key is disabled", async () => {
    mockRedis.get.mockResolvedValue(
      JSON.stringify({ notifyOnMeetingBooked: false, autoCreateClientOnBooking: true }),
    );

    const result = await isNotificationEnabled(10, "notifyOnMeetingBooked");
    expect(result).toBe(false);
  });

  it("falls through to DB when Redis returns null (cache miss)", async () => {
    mockRedis.get.mockResolvedValue(null);
    (prisma as any).company.findUnique.mockResolvedValue({
      notificationSettings: { notifyOnTicketAssigned: true },
    });

    const result = await isNotificationEnabled(10, "notifyOnTicketAssigned");

    expect(result).toBe(true);
    expect((prisma as any).company.findUnique).toHaveBeenCalledWith({
      where: { id: 10 },
      select: { notificationSettings: true },
    });
    // Should populate cache
    expect(mockRedis.set).toHaveBeenCalledWith(
      "company:notif-settings:10",
      expect.any(String),
      "EX",
      60,
    );
  });

  it("falls through to DB when Redis throws (Redis down)", async () => {
    mockRedis.get.mockRejectedValue(new Error("Connection refused"));
    (prisma as any).company.findUnique.mockResolvedValue({
      notificationSettings: { notifyOnMeetingCancelled: true },
    });

    const result = await isNotificationEnabled(10, "notifyOnMeetingCancelled");
    expect(result).toBe(true);
  });

  it("returns false when company not found in DB", async () => {
    mockRedis.get.mockResolvedValue(null);
    (prisma as any).company.findUnique.mockResolvedValue(null);

    const result = await isNotificationEnabled(999, "notifyOnMeetingBooked");
    expect(result).toBe(false);
  });

  it("returns false (default) when company has empty notificationSettings", async () => {
    mockRedis.get.mockResolvedValue(null);
    (prisma as any).company.findUnique.mockResolvedValue({
      notificationSettings: {},
    });

    const result = await isNotificationEnabled(10, "autoCreateClientOnBooking");
    expect(result).toBe(false);
  });

  it("still populates cache even when Redis.set throws", async () => {
    mockRedis.get.mockResolvedValue(null);
    mockRedis.set.mockRejectedValue(new Error("Redis full"));
    (prisma as any).company.findUnique.mockResolvedValue({
      notificationSettings: { notifyOnMeetingBooked: true },
    });

    // Should not throw
    const result = await isNotificationEnabled(10, "notifyOnMeetingBooked");
    expect(result).toBe(true);
  });

  it("uses different cache keys per company", async () => {
    mockRedis.get.mockResolvedValue(null);
    (prisma as any).company.findUnique.mockResolvedValue({
      notificationSettings: {},
    });

    await isNotificationEnabled(10, "notifyOnMeetingBooked");
    await isNotificationEnabled(20, "notifyOnMeetingBooked");

    expect(mockRedis.get).toHaveBeenCalledWith("company:notif-settings:10");
    expect(mockRedis.get).toHaveBeenCalledWith("company:notif-settings:20");
  });
});

// ════════════════════════════════════════════════════════════════════
// invalidateNotificationSettingsCache
// ════════════════════════════════════════════════════════════════════

describe("invalidateNotificationSettingsCache", () => {
  it("deletes the cache key for the given company", async () => {
    mockRedis.del.mockResolvedValue(1);

    await invalidateNotificationSettingsCache(10);

    expect(mockRedis.del).toHaveBeenCalledWith("company:notif-settings:10");
  });

  it("does not throw when Redis.del fails", async () => {
    mockRedis.del.mockRejectedValue(new Error("Redis down"));

    // Should not throw
    await expect(invalidateNotificationSettingsCache(10)).resolves.not.toThrow();
  });
});

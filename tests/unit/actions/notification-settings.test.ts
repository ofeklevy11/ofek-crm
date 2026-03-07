import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────

vi.mock("@/lib/prisma", () => {
  const company = { findUnique: vi.fn(), update: vi.fn() };
  return { prisma: { company } };
});

vi.mock("@/lib/permissions-server", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(null),
    del: vi.fn().mockResolvedValue(1),
  },
}));

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import {
  getNotificationSettings,
  updateNotificationSettings,
} from "@/app/actions/notification-settings";

// ── Setup ──────────────────────────────────────────────────────────

const adminUser = { id: 1, companyId: 10, role: "admin", name: "Admin", email: "a@b.com" };
const basicUser = { id: 2, companyId: 10, role: "basic", name: "Basic", email: "b@b.com" };

beforeEach(() => {
  vi.clearAllMocks();
});

// ════════════════════════════════════════════════════════════════════
// getNotificationSettings
// ════════════════════════════════════════════════════════════════════

describe("getNotificationSettings", () => {
  it("returns Unauthorized when not logged in", async () => {
    (getCurrentUser as any).mockResolvedValue(null);
    const result = await getNotificationSettings();
    expect(result).toEqual({ success: false, error: "Unauthorized" });
  });

  it("returns Forbidden for non-admin users", async () => {
    (getCurrentUser as any).mockResolvedValue(basicUser);
    const result = await getNotificationSettings();
    expect(result).toEqual({ success: false, error: "Forbidden" });
  });

  it("returns all-false defaults when company has no settings", async () => {
    (getCurrentUser as any).mockResolvedValue(adminUser);
    (prisma as any).company.findUnique.mockResolvedValue({
      notificationSettings: null,
    });

    const result = await getNotificationSettings();

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data!.notifyOnMeetingBooked).toBe(false);
    expect(result.data!.autoCreateClientOnBooking).toBe(false);
    expect(result.data!.notifyOnTicketComment).toBe(false);
  });

  it("returns all-false defaults when company has empty settings", async () => {
    (getCurrentUser as any).mockResolvedValue(adminUser);
    (prisma as any).company.findUnique.mockResolvedValue({
      notificationSettings: {},
    });

    const result = await getNotificationSettings();

    expect(result.success).toBe(true);
    expect(result.data!.notifyOnMeetingBooked).toBe(false);
  });

  it("returns actual settings from DB", async () => {
    (getCurrentUser as any).mockResolvedValue(adminUser);
    (prisma as any).company.findUnique.mockResolvedValue({
      notificationSettings: {
        notifyOnMeetingBooked: true,
        autoCreateClientOnBooking: true,
      },
    });

    const result = await getNotificationSettings();

    expect(result.success).toBe(true);
    expect(result.data!.notifyOnMeetingBooked).toBe(true);
    expect(result.data!.autoCreateClientOnBooking).toBe(true);
    expect(result.data!.notifyOnMeetingCancelled).toBe(false);
  });

  it("queries correct companyId", async () => {
    (getCurrentUser as any).mockResolvedValue(adminUser);
    (prisma as any).company.findUnique.mockResolvedValue({
      notificationSettings: {},
    });

    await getNotificationSettings();

    expect((prisma as any).company.findUnique).toHaveBeenCalledWith({
      where: { id: 10 },
      select: { notificationSettings: true },
    });
  });
});

// ════════════════════════════════════════════════════════════════════
// updateNotificationSettings
// ════════════════════════════════════════════════════════════════════

describe("updateNotificationSettings", () => {
  it("returns Unauthorized when not logged in", async () => {
    (getCurrentUser as any).mockResolvedValue(null);
    const result = await updateNotificationSettings({ notifyOnMeetingBooked: true });
    expect(result).toEqual({ success: false, error: "Unauthorized" });
  });

  it("returns Forbidden for non-admin users", async () => {
    (getCurrentUser as any).mockResolvedValue(basicUser);
    const result = await updateNotificationSettings({ notifyOnMeetingBooked: true });
    expect(result).toEqual({ success: false, error: "Forbidden" });
  });

  it("merges new settings into existing ones", async () => {
    (getCurrentUser as any).mockResolvedValue(adminUser);
    (prisma as any).company.findUnique.mockResolvedValue({
      notificationSettings: { notifyOnMeetingBooked: true },
    });
    (prisma as any).company.update.mockResolvedValue({});

    const result = await updateNotificationSettings({
      autoCreateClientOnBooking: true,
    });

    expect(result).toEqual({ success: true });
    const updateCall = (prisma as any).company.update.mock.calls[0][0];
    expect(updateCall.where).toEqual({ id: 10 });
    // Should preserve existing + add new
    expect(updateCall.data.notificationSettings.notifyOnMeetingBooked).toBe(true);
    expect(updateCall.data.notificationSettings.autoCreateClientOnBooking).toBe(true);
  });

  it("can toggle a setting off", async () => {
    (getCurrentUser as any).mockResolvedValue(adminUser);
    (prisma as any).company.findUnique.mockResolvedValue({
      notificationSettings: {
        notifyOnMeetingBooked: true,
        autoCreateClientOnBooking: true,
      },
    });
    (prisma as any).company.update.mockResolvedValue({});

    await updateNotificationSettings({ notifyOnMeetingBooked: false });

    const updateCall = (prisma as any).company.update.mock.calls[0][0];
    expect(updateCall.data.notificationSettings.notifyOnMeetingBooked).toBe(false);
    expect(updateCall.data.notificationSettings.autoCreateClientOnBooking).toBe(true);
  });

  it("ignores non-boolean values in data", async () => {
    (getCurrentUser as any).mockResolvedValue(adminUser);
    (prisma as any).company.findUnique.mockResolvedValue({
      notificationSettings: {},
    });
    (prisma as any).company.update.mockResolvedValue({});

    await updateNotificationSettings({
      notifyOnMeetingBooked: "yes" as any,
    });

    const updateCall = (prisma as any).company.update.mock.calls[0][0];
    expect(updateCall.data.notificationSettings.notifyOnMeetingBooked).toBe(false);
  });

  it("ignores unknown keys in data", async () => {
    (getCurrentUser as any).mockResolvedValue(adminUser);
    (prisma as any).company.findUnique.mockResolvedValue({
      notificationSettings: {},
    });
    (prisma as any).company.update.mockResolvedValue({});

    await updateNotificationSettings({
      unknownKey: true,
    } as any);

    const updateCall = (prisma as any).company.update.mock.calls[0][0];
    expect(updateCall.data.notificationSettings.unknownKey).toBeUndefined();
  });

  it("invalidates Redis cache after update", async () => {
    (getCurrentUser as any).mockResolvedValue(adminUser);
    (prisma as any).company.findUnique.mockResolvedValue({
      notificationSettings: {},
    });
    (prisma as any).company.update.mockResolvedValue({});

    const { redis } = await import("@/lib/redis");

    await updateNotificationSettings({ notifyOnMeetingBooked: true });

    expect(redis.del).toHaveBeenCalledWith("company:notif-settings:10");
  });

  it("handles null existing notificationSettings (first-time setup)", async () => {
    (getCurrentUser as any).mockResolvedValue(adminUser);
    (prisma as any).company.findUnique.mockResolvedValue({
      notificationSettings: null,
    });
    (prisma as any).company.update.mockResolvedValue({});

    const result = await updateNotificationSettings({
      notifyOnMeetingBooked: true,
      notifyOnTicketAssigned: true,
    });

    expect(result).toEqual({ success: true });
    const updateCall = (prisma as any).company.update.mock.calls[0][0];
    expect(updateCall.data.notificationSettings.notifyOnMeetingBooked).toBe(true);
    expect(updateCall.data.notificationSettings.notifyOnTicketAssigned).toBe(true);
    expect(updateCall.data.notificationSettings.notifyOnMeetingCancelled).toBe(false);
  });
});

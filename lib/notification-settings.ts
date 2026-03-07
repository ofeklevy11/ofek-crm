import { redis } from "@/lib/redis";
import { prisma } from "@/lib/prisma";

export interface NotificationSettings {
  notifyOnMeetingBooked: boolean;
  notifyOnMeetingCancelled: boolean;
  notifyOnMeetingRescheduled: boolean;
  notifyOnMeetingStatusChange: boolean;
  notifyOnTicketAssigned: boolean;
  notifyOnTicketReassigned: boolean;
  notifyOnTicketComment: boolean;
  autoCreateClientOnBooking: boolean;
}

const DEFAULTS: NotificationSettings = {
  notifyOnMeetingBooked: false,
  notifyOnMeetingCancelled: false,
  notifyOnMeetingRescheduled: false,
  notifyOnMeetingStatusChange: false,
  notifyOnTicketAssigned: false,
  notifyOnTicketReassigned: false,
  notifyOnTicketComment: false,
  autoCreateClientOnBooking: false,
};

const CACHE_TTL = 60; // seconds
const CACHE_KEY_PREFIX = "company:notif-settings:";

export function parseNotificationSettings(raw: unknown): NotificationSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULTS };
  const obj = raw as Record<string, unknown>;
  const result = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS) as (keyof NotificationSettings)[]) {
    if (typeof obj[key] === "boolean") {
      result[key] = obj[key] as boolean;
    }
  }
  return result;
}

export async function isNotificationEnabled(
  companyId: number,
  key: keyof NotificationSettings,
): Promise<boolean> {
  const cacheKey = CACHE_KEY_PREFIX + companyId;
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return parseNotificationSettings(JSON.parse(cached))[key];
    }
  } catch {
    // Redis down — fall through to DB
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { notificationSettings: true },
  });

  const settings = parseNotificationSettings(company?.notificationSettings);

  try {
    await redis.set(cacheKey, JSON.stringify(settings), "EX", CACHE_TTL);
  } catch {
    // Redis down — ignore
  }

  return settings[key];
}

export function invalidateNotificationSettingsCache(companyId: number) {
  return redis.del(CACHE_KEY_PREFIX + companyId).catch(() => {});
}

"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { checkActionRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import {
  validateMeetingTypeInput,
  validateNotes,
  validateTags,
  MAX_MEETING_TYPES_PER_COMPANY,
} from "@/lib/meeting-validation";
import { createLogger } from "@/lib/logger";
import { generateSecureToken } from "@/lib/crypto-tokens";
import { logSecurityEvent, SEC_MEETING_TYPE_CREATED, SEC_MEETING_TYPE_DELETED } from "@/lib/security/audit-security";

const log = createLogger("Meetings");

async function invalidateMeetingStatsCache(companyId: number) {
  try {
    const { redis } = await import("@/lib/redis");
    const todayKey = new Date().toISOString().slice(0, 10);
    await Promise.all([
      redis.del(`cache:metric:${companyId}:meeting-stats:week`),
      redis.del(`cache:metric:${companyId}:meeting-stats:month`),
      redis.del(`cache:metric:${companyId}:todays-meetings:${todayKey}`),
    ]);
  } catch { /* cache invalidation is best-effort */ }
}

// ============================================
// MEETING TYPES CRUD
// ============================================

export async function getMeetingTypes() {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };
    if (!hasUserFlag(user, "canViewMeetings")) return { success: false, error: "Forbidden" };

    const limited = await checkActionRateLimit(String(user.id), RATE_LIMITS.meetingRead);
    if (limited) return { success: false, error: "Rate limit exceeded. Please try again later." };

    const types = await prisma.meetingType.findMany({
      where: { companyId: user.companyId },
      orderBy: [{ order: "asc" }, { createdAt: "desc" }],
      take: 100,
    });
    return { success: true, data: types };
  } catch (error) {
    log.error("Error fetching meeting types", { error: String(error) });
    return { success: false, error: "Failed to fetch meeting types" };
  }
}

export async function createMeetingType(data: Record<string, unknown>) {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };
    if (!hasUserFlag(user, "canManageMeetings")) return { success: false, error: "Forbidden" };

    const limited = await checkActionRateLimit(String(user.id), RATE_LIMITS.meetingMutation);
    if (limited) return { success: false, error: "Rate limit exceeded. Please try again later." };

    const validation = validateMeetingTypeInput(data, true);
    if (!validation.valid) return { success: false, error: validation.error };

    const count = await prisma.meetingType.count({ where: { companyId: user.companyId } });
    if (count >= MAX_MEETING_TYPES_PER_COMPANY) {
      return { success: false, error: `מקסימום ${MAX_MEETING_TYPES_PER_COMPANY} סוגי פגישות` };
    }

    const meetingType = await prisma.meetingType.create({
      data: {
        companyId: user.companyId,
        name: validation.data.name!,
        slug: validation.data.slug!,
        description: validation.data.description,
        duration: validation.data.duration!,
        color: validation.data.color,
        bufferBefore: validation.data.bufferBefore ?? 0,
        bufferAfter: validation.data.bufferAfter ?? 0,
        dailyLimit: validation.data.dailyLimit,
        minAdvanceHours: validation.data.minAdvanceHours ?? 24,
        maxAdvanceDays: validation.data.maxAdvanceDays ?? 30,
        customFields: validation.data.customFields ?? [],
        availabilityOverride: validation.data.availabilityOverride as any,
        isActive: validation.data.isActive ?? true,
        order: validation.data.order ?? 0,
        shareToken: generateSecureToken(),
      },
    });

    logSecurityEvent({
      action: SEC_MEETING_TYPE_CREATED,
      companyId: user.companyId,
      userId: user.id,
      details: { meetingTypeId: meetingType.id, slug: meetingType.slug },
    });

    revalidatePath("/meetings");
    return { success: true, data: meetingType };
  } catch (error: any) {
    if (error?.code === "P2002") {
      return { success: false, error: "slug כבר קיים עבור חברה זו" };
    }
    log.error("Error creating meeting type", { error: String(error) });
    return { success: false, error: "Failed to create meeting type" };
  }
}

export async function updateMeetingType(id: number, data: Record<string, unknown>) {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };
    if (!hasUserFlag(user, "canManageMeetings")) return { success: false, error: "Forbidden" };

    if (!Number.isInteger(id) || id <= 0) return { success: false, error: "Invalid ID" };

    const limited = await checkActionRateLimit(String(user.id), RATE_LIMITS.meetingMutation);
    if (limited) return { success: false, error: "Rate limit exceeded. Please try again later." };

    const validation = validateMeetingTypeInput(data, false);
    if (!validation.valid) return { success: false, error: validation.error };

    const updateData: Record<string, unknown> = {};
    const d = validation.data;
    if (d.name !== undefined) updateData.name = d.name;
    if (d.slug !== undefined) updateData.slug = d.slug;
    if (d.description !== undefined) updateData.description = d.description;
    if (d.duration !== undefined) updateData.duration = d.duration;
    if (d.color !== undefined) updateData.color = d.color;
    if (d.bufferBefore !== undefined) updateData.bufferBefore = d.bufferBefore;
    if (d.bufferAfter !== undefined) updateData.bufferAfter = d.bufferAfter;
    if (d.dailyLimit !== undefined) updateData.dailyLimit = d.dailyLimit;
    if (d.minAdvanceHours !== undefined) updateData.minAdvanceHours = d.minAdvanceHours;
    if (d.maxAdvanceDays !== undefined) updateData.maxAdvanceDays = d.maxAdvanceDays;
    if (d.customFields !== undefined) updateData.customFields = d.customFields;
    if (d.availabilityOverride !== undefined) updateData.availabilityOverride = d.availabilityOverride as any;
    if (d.isActive !== undefined) updateData.isActive = d.isActive;
    if (d.order !== undefined) updateData.order = d.order;

    const meetingType = await prisma.meetingType.update({
      where: { id, companyId: user.companyId },
      data: updateData,
    });

    revalidatePath("/meetings");
    return { success: true, data: meetingType };
  } catch (error: any) {
    if (error?.code === "P2025") return { success: false, error: "סוג פגישה לא נמצא" };
    if (error?.code === "P2002") return { success: false, error: "slug כבר קיים עבור חברה זו" };
    log.error("Error updating meeting type", { error: String(error) });
    return { success: false, error: "Failed to update meeting type" };
  }
}

export async function deleteMeetingType(id: number) {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };
    if (!hasUserFlag(user, "canManageMeetings")) return { success: false, error: "Forbidden" };

    if (!Number.isInteger(id) || id <= 0) return { success: false, error: "Invalid ID" };

    const limited = await checkActionRateLimit(String(user.id), RATE_LIMITS.meetingMutation);
    if (limited) return { success: false, error: "Rate limit exceeded. Please try again later." };

    await prisma.meetingType.update({
      where: { id, companyId: user.companyId },
      data: { isActive: false },
    });

    logSecurityEvent({
      action: SEC_MEETING_TYPE_DELETED,
      companyId: user.companyId,
      userId: user.id,
      details: { meetingTypeId: id },
    });

    revalidatePath("/meetings");
    return { success: true };
  } catch (error: any) {
    if (error?.code === "P2025") return { success: false, error: "סוג פגישה לא נמצא" };
    log.error("Error deleting meeting type", { error: String(error) });
    return { success: false, error: "Failed to delete meeting type" };
  }
}

// ============================================
// MEETINGS LIST & MANAGEMENT
// ============================================

export async function getMeetings(filters?: {
  status?: string;
  meetingTypeId?: number;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}) {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };
    if (!hasUserFlag(user, "canViewMeetings")) return { success: false, error: "Forbidden" };

    const limited = await checkActionRateLimit(String(user.id), RATE_LIMITS.meetingRead);
    if (limited) return { success: false, error: "Rate limit exceeded. Please try again later." };

    const page = Math.max(1, filters?.page || 1);
    const limit = Math.min(500, Math.max(1, filters?.limit || 20));

    const where: any = { companyId: user.companyId };

    if (filters?.status) {
      const validStatuses = ["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"];
      if (!validStatuses.includes(filters.status)) {
        return { success: false, error: "סטטוס לא תקין" };
      }
      where.status = filters.status;
    }
    if (filters?.meetingTypeId) {
      where.meetingTypeId = filters.meetingTypeId;
    }
    if (filters?.startDate || filters?.endDate) {
      where.startTime = {};
      if (filters.startDate) {
        const d = new Date(filters.startDate);
        if (isNaN(d.getTime())) return { success: false, error: "תאריך התחלה לא תקין" };
        where.startTime.gte = d;
      }
      if (filters.endDate) {
        const d = new Date(filters.endDate);
        if (isNaN(d.getTime())) return { success: false, error: "תאריך סיום לא תקין" };
        where.startTime.lte = d;
      }
    }

    const [meetings, total] = await Promise.all([
      prisma.meeting.findMany({
        where,
        include: {
          meetingType: { select: { name: true, color: true, duration: true } },
          client: { select: { id: true, name: true } },
        },
        orderBy: { startTime: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.meeting.count({ where }),
    ]);

    return { success: true, data: { meetings, total, page, limit } };
  } catch (error) {
    log.error("Error fetching meetings", { error: String(error) });
    return { success: false, error: "Failed to fetch meetings" };
  }
}

export async function getMeetingById(id: string) {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };
    if (!hasUserFlag(user, "canViewMeetings")) return { success: false, error: "Forbidden" };

    if (!id || typeof id !== "string" || id.length > 30) return { success: false, error: "Invalid ID" };

    const meeting = await prisma.meeting.findFirst({
      where: { id, companyId: user.companyId },
      include: {
        meetingType: {
          select: { id: true, name: true, color: true, duration: true, bufferBefore: true, bufferAfter: true },
        },
        client: { select: { id: true, name: true, email: true, phone: true } },
        calendarEvent: { select: { id: true, title: true } },
      },
    });

    if (!meeting) return { success: false, error: "פגישה לא נמצאה" };
    return { success: true, data: meeting };
  } catch (error) {
    log.error("Error fetching meeting", { error: String(error) });
    return { success: false, error: "Failed to fetch meeting" };
  }
}

export async function updateMeetingStatus(id: string, status: string) {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };
    if (!hasUserFlag(user, "canManageMeetings")) return { success: false, error: "Forbidden" };

    if (!id || typeof id !== "string" || id.length > 30) return { success: false, error: "Invalid ID" };

    const validStatuses = ["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"];
    if (!validStatuses.includes(status)) return { success: false, error: "סטטוס לא תקין" };

    const limited = await checkActionRateLimit(String(user.id), RATE_LIMITS.meetingMutation);
    if (limited) return { success: false, error: "Rate limit exceeded. Please try again later." };

    const updateData: any = { status };
    if (status === "CANCELLED") {
      updateData.cancelledAt = new Date();
      updateData.cancelledBy = "owner";
    }

    const meeting = await prisma.meeting.update({
      where: { id, companyId: user.companyId },
      data: updateData,
      include: { meetingType: { select: { name: true } } },
    });

    // Send notification for status change — guarded by toggle
    try {
      const { isNotificationEnabled } = await import("@/lib/notification-settings");
      if (await isNotificationEnabled(user.companyId, "notifyOnMeetingStatusChange")) {
        const { createNotificationForCompany } = await import("@/lib/notifications-internal");
        const admins = await prisma.user.findMany({
          where: { companyId: user.companyId, role: "admin" },
          select: { id: true },
          take: 25,
        });
        const statusLabels: Record<string, string> = {
          PENDING: "ממתין", CONFIRMED: "מאושר", COMPLETED: "הושלם", CANCELLED: "בוטל", NO_SHOW: "לא הגיע",
        };
        await Promise.all(
          admins.map(admin =>
            createNotificationForCompany({
              companyId: user.companyId,
              userId: admin.id,
              title: `סטטוס פגישה שונה: ${meeting.participantName} - ${statusLabels[status] || status}`,
              link: "/meetings",
            })
          )
        );
      }
    } catch (err) {
      log.error("Failed to send status change notification", { error: String(err) });
    }

    revalidatePath("/meetings");
    revalidatePath("/calendar");
    invalidateMeetingStatsCache(user.companyId).catch(() => {});
    return { success: true, data: meeting };
  } catch (error: any) {
    if (error?.code === "P2025") return { success: false, error: "פגישה לא נמצאה" };
    log.error("Error updating meeting status", { error: String(error) });
    return { success: false, error: "Failed to update meeting status" };
  }
}

export async function updateMeetingNotes(id: string, notesBefore?: string, notesAfter?: string) {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };
    if (!hasUserFlag(user, "canManageMeetings")) return { success: false, error: "Forbidden" };

    if (!id || typeof id !== "string" || id.length > 30) return { success: false, error: "Invalid ID" };

    const limited = await checkActionRateLimit(String(user.id), RATE_LIMITS.meetingMutation);
    if (limited) return { success: false, error: "Rate limit exceeded. Please try again later." };

    const updateData: any = {};
    if (notesBefore !== undefined) {
      const validated = validateNotes(notesBefore);
      if (validated === null) return { success: false, error: "הערות לפני ארוכות מדי" };
      updateData.notesBefore = validated || null;
    }
    if (notesAfter !== undefined) {
      const validated = validateNotes(notesAfter);
      if (validated === null) return { success: false, error: "הערות אחרי ארוכות מדי" };
      updateData.notesAfter = validated || null;
    }

    const meeting = await prisma.meeting.update({
      where: { id, companyId: user.companyId },
      data: updateData,
    });

    revalidatePath("/meetings");
    return { success: true, data: meeting };
  } catch (error: any) {
    if (error?.code === "P2025") return { success: false, error: "פגישה לא נמצאה" };
    log.error("Error updating meeting notes", { error: String(error) });
    return { success: false, error: "Failed to update meeting notes" };
  }
}

export async function cancelMeeting(id: string, reason?: string) {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };
    if (!hasUserFlag(user, "canManageMeetings")) return { success: false, error: "Forbidden" };

    if (!id || typeof id !== "string" || id.length > 30) return { success: false, error: "Invalid ID" };

    const limited = await checkActionRateLimit(String(user.id), RATE_LIMITS.meetingMutation);
    if (limited) return { success: false, error: "Rate limit exceeded. Please try again later." };

    const meeting = await prisma.meeting.update({
      where: { id, companyId: user.companyId },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelledBy: "owner",
        cancelReason: reason?.slice(0, 1000),
      },
      include: { meetingType: { select: { name: true } } },
    });

    // Send notification — guarded by toggle
    try {
      const { isNotificationEnabled } = await import("@/lib/notification-settings");
      if (await isNotificationEnabled(user.companyId, "notifyOnMeetingCancelled")) {
        const { createNotificationForCompany } = await import("@/lib/notifications-internal");
        const admins = await prisma.user.findMany({
          where: { companyId: user.companyId, role: "admin" },
          select: { id: true },
          take: 25,
        });
        await Promise.all(
          admins.map(admin =>
            createNotificationForCompany({
              companyId: user.companyId,
              userId: admin.id,
              title: `פגישה בוטלה: ${meeting.participantName} - ${meeting.meetingType.name}`,
              link: "/meetings",
            })
          )
        );
      }
    } catch (err) {
      log.error("Failed to send cancellation notification", { error: String(err) });
    }

    // Fire MEETING_CANCELLED automations (fire-and-forget)
    try {
      const { fireMeetingAutomations } = await import("@/app/actions/meeting-automations");
      fireMeetingAutomations(user.companyId, "MEETING_CANCELLED", {
        id: meeting.id,
        meetingTypeId: meeting.meetingTypeId,
        participantName: meeting.participantName,
        participantEmail: meeting.participantEmail,
        participantPhone: meeting.participantPhone,
        startTime: meeting.startTime,
        endTime: meeting.endTime,
        meetingTypeName: meeting.meetingType.name,
      }).catch((err: unknown) => log.error("Meeting automation fire error", { error: String(err) }));
    } catch {}

    revalidatePath("/meetings");
    revalidatePath("/calendar");
    invalidateMeetingStatsCache(user.companyId).catch(() => {});
    return { success: true, data: meeting };
  } catch (error: any) {
    if (error?.code === "P2025") return { success: false, error: "פגישה לא נמצאה" };
    log.error("Error cancelling meeting", { error: String(error) });
    return { success: false, error: "Failed to cancel meeting" };
  }
}

export async function rescheduleMeeting(id: string, newStart: string, newEnd: string) {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };
    if (!hasUserFlag(user, "canManageMeetings")) return { success: false, error: "Forbidden" };

    if (!id || typeof id !== "string" || id.length > 30) return { success: false, error: "Invalid ID" };

    const limited = await checkActionRateLimit(String(user.id), RATE_LIMITS.meetingMutation);
    if (limited) return { success: false, error: "Rate limit exceeded. Please try again later." };

    const startTime = new Date(newStart);
    const endTime = new Date(newEnd);
    if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
      return { success: false, error: "תאריכים לא תקינים" };
    }
    if (endTime <= startTime) {
      return { success: false, error: "שעת סיום חייבת להיות אחרי שעת התחלה" };
    }
    // Reject past dates
    if (startTime.getTime() < Date.now()) {
      return { success: false, error: "לא ניתן לדחות פגישה לעבר" };
    }

    const meeting = await prisma.meeting.update({
      where: { id, companyId: user.companyId },
      data: { startTime, endTime },
      include: { meetingType: { select: { name: true } } },
    });

    if (meeting.calendarEventId) {
      await prisma.calendarEvent.update({
        where: { id: meeting.calendarEventId },
        data: { startTime, endTime },
      });
    }

    // Send notification — guarded by toggle
    try {
      const { isNotificationEnabled } = await import("@/lib/notification-settings");
      if (await isNotificationEnabled(user.companyId, "notifyOnMeetingRescheduled")) {
        const { createNotificationForCompany } = await import("@/lib/notifications-internal");
        const admins = await prisma.user.findMany({
          where: { companyId: user.companyId, role: "admin" },
          select: { id: true },
          take: 25,
        });
        const timeStr = startTime.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" });
        await Promise.all(
          admins.map(admin =>
            createNotificationForCompany({
              companyId: user.companyId,
              userId: admin.id,
              title: `פגישה נדחתה: ${meeting.participantName} - ${meeting.meetingType.name} ל-${timeStr}`,
              link: "/meetings",
            })
          )
        );
      }
    } catch (err) {
      log.error("Failed to send reschedule notification", { error: String(err) });
    }

    revalidatePath("/meetings");
    revalidatePath("/calendar");
    return { success: true, data: meeting };
  } catch (error: any) {
    if (error?.code === "P2025") return { success: false, error: "פגישה לא נמצאה" };
    log.error("Error rescheduling meeting", { error: String(error) });
    return { success: false, error: "Failed to reschedule meeting" };
  }
}

export async function linkMeetingToClient(meetingId: string, clientId: number) {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };
    if (!hasUserFlag(user, "canManageMeetings")) return { success: false, error: "Forbidden" };

    const limited = await checkActionRateLimit(String(user.id), RATE_LIMITS.meetingMutation);
    if (limited) return { success: false, error: "Rate limit exceeded. Please try again later." };

    if (!Number.isInteger(clientId) || clientId <= 0) return { success: false, error: "Invalid client ID" };

    // Verify client belongs to company
    const client = await prisma.client.findFirst({
      where: { id: clientId, companyId: user.companyId },
      select: { id: true },
    });
    if (!client) return { success: false, error: "לקוח לא נמצא" };

    const meeting = await prisma.meeting.update({
      where: { id: meetingId, companyId: user.companyId },
      data: { clientId },
    });

    revalidatePath("/meetings");
    return { success: true, data: meeting };
  } catch (error: any) {
    if (error?.code === "P2025") return { success: false, error: "פגישה לא נמצאה" };
    log.error("Error linking meeting to client", { error: String(error) });
    return { success: false, error: "Failed to link meeting to client" };
  }
}

export async function updateMeetingTags(id: string, tags: unknown) {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };
    if (!hasUserFlag(user, "canManageMeetings")) return { success: false, error: "Forbidden" };

    if (!id || typeof id !== "string" || id.length > 30) return { success: false, error: "Invalid ID" };

    const limited = await checkActionRateLimit(String(user.id), RATE_LIMITS.meetingMutation);
    if (limited) return { success: false, error: "Rate limit exceeded. Please try again later." };

    const validated = validateTags(tags);
    if (validated === null) return { success: false, error: "תגיות לא תקינות" };

    const meeting = await prisma.meeting.update({
      where: { id, companyId: user.companyId },
      data: { tags: validated },
    });

    revalidatePath("/meetings");
    return { success: true, data: meeting };
  } catch (error: any) {
    if (error?.code === "P2025") return { success: false, error: "פגישה לא נמצאה" };
    log.error("Error updating meeting tags", { error: String(error) });
    return { success: false, error: "Failed to update meeting tags" };
  }
}

// ============================================
// DASHBOARD & STATS
// ============================================

export async function getTodaysMeetings() {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };
    if (!hasUserFlag(user, "canViewMeetings")) return { success: false, error: "Forbidden" };

    const limited = await checkActionRateLimit(String(user.id), RATE_LIMITS.meetingRead);
    if (limited) return { success: false, error: "Rate limit exceeded. Please try again later." };

    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const { getCachedMetric } = await import("@/lib/services/cache-service");
    const meetings = await getCachedMetric(
      user.companyId,
      ["todays-meetings", startOfDay.toISOString().slice(0, 10)],
      async () => {
        return prisma.meeting.findMany({
          where: {
            companyId: user.companyId,
            startTime: { gte: startOfDay, lte: endOfDay },
            status: { notIn: ["CANCELLED"] },
          },
          include: {
            meetingType: { select: { name: true, color: true } },
          },
          orderBy: { startTime: "asc" },
          take: 20,
        });
      },
      60 // 60s TTL
    );

    return { success: true, data: meetings };
  } catch (error) {
    log.error("Error fetching today's meetings", { error: String(error) });
    return { success: false, error: "Failed to fetch today's meetings" };
  }
}

export async function getMeetingStats(period?: "week" | "month") {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };
    if (!hasUserFlag(user, "canViewMeetings")) return { success: false, error: "Forbidden" };

    const limited = await checkActionRateLimit(String(user.id), RATE_LIMITS.meetingRead);
    if (limited) return { success: false, error: "Rate limit exceeded. Please try again later." };

    const now = new Date();
    const periodStart = new Date(now);
    if (period === "week") {
      periodStart.setDate(periodStart.getDate() - 7);
    } else {
      periodStart.setMonth(periodStart.getMonth() - 1);
    }

    const { getCachedMetric } = await import("@/lib/services/cache-service");
    const data = await getCachedMetric(
      user.companyId,
      ["meeting-stats", period || "month"],
      async () => {
        // Use groupBy instead of fetching all meetings into memory
        const [statusGroups, typeGroups] = await Promise.all([
          prisma.meeting.groupBy({
            by: ["status"],
            where: { companyId: user.companyId, startTime: { gte: periodStart } },
            _count: { _all: true },
          }),
          prisma.meeting.groupBy({
            by: ["meetingTypeId"],
            where: { companyId: user.companyId, startTime: { gte: periodStart } },
            _count: { _all: true },
          }),
        ]);

        const byStatus: Record<string, number> = {};
        let total = 0;
        for (const g of statusGroups) {
          byStatus[g.status] = g._count._all;
          total += g._count._all;
        }

        const byType: Record<number, number> = {};
        for (const g of typeGroups) {
          byType[g.meetingTypeId] = g._count._all;
        }

        const cancelled = byStatus["CANCELLED"] || 0;
        const noShow = byStatus["NO_SHOW"] || 0;
        const completed = byStatus["COMPLETED"] || 0;

        return {
          total,
          cancellationRate: total > 0 ? Math.round((cancelled / total) * 100) : 0,
          noShowRate: total > 0 ? Math.round((noShow / total) * 100) : 0,
          completedRate: total > 0 ? Math.round((completed / total) * 100) : 0,
          byType,
          byStatus,
        };
      },
      300 // 5-min TTL
    );

    return { success: true, data };
  } catch (error) {
    log.error("Error fetching meeting stats", { error: String(error) });
    return { success: false, error: "Failed to fetch meeting stats" };
  }
}

"use server";

import { getCurrentUser } from "@/lib/permissions-server";
import { checkActionRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import {
  getValidAccessToken,
  fetchGoogleCalendarEvents,
  decryptToken,
  revokeToken,
} from "@/lib/services/google-calendar";
import { CalendarEvent } from "@/lib/types";
import { createLogger } from "@/lib/logger";

const log = createLogger("GoogleCalendarActions");

export async function getGoogleCalendarStatus(): Promise<{
  connected: boolean;
  email?: string;
}> {
  const user = await getCurrentUser();
  if (!user) return { connected: false };

  const connection = await prisma.googleCalendarConnection.findUnique({
    where: {
      companyId_userId: {
        companyId: user.companyId,
        userId: user.id,
      },
    },
    select: { googleEmail: true, isActive: true },
  });

  if (!connection || !connection.isActive) {
    return { connected: false };
  }

  return { connected: true, email: connection.googleEmail };
}

export async function getGoogleCalendarEvents(
  rangeStart: string,
  rangeEnd: string,
): Promise<{
  success: boolean;
  data?: CalendarEvent[];
  connected?: boolean;
  error?: string;
}> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Unauthorized" };

  const limited = await checkActionRateLimit(
    String(user.id),
    RATE_LIMITS.googleCalRead,
  );
  if (limited) {
    return { success: false, error: "Rate limit exceeded. Please try again later." };
  }

  const connection = await prisma.googleCalendarConnection.findUnique({
    where: {
      companyId_userId: {
        companyId: user.companyId,
        userId: user.id,
      },
    },
  });

  if (!connection || !connection.isActive) {
    return { success: true, data: [], connected: false };
  }

  try {
    const accessToken = await getValidAccessToken(connection);
    const googleEvents = await fetchGoogleCalendarEvents(
      accessToken,
      new Date(rangeStart).toISOString(),
      new Date(rangeEnd).toISOString(),
    );

    const events: CalendarEvent[] = googleEvents.map((ge) => {
      // Handle all-day events (date only, no dateTime)
      let startTime: Date;
      let endTime: Date;

      if (ge.start.dateTime) {
        startTime = new Date(ge.start.dateTime);
      } else if (ge.start.date) {
        startTime = new Date(ge.start.date + "T00:00:00");
      } else {
        startTime = new Date();
      }

      if (ge.end.dateTime) {
        endTime = new Date(ge.end.dateTime);
      } else if (ge.end.date) {
        endTime = new Date(ge.end.date + "T00:00:00");
      } else {
        endTime = new Date(startTime.getTime() + 60 * 60 * 1000);
      }

      return {
        id: `gcal:${ge.id}`,
        title: ge.summary || "(ללא כותרת)",
        description: ge.description || null,
        startTime,
        endTime,
        color: "#1a73e8",
        source: "google" as const,
        googleEventUrl: ge.htmlLink || null,
      };
    });

    return { success: true, data: events, connected: true };
  } catch (error) {
    log.error("Failed to fetch Google Calendar events", {
      error: String(error),
      userId: user.id,
    });
    return { success: false, error: "Failed to fetch Google Calendar events" };
  }
}

export async function disconnectGoogleCalendar(): Promise<{
  success: boolean;
  error?: string;
}> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Unauthorized" };

  try {
    const connection = await prisma.googleCalendarConnection.findUnique({
      where: {
        companyId_userId: {
          companyId: user.companyId,
          userId: user.id,
        },
      },
    });

    if (!connection) {
      return { success: false, error: "No connection found" };
    }

    // Revoke token at Google (best-effort)
    try {
      const refreshToken = decryptToken(
        connection.refreshTokenEnc,
        connection.refreshTokenIv,
        connection.refreshTokenTag,
      );
      await revokeToken(refreshToken);
    } catch {
      // Non-critical — proceed with deletion
    }

    await prisma.googleCalendarConnection.delete({
      where: { id: connection.id },
    });

    return { success: true };
  } catch (error) {
    log.error("Failed to disconnect Google Calendar", {
      error: String(error),
    });
    return { success: false, error: "Failed to disconnect Google Calendar" };
  }
}

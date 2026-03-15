"use server";

import { getCurrentUser } from "@/lib/permissions-server";
import { checkActionRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import {
  getValidAccessToken,
  fetchGoogleMeetEvents,
  fetchAllGoogleMeetEvents,
  TokenRevokedError,
} from "@/lib/services/google-calendar";
import { GoogleMeetEvent } from "@/lib/types";
import { createLogger } from "@/lib/logger";

const log = createLogger("GoogleMeetActions");

export async function getGoogleMeetEvents(
  rangeStart: string,
  rangeEnd: string,
  pageToken?: string,
): Promise<{
  success: boolean;
  data?: { events: GoogleMeetEvent[]; nextPageToken?: string };
  connected?: boolean;
  error?: string;
}> {
  let userId: number | undefined;
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };
    userId = user.id;

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
      return { success: true, data: { events: [], nextPageToken: undefined }, connected: false };
    }

    const accessToken = await getValidAccessToken(connection);
    const result = await fetchGoogleMeetEvents(
      accessToken,
      new Date(rangeStart).toISOString(),
      new Date(rangeEnd).toISOString(),
      pageToken,
    );

    const events: GoogleMeetEvent[] = result.events.map((ge) => {
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

      // Extract Meet link: prefer hangoutLink, fallback to video entryPoint
      const meetLink =
        ge.hangoutLink ||
        ge.conferenceData?.entryPoints?.find(
          (ep) => ep.entryPointType === "video",
        )?.uri ||
        "";

      const organizer = ge.organizer
        ? { email: ge.organizer.email, displayName: ge.organizer.displayName }
        : { email: "" };

      const attendees = (ge.attendees || []).map((a) => ({
        email: a.email,
        displayName: a.displayName,
        responseStatus: a.responseStatus,
        self: a.self,
      }));

      return {
        id: ge.id,
        title: ge.summary || "(ללא כותרת)",
        description: ge.description || null,
        startTime,
        endTime,
        meetLink,
        organizer,
        attendees,
        isRecurring: !!ge.recurringEventId,
        googleEventUrl: ge.htmlLink || null,
      };
    });

    return {
      success: true,
      data: { events, nextPageToken: result.nextPageToken },
      connected: true,
    };
  } catch (error) {
    if (error instanceof TokenRevokedError) {
      log.warn("Google Calendar token revoked", { userId });
      return {
        success: false,
        connected: false,
        error: "חיבור Google Calendar פג תוקף - יש להתחבר מחדש",
      };
    }
    log.error("Failed to fetch Google Meet events", {
      error: String(error),
      userId,
    });
    return { success: false, error: "שגיאה בטעינת פגישות Google Meet" };
  }
}

export async function getAllGoogleMeetEvents(
  rangeStart: string,
  rangeEnd: string,
): Promise<{
  success: boolean;
  data?: { events: GoogleMeetEvent[] };
  connected?: boolean;
  error?: string;
}> {
  let userId: number | undefined;
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };
    userId = user.id;

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
      return { success: true, data: { events: [] }, connected: false };
    }

    const accessToken = await getValidAccessToken(connection);
    const rawEvents = await fetchAllGoogleMeetEvents(
      accessToken,
      new Date(rangeStart).toISOString(),
      new Date(rangeEnd).toISOString(),
    );

    const events: GoogleMeetEvent[] = rawEvents.map((ge) => {
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

      const meetLink =
        ge.hangoutLink ||
        ge.conferenceData?.entryPoints?.find(
          (ep) => ep.entryPointType === "video",
        )?.uri ||
        "";

      const organizer = ge.organizer
        ? { email: ge.organizer.email, displayName: ge.organizer.displayName }
        : { email: "" };

      const attendees = (ge.attendees || []).map((a) => ({
        email: a.email,
        displayName: a.displayName,
        responseStatus: a.responseStatus,
        self: a.self,
      }));

      return {
        id: ge.id,
        title: ge.summary || "(ללא כותרת)",
        description: ge.description || null,
        startTime,
        endTime,
        meetLink,
        organizer,
        attendees,
        isRecurring: !!ge.recurringEventId,
        googleEventUrl: ge.htmlLink || null,
      };
    });

    return { success: true, data: { events }, connected: true };
  } catch (error) {
    if (error instanceof TokenRevokedError) {
      log.warn("Google Calendar token revoked", { userId });
      return {
        success: false,
        connected: false,
        error: "חיבור Google Calendar פג תוקף - יש להתחבר מחדש",
      };
    }
    log.error("Failed to fetch all Google Meet events", {
      error: String(error),
      userId,
    });
    return { success: false, error: "שגיאה בטעינת פגישות Google Meet" };
  }
}

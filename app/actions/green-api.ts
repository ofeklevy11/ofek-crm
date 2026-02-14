"use server";

import { prisma as db } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";

const GREEN_API_BASE_URL = "https://api.green-api.com";

export async function saveGreenApiCredentials(
  instanceId: string,
  token: string,
) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  if (user.role !== "admin" && user.role !== "super") {
    throw new Error("Only admins can manage Green API connections");
  }

  // Basic validation
  if (!instanceId || !token) {
    throw new Error("Missing credentials");
  }

  // Verify credentials by calling Green API
  try {
    const response = await fetch(
      `${GREEN_API_BASE_URL}/waInstance${instanceId}/getStateInstance/${token}`,
      { signal: AbortSignal.timeout(15_000) },
    );

    if (!response.ok) {
      // If 401 or 403, credentials are invalid
      throw new Error("Failed to verify credentials with Green API");
    }

    const data = await response.json();
    if (!data || !data.stateInstance) {
      throw new Error("Invalid response from Green API");
    }
  } catch (error: any) {
    console.error("Green API verification failed:", error);
    throw new Error(
      "Could not verify Green API credentials. Please check your Instance ID and Token.",
    );
  }

  // Save to DB
  await db.company.update({
    where: { id: user.companyId },
    data: {
      greenApiInstanceId: instanceId,
      greenApiToken: token,
    },
  });

  return { success: true };
}

export async function getGreenApiCredentials() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  // Only admins can view the actual credentials
  if (user.role !== "admin" && user.role !== "super") {
    // Return connected status but NO credentials for non-admins
    // We check if values exist in DB
    const companyCheck = await db.company.findUnique({
      where: { id: user.companyId },
      select: {
        greenApiInstanceId: true,
      },
    });

    return {
      greenApiInstanceId: companyCheck?.greenApiInstanceId ? "********" : null,
      greenApiToken: null,
      isAdmin: false,
    };
  }

  const company = await db.company.findUnique({
    where: { id: user.companyId },
    select: {
      greenApiInstanceId: true,
      greenApiToken: true,
    },
  });

  return { ...company, isAdmin: true };
}

export async function getGreenApiStatus() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const company = await db.company.findUnique({
    where: { id: user.companyId },
    select: {
      greenApiInstanceId: true,
      greenApiToken: true,
    },
  });

  if (!company?.greenApiInstanceId || !company?.greenApiToken) {
    return null;
  }

  const { greenApiInstanceId, greenApiToken } = company;

  try {
    const response = await fetch(
      `${GREEN_API_BASE_URL}/waInstance${greenApiInstanceId}/getStateInstance/${greenApiToken}`,
      { cache: "no-store", signal: AbortSignal.timeout(15_000) },
    );

    if (!response.ok) {
      return { error: "Failed to fetch status" };
    }

    const data = await response.json();

    return {
      connected: true,
      state: data.stateInstance, // authorized, blocked, sleep, starting
    };
  } catch (error) {
    console.error("Error fetching Green API status:", error);
    return { error: "Connection error" };
  }
}

export async function disconnectGreenApi() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  if (user.role !== "admin" && user.role !== "super") {
    throw new Error("Only admins can manage Green API connections");
  }

  await db.company.update({
    where: { id: user.companyId },
    data: {
      greenApiInstanceId: null,
      greenApiToken: null,
    },
  });

  return { success: true };
}

// Sending utilities moved to lib/services/green-api.ts (non-server-action file)
// to prevent exposure as server action endpoints.
// Import from "@/lib/services/green-api" for sendGreenApiMessage/sendGreenApiFile.

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
      { cache: "no-store" },
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

// --- Sending Utils ---

export async function sendGreenApiMessage(
  companyId: number,
  to: string,
  message: string,
) {
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { greenApiInstanceId: true, greenApiToken: true },
  });

  if (!company?.greenApiInstanceId || !company?.greenApiToken) {
    throw new Error("Green API not connected for this company");
  }

  const { greenApiInstanceId, greenApiToken } = company;

  // Format phone number logic
  const chatId = formatGreenApiPhone(to);

  const url = `${GREEN_API_BASE_URL}/waInstance${greenApiInstanceId}/sendMessage/${greenApiToken}`;

  const payload = {
    chatId: chatId,
    message: message,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Green API Send Error:", err);
    throw new Error("Failed to send WhatsApp message");
  }

  return await res.json();
}

export async function sendGreenApiFile(
  companyId: number,
  to: string,
  fileUrl: string,
  fileName: string,
  caption?: string,
) {
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { greenApiInstanceId: true, greenApiToken: true },
  });

  if (!company?.greenApiInstanceId || !company?.greenApiToken) {
    throw new Error("Green API not connected for this company");
  }

  const { greenApiInstanceId, greenApiToken } = company;

  const chatId = formatGreenApiPhone(to);

  const url = `${GREEN_API_BASE_URL}/waInstance${greenApiInstanceId}/sendFileByUrl/${greenApiToken}`;

  const payload = {
    chatId: chatId,
    urlFile: fileUrl,
    fileName: fileName,
    caption: caption,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Green API Send File Error:", err);
    throw new Error("Failed to send WhatsApp file");
  }

  return await res.json();
}

function formatGreenApiPhone(phone: string): string {
  let chatId = phone.trim();
  if (chatId.endsWith("@g.us")) {
    return chatId;
  }

  // Remove all non-digit characters
  chatId = chatId.replace(/\D/g, "");

  // If israel number starting with 0, replace with 972
  if (chatId.startsWith("0")) {
    chatId = "972" + chatId.substring(1);
  }

  // Ensure @c.us suffix
  if (!chatId.endsWith("@c.us")) {
    chatId = chatId + "@c.us";
  }

  return chatId;
}

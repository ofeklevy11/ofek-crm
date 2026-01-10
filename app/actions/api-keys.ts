"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import crypto from "crypto";

export async function getApiKeys() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const keys = await prisma.apiKey.findMany({
      where: { companyId: user.companyId },
      orderBy: { createdAt: "desc" },
      include: {
        creator: {
          select: { name: true },
        },
      },
    });

    return { success: true, data: keys };
  } catch (error) {
    console.error("Error fetching API keys:", error);
    return { success: false, error: "Failed to fetch API keys" };
  }
}

export async function createApiKey(name: string) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return { success: false, error: "Unauthorized" };
  }

  // Generate a secure random key
  // Format: sk_live_[random_hex]
  const randomBytes = crypto.randomBytes(24).toString("hex");
  const key = `sk_live_${randomBytes}`;

  console.log(
    "Creating API Key for user:",
    user.id,
    "Company:",
    user.companyId
  );

  try {
    const newKey = await prisma.apiKey.create({
      data: {
        companyId: user.companyId,
        key,
        name,
        createdBy: user.id,
      },
    });

    return { success: true, data: newKey };
  } catch (error) {
    console.error("Error creating API key:", error);
    return {
      success: false,
      error: "Failed to create API key: " + String(error),
    };
  }
}

export async function deleteApiKey(id: number) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return { success: false, error: "Unauthorized" };
  }

  try {
    // Verify the key belongs to the user's company
    const existingKey = await prisma.apiKey.findFirst({
      where: {
        id,
        companyId: user.companyId,
      },
    });

    if (!existingKey) {
      return { success: false, error: "Key not found" };
    }

    await prisma.apiKey.delete({
      where: { id },
    });

    return { success: true };
  } catch (error) {
    console.error("Error deleting API key:", error);
    return { success: false, error: "Failed to delete API key" };
  }
}

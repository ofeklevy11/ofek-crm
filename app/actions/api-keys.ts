"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import crypto from "crypto";
import { hashApiKey, maskApiKey } from "@/lib/api-key-utils";
import { createLogger } from "@/lib/logger";
import { logSecurityEvent, SEC_API_KEY_CREATED, SEC_API_KEY_DELETED } from "@/lib/security/audit-security";

const log = createLogger("ApiKeys");

export async function getApiKeys() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const keys = await prisma.apiKey.findMany({
      where: { companyId: user.companyId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        key: true,
        isActive: true,
        createdAt: true,
        creator: { select: { name: true } },
      },
      take: 100, // P91: Bound API keys query
    });

    return { success: true, data: keys };
  } catch (error) {
    log.error("Error fetching API keys", { error: String(error) });
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
  const fullKey = `sk_live_${randomBytes}`;
  const keyHash = hashApiKey(fullKey);
  const maskedKey = maskApiKey(fullKey);

  try {
    const newKey = await prisma.apiKey.create({
      data: {
        companyId: user.companyId,
        key: maskedKey,
        keyHash,
        name,
        createdBy: user.id,
      },
      select: { id: true, name: true, key: true, isActive: true, createdAt: true },
    });

    logSecurityEvent({ action: SEC_API_KEY_CREATED, companyId: user.companyId, userId: user.id, details: { keyName: name, keyId: newKey.id } });

    // Return the full key ONCE — it can never be retrieved again
    return { success: true, data: { ...newKey, fullKey } };
  } catch (error) {
    log.error("Error creating API key", { error: String(error) });
    return { success: false, error: "Failed to create API key" };
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
      where: { id, companyId: user.companyId },
    });

    logSecurityEvent({ action: SEC_API_KEY_DELETED, companyId: user.companyId, userId: user.id, details: { keyId: id, keyName: existingKey.name } });

    return { success: true };
  } catch (error) {
    log.error("Error deleting API key", { error: String(error) });
    return { success: false, error: "Failed to delete API key" };
  }
}

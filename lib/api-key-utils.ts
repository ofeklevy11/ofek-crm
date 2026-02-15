import crypto from "crypto";
import { prisma } from "@/lib/prisma";

/** Hash an API key using SHA-256 for secure storage/lookup */
export function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

/** Create a masked preview of an API key for display (e.g. "sk_live_...abc123") */
export function maskApiKey(key: string): string {
  if (key.length <= 16) return "sk_live_...";
  return `${key.slice(0, 8)}...${key.slice(-6)}`;
}

/** Look up an API key record by its plaintext value (hashes it first) */
export async function findApiKeyByValue(apiKey: string) {
  const keyHash = hashApiKey(apiKey);
  return prisma.apiKey.findUnique({
    where: { keyHash },
    select: { companyId: true, isActive: true },
  });
}

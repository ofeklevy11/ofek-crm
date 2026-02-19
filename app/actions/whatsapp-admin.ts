"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { checkActionRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";

const log = createLogger("WhatsAppAdmin");

async function requireWhatsAppAdmin() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  if (!hasUserFlag(user, "canManageWhatsApp")) throw new Error("Forbidden");

  const limited = await checkActionRateLimit(
    String(user.id),
    RATE_LIMITS.whatsappMutate,
  ).catch(() => false);
  if (limited) throw new Error("Rate limit exceeded");

  return user;
}

export async function getWhatsAppAccounts() {
  const user = await requireWhatsAppAdmin();

  const accounts = await prisma.whatsAppAccount.findMany({
    where: { companyId: user.companyId },
    include: {
      phoneNumbers: {
        where: { isActive: true },
        select: {
          id: true,
          phoneNumberId: true,
          displayPhone: true,
          verifiedName: true,
          qualityRating: true,
        },
      },
      connectedUser: {
        select: { id: true, name: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Never expose encrypted tokens to frontend
  return accounts.map((a) => ({
    id: a.id,
    wabaId: a.wabaId,
    businessName: a.businessName,
    status: a.status,
    connectedBy: a.connectedUser?.name || null,
    phoneNumbers: a.phoneNumbers,
    createdAt: a.createdAt,
  }));
}

export async function disconnectWhatsAppAccount(accountId: number) {
  const user = await requireWhatsAppAdmin();

  const account = await prisma.whatsAppAccount.findFirst({
    where: { id: accountId, companyId: user.companyId },
    select: { id: true },
  });

  if (!account) throw new Error("Account not found");

  await prisma.whatsAppAccount.update({
    where: { id: accountId },
    data: { status: "DISCONNECTED" },
  });

  // Deactivate associated phone numbers
  await prisma.whatsAppPhoneNumber.updateMany({
    where: { accountId },
    data: { isActive: false },
  });

  log.info("WhatsApp account disconnected", {
    accountId,
    companyId: user.companyId,
  });

  return { success: true };
}

export async function getWhatsAppConnectionStatus() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const account = await prisma.whatsAppAccount.findFirst({
    where: { companyId: user.companyId, status: "ACTIVE" },
    select: {
      id: true,
      businessName: true,
      status: true,
      phoneNumbers: {
        where: { isActive: true },
        select: { displayPhone: true, verifiedName: true },
      },
    },
  });

  if (!account) return { connected: false };

  return {
    connected: true,
    businessName: account.businessName,
    phoneNumbers: account.phoneNumbers,
  };
}

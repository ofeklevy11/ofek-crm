"use server";

import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { getCurrentUser, invalidateUserCache } from "@/lib/permissions-server";
import { checkActionRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { tokensMatch } from "@/lib/security/tokens";
import { sendEmailChangeVerification, sendEmailChangedNotification } from "@/lib/email";
import { logSecurityEvent, SEC_EMAIL_CHANGED } from "@/lib/security/audit-security";
import { createLogger } from "@/lib/logger";

const log = createLogger("ChangeEmail");

export async function requestEmailChange(newEmail: string, currentPassword: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const limited = await checkActionRateLimit(String(user.id), RATE_LIMITS.userManagement);
  if (limited) return { success: false, error: "יותר מדי בקשות. נסה שוב מאוחר יותר." };

  const normalizedEmail = newEmail.trim().toLowerCase();
  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return { success: false, error: "כתובת אימייל לא תקינה" };
  }

  if (normalizedEmail === user.email) {
    return { success: false, error: "זוהי כתובת האימייל הנוכחית שלך" };
  }

  // Verify current password
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  if (!dbUser) return { success: false, error: "משתמש לא נמצא" };

  const valid = await bcrypt.compare(currentPassword, dbUser.passwordHash);
  if (!valid) return { success: false, error: "סיסמה שגויה" };

  // Check if email is taken
  const emailTaken = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true },
  });
  if (emailTaken) {
    return { success: false, error: "לא ניתן לשנות לכתובת האימייל שסופקה" };
  }

  // Generate OTP and store in Redis
  const code = String(crypto.randomInt(100000, 999999));
  await redis.set(
    `email-change:${user.id}`,
    JSON.stringify({ code, newEmail: normalizedEmail, attempts: 0 }),
    "EX",
    3600 // 1 hour
  );

  await sendEmailChangeVerification(normalizedEmail, code);

  log.info("Email change OTP sent", { userId: user.id, newEmail: normalizedEmail });
  return { success: true };
}

export async function verifyEmailChange(code: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const limited = await checkActionRateLimit(String(user.id), RATE_LIMITS.userManagement);
  if (limited) return { success: false, error: "יותר מדי בקשות. נסה שוב מאוחר יותר." };

  const redisKey = `email-change:${user.id}`;
  const raw = await redis.get(redisKey);

  if (!raw) {
    return { success: false, error: "קוד האימות פג תוקף. נסה שוב." };
  }

  const pending = JSON.parse(raw) as {
    code: string;
    newEmail: string;
    attempts: number;
  };

  pending.attempts += 1;

  if (pending.attempts > 5) {
    await redis.del(redisKey);
    return { success: false, error: "יותר מדי ניסיונות. נסה שוב." };
  }

  const ttl = await redis.ttl(redisKey);
  if (ttl > 0) {
    await redis.set(redisKey, JSON.stringify(pending), "EX", ttl);
  }

  if (!tokensMatch(code, pending.code)) {
    return { success: false, error: "קוד אימות שגוי" };
  }

  // Check uniqueness again
  const emailTaken = await prisma.user.findUnique({
    where: { email: pending.newEmail },
    select: { id: true },
  });
  if (emailTaken) {
    await redis.del(redisKey);
    return { success: false, error: "לא ניתן לשנות לכתובת האימייל שסופקה" };
  }

  const oldEmail = user.email;

  // Update email
  await prisma.user.update({
    where: { id: user.id },
    data: { email: pending.newEmail },
  });

  await Promise.all([
    redis.del(redisKey),
    invalidateUserCache(user.id),
  ]);

  logSecurityEvent({
    action: SEC_EMAIL_CHANGED,
    companyId: user.companyId,
    userId: user.id,
    details: { oldEmail, newEmail: pending.newEmail },
  });

  sendEmailChangedNotification(oldEmail).catch(() => {});

  log.info("Email changed", { userId: user.id, oldEmail, newEmail: pending.newEmail });
  return { success: true };
}

"use server";

import { prisma as db } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { createLogger } from "@/lib/logger";
import { encrypt, decrypt, type EncryptedData } from "@/lib/services/encryption";
import { env } from "@/lib/env";
import { checkActionRateLimit } from "@/lib/rate-limit";
import { RATE_LIMITS } from "@/lib/rate-limit";
import { inngest } from "@/lib/inngest/client";
import { getMonthlySmsLimit } from "@/lib/plan-limits";
import { isValidE164, normalizeToE164 } from "@/lib/utils/phone";
import {
  verifyCredentials,
  listSmsCapableNumbers,
  sendSms,
  TwilioSendError,
} from "@/lib/services/twilio-api";

const log = createLogger("SmsIntegration");

// ─── Helpers ────────────────────────────────────────────────────

function encryptToken(authToken: string): EncryptedData {
  const key = env.TWILIO_TOKEN_ENCRYPTION_KEY;
  if (!key) throw new Error("TWILIO_TOKEN_ENCRYPTION_KEY is not configured");
  return encrypt(authToken, key);
}

function decryptToken(enc: string, iv: string, tag: string): string {
  const key = env.TWILIO_TOKEN_ENCRYPTION_KEY;
  if (!key) throw new Error("TWILIO_TOKEN_ENCRYPTION_KEY is not configured");
  return decrypt({ ciphertext: enc, iv, authTag: tag }, key);
}

function requireAdmin(user: { role: string }) {
  if (user.role !== "admin" && user.role !== "super") {
    throw new Error("רק מנהלי מערכת יכולים לנהל חיבור SMS");
  }
}

// ─── Connect / Verify ──────────────────────────────────────────

export async function connectSmsIntegration(
  accountSid: string,
  authToken: string,
) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  requireAdmin(user);

  if (await checkActionRateLimit(String(user.id), RATE_LIMITS.smsMutation)) {
    throw new Error("נסיונות רבים מדי. נסה שוב מאוחר יותר.");
  }

  // Validate Account SID format
  if (!accountSid || !accountSid.startsWith("AC") || accountSid.length !== 34) {
    throw new Error("Account SID לא תקין. Account SID צריך להתחיל ב-AC ולהכיל 34 תווים.");
  }
  if (!authToken || authToken.length < 20) {
    throw new Error("Auth Token לא תקין.");
  }

  // Verify credentials with Twilio
  const result = await verifyCredentials(accountSid, authToken);
  if (!result.valid) {
    log.warn("SMS credential verification failed", { companyId: user.companyId });
    throw new Error(
      result.error === "Invalid credentials"
        ? "פרטי ההתחברות שגויים. בדוק את ה-Account SID וה-Auth Token."
        : "לא ניתן להתחבר ל-Twilio. נסה שוב מאוחר יותר.",
    );
  }

  // Encrypt auth token
  const encrypted = encryptToken(authToken);

  // Check for SMS-capable phone numbers
  const numbers = await listSmsCapableNumbers(accountSid, authToken);
  const hasNumbers = numbers.length > 0;
  const autoFromNumber = numbers.length === 1 ? numbers[0].phoneNumber : null;

  const status = autoFromNumber ? "READY" : hasNumbers ? "CONNECTED" : "NO_SMS_NUMBER";

  // Upsert integration
  await db.smsIntegration.upsert({
    where: { companyId: user.companyId },
    create: {
      companyId: user.companyId,
      accountSid,
      authTokenEnc: encrypted.ciphertext,
      authTokenIv: encrypted.iv,
      authTokenTag: encrypted.authTag,
      friendlyName: result.account?.friendlyName ?? null,
      fromNumber: autoFromNumber,
      status,
      connectedBy: user.id,
    },
    update: {
      accountSid,
      authTokenEnc: encrypted.ciphertext,
      authTokenIv: encrypted.iv,
      authTokenTag: encrypted.authTag,
      friendlyName: result.account?.friendlyName ?? null,
      fromNumber: autoFromNumber,
      status,
      connectedBy: user.id,
    },
  });

  log.info("SMS integration connected", { companyId: user.companyId, status });

  return {
    success: true,
    status,
    numbers: numbers.map((n) => ({
      phoneNumber: n.phoneNumber,
      friendlyName: n.friendlyName,
    })),
    accountType: result.account?.type,
  };
}

// ─── Get Status ────────────────────────────────────────────────

export async function getSmsIntegrationStatus() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const integration = await db.smsIntegration.findUnique({
    where: { companyId: user.companyId },
    select: {
      status: true,
      accountSid: true,
      fromNumber: true,
      friendlyName: true,
      updatedAt: true,
    },
  });

  if (!integration) {
    return {
      exists: false,
      status: "DISCONNECTED" as const,
      isAdmin: user.role === "admin",
    };
  }

  // Get monthly usage count
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthlyCount = await db.smsMessage.count({
    where: {
      companyId: user.companyId,
      createdAt: { gte: firstOfMonth },
      direction: "OUTBOUND",
    },
  });

  const monthlyLimit = getMonthlySmsLimit(user.isPremium);

  const isAdmin = user.role === "admin";

  return {
    exists: true,
    status: integration.status,
    accountSid: isAdmin ? integration.accountSid : `AC****${integration.accountSid.slice(-4)}`,
    fromNumber: integration.fromNumber,
    friendlyName: integration.friendlyName,
    monthlyCount,
    monthlyLimit: monthlyLimit === Infinity ? null : monthlyLimit,
    updatedAt: integration.updatedAt,
    isAdmin,
  };
}

// ─── Refresh Numbers ───────────────────────────────────────────

export async function refreshSmsNumbers() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  requireAdmin(user);

  if (await checkActionRateLimit(String(user.id), RATE_LIMITS.smsMutation)) {
    throw new Error("נסיונות רבים מדי. נסה שוב מאוחר יותר.");
  }

  const integration = await db.smsIntegration.findUnique({
    where: { companyId: user.companyId },
  });
  if (!integration) throw new Error("אין חיבור SMS פעיל");

  const authToken = decryptToken(
    integration.authTokenEnc,
    integration.authTokenIv,
    integration.authTokenTag,
  );

  const numbers = await listSmsCapableNumbers(integration.accountSid, authToken);

  // Update status if needed
  if (numbers.length === 0 && integration.status !== "NO_SMS_NUMBER") {
    await db.smsIntegration.update({
      where: { companyId: user.companyId },
      data: { status: "NO_SMS_NUMBER", fromNumber: null },
    });
  } else if (numbers.length > 0 && integration.status === "NO_SMS_NUMBER") {
    const autoFrom = numbers.length === 1 ? numbers[0].phoneNumber : integration.fromNumber;
    await db.smsIntegration.update({
      where: { companyId: user.companyId },
      data: {
        status: autoFrom ? "READY" : "CONNECTED",
        fromNumber: autoFrom,
      },
    });
  }

  return {
    numbers: numbers.map((n) => ({
      phoneNumber: n.phoneNumber,
      friendlyName: n.friendlyName,
    })),
  };
}

// ─── Select Default From Number ────────────────────────────────

export async function selectSmsFromNumber(phoneNumber: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  requireAdmin(user);

  if (!isValidE164(phoneNumber)) {
    throw new Error("מספר טלפון לא תקין");
  }

  const integration = await db.smsIntegration.findUnique({
    where: { companyId: user.companyId },
  });
  if (!integration) throw new Error("אין חיבור SMS פעיל");

  // Verify the number belongs to this Twilio account
  const authToken = decryptToken(
    integration.authTokenEnc,
    integration.authTokenIv,
    integration.authTokenTag,
  );
  const numbers = await listSmsCapableNumbers(integration.accountSid, authToken);
  const match = numbers.find((n) => n.phoneNumber === phoneNumber);
  if (!match) {
    throw new Error("המספר לא נמצא בחשבון ה-Twilio שלך");
  }

  await db.smsIntegration.update({
    where: { companyId: user.companyId },
    data: { fromNumber: phoneNumber, status: "READY" },
  });

  return { success: true };
}

// ─── Disconnect ────────────────────────────────────────────────

export async function disconnectSmsIntegration() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  requireAdmin(user);

  // Delete integration record (messages preserved via separate companyId FK)
  await db.smsIntegration.deleteMany({
    where: { companyId: user.companyId },
  });

  log.info("SMS integration disconnected", { companyId: user.companyId });
  return { success: true };
}

// ─── Send Test SMS ─────────────────────────────────────────────

export async function sendTestSms(toNumber: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  requireAdmin(user);

  if (await checkActionRateLimit(String(user.id), RATE_LIMITS.smsTestSend)) {
    throw new Error("ניתן לשלוח עד 3 הודעות בדיקה כל 15 דקות.");
  }

  const normalized = normalizeToE164(toNumber);
  if (!normalized) {
    throw new Error("מספר טלפון לא תקין. יש להזין מספר בפורמט בינלאומי.");
  }

  const integration = await db.smsIntegration.findUnique({
    where: { companyId: user.companyId },
  });
  if (!integration || integration.status !== "READY") {
    throw new Error("חיבור ה-SMS לא מוכן לשליחה. ודא שהחיבור פעיל ונבחר מספר שולח.");
  }

  const authToken = decryptToken(
    integration.authTokenEnc,
    integration.authTokenIv,
    integration.authTokenTag,
  );

  const companyName = user.company?.name ?? "BizlyCRM";
  const body = `הודעת בדיקה מ-${companyName} (BizlyCRM)`;

  try {
    const result = await sendSms(
      integration.accountSid,
      authToken,
      integration.fromNumber!,
      normalized,
      body,
      env.NEXT_PUBLIC_APP_URL
        ? `${env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio/status`
        : undefined,
    );

    // Store message log
    await db.smsMessage.create({
      data: {
        companyId: user.companyId,
        integrationId: integration.id,
        twilioSid: result.sid,
        fromNumber: integration.fromNumber!,
        toNumber: normalized,
        body,
        status: result.status.toUpperCase(),
        sentByUserId: user.id,
      },
    });

    return { success: true, sid: result.sid };
  } catch (err) {
    if (err instanceof TwilioSendError) {
      throw new Error(`שליחה נכשלה: ${err.message}`);
    }
    throw new Error("שגיאה בלתי צפויה בשליחת ההודעה");
  }
}

// ─── Send SMS (for internal use by Inngest jobs) ───────────────

/**
 * Queue an SMS to be sent asynchronously via Inngest.
 * Called from automation actions or other backend code.
 */
export async function queueSms(
  companyId: number,
  toNumber: string,
  body: string,
  opts?: { sentByUserId?: number; automationRuleId?: number },
) {
  await inngest.send({
    name: "sms/send-message",
    data: {
      companyId,
      toNumber,
      body,
      sentByUserId: opts?.sentByUserId,
      automationRuleId: opts?.automationRuleId,
    },
  });
}

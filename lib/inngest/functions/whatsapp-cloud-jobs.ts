import { inngest } from "../client";
import { NonRetriableError } from "inngest";
import { createLogger } from "@/lib/logger";
import { env } from "@/lib/env";
import {
  mapMessageType,
  mapMessageStatus,
  STATUS_PRIORITY,
} from "@/lib/whatsapp/types";
import type { WebhookMessage } from "@/lib/whatsapp/types";

const log = createLogger("WhatsAppCloudJobs");

// ─── Incoming Message Processing ─────────────────────────────────────
export const processWaIncomingMessage = inngest.createFunction(
  {
    id: "process-wa-incoming-message",
    name: "Process WhatsApp Incoming Message",
    retries: 3,
    timeouts: { finish: "60s" },
    concurrency: [
      { limit: 5, key: "event.data.companyId" },
      { limit: 20 },
    ],
  },
  { event: "whatsapp/incoming-message" },
  async ({ event, step }) => {
    const {
      companyId,
      phoneNumberDbId,
      accountId,
      phoneNumberId,
      message,
      contactProfile,
      contactWaId,
    } = event.data as {
      companyId: number;
      phoneNumberDbId: number;
      accountId: number;
      phoneNumberId: string;
      message: WebhookMessage;
      contactProfile: string | null;
      contactWaId: string;
    };

    // Step 1: Upsert contact
    const contact = await step.run("upsert-contact", async () => {
      const { prisma } = await import("@/lib/prisma");
      return prisma.waContact.upsert({
        where: {
          companyId_waId: { companyId, waId: contactWaId },
        },
        create: {
          companyId,
          waId: contactWaId,
          profileName: contactProfile,
          phone: contactWaId,
        },
        update: {
          profileName: contactProfile || undefined,
        },
        select: { id: true },
      });
    });

    // Step 2: Upsert conversation
    const conversation = await step.run("upsert-conversation", async () => {
      const { prisma } = await import("@/lib/prisma");
      return prisma.waConversation.upsert({
        where: {
          phoneNumberId_contactId: {
            phoneNumberId: phoneNumberDbId,
            contactId: contact.id,
          },
        },
        create: {
          companyId,
          phoneNumberId: phoneNumberDbId,
          contactId: contact.id,
          status: "OPEN",
          lastInboundAt: new Date(),
        },
        update: {
          status: "OPEN",
          lastInboundAt: new Date(),
        },
        select: { id: true, assignedUserId: true },
      });
    });

    // Step 3: Store message (idempotent via wamId unique constraint)
    const storedMessage = await step.run("store-message", async () => {
      const { prisma } = await import("@/lib/prisma");
      const msgType = mapMessageType(message.type);
      const body = extractMessageBody(message);

      // Check for duplicate (idempotent)
      if (message.id) {
        const existing = await prisma.waMessage.findUnique({
          where: { wamId: message.id },
          select: { id: true },
        });
        if (existing) {
          log.info("Duplicate message skipped", { wamId: message.id });
          return { id: existing.id.toString(), duplicate: true };
        }
      }

      const created = await prisma.waMessage.create({
        data: {
          companyId,
          conversationId: conversation.id,
          phoneNumberId: phoneNumberDbId,
          contactId: contact.id,
          wamId: message.id,
          direction: "INBOUND",
          type: msgType as any,
          status: "DELIVERED",
          body,
          mediaId: extractMediaId(message),
          mediaMime: extractMediaMime(message),
          mediaFileName: message.document?.filename || null,
          mediaSha256: extractMediaSha256(message),
          latitude: message.location?.latitude || null,
          longitude: message.location?.longitude || null,
          locationName: message.location?.name || null,
          locationAddress: message.location?.address || null,
          contextWamId: message.context?.id || null,
          timestamp: new Date(Number(message.timestamp) * 1000),
        },
        select: { id: true },
      });

      return { id: created.id.toString(), duplicate: false };
    });

    if (storedMessage.duplicate) {
      return { success: true, duplicate: true };
    }

    // Step 4: Update conversation metadata
    await step.run("update-conversation", async () => {
      const { prisma } = await import("@/lib/prisma");
      const preview = extractMessageBody(message)?.slice(0, 100) || `[${message.type}]`;
      await prisma.waConversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: new Date(),
          lastMessagePreview: preview,
          unreadCount: { increment: 1 },
        },
      });
    });

    // Step 5: Push real-time update via Redis
    await step.run("push-realtime", async () => {
      const { redis } = await import("@/lib/redis");
      const payload = JSON.stringify({
        type: "wa-new-message",
        conversationId: conversation.id,
        contactId: contact.id,
        messageId: storedMessage.id,
        direction: "INBOUND",
        messageType: message.type,
        body: extractMessageBody(message)?.slice(0, 100),
        timestamp: new Date().toISOString(),
      });

      // Send to assigned user, or broadcast to all users in company
      if (conversation.assignedUserId) {
        await redis.publish(
          `company:${companyId}:user:${conversation.assignedUserId}:whatsapp`,
          payload,
        );
      } else {
        // Broadcast: fetch all company users and publish in parallel
        const { prisma } = await import("@/lib/prisma");
        const users = await prisma.user.findMany({
          where: { companyId },
          select: { id: true },
        });
        await Promise.all(
          users.map((user) =>
            redis.publish(
              `company:${companyId}:user:${user.id}:whatsapp`,
              payload,
            )
          )
        );
      }
    });

    // Step 6: Trigger media download if applicable
    const mediaId = extractMediaId(message);
    if (mediaId) {
      await step.run("trigger-media-download", async () => {
        await inngest.send({
          name: "whatsapp/download-media",
          data: {
            companyId,
            accountId,
            messageId: storedMessage.id,
            mediaId,
          },
        });
      });
    }

    return { success: true, messageId: storedMessage.id };
  },
);

// ─── Status Update Processing ────────────────────────────────────────
export const processWaStatusUpdate = inngest.createFunction(
  {
    id: "process-wa-status-update",
    name: "Process WhatsApp Status Update",
    retries: 3,
    timeouts: { finish: "30s" },
    concurrency: [
      { limit: 10, key: "event.data.companyId" },
      { limit: 30 },
    ],
  },
  { event: "whatsapp/status-update" },
  async ({ event, step }) => {
    const { companyId, wamId, status, errors } = event.data as {
      companyId: number;
      phoneNumberDbId: number;
      wamId: string;
      status: "sent" | "delivered" | "read" | "failed";
      timestamp: string;
      recipientId: string;
      errors: unknown[] | null;
    };

    const newStatus = mapMessageStatus(status);

    const updatedMessage = await step.run("update-message-status", async () => {
      const { prisma } = await import("@/lib/prisma");

      const message = await prisma.waMessage.findUnique({
        where: { wamId },
        select: { id: true, status: true, conversationId: true, companyId: true },
      });

      if (!message) {
        log.info("Status update for unknown message", { wamId });
        return null;
      }

      // Tenant isolation check
      if (message.companyId !== companyId) {
        log.error("Status update company mismatch", { wamId, companyId });
        return null;
      }

      const errorInfo = errors?.length
        ? { errorCode: String((errors[0] as any)?.code || ""), errorMessage: String((errors[0] as any)?.title || "") }
        : {};

      // Atomic conditional update — only upgrade status, never downgrade
      // Uses updateMany with WHERE to avoid read-then-write race condition
      const newPriority = STATUS_PRIORITY[newStatus] ?? 0;
      const allowedCurrentStatuses =
        newStatus === "FAILED"
          ? undefined // FAILED always applies
          : (Object.entries(STATUS_PRIORITY)
              .filter(([, p]) => p < newPriority)
              .map(([s]) => s) as any[]);

      const result = await prisma.waMessage.updateMany({
        where: {
          wamId,
          companyId,
          ...(allowedCurrentStatuses ? { status: { in: allowedCurrentStatuses } } : {}),
        },
        data: { status: newStatus as any, ...errorInfo },
      });

      if (result.count === 0) return null;
      return { conversationId: message.conversationId };
    });

    // Push real-time status update
    if (updatedMessage) {
      await step.run("push-status-realtime", async () => {
        const { prisma } = await import("@/lib/prisma");
        const { redis } = await import("@/lib/redis");

        const conversation = await prisma.waConversation.findUnique({
          where: { id: updatedMessage.conversationId },
          select: { assignedUserId: true },
        });

        const payload = JSON.stringify({
          type: "wa-status-update",
          conversationId: updatedMessage.conversationId,
          wamId,
          status: newStatus,
        });

        if (conversation?.assignedUserId) {
          await redis.publish(
            `company:${companyId}:user:${conversation.assignedUserId}:whatsapp`,
            payload,
          );
        } else {
          const users = await prisma.user.findMany({
            where: { companyId },
            select: { id: true },
          });
          await Promise.all(
            users.map((user) =>
              redis.publish(
                `company:${companyId}:user:${user.id}:whatsapp`,
                payload,
              )
            )
          );
        }
      });
    }

    return { success: true, updated: !!updatedMessage };
  },
);

// ─── Outbound Message Sending ────────────────────────────────────────
export const sendWaOutboundMessage = inngest.createFunction(
  {
    id: "send-wa-outbound-message",
    name: "Send WhatsApp Outbound Message",
    retries: 3,
    timeouts: { finish: "60s" },
    idempotency: "event.id",
    concurrency: [
      { limit: 3, key: "event.data.companyId" },
      { limit: 10 },
    ],
  },
  { event: "whatsapp/send-message" },
  async ({ event, step }) => {
    const {
      companyId,
      conversationId,
      body,
      type,
      mediaUrl,
      mediaFileName,
      sentByUserId,
      templateName,
      languageCode,
      templateComponents,
    } = event.data as {
      companyId: number;
      conversationId: number;
      body: string;
      type: string;
      mediaUrl?: string;
      mediaFileName?: string;
      sentByUserId: number;
      templateName?: string;
      languageCode?: string;
      templateComponents?: unknown[];
    };

    // Step 1: Load conversation, contact, phone, and account data
    const context = await step.run("load-context", async () => {
      const { prisma } = await import("@/lib/prisma");
      const conversation = await prisma.waConversation.findUnique({
        where: { id: conversationId },
        include: {
          contact: { select: { waId: true } },
          phoneNumber: {
            select: {
              phoneNumberId: true,
              accountId: true,
              account: {
                select: {
                  accessTokenEnc: true,
                  accessTokenIv: true,
                  accessTokenTag: true,
                  status: true,
                },
              },
            },
          },
        },
      });

      if (!conversation || conversation.companyId !== companyId) {
        throw new NonRetriableError("Conversation not found or access denied");
      }

      if (conversation.phoneNumber.account.status !== "ACTIVE") {
        throw new NonRetriableError("WhatsApp account is not active");
      }

      return {
        waId: conversation.contact.waId,
        phoneNumberId: conversation.phoneNumber.phoneNumberId,
        accessTokenEnc: conversation.phoneNumber.account.accessTokenEnc,
        accessTokenIv: conversation.phoneNumber.account.accessTokenIv,
        accessTokenTag: conversation.phoneNumber.account.accessTokenTag,
        lastInboundAt: conversation.lastInboundAt,
        phoneNumberDbId: conversation.phoneNumberId,
        contactId: conversation.contactId,
      };
    });

    // Step 2: Check 24-hour window (skip for template messages)
    if (type !== "template") {
      await step.run("validate-window", async () => {
        if (!context.lastInboundAt) {
          throw new NonRetriableError(
            "Cannot send free-form message: no inbound message from contact. Use a template instead.",
          );
        }
        const hoursSinceLastInbound =
          (Date.now() - new Date(context.lastInboundAt).getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastInbound > 24) {
          throw new NonRetriableError(
            "24-hour messaging window expired. Use a template message to re-engage.",
          );
        }
      });
    }

    // Step 3: Decrypt token and send via Cloud API
    const sendResult = await step.run("send-via-api", async () => {
      const { decrypt } = await import("@/lib/services/encryption");
      const { sendTextMessage, sendMediaMessage, sendTemplateMessage } = await import(
        "@/lib/services/whatsapp-cloud-api"
      );

      const accessToken = env.WHATSAPP_ACCESS_TOKEN || decrypt({
        ciphertext: context.accessTokenEnc,
        iv: context.accessTokenIv,
        authTag: context.accessTokenTag,
      });

      if (type === "template" && templateName && languageCode) {
        return sendTemplateMessage(
          context.phoneNumberId,
          accessToken,
          context.waId,
          templateName,
          languageCode,
          templateComponents,
        );
      } else if (type === "text" || !mediaUrl) {
        return sendTextMessage(
          context.phoneNumberId,
          accessToken,
          context.waId,
          body,
        );
      } else {
        return sendMediaMessage(
          context.phoneNumberId,
          accessToken,
          context.waId,
          type as "image" | "video" | "audio" | "document",
          mediaUrl,
          body || undefined,
          mediaFileName,
        );
      }
    });

    // Step 4: Store outbound message
    const storedMessage = await step.run("store-message", async () => {
      const { prisma } = await import("@/lib/prisma");
      const msg = await prisma.waMessage.create({
        data: {
          companyId,
          conversationId,
          phoneNumberId: context.phoneNumberDbId,
          contactId: context.contactId,
          wamId: sendResult.messageId,
          direction: "OUTBOUND",
          type: (type?.toUpperCase() || "TEXT") as any,
          status: "SENT",
          body,
          mediaUrl: mediaUrl || null,
          mediaFileName: mediaFileName || null,
          sentByUserId,
          timestamp: new Date(),
        },
        select: { id: true },
      });

      // Update conversation
      await prisma.waConversation.update({
        where: { id: conversationId },
        data: {
          lastMessageAt: new Date(),
          lastMessagePreview: body?.slice(0, 100) || `[${type}]`,
        },
      });

      return { id: msg.id.toString() };
    });

    // Step 5: Push real-time notification
    await step.run("push-realtime", async () => {
      const { redis } = await import("@/lib/redis");
      const payload = JSON.stringify({
        type: "wa-new-message",
        conversationId,
        messageId: storedMessage.id,
        direction: "OUTBOUND",
        wamId: sendResult.messageId,
        status: "SENT",
        body: body?.slice(0, 100),
        messageType: type?.toUpperCase() || "TEXT",
        timestamp: new Date().toISOString(),
      });

      await redis.publish(
        `company:${companyId}:user:${sentByUserId}:whatsapp`,
        payload,
      );
    });

    return { success: true, messageId: storedMessage.id };
  },
);

// ─── Media Download ──────────────────────────────────────────────────
export const downloadWaMedia = inngest.createFunction(
  {
    id: "download-wa-media",
    name: "Download WhatsApp Media",
    retries: 3,
    timeouts: { finish: "120s" },
    concurrency: [
      { limit: 3, key: "event.data.companyId" },
      { limit: 10 },
    ],
  },
  { event: "whatsapp/download-media" },
  async ({ event, step }) => {
    const { companyId, accountId, messageId, mediaId } = event.data as {
      companyId: number;
      accountId: number;
      messageId: string;
      mediaId: string;
    };

    // Step 1: Get access token
    const accessToken = await step.run("decrypt-token", async () => {
      const { prisma } = await import("@/lib/prisma");
      const { decrypt } = await import("@/lib/services/encryption");

      const account = await prisma.whatsAppAccount.findFirst({
        where: { id: accountId, companyId },
        select: {
          accessTokenEnc: true,
          accessTokenIv: true,
          accessTokenTag: true,
        },
      });

      if (!account) {
        throw new NonRetriableError("WhatsApp account not found");
      }

      return env.WHATSAPP_ACCESS_TOKEN || decrypt({
        ciphertext: account.accessTokenEnc,
        iv: account.accessTokenIv,
        authTag: account.accessTokenTag,
      });
    });

    // Step 2: Get media URL from Meta
    const mediaInfo = await step.run("get-media-url", async () => {
      const { getMediaUrl } = await import(
        "@/lib/services/whatsapp-cloud-api"
      );
      return getMediaUrl(mediaId, accessToken);
    });

    // Step 3: Download and store
    await step.run("download-and-store", async () => {
      const { downloadMedia } = await import(
        "@/lib/services/whatsapp-cloud-api"
      );
      const { prisma } = await import("@/lib/prisma");

      const buffer = await downloadMedia(mediaInfo.url, accessToken);

      // Store the media URL (Meta's URL is temporary, but we can cache it)
      // For production, upload to S3/UploadThing here
      // For now, store the Meta URL which is valid for a limited time
      await prisma.waMessage.update({
        where: { id: BigInt(messageId) },
        data: {
          mediaUrl: mediaInfo.url,
          mediaMime: mediaInfo.mime_type,
        },
      });

      log.info("Media downloaded", {
        messageId,
        size: buffer.length,
        mime: mediaInfo.mime_type,
      });
    });

    return { success: true };
  },
);

// ─── Helpers ─────────────────────────────────────────────────────────

function extractMessageBody(msg: WebhookMessage): string | null {
  if (msg.text?.body) return msg.text.body;
  if (msg.image?.caption) return msg.image.caption;
  if (msg.video?.caption) return msg.video.caption;
  if (msg.document?.caption) return msg.document.caption;
  if (msg.location) {
    return [msg.location.name, msg.location.address]
      .filter(Boolean)
      .join(", ") || null;
  }
  return null;
}

function extractMediaId(msg: WebhookMessage): string | null {
  return (
    msg.image?.id ||
    msg.video?.id ||
    msg.audio?.id ||
    msg.document?.id ||
    msg.sticker?.id ||
    null
  );
}

function extractMediaMime(msg: WebhookMessage): string | null {
  return (
    msg.image?.mime_type ||
    msg.video?.mime_type ||
    msg.audio?.mime_type ||
    msg.document?.mime_type ||
    msg.sticker?.mime_type ||
    null
  );
}

function extractMediaSha256(msg: WebhookMessage): string | null {
  return (
    msg.image?.sha256 ||
    msg.video?.sha256 ||
    msg.audio?.sha256 ||
    msg.document?.sha256 ||
    msg.sticker?.sha256 ||
    null
  );
}

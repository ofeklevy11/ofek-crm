"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { checkActionRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { inngest } from "@/lib/inngest/client";
import { withRetry } from "@/lib/db-retry";
import {
  sendMessageSchema,
  getConversationsSchema,
  getMessagesSchema,
  assignConversationSchema,
  conversationIdSchema,
  searchContactsSchema,
} from "@/lib/whatsapp/validation";
import { createLogger } from "@/lib/logger";

const log = createLogger("WhatsAppActions");

// ── Helpers ────────────────────────────────────────────────────────

type WaRateLimitKey =
  | "whatsappSend"
  | "whatsappRead"
  | "whatsappMutate"
  | "whatsappMark";

async function requireWhatsAppUser(rateLimitKey: WaRateLimitKey) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  if (!hasUserFlag(user, "canViewWhatsApp")) throw new Error("Forbidden");

  const limited = await checkActionRateLimit(
    String(user.id),
    RATE_LIMITS[rateLimitKey],
  ).catch(() => false);
  if (limited) throw new Error("Rate limit exceeded");

  return user;
}

// ── Actions ────────────────────────────────────────────────────────

export async function getConversations(input: {
  cursor?: number;
  limit?: number;
  assignedToMe?: boolean;
  status?: "OPEN" | "CLOSED";
  search?: string;
}) {
  const user = await requireWhatsAppUser("whatsappRead");
  const parsed = getConversationsSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid input");

  const { cursor, limit, assignedToMe, status, search } = parsed.data;

  const where: any = {
    companyId: user.companyId,
  };

  if (assignedToMe) {
    where.assignedUserId = user.id;
  }
  if (status) {
    where.status = status;
  }
  if (search) {
    where.contact = {
      OR: [
        { profileName: { contains: search, mode: "insensitive" } },
        { phone: { contains: search } },
        { waId: { contains: search } },
      ],
    };
  }
  if (cursor) {
    where.id = { lt: cursor };
  }

  const conversations = await withRetry(() =>
    prisma.waConversation.findMany({
      where,
      include: {
        contact: {
          select: {
            id: true,
            waId: true,
            profileName: true,
            phone: true,
            clientId: true,
          },
        },
        phoneNumber: {
          select: {
            displayPhone: true,
            verifiedName: true,
          },
        },
        assignedUser: {
          select: { id: true, name: true },
        },
      },
      orderBy: { lastMessageAt: "desc" },
      take: limit,
    }),
  );

  return conversations;
}

export async function getConversationMessages(input: {
  conversationId: number;
  cursor?: string; // BigInt as string
  limit?: number;
}) {
  const user = await requireWhatsAppUser("whatsappRead");
  const conversationId = input.conversationId;
  if (!conversationId || conversationId <= 0) throw new Error("Invalid input");

  const limit = Math.min(Math.max(input.limit || 50, 1), 100);

  // Verify conversation belongs to user's company
  const conversation = await withRetry(() =>
    prisma.waConversation.findFirst({
      where: { id: conversationId, companyId: user.companyId },
      select: { id: true, lastInboundAt: true, status: true, assignedUserId: true },
    }),
  );

  if (!conversation) throw new Error("Conversation not found");

  const where: any = { conversationId };
  if (input.cursor) {
    where.id = { lt: BigInt(input.cursor) };
  }

  const messages = await withRetry(() =>
    prisma.waMessage.findMany({
      where,
      include: {
        sentByUser: {
          select: { id: true, name: true },
        },
      },
      orderBy: { timestamp: "desc" },
      take: limit,
    }),
  );

  // Convert BigInt ids to strings for serialization
  return {
    messages: messages.map((m) => ({
      ...m,
      id: m.id.toString(),
      conversationId: m.conversationId,
    })),
    conversationMeta: {
      lastInboundAt: conversation.lastInboundAt,
      status: conversation.status,
      assignedUserId: conversation.assignedUserId,
    },
  };
}

export async function sendWhatsAppMessage(input: {
  conversationId: number;
  body: string;
  type?: string;
  mediaUrl?: string;
  mediaFileName?: string;
}) {
  const user = await requireWhatsAppUser("whatsappSend");
  const parsed = sendMessageSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid input");

  const { conversationId, body, type, mediaUrl, mediaFileName } = parsed.data;

  // Verify conversation belongs to user's company
  const conversation = await withRetry(() =>
    prisma.waConversation.findFirst({
      where: { id: conversationId, companyId: user.companyId },
      select: { id: true, companyId: true },
    }),
  );

  if (!conversation) throw new Error("Conversation not found");

  // Dispatch to Inngest for async sending
  await inngest.send({
    name: "whatsapp/send-message",
    data: {
      companyId: user.companyId,
      conversationId,
      body,
      type: type || "text",
      mediaUrl: mediaUrl || undefined,
      mediaFileName: mediaFileName || undefined,
      sentByUserId: user.id,
    },
  });

  return { success: true, queued: true };
}

export async function markConversationAsRead(conversationId: number) {
  const user = await requireWhatsAppUser("whatsappMark");
  if (!conversationId || conversationId <= 0) throw new Error("Invalid input");

  const conversation = await withRetry(() =>
    prisma.waConversation.findFirst({
      where: { id: conversationId, companyId: user.companyId },
      select: { id: true },
    }),
  );

  if (!conversation) throw new Error("Conversation not found");

  await prisma.waConversation.update({
    where: { id: conversationId },
    data: { unreadCount: 0 },
  });

  return { success: true };
}

export async function assignConversation(input: {
  conversationId: number;
  userId: number | null;
}) {
  const user = await requireWhatsAppUser("whatsappMutate");
  const parsed = assignConversationSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid input");

  const { conversationId, userId } = parsed.data;

  const conversation = await withRetry(() =>
    prisma.waConversation.findFirst({
      where: { id: conversationId, companyId: user.companyId },
      select: { id: true },
    }),
  );

  if (!conversation) throw new Error("Conversation not found");

  // If assigning to a user, verify they're in the same company
  if (userId) {
    const targetUser = await prisma.user.findFirst({
      where: { id: userId, companyId: user.companyId },
      select: { id: true },
    });
    if (!targetUser) throw new Error("User not found");
  }

  await prisma.waConversation.update({
    where: { id: conversationId },
    data: { assignedUserId: userId },
  });

  return { success: true };
}

export async function closeConversation(conversationId: number) {
  const user = await requireWhatsAppUser("whatsappMutate");
  if (!conversationId || conversationId <= 0) throw new Error("Invalid input");

  const conversation = await withRetry(() =>
    prisma.waConversation.findFirst({
      where: { id: conversationId, companyId: user.companyId },
      select: { id: true },
    }),
  );

  if (!conversation) throw new Error("Conversation not found");

  await prisma.waConversation.update({
    where: { id: conversationId },
    data: { status: "CLOSED" },
  });

  return { success: true };
}

export async function reopenConversation(conversationId: number) {
  const user = await requireWhatsAppUser("whatsappMutate");
  if (!conversationId || conversationId <= 0) throw new Error("Invalid input");

  const conversation = await withRetry(() =>
    prisma.waConversation.findFirst({
      where: { id: conversationId, companyId: user.companyId },
      select: { id: true },
    }),
  );

  if (!conversation) throw new Error("Conversation not found");

  await prisma.waConversation.update({
    where: { id: conversationId },
    data: { status: "OPEN" },
  });

  return { success: true };
}

export async function searchContacts(query: string) {
  const user = await requireWhatsAppUser("whatsappRead");
  const parsed = searchContactsSchema.safeParse({ query });
  if (!parsed.success) throw new Error("Invalid input");

  const contacts = await withRetry(() =>
    prisma.waContact.findMany({
      where: {
        companyId: user.companyId,
        OR: [
          { profileName: { contains: parsed.data.query, mode: "insensitive" } },
          { phone: { contains: parsed.data.query } },
          { waId: { contains: parsed.data.query } },
        ],
      },
      select: {
        id: true,
        waId: true,
        profileName: true,
        phone: true,
        clientId: true,
      },
      take: 20,
    }),
  );

  return contacts;
}

export async function getUnreadConversationCount() {
  const user = await getCurrentUser();
  if (!user) return 0;
  if (!hasUserFlag(user, "canViewWhatsApp")) return 0;

  const result = await prisma.waConversation.aggregate({
    where: {
      companyId: user.companyId,
      status: "OPEN",
      unreadCount: { gt: 0 },
    },
    _sum: { unreadCount: true },
  });

  return result._sum.unreadCount || 0;
}

export async function getCompanyUsers() {
  const user = await requireWhatsAppUser("whatsappRead");

  return prisma.user.findMany({
    where: { companyId: user.companyId },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
}

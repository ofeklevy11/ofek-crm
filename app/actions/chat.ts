"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { withRetry } from "@/lib/db-retry";
import { checkActionRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import {
  sendMessageSchema,
  sendGroupMessageSchema,
  getMessagesSchema,
  getGroupMessagesSchema,
  createGroupSchema,
  updateGroupSchema,
  markAsReadSchema,
  sanitizeImageUrl,
} from "@/lib/chat/validation";
import { createLogger } from "@/lib/logger";

const log = createLogger("Chat");

// ── Helpers ────────────────────────────────────────────────────────────

type ChatRateLimitKey = "chatSend" | "chatRead" | "chatMutate" | "chatMark";

/** Authenticate + authorize (canViewChat) + rate-limit. Returns user or throws. */
async function requireChatUser(rateLimitKey: ChatRateLimitKey) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  if (!hasUserFlag(user, "canViewChat")) throw new Error("Forbidden");

  const limited = await checkActionRateLimit(
    String(user.id),
    RATE_LIMITS[rateLimitKey],
  ).catch(() => false);
  if (limited) throw new Error("Rate limit exceeded");

  return user;
}

// ── Actions ────────────────────────────────────────────────────────────

export async function updateGroup(
  groupId: number,
  name: string,
  imageUrl: string,
  memberIds: number[],
) {
  const currentUser = await requireChatUser("chatMutate");

  const parsed = updateGroupSchema.safeParse({ groupId, name, imageUrl, memberIds });
  if (!parsed.success) throw new Error("Invalid input");

  const safeImageUrl = sanitizeImageUrl(parsed.data.imageUrl);

  // Verify group belongs to user's company
  const group = await withRetry(() => prisma.group.findFirst({
    where: { id: parsed.data.groupId, companyId: currentUser.companyId },
    select: { id: true },
  }));
  if (!group) throw new Error("Group not found or access denied");

  // Verify membership
  const membership = await withRetry(() => prisma.groupMember.findUnique({
    where: {
      groupId_userId: {
        groupId: parsed.data.groupId,
        userId: currentUser.id,
      },
    },
  }));
  if (!membership) throw new Error("Group not found or access denied");

  // Cross-tenant verification: only keep memberIds that belong to same company
  const verifiedUsers = await withRetry(() => prisma.user.findMany({
    where: { id: { in: parsed.data.memberIds }, companyId: currentUser.companyId },
    select: { id: true },
  }));
  const verifiedIds = verifiedUsers.map((u) => u.id);

  // Ensure current user stays in the group
  const idsToKeep = [...new Set([...verifiedIds, currentUser.id])];

  // Update group details
  await prisma.group.update({
    where: { id: parsed.data.groupId, companyId: currentUser.companyId },
    data: {
      name: parsed.data.name,
      imageUrl: safeImageUrl,
    },
  });

  // Update members in a transaction
  await withRetry(() => prisma.$transaction(async (tx) => {
    // Remove members not in the new list
    await tx.groupMember.deleteMany({
      where: {
        groupId: parsed.data.groupId,
        userId: { notIn: idsToKeep },
      },
    });

    // Add new members
    const existingMembers = await tx.groupMember.findMany({
      where: {
        groupId: parsed.data.groupId,
        userId: { in: idsToKeep },
      },
      select: { userId: true },
      take: 500,
    });

    const existingIds = existingMembers.map((m) => m.userId);
    const newIds = idsToKeep.filter((id) => !existingIds.includes(id));

    if (newIds.length > 0) {
      await tx.groupMember.createMany({
        data: newIds.map((userId) => ({
          groupId: parsed.data.groupId,
          userId,
          companyId: currentUser.companyId,
        })),
      });
    }
  }, { maxWait: 5000, timeout: 10000 }));

  revalidatePath("/chat");
}

export async function getUsers() {
  const currentUser = await requireChatUser("chatRead");

  const users = await withRetry(() => prisma.user.findMany({
    where: {
      companyId: currentUser.companyId,
      id: { not: currentUser.id },
    },
    select: {
      id: true,
      name: true,
      role: true,
    },
    take: 500,
  }));

  const recentMessages = await withRetry(() => prisma.message.findMany({
    where: {
      OR: [{ senderId: currentUser.id }, { receiverId: currentUser.id }],
      groupId: null,
    },
    orderBy: { createdAt: "desc" },
    select: {
      createdAt: true,
      senderId: true,
      receiverId: true,
    },
    take: 1000,
  }));

  const usersWithTimestamp = users.map((user) => {
    const lastMsg = recentMessages.find(
      (m) =>
        (m.senderId === user.id && m.receiverId === currentUser.id) ||
        (m.senderId === currentUser.id && m.receiverId === user.id),
    );
    return {
      ...user,
      lastMessageAt: lastMsg ? lastMsg.createdAt : null,
    };
  });

  usersWithTimestamp.sort((a, b) => {
    if (a.lastMessageAt && b.lastMessageAt) {
      return b.lastMessageAt.getTime() - a.lastMessageAt.getTime();
    }
    if (a.lastMessageAt) return -1;
    if (b.lastMessageAt) return 1;
    return 0;
  });

  return usersWithTimestamp;
}

export async function createGroup(
  name: string,
  imageUrl: string,
  memberIds: number[],
) {
  const currentUser = await requireChatUser("chatMutate");

  const parsed = createGroupSchema.safeParse({ name, imageUrl, memberIds });
  if (!parsed.success) throw new Error("Invalid input");

  const safeImageUrl = sanitizeImageUrl(parsed.data.imageUrl);

  // Per-company group resource cap
  const MAX_GROUPS_PER_COMPANY = 200;
  const groupCount = await withRetry(() => prisma.group.count({
    where: { companyId: currentUser.companyId },
  }));
  if (groupCount >= MAX_GROUPS_PER_COMPANY) throw new Error("Group limit reached");

  // Cross-tenant verification: only keep memberIds that belong to same company
  const verifiedUsers = await withRetry(() => prisma.user.findMany({
    where: { id: { in: parsed.data.memberIds }, companyId: currentUser.companyId },
    select: { id: true },
  }));
  const verifiedIds = verifiedUsers.map((u) => u.id).filter((id) => id !== currentUser.id);

  const group = await prisma.group.create({
    data: {
      companyId: currentUser.companyId,
      name: parsed.data.name,
      imageUrl: safeImageUrl,
      creatorId: currentUser.id,
      members: {
        create: [
          { userId: currentUser.id, companyId: currentUser.companyId },
          ...verifiedIds.map((id) => ({ userId: id, companyId: currentUser.companyId })),
        ],
      },
    },
    select: {
      id: true, name: true, imageUrl: true, creatorId: true,
      createdAt: true, updatedAt: true,
    },
  });

  revalidatePath("/chat");
  return group;
}

export async function getGroups() {
  const currentUser = await requireChatUser("chatRead");

  const groups = await withRetry(() => prisma.group.findMany({
    where: {
      companyId: currentUser.companyId,
      members: {
        some: { userId: currentUser.id },
      },
    },
    select: {
      id: true, name: true, imageUrl: true, creatorId: true, createdAt: true, updatedAt: true,
      members: {
        select: {
          userId: true, lastReadAt: true,
          user: { select: { id: true, name: true } },
        },
        take: 50,
      },
      messages: {
        select: { id: true, content: true, senderId: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    take: 500,
  }));

  return groups;
}

export async function getMessages(otherUserId: number) {
  const currentUser = await requireChatUser("chatRead");

  const parsed = getMessagesSchema.safeParse({ otherUserId });
  if (!parsed.success) throw new Error("Invalid input");

  // Verify otherUserId belongs to same company
  const otherUser = await withRetry(() => prisma.user.findFirst({
    where: { id: parsed.data.otherUserId, companyId: currentUser.companyId },
    select: { id: true },
  }));
  if (!otherUser) throw new Error("User not found or access denied");

  const messages = await withRetry(() => prisma.message.findMany({
    where: {
      OR: [
        { senderId: currentUser.id, receiverId: parsed.data.otherUserId },
        { senderId: parsed.data.otherUserId, receiverId: currentUser.id },
      ],
      groupId: null,
    },
    orderBy: { createdAt: "asc" },
    take: 1000,
    select: {
      id: true, content: true, senderId: true, receiverId: true,
      read: true, createdAt: true,
      sender: { select: { name: true } },
      receiver: { select: { name: true } },
    },
  }));

  return messages;
}

export async function getGroupMessages(groupId: number) {
  const currentUser = await requireChatUser("chatRead");

  const parsed = getGroupMessagesSchema.safeParse({ groupId });
  if (!parsed.success) throw new Error("Invalid input");

  // Verify group belongs to user's company
  const groupExists = await withRetry(() => prisma.group.findFirst({
    where: { id: parsed.data.groupId, companyId: currentUser.companyId },
    select: { id: true },
  }));
  if (!groupExists) throw new Error("Group not found or access denied");

  // Verify membership
  const membership = await withRetry(() => prisma.groupMember.findUnique({
    where: {
      groupId_userId: {
        groupId: parsed.data.groupId,
        userId: currentUser.id,
      },
    },
  }));
  if (!membership) throw new Error("Group not found or access denied");

  const messages = await withRetry(() => prisma.message.findMany({
    where: { groupId: parsed.data.groupId },
    orderBy: { createdAt: "asc" },
    take: 1000,
    select: {
      id: true, content: true, senderId: true, groupId: true,
      createdAt: true,
      sender: { select: { name: true } },
    },
  }));

  return messages;
}

export async function sendMessage(receiverId: number, content: string) {
  const currentUser = await requireChatUser("chatSend");

  const parsed = sendMessageSchema.safeParse({ receiverId, content });
  if (!parsed.success) throw new Error("Invalid input");

  if (parsed.data.receiverId === currentUser.id) throw new Error("Invalid input");

  // Verify receiverId belongs to same company
  const receiver = await withRetry(() => prisma.user.findFirst({
    where: { id: parsed.data.receiverId, companyId: currentUser.companyId },
    select: { id: true },
  }));
  if (!receiver) throw new Error("User not found or access denied");

  await withRetry(() => prisma.message.create({
    data: {
      companyId: currentUser.companyId,
      content: parsed.data.content,
      senderId: currentUser.id,
      receiverId: parsed.data.receiverId,
    },
  }));

  // --- REALTIME UPDATE ---
  try {
    const { redisPublisher } = await import("@/lib/redis");
    await redisPublisher.publish(
      `company:${currentUser.companyId}:user:${parsed.data.receiverId}:chat`,
      JSON.stringify({ type: "new-message", senderId: currentUser.id }),
    );
  } catch (err) {
    log.error("Redis publish error", { error: String(err) });
  }

  revalidatePath("/chat");
}

export async function sendGroupMessage(groupId: number, content: string) {
  const currentUser = await requireChatUser("chatSend");

  const parsed = sendGroupMessageSchema.safeParse({ groupId, content });
  if (!parsed.success) throw new Error("Invalid input");

  // Verify group belongs to user's company
  const groupExists = await withRetry(() => prisma.group.findFirst({
    where: { id: parsed.data.groupId, companyId: currentUser.companyId },
    select: { id: true },
  }));
  if (!groupExists) throw new Error("Group not found or access denied");

  // Verify membership
  const membership = await withRetry(() => prisma.groupMember.findUnique({
    where: {
      groupId_userId: {
        groupId: parsed.data.groupId,
        userId: currentUser.id,
      },
    },
  }));
  if (!membership) throw new Error("Group not found or access denied");

  await withRetry(() => prisma.message.create({
    data: {
      companyId: currentUser.companyId,
      content: parsed.data.content,
      senderId: currentUser.id,
      groupId: parsed.data.groupId,
    },
  }));

  // --- REALTIME UPDATE: Broadcast to all group members ---
  try {
    const { redisPublisher } = await import("@/lib/redis");
    const members = await withRetry(() => prisma.groupMember.findMany({
      where: { groupId: parsed.data.groupId },
      select: { userId: true },
      take: 500,
    }));
    const publishPromises = members
      .filter((m) => m.userId !== currentUser.id)
      .map((m) =>
        redisPublisher.publish(
          `company:${currentUser.companyId}:user:${m.userId}:chat`,
          JSON.stringify({ type: "new-group-message", groupId: parsed.data.groupId, senderId: currentUser.id }),
        ),
      );
    await Promise.all(publishPromises);
  } catch (err) {
    log.error("Redis publish error (group)", { error: String(err) });
  }

  revalidatePath("/chat");
}

export async function markAsRead(id: number, type: "user" | "group" = "user") {
  const currentUser = await requireChatUser("chatMark");

  const parsed = markAsReadSchema.safeParse({ id, type });
  if (!parsed.success) throw new Error("Invalid input");

  if (parsed.data.type === "user") {
    // Verify sender belongs to same company
    const sender = await withRetry(() => prisma.user.findFirst({
      where: { id: parsed.data.id, companyId: currentUser.companyId },
      select: { id: true },
    }));
    if (!sender) throw new Error("User not found or access denied");

    await prisma.message.updateMany({
      where: {
        senderId: parsed.data.id,
        receiverId: currentUser.id,
        read: false,
      },
      data: { read: true },
    });
  } else if (parsed.data.type === "group") {
    // Verify group belongs to user's company
    const groupExists = await withRetry(() => prisma.group.findFirst({
      where: { id: parsed.data.id, companyId: currentUser.companyId },
      select: { id: true },
    }));
    if (!groupExists) throw new Error("Group not found or access denied");

    await prisma.groupMember.update({
      where: {
        groupId_userId: {
          groupId: parsed.data.id,
          userId: currentUser.id,
        },
      },
      data: { lastReadAt: new Date() },
    });
  }

  // --- REALTIME UPDATE ---
  try {
    const { redisPublisher } = await import("@/lib/redis");
    await redisPublisher.publish(
      `company:${currentUser.companyId}:user:${currentUser.id}:chat`,
      JSON.stringify({
        type: "messages-read",
        entityId: parsed.data.id,
        entityType: parsed.data.type,
      }),
    );
  } catch (err) {
    log.error("Redis publish error (markAsRead)", { error: String(err) });
  }

  revalidatePath("/chat");
}

export async function getUnreadCounts() {
  const currentUser = await requireChatUser("chatRead");

  // Unread DMs
  const unreadDMs = await withRetry(() => prisma.message.groupBy({
    by: ["senderId"],
    where: {
      receiverId: currentUser.id,
      read: false,
      groupId: null,
    },
    _count: { id: true },
  }));

  // Unread Group Messages
  const userGroups = await withRetry(() => prisma.groupMember.findMany({
    where: {
      userId: currentUser.id,
      group: { companyId: currentUser.companyId },
    },
    select: {
      groupId: true,
      lastReadAt: true,
    },
    take: 200,
  }));

  const groupIds = userGroups.map((m) => m.groupId);

  let unreadGroups: { type: "group"; id: number; count: number }[] = [];

  if (groupIds.length > 0) {
    const unreadGroupCounts = await Promise.all(
      userGroups.map(async (membership) => {
        const count = await withRetry(() => prisma.message.count({
          where: {
            groupId: membership.groupId,
            createdAt: { gt: membership.lastReadAt },
            senderId: { not: currentUser.id },
          },
        }));
        return { type: "group" as const, id: membership.groupId, count };
      }),
    );
    unreadGroups = unreadGroupCounts;
  }

  return [
    ...unreadDMs.map((dm) => ({
      type: "user" as const,
      id: dm.senderId,
      count: dm._count.id,
    })),
    ...unreadGroups.filter((g) => g.count > 0),
  ];
}

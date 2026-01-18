"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { revalidatePath } from "next/cache";

// ... imports

export async function updateGroup(
  groupId: number,
  name: string,
  imageUrl: string,
  memberIds: number[],
) {
  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error("Not authenticated");

  // Verify admin/creator status? For now, we'll allow any member to edit, or check if they are creator.
  // The prompt didn't strictly specify permissions, but usually group management is for admins or all members in small teams.
  // Let's check membership first.
  const membership = await prisma.groupMember.findUnique({
    where: {
      groupId_userId: {
        groupId,
        userId: currentUser.id,
      },
    },
  });

  if (!membership) throw new Error("Not a member of this group");

  // Update group details
  await prisma.group.update({
    where: { id: groupId },
    data: {
      name,
      imageUrl,
    },
  });

  // Update members.
  // Strategy: Get current members, identify to add/remove.
  // Or simpler: delete interactions that are NOT in the new list (except creator/current user?)
  // and create ones that don't exist.
  // A safer way with Prisma relations:
  const validMemberIds = memberIds.filter((id) => id !== currentUser.id); // Ensure current user is handled separately or kept

  // We want to ensure the current user (editor) remains in the group?
  // Usually creators shouldn't be removed, but if self-editing, ensure we don't accidentally kick ourselves out
  // if the UI didn't pass our ID.
  const idsToKeep = [...new Set([...validMemberIds, currentUser.id])];

  // Using a transaction to ensure safety
  await prisma.$transaction(async (tx) => {
    // 1. Remove members not in the new list
    await tx.groupMember.deleteMany({
      where: {
        groupId,
        userId: {
          notIn: idsToKeep,
        },
      },
    });

    // 2. Add members that are pending
    // We can use createMany with skipDuplicates if the DB supports it, or upsert.
    // simpler: find existing, filter, create new.
    const existingMembers = await tx.groupMember.findMany({
      where: {
        groupId,
        userId: { in: idsToKeep },
      },
      select: { userId: true },
    });

    const existingIds = existingMembers.map((m) => m.userId);
    const newIds = idsToKeep.filter((id) => !existingIds.includes(id));

    if (newIds.length > 0) {
      await tx.groupMember.createMany({
        data: newIds.map((userId) => ({
          groupId,
          userId,
        })),
      });
    }
  });

  revalidatePath("/chat");
}

export async function getUsers() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    throw new Error("Not authenticated");
  }

  // CRITICAL: Filter by companyId for multi-tenancy - users only see colleagues from same company
  const users = await prisma.user.findMany({
    where: {
      companyId: currentUser.companyId,
      id: {
        not: currentUser.id,
      },
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  });

  // Fetch last message for each user to sort or display timestamp
  // Optimization: Fetch all messages involving current user, order by desc,
  // then process in memory to find the latest "interaction" with each user.
  // This is better than N queries.
  const recentMessages = await prisma.message.findMany({
    where: {
      OR: [{ senderId: currentUser.id }, { receiverId: currentUser.id }],
      groupId: null, // Only DMs
    },
    orderBy: { createdAt: "desc" },
    select: {
      createdAt: true,
      senderId: true,
      receiverId: true,
    },
    // We can't easily limit per-user in Prisma without raw query,
    // but fetching metadata of recent 1000 messages is lightweight enough for now.
    take: 1000,
  });

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

  // Sort by last message (optional, but good UX)
  usersWithTimestamp.sort((a, b) => {
    if (a.lastMessageAt && b.lastMessageAt) {
      return b.lastMessageAt.getTime() - a.lastMessageAt.getTime();
    }
    if (a.lastMessageAt) return -1;
    if (b.lastMessageAt) return 1;
    return 0; // Keep original order if no messages
  });

  return usersWithTimestamp;
}

export async function createGroup(
  name: string,
  imageUrl: string,
  memberIds: number[],
) {
  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error("Not authenticated");

  // Filter out any invalid users or potentially the creator if included (we'll add creator manually)
  const validMemberIds = memberIds.filter((id) => id !== currentUser.id);

  const group = await prisma.group.create({
    data: {
      companyId: currentUser.companyId, // CRITICAL: Set companyId for multi-tenancy
      name,
      imageUrl,
      creatorId: currentUser.id,
      members: {
        create: [
          { userId: currentUser.id }, // Add creator
          ...validMemberIds.map((id) => ({ userId: id })), // Add other members
        ],
      },
    },
  });

  revalidatePath("/chat");
  return group;
}

export async function getGroups() {
  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error("Not authenticated");

  const groups = await prisma.group.findMany({
    where: {
      members: {
        some: {
          userId: currentUser.id,
        },
      },
    },
    include: {
      members: {
        include: {
          user: {
            select: { id: true, name: true },
          },
        },
      },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  return groups;
}

export async function getMessages(otherUserId: number) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    throw new Error("Not authenticated");
  }

  const messages = await prisma.message.findMany({
    where: {
      OR: [
        { senderId: currentUser.id, receiverId: otherUserId },
        { senderId: otherUserId, receiverId: currentUser.id },
      ],
      groupId: null, // Ensure we only get DMs
    },
    orderBy: {
      createdAt: "asc",
    },
    include: {
      sender: {
        select: { name: true },
      },
      receiver: {
        select: { name: true },
      },
    },
  });

  return messages;
}

export async function getGroupMessages(groupId: number) {
  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error("Not authenticated");

  // Verify membership
  const membership = await prisma.groupMember.findUnique({
    where: {
      groupId_userId: {
        groupId,
        userId: currentUser.id,
      },
    },
  });

  if (!membership) throw new Error("Not a member of this group");

  const messages = await prisma.message.findMany({
    where: {
      groupId,
    },
    orderBy: {
      createdAt: "asc",
    },
    include: {
      sender: {
        select: { name: true },
      },
    },
  });

  return messages;
}

export async function sendMessage(receiverId: number, content: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    throw new Error("Not authenticated");
  }

  if (!content.trim()) return;

  await prisma.message.create({
    data: {
      companyId: currentUser.companyId, // CRITICAL: Set companyId for multi-tenancy
      content,
      senderId: currentUser.id,
      receiverId,
    },
  });

  // --- REALTIME UPDATE ---
  try {
    const { redisPublisher } = await import("@/lib/redis");
    await redisPublisher.publish(
      `user:${receiverId}:chat`,
      JSON.stringify({ type: "new-message", senderId: currentUser.id }),
    );
  } catch (err) {
    console.error("Redis Publish Error", err);
  }
  // -----------------------

  revalidatePath("/chat");
}

export async function sendGroupMessage(groupId: number, content: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error("Not authenticated");

  if (!content.trim()) return;

  // Verify membership
  const membership = await prisma.groupMember.findUnique({
    where: {
      groupId_userId: {
        groupId,
        userId: currentUser.id,
      },
    },
  });

  if (!membership) throw new Error("Not a member of this group");

  await prisma.message.create({
    data: {
      companyId: currentUser.companyId, // CRITICAL: Set companyId for multi-tenancy
      content,
      senderId: currentUser.id,
      groupId,
      // receiverId is null
    },
  });

  revalidatePath("/chat");
}

export async function markAsRead(id: number, type: "user" | "group" = "user") {
  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error("Not authenticated");

  if (type === "user") {
    // Only for DMs
    await prisma.message.updateMany({
      where: {
        senderId: id,
        receiverId: currentUser.id,
        read: false,
      },
      data: {
        read: true,
      },
    });
  } else if (type === "group") {
    // For groups, we update the lastReadAt timestamp in GroupMember
    await prisma.groupMember.update({
      where: {
        groupId_userId: {
          groupId: id,
          userId: currentUser.id,
        },
      },
      data: {
        lastReadAt: new Date(),
      },
    });
  }

  // --- REALTIME UPDATE ---
  try {
    const { redisPublisher } = await import("@/lib/redis");
    // Notify the current user's clients that they have read messages
    // This allows the Navbar or other tabs to update their unread counts immediately
    await redisPublisher.publish(
      `user:${currentUser.id}:chat`,
      JSON.stringify({
        type: "messages-read",
        entityId: id,
        entityType: type,
      }),
    );
  } catch (err) {
    console.error("Redis Publish Error (markAsRead)", err);
  }
  // -----------------------

  revalidatePath("/chat");
}

export async function getUnreadCounts() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return [];

  // 1. Unread DMs
  const unreadDMs = await prisma.message.groupBy({
    by: ["senderId"],
    where: {
      receiverId: currentUser.id,
      read: false,
      groupId: null,
    },
    _count: {
      id: true,
    },
  });

  // 2. Unread Group Messages
  // We need to fetch groups the user is in, and their lastReadAt
  const userGroups = await prisma.groupMember.findMany({
    where: {
      userId: currentUser.id,
    },
    select: {
      groupId: true,
      lastReadAt: true,
    },
  });

  const unreadGroupsPromises = userGroups.map(async (membership) => {
    const count = await prisma.message.count({
      where: {
        groupId: membership.groupId,
        createdAt: {
          gt: membership.lastReadAt,
        },
        senderId: {
          not: currentUser.id, // Don't count my own messages
        },
      },
    });
    return {
      type: "group" as const,
      id: membership.groupId,
      count, // Flatten result later
    };
  });

  const unreadGroups = await Promise.all(unreadGroupsPromises);

  return [
    ...unreadDMs.map((dm) => ({
      type: "user" as const,
      id: dm.senderId,
      count: dm._count.id,
    })),
    ...unreadGroups.filter((g) => g.count > 0),
  ];
}

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────
vi.mock("@/lib/permissions-server", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({
  hasUserFlag: vi.fn(),
}));

const mockTx = {
  groupMember: {
    deleteMany: vi.fn(),
    findMany: vi.fn(),
    createMany: vi.fn(),
  },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findMany: vi.fn(), findFirst: vi.fn() },
    message: {
      findMany: vi.fn(),
      create: vi.fn(),
      groupBy: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    group: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    groupMember: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn((fn: any) => fn(mockTx)),
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  checkActionRateLimit: vi.fn(),
  RATE_LIMITS: {
    chatSend: { prefix: "chat-send", max: 30, windowSeconds: 60 },
    chatRead: { prefix: "chat-read", max: 60, windowSeconds: 60 },
    chatMutate: { prefix: "chat-mut", max: 10, windowSeconds: 60 },
    chatMark: { prefix: "chat-mark", max: 60, windowSeconds: 60 },
  },
}));

vi.mock("@/lib/db-retry", () => ({
  withRetry: vi.fn((fn: any) => fn()),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const mockPublish = vi.fn();
vi.mock("@/lib/redis", () => ({
  redisPublisher: { publish: mockPublish },
}));

const { mockLogError } = vi.hoisted(() => ({
  mockLogError: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: mockLogError,
  })),
}));

// ── Imports (after mocks) ────────────────────────────────────────────────
import {
  getUsers,
  getGroups,
  getMessages,
  getGroupMessages,
  sendMessage,
  sendGroupMessage,
  createGroup,
  updateGroup,
  markAsRead,
  getUnreadCounts,
} from "@/app/actions/chat";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { checkActionRateLimit } from "@/lib/rate-limit";
import { revalidatePath } from "next/cache";

// ── Fixtures ─────────────────────────────────────────────────────────────
const adminUser = {
  id: 1,
  companyId: 100,
  name: "Admin",
  email: "admin@test.com",
  role: "admin" as const,
  allowedWriteTableIds: [] as number[],
  permissions: {} as Record<string, boolean>,
};

const basicUserWithChat = {
  id: 2,
  companyId: 100,
  name: "ChatUser",
  email: "chat@test.com",
  role: "basic" as const,
  allowedWriteTableIds: [] as number[],
  permissions: { canViewChat: true } as Record<string, boolean>,
};

const basicUserNoChat = {
  id: 3,
  companyId: 100,
  name: "NoChat",
  email: "nochat@test.com",
  role: "basic" as const,
  allowedWriteTableIds: [] as number[],
  permissions: {} as Record<string, boolean>,
};

const companyBUser = {
  id: 50,
  companyId: 200,
  name: "CompanyB",
  email: "b@test.com",
  role: "admin" as const,
  allowedWriteTableIds: [] as number[],
  permissions: {} as Record<string, boolean>,
};

// ── Setup ────────────────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(hasUserFlag).mockReturnValue(true);
  vi.mocked(checkActionRateLimit).mockResolvedValue(false);
  vi.mocked(prisma.$transaction).mockImplementation((fn: any) => fn(mockTx));
  mockPublish.mockResolvedValue(undefined);
  mockTx.groupMember.deleteMany.mockResolvedValue({ count: 0 });
  mockTx.groupMember.findMany.mockResolvedValue([]);
  mockTx.groupMember.createMany.mockResolvedValue({ count: 0 });
});

/** Helper: set up authenticated admin user for most tests */
function setAdmin() {
  vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
}

// ── Shared Guard: requireChatUser ────────────────────────────────────────
describe("requireChatUser (shared guard)", () => {
  it("throws Unauthorized when no user is logged in", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(getUsers()).rejects.toThrow("Unauthorized");
  });

  it("throws Forbidden when user lacks canViewChat", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserNoChat as any);
    vi.mocked(hasUserFlag).mockReturnValue(false);
    await expect(getUsers()).rejects.toThrow("Forbidden");
  });

  it("throws Rate limit exceeded when rate-limited", async () => {
    setAdmin();
    vi.mocked(checkActionRateLimit).mockResolvedValue(true);
    await expect(getUsers()).rejects.toThrow("Rate limit exceeded");
  });

  it("proceeds when checkActionRateLimit throws (fail-open)", async () => {
    setAdmin();
    vi.mocked(checkActionRateLimit).mockRejectedValue(new Error("Redis down"));
    vi.mocked(prisma.user.findMany).mockResolvedValue([]);
    vi.mocked(prisma.message.findMany).mockResolvedValue([]);
    const result = await getUsers();
    expect(result).toEqual([]);
    expect(checkActionRateLimit).toHaveBeenCalledTimes(1);
  });

  it("calls hasUserFlag with 'canViewChat'", async () => {
    setAdmin();
    vi.mocked(prisma.user.findMany).mockResolvedValue([]);
    vi.mocked(prisma.message.findMany).mockResolvedValue([]);

    await getUsers();

    expect(hasUserFlag).toHaveBeenCalledWith(
      expect.objectContaining({ id: adminUser.id }),
      "canViewChat",
    );
  });
});

// ── Rate-limit key per function ──────────────────────────────────────────
describe("rate-limit key per function", () => {
  it("sendMessage uses chatSend rate limit", async () => {
    setAdmin();
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 2 } as any);
    vi.mocked(prisma.message.create).mockResolvedValue({} as any);

    await sendMessage(2, "Hello");

    expect(checkActionRateLimit).toHaveBeenCalledTimes(1);
    expect(checkActionRateLimit).toHaveBeenCalledWith(
      String(adminUser.id),
      expect.objectContaining({ prefix: "chat-send" }),
    );
  });

  it("createGroup uses chatMutate rate limit", async () => {
    setAdmin();
    vi.mocked(prisma.group.count).mockResolvedValue(0);
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 2 }] as any);
    vi.mocked(prisma.group.create).mockResolvedValue({
      id: 1, name: "T", imageUrl: "", creatorId: 1,
      createdAt: new Date(), updatedAt: new Date(),
    } as any);

    await createGroup("T", "", [2]);

    expect(checkActionRateLimit).toHaveBeenCalledTimes(1);
    expect(checkActionRateLimit).toHaveBeenCalledWith(
      String(adminUser.id),
      expect.objectContaining({ prefix: "chat-mut" }),
    );
  });

  it("markAsRead uses chatMark rate limit", async () => {
    setAdmin();
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 2 } as any);
    vi.mocked(prisma.message.updateMany).mockResolvedValue({ count: 1 } as any);

    await markAsRead(2, "user");

    expect(checkActionRateLimit).toHaveBeenCalledTimes(1);
    expect(checkActionRateLimit).toHaveBeenCalledWith(
      String(adminUser.id),
      expect.objectContaining({ prefix: "chat-mark" }),
    );
  });

  it("sendGroupMessage uses chatSend rate limit", async () => {
    setAdmin();
    vi.mocked(prisma.group.findFirst).mockResolvedValue({ id: 10 } as any);
    vi.mocked(prisma.groupMember.findUnique).mockResolvedValue({ groupId: 10, userId: 1 } as any);
    vi.mocked(prisma.message.create).mockResolvedValue({} as any);
    vi.mocked(prisma.groupMember.findMany).mockResolvedValue([{ userId: 1 }] as any);

    await sendGroupMessage(10, "Hello");

    expect(checkActionRateLimit).toHaveBeenCalledTimes(1);
    expect(checkActionRateLimit).toHaveBeenCalledWith(
      String(adminUser.id),
      expect.objectContaining({ prefix: "chat-send" }),
    );
  });

  it("updateGroup uses chatMutate rate limit", async () => {
    setAdmin();
    vi.mocked(prisma.group.findFirst).mockResolvedValue({ id: 10 } as any);
    vi.mocked(prisma.groupMember.findUnique).mockResolvedValue({ groupId: 10, userId: 1 } as any);
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 2 }] as any);
    vi.mocked(prisma.group.update).mockResolvedValue({} as any);
    mockTx.groupMember.findMany.mockResolvedValue([{ userId: 1 }, { userId: 2 }]);

    await updateGroup(10, "T", "", [2]);

    expect(checkActionRateLimit).toHaveBeenCalledTimes(1);
    expect(checkActionRateLimit).toHaveBeenCalledWith(
      String(adminUser.id),
      expect.objectContaining({ prefix: "chat-mut" }),
    );
  });
});

// ── getUsers ─────────────────────────────────────────────────────────────
describe("getUsers", () => {
  it("returns users from same company excluding current user", async () => {
    setAdmin();
    const users = [
      { id: 2, name: "Alice", role: "basic" },
      { id: 3, name: "Bob", role: "basic" },
    ];
    vi.mocked(prisma.user.findMany).mockResolvedValue(users as any);
    vi.mocked(prisma.message.findMany).mockResolvedValue([]);

    const result = await getUsers();
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: 2, name: "Alice" });
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: 100, id: { not: 1 } },
      }),
    );
  });

  it("sorts users with recent messages before those without", async () => {
    setAdmin();
    const users = [
      { id: 2, name: "Alice", role: "basic" },
      { id: 3, name: "Bob", role: "basic" },
      { id: 4, name: "Carol", role: "basic" },
    ];
    vi.mocked(prisma.user.findMany).mockResolvedValue(users as any);
    vi.mocked(prisma.message.findMany).mockResolvedValue([
      { senderId: 3, receiverId: 1, createdAt: new Date("2025-01-02") },
      { senderId: 1, receiverId: 2, createdAt: new Date("2025-01-01") },
    ] as any);

    const result = await getUsers();
    // Bob (Jan 2) first, Alice (Jan 1) second, Carol (no msg) last
    expect(result[0].id).toBe(3);
    expect(result[1].id).toBe(2);
    expect(result[2].id).toBe(4);
    expect(result[2].lastMessageAt).toBeNull();
  });

  it("preserves relative order when both users have no messages", async () => {
    setAdmin();
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 2, name: "Alice", role: "basic" },
      { id: 3, name: "Bob", role: "basic" },
    ] as any);
    vi.mocked(prisma.message.findMany).mockResolvedValue([]);

    const result = await getUsers();
    expect(result[0].id).toBe(2);
    expect(result[1].id).toBe(3);
    expect(result[0].lastMessageAt).toBeNull();
    expect(result[1].lastMessageAt).toBeNull();
  });

  it("propagates DB errors from user.findMany", async () => {
    setAdmin();
    vi.mocked(prisma.user.findMany).mockRejectedValue(new Error("DB error"));

    await expect(getUsers()).rejects.toThrow("DB error");
  });
});

// ── getGroups ────────────────────────────────────────────────────────────
describe("getGroups", () => {
  it("returns only groups where current user is a member", async () => {
    setAdmin();
    const groups = [
      {
        id: 10,
        name: "Dev Team",
        imageUrl: "",
        creatorId: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        members: [{ userId: 1, lastReadAt: null, user: { id: 1, name: "Admin" } }],
        messages: [],
      },
    ];
    vi.mocked(prisma.group.findMany).mockResolvedValue(groups as any);

    const result = await getGroups();
    expect(result).toEqual(groups);
    expect(prisma.group.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          companyId: 100,
          members: { some: { userId: 1 } },
        },
      }),
    );
  });

  it("requests members and last message in Prisma select", async () => {
    setAdmin();
    vi.mocked(prisma.group.findMany).mockResolvedValue([]);

    await getGroups();

    expect(prisma.group.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          members: expect.objectContaining({
            select: expect.objectContaining({ userId: true, lastReadAt: true }),
          }),
          messages: expect.objectContaining({
            orderBy: { createdAt: "desc" },
            take: 1,
          }),
        }),
      }),
    );
  });

  it("propagates DB errors from group.findMany", async () => {
    setAdmin();
    vi.mocked(prisma.group.findMany).mockRejectedValue(new Error("DB error"));

    await expect(getGroups()).rejects.toThrow("DB error");
  });
});

// ── Resource Limits (take clauses) ────────────────────────────────────────
describe("resource limits (take clauses)", () => {
  it("getUsers limits users to 500 and messages to 1000", async () => {
    setAdmin();
    vi.mocked(prisma.user.findMany).mockResolvedValue([]);
    vi.mocked(prisma.message.findMany).mockResolvedValue([]);
    await getUsers();
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 500 }),
    );
    expect(prisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 1000 }),
    );
  });

  it("getGroups limits to 500 groups with nested limits", async () => {
    setAdmin();
    vi.mocked(prisma.group.findMany).mockResolvedValue([]);
    await getGroups();
    const call = vi.mocked(prisma.group.findMany).mock.calls[0][0] as any;
    expect(call.take).toBe(500);
    expect(call.select.members.take).toBe(50);
    expect(call.select.messages.take).toBe(1);
  });

  it("getMessages limits to 1000 messages", async () => {
    setAdmin();
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 2 } as any);
    vi.mocked(prisma.message.findMany).mockResolvedValue([]);
    await getMessages(2);
    expect(prisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 1000 }),
    );
  });

  it("getGroupMessages limits to 1000 messages", async () => {
    setAdmin();
    vi.mocked(prisma.group.findFirst).mockResolvedValue({ id: 10 } as any);
    vi.mocked(prisma.groupMember.findUnique).mockResolvedValue({ groupId: 10, userId: 1 } as any);
    vi.mocked(prisma.message.findMany).mockResolvedValue([]);
    await getGroupMessages(10);
    expect(prisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 1000 }),
    );
  });

  it("getUnreadCounts limits group memberships to 200", async () => {
    setAdmin();
    vi.mocked(prisma.message.groupBy).mockResolvedValue([]);
    vi.mocked(prisma.groupMember.findMany).mockResolvedValue([]);
    await getUnreadCounts();
    expect(prisma.groupMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 200 }),
    );
  });
});

// ── Cross-tenant isolation ────────────────────────────────────────────────
describe("cross-tenant isolation", () => {
  it("getUsers uses the current user companyId, not hardcoded", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(companyBUser as any);
    vi.mocked(prisma.user.findMany).mockResolvedValue([]);
    vi.mocked(prisma.message.findMany).mockResolvedValue([]);
    await getUsers();
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: 200, id: { not: 50 } },
      }),
    );
  });

  it("sendMessage uses the current user companyId in message.create", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(companyBUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 51 } as any);
    vi.mocked(prisma.message.create).mockResolvedValue({} as any);
    await sendMessage(51, "Hello");
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 51, companyId: 200 },
      }),
    );
    expect(prisma.message.create).toHaveBeenCalledWith({
      data: { companyId: 200, content: "Hello", senderId: 50, receiverId: 51 },
    });
  });

  it("createGroup uses the current user companyId", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(companyBUser as any);
    vi.mocked(prisma.group.count).mockResolvedValue(0);
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 51 }] as any);
    vi.mocked(prisma.group.create).mockResolvedValue({
      id: 1, name: "T", imageUrl: "", creatorId: 50,
      createdAt: new Date(), updatedAt: new Date(),
    } as any);
    await createGroup("T", "", [51]);
    expect(prisma.group.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ companyId: 200, creatorId: 50 }),
      }),
    );
  });

  it("updateGroup uses the current user companyId in group lookup and update", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(companyBUser as any);
    vi.mocked(prisma.group.findFirst).mockResolvedValue({ id: 10 } as any);
    vi.mocked(prisma.groupMember.findUnique).mockResolvedValue({ groupId: 10, userId: 50 } as any);
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 51 }] as any);
    vi.mocked(prisma.group.update).mockResolvedValue({} as any);
    mockTx.groupMember.findMany.mockResolvedValue([{ userId: 50 }, { userId: 51 }]);

    await updateGroup(10, "T", "", [51]);

    expect(prisma.group.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 10, companyId: 200 } }),
    );
    expect(prisma.group.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 10, companyId: 200 } }),
    );
  });

  it("updateGroup uses companyId in tx.groupMember.createMany for new members", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(companyBUser as any);
    vi.mocked(prisma.group.findFirst).mockResolvedValue({ id: 10 } as any);
    vi.mocked(prisma.groupMember.findUnique).mockResolvedValue({ groupId: 10, userId: 50 } as any);
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 51 }] as any);
    vi.mocked(prisma.group.update).mockResolvedValue({} as any);
    // Only current user exists — user 51 needs to be created
    mockTx.groupMember.findMany.mockResolvedValue([{ userId: 50 }]);
    mockTx.groupMember.createMany.mockResolvedValue({ count: 1 });

    await updateGroup(10, "T", "", [51]);

    expect(mockTx.groupMember.createMany).toHaveBeenCalledWith({
      data: [{ groupId: 10, userId: 51, companyId: 200 }],
    });
  });

  it("sendGroupMessage uses the current user companyId in message.create", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(companyBUser as any);
    vi.mocked(prisma.group.findFirst).mockResolvedValue({ id: 10 } as any);
    vi.mocked(prisma.groupMember.findUnique).mockResolvedValue({ groupId: 10, userId: 50 } as any);
    vi.mocked(prisma.message.create).mockResolvedValue({} as any);
    vi.mocked(prisma.groupMember.findMany).mockResolvedValue([{ userId: 50 }] as any);

    await sendGroupMessage(10, "Hello");

    expect(prisma.message.create).toHaveBeenCalledWith({
      data: { companyId: 200, content: "Hello", senderId: 50, groupId: 10 },
    });
  });

  it("getGroups uses the current user companyId", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(companyBUser as any);
    vi.mocked(prisma.group.findMany).mockResolvedValue([]);

    await getGroups();

    expect(prisma.group.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          companyId: 200,
          members: { some: { userId: 50 } },
        },
      }),
    );
  });

  it("getMessages uses the current user companyId in user lookup", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(companyBUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 51 } as any);
    vi.mocked(prisma.message.findMany).mockResolvedValue([]);

    await getMessages(51);

    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 51, companyId: 200 },
      }),
    );
    expect(prisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { senderId: 50, receiverId: 51 },
            { senderId: 51, receiverId: 50 },
          ],
        }),
      }),
    );
  });

  it("getGroupMessages uses the current user companyId", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(companyBUser as any);
    vi.mocked(prisma.group.findFirst).mockResolvedValue({ id: 10 } as any);
    vi.mocked(prisma.groupMember.findUnique).mockResolvedValue({ groupId: 10, userId: 50 } as any);
    vi.mocked(prisma.message.findMany).mockResolvedValue([]);

    await getGroupMessages(10);

    expect(prisma.group.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 10, companyId: 200 },
      }),
    );
    expect(prisma.groupMember.findUnique).toHaveBeenCalledWith({
      where: { groupId_userId: { groupId: 10, userId: 50 } },
    });
  });

  it("getUnreadCounts uses the current user companyId in group membership query", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(companyBUser as any);
    vi.mocked(prisma.message.groupBy).mockResolvedValue([]);
    vi.mocked(prisma.groupMember.findMany).mockResolvedValue([]);

    await getUnreadCounts();

    expect(prisma.groupMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 50,
          group: { companyId: 200 },
        }),
      }),
    );
    expect(prisma.message.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ receiverId: 50 }),
      }),
    );
  });
});

// ── withRetry wrapping verification ──────────────────────────────────────
describe("withRetry wrapping", () => {
  it("getUsers wraps both DB calls in withRetry", async () => {
    setAdmin();
    vi.mocked(prisma.user.findMany).mockResolvedValue([]);
    vi.mocked(prisma.message.findMany).mockResolvedValue([]);
    const { withRetry } = await import("@/lib/db-retry");

    await getUsers();

    expect(withRetry).toHaveBeenCalledTimes(2);
  });

  it("sendMessage wraps both DB calls in withRetry", async () => {
    setAdmin();
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 2 } as any);
    vi.mocked(prisma.message.create).mockResolvedValue({} as any);
    const { withRetry } = await import("@/lib/db-retry");

    await sendMessage(2, "Hello");

    expect(withRetry).toHaveBeenCalledTimes(2);
  });
});

// ── withRetry inconsistencies (documenting source behavior) ──────────────
describe("withRetry inconsistencies (documenting source behavior)", () => {
  it("updateGroup: group.update is NOT wrapped in withRetry", async () => {
    setAdmin();
    vi.mocked(prisma.group.findFirst).mockResolvedValue({ id: 10 } as any);
    vi.mocked(prisma.groupMember.findUnique).mockResolvedValue({ groupId: 10, userId: 1 } as any);
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 2 }] as any);
    vi.mocked(prisma.group.update).mockResolvedValue({} as any);
    mockTx.groupMember.findMany.mockResolvedValue([{ userId: 1 }, { userId: 2 }]);
    const { withRetry } = await import("@/lib/db-retry");

    await updateGroup(10, "T", "", [2]);

    // withRetry wraps: group.findFirst, groupMember.findUnique, user.findMany, $transaction
    // group.update is NOT wrapped (4 calls, not 5)
    expect(withRetry).toHaveBeenCalledTimes(4);
  });

  it("createGroup: group.create is NOT wrapped in withRetry", async () => {
    setAdmin();
    vi.mocked(prisma.group.count).mockResolvedValue(0);
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 2 }] as any);
    vi.mocked(prisma.group.create).mockResolvedValue({
      id: 1, name: "T", imageUrl: "", creatorId: 1,
      createdAt: new Date(), updatedAt: new Date(),
    } as any);
    const { withRetry } = await import("@/lib/db-retry");

    await createGroup("T", "", [2]);

    // withRetry wraps: group.count, user.findMany
    // group.create is NOT wrapped (2 calls, not 3)
    expect(withRetry).toHaveBeenCalledTimes(2);
  });

  it("markAsRead(user): message.updateMany is NOT wrapped in withRetry", async () => {
    setAdmin();
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 2 } as any);
    vi.mocked(prisma.message.updateMany).mockResolvedValue({ count: 1 } as any);
    const { withRetry } = await import("@/lib/db-retry");

    await markAsRead(2, "user");

    // withRetry wraps: user.findFirst only
    // message.updateMany is NOT wrapped (1 call, not 2)
    expect(withRetry).toHaveBeenCalledTimes(1);
  });

  it("markAsRead(group): groupMember.update is NOT wrapped in withRetry", async () => {
    setAdmin();
    vi.mocked(prisma.group.findFirst).mockResolvedValue({ id: 10 } as any);
    vi.mocked(prisma.groupMember.update).mockResolvedValue({} as any);
    const { withRetry } = await import("@/lib/db-retry");

    await markAsRead(10, "group");

    // withRetry wraps: group.findFirst only
    // groupMember.update is NOT wrapped (1 call, not 2)
    expect(withRetry).toHaveBeenCalledTimes(1);
  });
});

// ── getMessages ──────────────────────────────────────────────────────────
describe("getMessages", () => {
  it("throws Invalid input for non-positive integer", async () => {
    setAdmin();
    await expect(getMessages(0)).rejects.toThrow("Invalid input");
    await expect(getMessages(-1)).rejects.toThrow("Invalid input");
    await expect(getMessages(1.5)).rejects.toThrow("Invalid input");
  });

  it("throws when other user not in same company", async () => {
    setAdmin();
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
    await expect(getMessages(99)).rejects.toThrow("User not found or access denied");
  });

  it("returns DM messages ordered by createdAt asc", async () => {
    setAdmin();
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 2 } as any);
    const msgs = [
      { id: 1, content: "Hi", senderId: 1, receiverId: 2, read: false, createdAt: new Date("2025-01-01"), sender: { name: "Admin" }, receiver: { name: "Alice" } },
      { id: 2, content: "Hey", senderId: 2, receiverId: 1, read: false, createdAt: new Date("2025-01-02"), sender: { name: "Alice" }, receiver: { name: "Admin" } },
    ];
    vi.mocked(prisma.message.findMany).mockResolvedValue(msgs as any);

    const result = await getMessages(2);
    expect(result).toEqual(msgs);
    expect(prisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: "asc" } }),
    );
    expect(prisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          groupId: null,
          OR: expect.arrayContaining([
            { senderId: 1, receiverId: 2 },
            { senderId: 2, receiverId: 1 },
          ]),
        }),
      }),
    );
    const msgCall = vi.mocked(prisma.message.findMany).mock.calls[0][0] as any;
    expect(msgCall.where.OR).toHaveLength(2);
  });

  it("propagates DB errors from message.findMany", async () => {
    setAdmin();
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 2 } as any);
    vi.mocked(prisma.message.findMany).mockRejectedValue(new Error("DB error"));

    await expect(getMessages(2)).rejects.toThrow("DB error");
  });
});

// ── getGroupMessages ─────────────────────────────────────────────────────
describe("getGroupMessages", () => {
  it("throws Invalid input for non-positive integer", async () => {
    setAdmin();
    await expect(getGroupMessages(0)).rejects.toThrow("Invalid input");
    await expect(getGroupMessages(-5)).rejects.toThrow("Invalid input");
  });

  it("throws when group not in company", async () => {
    setAdmin();
    vi.mocked(prisma.group.findFirst).mockResolvedValue(null);
    await expect(getGroupMessages(99)).rejects.toThrow("Group not found or access denied");
  });

  it("throws when user not a member", async () => {
    setAdmin();
    vi.mocked(prisma.group.findFirst).mockResolvedValue({ id: 10 } as any);
    vi.mocked(prisma.groupMember.findUnique).mockResolvedValue(null);
    await expect(getGroupMessages(10)).rejects.toThrow("Group not found or access denied");
  });

  it("returns group messages ordered by createdAt asc", async () => {
    setAdmin();
    vi.mocked(prisma.group.findFirst).mockResolvedValue({ id: 10 } as any);
    vi.mocked(prisma.groupMember.findUnique).mockResolvedValue({ groupId: 10, userId: 1 } as any);
    const msgs = [
      { id: 1, content: "Hello group", senderId: 1, groupId: 10, createdAt: new Date(), sender: { name: "Admin" } },
    ];
    vi.mocked(prisma.message.findMany).mockResolvedValue(msgs as any);

    const result = await getGroupMessages(10);
    expect(result).toEqual(msgs);
    expect(prisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { groupId: 10 },
        orderBy: { createdAt: "asc" },
      }),
    );
  });

  it("propagates DB errors from message.findMany", async () => {
    setAdmin();
    vi.mocked(prisma.group.findFirst).mockResolvedValue({ id: 10 } as any);
    vi.mocked(prisma.groupMember.findUnique).mockResolvedValue({ groupId: 10, userId: 1 } as any);
    vi.mocked(prisma.message.findMany).mockRejectedValue(new Error("DB error"));

    await expect(getGroupMessages(10)).rejects.toThrow("DB error");
  });
});

// ── sendMessage ──────────────────────────────────────────────────────────
describe("sendMessage", () => {
  it("throws Invalid input for empty content", async () => {
    setAdmin();
    await expect(sendMessage(2, "")).rejects.toThrow("Invalid input");
  });

  it("throws Invalid input for whitespace-only content", async () => {
    setAdmin();
    await expect(sendMessage(2, "   ")).rejects.toThrow("Invalid input");
  });

  it("throws Invalid input when sending to self", async () => {
    setAdmin();
    await expect(sendMessage(1, "Hello")).rejects.toThrow("Invalid input");
  });

  it("throws when receiver not in same company", async () => {
    setAdmin();
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
    await expect(sendMessage(99, "Hello")).rejects.toThrow("User not found or access denied");
  });

  it("creates message and publishes Redis event on success", async () => {
    setAdmin();
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 2 } as any);
    vi.mocked(prisma.message.create).mockResolvedValue({} as any);

    await sendMessage(2, "Hello");

    expect(prisma.message.create).toHaveBeenCalledWith({
      data: {
        companyId: 100,
        content: "Hello",
        senderId: 1,
        receiverId: 2,
      },
    });
    expect(mockPublish).toHaveBeenCalledWith(
      "company:100:user:2:chat",
      JSON.stringify({ type: "new-message", senderId: 1 }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/chat");
  });

  it("does not throw when Redis publish fails (graceful degradation)", async () => {
    setAdmin();
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 2 } as any);
    vi.mocked(prisma.message.create).mockResolvedValue({} as any);
    mockPublish.mockRejectedValue(new Error("Redis down"));

    await expect(sendMessage(2, "Hello")).resolves.toBeUndefined();
    expect(revalidatePath).toHaveBeenCalledWith("/chat");
    expect(mockLogError).toHaveBeenCalledWith(
      "Redis publish error",
      expect.objectContaining({ error: expect.any(String) }),
    );
  });

  it("trims content before storing", async () => {
    setAdmin();
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 2 } as any);
    vi.mocked(prisma.message.create).mockResolvedValue({} as any);

    await sendMessage(2, "  Hello  ");

    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ content: "Hello" }),
      }),
    );
  });

  it("throws Invalid input for non-positive receiverId", async () => {
    setAdmin();
    await expect(sendMessage(0, "Hello")).rejects.toThrow("Invalid input");
    await expect(sendMessage(-1, "Hello")).rejects.toThrow("Invalid input");
  });

  it("propagates DB errors and skips side effects", async () => {
    setAdmin();
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 2 } as any);
    vi.mocked(prisma.message.create).mockRejectedValue(new Error("DB connection lost"));

    await expect(sendMessage(2, "Hello")).rejects.toThrow("DB connection lost");
    expect(mockPublish).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("does not call revalidatePath or Redis when receiver not found", async () => {
    setAdmin();
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);

    await expect(sendMessage(99, "Hello")).rejects.toThrow("User not found or access denied");
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it("succeeds for non-admin user with canViewChat permission", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserWithChat as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 3 } as any);
    vi.mocked(prisma.message.create).mockResolvedValue({} as any);

    await sendMessage(3, "Hello from basic user");

    expect(prisma.message.create).toHaveBeenCalledWith({
      data: {
        companyId: 100,
        content: "Hello from basic user",
        senderId: 2,
        receiverId: 3,
      },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/chat");
  });
});

// ── sendGroupMessage ─────────────────────────────────────────────────────
describe("sendGroupMessage", () => {
  it("throws Invalid input for empty content", async () => {
    setAdmin();
    await expect(sendGroupMessage(10, "")).rejects.toThrow("Invalid input");
  });

  it("throws Invalid input for whitespace-only content", async () => {
    setAdmin();
    await expect(sendGroupMessage(10, "   \t\n  ")).rejects.toThrow("Invalid input");
  });

  it("throws when group not in company", async () => {
    setAdmin();
    vi.mocked(prisma.group.findFirst).mockResolvedValue(null);
    await expect(sendGroupMessage(10, "Hello")).rejects.toThrow("Group not found or access denied");
  });

  it("throws when user not a member", async () => {
    setAdmin();
    vi.mocked(prisma.group.findFirst).mockResolvedValue({ id: 10 } as any);
    vi.mocked(prisma.groupMember.findUnique).mockResolvedValue(null);
    await expect(sendGroupMessage(10, "Hello")).rejects.toThrow("Group not found or access denied");
  });

  it("creates message and broadcasts Redis to all other members", async () => {
    setAdmin();
    vi.mocked(prisma.group.findFirst).mockResolvedValue({ id: 10 } as any);
    vi.mocked(prisma.groupMember.findUnique).mockResolvedValue({ groupId: 10, userId: 1 } as any);
    vi.mocked(prisma.message.create).mockResolvedValue({} as any);
    vi.mocked(prisma.groupMember.findMany).mockResolvedValue([
      { userId: 1 },
      { userId: 2 },
      { userId: 3 },
    ] as any);

    await sendGroupMessage(10, "Hello group");

    expect(prisma.message.create).toHaveBeenCalledWith({
      data: {
        companyId: 100,
        content: "Hello group",
        senderId: 1,
        groupId: 10,
      },
    });
    // Should publish to user 2 and 3, NOT user 1 (sender)
    expect(mockPublish).toHaveBeenCalledTimes(2);
    expect(mockPublish).toHaveBeenCalledWith(
      "company:100:user:2:chat",
      JSON.stringify({ type: "new-group-message", groupId: 10, senderId: 1 }),
    );
    expect(mockPublish).toHaveBeenCalledWith(
      "company:100:user:3:chat",
      JSON.stringify({ type: "new-group-message", groupId: 10, senderId: 1 }),
    );
    expect(prisma.groupMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 500 }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/chat");
  });

  it("does not throw when Redis publish fails (graceful degradation)", async () => {
    setAdmin();
    vi.mocked(prisma.group.findFirst).mockResolvedValue({ id: 10 } as any);
    vi.mocked(prisma.groupMember.findUnique).mockResolvedValue({ groupId: 10, userId: 1 } as any);
    vi.mocked(prisma.message.create).mockResolvedValue({} as any);
    vi.mocked(prisma.groupMember.findMany).mockResolvedValue([
      { userId: 1 },
      { userId: 2 },
    ] as any);
    mockPublish.mockRejectedValue(new Error("Redis down"));

    await expect(sendGroupMessage(10, "Hello")).resolves.toBeUndefined();
    expect(prisma.message.create).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith("/chat");
    expect(mockLogError).toHaveBeenCalledWith(
      "Redis publish error (group)",
      expect.objectContaining({ error: expect.any(String) }),
    );
  });

  it("trims content before storing", async () => {
    setAdmin();
    vi.mocked(prisma.group.findFirst).mockResolvedValue({ id: 10 } as any);
    vi.mocked(prisma.groupMember.findUnique).mockResolvedValue({ groupId: 10, userId: 1 } as any);
    vi.mocked(prisma.message.create).mockResolvedValue({} as any);
    vi.mocked(prisma.groupMember.findMany).mockResolvedValue([{ userId: 1 }] as any);

    await sendGroupMessage(10, "  Hello  ");

    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ content: "Hello" }),
      }),
    );
  });

  it("throws Invalid input for non-positive groupId", async () => {
    setAdmin();
    await expect(sendGroupMessage(0, "Hello")).rejects.toThrow("Invalid input");
    await expect(sendGroupMessage(-1, "Hello")).rejects.toThrow("Invalid input");
  });

  it("publishes to no one when sender is only member", async () => {
    setAdmin();
    vi.mocked(prisma.group.findFirst).mockResolvedValue({ id: 10 } as any);
    vi.mocked(prisma.groupMember.findUnique).mockResolvedValue({ groupId: 10, userId: 1 } as any);
    vi.mocked(prisma.message.create).mockResolvedValue({} as any);
    vi.mocked(prisma.groupMember.findMany).mockResolvedValue([
      { userId: 1 },
    ] as any);

    await sendGroupMessage(10, "Hello");

    expect(mockPublish).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/chat");
  });

  it("propagates DB errors and skips side effects", async () => {
    setAdmin();
    vi.mocked(prisma.group.findFirst).mockResolvedValue({ id: 10 } as any);
    vi.mocked(prisma.groupMember.findUnique).mockResolvedValue({ groupId: 10, userId: 1 } as any);
    vi.mocked(prisma.message.create).mockRejectedValue(new Error("DB connection lost"));

    await expect(sendGroupMessage(10, "Hello")).rejects.toThrow("DB connection lost");
    expect(mockPublish).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("catches partial Redis publish failure via Promise.all", async () => {
    setAdmin();
    vi.mocked(prisma.group.findFirst).mockResolvedValue({ id: 10 } as any);
    vi.mocked(prisma.groupMember.findUnique).mockResolvedValue({ groupId: 10, userId: 1 } as any);
    vi.mocked(prisma.message.create).mockResolvedValue({} as any);
    vi.mocked(prisma.groupMember.findMany).mockResolvedValue([
      { userId: 1 },
      { userId: 2 },
      { userId: 3 },
    ] as any);
    mockPublish
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("Publish failed for user 3"));

    await expect(sendGroupMessage(10, "Hello")).resolves.toBeUndefined();
    expect(prisma.message.create).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith("/chat");
    expect(mockLogError).toHaveBeenCalledWith(
      "Redis publish error (group)",
      expect.objectContaining({ error: expect.any(String) }),
    );
  });

  it("handles member-fetch error inside Redis try/catch gracefully", async () => {
    setAdmin();
    vi.mocked(prisma.group.findFirst).mockResolvedValue({ id: 10 } as any);
    vi.mocked(prisma.groupMember.findUnique).mockResolvedValue({ groupId: 10, userId: 1 } as any);
    vi.mocked(prisma.message.create).mockResolvedValue({} as any);
    vi.mocked(prisma.groupMember.findMany).mockRejectedValue(new Error("DB error in member fetch"));

    await expect(sendGroupMessage(10, "Hello")).resolves.toBeUndefined();
    expect(prisma.message.create).toHaveBeenCalledTimes(1);
    expect(mockPublish).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/chat");
    expect(mockLogError).toHaveBeenCalledWith(
      "Redis publish error (group)",
      expect.objectContaining({ error: expect.any(String) }),
    );
  });
});

// ── createGroup ──────────────────────────────────────────────────────────
describe("createGroup", () => {
  it("throws Invalid input for empty name", async () => {
    setAdmin();
    await expect(createGroup("", "", [2])).rejects.toThrow("Invalid input");
  });

  it("throws Invalid input for name over 100 chars", async () => {
    setAdmin();
    await expect(createGroup("a".repeat(101), "", [2])).rejects.toThrow("Invalid input");
  });

  it("throws Invalid input for empty memberIds", async () => {
    setAdmin();
    await expect(createGroup("Team", "", [])).rejects.toThrow("Invalid input");
  });

  it("throws Group limit reached when company has 200+ groups", async () => {
    setAdmin();
    vi.mocked(prisma.group.count).mockResolvedValue(200);
    await expect(createGroup("Team", "", [2])).rejects.toThrow("Group limit reached");
  });

  it("allows creating group when company has 199 groups", async () => {
    setAdmin();
    vi.mocked(prisma.group.count).mockResolvedValue(199);
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 2 }] as any);
    vi.mocked(prisma.group.create).mockResolvedValue({
      id: 200, name: "Team", imageUrl: "", creatorId: 1,
      createdAt: new Date(), updatedAt: new Date(),
    } as any);
    await expect(createGroup("Team", "", [2])).resolves.toBeDefined();
  });

  it("sanitizes imageUrl (strips javascript: protocol)", async () => {
    setAdmin();
    vi.mocked(prisma.group.count).mockResolvedValue(0);
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 2 }] as any);
    vi.mocked(prisma.group.create).mockResolvedValue({
      id: 1, name: "Team", imageUrl: "", creatorId: 1,
      createdAt: new Date(), updatedAt: new Date(),
    } as any);

    await createGroup("Team", "javascript:alert(1)", [2]);

    expect(prisma.group.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ imageUrl: "" }),
      }),
    );
  });

  it("sanitizes data: URLs", async () => {
    setAdmin();
    vi.mocked(prisma.group.count).mockResolvedValue(0);
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 2 }] as any);
    vi.mocked(prisma.group.create).mockResolvedValue({
      id: 1, name: "Team", imageUrl: "", creatorId: 1,
      createdAt: new Date(), updatedAt: new Date(),
    } as any);

    await createGroup("Team", "data:text/html,<script>alert(1)</script>", [2]);

    expect(prisma.group.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ imageUrl: "" }),
      }),
    );
  });

  it("sanitizes ftp: protocol URLs", async () => {
    setAdmin();
    vi.mocked(prisma.group.count).mockResolvedValue(0);
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 2 }] as any);
    vi.mocked(prisma.group.create).mockResolvedValue({
      id: 1, name: "Team", imageUrl: "", creatorId: 1,
      createdAt: new Date(), updatedAt: new Date(),
    } as any);
    await createGroup("Team", "ftp://evil.com/payload", [2]);
    expect(prisma.group.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ imageUrl: "" }),
      }),
    );
  });

  it("sanitizes non-parseable URL strings", async () => {
    setAdmin();
    vi.mocked(prisma.group.count).mockResolvedValue(0);
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 2 }] as any);
    vi.mocked(prisma.group.create).mockResolvedValue({
      id: 1, name: "Team", imageUrl: "", creatorId: 1,
      createdAt: new Date(), updatedAt: new Date(),
    } as any);
    await createGroup("Team", "not a valid url", [2]);
    expect(prisma.group.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ imageUrl: "" }),
      }),
    );
  });

  it("filters out cross-company member IDs", async () => {
    setAdmin();
    vi.mocked(prisma.group.count).mockResolvedValue(0);
    // Only user 2 is verified (same company); user 99 is not
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 2 }] as any);
    vi.mocked(prisma.group.create).mockResolvedValue({
      id: 1, name: "Team", imageUrl: "", creatorId: 1,
      createdAt: new Date(), updatedAt: new Date(),
    } as any);

    await createGroup("Team", "", [2, 99]);

    expect(prisma.group.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          members: {
            create: expect.arrayContaining([
              { userId: 1, companyId: 100 },
              { userId: 2, companyId: 100 },
            ]),
          },
        }),
      }),
    );
    // Should only have 2 members (current user + verified user 2), not 99
    const call = vi.mocked(prisma.group.create).mock.calls[0][0] as any;
    expect(call.data.members.create).toHaveLength(2);
  });

  it("creates group with current user always as member", async () => {
    setAdmin();
    vi.mocked(prisma.group.count).mockResolvedValue(0);
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 2 }] as any);
    vi.mocked(prisma.group.create).mockResolvedValue({
      id: 1, name: "Team", imageUrl: "", creatorId: 1,
      createdAt: new Date(), updatedAt: new Date(),
    } as any);

    const result = await createGroup("Team", "", [2]);

    expect(result).toMatchObject({ id: 1, name: "Team" });
    const call = vi.mocked(prisma.group.create).mock.calls[0][0] as any;
    const memberUserIds = call.data.members.create.map((m: any) => m.userId);
    expect(memberUserIds).toContain(1); // current user
    expect(prisma.group.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ companyId: 100 }),
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/chat");
  });

  it("allows valid https imageUrl", async () => {
    setAdmin();
    vi.mocked(prisma.group.count).mockResolvedValue(0);
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 2 }] as any);
    vi.mocked(prisma.group.create).mockResolvedValue({
      id: 1, name: "Team", imageUrl: "https://example.com/img.png", creatorId: 1,
      createdAt: new Date(), updatedAt: new Date(),
    } as any);

    await createGroup("Team", "https://example.com/img.png", [2]);

    expect(prisma.group.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ imageUrl: "https://example.com/img.png" }),
      }),
    );
  });

  it("allows valid http imageUrl", async () => {
    setAdmin();
    vi.mocked(prisma.group.count).mockResolvedValue(0);
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 2 }] as any);
    vi.mocked(prisma.group.create).mockResolvedValue({
      id: 1, name: "Team", imageUrl: "http://example.com/img.png", creatorId: 1,
      createdAt: new Date(), updatedAt: new Date(),
    } as any);

    await createGroup("Team", "http://example.com/img.png", [2]);

    expect(prisma.group.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ imageUrl: "http://example.com/img.png" }),
      }),
    );
  });

  it("sets creatorId to current user", async () => {
    setAdmin();
    vi.mocked(prisma.group.count).mockResolvedValue(0);
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 2 }] as any);
    vi.mocked(prisma.group.create).mockResolvedValue({
      id: 1, name: "T", imageUrl: "", creatorId: 1,
      createdAt: new Date(), updatedAt: new Date(),
    } as any);

    await createGroup("T", "", [2]);

    expect(prisma.group.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ creatorId: 1 }),
      }),
    );
  });

  it("creates group with only current user when all memberIds are cross-company", async () => {
    setAdmin();
    vi.mocked(prisma.group.count).mockResolvedValue(0);
    vi.mocked(prisma.user.findMany).mockResolvedValue([]); // none verified
    vi.mocked(prisma.group.create).mockResolvedValue({
      id: 1, name: "Solo", imageUrl: "", creatorId: 1,
      createdAt: new Date(), updatedAt: new Date(),
    } as any);

    await createGroup("Solo", "", [99, 100]);

    const call = vi.mocked(prisma.group.create).mock.calls[0][0] as any;
    expect(call.data.members.create).toHaveLength(1);
    expect(call.data.members.create[0].userId).toBe(1);
  });

  it("does not duplicate current user when included in memberIds", async () => {
    setAdmin();
    vi.mocked(prisma.group.count).mockResolvedValue(0);
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 1 }, { id: 2 }] as any);
    vi.mocked(prisma.group.create).mockResolvedValue({
      id: 1, name: "Team", imageUrl: "", creatorId: 1,
      createdAt: new Date(), updatedAt: new Date(),
    } as any);

    await createGroup("Team", "", [1, 2]);

    const call = vi.mocked(prisma.group.create).mock.calls[0][0] as any;
    const memberUserIds = call.data.members.create.map((m: any) => m.userId);
    // currentUser (id:1) should appear exactly once despite being in memberIds
    expect(memberUserIds.filter((id: number) => id === 1)).toHaveLength(1);
    expect(memberUserIds).toContain(2);
  });

  it("propagates group.create DB error and skips revalidatePath", async () => {
    setAdmin();
    vi.mocked(prisma.group.count).mockResolvedValue(0);
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 2 }] as any);
    vi.mocked(prisma.group.create).mockRejectedValue(new Error("DB error"));

    await expect(createGroup("Team", "", [2])).rejects.toThrow("DB error");
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("accepts whitespace-only name (no trim on name field)", async () => {
    setAdmin();
    vi.mocked(prisma.group.count).mockResolvedValue(0);
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 2 }] as any);
    vi.mocked(prisma.group.create).mockResolvedValue({
      id: 1, name: "   ", imageUrl: "", creatorId: 1,
      createdAt: new Date(), updatedAt: new Date(),
    } as any);

    await expect(createGroup("   ", "", [2])).resolves.toBeDefined();
    expect(prisma.group.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: "   " }),
      }),
    );
  });
});

// ── updateGroup ──────────────────────────────────────────────────────────
describe("updateGroup", () => {
  it("throws Invalid input for invalid data", async () => {
    setAdmin();
    await expect(updateGroup(0, "Team", "", [2])).rejects.toThrow("Invalid input");
    await expect(updateGroup(1, "", "", [2])).rejects.toThrow("Invalid input");
    await expect(updateGroup(1, "a".repeat(101), "", [2])).rejects.toThrow("Invalid input");
    await expect(updateGroup(1, "Team", "", [])).rejects.toThrow("Invalid input");
  });

  it("throws when group not in company", async () => {
    setAdmin();
    vi.mocked(prisma.group.findFirst).mockResolvedValue(null);
    await expect(updateGroup(10, "Team", "", [2])).rejects.toThrow("Group not found or access denied");
  });

  it("throws when user not a member", async () => {
    setAdmin();
    vi.mocked(prisma.group.findFirst).mockResolvedValue({ id: 10 } as any);
    vi.mocked(prisma.groupMember.findUnique).mockResolvedValue(null);
    await expect(updateGroup(10, "Team", "", [2])).rejects.toThrow("Group not found or access denied");
  });

  it("verifies memberIds are same company and keeps current user", async () => {
    setAdmin();
    vi.mocked(prisma.group.findFirst).mockResolvedValue({ id: 10 } as any);
    vi.mocked(prisma.groupMember.findUnique).mockResolvedValue({ groupId: 10, userId: 1 } as any);
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 2 }] as any); // only user 2 verified
    vi.mocked(prisma.group.update).mockResolvedValue({} as any);
    mockTx.groupMember.findMany.mockResolvedValue([{ userId: 1 }, { userId: 2 }]);

    await updateGroup(10, "New Name", "", [2, 99]);

    // prisma.user.findMany called to verify member IDs
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: [2, 99] }, companyId: 100 },
      }),
    );
    // idsToKeep = [2, 1] (verified user 2 + currentUser 1). User 99 was filtered.
    expect(mockTx.groupMember.deleteMany).toHaveBeenCalledWith({
      where: {
        groupId: 10,
        userId: { notIn: expect.arrayContaining([1, 2]) },
      },
    });
    const deleteCall = mockTx.groupMember.deleteMany.mock.calls[0][0] as any;
    expect(deleteCall.where.userId.notIn).toHaveLength(2);
    // Both users 1 and 2 already exist, so no new members to create
    expect(mockTx.groupMember.createMany).not.toHaveBeenCalled();
  });

  it("updates group name/imageUrl and manages members in transaction", async () => {
    setAdmin();
    vi.mocked(prisma.group.findFirst).mockResolvedValue({ id: 10 } as any);
    vi.mocked(prisma.groupMember.findUnique).mockResolvedValue({ groupId: 10, userId: 1 } as any);
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 2 }, { id: 3 }] as any);
    vi.mocked(prisma.group.update).mockResolvedValue({} as any);
    mockTx.groupMember.findMany.mockResolvedValue([{ userId: 1 }]); // only current user exists
    mockTx.groupMember.createMany.mockResolvedValue({ count: 2 });

    await updateGroup(10, "Updated", "https://img.com/a.png", [2, 3]);

    expect(prisma.group.update).toHaveBeenCalledWith({
      where: { id: 10, companyId: 100 },
      data: { name: "Updated", imageUrl: "https://img.com/a.png" },
    });
    expect(mockTx.groupMember.deleteMany).toHaveBeenCalledWith({
      where: {
        groupId: 10,
        userId: { notIn: expect.arrayContaining([1, 2, 3]) },
      },
    });
    expect(mockTx.groupMember.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        { groupId: 10, userId: 2, companyId: 100 },
        { groupId: 10, userId: 3, companyId: 100 },
      ]),
    });
    const deleteCall2 = mockTx.groupMember.deleteMany.mock.calls[0][0] as any;
    expect(deleteCall2.where.userId.notIn).toHaveLength(3);
    const createCall = mockTx.groupMember.createMany.mock.calls[0][0] as any;
    expect(createCall.data).toHaveLength(2);
    expect(revalidatePath).toHaveBeenCalledWith("/chat");
  });

  it("sanitizes imageUrl on update", async () => {
    setAdmin();
    vi.mocked(prisma.group.findFirst).mockResolvedValue({ id: 10 } as any);
    vi.mocked(prisma.groupMember.findUnique).mockResolvedValue({ groupId: 10, userId: 1 } as any);
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 2 }] as any);
    vi.mocked(prisma.group.update).mockResolvedValue({} as any);
    mockTx.groupMember.findMany.mockResolvedValue([{ userId: 1 }, { userId: 2 }]);

    await updateGroup(10, "Team", "javascript:alert(1)", [2]);

    expect(prisma.group.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ imageUrl: "" }),
      }),
    );
  });

  it("allows valid http imageUrl on update", async () => {
    setAdmin();
    vi.mocked(prisma.group.findFirst).mockResolvedValue({ id: 10 } as any);
    vi.mocked(prisma.groupMember.findUnique).mockResolvedValue({ groupId: 10, userId: 1 } as any);
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 2 }] as any);
    vi.mocked(prisma.group.update).mockResolvedValue({} as any);
    mockTx.groupMember.findMany.mockResolvedValue([{ userId: 1 }, { userId: 2 }]);

    await updateGroup(10, "Team", "http://example.com/img.png", [2]);

    expect(prisma.group.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ imageUrl: "http://example.com/img.png" }),
      }),
    );
  });

  it("sanitizes data: URL on update", async () => {
    setAdmin();
    vi.mocked(prisma.group.findFirst).mockResolvedValue({ id: 10 } as any);
    vi.mocked(prisma.groupMember.findUnique).mockResolvedValue({ groupId: 10, userId: 1 } as any);
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 2 }] as any);
    vi.mocked(prisma.group.update).mockResolvedValue({} as any);
    mockTx.groupMember.findMany.mockResolvedValue([{ userId: 1 }, { userId: 2 }]);

    await updateGroup(10, "Team", "data:text/html,<script>alert(1)</script>", [2]);

    expect(prisma.group.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ imageUrl: "" }),
      }),
    );
  });

  it("skips createMany when all members already exist", async () => {
    setAdmin();
    vi.mocked(prisma.group.findFirst).mockResolvedValue({ id: 10 } as any);
    vi.mocked(prisma.groupMember.findUnique).mockResolvedValue({ groupId: 10, userId: 1 } as any);
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 2 }] as any);
    vi.mocked(prisma.group.update).mockResolvedValue({} as any);
    // All idsToKeep already exist as members
    mockTx.groupMember.findMany.mockResolvedValue([{ userId: 1 }, { userId: 2 }]);

    await updateGroup(10, "Same Members", "", [2]);

    expect(mockTx.groupMember.deleteMany).toHaveBeenCalledWith({
      where: {
        groupId: 10,
        userId: { notIn: expect.arrayContaining([1, 2]) },
      },
    });
    expect(mockTx.groupMember.createMany).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/chat");
  });

  it("propagates $transaction error and skips revalidatePath", async () => {
    setAdmin();
    vi.mocked(prisma.group.findFirst).mockResolvedValue({ id: 10 } as any);
    vi.mocked(prisma.groupMember.findUnique).mockResolvedValue({ groupId: 10, userId: 1 } as any);
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 2 }] as any);
    vi.mocked(prisma.group.update).mockResolvedValue({} as any);
    vi.mocked(prisma.$transaction).mockRejectedValue(new Error("Transaction timeout"));

    await expect(updateGroup(10, "Team", "", [2])).rejects.toThrow("Transaction timeout");
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("removes all other members when only current user is in memberIds", async () => {
    setAdmin();
    vi.mocked(prisma.group.findFirst).mockResolvedValue({ id: 10 } as any);
    vi.mocked(prisma.groupMember.findUnique).mockResolvedValue({ groupId: 10, userId: 1 } as any);
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 1 }] as any);
    vi.mocked(prisma.group.update).mockResolvedValue({} as any);
    mockTx.groupMember.findMany.mockResolvedValue([{ userId: 1 }]);

    await updateGroup(10, "Solo", "", [1]);

    const deleteCall = mockTx.groupMember.deleteMany.mock.calls[0][0] as any;
    expect(deleteCall.where.userId.notIn).toEqual([1]);
    expect(mockTx.groupMember.createMany).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/chat");
  });

  it("passes correct timeout options to $transaction", async () => {
    setAdmin();
    vi.mocked(prisma.group.findFirst).mockResolvedValue({ id: 10 } as any);
    vi.mocked(prisma.groupMember.findUnique).mockResolvedValue({ groupId: 10, userId: 1 } as any);
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 2 }] as any);
    vi.mocked(prisma.group.update).mockResolvedValue({} as any);
    mockTx.groupMember.findMany.mockResolvedValue([{ userId: 1 }, { userId: 2 }]);

    await updateGroup(10, "T", "", [2]);

    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { maxWait: 5000, timeout: 10000 },
    );
  });

  it("propagates group.update error and skips transaction + revalidatePath", async () => {
    setAdmin();
    vi.mocked(prisma.group.findFirst).mockResolvedValue({ id: 10 } as any);
    vi.mocked(prisma.groupMember.findUnique).mockResolvedValue({ groupId: 10, userId: 1 } as any);
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 2 }] as any);
    vi.mocked(prisma.group.update).mockRejectedValue(new Error("Update failed"));

    await expect(updateGroup(10, "T", "", [2])).rejects.toThrow("Update failed");
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

// ── markAsRead ───────────────────────────────────────────────────────────
describe("markAsRead", () => {
  it("throws Invalid input for non-positive ID", async () => {
    setAdmin();
    await expect(markAsRead(0, "user")).rejects.toThrow("Invalid input");
    await expect(markAsRead(-1, "group")).rejects.toThrow("Invalid input");
  });

  describe("type=user", () => {
    it("marks all unread DMs from sender as read", async () => {
      setAdmin();
      vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 2 } as any);
      vi.mocked(prisma.message.updateMany).mockResolvedValue({ count: 3 } as any);

      await markAsRead(2, "user");

      expect(prisma.message.updateMany).toHaveBeenCalledWith({
        where: { senderId: 2, receiverId: 1, read: false, companyId: 100 },
        data: { read: true },
      });
    });

    it("does not call groupMember.update for user type", async () => {
      setAdmin();
      vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 2 } as any);
      vi.mocked(prisma.message.updateMany).mockResolvedValue({ count: 1 } as any);

      await markAsRead(2, "user");

      expect(prisma.groupMember.update).not.toHaveBeenCalled();
    });

    it("throws when sender not in same company", async () => {
      setAdmin();
      vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
      await expect(markAsRead(99, "user")).rejects.toThrow("User not found or access denied");
    });

    it("propagates message.updateMany error and skips side effects", async () => {
      setAdmin();
      vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 2 } as any);
      vi.mocked(prisma.message.updateMany).mockRejectedValue(new Error("DB error"));

      await expect(markAsRead(2, "user")).rejects.toThrow("DB error");
      expect(mockPublish).not.toHaveBeenCalled();
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it("publishes Redis event on success", async () => {
      setAdmin();
      vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 2 } as any);
      vi.mocked(prisma.message.updateMany).mockResolvedValue({ count: 1 } as any);

      await markAsRead(2, "user");

      expect(mockPublish).toHaveBeenCalledWith(
        "company:100:user:1:chat",
        JSON.stringify({ type: "messages-read", entityId: 2, entityType: "user" }),
      );
    });
  });

  describe("type=group", () => {
    it("updates lastReadAt on GroupMember record", async () => {
      setAdmin();
      vi.mocked(prisma.group.findFirst).mockResolvedValue({ id: 10 } as any);
      vi.mocked(prisma.groupMember.update).mockResolvedValue({} as any);

      await markAsRead(10, "group");

      expect(prisma.groupMember.update).toHaveBeenCalledWith({
        where: { groupId_userId: { groupId: 10, userId: 1 } },
        data: { lastReadAt: expect.any(Date) },
      });
    });

    it("does not call message.updateMany for group type", async () => {
      setAdmin();
      vi.mocked(prisma.group.findFirst).mockResolvedValue({ id: 10 } as any);
      vi.mocked(prisma.groupMember.update).mockResolvedValue({} as any);

      await markAsRead(10, "group");

      expect(prisma.message.updateMany).not.toHaveBeenCalled();
    });

    it("throws when group not in same company", async () => {
      setAdmin();
      vi.mocked(prisma.group.findFirst).mockResolvedValue(null);
      await expect(markAsRead(10, "group")).rejects.toThrow("Group not found or access denied");
    });
  });

  it("calls revalidatePath after marking read", async () => {
    setAdmin();
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 2 } as any);
    vi.mocked(prisma.message.updateMany).mockResolvedValue({ count: 1 } as any);

    await markAsRead(2, "user");
    expect(revalidatePath).toHaveBeenCalledWith("/chat");
  });

  it("publishes Redis event for group type", async () => {
    setAdmin();
    vi.mocked(prisma.group.findFirst).mockResolvedValue({ id: 10 } as any);
    vi.mocked(prisma.groupMember.update).mockResolvedValue({} as any);

    await markAsRead(10, "group");

    expect(mockPublish).toHaveBeenCalledWith(
      "company:100:user:1:chat",
      JSON.stringify({ type: "messages-read", entityId: 10, entityType: "group" }),
    );
  });

  it("does not throw when Redis publish fails", async () => {
    setAdmin();
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 2 } as any);
    vi.mocked(prisma.message.updateMany).mockResolvedValue({ count: 1 } as any);
    mockPublish.mockRejectedValue(new Error("Redis down"));

    await expect(markAsRead(2, "user")).resolves.toBeUndefined();
    expect(revalidatePath).toHaveBeenCalledWith("/chat");
    expect(mockLogError).toHaveBeenCalledWith(
      "Redis publish error (markAsRead)",
      expect.objectContaining({ error: expect.any(String) }),
    );
  });

  it("defaults to type=user when type omitted", async () => {
    setAdmin();
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 2 } as any);
    vi.mocked(prisma.message.updateMany).mockResolvedValue({ count: 1 } as any);

    await markAsRead(2);

    expect(prisma.message.updateMany).toHaveBeenCalledWith({
      where: { senderId: 2, receiverId: 1, read: false, companyId: 100 },
      data: { read: true },
    });
  });

  it("propagates groupMember.update error when user removed between checks", async () => {
    setAdmin();
    vi.mocked(prisma.group.findFirst).mockResolvedValue({ id: 10 } as any);
    vi.mocked(prisma.groupMember.update).mockRejectedValue(
      new Error("Record to update not found"),
    );

    await expect(markAsRead(10, "group")).rejects.toThrow("Record to update not found");
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(mockPublish).not.toHaveBeenCalled();
  });
});

// ── getUnreadCounts ──────────────────────────────────────────────────────
describe("getUnreadCounts", () => {
  it("returns unread DM counts grouped by sender", async () => {
    setAdmin();
    vi.mocked(prisma.message.groupBy).mockResolvedValue([
      { senderId: 2, _count: { id: 5 } },
      { senderId: 3, _count: { id: 2 } },
    ] as any);
    vi.mocked(prisma.groupMember.findMany).mockResolvedValue([]);

    const result = await getUnreadCounts();
    expect(result).toEqual([
      { type: "user", id: 2, count: 5 },
      { type: "user", id: 3, count: 2 },
    ]);
    expect(prisma.message.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ["senderId"],
        _count: { id: true },
        where: expect.objectContaining({
          receiverId: 1,
          read: false,
          groupId: null,
        }),
      }),
    );
  });

  it("returns unread group message counts", async () => {
    setAdmin();
    vi.mocked(prisma.message.groupBy).mockResolvedValue([]);
    const lastRead = new Date("2025-01-01");
    vi.mocked(prisma.groupMember.findMany).mockResolvedValue([
      { groupId: 10, lastReadAt: lastRead },
    ] as any);
    vi.mocked(prisma.message.count).mockResolvedValue(3);

    const result = await getUnreadCounts();
    expect(result).toEqual([{ type: "group", id: 10, count: 3 }]);
    expect(prisma.message.count).toHaveBeenCalledWith({
      where: {
        groupId: 10,
        createdAt: { gt: lastRead },
        senderId: { not: 1 },
      },
    });
    expect(prisma.groupMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 1,
          group: { companyId: 100 },
        }),
      }),
    );
  });

  it("returns empty array when no unread messages", async () => {
    setAdmin();
    vi.mocked(prisma.message.groupBy).mockResolvedValue([]);
    vi.mocked(prisma.groupMember.findMany).mockResolvedValue([]);

    const result = await getUnreadCounts();
    expect(result).toEqual([]);
  });

  it("filters out groups with zero unread count", async () => {
    setAdmin();
    vi.mocked(prisma.message.groupBy).mockResolvedValue([]);
    vi.mocked(prisma.groupMember.findMany).mockResolvedValue([
      { groupId: 10, lastReadAt: new Date() },
    ] as any);
    vi.mocked(prisma.message.count).mockResolvedValue(0);

    const result = await getUnreadCounts();
    expect(result).toEqual([]);
  });

  it("handles users with no group memberships", async () => {
    setAdmin();
    vi.mocked(prisma.message.groupBy).mockResolvedValue([
      { senderId: 5, _count: { id: 1 } },
    ] as any);
    vi.mocked(prisma.groupMember.findMany).mockResolvedValue([]);

    const result = await getUnreadCounts();
    expect(result).toEqual([{ type: "user", id: 5, count: 1 }]);
    // message.count should not have been called since no groups
    expect(prisma.message.count).not.toHaveBeenCalled();
  });

  it("counts all messages as unread when group lastReadAt is null", async () => {
    setAdmin();
    vi.mocked(prisma.message.groupBy).mockResolvedValue([]);
    vi.mocked(prisma.groupMember.findMany).mockResolvedValue([
      { groupId: 10, lastReadAt: null },
    ] as any);
    vi.mocked(prisma.message.count).mockResolvedValue(7);

    const result = await getUnreadCounts();
    expect(result).toEqual([{ type: "group", id: 10, count: 7 }]);
    expect(prisma.message.count).toHaveBeenCalledWith({
      where: {
        groupId: 10,
        senderId: { not: 1 },
      },
    });
    // createdAt must NOT be in the where clause when lastReadAt is null
    const call = vi.mocked(prisma.message.count).mock.calls[0][0] as any;
    expect(call.where).not.toHaveProperty("createdAt");
  });

  it("returns combined DM and group unread counts", async () => {
    setAdmin();
    vi.mocked(prisma.message.groupBy).mockResolvedValue([
      { senderId: 2, _count: { id: 3 } },
    ] as any);
    vi.mocked(prisma.groupMember.findMany).mockResolvedValue([
      { groupId: 10, lastReadAt: new Date("2025-01-01") },
    ] as any);
    vi.mocked(prisma.message.count).mockResolvedValue(4);

    const result = await getUnreadCounts();
    expect(result).toEqual([
      { type: "user", id: 2, count: 3 },
      { type: "group", id: 10, count: 4 },
    ]);
  });

  it("returns mixed group counts filtering zeros", async () => {
    setAdmin();
    vi.mocked(prisma.message.groupBy).mockResolvedValue([]);
    vi.mocked(prisma.groupMember.findMany).mockResolvedValue([
      { groupId: 10, lastReadAt: new Date("2025-01-01") },
      { groupId: 20, lastReadAt: new Date("2025-01-01") },
      { groupId: 30, lastReadAt: new Date("2025-01-01") },
    ] as any);
    vi.mocked(prisma.message.count)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(2);

    const result = await getUnreadCounts();
    expect(result).toEqual([
      { type: "group", id: 10, count: 5 },
      { type: "group", id: 30, count: 2 },
    ]);
  });

  it("handles mixed null and non-null lastReadAt in same batch", async () => {
    setAdmin();
    vi.mocked(prisma.message.groupBy).mockResolvedValue([]);
    const lastRead = new Date("2025-06-01");
    vi.mocked(prisma.groupMember.findMany).mockResolvedValue([
      { groupId: 10, lastReadAt: null },
      { groupId: 20, lastReadAt: lastRead },
    ] as any);
    vi.mocked(prisma.message.count)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(3);

    const result = await getUnreadCounts();
    expect(result).toEqual([
      { type: "group", id: 10, count: 5 },
      { type: "group", id: 20, count: 3 },
    ]);

    const call0 = vi.mocked(prisma.message.count).mock.calls[0][0] as any;
    expect(call0.where).not.toHaveProperty("createdAt");
    expect(call0.where.groupId).toBe(10);

    const call1 = vi.mocked(prisma.message.count).mock.calls[1][0] as any;
    expect(call1.where.createdAt).toEqual({ gt: lastRead });
    expect(call1.where.groupId).toBe(20);
  });

  it("propagates DB errors from message.groupBy", async () => {
    setAdmin();
    vi.mocked(prisma.message.groupBy).mockRejectedValue(new Error("DB error"));

    await expect(getUnreadCounts()).rejects.toThrow("DB error");
  });

  it("propagates DB errors from groupMember.findMany", async () => {
    setAdmin();
    vi.mocked(prisma.message.groupBy).mockResolvedValue([]);
    vi.mocked(prisma.groupMember.findMany).mockRejectedValue(new Error("DB error"));

    await expect(getUnreadCounts()).rejects.toThrow("DB error");
  });

  it("propagates DB errors from message.count inside Promise.all", async () => {
    setAdmin();
    vi.mocked(prisma.message.groupBy).mockResolvedValue([]);
    vi.mocked(prisma.groupMember.findMany).mockResolvedValue([
      { groupId: 10, lastReadAt: new Date() },
    ] as any);
    vi.mocked(prisma.message.count).mockRejectedValue(new Error("Count failed"));

    await expect(getUnreadCounts()).rejects.toThrow("Count failed");
  });
});

// ── Edge Cases (cross-cutting) ───────────────────────────────────────────
describe("Edge Cases", () => {
  it("rejects content with 5000+ chars", async () => {
    setAdmin();
    const longContent = "a".repeat(5001);
    await expect(sendMessage(2, longContent)).rejects.toThrow("Invalid input");
  });

  it("rejects sendGroupMessage content with 5000+ chars", async () => {
    setAdmin();
    const longContent = "a".repeat(5001);
    await expect(sendGroupMessage(10, longContent)).rejects.toThrow("Invalid input");
  });

  it("accepts content at exactly 5000 chars", async () => {
    setAdmin();
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 2 } as any);
    vi.mocked(prisma.message.create).mockResolvedValue({} as any);

    await expect(sendMessage(2, "a".repeat(5000))).resolves.toBeUndefined();
  });

  it("accepts sendGroupMessage content at exactly 5000 chars", async () => {
    setAdmin();
    vi.mocked(prisma.group.findFirst).mockResolvedValue({ id: 10 } as any);
    vi.mocked(prisma.groupMember.findUnique).mockResolvedValue({ groupId: 10, userId: 1 } as any);
    vi.mocked(prisma.message.create).mockResolvedValue({} as any);
    vi.mocked(prisma.groupMember.findMany).mockResolvedValue([{ userId: 1 }] as any);

    await expect(sendGroupMessage(10, "a".repeat(5000))).resolves.toBeUndefined();
  });

  it("accepts createGroup with exactly 200 memberIds", async () => {
    setAdmin();
    vi.mocked(prisma.group.count).mockResolvedValue(0);
    const ids = Array.from({ length: 200 }, (_, i) => i + 2);
    vi.mocked(prisma.user.findMany).mockResolvedValue(ids.map(id => ({ id })) as any);
    vi.mocked(prisma.group.create).mockResolvedValue({
      id: 1, name: "T", imageUrl: "", creatorId: 1,
      createdAt: new Date(), updatedAt: new Date(),
    } as any);

    await expect(createGroup("T", "", ids)).resolves.toBeDefined();
  });

  it("rejects createGroup with 201 memberIds", async () => {
    setAdmin();
    const ids = Array.from({ length: 201 }, (_, i) => i + 2);
    await expect(createGroup("T", "", ids)).rejects.toThrow("Invalid input");
  });

  it("accepts updateGroup with exactly 200 memberIds", async () => {
    setAdmin();
    const ids = Array.from({ length: 200 }, (_, i) => i + 2);
    vi.mocked(prisma.group.findFirst).mockResolvedValue({ id: 10 } as any);
    vi.mocked(prisma.groupMember.findUnique).mockResolvedValue({ groupId: 10, userId: 1 } as any);
    vi.mocked(prisma.user.findMany).mockResolvedValue(ids.map(id => ({ id })) as any);
    vi.mocked(prisma.group.update).mockResolvedValue({} as any);
    mockTx.groupMember.findMany.mockResolvedValue([{ userId: 1 }]);
    mockTx.groupMember.createMany.mockResolvedValue({ count: 200 });

    await expect(updateGroup(10, "T", "", ids)).resolves.toBeUndefined();
  });

  it("rejects updateGroup with 201 memberIds", async () => {
    setAdmin();
    const ids = Array.from({ length: 201 }, (_, i) => i + 2);
    await expect(updateGroup(10, "T", "", ids)).rejects.toThrow("Invalid input");
  });

  it("accepts createGroup imageUrl at exactly 2048 chars", async () => {
    setAdmin();
    vi.mocked(prisma.group.count).mockResolvedValue(0);
    const url = "https://x.com/" + "a".repeat(2034); // 14 + 2034 = 2048
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 2 }] as any);
    vi.mocked(prisma.group.create).mockResolvedValue({
      id: 1, name: "T", imageUrl: url, creatorId: 1,
      createdAt: new Date(), updatedAt: new Date(),
    } as any);

    await expect(createGroup("T", url, [2])).resolves.toBeDefined();
    expect(prisma.group.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ imageUrl: url }),
      }),
    );
  });

  it("rejects createGroup imageUrl at 2049 chars", async () => {
    setAdmin();
    const url = "https://x.com/" + "a".repeat(2035); // 14 + 2035 = 2049
    await expect(createGroup("T", url, [2])).rejects.toThrow("Invalid input");
  });

  it("accepts updateGroup imageUrl at exactly 2048 chars", async () => {
    setAdmin();
    const url = "https://x.com/" + "a".repeat(2034); // 14 + 2034 = 2048
    vi.mocked(prisma.group.findFirst).mockResolvedValue({ id: 10 } as any);
    vi.mocked(prisma.groupMember.findUnique).mockResolvedValue({ groupId: 10, userId: 1 } as any);
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 2 }] as any);
    vi.mocked(prisma.group.update).mockResolvedValue({} as any);
    mockTx.groupMember.findMany.mockResolvedValue([{ userId: 1 }, { userId: 2 }]);

    await updateGroup(10, "T", url, [2]);
    expect(prisma.group.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ imageUrl: url }),
      }),
    );
  });

  it("rejects updateGroup imageUrl at 2049 chars", async () => {
    setAdmin();
    const url = "https://x.com/" + "a".repeat(2035); // 14 + 2035 = 2049
    await expect(updateGroup(10, "T", url, [2])).rejects.toThrow("Invalid input");
  });

  it("accepts createGroup name at exactly 100 chars", async () => {
    setAdmin();
    vi.mocked(prisma.group.count).mockResolvedValue(0);
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 2 }] as any);
    vi.mocked(prisma.group.create).mockResolvedValue({
      id: 1, name: "a".repeat(100), imageUrl: "", creatorId: 1,
      createdAt: new Date(), updatedAt: new Date(),
    } as any);
    await expect(createGroup("a".repeat(100), "", [2])).resolves.toBeDefined();
  });

  it("accepts updateGroup name at exactly 100 chars", async () => {
    setAdmin();
    vi.mocked(prisma.group.findFirst).mockResolvedValue({ id: 10 } as any);
    vi.mocked(prisma.groupMember.findUnique).mockResolvedValue({ groupId: 10, userId: 1 } as any);
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 2 }] as any);
    vi.mocked(prisma.group.update).mockResolvedValue({} as any);
    mockTx.groupMember.findMany.mockResolvedValue([{ userId: 1 }, { userId: 2 }]);
    await expect(updateGroup(10, "a".repeat(100), "", [2])).resolves.toBeUndefined();
  });

  it("rejects markAsRead with invalid type enum", async () => {
    setAdmin();
    await expect(markAsRead(1, "invalid" as any)).rejects.toThrow("Invalid input");
  });

  it("rejects sendMessage with fractional receiverId", async () => {
    setAdmin();
    await expect(sendMessage(1.5, "Hello")).rejects.toThrow("Invalid input");
  });

  it("rejects sendGroupMessage with fractional groupId", async () => {
    setAdmin();
    await expect(sendGroupMessage(1.5, "Hello")).rejects.toThrow("Invalid input");
  });

  it("rejects markAsRead with fractional id", async () => {
    setAdmin();
    await expect(markAsRead(1.5, "user")).rejects.toThrow("Invalid input");
  });

  it("forbidden guard applies to all functions", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserNoChat as any);
    vi.mocked(hasUserFlag).mockReturnValue(false);

    const fns = [
      () => getUsers(),
      () => getGroups(),
      () => getMessages(1),
      () => getGroupMessages(1),
      () => sendMessage(2, "hi"),
      () => sendGroupMessage(1, "hi"),
      () => createGroup("T", "", [2]),
      () => updateGroup(1, "T", "", [2]),
      () => markAsRead(1, "user"),
      () => getUnreadCounts(),
    ];

    for (const fn of fns) {
      await expect(fn()).rejects.toThrow("Forbidden");
    }
  });

  it("auth guard applies to all functions", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const fns = [
      () => getUsers(),
      () => getGroups(),
      () => getMessages(1),
      () => getGroupMessages(1),
      () => sendMessage(2, "hi"),
      () => sendGroupMessage(1, "hi"),
      () => createGroup("T", "", [2]),
      () => updateGroup(1, "T", "", [2]),
      () => markAsRead(1, "user"),
      () => getUnreadCounts(),
    ];

    for (const fn of fns) {
      await expect(fn()).rejects.toThrow("Unauthorized");
    }
  });
});

// ── Read functions must NOT call revalidatePath ──────────────────────────
describe("read functions do not revalidatePath", () => {
  it("getUsers does not call revalidatePath", async () => {
    setAdmin();
    vi.mocked(prisma.user.findMany).mockResolvedValue([]);
    vi.mocked(prisma.message.findMany).mockResolvedValue([]);

    await getUsers();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("getGroups does not call revalidatePath", async () => {
    setAdmin();
    vi.mocked(prisma.group.findMany).mockResolvedValue([]);

    await getGroups();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("getMessages does not call revalidatePath", async () => {
    setAdmin();
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 2 } as any);
    vi.mocked(prisma.message.findMany).mockResolvedValue([]);

    await getMessages(2);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("getGroupMessages does not call revalidatePath", async () => {
    setAdmin();
    vi.mocked(prisma.group.findFirst).mockResolvedValue({ id: 10 } as any);
    vi.mocked(prisma.groupMember.findUnique).mockResolvedValue({ groupId: 10, userId: 1 } as any);
    vi.mocked(prisma.message.findMany).mockResolvedValue([]);

    await getGroupMessages(10);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("getUnreadCounts does not call revalidatePath", async () => {
    setAdmin();
    vi.mocked(prisma.message.groupBy).mockResolvedValue([]);
    vi.mocked(prisma.groupMember.findMany).mockResolvedValue([]);

    await getUnreadCounts();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

// ── Read functions use chatRead rate-limit key ───────────────────────────
describe("read functions use chatRead rate-limit key", () => {
  it("getUsers uses chatRead rate limit", async () => {
    setAdmin();
    vi.mocked(prisma.user.findMany).mockResolvedValue([]);
    vi.mocked(prisma.message.findMany).mockResolvedValue([]);

    await getUsers();

    expect(checkActionRateLimit).toHaveBeenCalledTimes(1);
    expect(checkActionRateLimit).toHaveBeenCalledWith(
      String(adminUser.id),
      expect.objectContaining({ prefix: "chat-read" }),
    );
  });

  it("getGroups uses chatRead rate limit", async () => {
    setAdmin();
    vi.mocked(prisma.group.findMany).mockResolvedValue([]);

    await getGroups();

    expect(checkActionRateLimit).toHaveBeenCalledWith(
      String(adminUser.id),
      expect.objectContaining({ prefix: "chat-read" }),
    );
  });

  it("getMessages uses chatRead rate limit", async () => {
    setAdmin();
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 2 } as any);
    vi.mocked(prisma.message.findMany).mockResolvedValue([]);

    await getMessages(2);

    expect(checkActionRateLimit).toHaveBeenCalledWith(
      String(adminUser.id),
      expect.objectContaining({ prefix: "chat-read" }),
    );
  });

  it("getGroupMessages uses chatRead rate limit", async () => {
    setAdmin();
    vi.mocked(prisma.group.findFirst).mockResolvedValue({ id: 10 } as any);
    vi.mocked(prisma.groupMember.findUnique).mockResolvedValue({ groupId: 10, userId: 1 } as any);
    vi.mocked(prisma.message.findMany).mockResolvedValue([]);

    await getGroupMessages(10);

    expect(checkActionRateLimit).toHaveBeenCalledWith(
      String(adminUser.id),
      expect.objectContaining({ prefix: "chat-read" }),
    );
  });

  it("getUnreadCounts uses chatRead rate limit", async () => {
    setAdmin();
    vi.mocked(prisma.message.groupBy).mockResolvedValue([]);
    vi.mocked(prisma.groupMember.findMany).mockResolvedValue([]);

    await getUnreadCounts();

    expect(checkActionRateLimit).toHaveBeenCalledWith(
      String(adminUser.id),
      expect.objectContaining({ prefix: "chat-read" }),
    );
  });
});

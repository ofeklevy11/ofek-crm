import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";

// ── MOCK (infrastructure only — keep everything else real) ──────────────────
vi.mock("@/lib/permissions-server", () => ({
  getCurrentUser: vi.fn(),
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

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/redis", () => ({
  redisPublisher: { publish: vi.fn() },
  redis: {},
}));

// ── REAL: prisma, db-retry, permissions, chat/validation ────────────────────
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { checkActionRateLimit } from "@/lib/rate-limit";
import { redisPublisher } from "@/lib/redis";

import {
  getUsers,
  getGroups,
  getMessages,
  getGroupMessages,
  sendMessage,
  sendGroupMessage,
  markAsRead,
  getUnreadCounts,
  createGroup,
  updateGroup,
} from "@/app/actions/chat";

// ── Helpers ─────────────────────────────────────────────────────────────────

type TestUser = {
  id: number;
  companyId: number;
  name: string;
  email: string;
  role: string;
  permissions: Record<string, boolean>;
};

function mockUser(user: TestUser) {
  vi.mocked(getCurrentUser).mockResolvedValue({
    allowedWriteTableIds: [],
    ...user,
  } as any);
}

// ── State ───────────────────────────────────────────────────────────────────
let companyA: number;
let companyB: number;
let adminA: TestUser;
let chatUserA1: TestUser;
let chatUserA2: TestUser;
let chatUserA3: TestUser;
let noChatUserA: TestUser;
let adminB: TestUser;
let chatUserB: TestUser;

const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// ── Setup / Teardown ────────────────────────────────────────────────────────

beforeAll(async () => {
  const coA = await prisma.company.create({ data: { name: "Chat Co A", slug: `chat-co-a-${suffix}` } });
  const coB = await prisma.company.create({ data: { name: "Chat Co B", slug: `chat-co-b-${suffix}` } });
  companyA = coA.id;
  companyB = coB.id;

  const mkUser = async (compId: number, name: string, role: string, perms: Record<string, boolean>): Promise<TestUser> => {
    const u = await prisma.user.create({
      data: {
        companyId: compId,
        name,
        email: `${name.toLowerCase().replace(/\s/g, "-")}-${suffix}@test.com`,
        passwordHash: "$unused$",
        role: role as any,
        permissions: perms,
        allowedWriteTableIds: [],
      },
    });
    return { id: u.id, companyId: u.companyId, name: u.name, email: u.email, role: u.role, permissions: perms };
  };

  adminA = await mkUser(companyA, "ChatAdminA", "admin", {});
  chatUserA1 = await mkUser(companyA, "ChatUserA1", "basic", { canViewChat: true });
  chatUserA2 = await mkUser(companyA, "ChatUserA2", "basic", { canViewChat: true });
  chatUserA3 = await mkUser(companyA, "ChatUserA3", "basic", { canViewChat: true });
  noChatUserA = await mkUser(companyA, "NoChatA", "basic", {});
  adminB = await mkUser(companyB, "ChatAdminB", "admin", {});
  chatUserB = await mkUser(companyB, "ChatUserB", "basic", { canViewChat: true });
});

afterEach(async () => {
  await prisma.message.deleteMany({ where: { companyId: { in: [companyA, companyB] } } });
  await prisma.groupMember.deleteMany({ where: { companyId: { in: [companyA, companyB] } } });
  await prisma.group.deleteMany({ where: { companyId: { in: [companyA, companyB] } } });

  vi.clearAllMocks();
  // Re-default mocks
  vi.mocked(checkActionRateLimit).mockResolvedValue(false);
  vi.mocked(redisPublisher.publish).mockResolvedValue(undefined as any);
});

afterAll(async () => {
  if (!companyA) return;
  await prisma.message.deleteMany({ where: { companyId: { in: [companyA, companyB] } } });
  await prisma.groupMember.deleteMany({ where: { companyId: { in: [companyA, companyB] } } });
  await prisma.group.deleteMany({ where: { companyId: { in: [companyA, companyB] } } });
  await prisma.user.deleteMany({ where: { companyId: { in: [companyA, companyB] } } });
  await prisma.company.deleteMany({ where: { id: { in: [companyA, companyB] } } });
  await prisma.$disconnect();
});

// ═════════════════════════════════════════════════════════════════════════════
// requireChatUser — shared auth guard
// ═════════════════════════════════════════════════════════════════════════════

describe("requireChatUser — shared auth guard", () => {
  it("throws Unauthorized when getCurrentUser returns null", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(getUsers()).rejects.toThrow("Unauthorized");
  });

  it("throws Forbidden for basic user without canViewChat", async () => {
    mockUser(noChatUserA);
    await expect(getUsers()).rejects.toThrow("Forbidden");
  });

  it("throws Rate limit exceeded when checkActionRateLimit returns true", async () => {
    mockUser(chatUserA1);
    vi.mocked(checkActionRateLimit).mockResolvedValue(true);
    await expect(getUsers()).rejects.toThrow("Rate limit exceeded");
  });

  it("admin passes all checks", async () => {
    mockUser(adminA);
    const result = await getUsers();
    expect(Array.isArray(result)).toBe(true);
  });

  it("basic user with canViewChat passes", async () => {
    mockUser(chatUserA1);
    const result = await getUsers();
    expect(Array.isArray(result)).toBe(true);
  });

  it("proceeds when checkActionRateLimit rejects (fail-open via .catch)", async () => {
    mockUser(chatUserA1);
    vi.mocked(checkActionRateLimit).mockRejectedValue(new Error("Redis down"));
    const result = await getUsers();
    expect(Array.isArray(result)).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// getUsers
// ═════════════════════════════════════════════════════════════════════════════

describe("getUsers", () => {
  it("returns all company users except self", async () => {
    mockUser(chatUserA1);
    const users = await getUsers();
    const ids = users.map((u: any) => u.id);
    expect(ids).not.toContain(chatUserA1.id);
    // Should include other companyA users
    expect(ids).toContain(adminA.id);
    expect(ids).toContain(chatUserA2.id);
    expect(ids).toContain(chatUserA3.id);
    expect(ids).toContain(noChatUserA.id);
  });

  it("sorted by most recent DM first; users without DM come last", async () => {
    // Create DM from chatUserA2 to chatUserA1 first
    await prisma.message.create({
      data: { companyId: companyA, content: "older", senderId: chatUserA2.id, receiverId: chatUserA1.id },
    });
    // Wait a bit for distinct timestamps
    await new Promise((r) => setTimeout(r, 50));
    // Create DM from chatUserA3 to chatUserA1 more recently
    await prisma.message.create({
      data: { companyId: companyA, content: "newer", senderId: chatUserA3.id, receiverId: chatUserA1.id },
    });

    mockUser(chatUserA1);
    const users = await getUsers();
    const idsWithDM = users.filter((u: any) => u.lastMessageAt !== null).map((u: any) => u.id);
    // chatUserA3 should be first (most recent), chatUserA2 second
    expect(idsWithDM[0]).toBe(chatUserA3.id);
    expect(idsWithDM[1]).toBe(chatUserA2.id);
    // Users without DMs should have null
    const noDMUsers = users.filter((u: any) => u.lastMessageAt === null);
    expect(noDMUsers.length).toBeGreaterThan(0);
  });

  it("cross-tenant: does not return companyB users", async () => {
    mockUser(chatUserA1);
    const users = await getUsers();
    const ids = users.map((u: any) => u.id);
    expect(ids).not.toContain(adminB.id);
    expect(ids).not.toContain(chatUserB.id);
  });

  it("response shape: { id, name, role, lastMessageAt } only", async () => {
    mockUser(chatUserA1);
    const users = await getUsers();
    expect(users.length).toBeGreaterThan(0);
    const keys = Object.keys(users[0]).sort();
    expect(keys).toEqual(["id", "lastMessageAt", "name", "role"].sort());
  });

  it("returns empty array when current user is the only user", async () => {
    // Create a lone user in a new company
    const loneCo = await prisma.company.create({ data: { name: "Lone Co", slug: `lone-co-${suffix}` } });
    const loneUser = await prisma.user.create({
      data: {
        companyId: loneCo.id, name: "Lone", email: `lone-${suffix}@test.com`,
        passwordHash: "$unused$", role: "admin", permissions: {}, allowedWriteTableIds: [],
      },
    });
    mockUser({ id: loneUser.id, companyId: loneCo.id, name: "Lone", email: loneUser.email, role: "admin", permissions: {} });
    const users = await getUsers();
    expect(users).toEqual([]);
    // Cleanup
    await prisma.user.delete({ where: { id: loneUser.id } });
    await prisma.company.delete({ where: { id: loneCo.id } });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// getGroups
// ═════════════════════════════════════════════════════════════════════════════

describe("getGroups", () => {
  it("returns only groups where user is a member", async () => {
    mockUser(chatUserA1);
    const g = await createGroup("MyGroup", "", [chatUserA2.id]);
    // chatUserA1 is creator → member
    const groups = await getGroups();
    expect(groups.some((gr: any) => gr.id === g.id)).toBe(true);
  });

  it("does not return groups user is not a member of", async () => {
    mockUser(chatUserA1);
    const g = await createGroup("A1Group", "", [chatUserA2.id]);

    // Switch to chatUserA3 who is not a member
    mockUser(chatUserA3);
    const groups = await getGroups();
    expect(groups.some((gr: any) => gr.id === g.id)).toBe(false);
  });

  it("cross-tenant: no companyB groups", async () => {
    // Create group in companyB
    mockUser(adminB);
    await createGroup("CoB Group", "", [chatUserB.id]);

    // Switch to companyA user
    mockUser(chatUserA1);
    const groups = await getGroups();
    groups.forEach((g: any) => {
      // All groups should have companyA members
      expect(g.members.every((m: any) => m.user)).toBeTruthy();
    });
    // No group should be the companyB group
    const groupNames = groups.map((g: any) => g.name);
    expect(groupNames).not.toContain("CoB Group");
  });

  it("includes members and last message in shape", async () => {
    mockUser(chatUserA1);
    const g = await createGroup("ShapeGroup", "", [chatUserA2.id]);
    await sendGroupMessage(g.id, "Hello group");

    const groups = await getGroups();
    const found = groups.find((gr: any) => gr.id === g.id);
    expect(found).toBeDefined();
    expect(found.members.length).toBeGreaterThanOrEqual(2);
    expect(found.messages).toHaveLength(1);
    expect(found.messages[0].content).toBe("Hello group");
  });

  it("empty messages array for group with no messages", async () => {
    mockUser(chatUserA1);
    const g = await createGroup("EmptyGroup", "", [chatUserA2.id]);

    const groups = await getGroups();
    const found = groups.find((gr: any) => gr.id === g.id);
    expect(found.messages).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// getMessages
// ═════════════════════════════════════════════════════════════════════════════

describe("getMessages", () => {
  it("returns DMs between two users ordered asc", async () => {
    await prisma.message.create({
      data: { companyId: companyA, content: "first", senderId: chatUserA1.id, receiverId: chatUserA2.id },
    });
    await new Promise((r) => setTimeout(r, 50));
    await prisma.message.create({
      data: { companyId: companyA, content: "second", senderId: chatUserA2.id, receiverId: chatUserA1.id },
    });

    mockUser(chatUserA1);
    const msgs = await getMessages(chatUserA2.id);
    expect(msgs).toHaveLength(2);
    expect(msgs[0].content).toBe("first");
    expect(msgs[1].content).toBe("second");
  });

  it("includes both sent and received", async () => {
    await prisma.message.create({
      data: { companyId: companyA, content: "sent", senderId: chatUserA1.id, receiverId: chatUserA2.id },
    });
    await prisma.message.create({
      data: { companyId: companyA, content: "received", senderId: chatUserA2.id, receiverId: chatUserA1.id },
    });

    mockUser(chatUserA1);
    const msgs = await getMessages(chatUserA2.id);
    expect(msgs.some((m: any) => m.senderId === chatUserA1.id)).toBe(true);
    expect(msgs.some((m: any) => m.senderId === chatUserA2.id)).toBe(true);
  });

  it("validation: non-positive otherUserId → Invalid input", async () => {
    mockUser(chatUserA1);
    await expect(getMessages(0)).rejects.toThrow("Invalid input");
    await expect(getMessages(-1)).rejects.toThrow("Invalid input");
  });

  it("validation: fractional otherUserId → Invalid input", async () => {
    mockUser(chatUserA1);
    await expect(getMessages(1.5)).rejects.toThrow("Invalid input");
  });

  it("non-existent user → User not found or access denied", async () => {
    mockUser(chatUserA1);
    await expect(getMessages(999999)).rejects.toThrow("User not found or access denied");
  });

  it("cross-tenant user → User not found or access denied", async () => {
    mockUser(chatUserA1);
    await expect(getMessages(chatUserB.id)).rejects.toThrow("User not found or access denied");
  });

  it("empty array when no history", async () => {
    mockUser(chatUserA1);
    const msgs = await getMessages(chatUserA2.id);
    expect(msgs).toEqual([]);
  });

  it("does not include group messages", async () => {
    // Create a group message
    mockUser(chatUserA1);
    const g = await createGroup("MsgTestGroup", "", [chatUserA2.id]);
    await sendGroupMessage(g.id, "group msg");
    // Create a DM
    await sendMessage(chatUserA2.id, "dm msg");

    const msgs = await getMessages(chatUserA2.id);
    expect(msgs.every((m: any) => m.groupId === undefined || m.groupId === null)).toBe(true);
    expect(msgs.some((m: any) => m.content === "dm msg")).toBe(true);
    expect(msgs.some((m: any) => m.content === "group msg")).toBe(false);
  });

  it("response shape: { id, content, senderId, receiverId, read, createdAt, sender: { name }, receiver: { name } }", async () => {
    await prisma.message.create({
      data: { companyId: companyA, content: "shape test", senderId: chatUserA1.id, receiverId: chatUserA2.id },
    });
    mockUser(chatUserA1);
    const msgs = await getMessages(chatUserA2.id);
    expect(msgs).toHaveLength(1);
    const msg = msgs[0];
    expect(msg).toHaveProperty("id");
    expect(msg).toHaveProperty("content");
    expect(msg).toHaveProperty("senderId");
    expect(msg).toHaveProperty("receiverId");
    expect(msg).toHaveProperty("read");
    expect(msg).toHaveProperty("createdAt");
    expect(msg).toHaveProperty("sender");
    expect(msg.sender).toHaveProperty("name");
    expect(msg).toHaveProperty("receiver");
    expect(msg.receiver).toHaveProperty("name");
    // Should NOT have companyId or groupId
    expect(msg).not.toHaveProperty("companyId");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// getGroupMessages
// ═════════════════════════════════════════════════════════════════════════════

describe("getGroupMessages", () => {
  it("returns messages ordered asc", async () => {
    mockUser(chatUserA1);
    const g = await createGroup("GrpMsgGroup", "", [chatUserA2.id]);
    await sendGroupMessage(g.id, "first");
    await new Promise((r) => setTimeout(r, 50));
    await sendGroupMessage(g.id, "second");

    const msgs = await getGroupMessages(g.id);
    expect(msgs).toHaveLength(2);
    expect(msgs[0].content).toBe("first");
    expect(msgs[1].content).toBe("second");
  });

  it("validation: invalid groupId → Invalid input", async () => {
    mockUser(chatUserA1);
    await expect(getGroupMessages(0)).rejects.toThrow("Invalid input");
    await expect(getGroupMessages(-1)).rejects.toThrow("Invalid input");
    await expect(getGroupMessages(1.5)).rejects.toThrow("Invalid input");
  });

  it("non-existent group → Group not found or access denied", async () => {
    mockUser(chatUserA1);
    await expect(getGroupMessages(999999)).rejects.toThrow("Group not found or access denied");
  });

  it("cross-tenant group → Group not found or access denied", async () => {
    mockUser(adminB);
    const g = await createGroup("CrossGrp", "", [chatUserB.id]);

    mockUser(chatUserA1);
    await expect(getGroupMessages(g.id)).rejects.toThrow("Group not found or access denied");
  });

  it("non-member → Group not found or access denied", async () => {
    mockUser(chatUserA1);
    const g = await createGroup("PrivateGrp", "", [chatUserA2.id]);

    mockUser(chatUserA3);
    await expect(getGroupMessages(g.id)).rejects.toThrow("Group not found or access denied");
  });

  it("response shape: { id, content, senderId, groupId, createdAt, sender: { name } }", async () => {
    mockUser(chatUserA1);
    const g = await createGroup("ShapeGrp", "", [chatUserA2.id]);
    await sendGroupMessage(g.id, "shape test");

    const msgs = await getGroupMessages(g.id);
    expect(msgs).toHaveLength(1);
    const msg = msgs[0];
    expect(msg).toHaveProperty("id");
    expect(msg).toHaveProperty("content");
    expect(msg).toHaveProperty("senderId");
    expect(msg).toHaveProperty("groupId");
    expect(msg).toHaveProperty("createdAt");
    expect(msg).toHaveProperty("sender");
    expect(msg.sender).toHaveProperty("name");
    // Should NOT have receiverId or companyId
    expect(msg).not.toHaveProperty("receiverId");
    expect(msg).not.toHaveProperty("companyId");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// sendMessage
// ═════════════════════════════════════════════════════════════════════════════

describe("sendMessage", () => {
  it("creates DM in DB, verified via prisma.message.findFirst", async () => {
    mockUser(chatUserA1);
    await sendMessage(chatUserA2.id, "Hello!");

    const msg = await prisma.message.findFirst({
      where: { senderId: chatUserA1.id, receiverId: chatUserA2.id, content: "Hello!" },
    });
    expect(msg).not.toBeNull();
    expect(msg!.companyId).toBe(companyA);
    expect(msg!.read).toBe(false);
    expect(msg!.groupId).toBeNull();
  });

  it("stored with correct companyId, senderId, receiverId, content, read=false", async () => {
    mockUser(chatUserA1);
    await sendMessage(chatUserA2.id, "Verify fields");

    const msg = await prisma.message.findFirst({
      where: { senderId: chatUserA1.id, content: "Verify fields" },
    });
    expect(msg).not.toBeNull();
    expect(msg!.companyId).toBe(companyA);
    expect(msg!.senderId).toBe(chatUserA1.id);
    expect(msg!.receiverId).toBe(chatUserA2.id);
    expect(msg!.read).toBe(false);
  });

  it("calls redisPublisher.publish with correct channel", async () => {
    mockUser(chatUserA1);
    await sendMessage(chatUserA2.id, "Redis test");

    expect(redisPublisher.publish).toHaveBeenCalledWith(
      `company:${companyA}:user:${chatUserA2.id}:chat`,
      expect.stringContaining('"type":"new-message"'),
    );
  });

  it("validation: empty content → Invalid input + no DB row", async () => {
    mockUser(chatUserA1);
    await expect(sendMessage(chatUserA2.id, "")).rejects.toThrow("Invalid input");

    const count = await prisma.message.count({
      where: { senderId: chatUserA1.id, receiverId: chatUserA2.id },
    });
    expect(count).toBe(0);
  });

  it("validation: whitespace-only content → Invalid input", async () => {
    mockUser(chatUserA1);
    await expect(sendMessage(chatUserA2.id, "   ")).rejects.toThrow("Invalid input");
  });

  it("validation: >5000 chars → Invalid input", async () => {
    mockUser(chatUserA1);
    await expect(sendMessage(chatUserA2.id, "x".repeat(5001))).rejects.toThrow("Invalid input");
  });

  it("validation: non-positive receiverId → Invalid input", async () => {
    mockUser(chatUserA1);
    await expect(sendMessage(0, "hi")).rejects.toThrow("Invalid input");
    await expect(sendMessage(-1, "hi")).rejects.toThrow("Invalid input");
  });

  it("content trimmed before storage", async () => {
    mockUser(chatUserA1);
    await sendMessage(chatUserA2.id, "  trimmed  ");

    const msg = await prisma.message.findFirst({
      where: { senderId: chatUserA1.id, receiverId: chatUserA2.id },
    });
    expect(msg!.content).toBe("trimmed");
  });

  it("boundary: exactly 5000 chars succeeds", async () => {
    mockUser(chatUserA1);
    const longContent = "x".repeat(5000);
    await sendMessage(chatUserA2.id, longContent);

    const msg = await prisma.message.findFirst({
      where: { senderId: chatUserA1.id, receiverId: chatUserA2.id },
    });
    expect(msg).not.toBeNull();
    expect(msg!.content).toBe(longContent);
  });

  it("self-message → Invalid input", async () => {
    mockUser(chatUserA1);
    await expect(sendMessage(chatUserA1.id, "self")).rejects.toThrow("Invalid input");
  });

  it("cross-tenant receiver → User not found or access denied", async () => {
    mockUser(chatUserA1);
    await expect(sendMessage(chatUserB.id, "cross")).rejects.toThrow("User not found or access denied");
  });

  it("non-existent receiverId → User not found or access denied", async () => {
    mockUser(chatUserA1);
    await expect(sendMessage(999999, "ghost")).rejects.toThrow("User not found or access denied");
  });

  it("Redis publish failure doesn't throw (message still persisted)", async () => {
    vi.mocked(redisPublisher.publish).mockRejectedValue(new Error("Redis down"));
    mockUser(chatUserA1);
    await sendMessage(chatUserA2.id, "survives redis failure");

    const msg = await prisma.message.findFirst({
      where: { senderId: chatUserA1.id, content: "survives redis failure" },
    });
    expect(msg).not.toBeNull();
  });

  it("unicode/special chars preserved", async () => {
    mockUser(chatUserA1);
    const unicode = "שלום 🎉 مرحبا <script>alert(1)</script>";
    await sendMessage(chatUserA2.id, unicode);

    const msg = await prisma.message.findFirst({
      where: { senderId: chatUserA1.id, receiverId: chatUserA2.id },
    });
    expect(msg!.content).toBe(unicode);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// sendGroupMessage
// ═════════════════════════════════════════════════════════════════════════════

describe("sendGroupMessage", () => {
  it("creates group message in DB (groupId set, receiverId null)", async () => {
    mockUser(chatUserA1);
    const g = await createGroup("SendGrpGroup", "", [chatUserA2.id]);
    await sendGroupMessage(g.id, "Hello group");

    const msg = await prisma.message.findFirst({
      where: { groupId: g.id, senderId: chatUserA1.id },
    });
    expect(msg).not.toBeNull();
    expect(msg!.groupId).toBe(g.id);
    expect(msg!.receiverId).toBeNull();
    expect(msg!.content).toBe("Hello group");
  });

  it("Redis publish to each member except sender", async () => {
    mockUser(chatUserA1);
    const g = await createGroup("RedisPubGrp", "", [chatUserA2.id, chatUserA3.id]);
    vi.mocked(redisPublisher.publish).mockClear();

    await sendGroupMessage(g.id, "broadcast");

    // Should publish to chatUserA2 and chatUserA3, but not chatUserA1
    expect(redisPublisher.publish).toHaveBeenCalledTimes(2);
    expect(redisPublisher.publish).toHaveBeenCalledWith(
      `company:${companyA}:user:${chatUserA2.id}:chat`,
      expect.any(String),
    );
    expect(redisPublisher.publish).toHaveBeenCalledWith(
      `company:${companyA}:user:${chatUserA3.id}:chat`,
      expect.any(String),
    );
  });

  it("validation: empty content → Invalid input", async () => {
    mockUser(chatUserA1);
    const g = await createGroup("ValGrp1", "", [chatUserA2.id]);
    await expect(sendGroupMessage(g.id, "")).rejects.toThrow("Invalid input");
  });

  it("validation: whitespace content → Invalid input", async () => {
    mockUser(chatUserA1);
    const g = await createGroup("ValGrp2", "", [chatUserA2.id]);
    await expect(sendGroupMessage(g.id, "   ")).rejects.toThrow("Invalid input");
  });

  it("validation: >5000 chars → Invalid input", async () => {
    mockUser(chatUserA1);
    const g = await createGroup("ValGrp3", "", [chatUserA2.id]);
    await expect(sendGroupMessage(g.id, "x".repeat(5001))).rejects.toThrow("Invalid input");
  });

  it("boundary: 5000 chars succeeds", async () => {
    mockUser(chatUserA1);
    const g = await createGroup("BoundGrp", "", [chatUserA2.id]);
    await sendGroupMessage(g.id, "x".repeat(5000));

    const msg = await prisma.message.findFirst({ where: { groupId: g.id } });
    expect(msg).not.toBeNull();
  });

  it("validation: invalid groupId → Invalid input", async () => {
    mockUser(chatUserA1);
    await expect(sendGroupMessage(0, "hi")).rejects.toThrow("Invalid input");
    await expect(sendGroupMessage(-1, "hi")).rejects.toThrow("Invalid input");
  });

  it("non-existent group → error", async () => {
    mockUser(chatUserA1);
    await expect(sendGroupMessage(999999, "hi")).rejects.toThrow("Group not found or access denied");
  });

  it("cross-tenant group → error", async () => {
    mockUser(adminB);
    const g = await createGroup("CrossGrpMsg", "", [chatUserB.id]);

    mockUser(chatUserA1);
    await expect(sendGroupMessage(g.id, "cross")).rejects.toThrow("Group not found or access denied");
  });

  it("non-member → error", async () => {
    mockUser(chatUserA1);
    const g = await createGroup("PrivGrpMsg", "", [chatUserA2.id]);

    mockUser(chatUserA3);
    await expect(sendGroupMessage(g.id, "intruder")).rejects.toThrow("Group not found or access denied");
  });

  it("Redis failure doesn't throw (message persisted)", async () => {
    mockUser(chatUserA1);
    const g = await createGroup("RedisFailGrp", "", [chatUserA2.id]);
    vi.mocked(redisPublisher.publish).mockRejectedValue(new Error("Redis down"));

    await sendGroupMessage(g.id, "survives");

    const msg = await prisma.message.findFirst({ where: { groupId: g.id } });
    expect(msg).not.toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// markAsRead
// ═════════════════════════════════════════════════════════════════════════════

describe("markAsRead", () => {
  it("validation: non-positive id → Invalid input", async () => {
    mockUser(chatUserA1);
    await expect(markAsRead(0)).rejects.toThrow("Invalid input");
    await expect(markAsRead(-1)).rejects.toThrow("Invalid input");
  });

  it("validation: invalid type enum → Invalid input", async () => {
    mockUser(chatUserA1);
    await expect(markAsRead(1, "invalid" as any)).rejects.toThrow("Invalid input");
  });

  it("defaults to type=user when omitted", async () => {
    // Create an unread DM from chatUserA2 → chatUserA1
    await prisma.message.create({
      data: { companyId: companyA, content: "unread", senderId: chatUserA2.id, receiverId: chatUserA1.id, read: false },
    });

    mockUser(chatUserA1);
    await markAsRead(chatUserA2.id); // no type param

    const msg = await prisma.message.findFirst({
      where: { senderId: chatUserA2.id, receiverId: chatUserA1.id },
    });
    expect(msg!.read).toBe(true);
  });

  describe("type=user", () => {
    it("marks all unread DMs from sender as read, verified in DB", async () => {
      await prisma.message.createMany({
        data: [
          { companyId: companyA, content: "a", senderId: chatUserA2.id, receiverId: chatUserA1.id, read: false },
          { companyId: companyA, content: "b", senderId: chatUserA2.id, receiverId: chatUserA1.id, read: false },
        ],
      });

      mockUser(chatUserA1);
      await markAsRead(chatUserA2.id, "user");

      const unread = await prisma.message.count({
        where: { senderId: chatUserA2.id, receiverId: chatUserA1.id, read: false },
      });
      expect(unread).toBe(0);
    });

    it("doesn't mark messages from other senders", async () => {
      await prisma.message.createMany({
        data: [
          { companyId: companyA, content: "from A2", senderId: chatUserA2.id, receiverId: chatUserA1.id, read: false },
          { companyId: companyA, content: "from A3", senderId: chatUserA3.id, receiverId: chatUserA1.id, read: false },
        ],
      });

      mockUser(chatUserA1);
      await markAsRead(chatUserA2.id, "user");

      const a3Unread = await prisma.message.findFirst({
        where: { senderId: chatUserA3.id, receiverId: chatUserA1.id },
      });
      expect(a3Unread!.read).toBe(false);
    });

    it("no-op when already read", async () => {
      await prisma.message.create({
        data: { companyId: companyA, content: "already read", senderId: chatUserA2.id, receiverId: chatUserA1.id, read: true },
      });

      mockUser(chatUserA1);
      await markAsRead(chatUserA2.id, "user"); // should not throw
    });

    it("non-existent sender → error", async () => {
      mockUser(chatUserA1);
      await expect(markAsRead(999999, "user")).rejects.toThrow("User not found or access denied");
    });

    it("cross-tenant sender → error", async () => {
      mockUser(chatUserA1);
      await expect(markAsRead(chatUserB.id, "user")).rejects.toThrow("User not found or access denied");
    });
  });

  describe("type=group", () => {
    it("updates GroupMember.lastReadAt, verified in DB", async () => {
      mockUser(chatUserA1);
      const g = await createGroup("MarkGrp", "", [chatUserA2.id]);

      const before = await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId: g.id, userId: chatUserA1.id } },
      });

      await new Promise((r) => setTimeout(r, 50));
      await markAsRead(g.id, "group");

      const after = await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId: g.id, userId: chatUserA1.id } },
      });
      expect(after!.lastReadAt.getTime()).toBeGreaterThan(before!.lastReadAt.getTime());
    });

    it("non-existent group → error", async () => {
      mockUser(chatUserA1);
      await expect(markAsRead(999999, "group")).rejects.toThrow("Group not found or access denied");
    });

    it("cross-tenant group → error", async () => {
      mockUser(adminB);
      const g = await createGroup("CrossMarkGrp", "", [chatUserB.id]);

      mockUser(chatUserA1);
      await expect(markAsRead(g.id, "group")).rejects.toThrow("Group not found or access denied");
    });

    it("non-member → Prisma error", async () => {
      mockUser(chatUserA1);
      const g = await createGroup("NonMemMarkGrp", "", [chatUserA2.id]);

      mockUser(chatUserA3);
      // chatUserA3 is not a member — Prisma update on missing unique throws
      await expect(markAsRead(g.id, "group")).rejects.toThrow();
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// getUnreadCounts
// ═════════════════════════════════════════════════════════════════════════════

describe("getUnreadCounts", () => {
  it("returns unread DM counts grouped by senderId", async () => {
    await prisma.message.createMany({
      data: [
        { companyId: companyA, content: "a", senderId: chatUserA2.id, receiverId: chatUserA1.id, read: false },
        { companyId: companyA, content: "b", senderId: chatUserA2.id, receiverId: chatUserA1.id, read: false },
        { companyId: companyA, content: "c", senderId: chatUserA3.id, receiverId: chatUserA1.id, read: false },
      ],
    });

    mockUser(chatUserA1);
    const counts = await getUnreadCounts();
    const dmCounts = counts.filter((c: any) => c.type === "user");
    expect(dmCounts.find((c: any) => c.id === chatUserA2.id)?.count).toBe(2);
    expect(dmCounts.find((c: any) => c.id === chatUserA3.id)?.count).toBe(1);
  });

  it("returns unread group counts (messages after lastReadAt)", async () => {
    mockUser(chatUserA1);
    const g = await createGroup("UnreadGrp", "", [chatUserA2.id]);

    // Mark as read (sets lastReadAt to now)
    await markAsRead(g.id, "group");
    await new Promise((r) => setTimeout(r, 50));

    // chatUserA2 sends a message after lastReadAt
    mockUser(chatUserA2);
    await sendGroupMessage(g.id, "new msg");

    mockUser(chatUserA1);
    const counts = await getUnreadCounts();
    const grpCounts = counts.filter((c: any) => c.type === "group");
    expect(grpCounts.find((c: any) => c.id === g.id)?.count).toBe(1);
  });

  it("empty array when nothing unread", async () => {
    mockUser(chatUserA1);
    const counts = await getUnreadCounts();
    expect(counts).toEqual([]);
  });

  it("doesn't count own messages in group", async () => {
    mockUser(chatUserA1);
    const g = await createGroup("OwnMsgGrp", "", [chatUserA2.id]);
    await markAsRead(g.id, "group");
    await new Promise((r) => setTimeout(r, 50));

    // Send own message
    await sendGroupMessage(g.id, "my own msg");

    const counts = await getUnreadCounts();
    const grpCounts = counts.filter((c: any) => c.type === "group" && c.id === g.id);
    // Own messages should not count as unread
    expect(grpCounts.length === 0 || grpCounts[0].count === 0).toBe(true);
  });

  it("filters out groups with 0 unread", async () => {
    mockUser(chatUserA1);
    const g = await createGroup("ZeroUnreadGrp", "", [chatUserA2.id]);
    // Mark as read and don't send new messages
    await markAsRead(g.id, "group");

    const counts = await getUnreadCounts();
    const grpCounts = counts.filter((c: any) => c.type === "group");
    expect(grpCounts.every((c: any) => c.count > 0)).toBe(true);
  });

  it("response shape: { type, id, count }", async () => {
    await prisma.message.create({
      data: { companyId: companyA, content: "x", senderId: chatUserA2.id, receiverId: chatUserA1.id, read: false },
    });

    mockUser(chatUserA1);
    const counts = await getUnreadCounts();
    expect(counts.length).toBeGreaterThan(0);
    const entry = counts[0];
    expect(entry).toHaveProperty("type");
    expect(entry).toHaveProperty("id");
    expect(entry).toHaveProperty("count");
    expect(Object.keys(entry).sort()).toEqual(["count", "id", "type"]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// createGroup
// ═════════════════════════════════════════════════════════════════════════════

describe("createGroup", () => {
  it("creates group in DB with correct fields, creator as member", async () => {
    mockUser(chatUserA1);
    const g = await createGroup("TestGroup", "https://example.com/img.png", [chatUserA2.id]);

    const dbGroup = await prisma.group.findUnique({ where: { id: g.id } });
    expect(dbGroup).not.toBeNull();
    expect(dbGroup!.name).toBe("TestGroup");
    expect(dbGroup!.imageUrl).toBe("https://example.com/img.png");
    expect(dbGroup!.creatorId).toBe(chatUserA1.id);
    expect(dbGroup!.companyId).toBe(companyA);

    // Creator should be a member
    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: g.id, userId: chatUserA1.id } },
    });
    expect(membership).not.toBeNull();
  });

  it("adds memberIds as GroupMember rows", async () => {
    mockUser(chatUserA1);
    const g = await createGroup("MemGroup", "", [chatUserA2.id, chatUserA3.id]);

    const members = await prisma.groupMember.findMany({ where: { groupId: g.id } });
    const memberIds = members.map((m: any) => m.userId).sort();
    expect(memberIds).toEqual([chatUserA1.id, chatUserA2.id, chatUserA3.id].sort());
  });

  it("no duplicate if current user in memberIds", async () => {
    mockUser(chatUserA1);
    const g = await createGroup("DedupGroup", "", [chatUserA1.id, chatUserA2.id]);

    const members = await prisma.groupMember.findMany({ where: { groupId: g.id } });
    const creatorCount = members.filter((m: any) => m.userId === chatUserA1.id).length;
    expect(creatorCount).toBe(1);
  });

  it("validation: empty name → Invalid input", async () => {
    mockUser(chatUserA1);
    await expect(createGroup("", "", [chatUserA2.id])).rejects.toThrow("Invalid input");
  });

  it("validation: >100 char name → Invalid input", async () => {
    mockUser(chatUserA1);
    await expect(createGroup("x".repeat(101), "", [chatUserA2.id])).rejects.toThrow("Invalid input");
  });

  it("validation: empty memberIds → Invalid input", async () => {
    mockUser(chatUserA1);
    await expect(createGroup("NoMembers", "", [])).rejects.toThrow("Invalid input");
  });

  it("validation: >200 memberIds → Invalid input", async () => {
    mockUser(chatUserA1);
    const bigIds = Array.from({ length: 201 }, (_, i) => i + 1);
    await expect(createGroup("BigGroup", "", bigIds)).rejects.toThrow("Invalid input");
  });

  it("validation: >2048 imageUrl → Invalid input", async () => {
    mockUser(chatUserA1);
    await expect(createGroup("LongUrl", "https://example.com/" + "x".repeat(2048), [chatUserA2.id])).rejects.toThrow("Invalid input");
  });

  it("boundary: 100 char name succeeds", async () => {
    mockUser(chatUserA1);
    const g = await createGroup("x".repeat(100), "", [chatUserA2.id]);
    expect(g.name).toBe("x".repeat(100));
  });

  it("boundary: 200 memberIds succeeds", async () => {
    mockUser(chatUserA1);
    // Use real IDs (mostly non-existent — cross-tenant check filters them)
    // At minimum chatUserA2 is real and same company
    const ids = [chatUserA2.id, ...Array.from({ length: 199 }, (_, i) => 900000 + i)];
    const g = await createGroup("BigMemGroup", "", ids);
    expect(g).toHaveProperty("id");
  });

  it("cross-tenant: filters out companyB memberIds silently", async () => {
    mockUser(chatUserA1);
    const g = await createGroup("CrossMemGroup", "", [chatUserA2.id, chatUserB.id]);

    const members = await prisma.groupMember.findMany({ where: { groupId: g.id } });
    const memberIds = members.map((m: any) => m.userId);
    expect(memberIds).toContain(chatUserA2.id);
    expect(memberIds).not.toContain(chatUserB.id);
  });

  it("imageUrl sanitization: javascript: → empty string", async () => {
    mockUser(chatUserA1);
    const g = await createGroup("JsSanitize", "javascript:alert(1)", [chatUserA2.id]);
    const dbGroup = await prisma.group.findUnique({ where: { id: g.id } });
    expect(dbGroup!.imageUrl).toBe("");
  });

  it("imageUrl sanitization: data: → empty string", async () => {
    mockUser(chatUserA1);
    const g = await createGroup("DataSanitize", "data:text/html,<script>alert(1)</script>", [chatUserA2.id]);
    const dbGroup = await prisma.group.findUnique({ where: { id: g.id } });
    expect(dbGroup!.imageUrl).toBe("");
  });

  it("imageUrl sanitization: valid http/https preserved", async () => {
    mockUser(chatUserA1);
    const url = "https://cdn.example.com/avatar.png";
    const g = await createGroup("HttpSanitize", url, [chatUserA2.id]);
    const dbGroup = await prisma.group.findUnique({ where: { id: g.id } });
    expect(dbGroup!.imageUrl).toBe(url);
  });

  it("group limit: throws Group limit reached at 200 groups", async () => {
    // Create 200 groups directly in DB
    const groupData = Array.from({ length: 200 }, (_, i) => ({
      companyId: companyA,
      name: `limit-group-${i}`,
      creatorId: chatUserA1.id,
    }));
    await prisma.group.createMany({ data: groupData });

    mockUser(chatUserA1);
    await expect(createGroup("OneMore", "", [chatUserA2.id])).rejects.toThrow("Group limit reached");
  });

  it("response shape: { id, name, imageUrl, creatorId, createdAt, updatedAt }", async () => {
    mockUser(chatUserA1);
    const g = await createGroup("ShapeTest", "", [chatUserA2.id]);
    const keys = Object.keys(g).sort();
    expect(keys).toEqual(["createdAt", "creatorId", "id", "imageUrl", "name", "updatedAt"].sort());
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// updateGroup
// ═════════════════════════════════════════════════════════════════════════════

describe("updateGroup", () => {
  it("updates name/imageUrl in DB", async () => {
    mockUser(chatUserA1);
    const g = await createGroup("OldName", "", [chatUserA2.id]);
    await updateGroup(g.id, "NewName", "https://new.img/pic.png", [chatUserA2.id]);

    const dbGroup = await prisma.group.findUnique({ where: { id: g.id } });
    expect(dbGroup!.name).toBe("NewName");
    expect(dbGroup!.imageUrl).toBe("https://new.img/pic.png");
  });

  it("transaction: adds new members, removes absent members", async () => {
    mockUser(chatUserA1);
    const g = await createGroup("MemUpdateGrp", "", [chatUserA2.id]);

    // Update: remove chatUserA2, add chatUserA3
    await updateGroup(g.id, "MemUpdateGrp", "", [chatUserA3.id]);

    const members = await prisma.groupMember.findMany({ where: { groupId: g.id } });
    const ids = members.map((m: any) => m.userId);
    expect(ids).toContain(chatUserA1.id); // creator stays
    expect(ids).toContain(chatUserA3.id); // added
    expect(ids).not.toContain(chatUserA2.id); // removed
  });

  it("current user always stays as member", async () => {
    mockUser(chatUserA1);
    const g = await createGroup("KeepMeGrp", "", [chatUserA2.id]);

    // Update with memberIds that don't include current user
    await updateGroup(g.id, "KeepMeGrp", "", [chatUserA2.id]);

    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: g.id, userId: chatUserA1.id } },
    });
    expect(membership).not.toBeNull();
  });

  it("validation: invalid groupId → Invalid input", async () => {
    mockUser(chatUserA1);
    await expect(updateGroup(0, "name", "", [chatUserA2.id])).rejects.toThrow("Invalid input");
    await expect(updateGroup(-1, "name", "", [chatUserA2.id])).rejects.toThrow("Invalid input");
  });

  it("validation: empty name → Invalid input", async () => {
    mockUser(chatUserA1);
    const g = await createGroup("WillUpdate", "", [chatUserA2.id]);
    await expect(updateGroup(g.id, "", "", [chatUserA2.id])).rejects.toThrow("Invalid input");
  });

  it("validation: >100 char name → Invalid input", async () => {
    mockUser(chatUserA1);
    const g = await createGroup("WillUpdate2", "", [chatUserA2.id]);
    await expect(updateGroup(g.id, "x".repeat(101), "", [chatUserA2.id])).rejects.toThrow("Invalid input");
  });

  it("validation: empty memberIds → Invalid input", async () => {
    mockUser(chatUserA1);
    const g = await createGroup("WillUpdate3", "", [chatUserA2.id]);
    await expect(updateGroup(g.id, "name", "", [])).rejects.toThrow("Invalid input");
  });

  it("validation: >200 memberIds → Invalid input", async () => {
    mockUser(chatUserA1);
    const g = await createGroup("WillUpdate4", "", [chatUserA2.id]);
    const bigIds = Array.from({ length: 201 }, (_, i) => i + 1);
    await expect(updateGroup(g.id, "name", "", bigIds)).rejects.toThrow("Invalid input");
  });

  it("non-existent group → error", async () => {
    mockUser(chatUserA1);
    await expect(updateGroup(999999, "name", "", [chatUserA2.id])).rejects.toThrow("Group not found or access denied");
  });

  it("cross-tenant group → error", async () => {
    mockUser(adminB);
    const g = await createGroup("CrossUpdate", "", [chatUserB.id]);

    mockUser(chatUserA1);
    await expect(updateGroup(g.id, "hacked", "", [chatUserA2.id])).rejects.toThrow("Group not found or access denied");
  });

  it("non-member → error", async () => {
    mockUser(chatUserA1);
    const g = await createGroup("NonMemUpdate", "", [chatUserA2.id]);

    mockUser(chatUserA3);
    await expect(updateGroup(g.id, "hacked", "", [chatUserA3.id])).rejects.toThrow("Group not found or access denied");
  });

  it("cross-tenant: filters out companyB memberIds", async () => {
    mockUser(chatUserA1);
    const g = await createGroup("CrossMemUpdate", "", [chatUserA2.id]);
    await updateGroup(g.id, "CrossMemUpdate", "", [chatUserA2.id, chatUserB.id]);

    const members = await prisma.groupMember.findMany({ where: { groupId: g.id } });
    const ids = members.map((m: any) => m.userId);
    expect(ids).not.toContain(chatUserB.id);
  });

  it("imageUrl sanitization works", async () => {
    mockUser(chatUserA1);
    const g = await createGroup("SanitizeUpdate", "", [chatUserA2.id]);
    await updateGroup(g.id, "SanitizeUpdate", "javascript:void(0)", [chatUserA2.id]);

    const dbGroup = await prisma.group.findUnique({ where: { id: g.id } });
    expect(dbGroup!.imageUrl).toBe("");
  });

  it("handles simultaneous add+remove", async () => {
    mockUser(chatUserA1);
    const g = await createGroup("SimulGrp", "", [chatUserA2.id, chatUserA3.id]);

    // Remove A2, keep A3, add adminA
    await updateGroup(g.id, "SimulGrp", "", [chatUserA3.id, adminA.id]);

    const members = await prisma.groupMember.findMany({ where: { groupId: g.id } });
    const ids = members.map((m: any) => m.userId);
    expect(ids).toContain(chatUserA1.id); // always stays
    expect(ids).toContain(chatUserA3.id); // kept
    expect(ids).toContain(adminA.id); // added
    expect(ids).not.toContain(chatUserA2.id); // removed
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Multi-Step Flows
// ═════════════════════════════════════════════════════════════════════════════

describe("Multi-Step Flows", () => {
  it("send DM → getUnreadCounts (1 unread) → markAsRead → getUnreadCounts (0)", async () => {
    // chatUserA2 sends DM to chatUserA1
    mockUser(chatUserA2);
    await sendMessage(chatUserA1.id, "hey");

    // chatUserA1 checks unread
    mockUser(chatUserA1);
    let counts = await getUnreadCounts();
    const dmCount = counts.find((c: any) => c.type === "user" && c.id === chatUserA2.id);
    expect(dmCount?.count).toBe(1);

    // Mark as read
    await markAsRead(chatUserA2.id, "user");

    // Now 0 unread
    counts = await getUnreadCounts();
    const dmCountAfter = counts.find((c: any) => c.type === "user" && c.id === chatUserA2.id);
    expect(dmCountAfter).toBeUndefined();
  });

  it("createGroup → sendGroupMessage → getGroupMessages returns the message", async () => {
    mockUser(chatUserA1);
    const g = await createGroup("FlowGrp1", "", [chatUserA2.id]);
    await sendGroupMessage(g.id, "flow msg");

    const msgs = await getGroupMessages(g.id);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].content).toBe("flow msg");
    expect(msgs[0].senderId).toBe(chatUserA1.id);
  });

  it("createGroup → getGroups includes it → updateGroup members → verify DB", async () => {
    mockUser(chatUserA1);
    const g = await createGroup("FlowGrp2", "", [chatUserA2.id]);

    const groups = await getGroups();
    expect(groups.some((gr: any) => gr.id === g.id)).toBe(true);

    await updateGroup(g.id, "FlowGrp2-Updated", "", [chatUserA2.id, chatUserA3.id]);

    const members = await prisma.groupMember.findMany({ where: { groupId: g.id } });
    const ids = members.map((m: any) => m.userId).sort();
    expect(ids).toEqual([chatUserA1.id, chatUserA2.id, chatUserA3.id].sort());
  });

  it("multiple DMs → getMessages returns all chronologically", async () => {
    mockUser(chatUserA1);
    await sendMessage(chatUserA2.id, "msg1");
    await new Promise((r) => setTimeout(r, 50));
    await sendMessage(chatUserA2.id, "msg2");
    await new Promise((r) => setTimeout(r, 50));

    // chatUserA2 replies
    mockUser(chatUserA2);
    await sendMessage(chatUserA1.id, "msg3");

    mockUser(chatUserA1);
    const msgs = await getMessages(chatUserA2.id);
    expect(msgs).toHaveLength(3);
    expect(msgs[0].content).toBe("msg1");
    expect(msgs[1].content).toBe("msg2");
    expect(msgs[2].content).toBe("msg3");
  });

  it("send DM → getUsers sorts that user first by lastMessageAt", async () => {
    // Send DM to chatUserA3
    mockUser(chatUserA1);
    await sendMessage(chatUserA3.id, "recent");

    const users = await getUsers();
    const usersWithDM = users.filter((u: any) => u.lastMessageAt !== null);
    expect(usersWithDM.length).toBeGreaterThan(0);
    expect(usersWithDM[0].id).toBe(chatUserA3.id);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Data Integrity
// ═════════════════════════════════════════════════════════════════════════════

describe("Data Integrity", () => {
  it("sendMessage: DB row has all correct fields", async () => {
    mockUser(chatUserA1);
    await sendMessage(chatUserA2.id, "integrity check");

    const msg = await prisma.message.findFirst({
      where: { senderId: chatUserA1.id, content: "integrity check" },
    });
    expect(msg).not.toBeNull();
    expect(msg!.companyId).toBe(companyA);
    expect(msg!.senderId).toBe(chatUserA1.id);
    expect(msg!.receiverId).toBe(chatUserA2.id);
    expect(msg!.groupId).toBeNull();
    expect(msg!.read).toBe(false);
    expect(msg!.createdAt).toBeInstanceOf(Date);
  });

  it("createGroup: Group + GroupMember rows verified", async () => {
    mockUser(chatUserA1);
    const g = await createGroup("IntegrityGrp", "https://example.com/a.png", [chatUserA2.id, chatUserA3.id]);

    const dbGroup = await prisma.group.findUnique({ where: { id: g.id } });
    expect(dbGroup!.companyId).toBe(companyA);
    expect(dbGroup!.creatorId).toBe(chatUserA1.id);

    const members = await prisma.groupMember.findMany({
      where: { groupId: g.id },
      orderBy: { userId: "asc" },
    });
    expect(members).toHaveLength(3);
    members.forEach((m: any) => {
      expect(m.companyId).toBe(companyA);
      expect(m.groupId).toBe(g.id);
    });
  });

  it("updateGroup: removed members gone, added members present", async () => {
    mockUser(chatUserA1);
    const g = await createGroup("IntUpdGrp", "", [chatUserA2.id]);
    await updateGroup(g.id, "IntUpdGrp", "", [chatUserA3.id]);

    const members = await prisma.groupMember.findMany({ where: { groupId: g.id } });
    const ids = members.map((m: any) => m.userId);
    expect(ids).toContain(chatUserA1.id);
    expect(ids).toContain(chatUserA3.id);
    expect(ids).not.toContain(chatUserA2.id);
  });

  it("markAsRead(user): messages have read=true in DB", async () => {
    await prisma.message.createMany({
      data: [
        { companyId: companyA, content: "a", senderId: chatUserA2.id, receiverId: chatUserA1.id, read: false },
        { companyId: companyA, content: "b", senderId: chatUserA2.id, receiverId: chatUserA1.id, read: false },
      ],
    });

    mockUser(chatUserA1);
    await markAsRead(chatUserA2.id, "user");

    const msgs = await prisma.message.findMany({
      where: { senderId: chatUserA2.id, receiverId: chatUserA1.id },
    });
    msgs.forEach((m: any) => expect(m.read).toBe(true));
  });

  it("markAsRead(group): GroupMember.lastReadAt updated", async () => {
    mockUser(chatUserA1);
    const g = await createGroup("IntMarkGrp", "", [chatUserA2.id]);

    const before = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: g.id, userId: chatUserA1.id } },
    });

    await new Promise((r) => setTimeout(r, 50));
    await markAsRead(g.id, "group");

    const after = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: g.id, userId: chatUserA1.id } },
    });
    expect(after!.lastReadAt.getTime()).toBeGreaterThan(before!.lastReadAt.getTime());
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Response Shape
// ═════════════════════════════════════════════════════════════════════════════

describe("Response Shape", () => {
  it("getUsers: no companyId, passwordHash, email, permissions leaked", async () => {
    mockUser(chatUserA1);
    const users = await getUsers();
    expect(users.length).toBeGreaterThan(0);
    users.forEach((u: any) => {
      expect(u).not.toHaveProperty("companyId");
      expect(u).not.toHaveProperty("passwordHash");
      expect(u).not.toHaveProperty("email");
      expect(u).not.toHaveProperty("permissions");
    });
  });

  it("getMessages: includes sender.name, receiver.name", async () => {
    await prisma.message.create({
      data: { companyId: companyA, content: "shape", senderId: chatUserA1.id, receiverId: chatUserA2.id },
    });

    mockUser(chatUserA1);
    const msgs = await getMessages(chatUserA2.id);
    expect(msgs[0].sender.name).toBe(chatUserA1.name);
    expect(msgs[0].receiver.name).toBe(chatUserA2.name);
  });

  it("getGroupMessages: includes sender.name, no receiver", async () => {
    mockUser(chatUserA1);
    const g = await createGroup("ShapeGrpMsg", "", [chatUserA2.id]);
    await sendGroupMessage(g.id, "shape");

    const msgs = await getGroupMessages(g.id);
    expect(msgs[0].sender.name).toBe(chatUserA1.name);
    expect(msgs[0]).not.toHaveProperty("receiver");
    expect(msgs[0]).not.toHaveProperty("receiverId");
  });

  it("getGroups: nested members with user sub-object", async () => {
    mockUser(chatUserA1);
    await createGroup("NestedShapeGrp", "", [chatUserA2.id]);

    const groups = await getGroups();
    const g = groups[0];
    expect(g.members.length).toBeGreaterThan(0);
    g.members.forEach((m: any) => {
      expect(m).toHaveProperty("userId");
      expect(m).toHaveProperty("lastReadAt");
      expect(m).toHaveProperty("user");
      expect(m.user).toHaveProperty("id");
      expect(m.user).toHaveProperty("name");
    });
  });

  it("createGroup: excludes companyId, members", async () => {
    mockUser(chatUserA1);
    const g = await createGroup("ExclShapeGrp", "", [chatUserA2.id]);
    expect(g).not.toHaveProperty("companyId");
    expect(g).not.toHaveProperty("members");
  });
});

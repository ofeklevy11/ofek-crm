import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// --- Mocks (must be before imports) ---
vi.mock("@/lib/permissions-server", () => ({
  getCurrentUser: vi.fn(),
  invalidateUserCache: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(),
  RATE_LIMITS: {
    api: { prefix: "api", max: 120, windowSeconds: 60 },
    userManagement: { prefix: "user-mgmt", max: 10, windowSeconds: 60 },
  },
}));
vi.mock("@/lib/db-retry", () => ({
  withRetry: vi.fn((fn: () => any) => fn()),
}));
vi.mock("@/lib/prisma-error", () => ({
  isPrismaError: vi.fn(),
}));
vi.mock("@/lib/audit", () => ({
  createAuditLog: vi.fn(),
}));
vi.mock("@/lib/session", () => ({
  revokeUserSessions: vi.fn(),
}));
vi.mock("@/lib/security/audit-security", () => ({
  logSecurityEvent: vi.fn(),
  SEC_PASSWORD_CHANGED: "SEC_PASSWORD_CHANGED",
  SEC_ROLE_CHANGED: "SEC_ROLE_CHANGED",
  SEC_PERMISSIONS_CHANGED: "SEC_PERMISSIONS_CHANGED",
}));
vi.mock("bcryptjs", () => ({
  default: { hash: vi.fn(), compare: vi.fn() },
}));
const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/logger", () => ({
  createLogger: vi.fn(() => mockLogger),
}));

import { GET, PATCH, DELETE } from "@/app/api/users/[id]/route";
import { getCurrentUser, invalidateUserCache } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { isPrismaError } from "@/lib/prisma-error";
import { createAuditLog } from "@/lib/audit";
import { revokeUserSessions } from "@/lib/session";
import { logSecurityEvent } from "@/lib/security/audit-security";
import bcrypt from "bcryptjs";

// --- Fixtures ---
const adminUser = {
  id: 1,
  companyId: 100,
  name: "Admin",
  email: "admin@test.com",
  role: "admin" as const,
  allowedWriteTableIds: [1, 2, 3],
  permissions: { canViewUsers: true },
  tablePermissions: { "1": "write" },
};

const managerUser = {
  id: 2,
  companyId: 100,
  name: "Manager",
  email: "manager@test.com",
  role: "manager" as const,
  allowedWriteTableIds: [1],
  permissions: { canViewUsers: true } as Record<string, boolean>,
  tablePermissions: {} as Record<string, string>,
};

const basicUser = {
  id: 3,
  companyId: 100,
  name: "Basic",
  email: "basic@test.com",
  role: "basic" as const,
  allowedWriteTableIds: [] as number[],
  permissions: {} as Record<string, boolean>,
  tablePermissions: {} as Record<string, string>,
};

const basicUserCanView = {
  id: 4,
  companyId: 100,
  name: "Viewer",
  email: "viewer@test.com",
  role: "basic" as const,
  allowedWriteTableIds: [] as number[],
  permissions: { canViewUsers: true } as Record<string, boolean>,
  tablePermissions: {} as Record<string, string>,
};

const targetUserRecord = {
  id: 5,
  name: "Target",
  email: "target@test.com",
  role: "basic" as const,
  allowedWriteTableIds: [] as number[],
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
  permissions: {},
  tablePermissions: {},
};

function buildParams(id: string | number) {
  return { params: Promise.resolve({ id: String(id) }) };
}

function makeReq(method = "GET", body?: unknown) {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new NextRequest(`http://localhost/api/users/5`, init);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(checkRateLimit).mockResolvedValue(null);
  vi.mocked(isPrismaError).mockReturnValue(false);
  vi.mocked(bcrypt.hash).mockResolvedValue("hashed_password" as never);
  vi.mocked(invalidateUserCache).mockResolvedValue(undefined);
  vi.mocked(revokeUserSessions).mockResolvedValue(undefined);
});

// ─── GET /api/users/:id ──────────────────────────────────────────────────
describe("GET /api/users/:id", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await GET(makeReq(), buildParams(5));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 429 when rate limited", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const rl = NextResponse.json({ error: "Rate limited" }, { status: 429 });
    vi.mocked(checkRateLimit).mockResolvedValue(rl);

    const res = await GET(makeReq(), buildParams(5));
    expect(res.status).toBe(429);
    expect(checkRateLimit).toHaveBeenCalledWith(
      String(adminUser.id),
      expect.objectContaining({ prefix: "api" }),
    );
  });

  it("returns 400 for non-numeric id", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const res = await GET(makeReq(), buildParams("abc"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid user ID" });
  });

  it("returns 400 for zero id", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const res = await GET(makeReq(), buildParams(0));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid user ID" });
  });

  it("returns 400 for negative id", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const res = await GET(makeReq(), buildParams(-1));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid user ID" });
  });

  it("allows self-access without canViewUsers", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ ...targetUserRecord, id: 3 } as any);

    // basicUser.id is 3, so access id 3
    const res = await GET(makeReq(), buildParams(3));
    expect(res.status).toBe(200);
  });

  it("returns 403 for non-self access without canViewUsers", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUser as any);
    const res = await GET(makeReq(), buildParams(5));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("allows non-self access with canViewUsers", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserCanView as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue(targetUserRecord as any);

    const res = await GET(makeReq(), buildParams(5));
    expect(res.status).toBe(200);
  });

  it("includes companyId in query", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue(targetUserRecord as any);

    await GET(makeReq(), buildParams(5));
    const call = vi.mocked(prisma.user.findFirst).mock.calls[0][0] as any;
    expect(call.where).toEqual(expect.objectContaining({ companyId: 100 }));
  });

  it("returns 404 when user not found", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);

    const res = await GET(makeReq(), buildParams(5));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "User not found" });
  });

  it("returns correct fields on success", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue(targetUserRecord as any);

    const res = await GET(makeReq(), buildParams(5));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(targetUserRecord);
    expect(body).not.toHaveProperty("passwordHash");
    // Assert at query level that the complete select clause is correct
    const call = vi.mocked(prisma.user.findFirst).mock.calls[0][0] as any;
    expect(call.select).toEqual({
      id: true, name: true, email: true, role: true,
      allowedWriteTableIds: true, createdAt: true, updatedAt: true,
      permissions: true, tablePermissions: true,
    });
  });

  it("returns 500 on database error", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findFirst).mockRejectedValue(new Error("DB down"));

    const res = await GET(makeReq(), buildParams(5));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to fetch user" });
    expect(mockLogger.error).toHaveBeenCalled();
  });
});

// ─── PATCH /api/users/:id ────────────────────────────────────────────────
describe("PATCH /api/users/:id", () => {
  // Auth
  it("returns 401 when not authenticated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await PATCH(makeReq("PATCH", { name: "New" }), buildParams(5));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 429 when rate limited", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const rl = NextResponse.json({ error: "Rate limited" }, { status: 429 });
    vi.mocked(checkRateLimit).mockResolvedValue(rl);

    const res = await PATCH(makeReq("PATCH", { name: "New" }), buildParams(5));
    expect(res.status).toBe(429);
    expect(checkRateLimit).toHaveBeenCalledWith(
      String(adminUser.id),
      expect.objectContaining({ prefix: "user-mgmt" }),
    );
  });

  it("returns 400 for invalid id", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const res = await PATCH(makeReq("PATCH", { name: "New" }), buildParams("abc"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid user ID" });
  });

  it("returns 400 for invalid JSON body", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const res = await PATCH(makeReq("PATCH", "not json{{{"), buildParams(5));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON body" });
  });

  it("returns 400 for validation failure", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const res = await PATCH(makeReq("PATCH", { name: "" }), buildParams(5));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.details).toBeDefined();
  });

  it("returns 400 for extra unknown fields (strict mode)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const res = await PATCH(makeReq("PATCH", { unknownField: "surprise" }), buildParams(5));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.details).toBeDefined();
  });

  it("returns 400 for non-numeric tablePermission key", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const res = await PATCH(makeReq("PATCH", { tablePermissions: { "abc": "write" } }), buildParams(5));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.details.tablePermissions).toBeDefined();
  });

  it("returns 400 for invalid tablePermission value", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const res = await PATCH(makeReq("PATCH", { tablePermissions: { "1": "invalid" } }), buildParams(5));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.details.tablePermissions).toBeDefined();
  });

  it("returns 400 for invalid email format", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const res = await PATCH(makeReq("PATCH", { email: "not-an-email" }), buildParams(5));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.details.email).toBeDefined();
  });

  it("returns 400 for unknown permission key", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const res = await PATCH(makeReq("PATCH", { permissions: { notARealPerm: true } }), buildParams(5));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.details.permissions).toBeDefined();
  });

  // Existence
  it("returns 404 when user not found", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);

    const res = await PATCH(makeReq("PATCH", { name: "New" }), buildParams(5));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "User not found" });
  });

  it("fetches existing user with id, email, and role for PATCH", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 5, email: "target@test.com", role: "basic" } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({ ...targetUserRecord } as any);

    await PATCH(makeReq("PATCH", { name: "Updated" }), buildParams(5));
    const call = vi.mocked(prisma.user.findFirst).mock.calls[0][0] as any;
    expect(call.where).toEqual({ id: 5, companyId: 100 });
    expect(call.select).toEqual({ id: true, email: true, role: true, name: true });
  });

  // Authorization (non-admin)
  it("returns 403 when non-admin tries to update another user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 5, email: "target@test.com", role: "basic" } as any);

    const res = await PATCH(makeReq("PATCH", { name: "Hacked" }), buildParams(5));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Only admins can update other users" });
  });

  it("returns 403 when non-admin tries to change role", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 3, email: "basic@test.com", role: "basic" } as any);

    const res = await PATCH(makeReq("PATCH", { role: "admin" }), buildParams(3));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Only admins can change role, permissions, or email" });
  });

  it("returns 403 when non-admin tries to change permissions", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 3, email: "basic@test.com", role: "basic" } as any);

    const res = await PATCH(makeReq("PATCH", { permissions: { canViewUsers: true } }), buildParams(3));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Only admins can change role, permissions, or email" });
  });

  it("returns 403 when non-admin tries to change tablePermissions", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 3, email: "basic@test.com", role: "basic" } as any);

    const res = await PATCH(makeReq("PATCH", { tablePermissions: { "1": "write" } }), buildParams(3));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Only admins can change role, permissions, or email" });
  });

  it("returns 403 when non-admin tries to change allowedWriteTableIds", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 3, email: "basic@test.com", role: "basic" } as any);

    const res = await PATCH(makeReq("PATCH", { allowedWriteTableIds: [1] }), buildParams(3));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Only admins can change role, permissions, or email" });
  });

  it("returns 403 when non-admin tries to change email", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 3, email: "basic@test.com", role: "basic" } as any);

    const res = await PATCH(makeReq("PATCH", { email: "newemail@test.com" }), buildParams(3));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Only admins can change role, permissions, or email" });
  });

  it("allows non-admin to update own name", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 3, email: "basic@test.com", role: "basic" } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({ ...targetUserRecord, id: 3, name: "Updated" } as any);

    const res = await PATCH(makeReq("PATCH", { name: "Updated" }), buildParams(3));
    expect(res.status).toBe(200);
    const call = vi.mocked(prisma.user.update).mock.calls[0][0] as any;
    expect(call.data.name).toBe("Updated");
  });

  it("allows non-admin to update own password", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 3, email: "basic@test.com", role: "basic", passwordHash: "existing_hash" } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({ ...targetUserRecord, id: 3 } as any);
    const bcrypt = await import("bcryptjs");
    vi.mocked(bcrypt.default.compare).mockResolvedValue(true as never);

    const res = await PATCH(makeReq("PATCH", { password: "newpassword123", currentPassword: "oldpassword123" }), buildParams(3));
    expect(res.status).toBe(200);
    const call = vi.mocked(prisma.user.update).mock.calls[0][0] as any;
    expect(call.data.passwordHash).toBe("hashed_password");
  });

  // Admin operations
  it("allows admin to assign admin role", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 5, email: "target@test.com", role: "basic" } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({ ...targetUserRecord, role: "admin" } as any);

    const res = await PATCH(makeReq("PATCH", { role: "admin" }), buildParams(5));
    expect(res.status).toBe(200);
    const call = vi.mocked(prisma.user.update).mock.calls[0][0] as any;
    expect(call.data.role).toBe("admin");
  });

  it("allows admin to change email", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 5, email: "target@test.com", role: "basic" } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as any);
    vi.mocked(prisma.user.update).mockResolvedValue({ ...targetUserRecord, email: "new@test.com" } as any);

    const res = await PATCH(makeReq("PATCH", { email: "new@test.com" }), buildParams(5));
    expect(res.status).toBe(200);
    const call = vi.mocked(prisma.user.update).mock.calls[0][0] as any;
    expect(call.data.email).toBe("new@test.com");
  });

  it("allows admin to change permissions", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 5, email: "target@test.com", role: "basic" } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({ ...targetUserRecord } as any);

    const res = await PATCH(makeReq("PATCH", { permissions: { canViewUsers: true } }), buildParams(5));
    expect(res.status).toBe(200);
    const call = vi.mocked(prisma.user.update).mock.calls[0][0] as any;
    expect(call.data.permissions).toEqual({ canViewUsers: true });
  });

  // Non-admin sensitive-field guard: manager cannot change own role
  it("returns 403 when manager tries to change own role", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(managerUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 2, email: "manager@test.com", role: "manager" } as any);

    const res = await PATCH(makeReq("PATCH", { role: "admin" }), buildParams(2));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Only admins can change role, permissions, or email" });
  });

  // Email uniqueness
  it("returns 400 when email is taken by another user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 5, email: "target@test.com", role: "basic" } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 99 } as any);

    const res = await PATCH(makeReq("PATCH", { email: "taken@test.com" }), buildParams(5));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Unable to update user with the provided details" });
  });

  it("checks email uniqueness with correct query arguments", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 5, email: "target@test.com", role: "basic" } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as any);
    vi.mocked(prisma.user.update).mockResolvedValue({ ...targetUserRecord } as any);

    await PATCH(makeReq("PATCH", { email: "new@test.com" }), buildParams(5));
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: "new@test.com" },
      select: { id: true },
    });
  });

  it("skips email uniqueness check when email unchanged", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 5, email: "target@test.com", role: "basic" } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({ ...targetUserRecord } as any);

    await PATCH(makeReq("PATCH", { email: "target@test.com" }), buildParams(5));
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("skips email uniqueness check when email not provided", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 5, email: "target@test.com", role: "basic" } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({ ...targetUserRecord } as any);

    await PATCH(makeReq("PATCH", { name: "Updated" }), buildParams(5));
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  // Update data fields
  it("includes name in update when provided", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 5, email: "target@test.com", role: "basic" } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({ ...targetUserRecord } as any);

    await PATCH(makeReq("PATCH", { name: "NewName" }), buildParams(5));
    const call = vi.mocked(prisma.user.update).mock.calls[0][0] as any;
    expect(call.data.name).toBe("NewName");
  });

  it("includes email in update when provided", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 5, email: "target@test.com", role: "basic" } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as any);
    vi.mocked(prisma.user.update).mockResolvedValue({ ...targetUserRecord } as any);

    await PATCH(makeReq("PATCH", { email: "newemail@test.com" }), buildParams(5));
    const call = vi.mocked(prisma.user.update).mock.calls[0][0] as any;
    expect(call.data.email).toBe("newemail@test.com");
  });

  it("includes role in update when provided", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 5, email: "target@test.com", role: "basic" } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({ ...targetUserRecord } as any);

    await PATCH(makeReq("PATCH", { role: "manager" }), buildParams(5));
    const call = vi.mocked(prisma.user.update).mock.calls[0][0] as any;
    expect(call.data.role).toBe("manager");
  });

  it("does not include passwordHash when password not provided", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 5, email: "target@test.com", role: "basic" } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({ ...targetUserRecord } as any);

    await PATCH(makeReq("PATCH", { name: "NoPass" }), buildParams(5));
    const call = vi.mocked(prisma.user.update).mock.calls[0][0] as any;
    expect(call.data).not.toHaveProperty("passwordHash");
  });

  it("includes passwordHash when password provided and calls bcrypt with cost 12", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 5, email: "target@test.com", role: "basic" } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({ ...targetUserRecord } as any);
    vi.mocked(bcrypt.hash).mockResolvedValue("hashed_new_pw" as never);

    await PATCH(makeReq("PATCH", { password: "newpassword123" }), buildParams(5));
    const call = vi.mocked(prisma.user.update).mock.calls[0][0] as any;
    expect(call.data.passwordHash).toBe("hashed_new_pw");
    expect(bcrypt.hash).toHaveBeenCalledWith("newpassword123", 12);
  });

  it("includes allowedWriteTableIds when provided", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 5, email: "target@test.com", role: "basic" } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({ ...targetUserRecord } as any);

    await PATCH(makeReq("PATCH", { allowedWriteTableIds: [1, 2] }), buildParams(5));
    const call = vi.mocked(prisma.user.update).mock.calls[0][0] as any;
    expect(call.data.allowedWriteTableIds).toEqual([1, 2]);
  });

  it("includes permissions when provided", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 5, email: "target@test.com", role: "basic" } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({ ...targetUserRecord } as any);

    await PATCH(makeReq("PATCH", { permissions: { canViewUsers: true } }), buildParams(5));
    const call = vi.mocked(prisma.user.update).mock.calls[0][0] as any;
    expect(call.data.permissions).toEqual({ canViewUsers: true });
  });

  it("includes tablePermissions when provided", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 5, email: "target@test.com", role: "basic" } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({ ...targetUserRecord } as any);

    await PATCH(makeReq("PATCH", { tablePermissions: { "1": "write" } }), buildParams(5));
    const call = vi.mocked(prisma.user.update).mock.calls[0][0] as any;
    expect(call.data.tablePermissions).toEqual({ "1": "write" });
  });

  // Successful update
  it("includes companyId in update where clause (TOCTOU)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 5, email: "target@test.com", role: "basic" } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({ ...targetUserRecord } as any);

    await PATCH(makeReq("PATCH", { name: "Updated" }), buildParams(5));
    const call = vi.mocked(prisma.user.update).mock.calls[0][0] as any;
    expect(call.where).toEqual({ id: 5, companyId: 100 });
  });

  it("returns updated user on success", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 5, email: "target@test.com", role: "basic" } as any);
    const updated = { ...targetUserRecord, name: "Updated" };
    vi.mocked(prisma.user.update).mockResolvedValue(updated as any);

    const res = await PATCH(makeReq("PATCH", { name: "Updated" }), buildParams(5));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ...targetUserRecord, name: "Updated" });
    expect(body).not.toHaveProperty("passwordHash");
  });

  it("excludes passwordHash from update select clause", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 5, email: "target@test.com", role: "basic" } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({ ...targetUserRecord } as any);

    await PATCH(makeReq("PATCH", { name: "Updated" }), buildParams(5));
    const call = vi.mocked(prisma.user.update).mock.calls[0][0] as any;
    expect(call.select).toEqual({
      id: true, name: true, email: true, role: true,
      allowedWriteTableIds: true, createdAt: true, updatedAt: true,
      permissions: true, tablePermissions: true,
    });
  });

  it("calls createAuditLog with USER_UPDATED", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 5, email: "target@test.com", role: "basic" } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({ ...targetUserRecord } as any);

    await PATCH(makeReq("PATCH", { name: "Updated" }), buildParams(5));
    expect(createAuditLog).toHaveBeenCalledWith(
      null,
      adminUser.id,
      "USER_UPDATED",
      expect.objectContaining({ targetUserId: 5, changes: expect.any(Array) }),
      expect.anything(),
      adminUser.companyId,
    );
  });

  // Security events
  it("logs SEC_PASSWORD_CHANGED when password is updated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 5, email: "target@test.com", role: "basic" } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({ ...targetUserRecord } as any);

    await PATCH(makeReq("PATCH", { password: "newpassword123" }), buildParams(5));
    expect(logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "SEC_PASSWORD_CHANGED",
        companyId: adminUser.companyId,
        userId: adminUser.id,
        details: expect.objectContaining({ targetUserId: 5 }),
      }),
    );
  });

  it("does not log SEC_PASSWORD_CHANGED when password not provided", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 5, email: "target@test.com", role: "basic" } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({ ...targetUserRecord } as any);

    await PATCH(makeReq("PATCH", { name: "Updated" }), buildParams(5));
    expect(logSecurityEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: "SEC_PASSWORD_CHANGED" }),
    );
  });

  it("logs SEC_ROLE_CHANGED when role changes", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 5, email: "target@test.com", role: "basic" } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({ ...targetUserRecord, role: "manager" } as any);

    await PATCH(makeReq("PATCH", { role: "manager" }), buildParams(5));
    expect(logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "SEC_ROLE_CHANGED",
        details: expect.objectContaining({ oldRole: "basic", newRole: "manager" }),
      }),
    );
  });

  it("does not log SEC_ROLE_CHANGED when role is same as existing", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 5, email: "target@test.com", role: "basic" } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({ ...targetUserRecord } as any);

    await PATCH(makeReq("PATCH", { role: "basic" }), buildParams(5));
    expect(logSecurityEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: "SEC_ROLE_CHANGED" }),
    );
  });

  it("does not log SEC_ROLE_CHANGED when role not provided", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 5, email: "target@test.com", role: "basic" } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({ ...targetUserRecord } as any);

    await PATCH(makeReq("PATCH", { name: "Updated" }), buildParams(5));
    expect(logSecurityEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: "SEC_ROLE_CHANGED" }),
    );
  });

  it("logs SEC_PERMISSIONS_CHANGED when permissions updated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 5, email: "target@test.com", role: "basic" } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({ ...targetUserRecord } as any);

    await PATCH(makeReq("PATCH", { permissions: { canViewUsers: true } }), buildParams(5));
    expect(logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "SEC_PERMISSIONS_CHANGED",
        details: expect.objectContaining({ targetUserId: 5 }),
      }),
    );
  });

  it("logs SEC_PERMISSIONS_CHANGED when tablePermissions updated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 5, email: "target@test.com", role: "basic" } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({ ...targetUserRecord } as any);

    await PATCH(makeReq("PATCH", { tablePermissions: { "1": "write" } }), buildParams(5));
    expect(logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "SEC_PERMISSIONS_CHANGED" }),
    );
  });

  it("does not log SEC_PERMISSIONS_CHANGED when no permissions updated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 5, email: "target@test.com", role: "basic" } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({ ...targetUserRecord } as any);

    await PATCH(makeReq("PATCH", { name: "Updated" }), buildParams(5));
    expect(logSecurityEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: "SEC_PERMISSIONS_CHANGED" }),
    );
  });

  // Post-update operations
  it("always calls invalidateUserCache", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 5, email: "target@test.com", role: "basic" } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({ ...targetUserRecord } as any);

    await PATCH(makeReq("PATCH", { name: "Updated" }), buildParams(5));
    expect(invalidateUserCache).toHaveBeenCalledWith(5);
  });

  it("calls revokeUserSessions on password change", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 5, email: "target@test.com", role: "basic" } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({ ...targetUserRecord } as any);

    await PATCH(makeReq("PATCH", { password: "newpassword123" }), buildParams(5));
    expect(revokeUserSessions).toHaveBeenCalledWith(5);
  });

  it("does not call revokeUserSessions without password change", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 5, email: "target@test.com", role: "basic" } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({ ...targetUserRecord } as any);

    await PATCH(makeReq("PATCH", { name: "Updated" }), buildParams(5));
    expect(revokeUserSessions).not.toHaveBeenCalled();
  });

  // Edge cases
  it("succeeds with empty body (no-op update)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 5, email: "target@test.com", role: "basic" } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({ ...targetUserRecord } as any);

    const res = await PATCH(makeReq("PATCH", {}), buildParams(5));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(targetUserRecord);
    const call = vi.mocked(prisma.user.update).mock.calls[0][0] as any;
    expect(call.data).toEqual({});
  });

  it("returns 400 when password too short", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const res = await PATCH(makeReq("PATCH", { password: "short" }), buildParams(5));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.details.password).toBeDefined();
  });

  it("returns 400 when password is exactly 9 chars (below boundary)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const res = await PATCH(makeReq("PATCH", { password: "abcdefghi" }), buildParams(5));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.details.password).toBeDefined();
  });

  it("accepts password with exactly 10 chars (at boundary)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 5, email: "target@test.com", role: "basic" } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({ ...targetUserRecord } as any);

    const res = await PATCH(makeReq("PATCH", { password: "abcdefghij" }), buildParams(5));
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveProperty("id");
  });

  it("returns 400 when tablePermissions has more than 500 entries", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const bigTablePerms: Record<string, string> = {};
    for (let i = 1; i <= 501; i++) bigTablePerms[String(i)] = "read";
    const res = await PATCH(makeReq("PATCH", { tablePermissions: bigTablePerms }), buildParams(5));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.details.tablePermissions).toBeDefined();
  });

  // Errors
  it("returns 400 on Prisma P2002", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 5, email: "target@test.com", role: "basic" } as any);
    vi.mocked(prisma.user.update).mockRejectedValue(new Error("P2002"));
    vi.mocked(isPrismaError).mockImplementation((_err, code) => code === "P2002");

    const res = await PATCH(makeReq("PATCH", { name: "Updated" }), buildParams(5));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Unable to update user with the provided details" });
  });

  it("returns 404 on Prisma P2025", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 5, email: "target@test.com", role: "basic" } as any);
    vi.mocked(prisma.user.update).mockRejectedValue(new Error("P2025"));
    vi.mocked(isPrismaError).mockImplementation((_err, code) => code === "P2025");

    const res = await PATCH(makeReq("PATCH", { name: "Updated" }), buildParams(5));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "User not found" });
  });

  it("returns 500 on unexpected error", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 5, email: "target@test.com", role: "basic" } as any);
    vi.mocked(prisma.user.update).mockRejectedValue(new Error("Unexpected"));

    const res = await PATCH(makeReq("PATCH", { name: "Updated" }), buildParams(5));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to update user" });
    expect(mockLogger.error).toHaveBeenCalled();
  });
});

// ─── DELETE /api/users/:id ───────────────────────────────────────────────
describe("DELETE /api/users/:id", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await DELETE(makeReq("DELETE"), buildParams(5));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 403 when non-admin", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUser as any);
    const res = await DELETE(makeReq("DELETE"), buildParams(5));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Only admins can delete users" });
  });

  it("returns 403 for manager role", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(managerUser as any);
    const res = await DELETE(makeReq("DELETE"), buildParams(5));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Only admins can delete users" });
  });

  it("returns 429 when rate limited", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const rl = NextResponse.json({ error: "Rate limited" }, { status: 429 });
    vi.mocked(checkRateLimit).mockResolvedValue(rl);

    const res = await DELETE(makeReq("DELETE"), buildParams(5));
    expect(res.status).toBe(429);
    expect(checkRateLimit).toHaveBeenCalledWith(
      String(adminUser.id),
      expect.objectContaining({ prefix: "user-mgmt" }),
    );
  });

  it("returns 400 for invalid id", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const res = await DELETE(makeReq("DELETE"), buildParams("abc"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid user ID" });
  });

  it("returns 404 when user not found", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);

    const res = await DELETE(makeReq("DELETE"), buildParams(5));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "User not found" });
  });

  it("fetches existing user with id and email for DELETE", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 5, email: "target@test.com" } as any);
    vi.mocked(prisma.user.delete).mockResolvedValue({} as any);

    await DELETE(makeReq("DELETE"), buildParams(5));
    const call = vi.mocked(prisma.user.findFirst).mock.calls[0][0] as any;
    expect(call.where).toEqual({ id: 5, companyId: 100 });
    expect(call.select).toEqual({ id: true, email: true });
  });

  it("returns 400 when trying to self-delete", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 1, email: "admin@test.com" } as any);

    const res = await DELETE(makeReq("DELETE"), buildParams(1));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Cannot delete yourself" });
  });

  it("deletes user with companyId in where", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 5, email: "target@test.com" } as any);
    vi.mocked(prisma.user.delete).mockResolvedValue({} as any);

    await DELETE(makeReq("DELETE"), buildParams(5));
    expect(prisma.user.delete).toHaveBeenCalledWith({
      where: { id: 5, companyId: 100 },
    });
  });

  it("calls invalidateUserCache after delete", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 5, email: "target@test.com" } as any);
    vi.mocked(prisma.user.delete).mockResolvedValue({} as any);

    await DELETE(makeReq("DELETE"), buildParams(5));
    expect(invalidateUserCache).toHaveBeenCalledWith(5);
  });

  it("calls createAuditLog with USER_DELETED", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 5, email: "target@test.com" } as any);
    vi.mocked(prisma.user.delete).mockResolvedValue({} as any);

    await DELETE(makeReq("DELETE"), buildParams(5));
    expect(createAuditLog).toHaveBeenCalledWith(
      null,
      adminUser.id,
      "USER_DELETED",
      expect.objectContaining({ targetUserId: 5, email: "target@test.com" }),
      expect.anything(),
      adminUser.companyId,
    );
  });

  it("returns { success: true } on successful delete", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 5, email: "target@test.com" } as any);
    vi.mocked(prisma.user.delete).mockResolvedValue({} as any);

    const res = await DELETE(makeReq("DELETE"), buildParams(5));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });

  it("returns 404 on Prisma P2025", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 5, email: "target@test.com" } as any);
    vi.mocked(prisma.user.delete).mockRejectedValue(new Error("P2025"));
    vi.mocked(isPrismaError).mockImplementation((_err, code) => code === "P2025");

    const res = await DELETE(makeReq("DELETE"), buildParams(5));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "User not found" });
  });

  it("returns 500 on unexpected error", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 5, email: "target@test.com" } as any);
    vi.mocked(prisma.user.delete).mockRejectedValue(new Error("Unexpected"));

    const res = await DELETE(makeReq("DELETE"), buildParams(5));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to delete user" });
    expect(mockLogger.error).toHaveBeenCalled();
  });
});

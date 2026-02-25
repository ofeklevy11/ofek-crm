import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// --- Mocks (must be before imports) ---
vi.mock("@/lib/permissions-server", () => ({
  getCurrentUser: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
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
vi.mock("bcryptjs", () => ({
  default: { hash: vi.fn() },
}));
const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/logger", () => ({
  createLogger: vi.fn(() => mockLogger),
}));

import { GET, POST } from "@/app/api/users/route";
import { getCurrentUser } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { isPrismaError } from "@/lib/prisma-error";
import { createAuditLog } from "@/lib/audit";
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
  tablePermissions: { "1": "write", "2": "read" },
};

const managerUser = {
  id: 2,
  companyId: 100,
  name: "Manager",
  email: "manager@test.com",
  role: "manager" as const,
  allowedWriteTableIds: [1],
  permissions: { canViewUsers: true, canViewTasks: true } as Record<string, boolean>,
  tablePermissions: { "1": "write" } as Record<string, string>,
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

const validCreateBody = {
  name: "New User",
  email: "new@test.com",
  password: "password123",
  role: "basic",
};

function makeReq(method = "GET", body?: unknown) {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new NextRequest("http://localhost/api/users", init);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(checkRateLimit).mockResolvedValue(null);
  vi.mocked(isPrismaError).mockReturnValue(false);
  vi.mocked(bcrypt.hash).mockResolvedValue("hashed_password" as never);
});

// ─── GET /api/users ──────────────────────────────────────────────────────
describe("GET /api/users", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 429 when rate limited", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const rl = NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
    vi.mocked(checkRateLimit).mockResolvedValue(rl);

    const res = await GET();
    expect(res.status).toBe(429);
    expect(checkRateLimit).toHaveBeenCalledWith(
      String(adminUser.id),
      expect.objectContaining({ prefix: "api" }),
    );
  });

  it("returns 403 when basic user lacks canViewUsers", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUser as any);
    const res = await GET();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("returns 200 with user list for admin", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const users = [{ id: 1, name: "Admin", email: "admin@test.com" }];
    vi.mocked(prisma.user.findMany).mockResolvedValue(users as any);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(users);
  });

  it("returns 200 for basic user with canViewUsers", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserCanView as any);
    vi.mocked(prisma.user.findMany).mockResolvedValue([] as any);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
    expect(prisma.user.findMany).toHaveBeenCalled();
  });

  it("filters query by companyId", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findMany).mockResolvedValue([] as any);

    await GET();
    const call = vi.mocked(prisma.user.findMany).mock.calls[0][0] as any;
    expect(call.where).toEqual({ companyId: 100 });
  });

  it("orders by createdAt desc", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findMany).mockResolvedValue([] as any);

    await GET();
    const call = vi.mocked(prisma.user.findMany).mock.calls[0][0] as any;
    expect(call.orderBy).toEqual({ createdAt: "desc" });
  });

  it("limits query to 500 results", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findMany).mockResolvedValue([] as any);

    await GET();
    const call = vi.mocked(prisma.user.findMany).mock.calls[0][0] as any;
    expect(call.take).toBe(500);
  });

  it("excludes passwordHash from select", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findMany).mockResolvedValue([] as any);

    await GET();
    const call = vi.mocked(prisma.user.findMany).mock.calls[0][0] as any;
    expect(call.select).toEqual({
      id: true, name: true, email: true, role: true,
      allowedWriteTableIds: true, createdAt: true, updatedAt: true,
      permissions: true, tablePermissions: true,
    });
  });

  it("returns 500 on database error", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findMany).mockRejectedValue(new Error("DB down"));

    const res = await GET();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to fetch users" });
    expect(mockLogger.error).toHaveBeenCalled();
  });
});

// ─── POST /api/users ─────────────────────────────────────────────────────
describe("POST /api/users", () => {
  // Auth/Authz
  it("returns 401 when not authenticated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await POST(makeReq("POST", validCreateBody));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 403 when basic user role", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUser as any);
    const res = await POST(makeReq("POST", validCreateBody));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("returns 429 when rate limited", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const rl = NextResponse.json({ error: "Rate limited" }, { status: 429 });
    vi.mocked(checkRateLimit).mockResolvedValue(rl);

    const res = await POST(makeReq("POST", validCreateBody));
    expect(res.status).toBe(429);
    expect(checkRateLimit).toHaveBeenCalledWith(
      String(adminUser.id),
      expect.objectContaining({ prefix: "user-mgmt" }),
    );
  });

  // Validation
  it("returns 400 for invalid JSON body", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const res = await POST(makeReq("POST", "not json{{{"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON body" });
  });

  it("returns 400 when name is missing", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const res = await POST(makeReq("POST", { email: "a@b.com", password: "password123" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.details).toBeDefined();
    expect(body.details.name).toBeDefined();
  });

  it("returns 400 for invalid email", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const res = await POST(makeReq("POST", { name: "Test", email: "not-an-email", password: "password123" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.details.email).toBeDefined();
  });

  it("returns 400 when password too short", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const res = await POST(makeReq("POST", { name: "Test", email: "a@b.com", password: "short" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.details.password).toBeDefined();
  });

  it("returns 400 when password is exactly 7 chars (below boundary)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const res = await POST(makeReq("POST", { name: "Test", email: "a@b.com", password: "abcdefg" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.details.password).toBeDefined();
  });

  it("accepts password with exactly 8 chars (at boundary)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as any);
    vi.mocked(prisma.user.create).mockResolvedValue({ id: 30 } as any);

    const res = await POST(makeReq("POST", { name: "Test", email: "a@b.com", password: "abcdefgh" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveProperty("id");
  });

  it("returns 400 when name exceeds 200 chars (boundary)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const longName = "a".repeat(201);
    const res = await POST(makeReq("POST", { name: longName, email: "a@b.com", password: "password123" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.details.name).toBeDefined();
  });

  it("returns 400 for unknown permission key", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const res = await POST(makeReq("POST", {
      ...validCreateBody,
      permissions: { notARealPerm: true },
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.details.permissions).toBeDefined();
  });

  it("returns 400 for extra unknown fields (strict mode)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const res = await POST(makeReq("POST", {
      ...validCreateBody,
      unknownField: "surprise",
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.details).toBeDefined();
  });

  it("returns 400 for non-numeric tablePermission key", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const res = await POST(makeReq("POST", {
      ...validCreateBody,
      tablePermissions: { "abc": "write" },
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.details.tablePermissions).toBeDefined();
  });

  it("returns 400 for invalid tablePermission value", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const res = await POST(makeReq("POST", {
      ...validCreateBody,
      tablePermissions: { "1": "invalid" },
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.details.tablePermissions).toBeDefined();
  });

  // Role assignment
  it("returns 403 when manager assigns admin role", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(managerUser as any);
    const res = await POST(makeReq("POST", { ...validCreateBody, role: "admin" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Only admins can assign admin role" });
  });

  it("returns 403 when manager creates manager-level user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(managerUser as any);
    const res = await POST(makeReq("POST", { ...validCreateBody, role: "manager" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Managers cannot create manager-level users" });
  });

  it("allows admin to assign admin role", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as any);
    vi.mocked(prisma.user.create).mockResolvedValue({ id: 10, name: "New Admin" } as any);

    const res = await POST(makeReq("POST", { ...validCreateBody, role: "admin" }));
    expect(res.status).toBe(200);
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ role: "admin" }) })
    );
  });

  it("allows admin to create manager user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as any);
    vi.mocked(prisma.user.create).mockResolvedValue({ id: 11, name: "New Mgr" } as any);

    const res = await POST(makeReq("POST", { ...validCreateBody, role: "manager" }));
    expect(res.status).toBe(200);
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ role: "manager" }) })
    );
  });

  // Manager privilege escalation prevention
  it("filters permissions to manager's own permissions", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(managerUser as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as any);
    vi.mocked(prisma.user.create).mockResolvedValue({ id: 12 } as any);

    await POST(makeReq("POST", {
      ...validCreateBody,
      permissions: { canViewUsers: true, canViewTasks: true, canViewFinance: true },
    }));

    const createCall = vi.mocked(prisma.user.create).mock.calls[0][0] as any;
    // Manager has canViewUsers and canViewTasks, so canViewFinance should be filtered out
    expect(createCall.data.permissions).toEqual({ canViewUsers: true, canViewTasks: true });
  });

  it("filters tablePermissions to manager's own", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(managerUser as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as any);
    vi.mocked(prisma.user.create).mockResolvedValue({ id: 13 } as any);

    await POST(makeReq("POST", {
      ...validCreateBody,
      tablePermissions: { "1": "write", "999": "read" },
    }));

    const createCall = vi.mocked(prisma.user.create).mock.calls[0][0] as any;
    // Manager only has tablePermissions for "1"
    expect(createCall.data.tablePermissions).toEqual({ "1": "write" });
  });

  it("filters allowedWriteTableIds to manager's own", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(managerUser as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as any);
    vi.mocked(prisma.user.create).mockResolvedValue({ id: 14 } as any);

    await POST(makeReq("POST", {
      ...validCreateBody,
      allowedWriteTableIds: [1, 2, 999],
    }));

    const createCall = vi.mocked(prisma.user.create).mock.calls[0][0] as any;
    // Manager only has [1]
    expect(createCall.data.allowedWriteTableIds).toEqual([1]);
  });

  it("admin bypasses escalation prevention", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as any);
    vi.mocked(prisma.user.create).mockResolvedValue({ id: 15 } as any);

    await POST(makeReq("POST", {
      ...validCreateBody,
      permissions: { canViewFinance: true },
      tablePermissions: { "999": "read" },
      allowedWriteTableIds: [999],
    }));

    const createCall = vi.mocked(prisma.user.create).mock.calls[0][0] as any;
    // Admin should pass everything through unfiltered
    expect(createCall.data.permissions).toEqual({ canViewFinance: true });
    expect(createCall.data.tablePermissions).toEqual({ "999": "read" });
    expect(createCall.data.allowedWriteTableIds).toEqual([999]);
  });

  // Email + creation
  it("returns 400 when email already exists", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 99 } as any);

    const res = await POST(makeReq("POST", validCreateBody));
    expect(res.status).toBe(400);
    // Generic error to prevent email enumeration
    expect(await res.json()).toEqual({ error: "Unable to create user with the provided details" });
  });

  it("checks email uniqueness with correct query arguments", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as any);
    vi.mocked(prisma.user.create).mockResolvedValue({ id: 50 } as any);

    await POST(makeReq("POST", validCreateBody));
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: "new@test.com" },
      select: { id: true },
    });
  });

  it("calls bcrypt.hash with cost 12", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as any);
    vi.mocked(prisma.user.create).mockResolvedValue({ id: 16 } as any);

    await POST(makeReq("POST", validCreateBody));
    expect(bcrypt.hash).toHaveBeenCalledWith(validCreateBody.password, 12);
  });

  it("creates user with correct data and companyId", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as any);
    vi.mocked(prisma.user.create).mockResolvedValue({ id: 17, email: "new@test.com", role: "basic" } as any);

    await POST(makeReq("POST", validCreateBody));
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          companyId: 100,
          name: "New User",
          email: "new@test.com",
          passwordHash: "hashed_password",
          role: "basic",
          permissions: {},
          tablePermissions: {},
          allowedWriteTableIds: [],
        },
      }),
    );
  });

  it("excludes passwordHash from create select clause", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as any);
    vi.mocked(prisma.user.create).mockResolvedValue({ id: 22 } as any);

    await POST(makeReq("POST", validCreateBody));
    const createCall = vi.mocked(prisma.user.create).mock.calls[0][0] as any;
    expect(createCall.select).toEqual({
      id: true, name: true, email: true, role: true,
      allowedWriteTableIds: true, createdAt: true, updatedAt: true,
      permissions: true, tablePermissions: true,
    });
  });

  it("returns created user in response body", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as any);
    const createdUser = { id: 23, name: "New User", email: "new@test.com", role: "basic" };
    vi.mocked(prisma.user.create).mockResolvedValue(createdUser as any);

    const res = await POST(makeReq("POST", validCreateBody));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(createdUser);
  });

  it("calls createAuditLog with USER_CREATED", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as any);
    vi.mocked(prisma.user.create).mockResolvedValue({ id: 18, email: "new@test.com", role: "basic" } as any);

    await POST(makeReq("POST", validCreateBody));
    expect(createAuditLog).toHaveBeenCalledWith(
      null,
      adminUser.id,
      "USER_CREATED",
      expect.objectContaining({ targetUserId: 18, email: "new@test.com", role: "basic" }),
      expect.anything(),
      adminUser.companyId,
    );
  });

  // Errors
  it("returns 400 on Prisma P2002 (unique constraint)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as any);
    vi.mocked(prisma.user.create).mockRejectedValue(new Error("P2002"));
    vi.mocked(isPrismaError).mockImplementation((_err, code) => code === "P2002");

    const res = await POST(makeReq("POST", validCreateBody));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Unable to create user with the provided details" });
  });

  it("returns 500 on unexpected error", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as any);
    vi.mocked(prisma.user.create).mockRejectedValue(new Error("Unexpected"));

    const res = await POST(makeReq("POST", validCreateBody));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to create user" });
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it("defaults to basic role when role is omitted", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as any);
    vi.mocked(prisma.user.create).mockResolvedValue({ id: 20 } as any);

    const { role, ...bodyNoRole } = validCreateBody;
    await POST(makeReq("POST", bodyNoRole));
    const createCall = vi.mocked(prisma.user.create).mock.calls[0][0] as any;
    expect(createCall.data.role).toBe("basic");
  });

  it("manager defaults permissions/tablePermissions/allowedWriteTableIds to empty", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(managerUser as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as any);
    vi.mocked(prisma.user.create).mockResolvedValue({ id: 21 } as any);

    await POST(makeReq("POST", { name: "Test", email: "t@t.com", password: "password123" }));
    const createCall = vi.mocked(prisma.user.create).mock.calls[0][0] as any;
    expect(createCall.data.permissions).toEqual({});
    expect(createCall.data.tablePermissions).toEqual({});
    expect(createCall.data.allowedWriteTableIds).toEqual([]);
  });
});

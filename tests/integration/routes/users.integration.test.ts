/**
 * Integration tests for /api/users and /api/users/[id] routes.
 *
 * REAL: Prisma (test DB), auth token signing/verification, permission logic,
 *       route handlers, Zod validation, bcrypt password hashing.
 * MOCKED: next/headers cookies(), @/lib/redis, react cache(),
 *         @/lib/session, @/lib/security/audit-security.
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";

// ── Module mocks (hoisted by Vitest) ───────────────────────────────

// 1. React cache → passthrough
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return { ...actual, cache: (fn: any) => fn };
});

// 2. next/headers → mocked cookies()
let _mockAuthToken: string | null = null;
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => {
      if (name === "auth_token") {
        return _mockAuthToken ? { name: "auth_token", value: _mockAuthToken } : undefined;
      }
      return undefined;
    },
  })),
}));

// 3. Redis → cache miss + rate limit pass
vi.mock("@/lib/redis", () => {
  return {
    redis: {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(null),
      del: vi.fn().mockResolvedValue(null),
      multi: vi.fn(() => ({
        incr: vi.fn().mockReturnThis(),
        expire: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([[null, 1]]),
      })),
    },
    redisPublisher: {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(null),
      del: vi.fn().mockResolvedValue(null),
    },
  };
});

// 4. Session → no-op (Redis-dependent)
vi.mock("@/lib/session", () => ({
  revokeUserSessions: vi.fn().mockResolvedValue(undefined),
  isTokenIssuedAtValid: vi.fn().mockResolvedValue(true),
}));

// 5. Security audit → no-op (fire-and-forget, Redis-dependent)
vi.mock("@/lib/security/audit-security", () => ({
  logSecurityEvent: vi.fn(),
  SEC_PASSWORD_CHANGED: "SEC_PASSWORD_CHANGED",
  SEC_ROLE_CHANGED: "SEC_ROLE_CHANGED",
  SEC_PERMISSIONS_CHANGED: "SEC_PERMISSIONS_CHANGED",
}));

// ── Imports (AFTER mocks) ──────────────────────────────────────────
import { prisma } from "@/lib/prisma";
import { resetDb } from "@/test-utils/resetDb";
import {
  setAuthToken as _setAuthToken,
  signTokenForUser,
  seedCompany,
  seedUser,
  buildGetRequest,
  buildJsonRequest,
  makeParams,
} from "@/tests/integration/helpers/integration-setup";

function setAuthToken(token: string | null) {
  _mockAuthToken = token;
  _setAuthToken(token);
}

import { GET as GET_USERS, POST as POST_USER } from "@/app/api/users/route";
import {
  GET as GET_USER_BY_ID,
  PATCH as PATCH_USER,
  DELETE as DELETE_USER,
} from "@/app/api/users/[id]/route";

import bcrypt from "bcryptjs";
import { revokeUserSessions } from "@/lib/session";
import { logSecurityEvent } from "@/lib/security/audit-security";

// ── Seeded data ────────────────────────────────────────────────────
let companyA: { id: number };
let companyB: { id: number };

let adminA: { id: number; email: string };
let managerA: { id: number; email: string };
let basicWithViewA: { id: number; email: string };
let basicNoPermsA: { id: number; email: string };
let adminB: { id: number; email: string };

let adminAToken: string;
let managerAToken: string;
let basicViewToken: string;
let basicNoPermsToken: string;
let adminBToken: string;

// ── Lifecycle ──────────────────────────────────────────────────────

beforeAll(async () => {
  await resetDb();

  // Companies
  companyA = await seedCompany({ name: "Company A" });
  companyB = await seedCompany({ name: "Company B" });

  // Users
  adminA = await seedUser(companyA.id, {
    role: "admin",
    name: "Admin A",
    email: "admin-a@test.com",
    passwordHash: await bcrypt.hash("admin-password", 4),
  });
  managerA = await seedUser(companyA.id, {
    role: "manager",
    name: "Manager A",
    email: "manager-a@test.com",
    permissions: { canViewUsers: true, canViewTables: true },
    tablePermissions: { "1": "read" },
    allowedWriteTableIds: [1],
  });
  basicWithViewA = await seedUser(companyA.id, {
    role: "basic",
    name: "Basic Viewer",
    email: "basic-view@test.com",
    permissions: { canViewUsers: true },
  });
  basicNoPermsA = await seedUser(companyA.id, {
    role: "basic",
    name: "Basic NoPerms",
    email: "basic-noperms@test.com",
    permissions: {},
  });
  adminB = await seedUser(companyB.id, {
    role: "admin",
    name: "Admin B",
    email: "admin-b@test.com",
  });

  // Tokens
  adminAToken = signTokenForUser(adminA.id);
  managerAToken = signTokenForUser(managerA.id);
  basicViewToken = signTokenForUser(basicWithViewA.id);
  basicNoPermsToken = signTokenForUser(basicNoPermsA.id);
  adminBToken = signTokenForUser(adminB.id);
}, 30_000);

afterEach(async () => {
  setAuthToken(null);
  vi.clearAllMocks();

  // Cleanup test-created audit logs and users (not seeded ones)
  await prisma.auditLog.deleteMany({
    where: { companyId: { in: [companyA.id, companyB.id] } },
  });
  // Delete users created during tests (keep seeded users)
  const seededIds = [adminA.id, managerA.id, basicWithViewA.id, basicNoPermsA.id, adminB.id];
  await prisma.user.deleteMany({
    where: {
      companyId: { in: [companyA.id, companyB.id] },
      id: { notIn: seededIds },
    },
  });
});

afterAll(async () => {
  await resetDb();
  await prisma.$disconnect();
}, 15_000);

// ── Helpers ────────────────────────────────────────────────────────

async function jsonBody(response: Response) {
  return response.json();
}

const EXPECTED_USER_FIELDS = [
  "id", "name", "email", "role", "allowedWriteTableIds",
  "createdAt", "updatedAt", "permissions", "tablePermissions",
];

function validCreatePayload(overrides: Record<string, any> = {}) {
  const uniq = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    name: "New User",
    email: `new-user-${uniq}@test.com`,
    password: "securePassword123",
    ...overrides,
  };
}

// =====================================================================
// 1. GET /api/users — List Users
// =====================================================================

describe("GET /api/users", () => {
  it("admin sees all company users ordered by createdAt desc", async () => {
    setAuthToken(adminAToken);
    const res = await GET_USERS(buildGetRequest("/api/users"));
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    // Should see all 4 company A users
    expect(body.length).toBe(4);

    // Ordered by createdAt desc
    for (let i = 1; i < body.length; i++) {
      expect(new Date(body[i - 1].createdAt).getTime())
        .toBeGreaterThanOrEqual(new Date(body[i].createdAt).getTime());
    }
  });

  it("basic user with canViewUsers sees company users", async () => {
    setAuthToken(basicViewToken);
    const res = await GET_USERS(buildGetRequest("/api/users"));
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.length).toBe(4);
  });

  it("manager with canViewUsers sees company users", async () => {
    setAuthToken(managerAToken);
    const res = await GET_USERS(buildGetRequest("/api/users"));
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.length).toBe(4);
  });

  it("basic user without canViewUsers → 403", async () => {
    setAuthToken(basicNoPermsToken);
    const res = await GET_USERS(buildGetRequest("/api/users"));
    const body = await jsonBody(res);

    expect(res.status).toBe(403);
    expect(body.error).toBe("Forbidden");
  });

  it("unauthenticated → 401", async () => {
    setAuthToken(null);
    const res = await GET_USERS(buildGetRequest("/api/users"));
    const body = await jsonBody(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("company A admin cannot see company B users", async () => {
    setAuthToken(adminAToken);
    const res = await GET_USERS(buildGetRequest("/api/users"));
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    const ids = body.map((u: any) => u.id);
    expect(ids).not.toContain(adminB.id);
  });

  it("response has exactly the expected fields, no passwordHash or companyId", async () => {
    setAuthToken(adminAToken);
    const res = await GET_USERS(buildGetRequest("/api/users"));
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    for (const user of body) {
      expect(Object.keys(user).sort()).toEqual(EXPECTED_USER_FIELDS.sort());
      expect(user).not.toHaveProperty("passwordHash");
      expect(user).not.toHaveProperty("companyId");
    }
  });

  it("DateTime fields are serialized as ISO 8601", async () => {
    setAuthToken(adminAToken);
    const res = await GET_USERS(buildGetRequest("/api/users"));
    const body = await jsonBody(res);

    for (const user of body) {
      expect(new Date(user.createdAt).toISOString()).toBe(user.createdAt);
      expect(new Date(user.updatedAt).toISOString()).toBe(user.updatedAt);
    }
  });
});

// =====================================================================
// 2. POST /api/users — Create User
// =====================================================================

describe("POST /api/users", () => {
  // ── Happy paths ──────────────────────────────────────────────────

  it("admin creates basic user → 200", async () => {
    setAuthToken(adminAToken);
    const payload = validCreatePayload({ role: "basic" });
    const res = await POST_USER(
      buildJsonRequest("/api/users", "POST", payload),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.name).toBe(payload.name);
    expect(body.email).toBe(payload.email);
    expect(body.role).toBe("basic");

    // Verify DB state
    const dbUser = await prisma.user.findUnique({ where: { id: body.id } });
    expect(dbUser).not.toBeNull();
    expect(dbUser!.companyId).toBe(companyA.id);
  });

  it("admin creates manager user → 200, verify DB", async () => {
    setAuthToken(adminAToken);
    const res = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload({ role: "manager" })),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.role).toBe("manager");

    const dbUser = await prisma.user.findUnique({ where: { id: body.id } });
    expect(dbUser).not.toBeNull();
    expect(dbUser!.role).toBe("manager");
    expect(dbUser!.companyId).toBe(companyA.id);
  });

  it("admin creates admin user → 200, verify DB", async () => {
    setAuthToken(adminAToken);
    const res = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload({ role: "admin" })),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.role).toBe("admin");

    const dbUser = await prisma.user.findUnique({ where: { id: body.id } });
    expect(dbUser).not.toBeNull();
    expect(dbUser!.role).toBe("admin");
    expect(dbUser!.companyId).toBe(companyA.id);
  });

  it("manager creates basic user → 200", async () => {
    setAuthToken(managerAToken);
    const res = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload({ role: "basic" })),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.role).toBe("basic");

    // Verify DB role + companyId
    const dbUser = await prisma.user.findUnique({ where: { id: body.id } });
    expect(dbUser).not.toBeNull();
    expect(dbUser!.role).toBe("basic");
    expect(dbUser!.companyId).toBe(companyA.id);
  });

  it("minimal payload (name, email, password) → 200 with default role=basic", async () => {
    setAuthToken(adminAToken);
    const payload = validCreatePayload();
    // No role, permissions, etc.
    const res = await POST_USER(
      buildJsonRequest("/api/users", "POST", {
        name: payload.name,
        email: payload.email,
        password: payload.password,
      }),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.role).toBe("basic");
  });

  it("full payload with permissions, tablePermissions, allowedWriteTableIds → 200", async () => {
    setAuthToken(adminAToken);
    const payload = validCreatePayload({
      role: "basic",
      permissions: { canViewDashboard: true, canViewTables: true },
      tablePermissions: { "1": "read", "2": "write" },
      allowedWriteTableIds: [2],
    });
    const res = await POST_USER(
      buildJsonRequest("/api/users", "POST", payload),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.permissions).toEqual({ canViewDashboard: true, canViewTables: true });
    expect(body.tablePermissions).toEqual({ "1": "read", "2": "write" });
    expect(body.allowedWriteTableIds).toEqual([2]);

    // Verify DB state matches response
    const dbUser = await prisma.user.findUnique({ where: { id: body.id } });
    expect(dbUser).not.toBeNull();
    expect(dbUser!.permissions).toEqual({ canViewDashboard: true, canViewTables: true });
    expect(dbUser!.tablePermissions).toEqual({ "1": "read", "2": "write" });
    expect(dbUser!.allowedWriteTableIds).toEqual([2]);
  });

  // ── Authorization ────────────────────────────────────────────────

  it("basic user → 403, no user created in DB", async () => {
    setAuthToken(basicNoPermsToken);
    const payload = validCreatePayload();
    const res = await POST_USER(
      buildJsonRequest("/api/users", "POST", payload),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(403);
    expect(body.error).toBe("Forbidden");

    // Verify no user created
    const found = await prisma.user.findUnique({ where: { email: payload.email } });
    expect(found).toBeNull();
  });

  it("basic user with canViewUsers → 403 (view permission does not grant creation)", async () => {
    setAuthToken(basicViewToken);
    const payload = validCreatePayload();
    const res = await POST_USER(buildJsonRequest("/api/users", "POST", payload));
    const body = await jsonBody(res);

    expect(res.status).toBe(403);
    expect(body.error).toBe("Forbidden");
  });

  it("unauthenticated → 401", async () => {
    setAuthToken(null);
    const res = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload()),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("manager tries to create admin → 403", async () => {
    setAuthToken(managerAToken);
    const res = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload({ role: "admin" })),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(403);
    expect(body.error).toBe("Only admins can assign admin role");
  });

  it("manager tries to create manager → 403", async () => {
    setAuthToken(managerAToken);
    const res = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload({ role: "manager" })),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(403);
    expect(body.error).toBe("Managers cannot create manager-level users");
  });

  it("manager privilege escalation: permissions they don't hold get stripped", async () => {
    setAuthToken(managerAToken);
    // Manager has canViewUsers + canViewTables; try to grant canManageTables too
    const payload = validCreatePayload({
      role: "basic",
      permissions: { canViewUsers: true, canViewTables: true, canManageTables: true },
    });
    const res = await POST_USER(
      buildJsonRequest("/api/users", "POST", payload),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    // canManageTables should be stripped (manager doesn't hold it)
    const dbUser = await prisma.user.findUnique({ where: { id: body.id } });
    const perms = dbUser!.permissions as Record<string, boolean>;
    expect(perms.canViewUsers).toBe(true);
    expect(perms.canViewTables).toBe(true);
    expect(perms.canManageTables).toBeUndefined();
  });

  it("manager privilege escalation: tablePermissions they don't hold get stripped", async () => {
    setAuthToken(managerAToken);
    // Manager has tablePermissions: { "1": "read" }; try to grant "1": "read", "99": "write"
    const payload = validCreatePayload({
      role: "basic",
      tablePermissions: { "1": "read", "99": "write" },
    });
    const res = await POST_USER(
      buildJsonRequest("/api/users", "POST", payload),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);

    const dbUser = await prisma.user.findUnique({ where: { id: body.id } });
    const tp = dbUser!.tablePermissions as Record<string, string>;
    // "1" should be kept (manager has it), "99" should be stripped
    expect(tp["1"]).toBe("read");
    expect(tp["99"]).toBeUndefined();
  });

  it("manager privilege escalation: allowedWriteTableIds they don't hold get stripped", async () => {
    setAuthToken(managerAToken);
    // Manager has allowedWriteTableIds: [1]; try to grant [1, 99]
    const payload = validCreatePayload({
      role: "basic",
      allowedWriteTableIds: [1, 99],
    });
    const res = await POST_USER(
      buildJsonRequest("/api/users", "POST", payload),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);

    const dbUser = await prisma.user.findUnique({ where: { id: body.id } });
    // 1 should be kept, 99 should be stripped
    expect(dbUser!.allowedWriteTableIds).toEqual([1]);
  });

  it("manager privilege escalation: ALL requested permissions stripped → empty permissions in DB", async () => {
    setAuthToken(managerAToken);
    // Manager has canViewUsers + canViewTables; request only permissions they don't hold
    const payload = validCreatePayload({
      role: "basic",
      permissions: { canManageAnalytics: true, canExportTables: true },
    });
    const res = await POST_USER(
      buildJsonRequest("/api/users", "POST", payload),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);

    const dbUser = await prisma.user.findUnique({ where: { id: body.id } });
    const perms = dbUser!.permissions as Record<string, boolean>;
    // Everything should be stripped, resulting in empty permissions
    expect(perms).toEqual({});
  });

  it("manager privilege escalation: ALL requested tablePermissions stripped → empty tablePermissions in DB", async () => {
    setAuthToken(managerAToken);
    // Manager has tablePermissions: { "1": "read" }; request only tables they don't hold
    const payload = validCreatePayload({
      role: "basic",
      tablePermissions: { "50": "write", "99": "read" },
    });
    const res = await POST_USER(
      buildJsonRequest("/api/users", "POST", payload),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);

    const dbUser = await prisma.user.findUnique({ where: { id: body.id } });
    const tp = dbUser!.tablePermissions as Record<string, string>;
    // Everything should be stripped, resulting in empty tablePermissions
    expect(tp).toEqual({});
  });

  it("manager privilege escalation: ALL requested allowedWriteTableIds stripped → empty array in DB", async () => {
    setAuthToken(managerAToken);
    // Manager has allowedWriteTableIds: [1]; request only IDs they don't hold
    const payload = validCreatePayload({
      role: "basic",
      allowedWriteTableIds: [50, 99],
    });
    const res = await POST_USER(
      buildJsonRequest("/api/users", "POST", payload),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);

    const dbUser = await prisma.user.findUnique({ where: { id: body.id } });
    // Everything should be stripped, resulting in empty array
    expect(dbUser!.allowedWriteTableIds).toEqual([]);
  });

  it("manager creates basic user → verify companyId matches in DB", async () => {
    setAuthToken(managerAToken);
    const res = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload({ role: "basic" })),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);

    const dbUser = await prisma.user.findUnique({ where: { id: body.id } });
    expect(dbUser!.companyId).toBe(companyA.id);
  });

  it("minimal payload → default permissions={}, tablePermissions={}, allowedWriteTableIds=[] in DB", async () => {
    setAuthToken(adminAToken);
    const payload = validCreatePayload();
    const res = await POST_USER(
      buildJsonRequest("/api/users", "POST", {
        name: payload.name,
        email: payload.email,
        password: payload.password,
      }),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);

    const dbUser = await prisma.user.findUnique({ where: { id: body.id } });
    expect(dbUser!.permissions).toEqual({});
    expect(dbUser!.tablePermissions).toEqual({});
    expect(dbUser!.allowedWriteTableIds).toEqual([]);
  });

  // ── Validation ───────────────────────────────────────────────────

  it("missing name → 400 with field errors", async () => {
    setAuthToken(adminAToken);
    const res = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload({ name: "" })),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe("Validation failed");
    expect(body.details).toBeDefined();
  });

  it("invalid email → 400", async () => {
    setAuthToken(adminAToken);
    const res = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload({ email: "not-an-email" })),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe("Validation failed");
    expect(body.details).toBeDefined();
  });

  it("password too short (< 8 chars) → 400", async () => {
    setAuthToken(adminAToken);
    const res = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload({ password: "short" })),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe("Validation failed");
  });

  it("password too long (> 128 chars) → 400", async () => {
    setAuthToken(adminAToken);
    const res = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload({ password: "a".repeat(129) })),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe("Validation failed");
  });

  it("invalid role value → 400", async () => {
    setAuthToken(adminAToken);
    const res = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload({ role: "superadmin" })),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe("Validation failed");
  });

  it("unknown permission key → 400", async () => {
    setAuthToken(adminAToken);
    const res = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload({
        permissions: { nonExistentFlag: true },
      })),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe("Validation failed");
  });

  it("non-numeric tablePermission key → 400", async () => {
    setAuthToken(adminAToken);
    const res = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload({
        tablePermissions: { abc: "read" },
      })),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe("Validation failed");
  });

  it("invalid tablePermission value → 400", async () => {
    setAuthToken(adminAToken);
    const res = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload({
        tablePermissions: { "1": "admin" },
      })),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe("Validation failed");
  });

  it("allowedWriteTableIds with negative value → 400", async () => {
    setAuthToken(adminAToken);
    const res = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload({
        allowedWriteTableIds: [-1],
      })),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe("Validation failed");
  });

  it("extra/unknown fields (strict mode) → 400", async () => {
    setAuthToken(adminAToken);
    const res = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload({ unknownField: "value" })),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe("Validation failed");
  });

  it("invalid JSON body → 400", async () => {
    setAuthToken(adminAToken);
    const req = new Request(
      new URL("/api/users", "http://localhost:3000").toString(),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{ invalid json !!!",
      },
    );
    const res = await POST_USER(req);
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid JSON body");
  });

  // ── Boundary values ──────────────────────────────────────────────

  it("password exactly 8 chars (min boundary) → 200", async () => {
    setAuthToken(adminAToken);
    const res = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload({ password: "12345678" })),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.id).toBeDefined();
  });

  it("password exactly 128 chars (max boundary) → 200", async () => {
    setAuthToken(adminAToken);
    const res = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload({ password: "A".repeat(128) })),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.id).toBeDefined();
  });

  it("name exactly 200 chars (max boundary) → 200", async () => {
    setAuthToken(adminAToken);
    const res = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload({ name: "A".repeat(200) })),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.name).toBe("A".repeat(200));
  });

  it("name 201 chars (over max) → 400", async () => {
    setAuthToken(adminAToken);
    const res = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload({ name: "A".repeat(201) })),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe("Validation failed");
  });

  // NOTE: The 242-char local part exceeds RFC 5321's 64-char limit. Zod's .email()
  // is permissive (checks format x@y.z, not RFC local part limits). This test verifies
  // the .max(254) length constraint. If a future Zod upgrade enforces RFC limits, this
  // test will need adjustment.
  it("email exactly 254 chars (max boundary) → 200", async () => {
    setAuthToken(adminAToken);
    // 242 + "@" + "example.com" = 242 + 1 + 11 = 254
    const email254 = "a".repeat(242) + "@example.com";
    expect(email254.length).toBe(254);
    const res = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload({ email: email254 })),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.email).toBe(email254);
  });

  // NOTE: Same RFC caveat as above. The 400 here comes from .max(254) rejection,
  // not .email() format validation, since Zod is permissive with local part length.
  it("email 255 chars (over max) → 400", async () => {
    setAuthToken(adminAToken);
    // 243 + "@" + "example.com" = 243 + 1 + 11 = 255
    const email255 = "a".repeat(243) + "@example.com";
    expect(email255.length).toBe(255);
    const res = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload({ email: email255 })),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe("Validation failed");
  });

  // ── Uniqueness ───────────────────────────────────────────────────

  it("duplicate email → 400 generic message", async () => {
    setAuthToken(adminAToken);
    const res = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload({ email: adminA.email })),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe("Unable to create user with the provided details");
  });

  // ── DB verification ──────────────────────────────────────────────

  it("password stored as bcrypt hash, not plaintext", async () => {
    setAuthToken(adminAToken);
    const password = "myPlainTextPassword123";
    const payload = validCreatePayload({ password });
    const res = await POST_USER(
      buildJsonRequest("/api/users", "POST", payload),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);

    const dbUser = await prisma.user.findUnique({ where: { id: body.id } });
    expect(dbUser!.passwordHash).not.toBe(password);
    expect(await bcrypt.compare(password, dbUser!.passwordHash)).toBe(true);
  });

  it("companyId matches creator's company", async () => {
    setAuthToken(adminAToken);
    const res = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload()),
    );
    const body = await jsonBody(res);

    const dbUser = await prisma.user.findUnique({ where: { id: body.id } });
    expect(dbUser!.companyId).toBe(companyA.id);
  });

  it("audit log entry created with action USER_CREATED", async () => {
    setAuthToken(adminAToken);
    const payload = validCreatePayload();
    const res = await POST_USER(
      buildJsonRequest("/api/users", "POST", payload),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);

    // Wait briefly for fire-and-forget audit log
    await new Promise((r) => setTimeout(r, 200));

    const auditLog = await prisma.auditLog.findFirst({
      where: {
        action: "USER_CREATED",
        companyId: companyA.id,
        userId: adminA.id,
      },
      orderBy: { timestamp: "desc" },
    });
    expect(auditLog).not.toBeNull();
    expect((auditLog!.diffJson as any).targetUserId).toBe(body.id);
    expect((auditLog!.diffJson as any).email).toBe(payload.email);
    expect((auditLog!.diffJson as any).role).toBe(body.role);
  });

  it("audit log userId = manager when manager creates user", async () => {
    setAuthToken(managerAToken);
    const payload = validCreatePayload({ role: "basic" });
    const res = await POST_USER(buildJsonRequest("/api/users", "POST", payload));
    const body = await jsonBody(res);
    expect(res.status).toBe(200);

    await new Promise((r) => setTimeout(r, 200));
    const auditLog = await prisma.auditLog.findFirst({
      where: { action: "USER_CREATED", companyId: companyA.id, userId: managerA.id },
      orderBy: { timestamp: "desc" },
    });
    expect(auditLog).not.toBeNull();
    expect((auditLog!.diffJson as any).targetUserId).toBe(body.id);
  });

  // ── Response contract ────────────────────────────────────────────

  it("response has no passwordHash and no companyId", async () => {
    setAuthToken(adminAToken);
    const res = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload()),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body).not.toHaveProperty("passwordHash");
    expect(body).not.toHaveProperty("companyId");
    expect(Object.keys(body).sort()).toEqual(EXPECTED_USER_FIELDS.sort());
  });

  it("response createdAt and updatedAt are recent ISO timestamps", async () => {
    setAuthToken(adminAToken);
    const before = Date.now();
    const res = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload()),
    );
    const body = await jsonBody(res);
    const after = Date.now();

    expect(res.status).toBe(200);

    // Verify valid ISO 8601 format
    expect(new Date(body.createdAt).toISOString()).toBe(body.createdAt);
    expect(new Date(body.updatedAt).toISOString()).toBe(body.updatedAt);

    // Verify timestamps are recent (within the request window + 10s tolerance)
    const createdMs = new Date(body.createdAt).getTime();
    const updatedMs = new Date(body.updatedAt).getTime();
    expect(createdMs).toBeGreaterThanOrEqual(before - 10_000);
    expect(createdMs).toBeLessThanOrEqual(after + 10_000);
    expect(updatedMs).toBeGreaterThanOrEqual(before - 10_000);
    expect(updatedMs).toBeLessThanOrEqual(after + 10_000);
  });
});

// =====================================================================
// 3. GET /api/users/[id] — Get Single User
// =====================================================================

describe("GET /api/users/[id]", () => {
  it("admin fetches any user in same company → 200", async () => {
    setAuthToken(adminAToken);
    const res = await GET_USER_BY_ID(
      buildGetRequest(`/api/users/${basicNoPermsA.id}`),
      makeParams(basicNoPermsA.id),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.id).toBe(basicNoPermsA.id);
    expect(body.name).toBe("Basic NoPerms");
  });

  it("basic user with canViewUsers fetches another user → 200", async () => {
    setAuthToken(basicViewToken);
    const res = await GET_USER_BY_ID(
      buildGetRequest(`/api/users/${managerA.id}`),
      makeParams(managerA.id),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.id).toBe(managerA.id);
  });

  it("manager with canViewUsers fetches another user → 200", async () => {
    setAuthToken(managerAToken);
    const res = await GET_USER_BY_ID(
      buildGetRequest(`/api/users/${basicNoPermsA.id}`),
      makeParams(basicNoPermsA.id),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.id).toBe(basicNoPermsA.id);
    expect(body.name).toBe("Basic NoPerms");
  });

  it("self-access: basic user without canViewUsers fetches own profile → 200", async () => {
    setAuthToken(basicNoPermsToken);
    const res = await GET_USER_BY_ID(
      buildGetRequest(`/api/users/${basicNoPermsA.id}`),
      makeParams(basicNoPermsA.id),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.id).toBe(basicNoPermsA.id);
  });

  it("basic user without canViewUsers fetches other user → 403", async () => {
    setAuthToken(basicNoPermsToken);
    const res = await GET_USER_BY_ID(
      buildGetRequest(`/api/users/${adminA.id}`),
      makeParams(adminA.id),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(403);
    expect(body.error).toBe("Forbidden");
  });

  it("unauthenticated → 401", async () => {
    setAuthToken(null);
    const res = await GET_USER_BY_ID(
      buildGetRequest(`/api/users/${adminA.id}`),
      makeParams(adminA.id),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("user not found (valid ID, doesn't exist) → 404", async () => {
    setAuthToken(adminAToken);
    const res = await GET_USER_BY_ID(
      buildGetRequest("/api/users/999999"),
      makeParams(999999),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(404);
    expect(body.error).toBe("User not found");
  });

  it("user in other company → 404 (not 403, to avoid enumeration)", async () => {
    setAuthToken(adminAToken);
    const res = await GET_USER_BY_ID(
      buildGetRequest(`/api/users/${adminB.id}`),
      makeParams(adminB.id),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(404);
    expect(body.error).toBe("User not found");

    // Verify target user still exists unchanged in DB
    const dbUser = await prisma.user.findUnique({ where: { id: adminB.id } });
    expect(dbUser).not.toBeNull();
    expect(dbUser!.name).toBe("Admin B");
  });

  it("invalid ID (non-numeric) → 400", async () => {
    setAuthToken(adminAToken);
    const res = await GET_USER_BY_ID(
      buildGetRequest("/api/users/abc"),
      makeParams("abc"),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid user ID");
  });

  it("invalid ID (negative) → 400", async () => {
    setAuthToken(adminAToken);
    const res = await GET_USER_BY_ID(
      buildGetRequest("/api/users/-1"),
      makeParams("-1"),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid user ID");
  });

  it("invalid ID (zero) → 400", async () => {
    setAuthToken(adminAToken);
    const res = await GET_USER_BY_ID(
      buildGetRequest("/api/users/0"),
      makeParams("0"),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid user ID");
  });

  it("invalid ID (float) → 400", async () => {
    setAuthToken(adminAToken);
    const res = await GET_USER_BY_ID(
      buildGetRequest("/api/users/1.5"),
      makeParams("1.5"),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid user ID");
  });

  it("response shape matches expected fields, no passwordHash", async () => {
    setAuthToken(adminAToken);
    const res = await GET_USER_BY_ID(
      buildGetRequest(`/api/users/${basicNoPermsA.id}`),
      makeParams(basicNoPermsA.id),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(EXPECTED_USER_FIELDS.sort());
    expect(body).not.toHaveProperty("passwordHash");
    expect(body).not.toHaveProperty("companyId");
  });
});

// =====================================================================
// 4. PATCH /api/users/[id] — Update User
// =====================================================================

describe("PATCH /api/users/[id]", () => {
  // ── Admin updates ────────────────────────────────────────────────

  it("admin updates name → 200, verify DB", async () => {
    setAuthToken(adminAToken);
    const createRes = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload()),
    );
    const created = await jsonBody(createRes);

    const res = await PATCH_USER(
      buildJsonRequest(`/api/users/${created.id}`, "PATCH", { name: "Updated Name" }),
      makeParams(created.id),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.name).toBe("Updated Name");

    const dbUser = await prisma.user.findUnique({ where: { id: created.id } });
    expect(dbUser!.name).toBe("Updated Name");
  });

  it("admin updates email → 200, verify DB", async () => {
    setAuthToken(adminAToken);
    const createRes = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload()),
    );
    const created = await jsonBody(createRes);

    const newEmail = `updated-${Date.now()}@test.com`;
    const res = await PATCH_USER(
      buildJsonRequest(`/api/users/${created.id}`, "PATCH", { email: newEmail }),
      makeParams(created.id),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.email).toBe(newEmail);

    const dbUser = await prisma.user.findUnique({ where: { id: created.id } });
    expect(dbUser!.email).toBe(newEmail);
  });

  it("admin updates role → 200, verify DB", async () => {
    // Create a disposable user for role change
    setAuthToken(adminAToken);
    const createRes = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload({ role: "basic" })),
    );
    const created = await jsonBody(createRes);

    const res = await PATCH_USER(
      buildJsonRequest(`/api/users/${created.id}`, "PATCH", { role: "manager" }),
      makeParams(created.id),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.role).toBe("manager");

    const dbUser = await prisma.user.findUnique({ where: { id: created.id } });
    expect(dbUser!.role).toBe("manager");
  });

  it("admin updates permissions → 200, verify DB", async () => {
    setAuthToken(adminAToken);
    const createRes = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload({ role: "basic" })),
    );
    const created = await jsonBody(createRes);

    const res = await PATCH_USER(
      buildJsonRequest(`/api/users/${created.id}`, "PATCH", {
        permissions: { canViewDashboard: true },
      }),
      makeParams(created.id),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.permissions).toEqual({ canViewDashboard: true });

    const dbUser = await prisma.user.findUnique({ where: { id: created.id } });
    expect(dbUser!.permissions).toEqual({ canViewDashboard: true });
  });

  it("admin updates password → 200, hash changed, revokeUserSessions called", async () => {
    setAuthToken(adminAToken);
    const createRes = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload()),
    );
    const created = await jsonBody(createRes);

    const dbBefore = await prisma.user.findUnique({ where: { id: created.id } });
    const oldHash = dbBefore!.passwordHash;

    const res = await PATCH_USER(
      buildJsonRequest(`/api/users/${created.id}`, "PATCH", { password: "newPassword456" }),
      makeParams(created.id),
    );

    expect(res.status).toBe(200);

    const dbAfter = await prisma.user.findUnique({ where: { id: created.id } });
    expect(dbAfter!.passwordHash).not.toBe(oldHash);
    expect(await bcrypt.compare("newPassword456", dbAfter!.passwordHash)).toBe(true);
    expect(revokeUserSessions).toHaveBeenCalledWith(created.id);
  });

  it("after password update, old password no longer matches DB hash", async () => {
    setAuthToken(adminAToken);
    const oldPassword = "originalPass123";
    const newPassword = "brandNewPass456";
    const createRes = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload({ password: oldPassword })),
    );
    const created = await jsonBody(createRes);

    // Verify old password matches before PATCH
    const dbBefore = await prisma.user.findUnique({ where: { id: created.id } });
    expect(await bcrypt.compare(oldPassword, dbBefore!.passwordHash)).toBe(true);

    await PATCH_USER(
      buildJsonRequest(`/api/users/${created.id}`, "PATCH", { password: newPassword }),
      makeParams(created.id),
    );

    const dbAfter = await prisma.user.findUnique({ where: { id: created.id } });
    // Old password should no longer match
    expect(await bcrypt.compare(oldPassword, dbAfter!.passwordHash)).toBe(false);
    // New password should match
    expect(await bcrypt.compare(newPassword, dbAfter!.passwordHash)).toBe(true);
  });

  it("admin updates multiple fields at once → 200", async () => {
    setAuthToken(adminAToken);
    const createRes = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload()),
    );
    const created = await jsonBody(createRes);

    const res = await PATCH_USER(
      buildJsonRequest(`/api/users/${created.id}`, "PATCH", {
        name: "Multi Update",
        role: "manager",
      }),
      makeParams(created.id),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.name).toBe("Multi Update");
    expect(body.role).toBe("manager");

    const dbUser = await prisma.user.findUnique({ where: { id: created.id } });
    expect(dbUser!.name).toBe("Multi Update");
    expect(dbUser!.role).toBe("manager");
  });

  it("admin updates tablePermissions → 200, verify DB", async () => {
    setAuthToken(adminAToken);
    const createRes = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload({ role: "basic" })),
    );
    const created = await jsonBody(createRes);

    const res = await PATCH_USER(
      buildJsonRequest(`/api/users/${created.id}`, "PATCH", {
        tablePermissions: { "5": "write", "10": "read" },
      }),
      makeParams(created.id),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.tablePermissions).toEqual({ "5": "write", "10": "read" });

    const dbUser = await prisma.user.findUnique({ where: { id: created.id } });
    expect(dbUser!.tablePermissions).toEqual({ "5": "write", "10": "read" });
  });

  it("admin updates allowedWriteTableIds → 200, verify DB", async () => {
    setAuthToken(adminAToken);
    const createRes = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload({ role: "basic" })),
    );
    const created = await jsonBody(createRes);

    const res = await PATCH_USER(
      buildJsonRequest(`/api/users/${created.id}`, "PATCH", {
        allowedWriteTableIds: [3, 7, 12],
      }),
      makeParams(created.id),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.allowedWriteTableIds).toEqual([3, 7, 12]);

    const dbUser = await prisma.user.findUnique({ where: { id: created.id } });
    expect(dbUser!.allowedWriteTableIds).toEqual([3, 7, 12]);
  });

  it("admin promotes basic user to admin → 200, verify DB", async () => {
    setAuthToken(adminAToken);
    const createRes = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload({ role: "basic" })),
    );
    const created = await jsonBody(createRes);

    const res = await PATCH_USER(
      buildJsonRequest(`/api/users/${created.id}`, "PATCH", { role: "admin" }),
      makeParams(created.id),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.role).toBe("admin");

    const dbUser = await prisma.user.findUnique({ where: { id: created.id } });
    expect(dbUser!.role).toBe("admin");
  });

  it("admin demotes admin to basic → 200, verify DB + SEC_ROLE_CHANGED", async () => {
    setAuthToken(adminAToken);
    const createRes = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload({ role: "admin" })),
    );
    const created = await jsonBody(createRes);

    const res = await PATCH_USER(
      buildJsonRequest(`/api/users/${created.id}`, "PATCH", { role: "basic" }),
      makeParams(created.id),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.role).toBe("basic");

    const dbUser2 = await prisma.user.findUnique({ where: { id: created.id } });
    expect(dbUser2!.role).toBe("basic");

    expect(logSecurityEvent).toHaveBeenCalledWith({
      action: "SEC_ROLE_CHANGED",
      companyId: companyA.id,
      userId: adminA.id,
      details: { targetUserId: created.id, oldRole: "admin", newRole: "basic" },
    });
  });

  // ── Self-update (non-admin) ──────────────────────────────────────

  it("non-admin updates own name → 200", async () => {
    // Create a disposable basic user with no permissions
    setAuthToken(adminAToken);
    const createRes = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload({ role: "basic", permissions: {} })),
    );
    const created = await jsonBody(createRes);
    const selfToken = signTokenForUser(created.id);

    setAuthToken(selfToken);
    const res = await PATCH_USER(
      buildJsonRequest(`/api/users/${created.id}`, "PATCH", { name: "Self Updated" }),
      makeParams(created.id),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.name).toBe("Self Updated");

    const dbUser = await prisma.user.findUnique({ where: { id: created.id } });
    expect(dbUser!.name).toBe("Self Updated");
  });

  it("non-admin updates own password → 200", async () => {
    // Create a disposable basic user
    setAuthToken(adminAToken);
    const createRes = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload({ role: "basic", permissions: {} })),
    );
    const created = await jsonBody(createRes);
    const selfToken = signTokenForUser(created.id);

    setAuthToken(selfToken);
    const res = await PATCH_USER(
      buildJsonRequest(`/api/users/${created.id}`, "PATCH", { password: "newSelfPassword123" }),
      makeParams(created.id),
    );

    expect(res.status).toBe(200);
    expect(revokeUserSessions).toHaveBeenCalledWith(created.id);

    const dbUser = await prisma.user.findUnique({ where: { id: created.id } });
    expect(await bcrypt.compare("newSelfPassword123", dbUser!.passwordHash)).toBe(true);
  });

  it("non-admin tries to change own role → 403", async () => {
    setAuthToken(basicNoPermsToken);
    const res = await PATCH_USER(
      buildJsonRequest(`/api/users/${basicNoPermsA.id}`, "PATCH", { role: "admin" }),
      makeParams(basicNoPermsA.id),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(403);
    expect(body.error).toBe("Only admins can change role, permissions, or email");
  });

  it("non-admin tries to change own email → 403", async () => {
    setAuthToken(basicNoPermsToken);
    const res = await PATCH_USER(
      buildJsonRequest(`/api/users/${basicNoPermsA.id}`, "PATCH", { email: "new@test.com" }),
      makeParams(basicNoPermsA.id),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(403);
    expect(body.error).toBe("Only admins can change role, permissions, or email");
  });

  it("non-admin tries to change own permissions → 403", async () => {
    setAuthToken(basicNoPermsToken);
    const res = await PATCH_USER(
      buildJsonRequest(`/api/users/${basicNoPermsA.id}`, "PATCH", {
        permissions: { canViewDashboard: true },
      }),
      makeParams(basicNoPermsA.id),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(403);
    expect(body.error).toBe("Only admins can change role, permissions, or email");
  });

  it("non-admin tries to change own tablePermissions → 403", async () => {
    setAuthToken(basicNoPermsToken);
    const res = await PATCH_USER(
      buildJsonRequest(`/api/users/${basicNoPermsA.id}`, "PATCH", {
        tablePermissions: { "1": "read" },
      }),
      makeParams(basicNoPermsA.id),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(403);
    expect(body.error).toBe("Only admins can change role, permissions, or email");
  });

  it("non-admin tries to change own allowedWriteTableIds → 403", async () => {
    setAuthToken(basicNoPermsToken);
    const res = await PATCH_USER(
      buildJsonRequest(`/api/users/${basicNoPermsA.id}`, "PATCH", {
        allowedWriteTableIds: [1, 2],
      }),
      makeParams(basicNoPermsA.id),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(403);
    expect(body.error).toBe("Only admins can change role, permissions, or email");
  });

  it("non-admin with mixed safe+sensitive fields (name + role) → 403", async () => {
    setAuthToken(basicNoPermsToken);
    const res = await PATCH_USER(
      buildJsonRequest(`/api/users/${basicNoPermsA.id}`, "PATCH", {
        name: "Trick",
        role: "admin",
      }),
      makeParams(basicNoPermsA.id),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(403);
    expect(body.error).toBe("Only admins can change role, permissions, or email");
  });

  // ── Authorization ────────────────────────────────────────────────

  it("non-admin updating another user → 403", async () => {
    setAuthToken(basicNoPermsToken);
    const res = await PATCH_USER(
      buildJsonRequest(`/api/users/${adminA.id}`, "PATCH", { name: "Hacked" }),
      makeParams(adminA.id),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(403);
    expect(body.error).toBe("Only admins can update other users");
  });

  it("manager updating another user → 403", async () => {
    setAuthToken(managerAToken);
    const res = await PATCH_USER(
      buildJsonRequest(`/api/users/${adminA.id}`, "PATCH", { name: "Hacked" }),
      makeParams(adminA.id),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(403);
    expect(body.error).toBe("Only admins can update other users");
  });

  it("unauthenticated → 401", async () => {
    setAuthToken(null);
    const res = await PATCH_USER(
      buildJsonRequest(`/api/users/${adminA.id}`, "PATCH", { name: "Hacked" }),
      makeParams(adminA.id),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  // ── Validation ───────────────────────────────────────────────────

  it("empty name → 400", async () => {
    setAuthToken(adminAToken);
    const res = await PATCH_USER(
      buildJsonRequest(`/api/users/${basicNoPermsA.id}`, "PATCH", { name: "" }),
      makeParams(basicNoPermsA.id),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe("Validation failed");
  });

  it("invalid email → 400", async () => {
    setAuthToken(adminAToken);
    const res = await PATCH_USER(
      buildJsonRequest(`/api/users/${basicNoPermsA.id}`, "PATCH", { email: "bad" }),
      makeParams(basicNoPermsA.id),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe("Validation failed");
  });

  it("password too short → 400", async () => {
    setAuthToken(adminAToken);
    const res = await PATCH_USER(
      buildJsonRequest(`/api/users/${basicNoPermsA.id}`, "PATCH", { password: "short" }),
      makeParams(basicNoPermsA.id),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe("Validation failed");
  });

  it("password too long (129 chars) → 400", async () => {
    setAuthToken(adminAToken);
    const res = await PATCH_USER(
      buildJsonRequest(`/api/users/${basicNoPermsA.id}`, "PATCH", { password: "a".repeat(129) }),
      makeParams(basicNoPermsA.id),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe("Validation failed");
  });

  it("invalid role → 400", async () => {
    setAuthToken(adminAToken);
    const res = await PATCH_USER(
      buildJsonRequest(`/api/users/${basicNoPermsA.id}`, "PATCH", { role: "superadmin" }),
      makeParams(basicNoPermsA.id),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe("Validation failed");
  });

  it("extra fields (strict mode) → 400", async () => {
    setAuthToken(adminAToken);
    const res = await PATCH_USER(
      buildJsonRequest(`/api/users/${basicNoPermsA.id}`, "PATCH", { unknownField: "val" }),
      makeParams(basicNoPermsA.id),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe("Validation failed");
  });

  it("invalid JSON → 400", async () => {
    setAuthToken(adminAToken);
    const req = new Request(
      new URL(`/api/users/${basicNoPermsA.id}`, "http://localhost:3000").toString(),
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: "not json!!!",
      },
    );
    const res = await PATCH_USER(req, makeParams(basicNoPermsA.id));
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid JSON body");
  });

  it("empty body {} → 200, only updatedAt changes", async () => {
    setAuthToken(adminAToken);
    const createRes = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload()),
    );
    const created = await jsonBody(createRes);
    const dbBefore = await prisma.user.findUnique({ where: { id: created.id } });

    // Small delay so updatedAt differs
    await new Promise((r) => setTimeout(r, 50));

    const res = await PATCH_USER(
      buildJsonRequest(`/api/users/${created.id}`, "PATCH", {}),
      makeParams(created.id),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.name).toBe(created.name);
    expect(body.email).toBe(created.email);
    expect(body.role).toBe(created.role);

    // DB: name/email/role unchanged, updatedAt changed
    const dbAfter = await prisma.user.findUnique({ where: { id: created.id } });
    expect(dbAfter!.name).toBe(dbBefore!.name);
    expect(dbAfter!.email).toBe(dbBefore!.email);
    expect(dbAfter!.role).toBe(dbBefore!.role);
    expect(dbAfter!.updatedAt.getTime()).toBeGreaterThanOrEqual(dbBefore!.updatedAt.getTime());
  });

  // ── Uniqueness ───────────────────────────────────────────────────

  it("change email to taken email → 400", async () => {
    setAuthToken(adminAToken);
    const res = await PATCH_USER(
      buildJsonRequest(`/api/users/${basicNoPermsA.id}`, "PATCH", {
        email: adminA.email,
      }),
      makeParams(basicNoPermsA.id),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe("Unable to update user with the provided details");
  });

  it("PATCH same email as current (no change) → 200", async () => {
    setAuthToken(adminAToken);
    const createRes = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload()),
    );
    const created = await jsonBody(createRes);

    const res = await PATCH_USER(
      buildJsonRequest(`/api/users/${created.id}`, "PATCH", {
        email: created.email,
      }),
      makeParams(created.id),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.email).toBe(created.email);
  });

  it("PATCH permissions: {} → clears all permissions in DB", async () => {
    setAuthToken(adminAToken);
    const createRes = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload({
        permissions: { canViewUsers: true, canViewTables: true },
      })),
    );
    const created = await jsonBody(createRes);

    // Verify non-empty permissions before clearing
    const dbBefore = await prisma.user.findUnique({ where: { id: created.id } });
    expect(Object.keys(dbBefore!.permissions as object).length).toBeGreaterThan(0);

    const res = await PATCH_USER(
      buildJsonRequest(`/api/users/${created.id}`, "PATCH", { permissions: {} }),
      makeParams(created.id),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.permissions).toEqual({});

    const dbAfter = await prisma.user.findUnique({ where: { id: created.id } });
    expect(dbAfter!.permissions).toEqual({});
  });

  it("PATCH tablePermissions: {} → clears all tablePermissions in DB", async () => {
    setAuthToken(adminAToken);
    const createRes = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload({
        tablePermissions: { "5": "write", "10": "read" },
      })),
    );
    const created = await jsonBody(createRes);

    // Verify non-empty tablePermissions before clearing
    const dbBefore = await prisma.user.findUnique({ where: { id: created.id } });
    expect(Object.keys(dbBefore!.tablePermissions as object).length).toBeGreaterThan(0);

    const res = await PATCH_USER(
      buildJsonRequest(`/api/users/${created.id}`, "PATCH", { tablePermissions: {} }),
      makeParams(created.id),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.tablePermissions).toEqual({});

    const dbAfter = await prisma.user.findUnique({ where: { id: created.id } });
    expect(dbAfter!.tablePermissions).toEqual({});
  });

  it("PATCH allowedWriteTableIds: [] → clears all allowedWriteTableIds in DB", async () => {
    setAuthToken(adminAToken);
    const createRes = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload({
        allowedWriteTableIds: [3, 7, 12],
      })),
    );
    const created = await jsonBody(createRes);

    // Verify non-empty allowedWriteTableIds before clearing
    const dbBefore = await prisma.user.findUnique({ where: { id: created.id } });
    expect((dbBefore!.allowedWriteTableIds as number[]).length).toBeGreaterThan(0);

    const res = await PATCH_USER(
      buildJsonRequest(`/api/users/${created.id}`, "PATCH", { allowedWriteTableIds: [] }),
      makeParams(created.id),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.allowedWriteTableIds).toEqual([]);

    const dbAfter = await prisma.user.findUnique({ where: { id: created.id } });
    expect(dbAfter!.allowedWriteTableIds).toEqual([]);
  });

  // ── Cross-company ────────────────────────────────────────────────

  it("admin A updating company B user → 404, verify target unchanged", async () => {
    const dbBefore = await prisma.user.findUnique({ where: { id: adminB.id } });

    setAuthToken(adminAToken);
    const res = await PATCH_USER(
      buildJsonRequest(`/api/users/${adminB.id}`, "PATCH", { name: "Cross" }),
      makeParams(adminB.id),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(404);
    expect(body.error).toBe("User not found");

    // Verify target user unchanged
    const dbAfter = await prisma.user.findUnique({ where: { id: adminB.id } });
    expect(dbAfter!.name).toBe(dbBefore!.name);
  });

  // ── Not found ────────────────────────────────────────────────────

  it("non-existent user ID → 404", async () => {
    setAuthToken(adminAToken);
    const res = await PATCH_USER(
      buildJsonRequest("/api/users/999999", "PATCH", { name: "Ghost" }),
      makeParams(999999),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(404);
    expect(body.error).toBe("User not found");
  });

  it("invalid ID format → 400", async () => {
    setAuthToken(adminAToken);
    const res = await PATCH_USER(
      buildJsonRequest("/api/users/abc", "PATCH", { name: "Bad" }),
      makeParams("abc"),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid user ID");
  });

  // ── DB verification ──────────────────────────────────────────────

  it("revokeUserSessions NOT called when only name is changed", async () => {
    setAuthToken(adminAToken);
    const createRes = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload()),
    );
    const created = await jsonBody(createRes);

    // Clear mocks from the POST call
    vi.mocked(revokeUserSessions).mockClear();

    await PATCH_USER(
      buildJsonRequest(`/api/users/${created.id}`, "PATCH", { name: "Name Only Change" }),
      makeParams(created.id),
    );

    expect(revokeUserSessions).not.toHaveBeenCalled();
  });

  it("logSecurityEvent NOT called when only name is changed", async () => {
    setAuthToken(adminAToken);
    const createRes = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload()),
    );
    const created = await jsonBody(createRes);
    vi.mocked(logSecurityEvent).mockClear();

    await PATCH_USER(
      buildJsonRequest(`/api/users/${created.id}`, "PATCH", { name: "Safe Change" }),
      makeParams(created.id),
    );
    expect(logSecurityEvent).not.toHaveBeenCalled();
  });

  it("updatedAt changes after update", async () => {
    setAuthToken(adminAToken);
    const createRes = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload()),
    );
    const created = await jsonBody(createRes);
    const dbBefore = await prisma.user.findUnique({ where: { id: created.id } });

    // Small delay so updatedAt differs
    await new Promise((r) => setTimeout(r, 50));

    await PATCH_USER(
      buildJsonRequest(`/api/users/${created.id}`, "PATCH", { name: "Time Check" }),
      makeParams(created.id),
    );

    const dbAfter = await prisma.user.findUnique({ where: { id: created.id } });
    expect(dbAfter!.updatedAt.getTime()).toBeGreaterThan(dbBefore!.updatedAt.getTime());
  });

  it("audit log USER_UPDATED created with changed field names", async () => {
    setAuthToken(adminAToken);
    const createRes = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload()),
    );
    const created = await jsonBody(createRes);

    await PATCH_USER(
      buildJsonRequest(`/api/users/${created.id}`, "PATCH", { name: "Audited" }),
      makeParams(created.id),
    );

    await new Promise((r) => setTimeout(r, 200));

    const auditLog = await prisma.auditLog.findFirst({
      where: {
        action: "USER_UPDATED",
        companyId: companyA.id,
        userId: adminA.id,
      },
      orderBy: { timestamp: "desc" },
    });
    expect(auditLog).not.toBeNull();
    expect((auditLog!.diffJson as any).changes).toContain("name");
    expect((auditLog!.diffJson as any).targetUserId).toBe(created.id);
  });

  it("security event logged for password change", async () => {
    setAuthToken(adminAToken);
    const createRes = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload()),
    );
    const created = await jsonBody(createRes);

    await PATCH_USER(
      buildJsonRequest(`/api/users/${created.id}`, "PATCH", { password: "newSecure123" }),
      makeParams(created.id),
    );

    expect(logSecurityEvent).toHaveBeenCalledWith({
      action: "SEC_PASSWORD_CHANGED",
      companyId: companyA.id,
      userId: adminA.id,
      details: { targetUserId: created.id, changedBy: adminA.id },
    });
  });

  it("security event logged for role change", async () => {
    setAuthToken(adminAToken);
    const createRes = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload({ role: "basic" })),
    );
    const created = await jsonBody(createRes);

    await PATCH_USER(
      buildJsonRequest(`/api/users/${created.id}`, "PATCH", { role: "manager" }),
      makeParams(created.id),
    );

    expect(logSecurityEvent).toHaveBeenCalledWith({
      action: "SEC_ROLE_CHANGED",
      companyId: companyA.id,
      userId: adminA.id,
      details: { targetUserId: created.id, oldRole: "basic", newRole: "manager" },
    });
  });

  it("security event logged for permissions change", async () => {
    setAuthToken(adminAToken);
    const createRes = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload()),
    );
    const created = await jsonBody(createRes);

    await PATCH_USER(
      buildJsonRequest(`/api/users/${created.id}`, "PATCH", {
        permissions: { canViewDashboard: true },
      }),
      makeParams(created.id),
    );

    expect(logSecurityEvent).toHaveBeenCalledWith({
      action: "SEC_PERMISSIONS_CHANGED",
      companyId: companyA.id,
      userId: adminA.id,
      details: { targetUserId: created.id },
    });
  });

  it("security event logged for tablePermissions-only change", async () => {
    setAuthToken(adminAToken);
    const createRes = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload()),
    );
    const created = await jsonBody(createRes);

    await PATCH_USER(
      buildJsonRequest(`/api/users/${created.id}`, "PATCH", {
        tablePermissions: { "3": "write" },
      }),
      makeParams(created.id),
    );

    expect(logSecurityEvent).toHaveBeenCalledWith({
      action: "SEC_PERMISSIONS_CHANGED",
      companyId: companyA.id,
      userId: adminA.id,
      details: { targetUserId: created.id },
    });
  });

  it("role change to same value → 200, SEC_ROLE_CHANGED NOT fired", async () => {
    setAuthToken(adminAToken);
    const createRes = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload({ role: "basic" })),
    );
    const created = await jsonBody(createRes);

    const res = await PATCH_USER(
      buildJsonRequest(`/api/users/${created.id}`, "PATCH", { role: "basic" }),
      makeParams(created.id),
    );

    expect(res.status).toBe(200);
    expect(logSecurityEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: "SEC_ROLE_CHANGED" }),
    );
  });

  it("password + role change in single PATCH → both security events fire", async () => {
    setAuthToken(adminAToken);
    const createRes = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload({ role: "basic" })),
    );
    const created = await jsonBody(createRes);

    await PATCH_USER(
      buildJsonRequest(`/api/users/${created.id}`, "PATCH", {
        password: "newPass123456",
        role: "manager",
      }),
      makeParams(created.id),
    );

    expect(logSecurityEvent).toHaveBeenCalledWith({
      action: "SEC_PASSWORD_CHANGED",
      companyId: companyA.id,
      userId: adminA.id,
      details: { targetUserId: created.id, changedBy: adminA.id },
    });
    expect(logSecurityEvent).toHaveBeenCalledWith({
      action: "SEC_ROLE_CHANGED",
      companyId: companyA.id,
      userId: adminA.id,
      details: { targetUserId: created.id, oldRole: "basic", newRole: "manager" },
    });
  });

  it("allowedWriteTableIds-only update → SEC_PERMISSIONS_CHANGED NOT fired", async () => {
    setAuthToken(adminAToken);
    const createRes = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload()),
    );
    const created = await jsonBody(createRes);
    vi.mocked(logSecurityEvent).mockClear();

    await PATCH_USER(
      buildJsonRequest(`/api/users/${created.id}`, "PATCH", {
        allowedWriteTableIds: [5, 10],
      }),
      makeParams(created.id),
    );

    expect(logSecurityEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: "SEC_PERMISSIONS_CHANGED" }),
    );

    // Verify DB still updated despite no security event
    const dbUser = await prisma.user.findUnique({ where: { id: created.id } });
    expect(dbUser!.allowedWriteTableIds).toEqual([5, 10]);
  });

  it("clearing permissions with {} fires SEC_PERMISSIONS_CHANGED", async () => {
    setAuthToken(adminAToken);
    const createRes = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload({
        permissions: { canViewUsers: true },
      })),
    );
    const created = await jsonBody(createRes);
    vi.mocked(logSecurityEvent).mockClear();

    await PATCH_USER(
      buildJsonRequest(`/api/users/${created.id}`, "PATCH", { permissions: {} }),
      makeParams(created.id),
    );

    expect(logSecurityEvent).toHaveBeenCalledWith({
      action: "SEC_PERMISSIONS_CHANGED",
      companyId: companyA.id,
      userId: adminA.id,
      details: { targetUserId: created.id },
    });
  });

  // ── Response contract ────────────────────────────────────────────

  it("returns updated user with correct fields, no passwordHash", async () => {
    setAuthToken(adminAToken);
    const createRes = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload()),
    );
    const created = await jsonBody(createRes);

    const res = await PATCH_USER(
      buildJsonRequest(`/api/users/${created.id}`, "PATCH", { name: "Contract Check" }),
      makeParams(created.id),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(EXPECTED_USER_FIELDS.sort());
    expect(body).not.toHaveProperty("passwordHash");
    expect(body).not.toHaveProperty("companyId");
    expect(body.name).toBe("Contract Check");
  });
});

// =====================================================================
// 5. DELETE /api/users/[id] — Delete User
// =====================================================================

describe("DELETE /api/users/[id]", () => {
  it("admin deletes user in same company → 200 { success: true }, verify DB", async () => {
    // Create a disposable user
    setAuthToken(adminAToken);
    const createRes = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload()),
    );
    const created = await jsonBody(createRes);

    const res = await DELETE_USER(
      buildGetRequest(`/api/users/${created.id}`),
      makeParams(created.id),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true });

    // Verify user actually deleted in DB
    const dbUser = await prisma.user.findUnique({ where: { id: created.id } });
    expect(dbUser).toBeNull();
  });

  it("audit log USER_DELETED created", async () => {
    setAuthToken(adminAToken);
    const createRes = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload()),
    );
    const created = await jsonBody(createRes);

    await DELETE_USER(
      buildGetRequest(`/api/users/${created.id}`),
      makeParams(created.id),
    );

    await new Promise((r) => setTimeout(r, 200));

    const auditLog = await prisma.auditLog.findFirst({
      where: {
        action: "USER_DELETED",
        companyId: companyA.id,
        userId: adminA.id,
      },
      orderBy: { timestamp: "desc" },
    });
    expect(auditLog).not.toBeNull();
    expect((auditLog!.diffJson as any).targetUserId).toBe(created.id);
    expect((auditLog!.diffJson as any).email).toBe(created.email);
  });

  it("non-admin → 403, verify user NOT deleted in DB", async () => {
    // Create a disposable user to attempt to delete
    setAuthToken(adminAToken);
    const createRes = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload()),
    );
    const created = await jsonBody(createRes);

    setAuthToken(basicNoPermsToken);
    const res = await DELETE_USER(
      buildGetRequest(`/api/users/${created.id}`),
      makeParams(created.id),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(403);
    expect(body.error).toBe("Only admins can delete users");

    // Verify user still exists in DB
    const dbUser = await prisma.user.findUnique({ where: { id: created.id } });
    expect(dbUser).not.toBeNull();
  });

  it("unauthenticated → 401", async () => {
    setAuthToken(null);
    const res = await DELETE_USER(
      buildGetRequest(`/api/users/${adminA.id}`),
      makeParams(adminA.id),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("admin tries to delete self → 400, admin still exists in DB", async () => {
    setAuthToken(adminAToken);
    const res = await DELETE_USER(
      buildGetRequest(`/api/users/${adminA.id}`),
      makeParams(adminA.id),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe("Cannot delete yourself");

    // Verify admin still exists in DB
    const dbUser = await prisma.user.findUnique({ where: { id: adminA.id } });
    expect(dbUser).not.toBeNull();
  });

  it("admin A deletes company B user → 404, target still exists in DB", async () => {
    setAuthToken(adminAToken);
    const res = await DELETE_USER(
      buildGetRequest(`/api/users/${adminB.id}`),
      makeParams(adminB.id),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(404);
    expect(body.error).toBe("User not found");

    // Verify adminB still exists in DB
    const dbUser = await prisma.user.findUnique({ where: { id: adminB.id } });
    expect(dbUser).not.toBeNull();
    expect(dbUser!.email).toBe("admin-b@test.com");
  });

  it("manager tries to delete user → 403", async () => {
    // Create a disposable user to attempt to delete
    setAuthToken(adminAToken);
    const createRes = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload()),
    );
    const created = await jsonBody(createRes);

    setAuthToken(managerAToken);
    const res = await DELETE_USER(
      buildGetRequest(`/api/users/${created.id}`),
      makeParams(created.id),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(403);
    expect(body.error).toBe("Only admins can delete users");

    // Verify user still exists in DB
    const dbUser = await prisma.user.findUnique({ where: { id: created.id } });
    expect(dbUser).not.toBeNull();
  });

  it("non-existent user → 404", async () => {
    setAuthToken(adminAToken);
    const res = await DELETE_USER(
      buildGetRequest("/api/users/999999"),
      makeParams(999999),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(404);
    expect(body.error).toBe("User not found");
  });

  it("invalid ID → 400", async () => {
    setAuthToken(adminAToken);
    const res = await DELETE_USER(
      buildGetRequest("/api/users/abc"),
      makeParams("abc"),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid user ID");
  });
});

// =====================================================================
// 6. Multi-Tenancy Isolation
// =====================================================================

describe("Multi-Tenancy Isolation", () => {
  it("company A admin cannot list company B users", async () => {
    setAuthToken(adminAToken);
    const res = await GET_USERS(buildGetRequest("/api/users"));
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    const ids = body.map((u: any) => u.id);
    expect(ids).not.toContain(adminB.id);
  });

  it("company A admin cannot fetch company B user by ID", async () => {
    setAuthToken(adminAToken);
    const res = await GET_USER_BY_ID(
      buildGetRequest(`/api/users/${adminB.id}`),
      makeParams(adminB.id),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(404);
    expect(body.error).toBe("User not found");

    // Verify admin B still exists unchanged
    const dbUser = await prisma.user.findUnique({ where: { id: adminB.id } });
    expect(dbUser).not.toBeNull();
    expect(dbUser!.name).toBe("Admin B");
  });

  it("company A admin cannot update company B user", async () => {
    const dbBefore = await prisma.user.findUnique({ where: { id: adminB.id } });

    setAuthToken(adminAToken);
    const res = await PATCH_USER(
      buildJsonRequest(`/api/users/${adminB.id}`, "PATCH", { name: "Cross-tenant" }),
      makeParams(adminB.id),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(404);
    expect(body.error).toBe("User not found");

    // Verify admin B unchanged
    const dbAfter = await prisma.user.findUnique({ where: { id: adminB.id } });
    expect(dbAfter!.name).toBe(dbBefore!.name);
    expect(dbAfter!.updatedAt.getTime()).toBe(dbBefore!.updatedAt.getTime());
  });

  it("company A admin cannot delete company B user", async () => {
    setAuthToken(adminAToken);
    const res = await DELETE_USER(
      buildGetRequest(`/api/users/${adminB.id}`),
      makeParams(adminB.id),
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(404);
    expect(body.error).toBe("User not found");

    // Verify admin B still exists
    const dbUser = await prisma.user.findUnique({ where: { id: adminB.id } });
    expect(dbUser).not.toBeNull();
    expect(dbUser!.email).toBe("admin-b@test.com");
  });
});

// =====================================================================
// 7. Response Security
// =====================================================================

describe("Response Security", () => {
  it("GET list never contains passwordHash or companyId", async () => {
    setAuthToken(adminAToken);
    const res = await GET_USERS(buildGetRequest("/api/users"));
    const body = await jsonBody(res);

    for (const user of body) {
      expect(user).not.toHaveProperty("passwordHash");
      expect(user).not.toHaveProperty("companyId");
    }
  });

  it("GET single never contains passwordHash or companyId", async () => {
    setAuthToken(adminAToken);
    const res = await GET_USER_BY_ID(
      buildGetRequest(`/api/users/${basicNoPermsA.id}`),
      makeParams(basicNoPermsA.id),
    );
    const body = await jsonBody(res);

    expect(body).not.toHaveProperty("passwordHash");
    expect(body).not.toHaveProperty("companyId");
  });

  it("POST create never contains passwordHash or companyId", async () => {
    setAuthToken(adminAToken);
    const res = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload()),
    );
    const body = await jsonBody(res);

    expect(body).not.toHaveProperty("passwordHash");
    expect(body).not.toHaveProperty("companyId");
  });

  it("PATCH update never contains passwordHash or companyId", async () => {
    setAuthToken(adminAToken);
    const createRes = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload()),
    );
    const created = await jsonBody(createRes);

    const res = await PATCH_USER(
      buildJsonRequest(`/api/users/${created.id}`, "PATCH", { name: "Sec Check" }),
      makeParams(created.id),
    );
    const body = await jsonBody(res);

    expect(body).not.toHaveProperty("passwordHash");
    expect(body).not.toHaveProperty("companyId");
  });

  // NOTE: This duplicate email is caught by the explicit findUnique check, not the P2002
  // catch block. Both paths use the same generic message, so coverage is equivalent.
  it("error messages are generic (no Prisma details leaked)", async () => {
    setAuthToken(adminAToken);
    // Duplicate email triggers P2002 → should be generic
    const res = await POST_USER(
      buildJsonRequest("/api/users", "POST", validCreatePayload({ email: adminA.email })),
    );
    const body = await jsonBody(res);

    expect(body.error).not.toMatch(/prisma/i);
    expect(body.error).not.toMatch(/P2002/i);
    expect(body.error).toBe("Unable to create user with the provided details");
  });
});

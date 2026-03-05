/**
 * Integration tests for profile-related routes and server actions.
 *
 * Covers:
 *  - GET /api/auth/me
 *  - Server actions: getApiKeys, createApiKey, deleteApiKey
 *  - Server action:  updateCompanyName
 *  - Server actions: getGreenApiCredentials, disconnectGreenApi
 *
 * REAL: Prisma (test DB), auth token signing/verification, permission logic,
 *       route handler, bcrypt password hashing, api-key-utils.
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
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => {
      if (name === "auth_token") {
        const { getAuthToken } = require("@/tests/integration/helpers/integration-setup");
        const token = getAuthToken();
        return token ? { name: "auth_token", value: token } : undefined;
      }
      return undefined;
    },
  })),
}));

// 3. Redis → cache miss + rate limit pass
vi.mock("@/lib/redis", () => {
  const noop = vi.fn().mockResolvedValue(null);
  return {
    redis: {
      get: noop,
      set: noop,
      del: noop,
      multi: vi.fn(() => ({
        incr: vi.fn().mockReturnThis(),
        expire: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([[null, 1]]),
      })),
    },
    redisPublisher: {
      get: noop,
      set: noop,
      del: noop,
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
  SEC_LOGIN_SUCCESS: "SEC_LOGIN_SUCCESS",
  SEC_LOGIN_FAILED: "SEC_LOGIN_FAILED",
  SEC_LOGOUT: "SEC_LOGOUT",
  SEC_REGISTER: "SEC_REGISTER",
  SEC_PASSWORD_CHANGED: "SEC_PASSWORD_CHANGED",
  SEC_ROLE_CHANGED: "SEC_ROLE_CHANGED",
  SEC_PERMISSIONS_CHANGED: "SEC_PERMISSIONS_CHANGED",
  SEC_API_KEY_CREATED: "SEC_API_KEY_CREATED",
  SEC_API_KEY_DELETED: "SEC_API_KEY_DELETED",
  SEC_AUTH_FAILED: "SEC_AUTH_FAILED",
  SEC_TABLE_DELETED: "SEC_TABLE_DELETED",
  SEC_VIEW_DELETED: "SEC_VIEW_DELETED",
  SEC_ANALYTICS_VIEW_DELETED: "SEC_ANALYTICS_VIEW_DELETED",
  SEC_WORKFLOW_DELETED: "SEC_WORKFLOW_DELETED",
  SEC_BULK_DELETE: "SEC_BULK_DELETE",
}));

// ── Imports (AFTER mocks) ──────────────────────────────────────────
import { prisma } from "@/lib/prisma";
import { resetDb } from "@/test-utils/resetDb";
import {
  setAuthToken,
  signTokenForUser,
  seedCompany,
  seedUser,
} from "@/tests/integration/helpers/integration-setup";

import { GET } from "@/app/api/auth/me/route";
import { getApiKeys, createApiKey, deleteApiKey } from "@/app/actions/api-keys";
import { updateCompanyName } from "@/app/actions/update-company-name";
import { getGreenApiCredentials, disconnectGreenApi } from "@/app/actions/green-api";

import bcrypt from "bcryptjs";
import { logSecurityEvent } from "@/lib/security/audit-security";
import { redis } from "@/lib/redis";
import { hashApiKey } from "@/lib/api-key-utils";
import { isTokenIssuedAtValid } from "@/lib/session";

// ── Constants ──────────────────────────────────────────────────────

/** Exact set of top-level keys the /me endpoint should return. */
const EXPECTED_ME_FIELDS = [
  "id",
  "companyId",
  "name",
  "email",
  "role",
  "isPremium",
  "allowedWriteTableIds",
  "permissions",
  "tablePermissions",
  "company",
].sort();

/** Exact set of fields returned in createApiKey response data. */
const EXPECTED_CREATE_KEY_FIELDS = [
  "createdAt",
  "fullKey",
  "id",
  "isActive",
  "key",
  "name",
].sort();

/** Exact set of fields per item in getApiKeys response data. */
const EXPECTED_GET_KEY_FIELDS = [
  "createdAt",
  "creator",
  "id",
  "isActive",
  "key",
  "name",
].sort();

/** Exact set of fields in the company sub-object of /me response. */
const EXPECTED_COMPANY_FIELDS = ["name", "slug"].sort();

/** Exact set of fields in the creator sub-object of getApiKeys response items. */
const EXPECTED_CREATOR_FIELDS = ["name"];

/** Exact set of fields in getGreenApiCredentials response. */
const EXPECTED_GREEN_API_CREDS_FIELDS = ["greenApiInstanceId", "greenApiToken", "isAdmin"].sort();

/** Exact set of fields in updateCompanyName success response. */
const EXPECTED_UPDATE_COMPANY_SUCCESS_FIELDS = ["message", "success"].sort();

/** Exact set of fields in disconnectGreenApi success response. */
const EXPECTED_DISCONNECT_SUCCESS_FIELDS = ["success"];

/** Exact set of fields in deleteApiKey success response. */
const EXPECTED_DELETE_KEY_SUCCESS_FIELDS = ["success"];

// ── Seeded data ────────────────────────────────────────────────────
const TEST_PASSWORD = "admin-password-123";

let companyA: { id: number; name: string };
let companyB: { id: number; name: string };

let adminA: { id: number; email: string; companyId: number };
let basicA: { id: number; email: string; companyId: number };
let adminB: { id: number; email: string; companyId: number };
let managerA: { id: number; email: string; companyId: number };

let adminAToken: string;
let basicAToken: string;
let adminBToken: string;
let managerAToken: string;

// ── Lifecycle ──────────────────────────────────────────────────────

beforeAll(async () => {
  await resetDb();

  companyA = await seedCompany({ name: "Profile Co A" });
  companyB = await seedCompany({ name: "Profile Co B" });

  adminA = await seedUser(companyA.id, {
    role: "admin",
    name: "Admin A",
    email: "profile-admin-a@test.com",
    passwordHash: await bcrypt.hash(TEST_PASSWORD, 4),
    permissions: { canViewUsers: true, canViewTables: true },
    tablePermissions: { "1": "read" },
    allowedWriteTableIds: [1, 2],
  });
  basicA = await seedUser(companyA.id, {
    role: "basic",
    name: "Basic A",
    email: "profile-basic-a@test.com",
    permissions: { canViewUsers: true },
  });
  adminB = await seedUser(companyB.id, {
    role: "admin",
    name: "Admin B",
    email: "profile-admin-b@test.com",
    passwordHash: await bcrypt.hash("admin-b-pass", 4),
  });
  managerA = await seedUser(companyA.id, {
    role: "manager",
    name: "Manager A",
    email: "profile-manager-a@test.com",
    permissions: { canViewUsers: true },
  });

  adminAToken = signTokenForUser(adminA.id);
  basicAToken = signTokenForUser(basicA.id);
  adminBToken = signTokenForUser(adminB.id);
  managerAToken = signTokenForUser(managerA.id);
}, 30_000);

afterEach(async () => {
  setAuthToken(null);
  vi.clearAllMocks();

  // Cleanup test-created API keys and audit logs
  await prisma.apiKey.deleteMany({
    where: { companyId: { in: [companyA.id, companyB.id] } },
  });
  await prisma.auditLog.deleteMany({
    where: { companyId: { in: [companyA.id, companyB.id] } },
  });

  // Reset company names back to originals
  await prisma.company.update({
    where: { id: companyA.id },
    data: { name: "Profile Co A", greenApiInstanceId: null, greenApiToken: null },
  });
  await prisma.company.update({
    where: { id: companyB.id },
    data: { name: "Profile Co B", greenApiInstanceId: null, greenApiToken: null },
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

// ════════════════════════════════════════════════════════════════════
// 1. GET /api/auth/me
// ════════════════════════════════════════════════════════════════════

describe("GET /api/auth/me", () => {
  it("returns 200 with full profile for authenticated admin", async () => {
    setAuthToken(adminAToken);
    const res = await GET();
    expect(res.status).toBe(200);

    const body = await jsonBody(res);
    expect(body.id).toBe(adminA.id);
    expect(body.name).toBe("Admin A");
    expect(body.email).toBe("profile-admin-a@test.com");
    expect(body.role).toBe("admin");
    expect(body.companyId).toBe(companyA.id);
    expect(body.isPremium).toBe("basic");
    expect(body.permissions).toEqual({ canViewUsers: true, canViewTables: true });
    expect(body.tablePermissions).toEqual({ "1": "read" });
    expect(body.allowedWriteTableIds).toEqual([1, 2]);
  });

  it("returns 200 with full profile for authenticated basic user", async () => {
    setAuthToken(basicAToken);
    const res = await GET();
    expect(res.status).toBe(200);

    const body = await jsonBody(res);
    expect(body.id).toBe(basicA.id);
    expect(body.name).toBe("Basic A");
    expect(body.email).toBe("profile-basic-a@test.com");
    expect(body.role).toBe("basic");
    expect(body.companyId).toBe(companyA.id);
    expect(body.isPremium).toBe("basic");
    expect(body.permissions).toEqual({ canViewUsers: true });
    expect(body.tablePermissions).toEqual({});
    expect(body.allowedWriteTableIds).toEqual([]);
    expect(body.company).toBeDefined();
    expect(body.company.name).toBe("Profile Co A");
  });

  it("response contains exactly the expected fields (no extras)", async () => {
    setAuthToken(adminAToken);
    const res = await GET();
    const body = await jsonBody(res);

    expect(Object.keys(body).sort()).toEqual(EXPECTED_ME_FIELDS);
    // Verify company sub-object has exactly name and slug (no id, createdAt, updatedAt leaking)
    expect(Object.keys(body.company).sort()).toEqual(EXPECTED_COMPANY_FIELDS);
  });

  it("returns 401 when no auth token is set", async () => {
    setAuthToken(null);
    const res = await GET();
    expect(res.status).toBe(401);

    const body = await jsonBody(res);
    expect(body.error).toBe("Not authenticated");
  });

  it("returns 401 for invalid/garbage token", async () => {
    setAuthToken("garbage-invalid-token-xyz");
    const res = await GET();
    expect(res.status).toBe(401);

    const body = await jsonBody(res);
    expect(body.error).toBe("Not authenticated");
  });

  it("returns 401 for token of deleted user", async () => {
    const tempUser = await seedUser(companyA.id, {
      name: "Temp User",
      email: "temp-deleted@test.com",
    });
    const tempToken = signTokenForUser(tempUser.id);
    await prisma.user.delete({ where: { id: tempUser.id } });

    setAuthToken(tempToken);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 401 for revoked token (isTokenIssuedAtValid=false)", async () => {
    vi.mocked(isTokenIssuedAtValid).mockResolvedValueOnce(false);

    setAuthToken(adminAToken);
    const res = await GET();
    expect(res.status).toBe(401);

    const body = await jsonBody(res);
    expect(body.error).toBe("Not authenticated");
  });

  it("does not expose passwordHash in response", async () => {
    setAuthToken(adminAToken);
    const res = await GET();
    const body = await jsonBody(res);

    expect(body).not.toHaveProperty("passwordHash");
  });

  it("includes nested company object with name and slug", async () => {
    setAuthToken(adminAToken);
    const res = await GET();
    const body = await jsonBody(res);

    expect(body.company).toBeDefined();
    expect(body.company.name).toBe("Profile Co A");
    expect(typeof body.company.slug).toBe("string");
  });

  it("returns correct permissions and tablePermissions", async () => {
    setAuthToken(adminAToken);
    const res = await GET();
    const body = await jsonBody(res);

    expect(body.permissions).toEqual({ canViewUsers: true, canViewTables: true });
    expect(body.tablePermissions).toEqual({ "1": "read" });
    expect(body.allowedWriteTableIds).toEqual([1, 2]);
  });

  it("DB state matches the response", async () => {
    setAuthToken(adminAToken);
    const res = await GET();
    const body = await jsonBody(res);

    const dbUser = await prisma.user.findUnique({
      where: { id: adminA.id },
      include: { company: { select: { name: true, slug: true } } },
    });

    expect(body.id).toBe(dbUser!.id);
    expect(body.name).toBe(dbUser!.name);
    expect(body.email).toBe(dbUser!.email);
    expect(body.role).toBe(dbUser!.role);
    expect(body.companyId).toBe(dbUser!.companyId);
    expect(body.company.name).toBe(dbUser!.company.name);
    expect(body.company.slug).toBe(dbUser!.company.slug);
  });

  it("returns 429 when rate limited", async () => {
    vi.mocked(redis.multi).mockReturnValueOnce({
      incr: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([[null, 121]]),
    } as any);

    setAuthToken(adminAToken);
    const res = await GET();
    expect(res.status).toBe(429);

    const body = await jsonBody(res);
    expect(body.error).toBe("Rate limit exceeded. Please try again later.");
    expect(res.headers.get("Retry-After")).toBe("60");
  });

  it("returns 200 for manager role with correct profile", async () => {
    setAuthToken(managerAToken);
    const res = await GET();
    expect(res.status).toBe(200);

    const body = await jsonBody(res);
    expect(body.id).toBe(managerA.id);
    expect(body.name).toBe("Manager A");
    expect(body.email).toBe("profile-manager-a@test.com");
    expect(body.role).toBe("manager");
    expect(body.companyId).toBe(companyA.id);
    expect(body.isPremium).toBe("basic");
    expect(Object.keys(body).sort()).toEqual(EXPECTED_ME_FIELDS);
  });
});

// ════════════════════════════════════════════════════════════════════
// 2. API Key CRUD — getApiKeys / createApiKey / deleteApiKey
// ════════════════════════════════════════════════════════════════════

describe("API Key CRUD", () => {
  // ── getApiKeys ─────────────────────────────────────────────────

  describe("getApiKeys", () => {
    it("admin with no keys returns empty array", async () => {
      setAuthToken(adminAToken);
      const result = await getApiKeys();
      expect(result).toEqual({ success: true, data: [] });
    });

    it("admin returns all company keys with correct shape and ordering", async () => {
      const olderDate = new Date("2025-01-01T00:00:00Z");
      const newerDate = new Date("2025-06-01T00:00:00Z");

      await prisma.apiKey.createMany({
        data: [
          {
            companyId: companyA.id,
            key: "sk_live_...abc1",
            keyHash: hashApiKey("sk_live_older_key_value_abc1"),
            name: "Older Key",
            createdBy: adminA.id,
            createdAt: olderDate,
          },
          {
            companyId: companyA.id,
            key: "sk_live_...abc2",
            keyHash: hashApiKey("sk_live_newer_key_value_abc2"),
            name: "Newer Key",
            createdBy: adminA.id,
            createdAt: newerDate,
          },
        ],
      });

      setAuthToken(adminAToken);
      const result = await getApiKeys();
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);

      // Verify ordering: newest first (createdAt desc)
      expect(result.data![0].name).toBe("Newer Key");
      expect(result.data![1].name).toBe("Older Key");

      // Verify response item has exactly the expected fields (no extras like updatedAt, companyId)
      const firstKey = result.data![0];
      expect(Object.keys(firstKey).sort()).toEqual(EXPECTED_GET_KEY_FIELDS);
      expect(firstKey).toHaveProperty("id");
      expect(firstKey).toHaveProperty("name");
      expect(firstKey).toHaveProperty("key");
      expect(firstKey).toHaveProperty("isActive");
      expect(firstKey).toHaveProperty("createdAt");
      expect(firstKey).toHaveProperty("creator");

      // Verify creator relation includes ONLY name (no email, id, passwordHash leaking)
      expect(Object.keys(firstKey.creator).sort()).toEqual(EXPECTED_CREATOR_FIELDS);
      expect(firstKey.creator.name).toBe("Admin A");

      const dbCount = await prisma.apiKey.count({ where: { companyId: companyA.id } });
      expect(result.data!.length).toBe(dbCount);
    });

    it("non-admin returns Unauthorized even when keys exist", async () => {
      // Seed a key so we prove auth-blocked, not just empty
      await prisma.apiKey.create({
        data: {
          companyId: companyA.id,
          key: "sk_live_...seeded",
          keyHash: hashApiKey("sk_live_seeded_for_nonadmin_test"),
          name: "Seeded Key",
          createdBy: adminA.id,
        },
      });

      setAuthToken(basicAToken);
      const result = await getApiKeys();
      expect(result).toEqual({ success: false, error: "Unauthorized" });
      expect(logSecurityEvent).not.toHaveBeenCalled();
    });

    it("unauthenticated returns Unauthorized", async () => {
      setAuthToken(null);
      const result = await getApiKeys();
      expect(result).toEqual({ success: false, error: "Unauthorized" });
    });

    it("manager role returns Unauthorized", async () => {
      setAuthToken(managerAToken);
      const result = await getApiKeys();
      expect(result).toEqual({ success: false, error: "Unauthorized" });
    });

    it("Prisma error returns failure message", async () => {
      setAuthToken(adminAToken);
      const spy = vi.spyOn(prisma.apiKey, "findMany").mockRejectedValueOnce(new Error("DB down"));

      const result = await getApiKeys();
      expect(result).toEqual({ success: false, error: "Failed to fetch API keys" });

      spy.mockRestore();
    });

    it("cross-tenant: adminA cannot see companyB keys", async () => {
      await prisma.apiKey.create({
        data: {
          companyId: companyB.id,
          key: "sk_live_...xyz",
          keyHash: hashApiKey("sk_live_company_b_key_xyz"),
          name: "B Key",
          createdBy: adminB.id,
        },
      });

      setAuthToken(adminAToken);
      const result = await getApiKeys();
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
    });
  });

  // ── createApiKey ───────────────────────────────────────────────

  describe("createApiKey", () => {
    it("admin creates key successfully with full response shape", async () => {
      setAuthToken(adminAToken);
      const result = await createApiKey("My Test Key");

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      // Verify exact field set (no keyHash, companyId, createdBy leaking)
      expect(Object.keys(result.data!).sort()).toEqual(EXPECTED_CREATE_KEY_FIELDS);
      expect(result.data!.id).toBeDefined();
      expect(result.data!.name).toBe("My Test Key");
      expect(result.data!.fullKey).toMatch(/^sk_live_/);
      expect(result.data!.isActive).toBe(true);
      expect(result.data!.createdAt).toBeDefined();
      expect(result.data!.key).toBeDefined();
      expect(result.data!.key).toContain("...");
    });

    it("key is stored in DB with correct hash, masked key, createdBy, and isActive", async () => {
      setAuthToken(adminAToken);
      const result = await createApiKey("Full DB Check Key");

      const dbKey = await prisma.apiKey.findFirst({
        where: { companyId: companyA.id, name: "Full DB Check Key" },
      });

      expect(dbKey).not.toBeNull();
      // keyHash is a valid SHA-256 hex digest (64 chars)
      expect(dbKey!.keyHash).toMatch(/^[a-f0-9]{64}$/);
      // Masked key should not equal full key
      expect(dbKey!.key).not.toBe(result.data!.fullKey);
      expect(dbKey!.key).toMatch(/^sk_live_/);
      expect(dbKey!.key).toContain("...");
      // createdBy links to the authenticated admin
      expect(dbKey!.createdBy).toBe(adminA.id);
      // isActive defaults to true
      expect(dbKey!.isActive).toBe(true);
    });

    it("logSecurityEvent called with SEC_API_KEY_CREATED including details", async () => {
      setAuthToken(adminAToken);
      const result = await createApiKey("Audit Key");

      expect(logSecurityEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "SEC_API_KEY_CREATED",
          companyId: companyA.id,
          userId: adminA.id,
          details: expect.objectContaining({
            keyName: "Audit Key",
            keyId: result.data!.id,
          }),
        }),
      );
    });

    it("non-admin returns Unauthorized and no key created in DB", async () => {
      setAuthToken(basicAToken);
      const result = await createApiKey("Should Fail");
      expect(result).toEqual({ success: false, error: "Unauthorized" });

      // Verify no key was created despite the call
      const dbCount = await prisma.apiKey.count({ where: { companyId: companyA.id } });
      expect(dbCount).toBe(0);

      // logSecurityEvent should NOT be called on rejection
      expect(logSecurityEvent).not.toHaveBeenCalled();
    });

    it("unauthenticated returns Unauthorized and no key created in DB", async () => {
      setAuthToken(null);
      const result = await createApiKey("Should Fail");
      expect(result).toEqual({ success: false, error: "Unauthorized" });

      // Verify no key was created despite the call
      const dbCount = await prisma.apiKey.count({ where: { companyId: companyA.id } });
      expect(dbCount).toBe(0);
    });

    it("empty name succeeds (no server-side name validation)", async () => {
      setAuthToken(adminAToken);
      const result = await createApiKey("");

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.name).toBe("");

      // Verify DB has the key with empty name
      const dbKey = await prisma.apiKey.findFirst({
        where: { companyId: companyA.id, name: "" },
      });
      expect(dbKey).not.toBeNull();
    });

    it("full lifecycle: create → get → delete → get empty", async () => {
      setAuthToken(adminAToken);

      // Create
      const createResult = await createApiKey("Lifecycle Key");
      expect(createResult.success).toBe(true);
      const keyId = createResult.data!.id;

      // Get — should contain the key
      const getResult1 = await getApiKeys();
      expect(getResult1.data!.some((k: any) => k.id === keyId)).toBe(true);

      // Delete
      const deleteResult = await deleteApiKey(keyId);
      expect(deleteResult.success).toBe(true);

      // Get — should be empty
      const getResult2 = await getApiKeys();
      expect(getResult2.data!.some((k: any) => k.id === keyId)).toBe(false);
    });

    it("fullKey hash matches DB keyHash (security invariant)", async () => {
      setAuthToken(adminAToken);
      const result = await createApiKey("Hash Check");
      expect(result.success).toBe(true);

      const dbKey = await prisma.apiKey.findFirst({
        where: { companyId: companyA.id, name: "Hash Check" },
      });
      expect(dbKey).not.toBeNull();

      // THE core security property: hashApiKey(fullKey) === stored keyHash
      const computedHash = hashApiKey(result.data!.fullKey);
      expect(computedHash).toBe(dbKey!.keyHash);
    });

    it("response masked key matches DB stored key", async () => {
      setAuthToken(adminAToken);
      const result = await createApiKey("Mask Check");
      expect(result.success).toBe(true);

      const dbKey = await prisma.apiKey.findFirst({
        where: { companyId: companyA.id, name: "Mask Check" },
      });
      expect(dbKey).not.toBeNull();

      // Response key should be identical to DB stored masked key
      expect(result.data!.key).toBe(dbKey!.key);
    });

    it("manager role returns Unauthorized and no key created", async () => {
      setAuthToken(managerAToken);
      const result = await createApiKey("Manager Key");
      expect(result).toEqual({ success: false, error: "Unauthorized" });

      const dbCount = await prisma.apiKey.count({ where: { companyId: companyA.id } });
      expect(dbCount).toBe(0);
    });

    it("Prisma error returns failure message", async () => {
      setAuthToken(adminAToken);
      const spy = vi.spyOn(prisma.apiKey, "create").mockRejectedValueOnce(new Error("DB down"));

      const result = await createApiKey("Should Fail DB");
      expect(result).toEqual({ success: false, error: "Failed to create API key" });

      spy.mockRestore();

      const dbCount = await prisma.apiKey.count({ where: { companyId: companyA.id } });
      expect(dbCount).toBe(0);
    });
  });

  // ── deleteApiKey ───────────────────────────────────────────────

  describe("deleteApiKey", () => {
    it("admin deletes own key successfully", async () => {
      setAuthToken(adminAToken);
      const created = await createApiKey("To Delete");
      const keyId = created.data!.id;

      const result = await deleteApiKey(keyId);
      expect(result.success).toBe(true);

      const dbKey = await prisma.apiKey.findUnique({ where: { id: keyId } });
      expect(dbKey).toBeNull();
    });

    it("non-existent key returns error", async () => {
      setAuthToken(adminAToken);
      const result = await deleteApiKey(999999);
      expect(result).toEqual({ success: false, error: "Key not found" });
    });

    it("cross-tenant: adminA cannot delete companyB key", async () => {
      const bKey = await prisma.apiKey.create({
        data: {
          companyId: companyB.id,
          key: "sk_live_...bkey",
          keyHash: hashApiKey("sk_live_company_b_delete_key"),
          name: "B Delete Key",
          createdBy: adminB.id,
        },
      });

      setAuthToken(adminAToken);
      const result = await deleteApiKey(bKey.id);
      expect(result).toEqual({ success: false, error: "Key not found" });

      // Verify key still exists
      const dbKey = await prisma.apiKey.findUnique({ where: { id: bKey.id } });
      expect(dbKey).not.toBeNull();
    });

    it("logSecurityEvent called with SEC_API_KEY_DELETED including details", async () => {
      setAuthToken(adminAToken);
      const created = await createApiKey("Audit Delete Key");
      const keyId = created.data!.id;
      vi.clearAllMocks();

      await deleteApiKey(keyId);

      expect(logSecurityEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "SEC_API_KEY_DELETED",
          companyId: companyA.id,
          userId: adminA.id,
          details: expect.objectContaining({
            keyId,
            keyName: "Audit Delete Key",
          }),
        }),
      );
    });

    it("non-admin returns Unauthorized", async () => {
      // Seed a real key so we're testing auth, not "key not found"
      const seededKey = await prisma.apiKey.create({
        data: {
          companyId: companyA.id,
          key: "sk_live_...nonadm",
          keyHash: hashApiKey("sk_live_nonadmin_test_key"),
          name: "Non-Admin Target",
          createdBy: adminA.id,
        },
      });

      setAuthToken(basicAToken);
      const result = await deleteApiKey(seededKey.id);
      expect(result).toEqual({ success: false, error: "Unauthorized" });

      // Key should still exist
      const dbKey = await prisma.apiKey.findUnique({ where: { id: seededKey.id } });
      expect(dbKey).not.toBeNull();
      expect(logSecurityEvent).not.toHaveBeenCalled();
    });

    it("unauthenticated returns Unauthorized", async () => {
      setAuthToken(null);
      const result = await deleteApiKey(999999);
      expect(result).toEqual({ success: false, error: "Unauthorized" });
      expect(logSecurityEvent).not.toHaveBeenCalled();
    });

    it("only removes targeted key, other keys survive", async () => {
      setAuthToken(adminAToken);
      const created1 = await createApiKey("Key One");
      const created2 = await createApiKey("Key Two");
      const keyId1 = created1.data!.id;
      const keyId2 = created2.data!.id;

      const result = await deleteApiKey(keyId1);
      expect(result.success).toBe(true);

      // First key deleted
      const dbKey1 = await prisma.apiKey.findUnique({ where: { id: keyId1 } });
      expect(dbKey1).toBeNull();

      // Second key still exists
      const dbKey2 = await prisma.apiKey.findUnique({ where: { id: keyId2 } });
      expect(dbKey2).not.toBeNull();

      const dbCount = await prisma.apiKey.count({ where: { companyId: companyA.id } });
      expect(dbCount).toBe(1);
    });

    it("manager role returns Unauthorized and key survives", async () => {
      const seededKey = await prisma.apiKey.create({
        data: {
          companyId: companyA.id,
          key: "sk_live_...mgr",
          keyHash: hashApiKey("sk_live_manager_delete_test_key"),
          name: "Manager Target",
          createdBy: adminA.id,
        },
      });

      setAuthToken(managerAToken);
      const result = await deleteApiKey(seededKey.id);
      expect(result).toEqual({ success: false, error: "Unauthorized" });

      const dbKey = await prisma.apiKey.findUnique({ where: { id: seededKey.id } });
      expect(dbKey).not.toBeNull();
    });

    it("logSecurityEvent not called when key not found", async () => {
      setAuthToken(adminAToken);
      await deleteApiKey(999999);
      expect(logSecurityEvent).not.toHaveBeenCalled();
    });

    it("success response has exactly { success } fields", async () => {
      setAuthToken(adminAToken);
      const created = await createApiKey("Fields Check");
      vi.clearAllMocks();

      const result = await deleteApiKey(created.data!.id);
      expect(result.success).toBe(true);
      expect(Object.keys(result).sort()).toEqual(EXPECTED_DELETE_KEY_SUCCESS_FIELDS);
    });

    it("Prisma delete error returns failure message", async () => {
      const seededKey = await prisma.apiKey.create({
        data: {
          companyId: companyA.id,
          key: "sk_live_...dberr",
          keyHash: hashApiKey("sk_live_prisma_delete_error_key"),
          name: "DB Error Key",
          createdBy: adminA.id,
        },
      });

      setAuthToken(adminAToken);
      const spy = vi.spyOn(prisma.apiKey, "delete").mockRejectedValueOnce(new Error("DB down"));

      const result = await deleteApiKey(seededKey.id);
      expect(result).toEqual({ success: false, error: "Failed to delete API key" });

      spy.mockRestore();

      const dbKey = await prisma.apiKey.findUnique({ where: { id: seededKey.id } });
      expect(dbKey).not.toBeNull();
    });
  });
});

// ════════════════════════════════════════════════════════════════════
// 3. updateCompanyName
// ════════════════════════════════════════════════════════════════════

describe("updateCompanyName", () => {
  it("admin with correct password updates successfully", async () => {
    // Capture updatedAt before the update
    const before = await prisma.company.findUnique({ where: { id: companyA.id } });
    const updatedAtBefore = before!.updatedAt;

    setAuthToken(adminAToken);
    const result = await updateCompanyName({
      newCompanyName: "Updated Co A",
      password: TEST_PASSWORD,
    });

    expect(result.success).toBe(true);
    expect(result.message).toBe("שם הארגון עודכן בהצלחה");

    const company = await prisma.company.findUnique({ where: { id: companyA.id } });
    expect(company!.name).toBe("Updated Co A");
    // @updatedAt should have changed after the update
    expect(company!.updatedAt.getTime()).toBeGreaterThanOrEqual(updatedAtBefore.getTime());
  });

  it("non-admin returns specific admin-only error", async () => {
    setAuthToken(basicAToken);
    const result = await updateCompanyName({
      newCompanyName: "Should Not Change",
      password: "any",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("רק מנהלים יכולים לשנות את שם הארגון");

    // Cache should NOT be invalidated before the role check
    expect(redis.del).not.toHaveBeenCalled();

    // Verify company name unchanged
    const company = await prisma.company.findUnique({ where: { id: companyA.id } });
    expect(company!.name).toBe("Profile Co A");
  });

  it("wrong password returns error and DB is unchanged", async () => {
    setAuthToken(adminAToken);
    const result = await updateCompanyName({
      newCompanyName: "Wrong Pass Co",
      password: "wrong-password",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("סיסמה שגויה");

    const company = await prisma.company.findUnique({ where: { id: companyA.id } });
    expect(company!.name).toBe("Profile Co A");
  });

  it("empty company name returns error and DB is unchanged", async () => {
    setAuthToken(adminAToken);
    const result = await updateCompanyName({
      newCompanyName: "",
      password: TEST_PASSWORD,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("שם הארגון לא יכול להיות רק");

    const company = await prisma.company.findUnique({ where: { id: companyA.id } });
    expect(company!.name).toBe("Profile Co A");
  });

  it("user not found in DB returns specific error", async () => {
    // getCurrentUser() internally calls prisma.user.findUnique (via fetchUserWithCache).
    // updateCompanyName then calls prisma.user.findUnique again for the password lookup.
    // We need the 1st call to succeed (auth) and the 2nd to return null (user not found).
    const authUser = await prisma.user.findUnique({
      where: { id: adminA.id },
      select: {
        id: true, companyId: true, name: true, email: true,
        role: true, isPremium: true, allowedWriteTableIds: true,
        permissions: true, tablePermissions: true,
        company: { select: { name: true, slug: true } },
      },
    });

    setAuthToken(adminAToken);
    const spy = vi.spyOn(prisma.user, "findUnique")
      .mockResolvedValueOnce(authUser as any)   // 1st call: getCurrentUser auth succeeds
      .mockResolvedValueOnce(null);              // 2nd call: password lookup returns null

    const result = await updateCompanyName({
      newCompanyName: "Ghost User Co",
      password: TEST_PASSWORD,
    });

    expect(result).toEqual({ success: false, error: "משתמש לא נמצא" });

    spy.mockRestore();

    const company = await prisma.company.findUnique({ where: { id: companyA.id } });
    expect(company!.name).toBe("Profile Co A");
    expect(redis.del).not.toHaveBeenCalled();
  });

  it("empty password returns error and DB is unchanged", async () => {
    setAuthToken(adminAToken);
    const result = await updateCompanyName({
      newCompanyName: "Valid Name",
      password: "",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("נא להזין סיסמה");

    const company = await prisma.company.findUnique({ where: { id: companyA.id } });
    expect(company!.name).toBe("Profile Co A");
  });

  it("unauthenticated returns error and DB is unchanged", async () => {
    setAuthToken(null);
    const result = await updateCompanyName({
      newCompanyName: "Unauth Co",
      password: "any",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("לא מאומת");

    // Verify company name unchanged
    const company = await prisma.company.findUnique({ where: { id: companyA.id } });
    expect(company!.name).toBe("Profile Co A");
  });

  it("whitespace-only company name returns error and DB is unchanged", async () => {
    setAuthToken(adminAToken);
    const result = await updateCompanyName({
      newCompanyName: "   ",
      password: TEST_PASSWORD,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("שם הארגון לא יכול להיות רק");

    const company = await prisma.company.findUnique({ where: { id: companyA.id } });
    expect(company!.name).toBe("Profile Co A");
  });

  it("trims company name", async () => {
    setAuthToken(adminAToken);
    const result = await updateCompanyName({
      newCompanyName: "  Trimmed Name  ",
      password: TEST_PASSWORD,
    });

    expect(result.success).toBe(true);

    const company = await prisma.company.findUnique({ where: { id: companyA.id } });
    expect(company!.name).toBe("Trimmed Name");
  });

  it("cross-tenant isolation: adminA update does not affect companyB", async () => {
    setAuthToken(adminAToken);
    await updateCompanyName({
      newCompanyName: "New A Name",
      password: TEST_PASSWORD,
    });

    const companyBData = await prisma.company.findUnique({ where: { id: companyB.id } });
    expect(companyBData!.name).toBe("Profile Co B");
  });

  it("invalidateUserCache is called with correct cache key after successful update", async () => {
    setAuthToken(adminAToken);
    await updateCompanyName({
      newCompanyName: "Cache Test",
      password: TEST_PASSWORD,
    });

    // invalidateUserCache calls redis.del with user:session:<userId>
    expect(redis.del).toHaveBeenCalledWith(`user:session:${adminA.id}`);
  });

  it("redis.del is not called on failed update (wrong password)", async () => {
    setAuthToken(adminAToken);
    await updateCompanyName({
      newCompanyName: "Should Not Cache Invalidate",
      password: "wrong-password",
    });

    // Cache should NOT be invalidated when update fails
    expect(redis.del).not.toHaveBeenCalled();
  });

  it("success response has exactly { success, message } fields", async () => {
    setAuthToken(adminAToken);
    const result = await updateCompanyName({
      newCompanyName: "Fields Check Co",
      password: TEST_PASSWORD,
    });

    expect(result.success).toBe(true);
    expect(Object.keys(result).sort()).toEqual(EXPECTED_UPDATE_COMPANY_SUCCESS_FIELDS);
  });

  it("manager role returns admin-only error", async () => {
    setAuthToken(managerAToken);
    const result = await updateCompanyName({
      newCompanyName: "Manager Co",
      password: "any",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("רק מנהלים יכולים לשנות את שם הארגון");

    expect(redis.del).not.toHaveBeenCalled();

    const company = await prisma.company.findUnique({ where: { id: companyA.id } });
    expect(company!.name).toBe("Profile Co A");
  });

  it("redis.del is not called on unauthenticated attempt", async () => {
    setAuthToken(null);
    await updateCompanyName({
      newCompanyName: "Unauth Cache",
      password: "any",
    });

    expect(redis.del).not.toHaveBeenCalled();
  });

  it("Prisma error in update returns generic error", async () => {
    setAuthToken(adminAToken);
    const spy = vi.spyOn(prisma.company, "update").mockRejectedValueOnce(new Error("DB down"));

    const result = await updateCompanyName({
      newCompanyName: "DB Error Co",
      password: TEST_PASSWORD,
    });

    expect(result).toEqual({ success: false, error: "שגיאה בעדכון שם הארגון" });

    spy.mockRestore();

    const company = await prisma.company.findUnique({ where: { id: companyA.id } });
    expect(company!.name).toBe("Profile Co A");
    expect(redis.del).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════
// 4. Green API — getGreenApiCredentials / disconnectGreenApi
// ════════════════════════════════════════════════════════════════════

describe("Green API actions", () => {
  // ── getGreenApiCredentials ─────────────────────────────────────

  describe("getGreenApiCredentials", () => {
    it("admin with no credentials returns nulls", async () => {
      setAuthToken(adminAToken);
      const result = await getGreenApiCredentials();

      expect(result.greenApiInstanceId).toBeNull();
      expect(result.greenApiToken).toBeNull();
      expect(result.isAdmin).toBe(true);
      // Verify exact field set (no companyId, userId, etc. leaking)
      expect(Object.keys(result).sort()).toEqual(EXPECTED_GREEN_API_CREDS_FIELDS);
    });

    it("admin with credentials returns masked token with exact format", async () => {
      const rawToken = "abcdef1234567890tokenvalue";
      await prisma.company.update({
        where: { id: companyA.id },
        data: {
          greenApiInstanceId: "1234567890",
          greenApiToken: rawToken,
        },
      });

      setAuthToken(adminAToken);
      const result = await getGreenApiCredentials();

      expect(result.greenApiInstanceId).toBe("1234567890");
      expect(result.greenApiToken).not.toBe(rawToken);
      // Exact masking format: "****" + last 4 chars of token
      const expectedMasked = "****" + rawToken.slice(-4);
      expect(result.greenApiToken).toBe(expectedMasked);
      expect(result.isAdmin).toBe(true);
      expect(Object.keys(result).sort()).toEqual(EXPECTED_GREEN_API_CREDS_FIELDS);
    });

    it("admin with instanceId but no token returns instanceId and null token", async () => {
      await prisma.company.update({
        where: { id: companyA.id },
        data: {
          greenApiInstanceId: "partial-inst-456",
          greenApiToken: null,
        },
      });

      setAuthToken(adminAToken);
      const result = await getGreenApiCredentials();

      expect(result.greenApiInstanceId).toBe("partial-inst-456");
      expect(result.greenApiToken).toBeNull();
      expect(result.isAdmin).toBe(true);
      expect(Object.keys(result).sort()).toEqual(EXPECTED_GREEN_API_CREDS_FIELDS);
    });

    it("non-admin with credentials returns masked instanceId, no token, isAdmin false", async () => {
      await prisma.company.update({
        where: { id: companyA.id },
        data: {
          greenApiInstanceId: "1234567890",
          greenApiToken: "sometoken",
        },
      });

      setAuthToken(basicAToken);
      const result = await getGreenApiCredentials();

      expect(result.greenApiInstanceId).toBe("********");
      expect(result.greenApiToken).toBeNull();
      expect(result.isAdmin).toBe(false);
      expect(Object.keys(result).sort()).toEqual(EXPECTED_GREEN_API_CREDS_FIELDS);
    });

    it("non-admin with no credentials returns nulls and isAdmin false", async () => {
      setAuthToken(basicAToken);
      const result = await getGreenApiCredentials();

      expect(result.greenApiInstanceId).toBeNull();
      expect(result.greenApiToken).toBeNull();
      expect(result.isAdmin).toBe(false);
      expect(Object.keys(result).sort()).toEqual(EXPECTED_GREEN_API_CREDS_FIELDS);
    });

    it("manager role returns non-admin shape with correct fields", async () => {
      await prisma.company.update({
        where: { id: companyA.id },
        data: {
          greenApiInstanceId: "mgr-inst-123",
          greenApiToken: "mgr-token-value",
        },
      });

      setAuthToken(managerAToken);
      const result = await getGreenApiCredentials();

      expect(result.isAdmin).toBe(false);
      expect(result.greenApiInstanceId).toBe("********");
      expect(result.greenApiToken).toBeNull();
      expect(Object.keys(result).sort()).toEqual(EXPECTED_GREEN_API_CREDS_FIELDS);
    });

    it("unauthenticated throws", async () => {
      setAuthToken(null);
      await expect(getGreenApiCredentials()).rejects.toThrow("Unauthorized");
    });

    it("cross-tenant: adminA cannot see companyB credentials", async () => {
      await prisma.company.update({
        where: { id: companyB.id },
        data: {
          greenApiInstanceId: "b-secret-inst",
          greenApiToken: "b-secret-tok",
        },
      });

      setAuthToken(adminAToken);
      const result = await getGreenApiCredentials();

      // adminA should see companyA's credentials (null), not companyB's
      expect(result.greenApiInstanceId).toBeNull();
      expect(result.greenApiToken).toBeNull();
      expect(result.isAdmin).toBe(true);
    });
  });

  // ── disconnectGreenApi ─────────────────────────────────────────

  describe("disconnectGreenApi", () => {
    it("admin disconnects and fields are null in DB", async () => {
      await prisma.company.update({
        where: { id: companyA.id },
        data: {
          greenApiInstanceId: "inst-123",
          greenApiToken: "tok-123",
        },
      });

      setAuthToken(adminAToken);
      const result = await disconnectGreenApi();
      expect(result.success).toBe(true);

      const company = await prisma.company.findUnique({ where: { id: companyA.id } });
      expect(company!.greenApiInstanceId).toBeNull();
      expect(company!.greenApiToken).toBeNull();
    });

    it("disconnect is idempotent (no credentials already)", async () => {
      // Company already has null credentials from afterEach cleanup
      setAuthToken(adminAToken);
      const result = await disconnectGreenApi();
      expect(result.success).toBe(true);

      const company = await prisma.company.findUnique({ where: { id: companyA.id } });
      expect(company!.greenApiInstanceId).toBeNull();
      expect(company!.greenApiToken).toBeNull();
    });

    it("non-admin throws and credentials survive", async () => {
      await prisma.company.update({
        where: { id: companyA.id },
        data: {
          greenApiInstanceId: "nonadm-inst",
          greenApiToken: "nonadm-tok",
        },
      });

      setAuthToken(basicAToken);
      await expect(disconnectGreenApi()).rejects.toThrow("Only admins can manage Green API connections");

      const company = await prisma.company.findUnique({ where: { id: companyA.id } });
      expect(company!.greenApiInstanceId).toBe("nonadm-inst");
      expect(company!.greenApiToken).toBe("nonadm-tok");
    });

    it("unauthenticated throws", async () => {
      setAuthToken(null);
      await expect(disconnectGreenApi()).rejects.toThrow("Unauthorized");
    });

    it("cross-tenant: adminA cannot disconnect companyB", async () => {
      await prisma.company.update({
        where: { id: companyA.id },
        data: {
          greenApiInstanceId: "a-inst",
          greenApiToken: "a-tok",
        },
      });
      await prisma.company.update({
        where: { id: companyB.id },
        data: {
          greenApiInstanceId: "b-inst",
          greenApiToken: "b-tok",
        },
      });

      setAuthToken(adminAToken);
      // adminA's disconnect only affects companyA
      await disconnectGreenApi();

      // Verify companyA was actually disconnected
      const companyAData = await prisma.company.findUnique({ where: { id: companyA.id } });
      expect(companyAData!.greenApiInstanceId).toBeNull();
      expect(companyAData!.greenApiToken).toBeNull();

      // Verify companyB is untouched
      const companyBData = await prisma.company.findUnique({ where: { id: companyB.id } });
      expect(companyBData!.greenApiInstanceId).toBe("b-inst");
      expect(companyBData!.greenApiToken).toBe("b-tok");
    });

    it("response has exactly { success } fields", async () => {
      setAuthToken(adminAToken);
      const result = await disconnectGreenApi();
      expect(result.success).toBe(true);
      expect(Object.keys(result).sort()).toEqual(EXPECTED_DISCONNECT_SUCCESS_FIELDS);
    });

    it("manager role throws admin-only error and credentials survive", async () => {
      await prisma.company.update({
        where: { id: companyA.id },
        data: {
          greenApiInstanceId: "mgr-disc-inst",
          greenApiToken: "mgr-disc-tok",
        },
      });

      setAuthToken(managerAToken);
      await expect(disconnectGreenApi()).rejects.toThrow("Only admins can manage Green API connections");

      const company = await prisma.company.findUnique({ where: { id: companyA.id } });
      expect(company!.greenApiInstanceId).toBe("mgr-disc-inst");
      expect(company!.greenApiToken).toBe("mgr-disc-tok");
    });
  });
});

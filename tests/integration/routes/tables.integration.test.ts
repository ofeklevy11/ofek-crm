/**
 * Integration tests for /api/tables and /api/tables/[id] routes.
 *
 * REAL: Prisma (test DB), auth token signing/verification, permission logic,
 *       route handlers, input validation.
 * MOCKED: next/headers cookies(), @/lib/redis, react cache().
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

// ── Imports (AFTER mocks) ──────────────────────────────────────────
import { prisma } from "@/lib/prisma";
import { resetDb } from "@/test-utils/resetDb";
import {
  setAuthToken,
  signTokenForUser,
  seedCompany,
  seedUser,
  seedTable,
  seedCategory,
  seedRecord,
  seedFile,
  buildGetRequest,
  buildJsonRequest,
  makeParams,
} from "@/tests/integration/helpers/integration-setup";

import { GET as GET_TABLES, POST as POST_TABLE } from "@/app/api/tables/route";
import {
  GET as GET_TABLE_BY_ID,
  PATCH as PATCH_TABLE,
  DELETE as DELETE_TABLE,
} from "@/app/api/tables/[id]/route";

// ── Seeded data ────────────────────────────────────────────────────
let companyA: { id: number };
let companyB: { id: number };
let adminUser: { id: number };
let managerUser: { id: number };
let basicUser: { id: number };
let basicUserWithManage: { id: number };
let otherCompanyAdmin: { id: number };

let adminToken: string;
let managerToken: string;
let basicToken: string;
let basicManageToken: string;
let otherAdminToken: string;

// ── Lifecycle ──────────────────────────────────────────────────────

beforeAll(async () => {
  await resetDb();

  // Companies
  companyA = await seedCompany({ name: "Company A" });
  companyB = await seedCompany({ name: "Company B" });

  // Users
  adminUser = await seedUser(companyA.id, { role: "admin", name: "Admin" });
  managerUser = await seedUser(companyA.id, { role: "manager", name: "Manager" });
  basicUser = await seedUser(companyA.id, {
    role: "basic",
    name: "Basic",
    permissions: {},
    tablePermissions: {},
  });
  basicUserWithManage = await seedUser(companyA.id, {
    role: "basic",
    name: "Basic+Manage",
    permissions: { canManageTables: true },
    tablePermissions: {},
  });
  otherCompanyAdmin = await seedUser(companyB.id, { role: "admin", name: "OtherAdmin" });

  // Tokens
  adminToken = signTokenForUser(adminUser.id);
  managerToken = signTokenForUser(managerUser.id);
  basicToken = signTokenForUser(basicUser.id);
  basicManageToken = signTokenForUser(basicUserWithManage.id);
  otherAdminToken = signTokenForUser(otherCompanyAdmin.id);
}, 30_000);

afterEach(async () => {
  setAuthToken(null);
  // Cleanup test-created data in reverse FK order
  await prisma.file.deleteMany({
    where: { companyId: { in: [companyA.id, companyB.id] } },
  });
  await prisma.record.deleteMany({
    where: { companyId: { in: [companyA.id, companyB.id] } },
  });
  await prisma.view.deleteMany({
    where: { companyId: { in: [companyA.id, companyB.id] } },
  });
  await prisma.tableMeta.deleteMany({
    where: { companyId: { in: [companyA.id, companyB.id] } },
  });
  await prisma.tableCategory.deleteMany({
    where: { companyId: { in: [companyA.id, companyB.id] } },
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

// =====================================================================
// A. Auth & Permissions
// =====================================================================

describe("Auth & Permissions", () => {
  it("GET /api/tables → 401 when no cookie", async () => {
    setAuthToken(null);
    const res = await GET_TABLES(buildGetRequest("/api/tables"));
    const body = await jsonBody(res);
    expect(res.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("POST /api/tables → 401 when no cookie", async () => {
    setAuthToken(null);
    const res = await POST_TABLE(
      buildJsonRequest("/api/tables", "POST", { name: "t", slug: "t" })
    );
    const body = await jsonBody(res);
    expect(res.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("GET /api/tables/:id → 401 when no cookie", async () => {
    setAuthToken(null);
    const res = await GET_TABLE_BY_ID(
      buildGetRequest("/api/tables/1"),
      makeParams(1)
    );
    const body = await jsonBody(res);
    expect(res.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("PATCH /api/tables/:id → 401 when no cookie", async () => {
    setAuthToken(null);
    const res = await PATCH_TABLE(
      buildJsonRequest("/api/tables/1", "PATCH", { name: "x" }),
      makeParams(1)
    );
    const body = await jsonBody(res);
    expect(res.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("DELETE /api/tables/:id → 401 when no cookie", async () => {
    setAuthToken(null);
    const res = await DELETE_TABLE(
      buildGetRequest("/api/tables/1"),
      makeParams(1)
    );
    const body = await jsonBody(res);
    expect(res.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("basic user without canManageTables → 403 on POST", async () => {
    setAuthToken(basicToken);
    const res = await POST_TABLE(
      buildJsonRequest("/api/tables", "POST", { name: "t", slug: "t" })
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(403);
    expect(body.error).toBe("אין לך הרשאה ליצור טבלאות");
  });

  it("basic user without canManageTables → 403 on PATCH", async () => {
    setAuthToken(adminToken);
    const table = await seedTable(companyA.id, adminUser.id, { slug: "perm-patch" });

    setAuthToken(basicToken);
    const res = await PATCH_TABLE(
      buildJsonRequest("/api/tables/" + table.id, "PATCH", { name: "new" }),
      makeParams(table.id)
    );
    const body = await jsonBody(res);
    expect(res.status).toBe(403);
    expect(body.error).toBe("Forbidden: Only admins can update tables");
  });

  it("basic user without canManageTables → 403 on DELETE", async () => {
    setAuthToken(adminToken);
    const table = await seedTable(companyA.id, adminUser.id, { slug: "perm-del" });

    setAuthToken(basicToken);
    const res = await DELETE_TABLE(
      buildGetRequest("/api/tables/" + table.id),
      makeParams(table.id)
    );
    const body = await jsonBody(res);
    expect(res.status).toBe(403);
    expect(body.error).toBe("Forbidden: Only admins can delete tables");
  });

  it("basic user WITH canManageTables → can POST", async () => {
    setAuthToken(basicManageToken);
    const res = await POST_TABLE(
      buildJsonRequest("/api/tables", "POST", { name: "managed", slug: "managed-table" })
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);

    // Verify DB state and createdBy is the basic user
    const dbTable = await prisma.tableMeta.findUnique({ where: { id: body.id } });
    expect(dbTable).not.toBeNull();
    expect(dbTable!.createdBy).toBe(basicUserWithManage.id);
    expect(dbTable!.companyId).toBe(companyA.id);
  });

  it("basic user without table read permission → 403 on GET /:id", async () => {
    setAuthToken(adminToken);
    const table = await seedTable(companyA.id, adminUser.id, { slug: "no-perm-read" });

    setAuthToken(basicToken);
    const res = await GET_TABLE_BY_ID(
      buildGetRequest("/api/tables/" + table.id),
      makeParams(table.id)
    );
    const body = await jsonBody(res);
    expect(res.status).toBe(403);
    expect(body.error).toBe("Forbidden");
  });

  it("basic user with tablePermissions read → can GET /:id", async () => {
    setAuthToken(adminToken);
    const table = await seedTable(companyA.id, adminUser.id, { slug: "has-perm-read" });

    // Grant read permission
    await prisma.user.update({
      where: { id: basicUser.id },
      data: { tablePermissions: { [String(table.id)]: "read" } },
    });

    setAuthToken(basicToken);
    const res = await GET_TABLE_BY_ID(
      buildGetRequest("/api/tables/" + table.id),
      makeParams(table.id)
    );
    expect(res.status).toBe(200);

    // Cleanup permission
    await prisma.user.update({
      where: { id: basicUser.id },
      data: { tablePermissions: {} },
    });
  });

  it("manager can access GET /api/tables", async () => {
    setAuthToken(managerToken);

    const listRes = await GET_TABLES(buildGetRequest("/api/tables"));
    const body = await jsonBody(listRes);
    expect(listRes.status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it("manager can access GET /api/tables/:id", async () => {
    const table = await seedTable(companyA.id, adminUser.id, { slug: "mgr-get-one" });

    setAuthToken(managerToken);
    const res = await GET_TABLE_BY_ID(
      buildGetRequest("/api/tables/" + table.id),
      makeParams(table.id)
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.id).toBe(table.id);
  });
});

// =====================================================================
// B. GET /api/tables
// =====================================================================

describe("GET /api/tables", () => {
  it("returns all non-deleted tables for admin", async () => {
    await seedTable(companyA.id, adminUser.id, { slug: "list-a" });
    await seedTable(companyA.id, adminUser.id, { slug: "list-b" });

    setAuthToken(adminToken);
    const res = await GET_TABLES(buildGetRequest("/api/tables"));
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.data.length).toBe(2);
    const slugs = body.data.map((t: any) => t.slug);
    expect(slugs).toContain("list-a");
    expect(slugs).toContain("list-b");
  });

  it("excludes soft-deleted tables", async () => {
    await seedTable(companyA.id, adminUser.id, { slug: "active-t" });
    await seedTable(companyA.id, adminUser.id, {
      slug: "deleted-t",
      deletedAt: new Date(),
    });

    setAuthToken(adminToken);
    const res = await GET_TABLES(buildGetRequest("/api/tables"));
    const body = await jsonBody(res);

    expect(body.data.length).toBe(1);
    expect(body.data[0].slug).toBe("active-t");
  });

  it("cursor pagination: hasMore=true with limit", async () => {
    for (let i = 0; i < 5; i++) {
      await seedTable(companyA.id, adminUser.id, { slug: `page-${i}` });
    }

    setAuthToken(adminToken);
    const res = await GET_TABLES(
      buildGetRequest("/api/tables", { limit: "3" })
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.data.length).toBe(3);
    expect(body.hasMore).toBe(true);
    expect(body.nextCursor).toBeDefined();
  });

  it("second page via cursor", async () => {
    for (let i = 0; i < 5; i++) {
      await seedTable(companyA.id, adminUser.id, { slug: `cursor-${i}` });
    }

    setAuthToken(adminToken);
    const res1 = await GET_TABLES(
      buildGetRequest("/api/tables", { limit: "3" })
    );
    const body1 = await jsonBody(res1);

    const res2 = await GET_TABLES(
      buildGetRequest("/api/tables", {
        limit: "3",
        cursor: String(body1.nextCursor),
      })
    );
    const body2 = await jsonBody(res2);

    expect(body2.data.length).toBe(2);
    expect(body2.hasMore).toBe(false);
  });

  it("invalid cursor (non-numeric) → 400", async () => {
    setAuthToken(adminToken);
    const res = await GET_TABLES(
      buildGetRequest("/api/tables", { cursor: "abc" })
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid cursor");
  });

  it("invalid cursor (negative) → 400", async () => {
    setAuthToken(adminToken);
    const res = await GET_TABLES(
      buildGetRequest("/api/tables", { cursor: "-5" })
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid cursor");
  });

  it("invalid cursor (zero) → 400", async () => {
    setAuthToken(adminToken);
    const res = await GET_TABLES(
      buildGetRequest("/api/tables", { cursor: "0" })
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid cursor");
  });

  it("basic user sees only permitted tables", async () => {
    const t1 = await seedTable(companyA.id, adminUser.id, { slug: "visible-t" });
    await seedTable(companyA.id, adminUser.id, { slug: "hidden-t" });

    await prisma.user.update({
      where: { id: basicUser.id },
      data: { tablePermissions: { [String(t1.id)]: "read" } },
    });

    setAuthToken(basicToken);
    const res = await GET_TABLES(buildGetRequest("/api/tables"));
    const body = await jsonBody(res);

    expect(body.data.length).toBe(1);
    expect(body.data[0].id).toBe(t1.id);

    await prisma.user.update({
      where: { id: basicUser.id },
      data: { tablePermissions: {} },
    });
  });

  it("basic user with no permissions → empty list", async () => {
    await seedTable(companyA.id, adminUser.id, { slug: "noperm-t" });

    setAuthToken(basicToken);
    const res = await GET_TABLES(buildGetRequest("/api/tables"));
    const body = await jsonBody(res);

    expect(body.data).toEqual([]);
  });

  it("manager sees all company tables", async () => {
    await seedTable(companyA.id, adminUser.id, { slug: "mgr-t1" });
    await seedTable(companyA.id, adminUser.id, { slug: "mgr-t2" });

    setAuthToken(managerToken);
    const res = await GET_TABLES(buildGetRequest("/api/tables"));
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.data.length).toBe(2);
    const slugs = body.data.map((t: any) => t.slug);
    expect(slugs).toContain("mgr-t1");
    expect(slugs).toContain("mgr-t2");
  });

  it("multi-tenancy: no cross-company data", async () => {
    await seedTable(companyA.id, adminUser.id, { slug: "mt-a" });
    await seedTable(companyB.id, otherCompanyAdmin.id, { slug: "mt-b" });

    setAuthToken(adminToken);
    const res = await GET_TABLES(buildGetRequest("/api/tables"));
    const body = await jsonBody(res);

    const slugs = body.data.map((t: any) => t.slug);
    expect(slugs).toContain("mt-a");
    expect(slugs).not.toContain("mt-b");
  });

  it("limit capped at 500", async () => {
    setAuthToken(adminToken);
    const res = await GET_TABLES(
      buildGetRequest("/api/tables", { limit: "9999" })
    );
    const body = await jsonBody(res);
    // Should not error — just silently caps
    expect(res.status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it("empty result set", async () => {
    setAuthToken(adminToken);
    const res = await GET_TABLES(buildGetRequest("/api/tables"));
    const body = await jsonBody(res);

    expect(body.data).toEqual([]);
    expect(body.hasMore).toBe(false);
  });

  it("response does NOT contain companyId, createdBy, or deletedAt", async () => {
    await seedTable(companyA.id, adminUser.id, { slug: "field-exclusion" });

    setAuthToken(adminToken);
    const res = await GET_TABLES(buildGetRequest("/api/tables"));
    const body = await jsonBody(res);

    expect(body.data.length).toBeGreaterThan(0);
    for (const table of body.data) {
      expect(table.companyId).toBeUndefined();
      expect(table.createdBy).toBeUndefined();
      expect(table.deletedAt).toBeUndefined();
    }
  });

  it("each list item has expected fields with correct types", async () => {
    await seedTable(companyA.id, adminUser.id, {
      slug: "shape-check",
      schemaJson: { fields: [] },
    });

    setAuthToken(adminToken);
    const res = await GET_TABLES(buildGetRequest("/api/tables"));
    const body = await jsonBody(res);

    expect(body.data.length).toBeGreaterThan(0);
    const item = body.data[0];
    expect(typeof item.id).toBe("number");
    expect(typeof item.name).toBe("string");
    expect(typeof item.slug).toBe("string");
    expect(typeof item.schemaJson).toBe("object");
    expect(typeof item.order).toBe("number");
    expect(typeof item.createdAt).toBe("string");
    expect(typeof item.updatedAt).toBe("string");
    expect(item).toHaveProperty("categoryId");
    expect(item).toHaveProperty("tabsConfig");
    expect(item).toHaveProperty("displayConfig");
  });

  it("basic user with 'write' permission sees table in list", async () => {
    const t1 = await seedTable(companyA.id, adminUser.id, { slug: "write-perm-list" });

    await prisma.user.update({
      where: { id: basicUser.id },
      data: { tablePermissions: { [String(t1.id)]: "write" } },
    });

    setAuthToken(basicToken);
    const res = await GET_TABLES(buildGetRequest("/api/tables"));
    const body = await jsonBody(res);

    expect(body.data.length).toBe(1);
    expect(body.data[0].id).toBe(t1.id);

    await prisma.user.update({
      where: { id: basicUser.id },
      data: { tablePermissions: {} },
    });
  });

  it("limit=0 silently defaults to 100 (0 is falsy → || 100)", async () => {
    setAuthToken(adminToken);
    const res = await GET_TABLES(
      buildGetRequest("/api/tables", { limit: "0" })
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it("limit=-1 → 400", async () => {
    setAuthToken(adminToken);
    const res = await GET_TABLES(
      buildGetRequest("/api/tables", { limit: "-1" })
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid limit");
  });

  it("non-numeric limit string defaults to 100", async () => {
    setAuthToken(adminToken);
    const res = await GET_TABLES(
      buildGetRequest("/api/tables", { limit: "abc" })
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
  });
});

// =====================================================================
// C. POST /api/tables
// =====================================================================

describe("POST /api/tables", () => {
  it("creates with valid data, verifies response AND DB state", async () => {
    setAuthToken(adminToken);
    const res = await POST_TABLE(
      buildJsonRequest("/api/tables", "POST", {
        name: "New Table",
        slug: "new-table",
        schemaJson: { fields: [{ name: "col1", type: "string" }] },
      })
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.name).toBe("New Table");
    expect(body.slug).toBe("new-table");
    expect(body.id).toBeDefined();

    // Verify DB
    const dbTable = await prisma.tableMeta.findUnique({ where: { id: body.id } });
    expect(dbTable).not.toBeNull();
    expect(dbTable!.name).toBe("New Table");
    expect(dbTable!.companyId).toBe(companyA.id);
    expect(dbTable!.createdBy).toBe(adminUser.id);
  });

  it("missing name → 400", async () => {
    setAuthToken(adminToken);
    const res = await POST_TABLE(
      buildJsonRequest("/api/tables", "POST", { slug: "no-name" })
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe("Missing required fields");
  });

  it("missing slug → 400", async () => {
    setAuthToken(adminToken);
    const res = await POST_TABLE(
      buildJsonRequest("/api/tables", "POST", { name: "No Slug" })
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe("Missing required fields");
  });

  it("empty string name → 400", async () => {
    setAuthToken(adminToken);
    const res = await POST_TABLE(
      buildJsonRequest("/api/tables", "POST", { name: "", slug: "empty-name" })
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe("Missing required fields");
  });

  it("empty string slug → 400", async () => {
    setAuthToken(adminToken);
    const res = await POST_TABLE(
      buildJsonRequest("/api/tables", "POST", { name: "Has Name", slug: "" })
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe("Missing required fields");
  });

  it("invalid slug format: uppercase → 400", async () => {
    setAuthToken(adminToken);
    const res = await POST_TABLE(
      buildJsonRequest("/api/tables", "POST", { name: "Customer Leads", slug: "UpperCase" })
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toContain("Slug must start with");
  });

  it("invalid slug format: leading hyphen → 400", async () => {
    setAuthToken(adminToken);
    const res = await POST_TABLE(
      buildJsonRequest("/api/tables", "POST", { name: "Customer Leads", slug: "-leading" })
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toContain("Slug must start with");
  });

  it("invalid slug format: spaces → 400", async () => {
    setAuthToken(adminToken);
    const res = await POST_TABLE(
      buildJsonRequest("/api/tables", "POST", { name: "Customer Leads", slug: "has space" })
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toContain("Slug must start with");
  });

  it("valid slug with hyphens and underscores → 200", async () => {
    setAuthToken(adminToken);
    const res = await POST_TABLE(
      buildJsonRequest("/api/tables", "POST", {
        name: "Slug Test Table",
        slug: "valid-slug_123",
      })
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.slug).toBe("valid-slug_123");

    const dbTable = await prisma.tableMeta.findUnique({ where: { id: body.id } });
    expect(dbTable!.slug).toBe("valid-slug_123");
  });

  it("name > 200 chars → 400", async () => {
    setAuthToken(adminToken);
    const res = await POST_TABLE(
      buildJsonRequest("/api/tables", "POST", {
        name: "a".repeat(201),
        slug: "long-name",
      })
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toContain("200");
  });

  it("slug > 100 chars → 400", async () => {
    setAuthToken(adminToken);
    const res = await POST_TABLE(
      buildJsonRequest("/api/tables", "POST", {
        name: "Long Slug Table",
        slug: "a".repeat(101),
      })
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toContain("100");
  });

  it("oversized schemaJson (> 200KB) → 400", async () => {
    setAuthToken(adminToken);
    const bigSchema = { data: "x".repeat(200_001) };
    const res = await POST_TABLE(
      buildJsonRequest("/api/tables", "POST", {
        name: "Schema Size Test",
        slug: "big-schema",
        schemaJson: bigSchema,
      })
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe("schemaJson exceeds maximum size of 200000 bytes");
  });

  it("non-object schemaJson → 400", async () => {
    setAuthToken(adminToken);
    const res = await POST_TABLE(
      buildJsonRequest("/api/tables", "POST", {
        name: "Schema Type Test",
        slug: "bad-schema",
        schemaJson: "not-an-object",
      })
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe("schemaJson must be a JSON object");
  });

  it("null schemaJson → 400", async () => {
    setAuthToken(adminToken);
    const res = await POST_TABLE(
      buildJsonRequest("/api/tables", "POST", {
        name: "Null Schema Test",
        slug: "null-schema",
        schemaJson: null,
      })
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe("schemaJson must be a JSON object");
  });

  it("empty object schemaJson → 200", async () => {
    setAuthToken(adminToken);
    const res = await POST_TABLE(
      buildJsonRequest("/api/tables", "POST", {
        name: "Empty Schema Test",
        slug: "empty-schema",
        schemaJson: {},
      })
    );
    const body = await jsonBody(res);
    expect(res.status).toBe(200);

    const dbTable = await prisma.tableMeta.findUnique({ where: { id: body.id } });
    expect(dbTable!.schemaJson).toEqual({});
  });

  it("duplicate slug same company → 409", async () => {
    setAuthToken(adminToken);
    await POST_TABLE(
      buildJsonRequest("/api/tables", "POST", { name: "T1", slug: "dup-slug" })
    );
    const res2 = await POST_TABLE(
      buildJsonRequest("/api/tables", "POST", { name: "T2", slug: "dup-slug" })
    );
    const body = await jsonBody(res2);

    expect(res2.status).toBe(409);
    expect(body.error).toContain("slug");
  });

  it("same slug different company → 200 with DB verify", async () => {
    setAuthToken(adminToken);
    const res1 = await POST_TABLE(
      buildJsonRequest("/api/tables", "POST", {
        name: "Company A Table",
        slug: "cross-co-slug",
      })
    );
    const body1 = await jsonBody(res1);

    setAuthToken(otherAdminToken);
    const res2 = await POST_TABLE(
      buildJsonRequest("/api/tables", "POST", {
        name: "Company B Table",
        slug: "cross-co-slug",
      })
    );
    const body2 = await jsonBody(res2);

    expect(res2.status).toBe(200);

    // Verify both tables exist in DB with same slug but different companies
    const dbTable1 = await prisma.tableMeta.findUnique({ where: { id: body1.id } });
    const dbTable2 = await prisma.tableMeta.findUnique({ where: { id: body2.id } });
    expect(dbTable1!.slug).toBe("cross-co-slug");
    expect(dbTable2!.slug).toBe("cross-co-slug");
    expect(dbTable1!.companyId).toBe(companyA.id);
    expect(dbTable2!.companyId).toBe(companyB.id);
  });

  it("invalid categoryId (negative) → 400", async () => {
    setAuthToken(adminToken);
    const res = await POST_TABLE(
      buildJsonRequest("/api/tables", "POST", {
        name: "Bad Category Table",
        slug: "bad-cat",
        categoryId: -1,
      })
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid category ID");
  });

  it("non-existent categoryId → 400", async () => {
    setAuthToken(adminToken);
    const res = await POST_TABLE(
      buildJsonRequest("/api/tables", "POST", {
        name: "Missing Category Table",
        slug: "noexist-cat",
        categoryId: 999999,
      })
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid category");
  });

  it("category from different company → 400", async () => {
    const otherCat = await seedCategory(companyB.id, "Other Cat");

    setAuthToken(adminToken);
    const res = await POST_TABLE(
      buildJsonRequest("/api/tables", "POST", {
        name: "Wrong Company Cat Table",
        slug: "wrong-co-cat",
        categoryId: otherCat.id,
      })
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid category");
  });

  it("valid categoryId → table linked to category", async () => {
    const cat = await seedCategory(companyA.id, "My Cat");

    setAuthToken(adminToken);
    const res = await POST_TABLE(
      buildJsonRequest("/api/tables", "POST", {
        name: "Categorized",
        slug: "categorized",
        categoryId: cat.id,
      })
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.categoryId).toBe(cat.id);

    // Verify DB has categoryId
    const dbTable = await prisma.tableMeta.findUnique({ where: { id: body.id } });
    expect(dbTable!.categoryId).toBe(cat.id);
  });

  it("name whitespace trimmed", async () => {
    setAuthToken(adminToken);
    const res = await POST_TABLE(
      buildJsonRequest("/api/tables", "POST", {
        name: "  trimmed  ",
        slug: "trimmed",
      })
    );
    const body = await jsonBody(res);

    expect(body.name).toBe("trimmed");

    // Verify DB has trimmed name
    const dbTable = await prisma.tableMeta.findUnique({ where: { id: body.id } });
    expect(dbTable!.name).toBe("trimmed");
  });

  it("tabsConfig and displayConfig stored correctly", async () => {
    const tabsConfig = { enabled: true, tabs: [{ id: "t1", label: "Tab1", order: 0 }] };
    const displayConfig = { visibleColumns: ["col1"], columnOrder: ["col1"] };

    setAuthToken(adminToken);
    const res = await POST_TABLE(
      buildJsonRequest("/api/tables", "POST", {
        name: "Configured",
        slug: "configured",
        tabsConfig,
        displayConfig,
      })
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.tabsConfig).toEqual(tabsConfig);
    expect(body.displayConfig).toEqual(displayConfig);

    // Verify DB state
    const dbTable = await prisma.tableMeta.findUnique({ where: { id: body.id } });
    expect(dbTable!.tabsConfig).toEqual(tabsConfig);
    expect(dbTable!.displayConfig).toEqual(displayConfig);
  });

  it("invalid JSON body → 400", async () => {
    setAuthToken(adminToken);
    const req = new Request("http://localhost:3000/api/tables", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json{{{",
    });
    const res = await POST_TABLE(req);
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid JSON body");
  });

  it("non-string slug (number) → 400", async () => {
    setAuthToken(adminToken);
    const res = await POST_TABLE(
      buildJsonRequest("/api/tables", "POST", {
        name: "Numeric Slug Table",
        slug: 123,
      })
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toContain("Slug must be a string");
  });

  it("schemaJson defaults to {} when not provided", async () => {
    setAuthToken(adminToken);
    const res = await POST_TABLE(
      buildJsonRequest("/api/tables", "POST", {
        name: "NoSchema",
        slug: "no-schema",
      })
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    const dbTable = await prisma.tableMeta.findUnique({ where: { id: body.id } });
    expect(dbTable!.schemaJson).toEqual({});
  });

  it("order defaults to 0", async () => {
    setAuthToken(adminToken);
    const res = await POST_TABLE(
      buildJsonRequest("/api/tables", "POST", {
        name: "Order Default",
        slug: "order-default",
      })
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.order).toBe(0);

    const dbTable = await prisma.tableMeta.findUnique({ where: { id: body.id } });
    expect(dbTable!.order).toBe(0);
  });

  it("non-string name (number) → 400", async () => {
    setAuthToken(adminToken);
    const res = await POST_TABLE(
      buildJsonRequest("/api/tables", "POST", {
        name: 12345,
        slug: "num-name",
      })
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe("Name must be a string of at most 200 characters");
  });

  it("createdAt and updatedAt are valid ISO date strings", async () => {
    setAuthToken(adminToken);
    const res = await POST_TABLE(
      buildJsonRequest("/api/tables", "POST", {
        name: "Date Check",
        slug: "date-check",
      })
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(typeof body.createdAt).toBe("string");
    expect(typeof body.updatedAt).toBe("string");
    expect(new Date(body.createdAt).toISOString()).toBe(body.createdAt);
    expect(new Date(body.updatedAt).toISOString()).toBe(body.updatedAt);
  });

  it("response does NOT contain companyId, createdBy, or deletedAt", async () => {
    setAuthToken(adminToken);
    const res = await POST_TABLE(
      buildJsonRequest("/api/tables", "POST", {
        name: "Field Exclusion",
        slug: "post-excl",
      })
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.companyId).toBeUndefined();
    expect(body.createdBy).toBeUndefined();
    expect(body.deletedAt).toBeUndefined();
  });
});

// =====================================================================
// D. GET /api/tables/:id
// =====================================================================

describe("GET /api/tables/:id", () => {
  it("returns table with _count.records", async () => {
    const table = await seedTable(companyA.id, adminUser.id, { slug: "get-one" });
    await seedRecord(companyA.id, table.id, { name: "rec1" });
    await seedRecord(companyA.id, table.id, { name: "rec2" });

    setAuthToken(adminToken);
    const res = await GET_TABLE_BY_ID(
      buildGetRequest("/api/tables/" + table.id),
      makeParams(table.id)
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.id).toBe(table.id);
    expect(body._count.records).toBe(2);
  });

  it("_count.records = 0 when no records", async () => {
    const table = await seedTable(companyA.id, adminUser.id, { slug: "no-recs" });

    setAuthToken(adminToken);
    const res = await GET_TABLE_BY_ID(
      buildGetRequest("/api/tables/" + table.id),
      makeParams(table.id)
    );
    const body = await jsonBody(res);

    expect(body._count.records).toBe(0);
  });

  it("non-numeric ID → 400", async () => {
    setAuthToken(adminToken);
    const res = await GET_TABLE_BY_ID(
      buildGetRequest("/api/tables/abc"),
      makeParams("abc")
    );
    const body = await jsonBody(res);
    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid table ID");
  });

  it("negative ID → 400", async () => {
    setAuthToken(adminToken);
    const res = await GET_TABLE_BY_ID(
      buildGetRequest("/api/tables/-1"),
      makeParams("-1")
    );
    const body = await jsonBody(res);
    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid table ID");
  });

  it("zero ID → 400", async () => {
    setAuthToken(adminToken);
    const res = await GET_TABLE_BY_ID(
      buildGetRequest("/api/tables/0"),
      makeParams("0")
    );
    const body = await jsonBody(res);
    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid table ID");
  });

  it("non-existent ID → 404", async () => {
    setAuthToken(adminToken);
    const res = await GET_TABLE_BY_ID(
      buildGetRequest("/api/tables/999999"),
      makeParams(999999)
    );
    const body = await jsonBody(res);
    expect(res.status).toBe(404);
    expect(body.error).toBe("Table not found");
  });

  it("soft-deleted table → 404", async () => {
    const table = await seedTable(companyA.id, adminUser.id, {
      slug: "soft-del",
      deletedAt: new Date(),
    });

    setAuthToken(adminToken);
    const res = await GET_TABLE_BY_ID(
      buildGetRequest("/api/tables/" + table.id),
      makeParams(table.id)
    );
    const body = await jsonBody(res);
    expect(res.status).toBe(404);
    expect(body.error).toBe("Table not found");
  });

  it("different company table → 404", async () => {
    const otherTable = await seedTable(companyB.id, otherCompanyAdmin.id, {
      slug: "other-co",
    });

    setAuthToken(adminToken);
    const res = await GET_TABLE_BY_ID(
      buildGetRequest("/api/tables/" + otherTable.id),
      makeParams(otherTable.id)
    );
    const body = await jsonBody(res);
    expect(res.status).toBe(404);
    expect(body.error).toBe("Table not found");
  });

  it("basic user without permission → 403", async () => {
    const table = await seedTable(companyA.id, adminUser.id, { slug: "no-perm" });

    setAuthToken(basicToken);
    const res = await GET_TABLE_BY_ID(
      buildGetRequest("/api/tables/" + table.id),
      makeParams(table.id)
    );
    const body = await jsonBody(res);
    expect(res.status).toBe(403);
    expect(body.error).toBe("Forbidden");
  });

  it("basic user with read permission → 200", async () => {
    const table = await seedTable(companyA.id, adminUser.id, { slug: "with-read" });
    await prisma.user.update({
      where: { id: basicUser.id },
      data: { tablePermissions: { [String(table.id)]: "read" } },
    });

    setAuthToken(basicToken);
    const res = await GET_TABLE_BY_ID(
      buildGetRequest("/api/tables/" + table.id),
      makeParams(table.id)
    );
    expect(res.status).toBe(200);

    await prisma.user.update({
      where: { id: basicUser.id },
      data: { tablePermissions: {} },
    });
  });

  it("basic user with write permission → 200", async () => {
    const table = await seedTable(companyA.id, adminUser.id, { slug: "with-write" });
    await prisma.user.update({
      where: { id: basicUser.id },
      data: { tablePermissions: { [String(table.id)]: "write" } },
    });

    setAuthToken(basicToken);
    const res = await GET_TABLE_BY_ID(
      buildGetRequest("/api/tables/" + table.id),
      makeParams(table.id)
    );
    expect(res.status).toBe(200);

    await prisma.user.update({
      where: { id: basicUser.id },
      data: { tablePermissions: {} },
    });
  });

  it("response contains all expected fields with correct types", async () => {
    const table = await seedTable(companyA.id, adminUser.id, {
      slug: "full-fields",
      schemaJson: { f: 1 },
      tabsConfig: { enabled: true },
      displayConfig: { cols: ["a"] },
    });

    setAuthToken(adminToken);
    const res = await GET_TABLE_BY_ID(
      buildGetRequest("/api/tables/" + table.id),
      makeParams(table.id)
    );
    const body = await jsonBody(res);

    expect(body).toHaveProperty("id");
    expect(body).toHaveProperty("name");
    expect(body).toHaveProperty("slug");
    expect(body).toHaveProperty("schemaJson");
    expect(body).toHaveProperty("tabsConfig");
    expect(body).toHaveProperty("displayConfig");
    expect(body).toHaveProperty("categoryId");
    expect(body).toHaveProperty("order");
    expect(body).toHaveProperty("createdAt");
    expect(body).toHaveProperty("updatedAt");
    expect(body).toHaveProperty("_count");

    // Verify types
    expect(typeof body.id).toBe("number");
    expect(typeof body.name).toBe("string");
    expect(typeof body.slug).toBe("string");
    expect(typeof body.order).toBe("number");
    expect(typeof body.createdAt).toBe("string");
    expect(typeof body.updatedAt).toBe("string");
    expect(new Date(body.createdAt).toISOString()).toBe(body.createdAt);
    expect(new Date(body.updatedAt).toISOString()).toBe(body.updatedAt);
  });

  it("response does NOT contain companyId, createdBy, or deletedAt", async () => {
    const table = await seedTable(companyA.id, adminUser.id, { slug: "excl-fields" });

    setAuthToken(adminToken);
    const res = await GET_TABLE_BY_ID(
      buildGetRequest("/api/tables/" + table.id),
      makeParams(table.id)
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.companyId).toBeUndefined();
    expect(body.createdBy).toBeUndefined();
    expect(body.deletedAt).toBeUndefined();
  });
});

// =====================================================================
// E. PATCH /api/tables/:id
// =====================================================================

describe("PATCH /api/tables/:id", () => {
  it("partial update: name only", async () => {
    const table = await seedTable(companyA.id, adminUser.id, { slug: "patch-name", name: "Old" });

    setAuthToken(adminToken);
    const res = await PATCH_TABLE(
      buildJsonRequest("/api/tables/" + table.id, "PATCH", { name: "New" }),
      makeParams(table.id)
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.name).toBe("New");
    expect(body.slug).toBe("patch-name");

    // Verify DB
    const dbTable = await prisma.tableMeta.findUnique({ where: { id: table.id } });
    expect(dbTable!.name).toBe("New");
    expect(dbTable!.slug).toBe("patch-name");
  });

  it("partial update: slug only", async () => {
    const table = await seedTable(companyA.id, adminUser.id, { slug: "old-slug", name: "Keep" });

    setAuthToken(adminToken);
    const res = await PATCH_TABLE(
      buildJsonRequest("/api/tables/" + table.id, "PATCH", { slug: "new-slug" }),
      makeParams(table.id)
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.slug).toBe("new-slug");
    expect(body.name).toBe("Keep");

    // Verify DB
    const dbTable = await prisma.tableMeta.findUnique({ where: { id: table.id } });
    expect(dbTable!.slug).toBe("new-slug");
    expect(dbTable!.name).toBe("Keep");
  });

  it("partial update: schemaJson only", async () => {
    const table = await seedTable(companyA.id, adminUser.id, { slug: "patch-schema" });

    setAuthToken(adminToken);
    const newSchema = { fields: [{ name: "updated", type: "string" }] };
    const res = await PATCH_TABLE(
      buildJsonRequest("/api/tables/" + table.id, "PATCH", { schemaJson: newSchema }),
      makeParams(table.id)
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.schemaJson).toEqual(newSchema);

    // Verify DB
    const dbTable = await prisma.tableMeta.findUnique({ where: { id: table.id } });
    expect(dbTable!.schemaJson).toEqual(newSchema);
  });

  it("multi-field update", async () => {
    const table = await seedTable(companyA.id, adminUser.id, {
      slug: "multi-update",
      name: "Old Name",
    });

    setAuthToken(adminToken);
    const res = await PATCH_TABLE(
      buildJsonRequest("/api/tables/" + table.id, "PATCH", {
        name: "Updated Name",
        slug: "updated-slug",
        schemaJson: { v: 2 },
      }),
      makeParams(table.id)
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.name).toBe("Updated Name");
    expect(body.slug).toBe("updated-slug");
    expect(body.schemaJson).toEqual({ v: 2 });

    // Verify DB
    const dbTable = await prisma.tableMeta.findUnique({ where: { id: table.id } });
    expect(dbTable!.name).toBe("Updated Name");
    expect(dbTable!.slug).toBe("updated-slug");
    expect(dbTable!.schemaJson).toEqual({ v: 2 });
  });

  it("optimistic concurrency: stale updatedAt → 409", async () => {
    const table = await seedTable(companyA.id, adminUser.id, { slug: "occ-test" });

    // Get the current updatedAt
    const current = await prisma.tableMeta.findUnique({ where: { id: table.id } });

    // First update to change updatedAt
    setAuthToken(adminToken);
    await PATCH_TABLE(
      buildJsonRequest("/api/tables/" + table.id, "PATCH", { name: "First Update" }),
      makeParams(table.id)
    );

    // Second update with stale updatedAt → should conflict
    const res = await PATCH_TABLE(
      buildJsonRequest("/api/tables/" + table.id, "PATCH", {
        name: "Stale Update",
        updatedAt: current!.updatedAt.toISOString(),
      }),
      makeParams(table.id)
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(409);
    expect(body.error).toContain("Conflict");
  });

  it("optimistic concurrency: correct updatedAt → 200", async () => {
    const table = await seedTable(companyA.id, adminUser.id, { slug: "occ-ok" });

    setAuthToken(adminToken);
    // Get the fresh updatedAt
    const fresh = await prisma.tableMeta.findUnique({ where: { id: table.id } });

    const res = await PATCH_TABLE(
      buildJsonRequest("/api/tables/" + table.id, "PATCH", {
        name: "Fresh Update",
        updatedAt: fresh!.updatedAt.toISOString(),
      }),
      makeParams(table.id)
    );
    expect(res.status).toBe(200);

    const dbTable = await prisma.tableMeta.findUnique({ where: { id: table.id } });
    expect(dbTable!.name).toBe("Fresh Update");
  });

  it("duplicate slug → 409", async () => {
    await seedTable(companyA.id, adminUser.id, { slug: "existing-slug" });
    const table2 = await seedTable(companyA.id, adminUser.id, { slug: "will-dup" });

    setAuthToken(adminToken);
    const res = await PATCH_TABLE(
      buildJsonRequest("/api/tables/" + table2.id, "PATCH", { slug: "existing-slug" }),
      makeParams(table2.id)
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(409);
    expect(body.error).toContain("slug");
  });

  it("non-existent table → 404", async () => {
    setAuthToken(adminToken);
    const res = await PATCH_TABLE(
      buildJsonRequest("/api/tables/999999", "PATCH", { name: "x" }),
      makeParams(999999)
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(404);
    expect(body.error).toBe("Table not found");
  });

  it("soft-deleted table → 404", async () => {
    const table = await seedTable(companyA.id, adminUser.id, {
      slug: "patch-deleted",
      deletedAt: new Date(),
    });

    setAuthToken(adminToken);
    const res = await PATCH_TABLE(
      buildJsonRequest("/api/tables/" + table.id, "PATCH", { name: "x" }),
      makeParams(table.id)
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(404);
    expect(body.error).toBe("Table not found");
  });

  it("different company table → 404 (multi-tenancy)", async () => {
    const otherTable = await seedTable(companyB.id, otherCompanyAdmin.id, {
      slug: "other-co-patch",
    });

    setAuthToken(adminToken);
    const res = await PATCH_TABLE(
      buildJsonRequest("/api/tables/" + otherTable.id, "PATCH", { name: "Hacked" }),
      makeParams(otherTable.id)
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(404);
    expect(body.error).toBe("Table not found");

    // Verify the other company's table is unchanged
    const dbTable = await prisma.tableMeta.findUnique({ where: { id: otherTable.id } });
    expect(dbTable!.name).not.toBe("Hacked");
  });

  it("empty name → 400", async () => {
    const table = await seedTable(companyA.id, adminUser.id, { slug: "empty-name" });

    setAuthToken(adminToken);
    const res = await PATCH_TABLE(
      buildJsonRequest("/api/tables/" + table.id, "PATCH", { name: "" }),
      makeParams(table.id)
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toContain("Name must be");
  });

  it("oversized name → 400", async () => {
    const table = await seedTable(companyA.id, adminUser.id, { slug: "long-name-p" });

    setAuthToken(adminToken);
    const res = await PATCH_TABLE(
      buildJsonRequest("/api/tables/" + table.id, "PATCH", { name: "x".repeat(201) }),
      makeParams(table.id)
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toContain("Name must be");
  });

  it("invalid slug (uppercase) → 400", async () => {
    const table = await seedTable(companyA.id, adminUser.id, { slug: "bad-slug-p" });

    setAuthToken(adminToken);
    const res = await PATCH_TABLE(
      buildJsonRequest("/api/tables/" + table.id, "PATCH", { slug: "UPPER" }),
      makeParams(table.id)
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toContain("Slug must start with");
  });

  it("empty slug → 400", async () => {
    const table = await seedTable(companyA.id, adminUser.id, { slug: "empty-slug-p" });

    setAuthToken(adminToken);
    const res = await PATCH_TABLE(
      buildJsonRequest("/api/tables/" + table.id, "PATCH", { slug: "" }),
      makeParams(table.id)
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toContain("Slug must be a non-empty");
  });

  it("invalid JSON body → 400", async () => {
    const table = await seedTable(companyA.id, adminUser.id, { slug: "bad-json-p" });

    setAuthToken(adminToken);
    const req = new Request(`http://localhost:3000/api/tables/${table.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "not-json{{{",
    });
    const res = await PATCH_TABLE(req, makeParams(table.id));
    const body = await jsonBody(res);
    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid JSON body");
  });

  it("invalid schemaJson type → 400", async () => {
    const table = await seedTable(companyA.id, adminUser.id, { slug: "bad-sj" });

    setAuthToken(adminToken);
    const res = await PATCH_TABLE(
      buildJsonRequest("/api/tables/" + table.id, "PATCH", { schemaJson: "string" }),
      makeParams(table.id)
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe("schemaJson must be a JSON object");
  });

  it("oversized schemaJson → 400", async () => {
    const table = await seedTable(companyA.id, adminUser.id, { slug: "big-sj" });

    setAuthToken(adminToken);
    const res = await PATCH_TABLE(
      buildJsonRequest("/api/tables/" + table.id, "PATCH", {
        schemaJson: { data: "x".repeat(200_001) },
      }),
      makeParams(table.id)
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe("schemaJson exceeds maximum size of 200000 bytes");
  });

  it("tabsConfig: non-object → 400", async () => {
    const table = await seedTable(companyA.id, adminUser.id, { slug: "bad-tabs" });

    setAuthToken(adminToken);
    const res = await PATCH_TABLE(
      buildJsonRequest("/api/tables/" + table.id, "PATCH", { tabsConfig: "string" }),
      makeParams(table.id)
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe("tabsConfig must be a JSON object");
  });

  it("tabsConfig: oversized → 400", async () => {
    const table = await seedTable(companyA.id, adminUser.id, { slug: "big-tabs" });

    setAuthToken(adminToken);
    const res = await PATCH_TABLE(
      buildJsonRequest("/api/tables/" + table.id, "PATCH", {
        tabsConfig: { data: "x".repeat(10_001) },
      }),
      makeParams(table.id)
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe("tabsConfig exceeds 10KB limit");
  });

  it("displayConfig: non-object → 400", async () => {
    const table = await seedTable(companyA.id, adminUser.id, { slug: "bad-disp" });

    setAuthToken(adminToken);
    const res = await PATCH_TABLE(
      buildJsonRequest("/api/tables/" + table.id, "PATCH", { displayConfig: 123 }),
      makeParams(table.id)
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe("displayConfig must be a JSON object");
  });

  it("displayConfig: oversized → 400", async () => {
    const table = await seedTable(companyA.id, adminUser.id, { slug: "big-disp" });

    setAuthToken(adminToken);
    const res = await PATCH_TABLE(
      buildJsonRequest("/api/tables/" + table.id, "PATCH", {
        displayConfig: { data: "x".repeat(5_001) },
      }),
      makeParams(table.id)
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe("displayConfig exceeds 5KB limit");
  });

  it("tabsConfig: null (clear) → 200", async () => {
    const table = await seedTable(companyA.id, adminUser.id, {
      slug: "clear-tabs",
      tabsConfig: { enabled: true },
    });

    setAuthToken(adminToken);
    const res = await PATCH_TABLE(
      buildJsonRequest("/api/tables/" + table.id, "PATCH", { tabsConfig: null }),
      makeParams(table.id)
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.tabsConfig).toBeNull();

    // Verify DB
    const dbTable = await prisma.tableMeta.findUnique({ where: { id: table.id } });
    expect(dbTable!.tabsConfig).toBeNull();
  });

  it("displayConfig: null (clear) → 200", async () => {
    const table = await seedTable(companyA.id, adminUser.id, {
      slug: "clear-disp",
      displayConfig: { cols: ["a"] },
    });

    setAuthToken(adminToken);
    const res = await PATCH_TABLE(
      buildJsonRequest("/api/tables/" + table.id, "PATCH", { displayConfig: null }),
      makeParams(table.id)
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.displayConfig).toBeNull();

    // Verify DB
    const dbTable = await prisma.tableMeta.findUnique({ where: { id: table.id } });
    expect(dbTable!.displayConfig).toBeNull();
  });

  it("categoryId: non-existent → 400", async () => {
    const table = await seedTable(companyA.id, adminUser.id, { slug: "nocat-p" });

    setAuthToken(adminToken);
    const res = await PATCH_TABLE(
      buildJsonRequest("/api/tables/" + table.id, "PATCH", { categoryId: 999999 }),
      makeParams(table.id)
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe("Category not found");
  });

  it("categoryId: different company → 400", async () => {
    const otherCat = await seedCategory(companyB.id, "Other");
    const table = await seedTable(companyA.id, adminUser.id, { slug: "wrongcat-p" });

    setAuthToken(adminToken);
    const res = await PATCH_TABLE(
      buildJsonRequest("/api/tables/" + table.id, "PATCH", { categoryId: otherCat.id }),
      makeParams(table.id)
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe("Category not found");
  });

  it("categoryId: valid → 200", async () => {
    const cat = await seedCategory(companyA.id, "Valid Cat");
    const table = await seedTable(companyA.id, adminUser.id, { slug: "validcat-p" });

    setAuthToken(adminToken);
    const res = await PATCH_TABLE(
      buildJsonRequest("/api/tables/" + table.id, "PATCH", { categoryId: cat.id }),
      makeParams(table.id)
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.categoryId).toBe(cat.id);

    // Verify DB
    const dbTable = await prisma.tableMeta.findUnique({ where: { id: table.id } });
    expect(dbTable!.categoryId).toBe(cat.id);
  });

  it("categoryId: null (clear) → 200", async () => {
    const cat = await seedCategory(companyA.id, "To Clear");
    const table = await seedTable(companyA.id, adminUser.id, {
      slug: "clearcat-p",
      categoryId: cat.id,
    });

    setAuthToken(adminToken);
    const res = await PATCH_TABLE(
      buildJsonRequest("/api/tables/" + table.id, "PATCH", { categoryId: null }),
      makeParams(table.id)
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.categoryId).toBeNull();

    // Verify DB
    const dbTable = await prisma.tableMeta.findUnique({ where: { id: table.id } });
    expect(dbTable!.categoryId).toBeNull();
  });

  it("invalid updatedAt timestamp → 400", async () => {
    const table = await seedTable(companyA.id, adminUser.id, { slug: "bad-ts" });

    setAuthToken(adminToken);
    const res = await PATCH_TABLE(
      buildJsonRequest("/api/tables/" + table.id, "PATCH", {
        name: "x",
        updatedAt: "not-a-date",
      }),
      makeParams(table.id)
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid updatedAt timestamp");
  });

  it("non-numeric table ID → 400", async () => {
    setAuthToken(adminToken);
    const res = await PATCH_TABLE(
      buildJsonRequest("/api/tables/abc", "PATCH", { name: "x" }),
      makeParams("abc")
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid table ID");
  });

  it("response contains all expected fields with correct types", async () => {
    const table = await seedTable(companyA.id, adminUser.id, { slug: "full-patch" });

    setAuthToken(adminToken);
    const res = await PATCH_TABLE(
      buildJsonRequest("/api/tables/" + table.id, "PATCH", { name: "Updated" }),
      makeParams(table.id)
    );
    const body = await jsonBody(res);

    expect(body).toHaveProperty("id");
    expect(body).toHaveProperty("name");
    expect(body).toHaveProperty("slug");
    expect(body).toHaveProperty("schemaJson");
    expect(body).toHaveProperty("tabsConfig");
    expect(body).toHaveProperty("displayConfig");
    expect(body).toHaveProperty("categoryId");
    expect(body).toHaveProperty("order");
    expect(body).toHaveProperty("createdAt");
    expect(body).toHaveProperty("updatedAt");

    // Verify types
    expect(typeof body.id).toBe("number");
    expect(typeof body.createdAt).toBe("string");
    expect(typeof body.updatedAt).toBe("string");
    expect(new Date(body.createdAt).toISOString()).toBe(body.createdAt);
    expect(new Date(body.updatedAt).toISOString()).toBe(body.updatedAt);
  });

  it("updatedAt changes in DB after update", async () => {
    const table = await seedTable(companyA.id, adminUser.id, {
      slug: "updated-at-check",
      name: "Before",
    });

    const dbBefore = await prisma.tableMeta.findUnique({ where: { id: table.id } });

    // Small delay to ensure timestamp difference
    await new Promise((r) => setTimeout(r, 50));

    setAuthToken(adminToken);
    const res = await PATCH_TABLE(
      buildJsonRequest("/api/tables/" + table.id, "PATCH", { name: "After" }),
      makeParams(table.id)
    );
    expect(res.status).toBe(200);

    const dbAfter = await prisma.tableMeta.findUnique({ where: { id: table.id } });
    expect(dbAfter!.updatedAt.getTime()).toBeGreaterThan(dbBefore!.updatedAt.getTime());
    expect(dbAfter!.name).toBe("After");
  });

  it("response does NOT contain companyId, createdBy, or deletedAt", async () => {
    const table = await seedTable(companyA.id, adminUser.id, { slug: "patch-excl" });

    setAuthToken(adminToken);
    const res = await PATCH_TABLE(
      buildJsonRequest("/api/tables/" + table.id, "PATCH", { name: "Excl Check" }),
      makeParams(table.id)
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.companyId).toBeUndefined();
    expect(body.createdBy).toBeUndefined();
    expect(body.deletedAt).toBeUndefined();
  });

  it("schemaJson: {} (empty object) accepted", async () => {
    const table = await seedTable(companyA.id, adminUser.id, {
      slug: "empty-obj-schema",
      schemaJson: { fields: [{ name: "col1", type: "string" }] },
    });

    setAuthToken(adminToken);
    const res = await PATCH_TABLE(
      buildJsonRequest("/api/tables/" + table.id, "PATCH", { schemaJson: {} }),
      makeParams(table.id)
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.schemaJson).toEqual({});

    const dbTable = await prisma.tableMeta.findUnique({ where: { id: table.id } });
    expect(dbTable!.schemaJson).toEqual({});
  });

  it("manager without canManageTables → 403 on PATCH", async () => {
    const table = await seedTable(companyA.id, adminUser.id, {
      slug: "manager-patch-deny",
      name: "Before Manager",
    });

    setAuthToken(managerToken);
    const res = await PATCH_TABLE(
      buildJsonRequest("/api/tables/" + table.id, "PATCH", { name: "After Manager" }),
      makeParams(table.id)
    );

    expect(res.status).toBe(403);

    // Verify DB unchanged
    const dbTable = await prisma.tableMeta.findUnique({ where: { id: table.id } });
    expect(dbTable!.name).toBe("Before Manager");
  });

  it("basicUserWithManage can PATCH → 200 with DB verify", async () => {
    const table = await seedTable(companyA.id, adminUser.id, {
      slug: "basic-manage-patch",
      name: "Before Manage",
    });

    setAuthToken(basicManageToken);
    const res = await PATCH_TABLE(
      buildJsonRequest("/api/tables/" + table.id, "PATCH", { name: "After Manage" }),
      makeParams(table.id)
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.name).toBe("After Manage");

    const dbTable = await prisma.tableMeta.findUnique({ where: { id: table.id } });
    expect(dbTable!.name).toBe("After Manage");
  });
});

// =====================================================================
// F. DELETE /api/tables/:id
// =====================================================================

describe("DELETE /api/tables/:id", () => {
  it("soft-deletes: deletedAt set, slug mangled", async () => {
    const table = await seedTable(companyA.id, adminUser.id, { slug: "to-delete" });

    setAuthToken(adminToken);
    const res = await DELETE_TABLE(
      buildGetRequest("/api/tables/" + table.id),
      makeParams(table.id)
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);

    const deleted = await prisma.tableMeta.findUnique({ where: { id: table.id } });
    expect(deleted!.deletedAt).not.toBeNull();
    expect(deleted!.slug).toMatch(/^to-delete_deleted_\d+$/);
  });

  it("mangled slug frees unique constraint (can re-create same slug)", async () => {
    const table = await seedTable(companyA.id, adminUser.id, { slug: "reusable" });

    setAuthToken(adminToken);
    await DELETE_TABLE(
      buildGetRequest("/api/tables/" + table.id),
      makeParams(table.id)
    );

    // Create new table with same slug
    const res = await POST_TABLE(
      buildJsonRequest("/api/tables", "POST", { name: "Reused", slug: "reusable" })
    );
    const body = await jsonBody(res);
    expect(res.status).toBe(200);
    expect(body.slug).toBe("reusable");

    const dbTable = await prisma.tableMeta.findUnique({ where: { id: body.id } });
    expect(dbTable!.slug).toBe("reusable");
    expect(dbTable!.name).toBe("Reused");
  });

  it("table with files on records → 400, table NOT soft-deleted", async () => {
    const table = await seedTable(companyA.id, adminUser.id, { slug: "has-files" });
    const record = await seedRecord(companyA.id, table.id, { name: "rec" });
    await seedFile(companyA.id, record.id);

    setAuthToken(adminToken);
    const res = await DELETE_TABLE(
      buildGetRequest("/api/tables/" + table.id),
      makeParams(table.id)
    );
    expect(res.status).toBe(400);

    const body = await jsonBody(res);
    // Hebrew error message
    expect(body.error).toContain("קבצים");

    // Verify table is NOT soft-deleted (transaction did not partially succeed)
    const dbTable = await prisma.tableMeta.findUnique({ where: { id: table.id } });
    expect(dbTable!.deletedAt).toBeNull();
  });

  it("table with records but NO files → 200, records survive", async () => {
    const table = await seedTable(companyA.id, adminUser.id, { slug: "records-no-files" });
    const record = await seedRecord(companyA.id, table.id, { name: "rec" });

    setAuthToken(adminToken);
    const res = await DELETE_TABLE(
      buildGetRequest("/api/tables/" + table.id),
      makeParams(table.id)
    );
    expect(res.status).toBe(200);

    // Verify records still exist in DB after soft-delete
    const recordCount = await prisma.record.count({ where: { tableId: table.id } });
    expect(recordCount).toBe(1);

    // Verify the table is soft-deleted
    const deleted = await prisma.tableMeta.findUnique({ where: { id: table.id } });
    expect(deleted!.deletedAt).not.toBeNull();
  });

  it("non-existent table → 404", async () => {
    setAuthToken(adminToken);
    const res = await DELETE_TABLE(
      buildGetRequest("/api/tables/999999"),
      makeParams(999999)
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(404);
    expect(body.error).toBe("Table not found");
  });

  it("already-deleted table → 404", async () => {
    const table = await seedTable(companyA.id, adminUser.id, {
      slug: "already-del",
      deletedAt: new Date(),
    });

    setAuthToken(adminToken);
    const res = await DELETE_TABLE(
      buildGetRequest("/api/tables/" + table.id),
      makeParams(table.id)
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(404);
    expect(body.error).toBe("Table not found");
  });

  it("different company table → 404", async () => {
    const otherTable = await seedTable(companyB.id, otherCompanyAdmin.id, {
      slug: "other-del",
    });

    setAuthToken(adminToken);
    const res = await DELETE_TABLE(
      buildGetRequest("/api/tables/" + otherTable.id),
      makeParams(otherTable.id)
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(404);
    expect(body.error).toBe("Table not found");
  });

  it("invalid ID → 400", async () => {
    setAuthToken(adminToken);
    const res = await DELETE_TABLE(
      buildGetRequest("/api/tables/abc"),
      makeParams("abc")
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid table ID");
  });

  it("manager without canManageTables → 403 on DELETE", async () => {
    const table = await seedTable(companyA.id, adminUser.id, { slug: "manager-del-deny" });

    setAuthToken(managerToken);
    const res = await DELETE_TABLE(
      buildGetRequest("/api/tables/" + table.id),
      makeParams(table.id)
    );

    expect(res.status).toBe(403);

    // Verify table is NOT deleted
    const dbTable = await prisma.tableMeta.findUnique({ where: { id: table.id } });
    expect(dbTable!.deletedAt).toBeNull();
  });

  it("basicUserWithManage can DELETE → 200 with DB verify", async () => {
    const table = await seedTable(companyA.id, adminUser.id, { slug: "basic-manage-del" });

    setAuthToken(basicManageToken);
    const res = await DELETE_TABLE(
      buildGetRequest("/api/tables/" + table.id),
      makeParams(table.id)
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);

    const dbTable = await prisma.tableMeta.findUnique({ where: { id: table.id } });
    expect(dbTable!.deletedAt).not.toBeNull();
    expect(dbTable!.slug).toMatch(/^basic-manage-del_deleted_\d+$/);
  });

  it("deleted table excluded from GET /tables list", async () => {
    const table = await seedTable(companyA.id, adminUser.id, { slug: "del-from-list" });

    setAuthToken(adminToken);
    await DELETE_TABLE(
      buildGetRequest("/api/tables/" + table.id),
      makeParams(table.id)
    );

    const listRes = await GET_TABLES(buildGetRequest("/api/tables"));
    const listBody = await jsonBody(listRes);
    const ids = listBody.data.map((t: any) => t.id);
    expect(ids).not.toContain(table.id);
  });

  it("deleted table returns 404 on GET /tables/:id", async () => {
    const table = await seedTable(companyA.id, adminUser.id, { slug: "del-get-404" });

    setAuthToken(adminToken);
    await DELETE_TABLE(
      buildGetRequest("/api/tables/" + table.id),
      makeParams(table.id)
    );

    const res = await GET_TABLE_BY_ID(
      buildGetRequest("/api/tables/" + table.id),
      makeParams(table.id)
    );
    const body = await jsonBody(res);
    expect(res.status).toBe(404);
    expect(body.error).toBe("Table not found");
  });

  it("zero ID → 400", async () => {
    setAuthToken(adminToken);
    const res = await DELETE_TABLE(
      buildGetRequest("/api/tables/0"),
      makeParams("0")
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid table ID");
  });

  it("negative ID → 400", async () => {
    setAuthToken(adminToken);
    const res = await DELETE_TABLE(
      buildGetRequest("/api/tables/-5"),
      makeParams("-5")
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid table ID");
  });
});

// =====================================================================
// G. Edge Cases
// =====================================================================

describe("Edge Cases", () => {
  it("unicode in table name (Hebrew) stored correctly", async () => {
    setAuthToken(adminToken);
    const res = await POST_TABLE(
      buildJsonRequest("/api/tables", "POST", {
        name: "טבלה חדשה",
        slug: "hebrew-table",
      })
    );
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.name).toBe("טבלה חדשה");

    const dbTable = await prisma.tableMeta.findUnique({ where: { id: body.id } });
    expect(dbTable!.name).toBe("טבלה חדשה");
  });

  it("unicode in slug rejected by pattern", async () => {
    setAuthToken(adminToken);
    const res = await POST_TABLE(
      buildJsonRequest("/api/tables", "POST", {
        name: "Unicode Slug Table",
        slug: "טבלה",
      })
    );
    const body = await jsonBody(res);
    expect(res.status).toBe(400);
    expect(body.error).toContain("Slug must");
  });

  it("slug exactly 100 chars → 200", async () => {
    setAuthToken(adminToken);
    const slug = "a".repeat(100);
    const res = await POST_TABLE(
      buildJsonRequest("/api/tables", "POST", { name: "Max Slug Table", slug })
    );
    const body = await jsonBody(res);
    expect(res.status).toBe(200);

    const dbTable = await prisma.tableMeta.findUnique({ where: { id: body.id } });
    expect(dbTable).not.toBeNull();
    expect(dbTable!.slug).toBe(slug);
  });

  it("slug 101 chars → 400", async () => {
    setAuthToken(adminToken);
    const slug = "a".repeat(101);
    const res = await POST_TABLE(
      buildJsonRequest("/api/tables", "POST", { name: "Over Slug Table", slug })
    );
    const body = await jsonBody(res);
    expect(res.status).toBe(400);
    expect(body.error).toContain("100");
  });

  it("extra fields in body ignored on POST", async () => {
    setAuthToken(adminToken);
    const res = await POST_TABLE(
      buildJsonRequest("/api/tables", "POST", {
        name: "Extra Fields",
        slug: "extra-fields",
        nonExistentField: "should be ignored",
        anotherFake: 123,
      })
    );
    const body = await jsonBody(res);
    expect(res.status).toBe(200);
    expect(body).not.toHaveProperty("nonExistentField");
    expect(body).not.toHaveProperty("anotherFake");

    const dbTable = await prisma.tableMeta.findUnique({ where: { id: body.id } });
    expect(dbTable).not.toBeNull();
    expect(dbTable!.name).toBe("Extra Fields");
    expect(dbTable!.slug).toBe("extra-fields");
  });

  it("PATCH with empty body (no fields to update)", async () => {
    const table = await seedTable(companyA.id, adminUser.id, {
      slug: "noop-patch",
      name: "Original",
    });

    const dbBefore = await prisma.tableMeta.findUnique({ where: { id: table.id } });

    setAuthToken(adminToken);
    const res = await PATCH_TABLE(
      buildJsonRequest("/api/tables/" + table.id, "PATCH", {}),
      makeParams(table.id)
    );
    // Should succeed as a no-op (updateMany with empty data still works)
    expect(res.status).toBe(200);

    const body = await jsonBody(res);
    expect(body.name).toBe("Original");

    // Verify DB unchanged (except updatedAt which is always set)
    const dbAfter = await prisma.tableMeta.findUnique({ where: { id: table.id } });
    expect(dbAfter!.name).toBe(dbBefore!.name);
    expect(dbAfter!.slug).toBe(dbBefore!.slug);
    expect(dbAfter!.schemaJson).toEqual(dbBefore!.schemaJson);
  });

  it("concurrent duplicate slug: one succeeds, one gets 409", async () => {
    setAuthToken(adminToken);
    const [res1, res2] = await Promise.all([
      POST_TABLE(
        buildJsonRequest("/api/tables", "POST", { name: "Race1", slug: "race-slug" })
      ),
      POST_TABLE(
        buildJsonRequest("/api/tables", "POST", { name: "Race2", slug: "race-slug" })
      ),
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([200, 409]);
  });

  it("name exactly 200 chars → 200", async () => {
    setAuthToken(adminToken);
    const longName = "n".repeat(200);
    const res = await POST_TABLE(
      buildJsonRequest("/api/tables", "POST", {
        name: longName,
        slug: "name-200",
      })
    );
    const body = await jsonBody(res);
    expect(res.status).toBe(200);

    const dbTable = await prisma.tableMeta.findUnique({ where: { id: body.id } });
    expect(dbTable).not.toBeNull();
    expect(dbTable!.name).toBe(longName);
  });
});

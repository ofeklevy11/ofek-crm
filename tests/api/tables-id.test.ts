import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

/* ------------------------------------------------------------------ */
/*  Module mocks (hoisted by vitest)                                  */
/* ------------------------------------------------------------------ */

vi.mock("@/lib/permissions-server", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tableMeta: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    tableCategory: {
      findFirst: vi.fn(),
    },
    file: {
      count: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(null),
  RATE_LIMITS: {
    api: { prefix: "api", max: 120, windowSeconds: 60 },
    bulk: { prefix: "bulk", max: 5, windowSeconds: 60 },
  },
}));

/* ------------------------------------------------------------------ */
/*  Imports (receive mocked versions)                                 */
/* ------------------------------------------------------------------ */

import { GET, PATCH, DELETE } from "@/app/api/tables/[id]/route";
import { getCurrentUser } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const BASE_URL = "http://localhost/api/tables/1";

function makeParams(id = "1") {
  return { params: Promise.resolve({ id }) };
}

function patchReq(body: unknown) {
  return new Request(BASE_URL, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function deleteReq() {
  return new Request(BASE_URL, { method: "DELETE" });
}

/* ------------------------------------------------------------------ */
/*  User fixtures                                                     */
/* ------------------------------------------------------------------ */

const adminUser = {
  id: 1,
  companyId: 10,
  name: "Admin",
  email: "admin@test.com",
  role: "admin" as const,
  allowedWriteTableIds: [] as number[],
};

const managerUser = {
  id: 2,
  companyId: 10,
  name: "Manager",
  email: "manager@test.com",
  role: "manager" as const,
  allowedWriteTableIds: [] as number[],
};

const basicUserWithRead = {
  id: 3,
  companyId: 10,
  name: "BasicRead",
  email: "basic-read@test.com",
  role: "basic" as const,
  allowedWriteTableIds: [] as number[],
  tablePermissions: { "1": "read" as const },
};

const basicUserNoAccess = {
  id: 4,
  companyId: 10,
  name: "BasicNoAccess",
  email: "basic-none@test.com",
  role: "basic" as const,
  allowedWriteTableIds: [] as number[],
  tablePermissions: {} as Record<string, "read" | "write" | "none">,
};

const basicUserWithManageTables = {
  id: 5,
  companyId: 10,
  name: "BasicManage",
  email: "basic-manage@test.com",
  role: "basic" as const,
  allowedWriteTableIds: [] as number[],
  permissions: { canManageTables: true },
  tablePermissions: { "1": "read" as const },
};

/* ------------------------------------------------------------------ */
/*  Mock data                                                         */
/* ------------------------------------------------------------------ */

const mockTable = {
  id: 1,
  name: "Test Table",
  slug: "test-table",
  schemaJson: { fields: [] },
  tabsConfig: null,
  displayConfig: null,
  categoryId: null,
  order: 0,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
  _count: { records: 5 },
};

const mockUpdatedTable = {
  id: 1,
  name: "Updated Table",
  slug: "updated-slug",
  schemaJson: { fields: [] },
  tabsConfig: null,
  displayConfig: null,
  categoryId: null,
  order: 0,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-06-01"),
};

/* ------------------------------------------------------------------ */
/*  Global reset                                                      */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(checkRateLimit).mockResolvedValue(null);
});

/* ================================================================== */
/*  GET /api/tables/:id                                               */
/* ================================================================== */

describe("GET /api/tables/:id", () => {
  // ---- Auth ----
  it("should return 401 when user is not authenticated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await GET(new Request(BASE_URL), makeParams());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain("Unauthorized");
  });

  // ---- Rate Limit ----
  it("should return 429 when API rate limit is exceeded", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(checkRateLimit).mockResolvedValue(
      NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429 },
      ),
    );
    const res = await GET(new Request(BASE_URL), makeParams());
    expect(res.status).toBe(429);
  });

  it("should call checkRateLimit with user.id and RATE_LIMITS.api", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.tableMeta.findFirst).mockResolvedValue(mockTable as any);
    await GET(new Request(BASE_URL), makeParams());
    expect(checkRateLimit).toHaveBeenCalledWith(String(adminUser.id), RATE_LIMITS.api);
  });

  // ---- Validation ----
  describe("Validation", () => {
    beforeEach(() => {
      vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    });

    it("should return 400 when id is not a number", async () => {
      const res = await GET(new Request(BASE_URL), makeParams("abc"));
      expect(res.status).toBe(400);
    });

    it("should return 400 when id is zero", async () => {
      const res = await GET(new Request(BASE_URL), makeParams("0"));
      expect(res.status).toBe(400);
    });

    it("should return 400 when id is negative", async () => {
      const res = await GET(new Request(BASE_URL), makeParams("-1"));
      expect(res.status).toBe(400);
    });
  });

  // ---- Authorization ----
  describe("Authorization", () => {
    it("should return 403 when basic user has no table permission", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(basicUserNoAccess as any);
      const res = await GET(new Request(BASE_URL), makeParams());
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toMatch(/Forbidden/);
    });

    it('should return 403 when basic user has tablePermission "none"', async () => {
      const userWithNone = {
        ...basicUserNoAccess,
        tablePermissions: { "1": "none" as const },
      };
      vi.mocked(getCurrentUser).mockResolvedValue(userWithNone as any);
      const res = await GET(new Request(BASE_URL), makeParams());
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toMatch(/Forbidden/);
    });
  });

  // ---- Not Found ----
  describe("Not Found", () => {
    beforeEach(() => {
      vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    });

    it("should return 404 when table does not exist", async () => {
      vi.mocked(prisma.tableMeta.findFirst).mockResolvedValue(null as any);
      const res = await GET(new Request(BASE_URL), makeParams());
      expect(res.status).toBe(404);
    });

    it("should return 404 when table is soft-deleted", async () => {
      // Soft-deleted tables have deletedAt set; query filters deletedAt:null → no match
      vi.mocked(prisma.tableMeta.findFirst).mockResolvedValue(null as any);
      const res = await GET(new Request(BASE_URL), makeParams());
      expect(res.status).toBe(404);
    });
  });

  // ---- Tenancy ----
  describe("Tenancy", () => {
    beforeEach(() => {
      vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    });

    it("should return 404 when table belongs to different company", async () => {
      // companyId mismatch causes findFirst to return null
      vi.mocked(prisma.tableMeta.findFirst).mockResolvedValue(null as any);
      const res = await GET(new Request(BASE_URL), makeParams());
      expect(res.status).toBe(404);
    });

    it("should pass companyId and deletedAt:null in Prisma query", async () => {
      vi.mocked(prisma.tableMeta.findFirst).mockResolvedValue(mockTable as any);
      await GET(new Request(BASE_URL), makeParams());

      expect(prisma.tableMeta.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 1,
            companyId: 10,
            deletedAt: null,
          }),
        }),
      );
    });

    it("should request _count.records in select clause", async () => {
      vi.mocked(prisma.tableMeta.findFirst).mockResolvedValue(mockTable as any);
      await GET(new Request(BASE_URL), makeParams());

      expect(prisma.tableMeta.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({
            _count: { select: { records: true } },
          }),
        }),
      );
    });
  });

  // ---- Happy path ----
  describe("Happy path", () => {
    beforeEach(() => {
      vi.mocked(prisma.tableMeta.findFirst).mockResolvedValue(mockTable as any);
    });

    it("should return 200 with table data for admin", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
      const res = await GET(new Request(BASE_URL), makeParams());
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe(1);
      expect(body.name).toBe("Test Table");
    });

    it("should return 200 with table data for manager", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(managerUser as any);
      const res = await GET(new Request(BASE_URL), makeParams());
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe(1);
    });

    it('should return 200 for basic user with "read" permission', async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(basicUserWithRead as any);
      const res = await GET(new Request(BASE_URL), makeParams());
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe(1);
    });

    it('should return 200 for basic user with "write" permission', async () => {
      const basicUserWithWrite = {
        ...basicUserWithRead,
        tablePermissions: { "1": "write" as const },
      };
      vi.mocked(getCurrentUser).mockResolvedValue(basicUserWithWrite as any);
      const res = await GET(new Request(BASE_URL), makeParams());
      expect(res.status).toBe(200);
    });

    it("should include _count.records in response", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
      const res = await GET(new Request(BASE_URL), makeParams());
      const body = await res.json();
      expect(body._count).toEqual({ records: 5 });
    });
  });

  // ---- Error ----
  it("should return 500 when Prisma throws an unexpected error", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.tableMeta.findFirst).mockRejectedValue(new Error("DB down"));
    const res = await GET(new Request(BASE_URL), makeParams());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/Failed to/);
  });
});

/* ================================================================== */
/*  PATCH /api/tables/:id                                             */
/* ================================================================== */

describe("PATCH /api/tables/:id", () => {
  // ---- Auth ----
  it("should return 401 when user is not authenticated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await PATCH(patchReq({ name: "X" }), makeParams());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain("Unauthorized");
  });

  // ---- AuthZ ----
  describe("Authorization", () => {
    it("should return 403 for basic user without canManageTables", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(basicUserNoAccess as any);
      const res = await PATCH(patchReq({ name: "X" }), makeParams());
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toMatch(/Forbidden/);
    });

    it("should return 403 for manager without canManageTables", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(managerUser as any);
      const res = await PATCH(patchReq({ name: "X" }), makeParams());
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toMatch(/Forbidden/);
    });
  });

  // ---- Rate Limit ----
  it("should return 429 when bulk rate limit is exceeded", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(checkRateLimit).mockResolvedValue(
      NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429 },
      ),
    );
    const res = await PATCH(patchReq({ name: "X" }), makeParams());
    expect(res.status).toBe(429);
  });

  it("should call checkRateLimit with user.id and RATE_LIMITS.bulk", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.tableMeta.updateMany).mockResolvedValue({ count: 1 } as any);
    vi.mocked(prisma.tableMeta.findFirst).mockResolvedValue(mockUpdatedTable as any);
    await PATCH(patchReq({ name: "X" }), makeParams());
    expect(checkRateLimit).toHaveBeenCalledWith(String(adminUser.id), RATE_LIMITS.bulk);
  });

  // ---- Validation ----
  describe("Validation", () => {
    beforeEach(() => {
      vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    });

    // -- ID --
    it("should return 400 when id is not a number", async () => {
      const res = await PATCH(patchReq({ name: "X" }), makeParams("abc"));
      expect(res.status).toBe(400);
    });

    it("should return 400 when id is zero", async () => {
      const res = await PATCH(patchReq({ name: "X" }), makeParams("0"));
      expect(res.status).toBe(400);
    });

    it("should return 400 when id is negative", async () => {
      const res = await PATCH(patchReq({ name: "X" }), makeParams("-5"));
      expect(res.status).toBe(400);
    });

    // -- JSON --
    it("should return 400 when body is not valid JSON", async () => {
      const req = new Request(BASE_URL, {
        method: "PATCH",
        body: "not json",
        headers: { "Content-Type": "application/json" },
      });
      const res = await PATCH(req, makeParams());
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/Invalid JSON/i);
    });

    // -- Name --
    it("should return 400 when name is empty string", async () => {
      const res = await PATCH(patchReq({ name: "" }), makeParams());
      expect(res.status).toBe(400);
    });

    it("should return 400 when name exceeds 200 chars", async () => {
      const res = await PATCH(patchReq({ name: "x".repeat(201) }), makeParams());
      expect(res.status).toBe(400);
    });

    it("should return 400 when name is not a string", async () => {
      const res = await PATCH(patchReq({ name: 123 }), makeParams());
      expect(res.status).toBe(400);
    });

    // -- Slug --
    it("should return 400 when slug is empty string", async () => {
      const res = await PATCH(patchReq({ slug: "" }), makeParams());
      expect(res.status).toBe(400);
    });

    it("should return 400 when slug exceeds 100 chars", async () => {
      const res = await PATCH(patchReq({ slug: "a".repeat(101) }), makeParams());
      expect(res.status).toBe(400);
    });

    it("should return 400 when slug is not a string", async () => {
      const res = await PATCH(patchReq({ slug: 42 }), makeParams());
      expect(res.status).toBe(400);
    });

    it("should return 400 when slug starts with hyphen", async () => {
      const res = await PATCH(patchReq({ slug: "-test" }), makeParams());
      expect(res.status).toBe(400);
    });

    it("should return 400 when slug starts with underscore", async () => {
      const res = await PATCH(patchReq({ slug: "_test" }), makeParams());
      expect(res.status).toBe(400);
    });

    it("should return 400 when slug contains uppercase", async () => {
      const res = await PATCH(patchReq({ slug: "Test" }), makeParams());
      expect(res.status).toBe(400);
    });

    it("should return 400 when slug contains spaces", async () => {
      const res = await PATCH(patchReq({ slug: "test slug" }), makeParams());
      expect(res.status).toBe(400);
    });

    it("should return 400 when slug has special chars", async () => {
      const res = await PATCH(patchReq({ slug: "test@slug!" }), makeParams());
      expect(res.status).toBe(400);
    });

    // -- SchemaJson --
    it("should return 400 when schemaJson is null", async () => {
      const res = await PATCH(patchReq({ schemaJson: null }), makeParams());
      expect(res.status).toBe(400);
    });

    it("should return 400 when schemaJson is a string", async () => {
      const res = await PATCH(patchReq({ schemaJson: "bad" }), makeParams());
      expect(res.status).toBe(400);
    });

    it("should return 400 when schemaJson is a number", async () => {
      const res = await PATCH(patchReq({ schemaJson: 42 }), makeParams());
      expect(res.status).toBe(400);
    });

    it("should return 400 when schemaJson exceeds 200KB", async () => {
      const bigSchema = { data: "x".repeat(200_001) };
      const res = await PATCH(patchReq({ schemaJson: bigSchema }), makeParams());
      expect(res.status).toBe(400);
    });

    // -- tabsConfig --
    it("should return 400 when tabsConfig is not an object", async () => {
      const res = await PATCH(patchReq({ tabsConfig: "bad" }), makeParams());
      expect(res.status).toBe(400);
    });

    it("should return 400 when tabsConfig exceeds 10KB", async () => {
      const bigTabs = { data: "x".repeat(10_001) };
      const res = await PATCH(patchReq({ tabsConfig: bigTabs }), makeParams());
      expect(res.status).toBe(400);
    });

    // -- displayConfig --
    it("should return 400 when displayConfig is not an object", async () => {
      const res = await PATCH(patchReq({ displayConfig: 999 }), makeParams());
      expect(res.status).toBe(400);
    });

    it("should return 400 when displayConfig exceeds 5KB", async () => {
      const bigDisplay = { data: "x".repeat(5_001) };
      const res = await PATCH(patchReq({ displayConfig: bigDisplay }), makeParams());
      expect(res.status).toBe(400);
    });

    // -- updatedAt --
    it("should return 400 when updatedAt is not a valid date", async () => {
      const res = await PATCH(patchReq({ updatedAt: "not-a-date" }), makeParams());
      expect(res.status).toBe(400);
    });

    it("should return 400 when updatedAt is a number", async () => {
      const res = await PATCH(patchReq({ updatedAt: 12345 }), makeParams());
      expect(res.status).toBe(400);
    });

    // -- categoryId --
    it("should return 400 when categoryId is not finite", async () => {
      const res = await PATCH(patchReq({ categoryId: "abc" }), makeParams());
      expect(res.status).toBe(400);
    });

    it("should return 400 when categoryId is zero", async () => {
      const res = await PATCH(patchReq({ categoryId: 0 }), makeParams());
      expect(res.status).toBe(400);
    });

    it("should return 400 when categoryId is negative", async () => {
      const res = await PATCH(patchReq({ categoryId: -1 }), makeParams());
      expect(res.status).toBe(400);
    });

    it("should return 400 when category does not exist", async () => {
      vi.mocked(prisma.tableCategory.findFirst).mockResolvedValue(null as any);
      const res = await PATCH(patchReq({ categoryId: 99 }), makeParams());
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/Category not found/i);
    });

    it("should return 400 when category is in different company", async () => {
      // Category exists but companyId filter excludes it → null
      vi.mocked(prisma.tableCategory.findFirst).mockResolvedValue(null as any);
      const res = await PATCH(patchReq({ categoryId: 99 }), makeParams());
      expect(res.status).toBe(400);
    });
  });

  // ---- Not Found ----
  describe("Not Found", () => {
    beforeEach(() => {
      vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    });

    it("should return 404 when table does not exist (no updatedAt)", async () => {
      vi.mocked(prisma.tableMeta.updateMany).mockResolvedValue({ count: 0 } as any);
      const res = await PATCH(patchReq({ name: "X" }), makeParams());
      expect(res.status).toBe(404);
    });

    it("should return 404 when table is soft-deleted", async () => {
      vi.mocked(prisma.tableMeta.updateMany).mockResolvedValue({ count: 0 } as any);
      const res = await PATCH(patchReq({ name: "X" }), makeParams());
      expect(res.status).toBe(404);
    });
  });

  // ---- Concurrency ----
  describe("Concurrency", () => {
    beforeEach(() => {
      vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    });

    it("should return 409 when updatedAt doesn't match (concurrent edit)", async () => {
      vi.mocked(prisma.tableMeta.updateMany).mockResolvedValue({ count: 0 } as any);
      // Table exists but was modified by another user
      vi.mocked(prisma.tableMeta.findFirst).mockResolvedValue({ id: 1 } as any);

      const res = await PATCH(
        patchReq({ name: "X", updatedAt: "2024-01-01T00:00:00.000Z" }),
        makeParams(),
      );
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toMatch(/Conflict/);
    });

    it("should return 404 when updatedAt given but table doesn't exist", async () => {
      vi.mocked(prisma.tableMeta.updateMany).mockResolvedValue({ count: 0 } as any);
      vi.mocked(prisma.tableMeta.findFirst).mockResolvedValue(null as any);

      const res = await PATCH(
        patchReq({ name: "X", updatedAt: "2024-01-01T00:00:00.000Z" }),
        makeParams(),
      );
      expect(res.status).toBe(404);
    });

    it("should scope concurrency existence check to companyId and deletedAt:null", async () => {
      vi.mocked(prisma.tableMeta.updateMany).mockResolvedValue({ count: 0 } as any);
      vi.mocked(prisma.tableMeta.findFirst).mockResolvedValue({ id: 1 } as any);

      await PATCH(
        patchReq({ name: "X", updatedAt: "2024-01-01T00:00:00.000Z" }),
        makeParams(),
      );

      // findFirst is called for conflict detection when count=0 + updatedAt given
      expect(prisma.tableMeta.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 1,
            companyId: 10,
            deletedAt: null,
          }),
          select: { id: true },
        }),
      );
    });
  });

  // ---- Duplicate ----
  it("should return 409 with Hebrew error on P2002", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.tableMeta.updateMany).mockRejectedValue(
      Object.assign(new Error("Unique"), { code: "P2002" }),
    );
    const res = await PATCH(patchReq({ slug: "dup-slug" }), makeParams());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("כבר קיים");
  });

  // ---- Tenancy ----
  describe("Tenancy", () => {
    beforeEach(() => {
      vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
      vi.mocked(prisma.tableMeta.updateMany).mockResolvedValue({ count: 1 } as any);
      vi.mocked(prisma.tableMeta.findFirst).mockResolvedValue(mockUpdatedTable as any);
    });

    it("should include companyId in updateMany where", async () => {
      await PATCH(patchReq({ name: "X" }), makeParams());

      expect(prisma.tableMeta.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId: 10,
          }),
        }),
      );
    });

    it("should include deletedAt:null in updateMany where", async () => {
      await PATCH(patchReq({ name: "X" }), makeParams());
      expect(prisma.tableMeta.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletedAt: null }),
        }),
      );
    });

    it("should include companyId and deletedAt:null in re-fetch query", async () => {
      await PATCH(patchReq({ name: "X" }), makeParams());
      // findFirst is called once after updateMany to re-fetch the updated record
      const findFirstCalls = vi.mocked(prisma.tableMeta.findFirst).mock.calls;
      const refetchCall = findFirstCalls[findFirstCalls.length - 1][0] as any;
      expect(refetchCall.where).toEqual(
        expect.objectContaining({
          id: 1,
          companyId: 10,
          deletedAt: null,
        }),
      );
    });

    it("should include companyId when validating categoryId", async () => {
      vi.mocked(prisma.tableCategory.findFirst).mockResolvedValue({ id: 5 } as any);
      await PATCH(patchReq({ categoryId: 5 }), makeParams());

      expect(prisma.tableCategory.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId: 10,
          }),
        }),
      );
    });
  });

  // ---- Happy path ----
  describe("Happy path", () => {
    beforeEach(() => {
      vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
      vi.mocked(prisma.tableMeta.updateMany).mockResolvedValue({ count: 1 } as any);
      vi.mocked(prisma.tableMeta.findFirst).mockResolvedValue(mockUpdatedTable as any);
    });

    it("should return 200 when admin updates name only", async () => {
      const res = await PATCH(patchReq({ name: "New Name" }), makeParams());
      expect(res.status).toBe(200);
      expect(prisma.tableMeta.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: "New Name" }),
        }),
      );
    });

    it("should return 200 when admin updates slug only", async () => {
      const res = await PATCH(patchReq({ slug: "new-slug" }), makeParams());
      expect(res.status).toBe(200);
      expect(prisma.tableMeta.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ slug: "new-slug" }),
        }),
      );
    });

    it("should return 200 when updating schemaJson", async () => {
      const schema = { fields: [{ name: "f1" }] };
      const res = await PATCH(patchReq({ schemaJson: schema }), makeParams());
      expect(res.status).toBe(200);
      expect(prisma.tableMeta.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ schemaJson: schema }),
        }),
      );
    });

    it("should return 200 for basic user with canManageTables flag", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(basicUserWithManageTables as any);
      const res = await PATCH(patchReq({ name: "X" }), makeParams());
      expect(res.status).toBe(200);
    });

    it("should return 200 when updating tabsConfig", async () => {
      const tabs = { tabs: [] };
      const res = await PATCH(patchReq({ tabsConfig: tabs }), makeParams());
      expect(res.status).toBe(200);
      expect(prisma.tableMeta.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tabsConfig: tabs }),
        }),
      );
    });

    it("should return 200 when updating displayConfig", async () => {
      const display = { layout: "grid" };
      const res = await PATCH(patchReq({ displayConfig: display }), makeParams());
      expect(res.status).toBe(200);
      expect(prisma.tableMeta.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ displayConfig: display }),
        }),
      );
    });

    it("should return 200 when setting tabsConfig to null", async () => {
      const res = await PATCH(patchReq({ tabsConfig: null }), makeParams());
      expect(res.status).toBe(200);

      expect(prisma.tableMeta.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tabsConfig: null }),
        }),
      );
    });

    it("should return 200 when setting displayConfig to null", async () => {
      const res = await PATCH(patchReq({ displayConfig: null }), makeParams());
      expect(res.status).toBe(200);

      expect(prisma.tableMeta.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ displayConfig: null }),
        }),
      );
    });

    it("should return 200 when updating categoryId", async () => {
      vi.mocked(prisma.tableCategory.findFirst).mockResolvedValue({ id: 5 } as any);
      const res = await PATCH(patchReq({ categoryId: 5 }), makeParams());
      expect(res.status).toBe(200);

      expect(prisma.tableMeta.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ categoryId: 5 }),
        }),
      );
    });

    it("should return 200 when setting categoryId to null", async () => {
      const res = await PATCH(patchReq({ categoryId: null }), makeParams());
      expect(res.status).toBe(200);

      expect(prisma.tableMeta.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ categoryId: null }),
        }),
      );
    });

    // Slug trimming is not meaningfully testable: SLUG_PATTERN rejects whitespace,
    // so only name can have trimmable whitespace in practice.
    it("should trim name before saving", async () => {
      await PATCH(patchReq({ name: "  Test Name  ", slug: "test-slug" }), makeParams());

      expect(prisma.tableMeta.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: "Test Name",
            slug: "test-slug",
          }),
        }),
      );
    });

    it("should set updatedAt to new Date in update data", async () => {
      const before = Date.now();
      await PATCH(patchReq({ name: "X" }), makeParams());
      const after = Date.now();

      const call = vi.mocked(prisma.tableMeta.updateMany).mock.calls[0][0] as any;
      const ts = call.data.updatedAt as Date;
      expect(ts).toBeInstanceOf(Date);
      expect(ts.getTime()).toBeGreaterThanOrEqual(before);
      expect(ts.getTime()).toBeLessThanOrEqual(after);
    });

    it("should return full updated record", async () => {
      const res = await PATCH(patchReq({ name: "X" }), makeParams());
      const body = await res.json();
      expect(body.id).toBe(mockUpdatedTable.id);
      expect(body.name).toBe(mockUpdatedTable.name);
      expect(body.slug).toBe(mockUpdatedTable.slug);
    });

    it("should return 200 when updating multiple fields", async () => {
      vi.mocked(prisma.tableCategory.findFirst).mockResolvedValue({ id: 2 } as any);
      const res = await PATCH(
        patchReq({
          name: "Multi",
          slug: "multi",
          schemaJson: { fields: [] },
          categoryId: 2,
        }),
        makeParams(),
      );
      expect(res.status).toBe(200);
    });

    it("should handle empty body {} by setting only updatedAt", async () => {
      const before = Date.now();
      const res = await PATCH(patchReq({}), makeParams());
      const after = Date.now();
      expect(res.status).toBe(200);

      const call = vi.mocked(prisma.tableMeta.updateMany).mock.calls[0][0] as any;
      // All 6 spread fields should be absent — only updatedAt remains
      expect(call.data).not.toHaveProperty("name");
      expect(call.data).not.toHaveProperty("slug");
      expect(call.data).not.toHaveProperty("schemaJson");
      expect(call.data).not.toHaveProperty("tabsConfig");
      expect(call.data).not.toHaveProperty("displayConfig");
      expect(call.data).not.toHaveProperty("categoryId");
      expect(call.data.updatedAt).toBeInstanceOf(Date);
      expect(call.data.updatedAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(call.data.updatedAt.getTime()).toBeLessThanOrEqual(after);
    });

    it("should accept name at exactly 200 characters", async () => {
      const name200 = "x".repeat(200);
      const res = await PATCH(patchReq({ name: name200 }), makeParams());
      expect(res.status).toBe(200);
      expect(prisma.tableMeta.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: name200 }),
        }),
      );
    });

    it("should accept slug at exactly 100 characters", async () => {
      const slug100 = "a".repeat(100);
      const res = await PATCH(patchReq({ slug: slug100 }), makeParams());
      expect(res.status).toBe(200);
      expect(prisma.tableMeta.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ slug: slug100 }),
        }),
      );
    });

    it("should accept schemaJson as array (typeof [] === 'object')", async () => {
      // Documents current behavior: arrays pass the typeof check
      const schema = [{ field: "test" }];
      const res = await PATCH(patchReq({ schemaJson: schema }), makeParams());
      expect(res.status).toBe(200);
      expect(prisma.tableMeta.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ schemaJson: schema }),
        }),
      );
    });

    it("should pass whitespace-only name through validation (documents potential bug)", async () => {
      // "   " has length > 0, passes validation, but name.trim() → "" is stored
      const res = await PATCH(patchReq({ name: "   " }), makeParams());
      expect(res.status).toBe(200);
      expect(prisma.tableMeta.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: "" }),
        }),
      );
    });

    it("should include schemaJson in updateMany data when sent as empty object {}", async () => {
      // {} is truthy, so `schemaJson && { schemaJson }` spreads it into data.
      // If someone changes the guard to `!== undefined`, this test catches the regression.
      const res = await PATCH(patchReq({ schemaJson: {} }), makeParams());
      expect(res.status).toBe(200);
      const call = vi.mocked(prisma.tableMeta.updateMany).mock.calls[0][0] as any;
      expect(call.data).toHaveProperty("schemaJson");
      expect(call.data.schemaJson).toEqual({});
    });

    it("should NOT include name/slug/schemaJson in data when not sent", async () => {
      // Only tabsConfig is sent; truthy-check guards should exclude name/slug/schemaJson
      const res = await PATCH(patchReq({ tabsConfig: { tabs: [] } }), makeParams());
      expect(res.status).toBe(200);
      const call = vi.mocked(prisma.tableMeta.updateMany).mock.calls[0][0] as any;
      expect(call.data).not.toHaveProperty("name");
      expect(call.data).not.toHaveProperty("slug");
      expect(call.data).not.toHaveProperty("schemaJson");
      expect(call.data).not.toHaveProperty("categoryId");
      expect(call.data).not.toHaveProperty("displayConfig");
      // tabsConfig should be present (uses !== undefined guard)
      expect(call.data).toHaveProperty("tabsConfig");
    });

    it("should return 200 when updatedAt matches (no conflict)", async () => {
      const res = await PATCH(
        patchReq({ name: "X", updatedAt: "2024-01-01T00:00:00.000Z" }),
        makeParams(),
      );
      expect(res.status).toBe(200);

      expect(prisma.tableMeta.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            updatedAt: new Date("2024-01-01T00:00:00.000Z"),
          }),
        }),
      );
    });
  });

  // ---- Error ----
  it("should return 500 when Prisma throws unexpected error", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.tableMeta.updateMany).mockRejectedValue(new Error("DB crash"));
    const res = await PATCH(patchReq({ name: "X" }), makeParams());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/Failed to/);
  });
});

/* ================================================================== */
/*  DELETE /api/tables/:id                                            */
/* ================================================================== */

describe("DELETE /api/tables/:id", () => {
  /** Helper to set up a transaction proxy and wire it into the mock */
  function setupTx(overrides?: {
    findFirst?: any;
    fileCount?: number;
    updateError?: Error;
  }) {
    const txFindFirst = vi.fn().mockResolvedValue(
      overrides?.findFirst !== undefined
        ? overrides.findFirst
        : { id: 1, companyId: 10, slug: "test-table" },
    );
    const txUpdate = overrides?.updateError
      ? vi.fn().mockRejectedValue(overrides.updateError)
      : vi.fn().mockResolvedValue({});
    const txFileCount = vi.fn().mockResolvedValue(overrides?.fileCount ?? 0);

    const txProxy = {
      tableMeta: { findFirst: txFindFirst, update: txUpdate },
      file: { count: txFileCount },
    };

    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) =>
      fn(txProxy),
    );

    return txProxy;
  }

  // ---- Auth ----
  it("should return 401 when user is not authenticated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await DELETE(deleteReq(), makeParams());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain("Unauthorized");
  });

  // ---- AuthZ ----
  describe("Authorization", () => {
    it("should return 403 for basic user without canManageTables", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(basicUserNoAccess as any);
      const res = await DELETE(deleteReq(), makeParams());
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toMatch(/Forbidden/);
    });

    it("should return 403 for manager without canManageTables", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(managerUser as any);
      const res = await DELETE(deleteReq(), makeParams());
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toMatch(/Forbidden/);
    });
  });

  // ---- Rate Limit ----
  it("should return 429 when bulk rate limit is exceeded", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(checkRateLimit).mockResolvedValue(
      NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429 },
      ),
    );
    const res = await DELETE(deleteReq(), makeParams());
    expect(res.status).toBe(429);
  });

  it("should call checkRateLimit with user.id and RATE_LIMITS.bulk", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    setupTx();
    await DELETE(deleteReq(), makeParams());
    expect(checkRateLimit).toHaveBeenCalledWith(String(adminUser.id), RATE_LIMITS.bulk);
  });

  // ---- Validation ----
  describe("Validation", () => {
    beforeEach(() => {
      vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    });

    it("should return 400 when id is not a number", async () => {
      const res = await DELETE(deleteReq(), makeParams("abc"));
      expect(res.status).toBe(400);
    });

    it("should return 400 when id is zero", async () => {
      const res = await DELETE(deleteReq(), makeParams("0"));
      expect(res.status).toBe(400);
    });

    it("should return 400 when id is negative", async () => {
      const res = await DELETE(deleteReq(), makeParams("-3"));
      expect(res.status).toBe(400);
    });
  });

  // ---- Not Found ----
  describe("Not Found", () => {
    beforeEach(() => {
      vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    });

    it("should return 404 when table does not exist", async () => {
      setupTx({ findFirst: null });
      const res = await DELETE(deleteReq(), makeParams());
      expect(res.status).toBe(404);
    });

    it("should return 404 when table is already soft-deleted", async () => {
      // deletedAt filter causes findFirst to return null
      setupTx({ findFirst: null });
      const res = await DELETE(deleteReq(), makeParams());
      expect(res.status).toBe(404);
    });
  });

  // ---- Tenancy ----
  describe("Tenancy", () => {
    beforeEach(() => {
      vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    });

    it("should return 404 when table belongs to different company", async () => {
      setupTx({ findFirst: null });
      const res = await DELETE(deleteReq(), makeParams());
      expect(res.status).toBe(404);
    });

    it("should select slug in tx.findFirst for slug mangling", async () => {
      const tx = setupTx();
      await DELETE(deleteReq(), makeParams());
      expect(tx.tableMeta.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({ slug: true }),
        }),
      );
    });

    it("should include companyId/deletedAt:null in transaction query", async () => {
      const tx = setupTx();
      await DELETE(deleteReq(), makeParams());

      expect(tx.tableMeta.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId: 10,
            deletedAt: null,
          }),
        }),
      );
    });
  });

  // ---- Edge cases ----
  describe("Edge cases", () => {
    beforeEach(() => {
      vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    });

    it("should check file count with correct tableId and companyId", async () => {
      const tx = setupTx();
      await DELETE(deleteReq(), makeParams());

      expect(tx.file.count).toHaveBeenCalledWith({
        where: {
          record: {
            tableId: 1,
            companyId: 10,
          },
        },
      });
    });

    it("should return 400 with Hebrew error when table has files", async () => {
      setupTx({ fileCount: 3 });
      const res = await DELETE(deleteReq(), makeParams());
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("קבצים");
    });

    it("should return 400 with Hebrew error on P2003 FK violation", async () => {
      vi.mocked(prisma.$transaction).mockRejectedValue(
        Object.assign(new Error("FK"), { code: "P2003" }),
      );
      const res = await DELETE(deleteReq(), makeParams());
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("לא ניתן למחוק");
    });
  });

  // ---- Happy path ----
  describe("Happy path", () => {
    beforeEach(() => {
      vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    });

    it("should return 200 with success:true for admin", async () => {
      setupTx();
      const res = await DELETE(deleteReq(), makeParams());
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it("should return 200 for basic user with canManageTables flag", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(basicUserWithManageTables as any);
      setupTx();
      const res = await DELETE(deleteReq(), makeParams());
      expect(res.status).toBe(200);
    });

    it("should soft-delete by setting deletedAt and mangling slug", async () => {
      const tx = setupTx();
      await DELETE(deleteReq(), makeParams());

      expect(tx.tableMeta.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            deletedAt: expect.any(Date),
            slug: expect.stringContaining("_deleted_"),
          }),
        }),
      );
    });

    it("should run all operations inside a single transaction", async () => {
      setupTx();
      await DELETE(deleteReq(), makeParams());
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it("should pass maxWait and timeout options to $transaction", async () => {
      setupTx();
      await DELETE(deleteReq(), makeParams());

      expect(prisma.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        { maxWait: 5000, timeout: 60000 },
      );
    });

    it("should call tx.tableMeta.update with correct where clause (id + companyId)", async () => {
      const tx = setupTx();
      await DELETE(deleteReq(), makeParams());

      expect(tx.tableMeta.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 1,
            companyId: 10,
          },
        }),
      );
    });

    it('should mangle slug to "{slug}_deleted_{timestamp}"', async () => {
      const NOW = 1700000000000;
      const dateSpy = vi.spyOn(Date, "now").mockReturnValue(NOW);

      try {
        const tx = setupTx();
        await DELETE(deleteReq(), makeParams());

        expect(tx.tableMeta.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              slug: `test-table_deleted_${NOW}`,
            }),
          }),
        );
      } finally {
        dateSpy.mockRestore();
      }
    });
  });

  // ---- Error ----
  it("should return 500 when Prisma throws unexpected error", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.$transaction).mockRejectedValue(new Error("DB crash"));
    const res = await DELETE(deleteReq(), makeParams());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/Failed to/);
  });
});

/**
 * Integration tests for product/service server actions.
 *
 * REAL: Prisma (test DB), auth token signing/verification, permission checks
 *       (getCurrentUser, hasUserFlag), Zod validation, withRetry, rate-limit
 *       logic (checkActionRateLimit + RATE_LIMITS), product-validation schemas.
 * MOCKED: next/headers, react cache, @/lib/redis, @/lib/session,
 *         @/lib/security/audit-security, next/cache.
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";

// ── Module mocks (hoisted by Vitest) ───────────────────────────────

// 1. React cache → passthrough
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return { ...actual, cache: (fn: any) => fn };
});

// 2. next/headers → mocked cookies() + headers()
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
  headers: vi.fn(async () => ({
    get: (name: string) => {
      if (name === "x-nonce") return "test-nonce";
      return null;
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

// 4. Session → no-op
vi.mock("@/lib/session", () => ({
  isTokenIssuedAtValid: vi.fn().mockResolvedValue(true),
}));

// 5. Security audit → no-op
vi.mock("@/lib/security/audit-security", () => ({
  logSecurityEvent: vi.fn(),
}));

// 6. next/cache → no-op
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// ── Imports (AFTER mocks) ──────────────────────────────────────────
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { resetDb } from "@/test-utils/resetDb";
import {
  setAuthToken as _setAuthToken,
  signTokenForUser,
  seedCompany,
  seedUser,
} from "@/tests/integration/helpers/integration-setup";

function setAuthToken(token: string | null) {
  _mockAuthToken = token;
  _setAuthToken(token);
}

import {
  getProducts,
  getProductsForDropdown,
  createProduct,
  updateProduct,
} from "@/app/actions/products";

import { revalidatePath } from "next/cache";

// ── Safety-restore originals (used in afterEach) ────────────────────
const _originalRedisMulti = redis.multi;
const _originalProductUpdate = prisma.product.update;
const _originalTransaction = prisma.$transaction.bind(prisma);
const _originalProductFindMany = prisma.product.findMany;

// ── Helpers ─────────────────────────────────────────────────────────

async function seedProduct(companyId: number, overrides: Record<string, unknown> = {}) {
  return prisma.product.create({
    data: {
      companyId,
      name: (overrides.name as string) ?? "Seeded Product",
      type: (overrides.type as any) ?? "SERVICE",
      price: (overrides.price as number) ?? 100,
      description: overrides.description as string | undefined,
      sku: overrides.sku as string | undefined,
      cost: overrides.cost as number | undefined,
      isActive: overrides.isActive !== undefined ? (overrides.isActive as boolean) : true,
    },
  });
}

/** Run fn with redis.multi mocked to return high counter (rate-limited). */
async function withRateLimitMock<T>(fn: () => Promise<T>): Promise<T> {
  const originalMulti = redis.multi;
  redis.multi = vi.fn(() => ({
    incr: vi.fn().mockReturnThis(),
    expire: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([[null, 999]]),
  })) as any;
  try {
    return await fn();
  } finally {
    redis.multi = originalMulti;
  }
}

/** Run fn with redis.multi mocked to reject (Redis down). */
async function withRedisFailureMock<T>(fn: () => Promise<T>): Promise<T> {
  const originalMulti = redis.multi;
  redis.multi = vi.fn(() => ({
    incr: vi.fn().mockReturnThis(),
    expire: vi.fn().mockReturnThis(),
    exec: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
  })) as any;
  try {
    return await fn();
  } finally {
    redis.multi = originalMulti;
  }
}

/** Expected keys for getProducts responses */
const PRODUCT_RESPONSE_KEYS = [
  "cost", "description", "id", "isActive", "name", "price", "sku", "type",
];

/** Expected keys for getProductsForDropdown responses */
const DROPDOWN_RESPONSE_KEYS = [
  "cost", "description", "id", "name", "price",
];

// ── State ───────────────────────────────────────────────────────────

let companyA: { id: number };
let companyB: { id: number };

let adminA: { id: number };
let viewServicesA: { id: number };
let noPermsA: { id: number };
let managerNoPermsA: { id: number };
let managerWithPermsA: { id: number };
let adminB: { id: number };

let adminAToken: string;
let viewServicesAToken: string;
let noPermsAToken: string;
let managerNoPermsAToken: string;
let managerWithPermsAToken: string;
let adminBToken: string;

// ── Setup / Teardown ────────────────────────────────────────────────

beforeAll(async () => {
  await resetDb();

  // Companies
  companyA = await seedCompany({ name: "Services Co A" });
  companyB = await seedCompany({ name: "Services Co B" });

  // Users
  adminA = await seedUser(companyA.id, {
    role: "admin",
    name: "SvcAdmin A",
  });
  viewServicesA = await seedUser(companyA.id, {
    role: "basic",
    name: "SvcViewer A",
    permissions: { canViewServices: true },
  });
  noPermsA = await seedUser(companyA.id, {
    role: "basic",
    name: "SvcNoPerms A",
    permissions: {},
  });
  managerNoPermsA = await seedUser(companyA.id, {
    role: "manager",
    name: "SvcMgr A",
    permissions: {},
  });
  managerWithPermsA = await seedUser(companyA.id, {
    role: "manager",
    name: "SvcMgrPerms A",
    permissions: { canViewServices: true },
  });
  adminB = await seedUser(companyB.id, {
    role: "admin",
    name: "SvcAdmin B",
  });

  // Tokens
  adminAToken = signTokenForUser(adminA.id);
  viewServicesAToken = signTokenForUser(viewServicesA.id);
  noPermsAToken = signTokenForUser(noPermsA.id);
  managerNoPermsAToken = signTokenForUser(managerNoPermsA.id);
  managerWithPermsAToken = signTokenForUser(managerWithPermsA.id);
  adminBToken = signTokenForUser(adminB.id);
}, 30_000);

afterEach(async () => {
  setAuthToken(null);
  vi.clearAllMocks();
  redis.multi = _originalRedisMulti;
  prisma.product.update = _originalProductUpdate;
  prisma.$transaction = _originalTransaction as any;
  prisma.product.findMany = _originalProductFindMany;
  await prisma.quoteItem.deleteMany({ where: { quote: { companyId: { in: [companyA.id, companyB.id] } } } });
  await prisma.quote.deleteMany({ where: { companyId: { in: [companyA.id, companyB.id] } } });
  await prisma.product.deleteMany({ where: { companyId: { in: [companyA.id, companyB.id] } } });
});

afterAll(async () => {
  await resetDb();
  await prisma.$disconnect();
}, 15_000);

// ═════════════════════════════════════════════════════════════════════
// getProducts
// ═════════════════════════════════════════════════════════════════════

describe("getProducts", () => {
  it("admin gets all products for their company ordered by name asc", async () => {
    setAuthToken(adminAToken);
    await seedProduct(companyA.id, { name: "Zebra Service" });
    await seedProduct(companyA.id, { name: "Alpha Service" });

    const result = await getProducts();
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Alpha Service");
    expect(result[1].name).toBe("Zebra Service");
  });

  it("basic user with canViewServices gets products", async () => {
    setAuthToken(viewServicesAToken);
    await seedProduct(companyA.id, { name: "Viewer Product" });

    const result = await getProducts();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Viewer Product");
  });

  it("basic user without canViewServices → throws Forbidden", async () => {
    setAuthToken(noPermsAToken);
    await expect(getProducts()).rejects.toThrow("Forbidden");
  });

  it("no user → throws Unauthorized", async () => {
    setAuthToken(null);
    await expect(getProducts()).rejects.toThrow("Unauthorized");
  });

  it("company isolation: Admin A cannot see Company B products", async () => {
    setAuthToken(adminAToken);
    await seedProduct(companyB.id, { name: "Company B only" });

    const result = await getProducts();
    expect(result).toHaveLength(0);
  });

  it("empty result returns []", async () => {
    setAuthToken(adminAToken);
    const result = await getProducts();
    expect(result).toEqual([]);
  });

  it("Decimal→Number conversion: price and cost are numbers", async () => {
    setAuthToken(adminAToken);
    await seedProduct(companyA.id, { name: "Dec Test", price: 49.99, cost: 10.5 });

    const result = await getProducts();
    expect(result).toHaveLength(1);
    expect(typeof result[0].price).toBe("number");
    expect(result[0].price).toBe(49.99);
    expect(typeof result[0].cost).toBe("number");
    expect(result[0].cost).toBe(10.5);
  });

  it("null cost stays null", async () => {
    setAuthToken(adminAToken);
    await seedProduct(companyA.id, { name: "No Cost" });

    const result = await getProducts();
    expect(result[0].cost).toBeNull();
  });

  it("response shape: exactly 8 fields, no companyId/createdAt/updatedAt", async () => {
    setAuthToken(adminAToken);
    await seedProduct(companyA.id, { name: "Shape Check", description: "desc", sku: "SKU1" });

    const result = await getProducts();
    expect(Object.keys(result[0]).sort()).toEqual(PRODUCT_RESPONSE_KEYS);
    expect(result[0]).not.toHaveProperty("companyId");
    expect(result[0]).not.toHaveProperty("createdAt");
    expect(result[0]).not.toHaveProperty("updatedAt");
  });

  it("manager without canViewServices → throws Forbidden", async () => {
    setAuthToken(managerNoPermsAToken);
    await expect(getProducts()).rejects.toThrow("Forbidden");
  });

  it("manager WITH canViewServices succeeds", async () => {
    setAuthToken(managerWithPermsAToken);
    await seedProduct(companyA.id, { name: "Manager Product" });

    const result = await getProducts();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Manager Product");
  });
});

// ═════════════════════════════════════════════════════════════════════
// getProductsForDropdown
// ═════════════════════════════════════════════════════════════════════

describe("getProductsForDropdown", () => {
  it("any authenticated user can call (no canViewServices check)", async () => {
    setAuthToken(noPermsAToken);
    await seedProduct(companyA.id, { name: "Dropdown Prod" });

    const result = await getProductsForDropdown();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Dropdown Prod");
  });

  it("returns only active products", async () => {
    setAuthToken(adminAToken);
    await seedProduct(companyA.id, { name: "Active", isActive: true });
    await seedProduct(companyA.id, { name: "Inactive", isActive: false });

    const result = await getProductsForDropdown();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Active");
  });

  it("Decimal→Number conversion", async () => {
    setAuthToken(adminAToken);
    await seedProduct(companyA.id, { name: "DD Dec", price: 25.50, cost: 12.75 });

    const result = await getProductsForDropdown();
    expect(typeof result[0].price).toBe("number");
    expect(result[0].price).toBe(25.5);
    expect(typeof result[0].cost).toBe("number");
    expect(result[0].cost).toBe(12.75);
  });

  it("company isolation", async () => {
    setAuthToken(adminAToken);
    await seedProduct(companyB.id, { name: "Other Company" });

    const result = await getProductsForDropdown();
    expect(result).toHaveLength(0);
  });

  it("empty result returns []", async () => {
    setAuthToken(adminAToken);
    const result = await getProductsForDropdown();
    expect(result).toEqual([]);
  });

  it("no user → throws Unauthorized", async () => {
    setAuthToken(null);
    await expect(getProductsForDropdown()).rejects.toThrow("Unauthorized");
  });

  it("response shape: exactly 5 fields (id, name, description, price, cost)", async () => {
    setAuthToken(adminAToken);
    await seedProduct(companyA.id, { name: "DD Shape", description: "desc", sku: "SKU1", cost: 5 });

    const result = await getProductsForDropdown();
    expect(result).toHaveLength(1);
    expect(Object.keys(result[0]).sort()).toEqual(DROPDOWN_RESPONSE_KEYS);
    expect(result[0]).not.toHaveProperty("sku");
    expect(result[0]).not.toHaveProperty("type");
    expect(result[0]).not.toHaveProperty("isActive");
    expect(result[0]).not.toHaveProperty("companyId");
    expect(result[0]).not.toHaveProperty("createdAt");
    expect(result[0]).not.toHaveProperty("updatedAt");
  });

  it("ordered by name ascending", async () => {
    setAuthToken(adminAToken);
    await seedProduct(companyA.id, { name: "Zebra" });
    await seedProduct(companyA.id, { name: "Alpha" });

    const result = await getProductsForDropdown();
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Alpha");
    expect(result[1].name).toBe("Zebra");
  });

  it("null cost stays null in dropdown response", async () => {
    setAuthToken(adminAToken);
    await seedProduct(companyA.id, { name: "No Cost DD" });

    const result = await getProductsForDropdown();
    expect(result[0].cost).toBeNull();
  });

  it("rate limit throws when Redis counter exceeds max", async () => {
    setAuthToken(adminAToken);

    await withRateLimitMock(async () => {
      await expect(getProductsForDropdown()).rejects.toThrow("Rate limit exceeded");
    });
  });
});

// ═════════════════════════════════════════════════════════════════════
// createProduct
// ═════════════════════════════════════════════════════════════════════

describe("createProduct", () => {
  it("creates product with minimal fields → verify in DB", async () => {
    setAuthToken(adminAToken);
    const result = await createProduct({ name: "Minimal Prod", type: "SERVICE", price: 50 });

    expect(result).toBeDefined();
    expect(result!.name).toBe("Minimal Prod");
    expect(result!.price).toBe(50);
    expect(result!.cost).toBeNull();

    const dbRow = await prisma.product.findFirst({ where: { name: "Minimal Prod", companyId: companyA.id } });
    expect(dbRow).not.toBeNull();
    expect(Number(dbRow!.price)).toBe(50);
  });

  it("creates product with all fields → verify DB state", async () => {
    setAuthToken(adminAToken);
    const result = await createProduct({
      name: "Full Prod",
      description: "A full product",
      sku: "FP-001",
      type: "PRODUCT",
      price: 199.99,
      cost: 99.50,
    });

    expect(result).toBeDefined();
    expect(result!.name).toBe("Full Prod");
    expect(result!.description).toBe("A full product");
    expect(result!.sku).toBe("FP-001");
    expect(result!.type).toBe("PRODUCT");
    expect(result!.price).toBe(199.99);
    expect(result!.cost).toBe(99.5);

    const dbRow = await prisma.product.findFirst({ where: { name: "Full Prod", companyId: companyA.id } });
    expect(dbRow).not.toBeNull();
    expect(dbRow!.description).toBe("A full product");
    expect(dbRow!.sku).toBe("FP-001");
    expect(Number(dbRow!.price)).toBe(199.99);
    expect(Number(dbRow!.cost)).toBe(99.5);
    expect(dbRow!.type).toBe("PRODUCT");
    expect(dbRow!.isActive).toBe(true);
  });

  it("isActive defaults to true", async () => {
    setAuthToken(adminAToken);
    const result = await createProduct({ name: "Default Active", type: "SERVICE", price: 10 });
    expect(result!.isActive).toBe(true);

    const dbRow = await prisma.product.findUnique({ where: { id: result!.id } });
    expect(dbRow!.isActive).toBe(true);
  });

  it("Zod rejects empty name", async () => {
    setAuthToken(adminAToken);
    await expect(createProduct({ name: "", type: "SERVICE", price: 10 })).rejects.toThrow();
  });

  it("Zod rejects invalid type", async () => {
    setAuthToken(adminAToken);
    await expect(createProduct({ name: "Bad Type", type: "INVALID" as any, price: 10 })).rejects.toThrow();
  });

  it("Zod rejects negative price", async () => {
    setAuthToken(adminAToken);
    await expect(createProduct({ name: "Neg Price", type: "SERVICE", price: -1 })).rejects.toThrow();
  });

  it("Zod rejects price > max", async () => {
    setAuthToken(adminAToken);
    await expect(createProduct({ name: "Over Max", type: "SERVICE", price: 100_000_000 })).rejects.toThrow();
  });

  it("Zod rejects sku > 100 chars", async () => {
    setAuthToken(adminAToken);
    await expect(createProduct({ name: "Long SKU", type: "SERVICE", price: 10, sku: "X".repeat(101) })).rejects.toThrow();
  });

  it("company isolation: product.companyId matches user.companyId", async () => {
    setAuthToken(adminAToken);
    const result = await createProduct({ name: "Company Check", type: "SERVICE", price: 10 });
    const dbRow = await prisma.product.findUnique({ where: { id: result!.id } });
    expect(dbRow!.companyId).toBe(companyA.id);
  });

  it("companyId injection ignored — product belongs to authenticated user's company", async () => {
    setAuthToken(adminAToken);
    const result = await createProduct({
      name: "Injection Test",
      type: "SERVICE",
      price: 10,
      companyId: companyB.id,
    } as any);

    const dbRow = await prisma.product.findUnique({ where: { id: result!.id } });
    expect(dbRow!.companyId).toBe(companyA.id);
    expect(dbRow!.companyId).not.toBe(companyB.id);
  });

  it("isActive injection stripped by Zod — product defaults to active", async () => {
    setAuthToken(adminAToken);
    const result = await createProduct({
      name: "Active Injection",
      type: "SERVICE",
      price: 10,
      isActive: false,
    } as any);

    expect(result!.isActive).toBe(true);
    const dbRow = await prisma.product.findUnique({ where: { id: result!.id } });
    expect(dbRow!.isActive).toBe(true);
  });

  it("Decimal storage: price/cost stored as Decimal, returned as Number", async () => {
    setAuthToken(adminAToken);
    const result = await createProduct({ name: "Dec Store", type: "SERVICE", price: 33.33, cost: 11.11 });
    expect(typeof result!.price).toBe("number");
    expect(typeof result!.cost).toBe("number");

    const dbRow = await prisma.product.findUnique({ where: { id: result!.id } });
    expect(dbRow!.price.constructor.name).toMatch(/^Decimal/);
  });

  it("revalidatePath called on success", async () => {
    setAuthToken(adminAToken);
    await createProduct({ name: "Revalidate Test", type: "SERVICE", price: 10 });
    expect(revalidatePath).toHaveBeenCalledWith("/services");
  });

  it("Unauthorized when no user", async () => {
    setAuthToken(null);
    await expect(createProduct({ name: "No Auth", type: "SERVICE", price: 10 })).rejects.toThrow("Unauthorized");
  });

  it("Forbidden when no canViewServices", async () => {
    setAuthToken(noPermsAToken);
    await expect(createProduct({ name: "No Perm", type: "SERVICE", price: 10 })).rejects.toThrow("Forbidden");
  });

  it("rate limit throws when limited", async () => {
    setAuthToken(adminAToken);

    await withRateLimitMock(async () => {
      await expect(
        createProduct({ name: "Rate Limited", type: "SERVICE", price: 10 }),
      ).rejects.toThrow("Rate limit exceeded");
    });

    // Verify no product was created
    const dbRows = await prisma.product.findMany({ where: { companyId: companyA.id, name: "Rate Limited" } });
    expect(dbRows).toHaveLength(0);
  });

  it("Zod rejects name > 200 chars", async () => {
    setAuthToken(adminAToken);
    await expect(
      createProduct({ name: "X".repeat(201), type: "SERVICE", price: 10 }),
    ).rejects.toThrow();
  });

  it("Zod rejects description > 2000 chars", async () => {
    setAuthToken(adminAToken);
    await expect(
      createProduct({ name: "Desc Too Long", type: "SERVICE", price: 10, description: "X".repeat(2001) }),
    ).rejects.toThrow();
  });

  it("Zod rejects NaN price", async () => {
    setAuthToken(adminAToken);
    await expect(
      createProduct({ name: "NaN Price", type: "SERVICE", price: NaN }),
    ).rejects.toThrow();
  });

  it("Zod rejects Infinity price", async () => {
    setAuthToken(adminAToken);
    await expect(
      createProduct({ name: "Inf Price", type: "SERVICE", price: Infinity }),
    ).rejects.toThrow();
  });

  it("Zod rejects negative cost", async () => {
    setAuthToken(adminAToken);
    await expect(
      createProduct({ name: "Neg Cost", type: "SERVICE", price: 10, cost: -1 }),
    ).rejects.toThrow();
  });

  it("Zod rejects cost > 99,999,999.99", async () => {
    setAuthToken(adminAToken);
    await expect(
      createProduct({ name: "Over Max Cost", type: "SERVICE", price: 10, cost: 100_000_000 }),
    ).rejects.toThrow();
  });

  it("Zod rejects whitespace-only name (trim → empty → min(1) fail)", async () => {
    setAuthToken(adminAToken);
    await expect(
      createProduct({ name: "   ", type: "SERVICE", price: 10 }),
    ).rejects.toThrow();
  });

  it("Zod rejects NaN cost", async () => {
    setAuthToken(adminAToken);
    await expect(
      createProduct({ name: "NaN Cost", type: "SERVICE", price: 10, cost: NaN }),
    ).rejects.toThrow();
  });

  it("Zod rejects Infinity cost", async () => {
    setAuthToken(adminAToken);
    await expect(
      createProduct({ name: "Inf Cost", type: "SERVICE", price: 10, cost: Infinity }),
    ).rejects.toThrow();
  });

  it("Zod rejects null cost (null ≠ undefined for .optional())", async () => {
    setAuthToken(adminAToken);
    await expect(
      createProduct({ name: "Null Cost Test", type: "SERVICE", price: 10, cost: null as any }),
    ).rejects.toThrow();
  });

  it("Zod rejection produces no DB side effect", async () => {
    setAuthToken(adminAToken);
    const countBefore = await prisma.product.count({ where: { companyId: companyA.id } });

    await expect(
      createProduct({ name: "", type: "SERVICE", price: 10 }),
    ).rejects.toThrow();

    const countAfter = await prisma.product.count({ where: { companyId: companyA.id } });
    expect(countAfter).toBe(countBefore);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════
// updateProduct
// ═════════════════════════════════════════════════════════════════════

describe("updateProduct", () => {
  it("updates existing product → verify DB has new values", async () => {
    setAuthToken(adminAToken);
    const prod = await seedProduct(companyA.id, { name: "Before Update", price: 50 });

    const result = await updateProduct(prod.id, { name: "After Update", type: "SERVICE", price: 75 });
    expect(result!.name).toBe("After Update");
    expect(result!.price).toBe(75);

    const dbRow = await prisma.product.findUnique({ where: { id: prod.id } });
    expect(dbRow!.name).toBe("After Update");
    expect(Number(dbRow!.price)).toBe(75);
  });

  it("company isolation: can't update product from another company → P2025", async () => {
    setAuthToken(adminAToken);
    const prodB = await seedProduct(companyB.id, { name: "Company B prod" });

    await expect(
      updateProduct(prodB.id, { name: "Hijacked", type: "SERVICE", price: 1 }),
    ).rejects.toThrow("Product not found.");
  });

  it("deactivation works via isActive: false", async () => {
    setAuthToken(adminAToken);
    const prod = await seedProduct(companyA.id, { name: "To Deactivate" });

    const result = await updateProduct(prod.id, { name: "To Deactivate", type: "SERVICE", price: 100, isActive: false });
    expect(result!.isActive).toBe(false);

    const dbRow = await prisma.product.findUnique({ where: { id: prod.id } });
    expect(dbRow!.isActive).toBe(false);
  });

  it("id=0 → Invalid id", async () => {
    setAuthToken(adminAToken);
    await expect(updateProduct(0, { name: "X", type: "SERVICE", price: 1 })).rejects.toThrow("Invalid id");
  });

  it("id=-1 → Invalid id", async () => {
    setAuthToken(adminAToken);
    await expect(updateProduct(-1, { name: "X", type: "SERVICE", price: 1 })).rejects.toThrow("Invalid id");
  });

  it("id=1.5 → Invalid id", async () => {
    setAuthToken(adminAToken);
    await expect(updateProduct(1.5, { name: "X", type: "SERVICE", price: 1 })).rejects.toThrow("Invalid id");
  });

  it("id=NaN → Invalid id", async () => {
    setAuthToken(adminAToken);
    await expect(updateProduct(NaN, { name: "X", type: "SERVICE", price: 1 })).rejects.toThrow("Invalid id");
  });

  it("non-existent product → Product not found.", async () => {
    setAuthToken(adminAToken);
    await expect(
      updateProduct(999999, { name: "Ghost", type: "SERVICE", price: 1 }),
    ).rejects.toThrow("Product not found.");
  });

  it("revalidatePath called on success", async () => {
    setAuthToken(adminAToken);
    const prod = await seedProduct(companyA.id, { name: "Revalidate Update" });
    await updateProduct(prod.id, { name: "Updated", type: "SERVICE", price: 10 });
    expect(revalidatePath).toHaveBeenCalledWith("/services");
  });

  it("Unauthorized when no user", async () => {
    setAuthToken(null);
    await expect(updateProduct(1, { name: "X", type: "SERVICE", price: 1 })).rejects.toThrow("Unauthorized");
  });

  it("Forbidden when no canViewServices", async () => {
    setAuthToken(noPermsAToken);
    await expect(updateProduct(1, { name: "X", type: "SERVICE", price: 1 })).rejects.toThrow("Forbidden");
  });

  it("Zod rejects invalid type on update", async () => {
    setAuthToken(adminAToken);
    const prod = await seedProduct(companyA.id, { name: "Type Update" });
    await expect(
      updateProduct(prod.id, { name: "X", type: "INVALID" as any, price: 1 }),
    ).rejects.toThrow();
  });

  it("Zod rejects negative price on update", async () => {
    setAuthToken(adminAToken);
    const prod = await seedProduct(companyA.id, { name: "Neg Price Update" });
    await expect(
      updateProduct(prod.id, { name: "X", type: "SERVICE", price: -5 }),
    ).rejects.toThrow();
  });

  it("Zod rejects NaN price on update", async () => {
    setAuthToken(adminAToken);
    const prod = await seedProduct(companyA.id, { name: "NaN Price Update" });
    await expect(
      updateProduct(prod.id, { name: "X", type: "SERVICE", price: NaN }),
    ).rejects.toThrow();
  });

  it("Zod rejection on update does not mutate DB", async () => {
    setAuthToken(adminAToken);
    const prod = await seedProduct(companyA.id, { name: "Zod Update Guard", price: 50, description: "original desc" });

    await expect(
      updateProduct(prod.id, { name: "", type: "SERVICE", price: 10 }),
    ).rejects.toThrow();

    const dbRow = await prisma.product.findUnique({ where: { id: prod.id } });
    expect(dbRow!.name).toBe("Zod Update Guard");
    expect(Number(dbRow!.price)).toBe(50);
    expect(dbRow!.description).toBe("original desc");
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("Zod rejects name > 200 chars on update", async () => {
    setAuthToken(adminAToken);
    const prod = await seedProduct(companyA.id, { name: "Long Name Update" });
    await expect(
      updateProduct(prod.id, { name: "A".repeat(201), type: "SERVICE", price: 1 }),
    ).rejects.toThrow();
  });

  it("Zod rejects description > 2000 chars on update", async () => {
    setAuthToken(adminAToken);
    const prod = await seedProduct(companyA.id, { name: "Long Desc Update" });
    await expect(
      updateProduct(prod.id, { name: "X", description: "D".repeat(2001), type: "SERVICE", price: 1 }),
    ).rejects.toThrow();
  });

  it("Zod rejects sku > 100 chars on update", async () => {
    setAuthToken(adminAToken);
    const prod = await seedProduct(companyA.id, { name: "Long SKU Update" });
    await expect(
      updateProduct(prod.id, { name: "X", sku: "S".repeat(101), type: "SERVICE", price: 1 }),
    ).rejects.toThrow();
  });

  it("Zod rejects cost > 99,999,999.99 on update", async () => {
    setAuthToken(adminAToken);
    const prod = await seedProduct(companyA.id, { name: "High Cost Update" });
    await expect(
      updateProduct(prod.id, { name: "X", type: "SERVICE", price: 1, cost: 100_000_000 }),
    ).rejects.toThrow();
  });

  it("Zod rejects price > 99,999,999.99 on update", async () => {
    setAuthToken(adminAToken);
    const prod = await seedProduct(companyA.id, { name: "High Price Update" });
    await expect(
      updateProduct(prod.id, { name: "X", type: "SERVICE", price: 100_000_000 }),
    ).rejects.toThrow();
  });

  it("Zod rejects whitespace-only name on update", async () => {
    setAuthToken(adminAToken);
    const prod = await seedProduct(companyA.id, { name: "Whitespace Update" });
    await expect(
      updateProduct(prod.id, { name: "   ", type: "SERVICE", price: 10 }),
    ).rejects.toThrow();
  });

  it("Zod rejects Infinity price on update", async () => {
    setAuthToken(adminAToken);
    const prod = await seedProduct(companyA.id, { name: "Inf Update" });
    await expect(
      updateProduct(prod.id, { name: "X", type: "SERVICE", price: Infinity }),
    ).rejects.toThrow();
  });

  it("Zod rejects negative cost on update", async () => {
    setAuthToken(adminAToken);
    const prod = await seedProduct(companyA.id, { name: "Neg Cost Update" });
    await expect(
      updateProduct(prod.id, { name: "X", type: "SERVICE", price: 10, cost: -1 }),
    ).rejects.toThrow();
  });

  it("Zod rejects NaN cost on update", async () => {
    setAuthToken(adminAToken);
    const prod = await seedProduct(companyA.id, { name: "NaN Cost Update" });
    await expect(
      updateProduct(prod.id, { name: "Valid Name", type: "SERVICE", price: 10, cost: NaN }),
    ).rejects.toThrow();
  });

  it("Zod rejects Infinity cost on update", async () => {
    setAuthToken(adminAToken);
    const prod = await seedProduct(companyA.id, { name: "Inf Cost Update" });
    await expect(
      updateProduct(prod.id, { name: "Valid Name", type: "SERVICE", price: 10, cost: Infinity }),
    ).rejects.toThrow();
  });

  it("Zod rejects null cost on update (null ≠ undefined for .optional())", async () => {
    setAuthToken(adminAToken);
    const prod = await seedProduct(companyA.id, { name: "Null Cost Update" });
    await expect(
      updateProduct(prod.id, { name: "X", type: "SERVICE", price: 10, cost: null as any }),
    ).rejects.toThrow();
  });
});

// ═════════════════════════════════════════════════════════════════════
// Full CRUD lifecycle
// ═════════════════════════════════════════════════════════════════════

describe("Full CRUD lifecycle", () => {
  it("create → read → update → read again", async () => {
    setAuthToken(adminAToken);

    // Create
    const created = await createProduct({ name: "Lifecycle Prod", type: "PACKAGE", price: 200, cost: 80 });
    expect(created!.id).toBeDefined();

    // Read
    const list1 = await getProducts();
    expect(list1).toHaveLength(1);
    expect(list1[0].name).toBe("Lifecycle Prod");
    expect(list1[0].type).toBe("PACKAGE");

    // Update
    await updateProduct(created!.id, { name: "Lifecycle Updated", type: "SERVICE", price: 250, cost: 100 });

    // Read again
    const list2 = await getProducts();
    expect(list2).toHaveLength(1);
    expect(list2[0].name).toBe("Lifecycle Updated");
    expect(list2[0].type).toBe("SERVICE");
    expect(list2[0].price).toBe(250);
    expect(list2[0].cost).toBe(100);
  });
});

// ═════════════════════════════════════════════════════════════════════
// Multi-step deactivation flow
// ═════════════════════════════════════════════════════════════════════

describe("Multi-step deactivation flow", () => {
  it("create → deactivate → dropdown excludes, getProducts still shows", async () => {
    setAuthToken(adminAToken);
    const prodA = await createProduct({ name: "Active Prod", type: "SERVICE", price: 10 });
    const prodB = await createProduct({ name: "Deact Prod", type: "SERVICE", price: 20 });

    // Both visible in dropdown
    let dropdown = await getProductsForDropdown();
    expect(dropdown).toHaveLength(2);

    // Deactivate B
    await updateProduct(prodB!.id, { name: "Deact Prod", type: "SERVICE", price: 20, isActive: false });

    // Dropdown excludes deactivated
    dropdown = await getProductsForDropdown();
    expect(dropdown).toHaveLength(1);
    expect(dropdown[0].name).toBe("Active Prod");

    // getProducts still returns both
    const all = await getProducts();
    expect(all).toHaveLength(2);
  });
});

// ═════════════════════════════════════════════════════════════════════
// Multi-step reactivation flow
// ═════════════════════════════════════════════════════════════════════

describe("Multi-step reactivation flow", () => {
  it("create → deactivate → dropdown excludes → reactivate → dropdown includes", async () => {
    setAuthToken(adminAToken);
    const prod = await createProduct({ name: "Reactivation Flow", type: "SERVICE", price: 50 });

    // Initially visible in dropdown
    let dropdown = await getProductsForDropdown();
    expect(dropdown.some((p) => p.id === prod!.id)).toBe(true);

    // Deactivate
    await updateProduct(prod!.id, { name: "Reactivation Flow", type: "SERVICE", price: 50, isActive: false });

    // Dropdown excludes deactivated product
    dropdown = await getProductsForDropdown();
    expect(dropdown.some((p) => p.id === prod!.id)).toBe(false);

    // Reactivate
    await updateProduct(prod!.id, { name: "Reactivation Flow", type: "SERVICE", price: 50, isActive: true });

    // Dropdown includes reactivated product again
    dropdown = await getProductsForDropdown();
    expect(dropdown.some((p) => p.id === prod!.id)).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════
// Tenant isolation (cross-company)
// ═════════════════════════════════════════════════════════════════════

describe("Tenant isolation", () => {
  it("Company A product invisible to Company B", async () => {
    setAuthToken(adminAToken);
    await createProduct({ name: "A secret", type: "SERVICE", price: 10 });

    setAuthToken(adminBToken);
    const result = await getProducts();
    expect(result).toHaveLength(0);
  });

  it("Company B cannot update Company A product → P2025", async () => {
    setAuthToken(adminAToken);
    const prodA = await createProduct({ name: "A only", type: "SERVICE", price: 10 });

    setAuthToken(adminBToken);
    await expect(
      updateProduct(prodA!.id, { name: "Stolen", type: "SERVICE", price: 1 }),
    ).rejects.toThrow("Product not found.");
  });
});

// ═════════════════════════════════════════════════════════════════════
// Edge cases
// ═════════════════════════════════════════════════════════════════════

describe("Edge cases", () => {
  it("Unicode/Hebrew product names stored and retrieved correctly", async () => {
    setAuthToken(adminAToken);
    const result = await createProduct({ name: "שירות בדיקה", type: "SERVICE", price: 50 });
    expect(result!.name).toBe("שירות בדיקה");

    const list = await getProducts();
    expect(list[0].name).toBe("שירות בדיקה");
  });

  it("boundary price: 0", async () => {
    setAuthToken(adminAToken);
    const result = await createProduct({ name: "Free", type: "SERVICE", price: 0 });
    expect(result!.price).toBe(0);

    const dbRow = await prisma.product.findUnique({ where: { id: result!.id } });
    expect(Number(dbRow!.price)).toBe(0);
  });

  it("boundary price: 99_999_999.99", async () => {
    setAuthToken(adminAToken);
    const result = await createProduct({ name: "Max Price", type: "SERVICE", price: 99_999_999.99 });
    expect(result!.price).toBe(99_999_999.99);

    const dbRow = await prisma.product.findUnique({ where: { id: result!.id } });
    expect(Number(dbRow!.price)).toBe(99_999_999.99);
  });

  it("whitespace trimming: '  Padded  ' → stored as 'Padded'", async () => {
    setAuthToken(adminAToken);
    const result = await createProduct({ name: "  Padded  ", type: "SERVICE", price: 10 });
    expect(result!.name).toBe("Padded");

    const dbRow = await prisma.product.findUnique({ where: { id: result!.id } });
    expect(dbRow!.name).toBe("Padded");
  });

  it("all 3 ProductType enum values work: SERVICE, PRODUCT, PACKAGE", async () => {
    setAuthToken(adminAToken);
    const svc = await createProduct({ name: "Type Svc", type: "SERVICE", price: 1 });
    const prod = await createProduct({ name: "Type Prod", type: "PRODUCT", price: 2 });
    const pkg = await createProduct({ name: "Type Pkg", type: "PACKAGE", price: 3 });

    expect(svc!.type).toBe("SERVICE");
    expect(prod!.type).toBe("PRODUCT");
    expect(pkg!.type).toBe("PACKAGE");

    const dbSvc = await prisma.product.findUnique({ where: { id: svc!.id } });
    const dbProd = await prisma.product.findUnique({ where: { id: prod!.id } });
    const dbPkg = await prisma.product.findUnique({ where: { id: pkg!.id } });
    expect(dbSvc!.type).toBe("SERVICE");
    expect(dbProd!.type).toBe("PRODUCT");
    expect(dbPkg!.type).toBe("PACKAGE");
  });

  it("optional fields as undefined → stored as null in DB", async () => {
    setAuthToken(adminAToken);
    const result = await createProduct({ name: "No Optionals", type: "SERVICE", price: 10 });

    const dbRow = await prisma.product.findUnique({ where: { id: result!.id } });
    expect(dbRow!.description).toBeNull();
    expect(dbRow!.sku).toBeNull();
    expect(dbRow!.cost).toBeNull();
  });

  it("SQL injection in name field → harmless (Prisma parameterized queries)", async () => {
    setAuthToken(adminAToken);
    const malicious = "'; DROP TABLE \"Product\"; --";
    const result = await createProduct({ name: malicious, type: "SERVICE", price: 10 });
    expect(result!.name).toBe(malicious);

    const dbRow = await prisma.product.findFirst({ where: { id: result!.id } });
    expect(dbRow!.name).toBe(malicious);
  });

  it("createdAt and updatedAt auto-populated", async () => {
    setAuthToken(adminAToken);
    const before = new Date();
    const result = await createProduct({ name: "Timestamp Test", type: "SERVICE", price: 10 });

    const dbRow = await prisma.product.findUnique({ where: { id: result!.id } });
    expect(dbRow!.createdAt).toBeInstanceOf(Date);
    expect(dbRow!.updatedAt).toBeInstanceOf(Date);
    expect(dbRow!.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
    expect(dbRow!.createdAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    expect(Math.abs(dbRow!.updatedAt.getTime() - dbRow!.createdAt.getTime())).toBeLessThan(5000);
  });

  it("updatedAt changes after update", async () => {
    setAuthToken(adminAToken);
    const result = await createProduct({ name: "UpdAt Test", type: "SERVICE", price: 10 });
    const dbBefore = await prisma.product.findUnique({ where: { id: result!.id } });
    const originalUpdatedAt = dbBefore!.updatedAt.getTime();

    // Small delay to ensure timestamp difference
    await new Promise((r) => setTimeout(r, 100));

    await updateProduct(result!.id, { name: "UpdAt Changed", type: "SERVICE", price: 20 });
    const dbAfter = await prisma.product.findUnique({ where: { id: result!.id } });
    expect(dbAfter!.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt);
  });

  it("cost of 0 stored and returned correctly (not null)", async () => {
    setAuthToken(adminAToken);
    const result = await createProduct({ name: "Zero Cost", type: "SERVICE", price: 10, cost: 0 });

    // Prisma Decimal(0) is an object (truthy), so the ternary returns Number(Decimal(0)) = 0
    expect(result!.cost).toBe(0);

    const dbRow = await prisma.product.findUnique({ where: { id: result!.id } });
    expect(Number(dbRow!.cost)).toBe(0);
  });

  it("description and SKU are trimmed on create", async () => {
    setAuthToken(adminAToken);
    const result = await createProduct({
      name: "Trim Fields",
      type: "SERVICE",
      price: 10,
      description: "  padded desc  ",
      sku: "  PAD-SKU  ",
    });
    expect(result!.description).toBe("padded desc");
    expect(result!.sku).toBe("PAD-SKU");

    const dbRow = await prisma.product.findUnique({ where: { id: result!.id } });
    expect(dbRow!.description).toBe("padded desc");
    expect(dbRow!.sku).toBe("PAD-SKU");
  });

  it("description at max boundary (2000 chars)", async () => {
    setAuthToken(adminAToken);
    const longDesc = "x".repeat(2000);
    const result = await createProduct({ name: "Max Desc", type: "SERVICE", price: 10, description: longDesc });
    expect(result).toBeDefined();

    const dbRow = await prisma.product.findUnique({ where: { id: result!.id } });
    expect(dbRow!.description).toBe(longDesc);
    expect(dbRow!.description!.length).toBe(2000);
  });

  it("empty description on create accepted (no min constraint)", async () => {
    setAuthToken(adminAToken);
    const result = await createProduct({
      name: "Empty Desc Create",
      type: "SERVICE",
      price: 10,
      description: "",
    });
    expect(result!.description).toBe("");

    const dbRow = await prisma.product.findUnique({ where: { id: result!.id } });
    expect(dbRow!.description).toBe("");
  });
});

// ═════════════════════════════════════════════════════════════════════
// Error sanitization
// ═════════════════════════════════════════════════════════════════════

describe("Error sanitization", () => {
  it("non-Prisma errors → 'An unexpected error occurred'", async () => {
    setAuthToken(adminAToken);
    const prod = await seedProduct(companyA.id, { name: "Error Test" });

    const originalUpdate = prisma.product.update;
    prisma.product.update = vi.fn().mockRejectedValue(new Error("random internal failure")) as any;

    try {
      await expect(
        updateProduct(prod.id, { name: "Updated Product", type: "SERVICE", price: 1 }),
      ).rejects.toThrow("An unexpected error occurred");
      expect(revalidatePath).not.toHaveBeenCalled();
    } finally {
      prisma.product.update = originalUpdate;
    }
  });

  it("P2002 sanitized to 'Duplicate entry'", async () => {
    setAuthToken(adminAToken);
    const prod = await seedProduct(companyA.id, { name: "P2002 Test" });

    const prismaError = new Error("Unique constraint failed");
    (prismaError as any).code = "P2002";
    const originalUpdate = prisma.product.update;
    prisma.product.update = vi.fn().mockRejectedValue(prismaError) as any;

    try {
      await expect(
        updateProduct(prod.id, { name: "Constraint Test", type: "SERVICE", price: 1 }),
      ).rejects.toThrow("Duplicate entry");
      expect(revalidatePath).not.toHaveBeenCalled();
    } finally {
      prisma.product.update = originalUpdate;
    }
  });

  it("P2003 sanitized to FK deletion message", async () => {
    setAuthToken(adminAToken);
    const prod = await seedProduct(companyA.id, { name: "P2003 Test" });

    const prismaError = new Error("Foreign key constraint failed");
    (prismaError as any).code = "P2003";
    const originalUpdate = prisma.product.update;
    prisma.product.update = vi.fn().mockRejectedValue(prismaError) as any;

    try {
      await expect(
        updateProduct(prod.id, { name: "FK Error Test", type: "SERVICE", price: 1 }),
      ).rejects.toThrow("Cannot delete product: it is referenced by quote items. Deactivate it instead.");
      expect(revalidatePath).not.toHaveBeenCalled();
    } finally {
      prisma.product.update = originalUpdate;
    }
  });

  it("createProduct: non-ProductLimitError caught → sanitizeError (P2002)", async () => {
    setAuthToken(adminAToken);
    const prismaError = new Error("Unique constraint failed");
    (prismaError as any).code = "P2002";

    const originalTransaction = prisma.$transaction;
    prisma.$transaction = vi.fn().mockRejectedValue(prismaError) as any;

    try {
      await expect(
        createProduct({ name: "Dup Create", type: "SERVICE", price: 10 }),
      ).rejects.toThrow("Duplicate entry");
      expect(revalidatePath).not.toHaveBeenCalled();
    } finally {
      prisma.$transaction = originalTransaction;
    }
  });

  it("createProduct: unexpected Prisma error \u2192 sanitized message", async () => {
    setAuthToken(adminAToken);

    const originalTransaction = prisma.$transaction;
    prisma.$transaction = vi.fn().mockRejectedValue(new Error("disk I/O error")) as any;

    try {
      await expect(
        createProduct({ name: "TX Error", type: "SERVICE", price: 10 }),
      ).rejects.toThrow("An unexpected error occurred");
      expect(revalidatePath).not.toHaveBeenCalled();
    } finally {
      prisma.$transaction = originalTransaction;
    }
  });

  it("createProduct: P2003 → sanitizeError → FK deletion message", async () => {
    setAuthToken(adminAToken);
    const prismaError = new Error("Foreign key constraint failed");
    (prismaError as any).code = "P2003";

    const originalTransaction = prisma.$transaction;
    prisma.$transaction = vi.fn().mockRejectedValue(prismaError) as any;

    try {
      await expect(
        createProduct({ name: "FK Fail Create", type: "SERVICE", price: 10 }),
      ).rejects.toThrow("Cannot delete product: it is referenced by quote items. Deactivate it instead.");
      expect(revalidatePath).not.toHaveBeenCalled();
    } finally {
      prisma.$transaction = originalTransaction;
    }
  });

  it("revalidatePath NOT called when update throws P2025", async () => {
    setAuthToken(adminAToken);
    await expect(
      updateProduct(999999, { name: "Not Found Product", type: "SERVICE", price: 1 }),
    ).rejects.toThrow("Product not found.");

    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════
// DB constraints & cascades
// ═════════════════════════════════════════════════════════════════════

describe("DB constraints & cascades", () => {
  it("company cascade deletes all products", async () => {
    const tempCo = await seedCompany({ name: "Temp Cascade Co" });
    await prisma.product.create({
      data: { companyId: tempCo.id, name: "Cascade Prod", type: "SERVICE", price: 10 },
    });

    await prisma.company.delete({ where: { id: tempCo.id } });

    const remaining = await prisma.product.findMany({ where: { companyId: tempCo.id } });
    expect(remaining).toHaveLength(0);
  });

  it("QuoteItem.productId set to null when referenced product is deleted (SET NULL)", async () => {
    const prod = await prisma.product.create({
      data: { companyId: companyA.id, name: "FK Test Prod", type: "SERVICE", price: 50 },
    });
    const quote = await prisma.quote.create({
      data: {
        companyId: companyA.id,
        clientName: "FK Test Client",
        total: 50,
      },
    });
    const quoteItem = await prisma.quoteItem.create({
      data: {
        quoteId: quote.id,
        productId: prod.id,
        description: "FK item",
        quantity: 1,
        unitPrice: 50,
      },
    });

    // Delete the product — should succeed (SET NULL on QuoteItem.productId)
    await prisma.product.delete({ where: { id: prod.id } });

    // QuoteItem still exists but productId is now null
    const orphanedItem = await prisma.quoteItem.findUnique({ where: { id: quoteItem.id } });
    expect(orphanedItem).not.toBeNull();
    expect(orphanedItem!.productId).toBeNull();

    // Cleanup
    await prisma.quoteItem.deleteMany({ where: { quoteId: quote.id } });
    await prisma.quote.delete({ where: { id: quote.id } });
  });

  it("updateProduct preserves linked quoteItem (productId unchanged)", async () => {
    const prod = await prisma.product.create({
      data: { companyId: companyA.id, name: "Linked Product", type: "SERVICE", price: 50 },
    });
    const quote = await prisma.quote.create({
      data: { companyId: companyA.id, clientName: "Link Test Client", total: 50 },
    });
    const quoteItem = await prisma.quoteItem.create({
      data: { quoteId: quote.id, productId: prod.id, description: "Linked item", quantity: 1, unitPrice: 50 },
    });

    setAuthToken(adminAToken);
    await updateProduct(prod.id, { name: "Updated Linked", type: "SERVICE", price: 75 });

    const item = await prisma.quoteItem.findUnique({ where: { id: quoteItem.id } });
    expect(item!.productId).toBe(prod.id);
  });
});

// ═════════════════════════════════════════════════════════════════════
// Product cap (MAX_PRODUCTS_PER_COMPANY) — real integration
// ═════════════════════════════════════════════════════════════════════

describe("Product cap (MAX_PRODUCTS_PER_COMPANY)", () => {
  let companyC: { id: number };
  let capUser: { id: number };
  let capToken: string;

  beforeAll(async () => {
    companyC = await seedCompany({ name: "Cap Co" });

    capUser = await seedUser(companyC.id, {
      role: "admin",
      name: "Cap Admin",
    });
    capToken = signTokenForUser(capUser.id);

    await prisma.product.createMany({
      data: Array.from({ length: 4999 }, (_, i) => ({
        companyId: companyC.id,
        name: `Cap Product ${i}`,
        type: "SERVICE" as const,
        price: 10,
      })),
    });
  }, 60_000);

  afterAll(async () => {
    await prisma.product.deleteMany({ where: { companyId: companyC.id } });
    await prisma.user.deleteMany({ where: { companyId: companyC.id } });
    await prisma.company.delete({ where: { id: companyC.id } });
  });

  it("allows creation at exactly 4999 (one below cap)", async () => {
    const countBefore = await prisma.product.count({ where: { companyId: companyC.id } });
    expect(countBefore).toBe(4999);

    setAuthToken(capToken);
    const result = await createProduct({ name: "Product 5000", type: "SERVICE", price: 10 });
    expect(result).toBeDefined();
    expect(result!.name).toBe("Product 5000");

    const count = await prisma.product.count({ where: { companyId: companyC.id } });
    expect(count).toBe(5000);
  });

  it("rejects creation when company already has 5000 products", async () => {
    setAuthToken(capToken);
    await expect(
      createProduct({ name: "Product 5001", type: "SERVICE", price: 10 }),
    ).rejects.toThrow("Maximum of 5000 products reached");

    const count = await prisma.product.count({ where: { companyId: companyC.id } });
    expect(count).toBe(5000);
  });

  it("revalidatePath NOT called when cap error is thrown", async () => {
    setAuthToken(capToken);
    await expect(
      createProduct({ name: "Over Cap", type: "SERVICE", price: 10 }),
    ).rejects.toThrow();

    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("ProductLimitError passes through unsanitized (not generic error)", async () => {
    setAuthToken(capToken);
    const err = await createProduct({ name: "Over Cap", type: "SERVICE", price: 10 })
      .catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("Maximum of 5000 products reached");
    expect((err as Error).message).not.toBe("An unexpected error occurred");
  });
});

// ═════════════════════════════════════════════════════════════════════
// Validation boundaries (acceptance)
// ═════════════════════════════════════════════════════════════════════

describe("Validation boundaries (acceptance)", () => {
  it("name at exactly 200 chars is accepted", async () => {
    setAuthToken(adminAToken);
    const longName = "N".repeat(200);
    const result = await createProduct({ name: longName, type: "SERVICE", price: 10 });
    expect(result).toBeDefined();

    const dbRow = await prisma.product.findUnique({ where: { id: result!.id } });
    expect(dbRow!.name).toHaveLength(200);
  });

  it("SKU at exactly 100 chars is accepted", async () => {
    setAuthToken(adminAToken);
    const longSku = "S".repeat(100);
    const result = await createProduct({ name: "SKU 100", type: "SERVICE", price: 10, sku: longSku });
    expect(result).toBeDefined();

    const dbRow = await prisma.product.findUnique({ where: { id: result!.id } });
    expect(dbRow!.sku).toHaveLength(100);
  });
});

// ═════════════════════════════════════════════════════════════════════
// Rate limiting (getProducts, updateProduct)
// ═════════════════════════════════════════════════════════════════════

describe("Rate limiting (additional actions)", () => {
  it("getProducts throws when rate-limited", async () => {
    setAuthToken(adminAToken);

    await withRateLimitMock(async () => {
      await expect(getProducts()).rejects.toThrow("Rate limit exceeded");
    });
  });

  it("updateProduct throws when rate-limited, no DB change", async () => {
    setAuthToken(adminAToken);
    const prod = await seedProduct(companyA.id, { name: "Rate Limit Update" });

    await withRateLimitMock(async () => {
      await expect(
        updateProduct(prod.id, { name: "Should Not Change", type: "SERVICE", price: 10 }),
      ).rejects.toThrow("Rate limit exceeded");
    });

    const dbRow = await prisma.product.findUnique({ where: { id: prod.id } });
    expect(dbRow!.name).toBe("Rate Limit Update");
  });
});

// ═════════════════════════════════════════════════════════════════════
// Redis failure resilience (.catch(() => false) pattern)
// ═════════════════════════════════════════════════════════════════════

describe("Redis failure resilience (.catch(() => false) pattern)", () => {
  it("getProducts proceeds when Redis throws on rate limit check", async () => {
    setAuthToken(adminAToken);
    await seedProduct(companyA.id, { name: "Redis Fail Prod" });

    const result = await withRedisFailureMock(() => getProducts());
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Redis Fail Prod");
  });

  it("getProductsForDropdown proceeds when Redis throws", async () => {
    setAuthToken(adminAToken);
    await seedProduct(companyA.id, { name: "Redis Fail DD" });

    const result = await withRedisFailureMock(() => getProductsForDropdown());
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Redis Fail DD");
  });

  it("createProduct succeeds when Redis throws on rate limit check", async () => {
    setAuthToken(adminAToken);

    const result = await withRedisFailureMock(() =>
      createProduct({ name: "Redis Down Create", type: "SERVICE", price: 25 }),
    );
    expect(result).toBeDefined();
    expect(result!.name).toBe("Redis Down Create");

    const dbRow = await prisma.product.findUnique({ where: { id: result!.id } });
    expect(dbRow).not.toBeNull();
  });

  it("updateProduct succeeds when Redis throws on rate limit check", async () => {
    setAuthToken(adminAToken);
    const prod = await seedProduct(companyA.id, { name: "Redis Down Update", price: 30 });

    const result = await withRedisFailureMock(() =>
      updateProduct(prod.id, { name: "Redis Down Updated", type: "SERVICE", price: 40 }),
    );
    expect(result).toBeDefined();
    expect(result!.name).toBe("Redis Down Updated");

    const dbRow = await prisma.product.findUnique({ where: { id: prod.id } });
    expect(dbRow!.name).toBe("Redis Down Updated");
    expect(Number(dbRow!.price)).toBe(40);
  });
});

// ═════════════════════════════════════════════════════════════════════
// withRetry (transient error recovery)
// ═════════════════════════════════════════════════════════════════════

describe("withRetry (transient error recovery)", () => {
  it("getProducts retries on transient 40001 error and succeeds", async () => {
    setAuthToken(adminAToken);
    await seedProduct(companyA.id, { name: "Retry Test Prod" });

    const originalFindMany = prisma.product.findMany;
    let callCount = 0;
    prisma.product.findMany = (async (...args: any[]) => {
      callCount++;
      if (callCount === 1) {
        const err = new Error("serialization_failure");
        (err as any).code = "40001";
        throw err;
      }
      return (originalFindMany as any).apply(prisma.product, args);
    }) as any;

    try {
      const result = await getProducts();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Retry Test Prod");
      expect(callCount).toBe(2);
    } finally {
      prisma.product.findMany = originalFindMany;
    }
  });

  it("createProduct retries $transaction on transient 40P01 deadlock and succeeds", async () => {
    setAuthToken(adminAToken);

    const originalTransaction = prisma.$transaction;
    let txCallCount = 0;
    prisma.$transaction = (async (...args: any[]) => {
      txCallCount++;
      if (txCallCount === 1) {
        const err = new Error("deadlock_detected");
        (err as any).code = "40P01";
        throw err;
      }
      return (originalTransaction as any).apply(prisma, args);
    }) as any;

    try {
      const result = await createProduct({ name: "Deadlock Retry Prod", type: "SERVICE", price: 75 });
      expect(result).toBeDefined();
      expect(result!.name).toBe("Deadlock Retry Prod");
      expect(txCallCount).toBe(2);

      const dbRow = await prisma.product.findFirst({
        where: { name: "Deadlock Retry Prod", companyId: companyA.id },
      });
      expect(dbRow).not.toBeNull();
    } finally {
      prisma.$transaction = originalTransaction;
    }
  });
});

// ═════════════════════════════════════════════════════════════════════
// Update behavior edge cases
// ═════════════════════════════════════════════════════════════════════

describe("Update behavior edge cases", () => {
  it("update preserves omitted optional fields (description, sku, cost)", async () => {
    setAuthToken(adminAToken);
    const prod = await seedProduct(companyA.id, {
      name: "With Optionals",
      description: "Keep me",
      sku: "KEEP-001",
      cost: 42.5,
    });

    await updateProduct(prod.id, { name: "Renamed", type: "SERVICE", price: 99 });

    const dbRow = await prisma.product.findUnique({ where: { id: prod.id } });
    expect(dbRow!.description).toBe("Keep me");
    expect(dbRow!.sku).toBe("KEEP-001");
    expect(Number(dbRow!.cost)).toBe(42.5);
    expect(dbRow!.isActive).toBe(true);
  });

  it("update preserves isActive when omitted from payload", async () => {
    setAuthToken(adminAToken);
    const prod = await seedProduct(companyA.id, { name: "Active Preserved", isActive: true });

    const result = await updateProduct(prod.id, { name: "Renamed Active", type: "SERVICE", price: 50 });
    expect(result!.isActive).toBe(true);

    const dbRow = await prisma.product.findUnique({ where: { id: prod.id } });
    expect(dbRow!.isActive).toBe(true);
    expect(dbRow!.name).toBe("Renamed Active");
  });

  it("re-activation: isActive false → true", async () => {
    setAuthToken(adminAToken);
    const prod = await seedProduct(companyA.id, { name: "Inactive Prod", isActive: false });

    const result = await updateProduct(prod.id, {
      name: "Inactive Prod",
      type: "SERVICE",
      price: 100,
      isActive: true,
    });
    expect(result!.isActive).toBe(true);

    const dbRow = await prisma.product.findUnique({ where: { id: prod.id } });
    expect(dbRow!.isActive).toBe(true);

    const dropdown = await getProductsForDropdown();
    expect(dropdown).toHaveLength(1);
    expect(dropdown.some((p) => p.id === prod.id)).toBe(true);
  });

  it("whitespace trimming on update (name, description, sku)", async () => {
    setAuthToken(adminAToken);
    const prod = await seedProduct(companyA.id, { name: "Before Trim" });

    await updateProduct(prod.id, {
      name: "  Trimmed Name  ",
      type: "SERVICE",
      price: 10,
      description: "  Trimmed Desc  ",
      sku: "  TRIM-SKU  ",
    });

    const dbRow = await prisma.product.findUnique({ where: { id: prod.id } });
    expect(dbRow!.name).toBe("Trimmed Name");
    expect(dbRow!.description).toBe("Trimmed Desc");
    expect(dbRow!.sku).toBe("TRIM-SKU");
  });

  it("update description to empty string (valid per schema, no min constraint)", async () => {
    setAuthToken(adminAToken);
    const prod = await seedProduct(companyA.id, { name: "Clear Desc", description: "original desc" });

    const result = await updateProduct(prod.id, {
      name: "Clear Desc",
      type: "SERVICE",
      price: 100,
      description: "",
    });
    expect(result!.description).toBe("");

    const dbRow = await prisma.product.findUnique({ where: { id: prod.id } });
    expect(dbRow!.description).toBe("");
  });

  it("multiple products with same name allowed (no unique constraint)", async () => {
    setAuthToken(adminAToken);
    const p1 = await createProduct({ name: "Duplicate Name", type: "SERVICE", price: 10 });
    const p2 = await createProduct({ name: "Duplicate Name", type: "SERVICE", price: 20 });

    expect(p1).toBeDefined();
    expect(p2).toBeDefined();
    expect(p1!.id).not.toBe(p2!.id);

    const all = await getProducts();
    expect(all.filter((p) => p.name === "Duplicate Name")).toHaveLength(2);

    const dbCount = await prisma.product.count({ where: { companyId: companyA.id, name: "Duplicate Name" } });
    expect(dbCount).toBe(2);
  });

  it("updates all fields simultaneously \u2192 verify all changed in DB", async () => {
    setAuthToken(adminAToken);
    const prod = await seedProduct(companyA.id, {
      name: "Original Name",
      description: "Original desc",
      sku: "ORIG-001",
      cost: 5,
    });

    const result = await updateProduct(prod.id, {
      name: "New Name",
      description: "New desc",
      sku: "NEW-001",
      type: "PACKAGE",
      price: 200,
      cost: 100,
      isActive: false,
    });

    expect(result!.name).toBe("New Name");
    expect(result!.description).toBe("New desc");
    expect(result!.sku).toBe("NEW-001");
    expect(result!.type).toBe("PACKAGE");
    expect(result!.price).toBe(200);
    expect(result!.cost).toBe(100);
    expect(result!.isActive).toBe(false);

    const dbRow = await prisma.product.findUnique({ where: { id: prod.id } });
    expect(dbRow!.name).toBe("New Name");
    expect(dbRow!.description).toBe("New desc");
    expect(dbRow!.sku).toBe("NEW-001");
    expect(dbRow!.type).toBe("PACKAGE");
    expect(Number(dbRow!.price)).toBe(200);
    expect(Number(dbRow!.cost)).toBe(100);
    expect(dbRow!.isActive).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════
// Mutation return shape and side effects
// ═════════════════════════════════════════════════════════════════════

describe("Mutation return shape and side effects", () => {
  it("createProduct return shape matches PRODUCT_RESPONSE_KEYS (8 fields)", async () => {
    setAuthToken(adminAToken);
    const result = await createProduct({
      name: "Create Shape",
      type: "SERVICE",
      price: 10,
      description: "desc",
      sku: "CS-001",
      cost: 5,
    });

    expect(Object.keys(result!).sort()).toEqual(PRODUCT_RESPONSE_KEYS);
    expect(result).not.toHaveProperty("companyId");
    expect(result).not.toHaveProperty("createdAt");
    expect(result).not.toHaveProperty("updatedAt");
  });

  it("updateProduct return shape matches PRODUCT_RESPONSE_KEYS (8 fields)", async () => {
    setAuthToken(adminAToken);
    const prod = await seedProduct(companyA.id, { name: "Update Shape" });

    const result = await updateProduct(prod.id, {
      name: "Update Shape Changed",
      type: "SERVICE",
      price: 20,
      description: "desc",
      sku: "US-001",
      cost: 8,
    });

    expect(Object.keys(result!).sort()).toEqual(PRODUCT_RESPONSE_KEYS);
    expect(result).not.toHaveProperty("companyId");
    expect(result).not.toHaveProperty("createdAt");
    expect(result).not.toHaveProperty("updatedAt");
  });
});

// ═════════════════════════════════════════════════════════════════════
// Decimal precision and data edge cases
// ═════════════════════════════════════════════════════════════════════

describe("Decimal precision and data edge cases", () => {
  it("price with >2 decimal places is rounded by Decimal(10,2)", async () => {
    setAuthToken(adminAToken);
    const result = await createProduct({ name: "Round Price", type: "SERVICE", price: 10.999 });
    expect(result).toBeDefined();
    expect(result!.price).toBe(11);

    const dbRow = await prisma.product.findUnique({ where: { id: result!.id } });
    expect(Number(dbRow!.price)).toBe(11);
  });

  it("update: price with >2 decimal places is rounded by Decimal(10,2)", async () => {
    setAuthToken(adminAToken);
    const prod = await seedProduct(companyA.id, { name: "Round Update", price: 10 });

    const result = await updateProduct(prod.id, { name: "Round Update", type: "SERVICE", price: 10.999 });
    expect(result!.price).toBe(11);

    const dbRow = await prisma.product.findUnique({ where: { id: prod.id } });
    expect(Number(dbRow!.price)).toBe(11);
  });

  it("Unicode in description stored and retrieved correctly", async () => {
    setAuthToken(adminAToken);
    const unicodeDesc = "תיאור בעברית ووصف بالعربية";
    const result = await createProduct({
      name: "Unicode Desc",
      type: "SERVICE",
      price: 10,
      description: unicodeDesc,
    });
    expect(result!.description).toBe(unicodeDesc);

    const dbRow = await prisma.product.findUnique({ where: { id: result!.id } });
    expect(dbRow!.description).toBe(unicodeDesc);

    const list = await getProducts();
    expect(list[0].description).toBe(unicodeDesc);
  });

  it("cost at max boundary (99_999_999.99) accepted and stored correctly", async () => {
    setAuthToken(adminAToken);
    const result = await createProduct({
      name: "Max Cost",
      type: "SERVICE",
      price: 10,
      cost: 99_999_999.99,
    });
    expect(result).toBeDefined();
    expect(result!.cost).toBe(99_999_999.99);

    const dbRow = await prisma.product.findUnique({ where: { id: result!.id } });
    expect(Number(dbRow!.cost)).toBe(99_999_999.99);
  });

  it("cost of 0 via getProducts returned as 0 (not null)", async () => {
    setAuthToken(adminAToken);
    await seedProduct(companyA.id, { name: "Zero Cost Read", cost: 0 });

    const result = await getProducts();
    expect(result[0].cost).toBe(0);
    expect(result[0].cost).not.toBeNull();
  });

  it("cost of 0 via getProductsForDropdown returned as 0 (not null)", async () => {
    setAuthToken(adminAToken);
    await seedProduct(companyA.id, { name: "Zero Cost DD", cost: 0 });

    const result = await getProductsForDropdown();
    expect(result[0].cost).toBe(0);
    expect(result[0].cost).not.toBeNull();
  });

  it("update cost from value to 0 returns 0 (not null)", async () => {
    setAuthToken(adminAToken);
    const prod = await seedProduct(companyA.id, { name: "Cost To Zero", cost: 50 });

    const result = await updateProduct(prod.id, {
      name: "Cost To Zero",
      type: "SERVICE",
      price: 100,
      cost: 0,
    });
    expect(result!.cost).toBe(0);
    expect(result!.cost).not.toBeNull();

    const dbRow = await prisma.product.findUnique({ where: { id: prod.id } });
    expect(Number(dbRow!.cost)).toBe(0);
  });
});

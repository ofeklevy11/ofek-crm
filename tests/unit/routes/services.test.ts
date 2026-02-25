import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks (must be before imports) ---
vi.mock("@/lib/permissions-server", () => ({
  getCurrentUser: vi.fn(),
}));

const mockTx = {
  product: { count: vi.fn(), create: vi.fn() },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    product: { findMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
    $transaction: vi.fn((fn: any, _opts?: any) => fn(mockTx)),
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  checkActionRateLimit: vi.fn(),
  RATE_LIMITS: {
    productRead: { prefix: "prod-read", max: 60, windowSeconds: 60 },
    productMutation: { prefix: "prod-mut", max: 20, windowSeconds: 60 },
  },
}));
vi.mock("@/lib/db-retry", () => ({
  withRetry: vi.fn((fn: any) => fn()),
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));
vi.mock("@prisma/client", () => ({
  Prisma: {
    TransactionIsolationLevel: { Serializable: "Serializable" },
  },
}));

const { mockLogError } = vi.hoisted(() => ({
  mockLogError: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: mockLogError,
  }),
}));

import {
  getProducts,
  getProductsForDropdown,
  createProduct,
  updateProduct,
} from "@/app/actions/products";
import { getCurrentUser } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { checkActionRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { withRetry } from "@/lib/db-retry";
import { revalidatePath } from "next/cache";

// --- Fixtures ---
const adminUser = {
  id: 1,
  companyId: 100,
  name: "Admin",
  email: "admin@test.com",
  role: "admin" as const,
  allowedWriteTableIds: [] as number[],
  permissions: {} as Record<string, boolean>,
};

const basicWithServices = {
  id: 2,
  companyId: 100,
  name: "ServiceUser",
  email: "svc@test.com",
  role: "basic" as const,
  allowedWriteTableIds: [] as number[],
  permissions: { canViewServices: true } as Record<string, boolean>,
};

const basicNoPerms = {
  id: 3,
  companyId: 100,
  name: "NoPerms",
  email: "none@test.com",
  role: "basic" as const,
  allowedWriteTableIds: [] as number[],
  permissions: {} as Record<string, boolean>,
};

const managerNoPerms = {
  id: 4,
  companyId: 100,
  name: "Mgr",
  email: "mgr@test.com",
  role: "manager" as const,
  allowedWriteTableIds: [] as number[],
  permissions: {} as Record<string, boolean>,
};

// --- Helpers ---
const validCreateData = { name: "Widget", type: "PRODUCT" as const, price: 29.99 };
const validUpdateData = { name: "Widget", type: "PRODUCT" as const, price: 29.99 };

async function expectZodError(fn: Promise<unknown>, field: string) {
  await expect(fn).rejects.toThrow(
    expect.objectContaining({
      name: "ZodError",
      issues: expect.arrayContaining([
        expect.objectContaining({ path: expect.arrayContaining([field]) }),
      ]),
    }),
  );
}

/**
 * Build a fake product row with string prices (simulating Prisma Decimal serialization).
 * Using strings ensures Number() conversion is actually tested — if the source removed
 * Number(p.price), the spread would leave price as a string and assertions would fail.
 */
function fakeProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: "Widget",
    description: null,
    sku: null,
    type: "PRODUCT",
    price: "29.99",
    cost: null,
    isActive: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(checkActionRateLimit).mockResolvedValue(false);
  vi.mocked(prisma.$transaction).mockImplementation((fn: any, _opts?: any) => fn(mockTx));
  mockTx.product.count.mockReset();
  mockTx.product.create.mockReset();
  mockLogError.mockReset();
});

// ─── getProducts ──────────────────────────────────────────────────────────
describe("getProducts", () => {
  it("throws Unauthorized when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(getProducts()).rejects.toThrow("Unauthorized");
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });

  it("throws Forbidden when basic user lacks canViewServices", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicNoPerms as any);
    await expect(getProducts()).rejects.toThrow("Forbidden");
  });

  it("throws Forbidden for manager without canViewServices", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(managerNoPerms as any);
    await expect(getProducts()).rejects.toThrow("Forbidden");
  });

  it("admin bypasses canViewServices check", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.product.findMany).mockResolvedValue([]);
    await expect(getProducts()).resolves.toEqual([]);
    expect(withRetry).toHaveBeenCalledTimes(1);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("throws Rate limit exceeded when rate limited", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(checkActionRateLimit).mockResolvedValue(true);
    await expect(getProducts()).rejects.toThrow("Rate limit exceeded");
  });

  it("proceeds when Redis is down (fail-open)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(checkActionRateLimit).mockRejectedValue(new Error("Redis down"));
    vi.mocked(prisma.product.findMany).mockResolvedValue([]);
    await expect(getProducts()).resolves.toEqual([]);
  });

  it("passes productRead rate limit key", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.product.findMany).mockResolvedValue([]);
    await getProducts();
    expect(checkActionRateLimit).toHaveBeenCalledWith("1", RATE_LIMITS.productRead);
  });

  it("passes dynamic user ID as rate limit identifier", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicWithServices as any);
    vi.mocked(prisma.product.findMany).mockResolvedValue([]);
    await getProducts();
    expect(checkActionRateLimit).toHaveBeenCalledWith("2", RATE_LIMITS.productRead);
  });

  it("returns products with Decimal→Number conversion on price/cost", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      fakeProduct({ price: "10.50", cost: "5.25" }),
    ] as any);

    const result = await getProducts();
    expect(result).toEqual([
      expect.objectContaining({ price: 10.5, cost: 5.25 }),
    ]);
  });

  it("null cost stays null (not converted to 0)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      fakeProduct({ price: "10.00", cost: null }),
    ] as any);

    const result = await getProducts();
    expect(result[0].cost).toBeNull();
  });

  it("cost of '0' (string from Decimal) is correctly converted to 0", async () => {
    // Prisma Decimal objects are truthy even for value 0, so the ternary
    // `p.cost ? Number(p.cost) : null` works correctly. String "0" is
    // also truthy, so this test validates the conversion path.
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      fakeProduct({ price: "10.00", cost: "0" }),
    ] as any);

    const result = await getProducts();
    expect(result[0].cost).toBe(0);
  });

  it("returns multiple products with all conversions applied", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      fakeProduct({ id: 1, price: "10.00", cost: "5.00" }),
      fakeProduct({ id: 2, price: "20.50", cost: null }),
      fakeProduct({ id: 3, price: "0.01", cost: "100.99" }),
    ] as any);

    const result = await getProducts();
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual(expect.objectContaining({ id: 1, price: 10, cost: 5 }));
    expect(result[1]).toEqual(expect.objectContaining({ id: 2, price: 20.5, cost: null }));
    expect(result[2]).toEqual(expect.objectContaining({ id: 3, price: 0.01, cost: 100.99 }));
  });

  it("scopes query to companyId, orders by name asc, takes 5000", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicWithServices as any);
    vi.mocked(prisma.product.findMany).mockResolvedValue([]);

    await getProducts();
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: 100 },
        orderBy: { name: "asc" },
        take: 5000,
      }),
    );
  });

  it("select includes all 8 fields", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.product.findMany).mockResolvedValue([]);

    await getProducts();
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: {
          id: true,
          name: true,
          description: true,
          sku: true,
          type: true,
          price: true,
          cost: true,
          isActive: true,
        },
      }),
    );
  });

  it("propagates DB error", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.product.findMany).mockRejectedValue(new Error("DB failure"));
    await expect(getProducts()).rejects.toThrow("DB failure");
    expect(prisma.product.findMany).toHaveBeenCalledTimes(1);
  });
});

// ─── getProductsForDropdown ───────────────────────────────────────────────
describe("getProductsForDropdown", () => {
  it("throws Unauthorized when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(getProductsForDropdown()).rejects.toThrow("Unauthorized");
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });

  it("does NOT check canViewServices — any authenticated user can call", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicNoPerms as any);
    vi.mocked(prisma.product.findMany).mockResolvedValue([]);
    await expect(getProductsForDropdown()).resolves.toEqual([]);
  });

  it("throws Rate limit exceeded when rate limited", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(checkActionRateLimit).mockResolvedValue(true);
    await expect(getProductsForDropdown()).rejects.toThrow("Rate limit exceeded");
  });

  it("proceeds when Redis is down (fail-open)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(checkActionRateLimit).mockRejectedValue(new Error("Redis down"));
    vi.mocked(prisma.product.findMany).mockResolvedValue([]);
    await expect(getProductsForDropdown()).resolves.toEqual([]);
  });

  it("returns active products only (isActive: true in where)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.product.findMany).mockResolvedValue([]);

    await getProductsForDropdown();
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: 100, isActive: true },
      }),
    );
  });

  it("Decimal→Number conversion", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      { id: 1, name: "A", description: null, price: "5.50", cost: "2.50" },
    ] as any);

    const result = await getProductsForDropdown();
    expect(result[0]).toEqual(expect.objectContaining({ price: 5.5, cost: 2.5 }));
    expect(withRetry).toHaveBeenCalledTimes(1);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("cost of '0' (string from Decimal) is correctly converted to 0 in dropdown", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      { id: 1, name: "A", description: null, price: "10.00", cost: "0" },
    ] as any);

    const result = await getProductsForDropdown();
    expect(result[0].cost).toBe(0);
  });

  it("orders by name asc and limits to 5000", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.product.findMany).mockResolvedValue([]);
    await getProductsForDropdown();
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { name: "asc" },
        take: 5000,
      }),
    );
  });

  it("passes productRead rate limit key", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.product.findMany).mockResolvedValue([]);
    await getProductsForDropdown();
    expect(checkActionRateLimit).toHaveBeenCalledWith("1", RATE_LIMITS.productRead);
  });

  it("selects only id, name, description, price, cost", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.product.findMany).mockResolvedValue([]);

    await getProductsForDropdown();
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { id: true, name: true, description: true, price: true, cost: true },
      }),
    );
  });

  it("propagates DB error", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.product.findMany).mockRejectedValue(new Error("DB failure"));
    await expect(getProductsForDropdown()).rejects.toThrow("DB failure");
    expect(prisma.product.findMany).toHaveBeenCalledTimes(1);
  });
});

// ─── createProduct ────────────────────────────────────────────────────────
describe("createProduct", () => {
  it("throws Unauthorized when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(createProduct(validCreateData)).rejects.toThrow("Unauthorized");
  });

  it("throws Forbidden when basic user lacks canViewServices", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicNoPerms as any);
    await expect(createProduct(validCreateData)).rejects.toThrow("Forbidden");
  });

  it("throws Rate limit exceeded when rate limited", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(checkActionRateLimit).mockResolvedValue(true);
    await expect(createProduct(validCreateData)).rejects.toThrow("Rate limit exceeded");
  });

  it("passes productMutation rate limit key", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    mockTx.product.count.mockResolvedValue(0);
    mockTx.product.create.mockResolvedValue(fakeProduct());
    await createProduct(validCreateData);
    expect(checkActionRateLimit).toHaveBeenCalledWith("1", RATE_LIMITS.productMutation);
  });

  it("rejects with Unauthorized before Zod validates (null user + invalid data)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(
      createProduct({ name: "", type: "INVALID" as any, price: -1 }),
    ).rejects.toThrow("Unauthorized");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // ── Validation ──
  it("Zod throws on empty name", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    await expectZodError(createProduct({ ...validCreateData, name: "" }), "name");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("Zod throws on name >200 chars", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    await expectZodError(createProduct({ ...validCreateData, name: "x".repeat(201) }), "name");
  });

  it("Zod throws on description >2000 chars", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    await expectZodError(createProduct({ ...validCreateData, description: "x".repeat(2001) }), "description");
  });

  it("Zod throws on SKU >100 chars", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    await expectZodError(createProduct({ ...validCreateData, sku: "x".repeat(101) }), "sku");
  });

  it("Zod throws on invalid type", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    await expectZodError(createProduct({ ...validCreateData, type: "INVALID" }), "type");
  });

  it("Zod throws on negative price", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    await expectZodError(createProduct({ ...validCreateData, price: -1 }), "price");
  });

  it("Zod throws on price exceeding 99,999,999.99", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    await expectZodError(createProduct({ ...validCreateData, price: 100_000_000 }), "price");
  });

  it("Zod throws on Infinity price", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    await expectZodError(createProduct({ ...validCreateData, price: Infinity }), "price");
  });

  it("Zod throws on NaN price", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    await expectZodError(createProduct({ ...validCreateData, price: NaN }), "price");
  });

  it("Zod throws on negative cost", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    await expectZodError(createProduct({ ...validCreateData, cost: -5 }), "cost");
  });

  it("Zod throws on cost exceeding 99,999,999.99", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    await expectZodError(createProduct({ ...validCreateData, cost: 100_000_000 }), "cost");
  });

  it("Zod throws on whitespace-only name", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    await expectZodError(createProduct({ ...validCreateData, name: "   " }), "name");
  });

  // ── Business logic ──
  it("throws ProductLimitError when product count >= 5000", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    mockTx.product.count.mockResolvedValue(5000);
    await expect(createProduct(validCreateData)).rejects.toThrow("Maximum of 5000 products reached");
  });

  it("allows creation at count 4999 (just below limit)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    mockTx.product.count.mockResolvedValue(4999);
    mockTx.product.create.mockResolvedValue(fakeProduct());
    const result = await createProduct(validCreateData);
    expect(result).toEqual(expect.objectContaining({ id: 1 }));
    expect(mockTx.product.create).toHaveBeenCalledTimes(1);
  });

  // ── Success ──
  it("creates product in Serializable transaction, revalidates /services, returns Decimal→Number", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    mockTx.product.count.mockResolvedValue(10);
    const created = fakeProduct({ price: "29.99", cost: null });
    mockTx.product.create.mockResolvedValue(created);

    const result = await createProduct(validCreateData);
    expect(result).toEqual(
      expect.objectContaining({ id: 1, name: "Widget", price: 29.99, cost: null }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/services");

    // Verify Serializable isolation
    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: "Serializable" }),
    );

    // Verify tenant isolation: companyId in create data
    expect(mockTx.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ companyId: 100, name: "Widget", type: "PRODUCT", price: 29.99 }),
      }),
    );

    // Verify count query scoped to company
    expect(mockTx.product.count).toHaveBeenCalledWith({ where: { companyId: 100 } });

    // Verify select clause
    expect(mockTx.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        select: {
          id: true, name: true, description: true, sku: true,
          type: true, price: true, cost: true, isActive: true,
        },
      }),
    );

    // Verify withRetry wraps the transaction
    expect(withRetry).toHaveBeenCalledTimes(1);
  });

  it("optional fields (description, sku, cost) can be omitted", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    mockTx.product.count.mockResolvedValue(0);
    const created = fakeProduct({ id: 5, name: "Simple", type: "SERVICE", price: "0" });
    mockTx.product.create.mockResolvedValue(created);

    const result = await createProduct({ name: "Simple", type: "SERVICE", price: 0 });
    expect(result).toEqual(
      expect.objectContaining({ id: 5, name: "Simple", type: "SERVICE", price: 0 }),
    );
    expect(mockTx.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ description: undefined, sku: undefined, cost: undefined }),
      }),
    );
  });

  it("forwards all 7 fields (including optional) to the create call", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    mockTx.product.count.mockResolvedValue(0);
    const created = fakeProduct({ description: "Desc", sku: "SKU-1", cost: "10" });
    mockTx.product.create.mockResolvedValue(created);

    await createProduct({
      name: "Widget", description: "Desc", sku: "SKU-1",
      type: "PRODUCT", price: 29.99, cost: 10,
    });
    expect(mockTx.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          companyId: 100, name: "Widget", description: "Desc",
          sku: "SKU-1", type: "PRODUCT", price: 29.99, cost: 10,
        }),
      }),
    );
  });

  it("basicWithServices user can create a product", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicWithServices as any);
    mockTx.product.count.mockResolvedValue(0);
    const created = fakeProduct({ price: "15.00", cost: "7.50" });
    mockTx.product.create.mockResolvedValue(created);

    const result = await createProduct(validCreateData);
    expect(result).toEqual(expect.objectContaining({ id: 1, price: 15, cost: 7.5 }));
    expect(revalidatePath).toHaveBeenCalledWith("/services");
  });

  // ── Prisma errors ──
  it("P2002 duplicate entry → throws 'Duplicate entry'", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    mockTx.product.count.mockResolvedValue(0);
    const prismaError = Object.assign(new Error("Unique constraint"), { code: "P2002" });
    mockTx.product.create.mockRejectedValue(prismaError);

    await expect(createProduct(validCreateData)).rejects.toThrow("Duplicate entry");
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("P2025 via createProduct → throws 'Product not found.'", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    mockTx.product.count.mockResolvedValue(0);
    const prismaError = Object.assign(new Error("Not found"), { code: "P2025" });
    mockTx.product.create.mockRejectedValue(prismaError);

    await expect(createProduct(validCreateData)).rejects.toThrow("Product not found.");
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("P2003 foreign key error → throws FK violation message", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    mockTx.product.count.mockResolvedValue(0);
    const prismaError = Object.assign(new Error("FK violation"), { code: "P2003" });
    mockTx.product.create.mockRejectedValue(prismaError);

    await expect(createProduct(validCreateData)).rejects.toThrow(
      "Cannot delete product: it is referenced by quote items. Deactivate it instead.",
    );
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("non-Prisma DB error → throws 'An unexpected error occurred'", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    mockTx.product.count.mockResolvedValue(0);
    mockTx.product.create.mockRejectedValue(new Error("random DB error"));

    await expect(createProduct(validCreateData)).rejects.toThrow("An unexpected error occurred");
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(mockLogError).toHaveBeenCalledWith(expect.any(String), expect.anything());
  });
});

// ─── updateProduct ────────────────────────────────────────────────────────
describe("updateProduct", () => {
  it("throws Unauthorized when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(updateProduct(1, validUpdateData)).rejects.toThrow("Unauthorized");
    expect(prisma.product.update).not.toHaveBeenCalled();
  });

  it("throws Forbidden when basic user lacks canViewServices", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicNoPerms as any);
    await expect(updateProduct(1, validUpdateData)).rejects.toThrow("Forbidden");
  });

  it("throws Rate limit exceeded when rate limited", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(checkActionRateLimit).mockResolvedValue(true);
    await expect(updateProduct(1, validUpdateData)).rejects.toThrow("Rate limit exceeded");
  });

  it("passes productMutation rate limit key", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.product.update).mockResolvedValue(fakeProduct() as any);
    await updateProduct(1, validUpdateData);
    expect(checkActionRateLimit).toHaveBeenCalledWith("1", RATE_LIMITS.productMutation);
  });

  it("rejects with Unauthorized before id/Zod validation (null user + invalid input)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(
      updateProduct(0, { name: "", type: "INVALID" as any, price: -1 }),
    ).rejects.toThrow("Unauthorized");
    expect(prisma.product.update).not.toHaveBeenCalled();
  });

  // ── ID validation ──
  it("throws Invalid id for id=0", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    await expect(updateProduct(0, validUpdateData)).rejects.toThrow("Invalid id");
  });

  it("throws Invalid id for id=-1", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    await expect(updateProduct(-1, validUpdateData)).rejects.toThrow("Invalid id");
  });

  it("throws Invalid id for non-integer id=1.5", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    await expect(updateProduct(1.5, validUpdateData)).rejects.toThrow("Invalid id");
  });

  // ── Zod validation ──
  it("Zod throws on empty name", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    await expectZodError(updateProduct(1, { ...validUpdateData, name: "" }), "name");
    expect(prisma.product.update).not.toHaveBeenCalled();
  });

  it("Zod throws on negative price", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    await expectZodError(updateProduct(1, { ...validUpdateData, price: -1 }), "price");
  });

  it("Zod throws on name >200 chars", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    await expectZodError(updateProduct(1, { ...validUpdateData, name: "x".repeat(201) }), "name");
  });

  it("Zod throws on non-boolean isActive", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    await expectZodError(updateProduct(1, { ...validUpdateData, isActive: "true" as any }), "isActive");
  });

  it("Zod throws on invalid type", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    await expectZodError(updateProduct(1, { ...validUpdateData, type: "BOGUS" }), "type");
  });

  it("Zod throws on price exceeding 99,999,999.99", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    await expectZodError(updateProduct(1, { ...validUpdateData, price: 100_000_000 }), "price");
  });

  it("Zod throws on cost exceeding 99,999,999.99", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    await expectZodError(updateProduct(1, { ...validUpdateData, cost: 100_000_000 }), "cost");
  });

  // ── Success ──
  it("updates product scoped to {id, companyId}, revalidates /services", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const updated = fakeProduct({ price: "50.00", cost: "25.00" });
    vi.mocked(prisma.product.update).mockResolvedValue(updated as any);

    const result = await updateProduct(1, { ...validUpdateData, price: 50, cost: 25 });
    expect(result).toEqual(expect.objectContaining({ price: 50, cost: 25 }));
    expect(prisma.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1, companyId: 100 },
        data: expect.objectContaining({ name: "Widget", type: "PRODUCT", price: 50, cost: 25 }),
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/services");
    expect(withRetry).toHaveBeenCalledTimes(1);
  });

  it("Decimal→Number conversion on update result", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.product.update).mockResolvedValue(
      fakeProduct({ price: "99.99", cost: "10.01" }) as any,
    );

    const result = await updateProduct(1, validUpdateData);
    expect(result).toEqual(expect.objectContaining({ price: 99.99, cost: 10.01 }));
  });

  it("can toggle isActive", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.product.update).mockResolvedValue(
      fakeProduct({ isActive: false }) as any,
    );

    await updateProduct(1, { ...validUpdateData, isActive: false });
    expect(prisma.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isActive: false }),
      }),
    );
  });

  it("select includes all 8 fields on update", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.product.update).mockResolvedValue(fakeProduct() as any);
    await updateProduct(1, validUpdateData);
    expect(prisma.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        select: {
          id: true,
          name: true,
          description: true,
          sku: true,
          type: true,
          price: true,
          cost: true,
          isActive: true,
        },
      }),
    );
  });

  it("basicWithServices user can update a product", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicWithServices as any);
    const updated = fakeProduct({ id: 7, price: "42.00", cost: "21.00" });
    vi.mocked(prisma.product.update).mockResolvedValue(updated as any);

    const result = await updateProduct(7, { ...validUpdateData, price: 42, cost: 21 });
    expect(result).toEqual(expect.objectContaining({ id: 7, price: 42, cost: 21 }));
    expect(prisma.product.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 7, companyId: 100 } }),
    );
  });

  // ── Prisma errors ──
  it("P2025 → throws 'Product not found.'", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const prismaError = Object.assign(new Error("Record not found"), { code: "P2025" });
    vi.mocked(prisma.product.update).mockRejectedValue(prismaError);
    await expect(updateProduct(1, validUpdateData)).rejects.toThrow("Product not found.");
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("P2002 via updateProduct → throws 'Duplicate entry'", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const prismaError = Object.assign(new Error("Unique constraint"), { code: "P2002" });
    vi.mocked(prisma.product.update).mockRejectedValue(prismaError);

    await expect(updateProduct(1, validUpdateData)).rejects.toThrow("Duplicate entry");
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("P2003 → throws foreign key violation message", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const prismaError = Object.assign(new Error("FK violation"), { code: "P2003" });
    vi.mocked(prisma.product.update).mockRejectedValue(prismaError);
    await expect(updateProduct(1, validUpdateData)).rejects.toThrow(
      "Cannot delete product: it is referenced by quote items. Deactivate it instead.",
    );
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("non-Prisma DB error → throws 'An unexpected error occurred'", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.product.update).mockRejectedValue(new Error("random"));
    await expect(updateProduct(1, validUpdateData)).rejects.toThrow("An unexpected error occurred");
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(mockLogError).toHaveBeenCalledWith(expect.any(String), expect.anything());
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────
describe("Edge cases", () => {
  beforeEach(() => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    mockTx.product.count.mockResolvedValue(0);
    mockTx.product.create.mockResolvedValue(fakeProduct());
  });

  it("XSS: name with <script> tags passes through Zod and is stored as-is", async () => {
    const xssName = '<script>alert("xss")</script>';
    const created = fakeProduct({ name: xssName });
    mockTx.product.create.mockResolvedValue(created);
    const result = await createProduct({ name: xssName, type: "SERVICE", price: 10 });
    expect(mockTx.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: xssName }),
      }),
    );
    expect(result?.name).toBe(xssName);
  });

  it("boundary: price at exact max (99,999,999.99) is accepted", async () => {
    const created = fakeProduct({ price: "99999999.99" });
    mockTx.product.create.mockResolvedValue(created);
    const result = await createProduct({ name: "Max", type: "SERVICE", price: 99_999_999.99 });
    expect(result).toEqual(expect.objectContaining({ price: 99999999.99 }));
  });

  it("boundary: price at 0 is accepted", async () => {
    const created = fakeProduct({ price: "0" });
    mockTx.product.create.mockResolvedValue(created);
    const result = await createProduct({ name: "Free", type: "SERVICE", price: 0 });
    expect(result).toEqual(expect.objectContaining({ price: 0 }));
  });

  it("Unicode: Hebrew product name is accepted", async () => {
    const created = fakeProduct({ name: "שירות ייעוץ" });
    mockTx.product.create.mockResolvedValue(created);
    const result = await createProduct({ name: "שירות ייעוץ", type: "SERVICE", price: 100 });
    expect(result).toEqual(expect.objectContaining({ name: "שירות ייעוץ" }));
  });

  it("whitespace: name with leading/trailing spaces is trimmed", async () => {
    await createProduct({ name: "  Padded  ", type: "PRODUCT", price: 5 });
    expect(mockTx.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: "Padded" }),
      }),
    );
  });

  it("boundary: name at exactly 200 chars is accepted", async () => {
    const longName = "x".repeat(200);
    const created = fakeProduct({ name: longName });
    mockTx.product.create.mockResolvedValue(created);
    const result = await createProduct({ name: longName, type: "PRODUCT", price: 10 });
    expect(result).toEqual(expect.objectContaining({ name: longName }));
  });
});

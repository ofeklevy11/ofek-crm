import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- Mocks (must be before imports) ---
vi.mock("@/lib/permissions-server", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/permissions", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/permissions")>();
  return { ...actual };
});

const mockTx = {
  quote: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  quoteItem: { deleteMany: vi.fn(), createMany: vi.fn() },
  client: { findFirst: vi.fn() },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    quote: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    quoteItem: { deleteMany: vi.fn(), createMany: vi.fn() },
    client: { findMany: vi.fn() },
    $transaction: vi.fn((fn: any, _opts?: any) => fn(mockTx)),
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  checkActionRateLimit: vi.fn(),
  RATE_LIMITS: {
    quoteRead: { prefix: "qt-read", max: 60, windowSeconds: 60 },
    quoteMutation: { prefix: "qt-mut", max: 20, windowSeconds: 60 },
  },
}));

vi.mock("@/lib/db-retry", () => ({
  withRetry: vi.fn((fn: any) => fn()),
}));

vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: vi.fn() },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@prisma/client", () => ({
  Prisma: {
    TransactionIsolationLevel: { Serializable: "Serializable" },
  },
}));

vi.mock("uploadthing/server", () => {
  const deleteFiles = vi.fn().mockResolvedValue(undefined);
  const UTApiCtor = vi.fn().mockImplementation(function (this: any) {
    this.deleteFiles = deleteFiles;
  });
  return {
    UTApi: UTApiCtor,
    __mockDeleteFiles: deleteFiles,
    __mockUTApiCtor: UTApiCtor,
  };
});

// --- Imports (after mocks) ---
import {
  getQuotes,
  getQuoteById,
  createQuote,
  updateQuote,
  trashQuote,
  restoreQuote,
  getClientsForDropdown,
} from "@/app/actions/quotes";
import { getCurrentUser } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { checkActionRateLimit } from "@/lib/rate-limit";
import { inngest } from "@/lib/inngest/client";
import { revalidatePath } from "next/cache";

// --- Fixtures ---
const VALID_CUID = "clh4n7r0v000008l5c2h6d3e7";

const adminUser = {
  id: 1,
  companyId: 100,
  name: "Admin",
  email: "admin@test.com",
  role: "admin" as const,
  allowedWriteTableIds: [] as number[],
  permissions: {} as Record<string, boolean>,
};

const basicUserCanViewQuotes = {
  id: 2,
  companyId: 100,
  name: "Viewer",
  email: "viewer@test.com",
  role: "basic" as const,
  allowedWriteTableIds: [] as number[],
  permissions: { canViewQuotes: true } as Record<string, boolean>,
};

const basicUserNoPerms = {
  id: 3,
  companyId: 100,
  name: "NoPerms",
  email: "none@test.com",
  role: "basic" as const,
  allowedWriteTableIds: [] as number[],
  permissions: {} as Record<string, boolean>,
};

/** Mimics a Prisma Decimal field */
function decimal(val: number) {
  return { toNumber: () => val };
}

function validCreateData(overrides: Record<string, any> = {}) {
  return {
    clientName: "Test Client",
    items: [{ description: "Item 1", quantity: 2, unitPrice: 50 }],
    ...overrides,
  };
}

function validUpdateData(overrides: Record<string, any> = {}) {
  return {
    clientName: "Updated Client",
    items: [{ description: "Item A", quantity: 1, unitPrice: 100 }],
    ...overrides,
  };
}

// Prevent UploadThingError from real UTApi if dynamic import leaks past mock
process.env.UPLOADTHING_TOKEN = "eytest.eytest.eytest";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(checkActionRateLimit).mockResolvedValue(false);
  vi.mocked(inngest.send).mockResolvedValue(undefined as any);
  vi.mocked(prisma.$transaction).mockImplementation((fn: any, _opts?: any) =>
    fn(mockTx),
  );
  mockTx.quote.findFirst.mockReset();
  mockTx.quote.findUnique.mockReset();
  mockTx.quote.create.mockReset();
  mockTx.quote.update.mockReset();
  mockTx.quoteItem.deleteMany.mockReset();
  mockTx.quoteItem.createMany.mockReset();
  mockTx.client.findFirst.mockReset();
});

// Let fire-and-forget promises (e.g. trashQuote UploadThing cleanup) settle
afterEach(() => new Promise((r) => setTimeout(r, 20)));

// ─── getQuotes ──────────────────────────────────────────────────────────────
describe("getQuotes", () => {
  it("throws Unauthorized when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(getQuotes()).rejects.toThrow("Unauthorized");
  });

  it("throws Forbidden when user lacks canViewQuotes", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserNoPerms as any);
    await expect(getQuotes()).rejects.toThrow("Forbidden");
  });

  it("succeeds for admin", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.quote.findMany).mockResolvedValue([]);
    const result = await getQuotes();
    expect(result.quotes).toEqual([]);
  });

  it("throws when rate-limited", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(checkActionRateLimit).mockResolvedValue(true);
    await expect(getQuotes()).rejects.toThrow("Rate limit exceeded");
  });

  it("calls checkActionRateLimit with correct args", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.quote.findMany).mockResolvedValue([]);
    await getQuotes();
    expect(checkActionRateLimit).toHaveBeenCalledWith(
      "1",
      expect.objectContaining({ prefix: "qt-read" }),
    );
  });

  it("throws on invalid cursor format", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    await expect(getQuotes(false, "not-a-cuid")).rejects.toThrow(
      "Invalid cursor format",
    );
  });

  it("accepts null cursor", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.quote.findMany).mockResolvedValue([]);
    await expect(getQuotes(false, undefined)).resolves.toBeDefined();
  });

  it("accepts valid CUID cursor", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.quote.findMany).mockResolvedValue([]);
    await expect(getQuotes(false, VALID_CUID)).resolves.toBeDefined();
  });

  it("returns quotes with Decimal converted to number", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.quote.findMany).mockResolvedValue([
      { id: "q1", total: decimal(150.5), quoteNumber: 1 },
    ] as any);
    const result = await getQuotes();
    expect(result.quotes[0].total).toBe(150.5);
    expect(typeof result.quotes[0].total).toBe("number");
  });

  it("returns nextCursor when >50 results", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const items = Array.from({ length: 51 }, (_, i) => ({
      id: `q${i}`,
      total: decimal(100),
    }));
    vi.mocked(prisma.quote.findMany).mockResolvedValue(items as any);
    const result = await getQuotes();
    expect(result.quotes).toHaveLength(50);
    expect(result.nextCursor).toBe("q49");
  });

  it("returns null nextCursor when <=50 results", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.quote.findMany).mockResolvedValue([
      { id: "q1", total: decimal(100) },
    ] as any);
    const result = await getQuotes();
    expect(result.nextCursor).toBeNull();
  });

  it("passes showTrashed to where clause", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.quote.findMany).mockResolvedValue([]);
    await getQuotes(true);
    expect(prisma.quote.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isTrashed: true }),
      }),
    );
  });

  it("defaults showTrashed to false", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.quote.findMany).mockResolvedValue([]);
    await getQuotes();
    expect(prisma.quote.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isTrashed: false }),
      }),
    );
  });

  it("scopes query to companyId", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.quote.findMany).mockResolvedValue([]);
    await getQuotes();
    expect(prisma.quote.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ companyId: 100 }),
      }),
    );
  });

  it("passes cursor with skip:1", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.quote.findMany).mockResolvedValue([]);
    await getQuotes(false, VALID_CUID);
    expect(prisma.quote.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: { id: VALID_CUID },
        skip: 1,
      }),
    );
  });

  it("returns empty array when no quotes", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.quote.findMany).mockResolvedValue([]);
    const result = await getQuotes();
    expect(result.quotes).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });

  it("propagates DB errors", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.quote.findMany).mockRejectedValue(new Error("DB down"));
    await expect(getQuotes()).rejects.toThrow("DB down");
  });

  it("succeeds for basic user with canViewQuotes", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserCanViewQuotes as any);
    vi.mocked(prisma.quote.findMany).mockResolvedValue([]);
    const result = await getQuotes();
    expect(result.quotes).toEqual([]);
  });
});

// ─── getQuoteById ───────────────────────────────────────────────────────────
describe("getQuoteById", () => {
  it("throws Unauthorized when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(getQuoteById(VALID_CUID)).rejects.toThrow("Unauthorized");
  });

  it("throws Forbidden when user lacks canViewQuotes", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserNoPerms as any);
    await expect(getQuoteById(VALID_CUID)).rejects.toThrow("Forbidden");
  });

  it("throws when rate-limited", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(checkActionRateLimit).mockResolvedValue(true);
    await expect(getQuoteById(VALID_CUID)).rejects.toThrow(
      "Rate limit exceeded",
    );
  });

  it("throws on invalid ID format", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    await expect(getQuoteById("bad-id")).rejects.toThrow(
      "Invalid quote ID format",
    );
  });

  it("returns quote with all Decimals converted", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.quote.findUnique).mockResolvedValue({
      id: VALID_CUID,
      total: decimal(500),
      items: [
        {
          id: 1,
          unitPrice: decimal(100),
          unitCost: decimal(50),
          product: {
            id: 1,
            name: "P1",
            price: decimal(120),
            cost: decimal(60),
            sku: "SKU",
          },
        },
      ],
      company: { name: "Co" },
    } as any);

    const result = await getQuoteById(VALID_CUID);
    expect(result!.total).toBe(500);
    expect(result!.items[0].unitPrice).toBe(100);
    expect(result!.items[0].unitCost).toBe(50);
    expect(result!.items[0].product!.price).toBe(120);
    expect(result!.items[0].product!.cost).toBe(60);
  });

  it("returns null when quote not found", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.quote.findUnique).mockResolvedValue(null);
    const result = await getQuoteById(VALID_CUID);
    expect(result).toBeNull();
  });

  it("scopes query to companyId", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.quote.findUnique).mockResolvedValue(null);
    await getQuoteById(VALID_CUID);
    expect(prisma.quote.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: VALID_CUID, companyId: 100 },
      }),
    );
  });

  it("handles null product on item", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.quote.findUnique).mockResolvedValue({
      id: VALID_CUID,
      total: decimal(200),
      items: [
        {
          id: 1,
          unitPrice: decimal(100),
          unitCost: null,
          product: null,
        },
      ],
      company: { name: "Co" },
    } as any);

    const result = await getQuoteById(VALID_CUID);
    expect(result!.items[0].product).toBeNull();
    expect(result!.items[0].unitCost).toBeNull();
  });

  it("handles null product.cost", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.quote.findUnique).mockResolvedValue({
      id: VALID_CUID,
      total: decimal(200),
      items: [
        {
          id: 1,
          unitPrice: decimal(100),
          unitCost: null,
          product: {
            id: 1,
            name: "P1",
            price: decimal(100),
            cost: null,
            sku: null,
          },
        },
      ],
      company: { name: "Co" },
    } as any);

    const result = await getQuoteById(VALID_CUID);
    expect(result!.items[0].product!.cost).toBeNull();
  });
});

// ─── createQuote ────────────────────────────────────────────────────────────
describe("createQuote", () => {
  beforeEach(() => {
    mockTx.quote.findFirst.mockResolvedValue(null); // no existing quotes
    mockTx.quote.create.mockResolvedValue({ id: VALID_CUID });
    mockTx.client.findFirst.mockResolvedValue({ id: 1 });
  });

  it("throws Unauthorized when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(createQuote(validCreateData())).rejects.toThrow(
      "Unauthorized",
    );
  });

  it("throws Forbidden when user lacks canViewQuotes", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserNoPerms as any);
    await expect(createQuote(validCreateData())).rejects.toThrow("Forbidden");
  });

  it("throws when rate-limited", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(checkActionRateLimit).mockResolvedValue(true);
    await expect(createQuote(validCreateData())).rejects.toThrow(
      "Rate limit exceeded",
    );
  });

  it("uses quoteMutation rate limit key", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    await createQuote(validCreateData());
    expect(checkActionRateLimit).toHaveBeenCalledWith(
      "1",
      expect.objectContaining({ prefix: "qt-mut" }),
    );
  });

  it("throws on missing clientName", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    await expect(
      createQuote({ clientName: "", items: [{ description: "A", quantity: 1, unitPrice: 10 }] }),
    ).rejects.toThrow("Client name is required");
  });

  it("throws on empty items", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    await expect(
      createQuote({ clientName: "X", items: [] }),
    ).rejects.toThrow("At least one item is required");
  });

  it("throws on >200 items", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const items = Array.from({ length: 201 }, (_, i) => ({
      description: `Item ${i}`,
      quantity: 1,
      unitPrice: 10,
    }));
    await expect(
      createQuote({ clientName: "X", items }),
    ).rejects.toThrow(/Too big|at most|<=200/i);
  });

  it("throws on negative quantity", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    await expect(
      createQuote(validCreateData({ items: [{ description: "A", quantity: -1, unitPrice: 10 }] })),
    ).rejects.toThrow(/Too small|positive|>0/i);
  });

  it("throws on quantity >1M", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    await expect(
      createQuote(
        validCreateData({
          items: [{ description: "A", quantity: 1_000_001, unitPrice: 10 }],
        }),
      ),
    ).rejects.toThrow(/too_big|1000000/i);
  });

  it("throws on unitPrice >99M", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    await expect(
      createQuote(
        validCreateData({
          items: [{ description: "A", quantity: 1, unitPrice: 100_000_000 }],
        }),
      ),
    ).rejects.toThrow(/too_big|99999999/i);
  });

  it("throws on invalid currency", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    await expect(
      createQuote(validCreateData({ currency: "JPY" })),
    ).rejects.toThrow(/Invalid option|Invalid enum/i);
  });

  it("throws on percent discount >100", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    await expect(
      createQuote(
        validCreateData({ discountType: "percent", discountValue: 101 }),
      ),
    ).rejects.toThrow("Percent discount cannot exceed 100");
  });

  it("allows exactly 100% discount", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    await expect(
      createQuote(
        validCreateData({ discountType: "percent", discountValue: 100 }),
      ),
    ).resolves.toEqual({ id: VALID_CUID });
  });

  it("creates with correct total", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const data = validCreateData({
      items: [
        { description: "A", quantity: 3, unitPrice: 10 },
        { description: "B", quantity: 2, unitPrice: 25 },
      ],
    });
    await createQuote(data);
    // total = 3*10 + 2*25 = 80
    expect(mockTx.quote.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ total: 80 }),
      }),
    );
  });

  it("returns { id }", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const result = await createQuote(validCreateData());
    expect(result).toEqual({ id: VALID_CUID });
  });

  it("increments quoteNumber from last", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    mockTx.quote.findFirst.mockResolvedValue({ quoteNumber: 42 });
    await createQuote(validCreateData());
    expect(mockTx.quote.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ quoteNumber: 43 }),
      }),
    );
  });

  it("starts at quoteNumber 1 when no previous quotes", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    mockTx.quote.findFirst.mockResolvedValue(null);
    await createQuote(validCreateData());
    expect(mockTx.quote.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ quoteNumber: 1 }),
      }),
    );
  });

  it("creates items via nested create in transaction", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const data = validCreateData({
      items: [
        { description: "A", quantity: 1, unitPrice: 10 },
        { description: "B", quantity: 2, unitPrice: 20 },
      ],
    });
    await createQuote(data);
    expect(mockTx.quote.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          items: {
            create: expect.arrayContaining([
              expect.objectContaining({ description: "A", quantity: 1 }),
              expect.objectContaining({ description: "B", quantity: 2 }),
            ]),
          },
        }),
      }),
    );
  });

  it("validates clientId inside transaction", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    mockTx.client.findFirst.mockResolvedValue({ id: 5 });
    await createQuote(validCreateData({ clientId: 5 }));
    expect(mockTx.client.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 5, companyId: 100, deletedAt: null },
      }),
    );
  });

  it("throws on invalid clientId", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    mockTx.client.findFirst.mockResolvedValue(null);
    await expect(
      createQuote(validCreateData({ clientId: 999 })),
    ).rejects.toThrow("Failed to create quote");
  });

  it("retries P2034 up to 2 times", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const p2034Error = Object.assign(new Error("Conflict"), { code: "P2034" });
    vi.mocked(prisma.$transaction)
      .mockRejectedValueOnce(p2034Error)
      .mockRejectedValueOnce(p2034Error)
      .mockImplementationOnce((fn: any, _opts?: any) => fn(mockTx));
    const result = await createQuote(validCreateData());
    expect(result).toEqual({ id: VALID_CUID });
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });

  it("throws after P2034 retry limit", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const p2034Error = Object.assign(new Error("Conflict"), { code: "P2034" });
    vi.mocked(prisma.$transaction)
      .mockRejectedValueOnce(p2034Error)
      .mockRejectedValueOnce(p2034Error)
      .mockRejectedValueOnce(p2034Error);
    await expect(createQuote(validCreateData())).rejects.toThrow(
      "Failed to create quote",
    );
  });

  it("does not retry non-P2034 errors", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.$transaction).mockRejectedValueOnce(
      new Error("Some other error"),
    );
    await expect(createQuote(validCreateData())).rejects.toThrow(
      "Failed to create quote",
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("triggers inngest PDF generation", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    await createQuote(validCreateData());
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "pdf/generate-quote",
        data: expect.objectContaining({
          quoteId: VALID_CUID,
          companyId: 100,
        }),
      }),
    );
  });

  it("revalidates /quotes", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    await createQuote(validCreateData());
    expect(revalidatePath).toHaveBeenCalledWith("/quotes");
  });

  it("doesn't throw when inngest fails", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(inngest.send).mockRejectedValue(new Error("Inngest down"));
    const result = await createQuote(validCreateData());
    expect(result).toEqual({ id: VALID_CUID });
  });

  it("sets status to DRAFT", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    await createQuote(validCreateData());
    expect(mockTx.quote.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "DRAFT" }),
      }),
    );
  });

  it("generates a shareToken", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    await createQuote(validCreateData());
    const createCall = mockTx.quote.create.mock.calls[0][0];
    expect(createCall.data.shareToken).toBeTruthy();
    expect(typeof createCall.data.shareToken).toBe("string");
  });

  it("defaults currency to ILS when not provided", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    await createQuote(validCreateData());
    expect(mockTx.quote.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ currency: "ILS" }),
      }),
    );
  });

  it("defaults isPriceWithVat to false", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    await createQuote(validCreateData());
    expect(mockTx.quote.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isPriceWithVat: false }),
      }),
    );
  });

  it("skips client validation when no clientId", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    await createQuote(validCreateData());
    expect(mockTx.client.findFirst).not.toHaveBeenCalled();
  });

  it("uses Serializable isolation level", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    await createQuote(validCreateData());
    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: "Serializable" }),
    );
  });
});

// ─── updateQuote ────────────────────────────────────────────────────────────
describe("updateQuote", () => {
  beforeEach(() => {
    mockTx.quote.findUnique.mockResolvedValue({ pdfUrl: "https://utfs.io/old.pdf" });
    mockTx.quote.update.mockResolvedValue({});
    mockTx.quoteItem.deleteMany.mockResolvedValue({ count: 1 });
    mockTx.quoteItem.createMany.mockResolvedValue({ count: 1 });
    mockTx.client.findFirst.mockResolvedValue({ id: 1 });
  });

  it("throws Unauthorized when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(updateQuote(VALID_CUID, validUpdateData())).rejects.toThrow(
      "Unauthorized",
    );
  });

  it("throws Forbidden when user lacks canViewQuotes", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserNoPerms as any);
    await expect(updateQuote(VALID_CUID, validUpdateData())).rejects.toThrow(
      "Forbidden",
    );
  });

  it("throws when rate-limited", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(checkActionRateLimit).mockResolvedValue(true);
    await expect(updateQuote(VALID_CUID, validUpdateData())).rejects.toThrow(
      "Rate limit exceeded",
    );
  });

  it("throws on invalid ID", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    await expect(updateQuote("bad-id", validUpdateData())).rejects.toThrow(
      "Invalid quote ID format",
    );
  });

  it("throws on invalid data", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    await expect(
      updateQuote(VALID_CUID, { clientName: "", items: [] }),
    ).rejects.toThrow("Client name is required");
  });

  it("allows empty items array", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    await expect(
      updateQuote(VALID_CUID, validUpdateData({ items: [] })),
    ).resolves.toBeUndefined();
  });

  it("allows valid status", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    await expect(
      updateQuote(VALID_CUID, validUpdateData({ status: "SENT" })),
    ).resolves.toBeUndefined();
  });

  it("throws on invalid status", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    await expect(
      updateQuote(VALID_CUID, validUpdateData({ status: "INVALID" })),
    ).rejects.toThrow(/Invalid option|Invalid enum/i);
  });

  it("updates quote + replaces items in transaction", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    await updateQuote(VALID_CUID, validUpdateData());
    expect(mockTx.quote.update).toHaveBeenCalled();
    expect(mockTx.quoteItem.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { quoteId: VALID_CUID } }),
    );
    expect(mockTx.quoteItem.createMany).toHaveBeenCalled();
  });

  it("calculates new total", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    await updateQuote(
      VALID_CUID,
      validUpdateData({
        items: [
          { description: "A", quantity: 5, unitPrice: 20 },
          { description: "B", quantity: 3, unitPrice: 10 },
        ],
      }),
    );
    // total = 5*20 + 3*10 = 130
    expect(mockTx.quote.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ total: 130 }),
      }),
    );
  });

  it("reads old pdfUrl before nulling", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    mockTx.quote.findUnique.mockResolvedValue({
      pdfUrl: "https://utfs.io/old-file.pdf",
    });
    await updateQuote(VALID_CUID, validUpdateData());
    expect(mockTx.quote.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: VALID_CUID, companyId: 100 },
        select: { pdfUrl: true },
      }),
    );
    expect(mockTx.quote.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ pdfUrl: null }),
      }),
    );
  });

  it("validates clientId inside transaction", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    mockTx.client.findFirst.mockResolvedValue({ id: 5 });
    await updateQuote(VALID_CUID, validUpdateData({ clientId: 5 }));
    expect(mockTx.client.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 5, companyId: 100, deletedAt: null },
      }),
    );
  });

  it("throws on invalid clientId", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    mockTx.client.findFirst.mockResolvedValue(null);
    await expect(
      updateQuote(VALID_CUID, validUpdateData({ clientId: 999 })),
    ).rejects.toThrow("Failed to update quote");
  });

  it("throws 'Failed to update quote' on transaction error", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.$transaction).mockRejectedValue(new Error("tx fail"));
    await expect(
      updateQuote(VALID_CUID, validUpdateData()),
    ).rejects.toThrow("Failed to update quote");
  });

  it("triggers inngest with oldPdfUrl", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    mockTx.quote.findUnique.mockResolvedValue({
      pdfUrl: "https://utfs.io/old.pdf",
    });
    await updateQuote(VALID_CUID, validUpdateData());
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "pdf/generate-quote",
        data: expect.objectContaining({
          quoteId: VALID_CUID,
          companyId: 100,
          oldPdfUrl: "https://utfs.io/old.pdf",
        }),
      }),
    );
  });

  it("revalidates /quotes and /quotes/:id", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    await updateQuote(VALID_CUID, validUpdateData());
    expect(revalidatePath).toHaveBeenCalledWith("/quotes");
    expect(revalidatePath).toHaveBeenCalledWith(`/quotes/${VALID_CUID}`);
  });

  it("doesn't throw when inngest fails", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(inngest.send).mockRejectedValue(new Error("Inngest down"));
    await expect(
      updateQuote(VALID_CUID, validUpdateData()),
    ).resolves.toBeUndefined();
  });

  it("skips createMany when items array is empty", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    await updateQuote(VALID_CUID, validUpdateData({ items: [] }));
    expect(mockTx.quoteItem.createMany).not.toHaveBeenCalled();
  });

  it("skips client validation when no clientId", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    await updateQuote(VALID_CUID, validUpdateData());
    expect(mockTx.client.findFirst).not.toHaveBeenCalled();
  });
});

// ─── trashQuote ─────────────────────────────────────────────────────────────
describe("trashQuote", () => {
  beforeEach(() => {
    mockTx.quote.findUnique.mockResolvedValue({ pdfUrl: null });
    mockTx.quote.update.mockResolvedValue({});
  });

  it("throws Unauthorized when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(trashQuote(VALID_CUID)).rejects.toThrow("Unauthorized");
  });

  it("throws Forbidden when user lacks canViewQuotes", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserNoPerms as any);
    await expect(trashQuote(VALID_CUID)).rejects.toThrow("Forbidden");
  });

  it("throws on invalid ID", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    await expect(trashQuote("bad-id")).rejects.toThrow(
      "Invalid quote ID format",
    );
  });

  it("sets isTrashed=true and pdfUrl=null", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    await trashQuote(VALID_CUID);
    expect(mockTx.quote.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { isTrashed: true, pdfUrl: null },
      }),
    );
  });

  it("reads old pdfUrl atomically in transaction", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    mockTx.quote.findUnique.mockResolvedValue({
      pdfUrl: "https://utfs.io/some.pdf",
    });
    await trashQuote(VALID_CUID);
    expect(mockTx.quote.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: VALID_CUID, companyId: 100 },
        select: { pdfUrl: true },
      }),
    );
  });

  it("revalidates /quotes", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    await trashQuote(VALID_CUID);
    expect(revalidatePath).toHaveBeenCalledWith("/quotes");
  });

  it("triggers UploadThing cleanup when pdfUrl exists", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    mockTx.quote.findUnique.mockResolvedValue({
      pdfUrl: "https://utfs.io/f/abc123",
    });
    await trashQuote(VALID_CUID);
    const { __mockUTApiCtor, __mockDeleteFiles } = await import("uploadthing/server") as any;
    // Wait for fire-and-forget dynamic import chain to settle
    await vi.waitFor(() => {
      expect(__mockUTApiCtor).toHaveBeenCalled();
      expect(__mockDeleteFiles).toHaveBeenCalledWith(["abc123"]);
    }, { timeout: 500, interval: 20 });
  });

  it("skips UploadThing cleanup when no pdfUrl", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    mockTx.quote.findUnique.mockResolvedValue({ pdfUrl: null });
    await trashQuote(VALID_CUID);
    // Allow any potential microtasks to settle
    await new Promise((r) => setTimeout(r, 100));
    const { __mockUTApiCtor } = await import("uploadthing/server") as any;
    // clearAllMocks in beforeEach resets call history, so no calls expected
    expect(__mockUTApiCtor).not.toHaveBeenCalled();
  });

  it("doesn't throw on cleanup failure", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const { __mockDeleteFiles } = await import("uploadthing/server") as any;
    __mockDeleteFiles.mockRejectedValueOnce(new Error("UT down"));
    mockTx.quote.findUnique.mockResolvedValue({
      pdfUrl: "https://utfs.io/f/abc",
    });
    // Even if cleanup fails, trashQuote should not throw
    await expect(trashQuote(VALID_CUID)).resolves.toBeUndefined();
  });
});

// ─── restoreQuote ───────────────────────────────────────────────────────────
describe("restoreQuote", () => {
  it("throws Unauthorized when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(restoreQuote(VALID_CUID)).rejects.toThrow("Unauthorized");
  });

  it("throws Forbidden when user lacks canViewQuotes", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserNoPerms as any);
    await expect(restoreQuote(VALID_CUID)).rejects.toThrow("Forbidden");
  });

  it("throws on invalid ID", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    await expect(restoreQuote("bad-id")).rejects.toThrow(
      "Invalid quote ID format",
    );
  });

  it("sets isTrashed=false", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.quote.update).mockResolvedValue({} as any);
    await restoreQuote(VALID_CUID);
    expect(prisma.quote.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { isTrashed: false },
      }),
    );
  });

  it("scopes to companyId", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.quote.update).mockResolvedValue({} as any);
    await restoreQuote(VALID_CUID);
    expect(prisma.quote.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: VALID_CUID, companyId: 100 },
      }),
    );
  });

  it("triggers inngest PDF regeneration", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.quote.update).mockResolvedValue({} as any);
    await restoreQuote(VALID_CUID);
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "pdf/generate-quote",
        data: expect.objectContaining({
          quoteId: VALID_CUID,
          companyId: 100,
        }),
      }),
    );
  });

  it("revalidates /quotes", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.quote.update).mockResolvedValue({} as any);
    await restoreQuote(VALID_CUID);
    expect(revalidatePath).toHaveBeenCalledWith("/quotes");
  });

  it("doesn't throw when inngest fails", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.quote.update).mockResolvedValue({} as any);
    vi.mocked(inngest.send).mockRejectedValue(new Error("Inngest down"));
    await expect(restoreQuote(VALID_CUID)).resolves.toBeUndefined();
  });
});

// ─── getClientsForDropdown ──────────────────────────────────────────────────
describe("getClientsForDropdown", () => {
  it("throws Unauthorized when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(getClientsForDropdown()).rejects.toThrow("Unauthorized");
  });

  it("throws Forbidden when user lacks canViewQuotes", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserNoPerms as any);
    await expect(getClientsForDropdown()).rejects.toThrow("Forbidden");
  });

  it("returns clients list", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const clients = [{ id: 1, name: "Acme", email: "a@b.com", phone: "123" }];
    vi.mocked(prisma.client.findMany).mockResolvedValue(clients as any);
    const result = await getClientsForDropdown();
    expect(result).toEqual(clients);
  });

  it("filters by companyId and deletedAt=null", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.client.findMany).mockResolvedValue([]);
    await getClientsForDropdown();
    expect(prisma.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: 100, deletedAt: null },
      }),
    );
  });

  it("limits to 500 results", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.client.findMany).mockResolvedValue([]);
    await getClientsForDropdown();
    expect(prisma.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 500 }),
    );
  });

  it("orders by name ascending", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.client.findMany).mockResolvedValue([]);
    await getClientsForDropdown();
    expect(prisma.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { name: "asc" } }),
    );
  });
});

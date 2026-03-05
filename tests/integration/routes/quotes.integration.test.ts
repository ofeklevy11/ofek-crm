/**
 * Integration tests for quotes server actions and download API routes.
 *
 * REAL: Prisma (test DB), auth token signing/verification, permission checks,
 *       Zod validation, withRetry, isSafeStorageUrl, tokensMatch.
 * MOCKED: next/headers, react cache, @/lib/redis, @/lib/session,
 *         @/lib/security/audit-security, next/cache, @/lib/inngest/client,
 *         uploadthing/server, @/lib/logger (global mock in tests/setup.ts).
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";

// ── Module mocks (hoisted by Vitest) ───────────────────────────────

// 1. React cache → passthrough
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return { ...actual, cache: (fn: any) => fn };
});

// 2. next/headers → mocked cookies() + headers()
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
  headers: vi.fn(async () => ({
    get: (name: string) => {
      if (name === "x-nonce") return "test-nonce";
      return null;
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

// 7. Inngest → mock send
vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: vi.fn().mockResolvedValue(undefined) },
}));

// 8. uploadthing/server → mock UTApi
vi.mock("uploadthing/server", () => ({
  UTApi: vi.fn().mockImplementation(() => ({
    deleteFiles: vi.fn().mockResolvedValue(undefined),
  })),
}));

// ── Imports (AFTER mocks) ──────────────────────────────────────────
import { prisma } from "@/lib/prisma";
import { resetDb } from "@/test-utils/resetDb";
import {
  setAuthToken,
  signTokenForUser,
  seedCompany,
  seedUser,
  buildGetRequest,
  makeParams,
} from "@/tests/integration/helpers/integration-setup";

import {
  createQuote,
  getQuotes,
  getQuoteById,
  updateQuote,
  trashQuote,
  restoreQuote,
  getClientsForDropdown,
} from "@/app/actions/quotes";

import { GET as GET_AUTH_DOWNLOAD } from "@/app/api/quotes/[id]/download/route";
import { GET as GET_PUBLIC_DOWNLOAD } from "@/app/api/p/quotes/[id]/download/route";

import { revalidatePath } from "next/cache";
import { inngest } from "@/lib/inngest/client";

// ── Seeded data ────────────────────────────────────────────────────
let companyA: { id: number };
let companyB: { id: number };

let adminA: { id: number };
let viewerA: { id: number };
let noPermsA: { id: number };
let adminB: { id: number };

let adminAToken: string;
let viewerAToken: string;
let noPermsAToken: string;
let adminBToken: string;

let clientA: { id: number; name: string };
let deletedClientA: { id: number };
let productA: { id: number };

// ── Helpers ────────────────────────────────────────────────────────

function validCreatePayload(overrides: Record<string, any> = {}) {
  return {
    clientName: "Test Client",
    items: [
      { description: "Item 1", quantity: 2, unitPrice: 100 },
    ],
    ...overrides,
  };
}

function validUpdatePayload(overrides: Record<string, any> = {}) {
  return {
    clientName: "Updated Client",
    items: [
      { description: "Updated Item", quantity: 1, unitPrice: 200 },
    ],
    ...overrides,
  };
}

/** Create a quote in DB and return it for test use. */
async function createTestQuote(overrides: Record<string, any> = {}) {
  setAuthToken(adminAToken);
  const result = await createQuote(validCreatePayload(overrides));
  return result;
}

// ── Lifecycle ──────────────────────────────────────────────────────

beforeAll(async () => {
  await resetDb();

  // Companies
  companyA = await seedCompany({ name: "Quotes Co A" });
  companyB = await seedCompany({ name: "Quotes Co B" });

  // Users
  adminA = await seedUser(companyA.id, {
    role: "admin",
    name: "Admin A",
  });
  viewerA = await seedUser(companyA.id, {
    role: "basic",
    name: "Viewer A",
    permissions: { canViewQuotes: true },
  });
  noPermsA = await seedUser(companyA.id, {
    role: "basic",
    name: "NoPerms A",
    permissions: {},
  });
  adminB = await seedUser(companyB.id, {
    role: "admin",
    name: "Admin B",
  });

  // Clients
  clientA = await prisma.client.create({
    data: { companyId: companyA.id, name: "Client A", email: "clienta@test.com", phone: "123" },
  });
  deletedClientA = await prisma.client.create({
    data: { companyId: companyA.id, name: "Deleted Client", deletedAt: new Date() },
  });

  // Product
  productA = await prisma.product.create({
    data: { companyId: companyA.id, name: "Product A", price: 50.00, cost: 30.00 },
  });

  // Tokens
  adminAToken = signTokenForUser(adminA.id);
  viewerAToken = signTokenForUser(viewerA.id);
  noPermsAToken = signTokenForUser(noPermsA.id);
  adminBToken = signTokenForUser(adminB.id);
}, 30_000);

afterEach(async () => {
  setAuthToken(null);
  vi.clearAllMocks();

  // Cleanup quotes created during tests
  await prisma.quoteItem.deleteMany({
    where: { quote: { companyId: { in: [companyA.id, companyB.id] } } },
  });
  await prisma.quote.deleteMany({
    where: { companyId: { in: [companyA.id, companyB.id] } },
  });
});

afterAll(async () => {
  await resetDb();
  await prisma.$disconnect();
}, 15_000);

// ════════════════════════════════════════════════════════════════════
// 1. Auth & Permissions
// ════════════════════════════════════════════════════════════════════
describe("Auth & Permissions", () => {
  it("throws Unauthorized when no token is set", async () => {
    setAuthToken(null);
    await expect(getQuotes()).rejects.toThrow("Unauthorized");
  });

  it("throws Forbidden when user lacks canViewQuotes", async () => {
    setAuthToken(noPermsAToken);
    await expect(getQuotes()).rejects.toThrow("Forbidden");
  });

  it("admin succeeds (implicit canViewQuotes)", async () => {
    setAuthToken(adminAToken);
    const result = await getQuotes();
    expect(result).toHaveProperty("quotes");
  });

  it("basic user with canViewQuotes succeeds", async () => {
    setAuthToken(viewerAToken);
    const result = await getQuotes();
    expect(result).toHaveProperty("quotes");
  });
});

// ════════════════════════════════════════════════════════════════════
// 2. createQuote
// ════════════════════════════════════════════════════════════════════
describe("createQuote", () => {
  // ── Validation ──────────────────────────────────────────────────
  describe("validation", () => {
    beforeEach(() => setAuthToken(adminAToken));

    it("rejects empty clientName", async () => {
      await expect(createQuote(validCreatePayload({ clientName: "" }))).rejects.toThrow();
    });

    it("rejects clientName > 200 chars", async () => {
      await expect(
        createQuote(validCreatePayload({ clientName: "x".repeat(201) })),
      ).rejects.toThrow();
    });

    it("rejects empty items array", async () => {
      await expect(createQuote(validCreatePayload({ items: [] }))).rejects.toThrow();
    });

    it("rejects > 200 items", async () => {
      const items = Array.from({ length: 201 }, (_, i) => ({
        description: `Item ${i}`,
        quantity: 1,
        unitPrice: 10,
      }));
      await expect(createQuote(validCreatePayload({ items }))).rejects.toThrow();
    });

    it("rejects item with empty description", async () => {
      await expect(
        createQuote(validCreatePayload({ items: [{ description: "", quantity: 1, unitPrice: 10 }] })),
      ).rejects.toThrow();
    });

    it("rejects item description > 2000 chars", async () => {
      await expect(
        createQuote(
          validCreatePayload({ items: [{ description: "x".repeat(2001), quantity: 1, unitPrice: 10 }] }),
        ),
      ).rejects.toThrow();
    });

    it("rejects negative quantity", async () => {
      await expect(
        createQuote(validCreatePayload({ items: [{ description: "X", quantity: -1, unitPrice: 10 }] })),
      ).rejects.toThrow();
    });

    it("rejects zero quantity", async () => {
      await expect(
        createQuote(validCreatePayload({ items: [{ description: "X", quantity: 0, unitPrice: 10 }] })),
      ).rejects.toThrow();
    });

    it("rejects quantity overflow (> 1,000,000)", async () => {
      await expect(
        createQuote(validCreatePayload({ items: [{ description: "X", quantity: 1_000_001, unitPrice: 10 }] })),
      ).rejects.toThrow();
    });

    it("rejects unitPrice overflow (> 99,999,999.99)", async () => {
      await expect(
        createQuote(
          validCreatePayload({ items: [{ description: "X", quantity: 1, unitPrice: 100_000_000 }] }),
        ),
      ).rejects.toThrow();
    });

    it("rejects negative unitPrice", async () => {
      await expect(
        createQuote(validCreatePayload({ items: [{ description: "X", quantity: 1, unitPrice: -5 }] })),
      ).rejects.toThrow();
    });

    it("rejects invalid currency", async () => {
      await expect(
        createQuote(validCreatePayload({ currency: "BTC" })),
      ).rejects.toThrow();
    });

    it("rejects percent discount > 100", async () => {
      await expect(
        createQuote(validCreatePayload({ discountType: "percent", discountValue: 101 })),
      ).rejects.toThrow();
    });

    it("rejects exchangeRate of 0", async () => {
      await expect(
        createQuote(validCreatePayload({ exchangeRate: 0 })),
      ).rejects.toThrow();
    });

    it("rejects exchangeRate overflow (> 999,999)", async () => {
      await expect(
        createQuote(validCreatePayload({ exchangeRate: 1_000_000 })),
      ).rejects.toThrow();
    });

    it("rejects invalid email", async () => {
      await expect(
        createQuote(validCreatePayload({ clientEmail: "not-an-email" })),
      ).rejects.toThrow();
    });

    it("rejects clientPhone > 50 chars", async () => {
      await expect(
        createQuote(validCreatePayload({ clientPhone: "x".repeat(51) })),
      ).rejects.toThrow();
    });

    it("rejects clientTaxId > 50 chars", async () => {
      await expect(
        createQuote(validCreatePayload({ clientTaxId: "x".repeat(51) })),
      ).rejects.toThrow();
    });

    it("rejects clientAddress > 500 chars", async () => {
      await expect(
        createQuote(validCreatePayload({ clientAddress: "x".repeat(501) })),
      ).rejects.toThrow();
    });

    it("rejects title > 300 chars", async () => {
      await expect(
        createQuote(validCreatePayload({ title: "x".repeat(301) })),
      ).rejects.toThrow();
    });
  });

  // ── Happy path ──────────────────────────────────────────────────
  describe("happy path", () => {
    beforeEach(() => setAuthToken(adminAToken));

    it("creates minimal quote and verifies DB record", async () => {
      const result = await createQuote(validCreatePayload());
      expect(result).toHaveProperty("id");

      const db = await prisma.quote.findUnique({ where: { id: result.id }, include: { items: true } });
      expect(db).not.toBeNull();
      expect(db!.clientName).toBe("Test Client");
      expect(db!.companyId).toBe(companyA.id);
    });

    it("returns { id } with cuid format", async () => {
      const result = await createQuote(validCreatePayload());
      expect(result.id).toMatch(/^c[a-z0-9]{24,}$/);
    });

    it("sets status to DRAFT", async () => {
      const result = await createQuote(validCreatePayload());
      const db = await prisma.quote.findUnique({ where: { id: result.id } });
      expect(db!.status).toBe("DRAFT");
    });

    it("calculates total correctly", async () => {
      const items = [
        { description: "A", quantity: 3, unitPrice: 100 },
        { description: "B", quantity: 2, unitPrice: 50 },
      ];
      const result = await createQuote(validCreatePayload({ items }));
      const db = await prisma.quote.findUnique({ where: { id: result.id } });
      // 3*100 + 2*50 = 400
      expect(db!.total.toNumber()).toBe(400);
    });

    it("creates QuoteItem records", async () => {
      const items = [
        { description: "Item A", quantity: 1, unitPrice: 10 },
        { description: "Item B", quantity: 2, unitPrice: 20 },
      ];
      const result = await createQuote(validCreatePayload({ items }));
      const dbItems = await prisma.quoteItem.findMany({ where: { quoteId: result.id } });
      expect(dbItems).toHaveLength(2);
    });

    it("generates a shareToken", async () => {
      const result = await createQuote(validCreatePayload());
      const db = await prisma.quote.findUnique({ where: { id: result.id } });
      expect(db!.shareToken).toBeTruthy();
      // UUID format
      expect(db!.shareToken).toMatch(/^[0-9a-f-]{36}$/);
    });

    it("defaults currency to ILS and isPriceWithVat to false", async () => {
      const result = await createQuote(validCreatePayload());
      const db = await prisma.quote.findUnique({ where: { id: result.id } });
      expect(db!.currency).toBe("ILS");
      expect(db!.isPriceWithVat).toBe(false);
    });

    it("stores optional fields", async () => {
      const result = await createQuote(
        validCreatePayload({
          clientEmail: "test@test.com",
          clientPhone: "050-1234567",
          clientTaxId: "123456789",
          clientAddress: "123 Main St",
          title: "My Quote",
          currency: "USD",
          isPriceWithVat: true,
        }),
      );
      const db = await prisma.quote.findUnique({ where: { id: result.id } });
      expect(db!.clientEmail).toBe("test@test.com");
      expect(db!.clientPhone).toBe("050-1234567");
      expect(db!.clientTaxId).toBe("123456789");
      expect(db!.clientAddress).toBe("123 Main St");
      expect(db!.title).toBe("My Quote");
      expect(db!.currency).toBe("USD");
      expect(db!.isPriceWithVat).toBe(true);
    });

    it("stores Decimal fields correctly (unitCost, exchangeRate)", async () => {
      const result = await createQuote(
        validCreatePayload({
          exchangeRate: 3.7512,
          items: [{ description: "X", quantity: 1, unitPrice: 99.99, unitCost: 55.50 }],
        }),
      );
      const db = await prisma.quote.findUnique({ where: { id: result.id }, include: { items: true } });
      expect(db!.exchangeRate!.toNumber()).toBeCloseTo(3.7512, 4);
      expect(db!.items[0].unitCost!.toNumber()).toBeCloseTo(55.50, 2);
    });
  });

  // ── Quote number auto-increment ─────────────────────────────────
  describe("quote number auto-increment", () => {
    beforeEach(() => setAuthToken(adminAToken));

    it("first quote gets quoteNumber 1", async () => {
      const result = await createQuote(validCreatePayload());
      const db = await prisma.quote.findUnique({ where: { id: result.id } });
      expect(db!.quoteNumber).toBe(1);
    });

    it("subsequent quote increments sequentially", async () => {
      await createQuote(validCreatePayload());
      const result2 = await createQuote(validCreatePayload({ clientName: "Second" }));
      const db = await prisma.quote.findUnique({ where: { id: result2.id } });
      expect(db!.quoteNumber).toBe(2);
    });

    it("companies have independent quote numbers", async () => {
      // Create quote for company A
      await createQuote(validCreatePayload());

      // Create quote for company B
      setAuthToken(adminBToken);
      const resultB = await createQuote(validCreatePayload({ clientName: "B Client" }));
      const dbB = await prisma.quote.findUnique({ where: { id: resultB.id } });
      expect(dbB!.quoteNumber).toBe(1);
    });
  });

  // ── Client validation in transaction ────────────────────────────
  describe("client validation", () => {
    beforeEach(() => setAuthToken(adminAToken));

    it("accepts valid clientId", async () => {
      const result = await createQuote(validCreatePayload({ clientId: clientA.id }));
      const db = await prisma.quote.findUnique({ where: { id: result.id } });
      expect(db!.clientId).toBe(clientA.id);
    });

    it("rejects clientId from another company", async () => {
      // Create a client in company B
      const clientB = await prisma.client.create({
        data: { companyId: companyB.id, name: "Client B" },
      });
      await expect(
        createQuote(validCreatePayload({ clientId: clientB.id })),
      ).rejects.toThrow();
      await prisma.client.delete({ where: { id: clientB.id } });
    });

    it("rejects soft-deleted clientId", async () => {
      await expect(
        createQuote(validCreatePayload({ clientId: deletedClientA.id })),
      ).rejects.toThrow();
    });

    it("rejects non-existent clientId", async () => {
      await expect(
        createQuote(validCreatePayload({ clientId: 999999 })),
      ).rejects.toThrow();
    });

    it("succeeds when no clientId is provided", async () => {
      const result = await createQuote(validCreatePayload());
      const db = await prisma.quote.findUnique({ where: { id: result.id } });
      expect(db!.clientId).toBeNull();
    });
  });

  // ── Side effects ────────────────────────────────────────────────
  describe("side effects", () => {
    beforeEach(() => setAuthToken(adminAToken));

    it("calls inngest.send for PDF generation", async () => {
      await createQuote(validCreatePayload());
      expect(inngest.send).toHaveBeenCalled();
      const call = vi.mocked(inngest.send).mock.calls[0][0] as any;
      expect(call.name).toBe("pdf/generate-quote");
    });

    it("calls revalidatePath for /quotes", async () => {
      await createQuote(validCreatePayload());
      expect(revalidatePath).toHaveBeenCalledWith("/quotes");
    });

    it("does not throw when inngest.send fails", async () => {
      vi.mocked(inngest.send).mockRejectedValueOnce(new Error("inngest down"));
      // Should still complete successfully
      const result = await createQuote(validCreatePayload());
      expect(result).toHaveProperty("id");
    });
  });
});

// ════════════════════════════════════════════════════════════════════
// 3. getQuotes
// ════════════════════════════════════════════════════════════════════
describe("getQuotes", () => {
  beforeEach(() => setAuthToken(adminAToken));

  it("returns empty result when no quotes exist", async () => {
    const result = await getQuotes();
    expect(result.quotes).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });

  it("returns company-scoped quotes only", async () => {
    await createQuote(validCreatePayload());
    const result = await getQuotes();
    expect(result.quotes).toHaveLength(1);
    expect(result.quotes[0].clientName).toBe("Test Client");
  });

  it("does not leak quotes across companies", async () => {
    await createQuote(validCreatePayload());
    setAuthToken(adminBToken);
    const result = await getQuotes();
    expect(result.quotes).toHaveLength(0);
  });

  it("orders by createdAt desc", async () => {
    await createQuote(validCreatePayload({ clientName: "First" }));
    await createQuote(validCreatePayload({ clientName: "Second" }));
    const result = await getQuotes();
    expect(result.quotes[0].clientName).toBe("Second");
    expect(result.quotes[1].clientName).toBe("First");
  });

  it("returns total as JS number", async () => {
    await createQuote(validCreatePayload({ items: [{ description: "X", quantity: 2, unitPrice: 50 }] }));
    const result = await getQuotes();
    expect(typeof result.quotes[0].total).toBe("number");
    expect(result.quotes[0].total).toBe(100);
  });

  it("includes expected fields", async () => {
    await createQuote(validCreatePayload());
    const result = await getQuotes();
    const q = result.quotes[0];
    expect(q).toHaveProperty("id");
    expect(q).toHaveProperty("quoteNumber");
    expect(q).toHaveProperty("clientName");
    expect(q).toHaveProperty("total");
    expect(q).toHaveProperty("currency");
    expect(q).toHaveProperty("status");
    expect(q).toHaveProperty("createdAt");
  });

  // ── showTrashed ─────────────────────────────────────────────────
  it("showTrashed=false returns non-trashed quotes", async () => {
    const q = await createTestQuote();
    await prisma.quote.update({ where: { id: q.id }, data: { isTrashed: true } });
    await createTestQuote({ clientName: "Active" });

    const result = await getQuotes(false);
    expect(result.quotes).toHaveLength(1);
    expect(result.quotes[0].clientName).toBe("Active");
  });

  it("showTrashed=true returns only trashed quotes", async () => {
    const q = await createTestQuote();
    await prisma.quote.update({ where: { id: q.id }, data: { isTrashed: true } });
    await createTestQuote({ clientName: "Active" });

    const result = await getQuotes(true);
    expect(result.quotes).toHaveLength(1);
    expect(result.quotes[0].clientName).toBe("Test Client");
  });

  // ── Pagination ──────────────────────────────────────────────────
  describe("pagination", () => {
    it("returns null nextCursor when ≤ 50 quotes", async () => {
      await createTestQuote();
      const result = await getQuotes();
      expect(result.nextCursor).toBeNull();
    });

    it("returns nextCursor when > 50 quotes", async () => {
      // Create 51 quotes
      for (let i = 0; i < 51; i++) {
        await createTestQuote({ clientName: `Client ${i}` });
      }
      const result = await getQuotes();
      expect(result.quotes).toHaveLength(50);
      expect(result.nextCursor).toBeTruthy();
    }, 60_000);

    it("second page via cursor returns remaining quotes", async () => {
      for (let i = 0; i < 51; i++) {
        await createTestQuote({ clientName: `Client ${i}` });
      }
      const page1 = await getQuotes();
      const page2 = await getQuotes(false, page1.nextCursor!);
      expect(page2.quotes).toHaveLength(1);
      expect(page2.nextCursor).toBeNull();
    }, 60_000);

    it("rejects invalid cursor format", async () => {
      await expect(getQuotes(false, "not-a-cuid")).rejects.toThrow("Invalid cursor format");
    });
  });
});

// ════════════════════════════════════════════════════════════════════
// 4. getQuoteById
// ════════════════════════════════════════════════════════════════════
describe("getQuoteById", () => {
  beforeEach(() => setAuthToken(adminAToken));

  it("rejects invalid cuid format", async () => {
    await expect(getQuoteById("bad-id")).rejects.toThrow("Invalid quote ID format");
  });

  it("returns full quote with items, product, and company", async () => {
    const q = await createTestQuote({
      items: [{ description: "With Product", quantity: 1, unitPrice: 50, productId: productA.id }],
    });
    const result = await getQuoteById(q.id);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(q.id);
    expect(result!.items).toHaveLength(1);
    expect(result!.items[0].product).not.toBeNull();
    expect(result!.items[0].product!.name).toBe("Product A");
    expect(result!.company).toHaveProperty("name", "Quotes Co A");
  });

  it("returns null for non-existent quote", async () => {
    const result = await getQuoteById("clxxxxxxxxxxxxxxxxxxxxxxxxx");
    expect(result).toBeNull();
  });

  it("returns null for wrong company's quote", async () => {
    const q = await createTestQuote();
    setAuthToken(adminBToken);
    const result = await getQuoteById(q.id);
    expect(result).toBeNull();
  });

  // ── Decimal serialization ───────────────────────────────────────
  describe("decimal serialization", () => {
    it("returns total as JS number", async () => {
      const q = await createTestQuote({
        items: [{ description: "X", quantity: 3, unitPrice: 33.33 }],
      });
      const result = await getQuoteById(q.id);
      expect(typeof result!.total).toBe("number");
      expect(result!.total).toBeCloseTo(99.99, 2);
    });

    it("returns unitPrice as JS number", async () => {
      const q = await createTestQuote({
        items: [{ description: "X", quantity: 1, unitPrice: 123.45 }],
      });
      const result = await getQuoteById(q.id);
      expect(typeof result!.items[0].unitPrice).toBe("number");
      expect(result!.items[0].unitPrice).toBeCloseTo(123.45, 2);
    });

    it("returns unitCost as JS number when present", async () => {
      const q = await createTestQuote({
        items: [{ description: "X", quantity: 1, unitPrice: 100, unitCost: 55.50 }],
      });
      const result = await getQuoteById(q.id);
      expect(typeof result!.items[0].unitCost).toBe("number");
      expect(result!.items[0].unitCost).toBeCloseTo(55.50, 2);
    });

    it("returns unitCost as null when not set", async () => {
      const q = await createTestQuote();
      const result = await getQuoteById(q.id);
      expect(result!.items[0].unitCost).toBeNull();
    });

    it("returns product.price as JS number", async () => {
      const q = await createTestQuote({
        items: [{ description: "X", quantity: 1, unitPrice: 50, productId: productA.id }],
      });
      const result = await getQuoteById(q.id);
      expect(typeof result!.items[0].product!.price).toBe("number");
      expect(result!.items[0].product!.price).toBe(50);
    });

    it("returns product.cost as JS number when present", async () => {
      const q = await createTestQuote({
        items: [{ description: "X", quantity: 1, unitPrice: 50, productId: productA.id }],
      });
      const result = await getQuoteById(q.id);
      expect(typeof result!.items[0].product!.cost).toBe("number");
      expect(result!.items[0].product!.cost).toBe(30);
    });
  });

  // ── Relations ───────────────────────────────────────────────────
  describe("relations", () => {
    it("includes company fields", async () => {
      const q = await createTestQuote();
      const result = await getQuoteById(q.id);
      expect(result!.company).toHaveProperty("name");
      expect(result!.company).toHaveProperty("businessType");
      expect(result!.company).toHaveProperty("taxId");
    });

    it("includes items with nested product", async () => {
      const q = await createTestQuote({
        items: [{ description: "P", quantity: 1, unitPrice: 50, productId: productA.id }],
      });
      const result = await getQuoteById(q.id);
      expect(result!.items[0].product).toHaveProperty("id");
      expect(result!.items[0].product).toHaveProperty("name");
      expect(result!.items[0].product).toHaveProperty("sku");
    });

    it("includes all quote fields", async () => {
      const q = await createTestQuote({
        clientEmail: "x@test.com",
        title: "Test Title",
        discountType: "percent",
        discountValue: 10,
      });
      const result = await getQuoteById(q.id);
      expect(result).toHaveProperty("id");
      expect(result).toHaveProperty("quoteNumber");
      expect(result).toHaveProperty("clientName");
      expect(result).toHaveProperty("clientEmail");
      expect(result).toHaveProperty("total");
      expect(result).toHaveProperty("status");
      expect(result).toHaveProperty("pdfUrl");
      expect(result).toHaveProperty("shareToken");
      expect(result).toHaveProperty("isPriceWithVat");
      expect(result).toHaveProperty("title");
      expect(result).toHaveProperty("currency");
      expect(result).toHaveProperty("exchangeRate");
      expect(result).toHaveProperty("discountType");
      expect(result).toHaveProperty("discountValue");
    });

    it("returns null product when no productId", async () => {
      const q = await createTestQuote();
      const result = await getQuoteById(q.id);
      expect(result!.items[0].product).toBeNull();
    });
  });
});

// ════════════════════════════════════════════════════════════════════
// 5. updateQuote
// ════════════════════════════════════════════════════════════════════
describe("updateQuote", () => {
  beforeEach(() => setAuthToken(adminAToken));

  // ── Validation ──────────────────────────────────────────────────
  describe("validation", () => {
    it("rejects invalid ID", async () => {
      await expect(updateQuote("bad-id", validUpdatePayload())).rejects.toThrow("Invalid quote ID format");
    });

    it("rejects empty clientName", async () => {
      const q = await createTestQuote();
      await expect(updateQuote(q.id, validUpdatePayload({ clientName: "" }))).rejects.toThrow();
    });

    it("accepts valid status values", async () => {
      const q = await createTestQuote();
      await updateQuote(q.id, validUpdatePayload({ status: "SENT" }));
      const db = await prisma.quote.findUnique({ where: { id: q.id } });
      expect(db!.status).toBe("SENT");
    });

    it("rejects invalid status values", async () => {
      const q = await createTestQuote();
      await expect(updateQuote(q.id, validUpdatePayload({ status: "INVALID" }))).rejects.toThrow();
    });

    it("rejects percent discount > 100", async () => {
      const q = await createTestQuote();
      await expect(
        updateQuote(q.id, validUpdatePayload({ discountType: "percent", discountValue: 101 })),
      ).rejects.toThrow();
    });
  });

  // ── Happy path ──────────────────────────────────────────────────
  describe("happy path", () => {
    it("updates fields and verifies in DB", async () => {
      const q = await createTestQuote();
      await updateQuote(q.id, validUpdatePayload({ clientName: "New Name", title: "New Title" }));
      const db = await prisma.quote.findUnique({ where: { id: q.id } });
      expect(db!.clientName).toBe("New Name");
      expect(db!.title).toBe("New Title");
    });

    it("updates status", async () => {
      const q = await createTestQuote();
      await updateQuote(q.id, validUpdatePayload({ status: "ACCEPTED" }));
      const db = await prisma.quote.findUnique({ where: { id: q.id } });
      expect(db!.status).toBe("ACCEPTED");
    });

    it("recalculates total", async () => {
      const q = await createTestQuote();
      await updateQuote(q.id, validUpdatePayload({
        items: [
          { description: "A", quantity: 5, unitPrice: 20 },
          { description: "B", quantity: 3, unitPrice: 10 },
        ],
      }));
      const db = await prisma.quote.findUnique({ where: { id: q.id } });
      // 5*20 + 3*10 = 130
      expect(db!.total.toNumber()).toBe(130);
    });
  });

  // ── Items delete-all-recreate pattern ───────────────────────────
  describe("items pattern (delete-all-recreate)", () => {
    it("old items are gone, new items present", async () => {
      const q = await createTestQuote({
        items: [
          { description: "Old A", quantity: 1, unitPrice: 10 },
          { description: "Old B", quantity: 1, unitPrice: 20 },
        ],
      });
      const oldItems = await prisma.quoteItem.findMany({ where: { quoteId: q.id } });
      expect(oldItems).toHaveLength(2);

      await updateQuote(q.id, validUpdatePayload({
        items: [{ description: "New C", quantity: 3, unitPrice: 50 }],
      }));
      const newItems = await prisma.quoteItem.findMany({ where: { quoteId: q.id } });
      expect(newItems).toHaveLength(1);
      expect(newItems[0].description).toBe("New C");
    });

    it("empty items array clears all items", async () => {
      const q = await createTestQuote();
      await updateQuote(q.id, validUpdatePayload({ items: [] }));
      const items = await prisma.quoteItem.findMany({ where: { quoteId: q.id } });
      expect(items).toHaveLength(0);
    });

    it("items added when previously none", async () => {
      const q = await createTestQuote();
      await updateQuote(q.id, validUpdatePayload({ items: [] }));
      // Now add items
      await updateQuote(q.id, validUpdatePayload({
        items: [{ description: "Fresh", quantity: 2, unitPrice: 25 }],
      }));
      const items = await prisma.quoteItem.findMany({ where: { quoteId: q.id } });
      expect(items).toHaveLength(1);
      expect(items[0].description).toBe("Fresh");
    });
  });

  // ── Client validation ───────────────────────────────────────────
  describe("client validation", () => {
    it("accepts valid clientId", async () => {
      const q = await createTestQuote();
      await updateQuote(q.id, validUpdatePayload({ clientId: clientA.id }));
      const db = await prisma.quote.findUnique({ where: { id: q.id } });
      expect(db!.clientId).toBe(clientA.id);
    });

    it("rejects clientId from another company", async () => {
      const clientB = await prisma.client.create({
        data: { companyId: companyB.id, name: "Client B" },
      });
      const q = await createTestQuote();
      await expect(
        updateQuote(q.id, validUpdatePayload({ clientId: clientB.id })),
      ).rejects.toThrow();
      await prisma.client.delete({ where: { id: clientB.id } });
    });

    it("rejects soft-deleted clientId", async () => {
      const q = await createTestQuote();
      await expect(
        updateQuote(q.id, validUpdatePayload({ clientId: deletedClientA.id })),
      ).rejects.toThrow();
    });

    it("skips client validation when clientId absent", async () => {
      const q = await createTestQuote();
      // No clientId in payload → should succeed
      await updateQuote(q.id, validUpdatePayload());
      const db = await prisma.quote.findUnique({ where: { id: q.id } });
      expect(db).not.toBeNull();
    });
  });

  // ── PDF invalidation ───────────────────────────────────────────
  describe("PDF invalidation", () => {
    it("sets pdfUrl to null after update", async () => {
      const q = await createTestQuote();
      // Manually set pdfUrl to simulate cached PDF
      await prisma.quote.update({ where: { id: q.id }, data: { pdfUrl: "https://utfs.io/f/old.pdf" } });
      await updateQuote(q.id, validUpdatePayload());
      const db = await prisma.quote.findUnique({ where: { id: q.id } });
      expect(db!.pdfUrl).toBeNull();
    });

    it("preserves shareToken after update", async () => {
      const q = await createTestQuote();
      const before = await prisma.quote.findUnique({ where: { id: q.id } });
      await updateQuote(q.id, validUpdatePayload());
      const after = await prisma.quote.findUnique({ where: { id: q.id } });
      expect(after!.shareToken).toBe(before!.shareToken);
    });
  });

  // ── Company isolation ───────────────────────────────────────────
  it("throws for other company's quote", async () => {
    const q = await createTestQuote();
    setAuthToken(adminBToken);
    await expect(updateQuote(q.id, validUpdatePayload())).rejects.toThrow();
  });

  // ── Side effects ────────────────────────────────────────────────
  describe("side effects", () => {
    it("calls inngest.send with oldPdfUrl", async () => {
      const q = await createTestQuote();
      await prisma.quote.update({ where: { id: q.id }, data: { pdfUrl: "https://utfs.io/f/old.pdf" } });
      vi.clearAllMocks();

      await updateQuote(q.id, validUpdatePayload());
      expect(inngest.send).toHaveBeenCalled();
      const call = vi.mocked(inngest.send).mock.calls[0][0] as any;
      expect(call.data.oldPdfUrl).toBe("https://utfs.io/f/old.pdf");
    });

    it("calls revalidatePath for /quotes and /quotes/:id", async () => {
      const q = await createTestQuote();
      vi.clearAllMocks();
      await updateQuote(q.id, validUpdatePayload());
      expect(revalidatePath).toHaveBeenCalledWith("/quotes");
      expect(revalidatePath).toHaveBeenCalledWith(`/quotes/${q.id}`);
    });
  });
});

// ════════════════════════════════════════════════════════════════════
// 6. trashQuote
// ════════════════════════════════════════════════════════════════════
describe("trashQuote", () => {
  beforeEach(() => setAuthToken(adminAToken));

  it("rejects invalid ID", async () => {
    await expect(trashQuote("bad-id")).rejects.toThrow("Invalid quote ID format");
  });

  it("sets isTrashed=true and pdfUrl=null atomically", async () => {
    const q = await createTestQuote();
    await prisma.quote.update({ where: { id: q.id }, data: { pdfUrl: "https://utfs.io/f/test.pdf" } });
    await trashQuote(q.id);
    const db = await prisma.quote.findUnique({ where: { id: q.id } });
    expect(db!.isTrashed).toBe(true);
    expect(db!.pdfUrl).toBeNull();
  });

  it("record is NOT deleted (soft delete)", async () => {
    const q = await createTestQuote();
    await trashQuote(q.id);
    const db = await prisma.quote.findUnique({ where: { id: q.id } });
    expect(db).not.toBeNull();
  });

  it("trashed quote excluded from getQuotes(false)", async () => {
    const q = await createTestQuote();
    await trashQuote(q.id);
    const result = await getQuotes(false);
    expect(result.quotes.find((x: any) => x.id === q.id)).toBeUndefined();
  });

  it("trashed quote included in getQuotes(true)", async () => {
    const q = await createTestQuote();
    await trashQuote(q.id);
    const result = await getQuotes(true);
    expect(result.quotes.find((x: any) => x.id === q.id)).toBeDefined();
  });

  it("throws for other company's quote", async () => {
    const q = await createTestQuote();
    setAuthToken(adminBToken);
    await expect(trashQuote(q.id)).rejects.toThrow();
  });

  it("calls revalidatePath", async () => {
    const q = await createTestQuote();
    vi.clearAllMocks();
    await trashQuote(q.id);
    expect(revalidatePath).toHaveBeenCalledWith("/quotes");
  });
});

// ════════════════════════════════════════════════════════════════════
// 7. restoreQuote
// ════════════════════════════════════════════════════════════════════
describe("restoreQuote", () => {
  beforeEach(() => setAuthToken(adminAToken));

  it("rejects invalid ID", async () => {
    await expect(restoreQuote("bad-id")).rejects.toThrow("Invalid quote ID format");
  });

  it("sets isTrashed=false", async () => {
    const q = await createTestQuote();
    await trashQuote(q.id);
    await restoreQuote(q.id);
    const db = await prisma.quote.findUnique({ where: { id: q.id } });
    expect(db!.isTrashed).toBe(false);
  });

  it("restored quote back in getQuotes(false)", async () => {
    const q = await createTestQuote();
    await trashQuote(q.id);
    await restoreQuote(q.id);
    const result = await getQuotes(false);
    expect(result.quotes.find((x: any) => x.id === q.id)).toBeDefined();
  });

  it("restored quote excluded from getQuotes(true)", async () => {
    const q = await createTestQuote();
    await trashQuote(q.id);
    await restoreQuote(q.id);
    const result = await getQuotes(true);
    expect(result.quotes.find((x: any) => x.id === q.id)).toBeUndefined();
  });

  it("throws for other company's quote", async () => {
    const q = await createTestQuote();
    await prisma.quote.update({ where: { id: q.id }, data: { isTrashed: true } });
    setAuthToken(adminBToken);
    await expect(restoreQuote(q.id)).rejects.toThrow();
  });

  it("calls inngest.send and revalidatePath", async () => {
    const q = await createTestQuote();
    await trashQuote(q.id);
    vi.clearAllMocks();
    await restoreQuote(q.id);
    expect(inngest.send).toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/quotes");
  });
});

// ════════════════════════════════════════════════════════════════════
// 8. getClientsForDropdown
// ════════════════════════════════════════════════════════════════════
describe("getClientsForDropdown", () => {
  beforeEach(() => setAuthToken(adminAToken));

  it("returns company's clients", async () => {
    const clients = await getClientsForDropdown();
    const found = clients.find((c: any) => c.id === clientA.id);
    expect(found).toBeDefined();
    expect(found!.name).toBe("Client A");
  });

  it("excludes other company's clients", async () => {
    const clientB = await prisma.client.create({
      data: { companyId: companyB.id, name: "Client B" },
    });
    const clients = await getClientsForDropdown();
    expect(clients.find((c: any) => c.id === clientB.id)).toBeUndefined();
    await prisma.client.delete({ where: { id: clientB.id } });
  });

  it("excludes soft-deleted clients", async () => {
    const clients = await getClientsForDropdown();
    expect(clients.find((c: any) => c.id === deletedClientA.id)).toBeUndefined();
  });

  it("returns correct fields: id, name, email, phone", async () => {
    const clients = await getClientsForDropdown();
    const found = clients.find((c: any) => c.id === clientA.id)!;
    expect(Object.keys(found).sort()).toEqual(["email", "id", "name", "phone"].sort());
    expect(found.email).toBe("clienta@test.com");
    expect(found.phone).toBe("123");
  });

  it("orders by name asc", async () => {
    // Create additional clients with specific names
    const c1 = await prisma.client.create({ data: { companyId: companyA.id, name: "Zebra" } });
    const c2 = await prisma.client.create({ data: { companyId: companyA.id, name: "Apple" } });

    const clients = await getClientsForDropdown();
    const names = clients.map((c: any) => c.name);
    const sorted = [...names].sort((a: string, b: string) => a.localeCompare(b));
    expect(names).toEqual(sorted);

    await prisma.client.deleteMany({ where: { id: { in: [c1.id, c2.id] } } });
  });
});

// ════════════════════════════════════════════════════════════════════
// 9. GET /api/quotes/[id]/download — Authenticated
// ════════════════════════════════════════════════════════════════════
describe("GET /api/quotes/[id]/download (authenticated)", () => {
  it("returns 401 when unauthenticated", async () => {
    setAuthToken(null);
    const req = buildGetRequest("/api/quotes/clxxxxxxxxxxxxxxxxxxxxxxxxx/download");
    const res = await GET_AUTH_DOWNLOAD(req as any, makeParams("clxxxxxxxxxxxxxxxxxxxxxxxxx"));
    expect(res.status).toBe(401);
  });

  it("returns 403 without canViewQuotes", async () => {
    setAuthToken(noPermsAToken);
    const req = buildGetRequest("/api/quotes/clxxxxxxxxxxxxxxxxxxxxxxxxx/download");
    const res = await GET_AUTH_DOWNLOAD(req as any, makeParams("clxxxxxxxxxxxxxxxxxxxxxxxxx"));
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid ID format", async () => {
    setAuthToken(adminAToken);
    const req = buildGetRequest("/api/quotes/bad-id/download");
    const res = await GET_AUTH_DOWNLOAD(req as any, makeParams("bad-id"));
    expect(res.status).toBe(400);
  });

  it("returns 404 for non-existent quote", async () => {
    setAuthToken(adminAToken);
    const fakeId = "clxxxxxxxxxxxxxxxxxxxxxxxxx";
    const req = buildGetRequest(`/api/quotes/${fakeId}/download`);
    const res = await GET_AUTH_DOWNLOAD(req as any, makeParams(fakeId));
    expect(res.status).toBe(404);
  });

  it("returns 500 when pdfUrl fails SSRF check", async () => {
    setAuthToken(adminAToken);
    const q = await createTestQuote();
    // Set a malicious pdfUrl
    await prisma.quote.update({ where: { id: q.id }, data: { pdfUrl: "http://localhost:3000/evil" } });

    const req = buildGetRequest(`/api/quotes/${q.id}/download`);
    const res = await GET_AUTH_DOWNLOAD(req as any, makeParams(q.id));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toContain("PDF storage error");
  });
});

// ════════════════════════════════════════════════════════════════════
// 10. GET /api/p/quotes/[id]/download — Public
// ════════════════════════════════════════════════════════════════════
describe("GET /api/p/quotes/[id]/download (public)", () => {
  it("returns 400 for invalid ID format", async () => {
    const req = buildGetRequest("/api/p/quotes/bad-id/download");
    const res = await GET_PUBLIC_DOWNLOAD(req as any, makeParams("bad-id"));
    expect(res.status).toBe(400);
  });

  it("returns 404 for non-existent quote (enumeration prevention)", async () => {
    const fakeId = "clxxxxxxxxxxxxxxxxxxxxxxxxx";
    const req = buildGetRequest(`/api/p/quotes/${fakeId}/download`, { token: "some-token" });
    const res = await GET_PUBLIC_DOWNLOAD(req as any, makeParams(fakeId));
    expect(res.status).toBe(404);
  });

  it("returns 404 when token is missing", async () => {
    setAuthToken(adminAToken);
    const q = await createTestQuote();
    setAuthToken(null);

    const req = buildGetRequest(`/api/p/quotes/${q.id}/download`);
    const res = await GET_PUBLIC_DOWNLOAD(req as any, makeParams(q.id));
    expect(res.status).toBe(404);
  });

  it("returns 404 for wrong token (timing-safe)", async () => {
    setAuthToken(adminAToken);
    const q = await createTestQuote();
    setAuthToken(null);

    const req = buildGetRequest(`/api/p/quotes/${q.id}/download`, { token: "wrong-token-value" });
    const res = await GET_PUBLIC_DOWNLOAD(req as any, makeParams(q.id));
    expect(res.status).toBe(404);
  });

  it("returns 404 for trashed quote with valid token", async () => {
    setAuthToken(adminAToken);
    const q = await createTestQuote();
    const db = await prisma.quote.findUnique({ where: { id: q.id } });
    const shareToken = db!.shareToken!;
    await trashQuote(q.id);
    setAuthToken(null);

    const req = buildGetRequest(`/api/p/quotes/${q.id}/download`, { token: shareToken });
    const res = await GET_PUBLIC_DOWNLOAD(req as any, makeParams(q.id));
    expect(res.status).toBe(404);
  });

  it("returns 202 HTML waiting page when no cached PDF", async () => {
    setAuthToken(adminAToken);
    const q = await createTestQuote();
    const db = await prisma.quote.findUnique({ where: { id: q.id } });
    const shareToken = db!.shareToken!;
    setAuthToken(null);

    const req = buildGetRequest(`/api/p/quotes/${q.id}/download`, { token: shareToken });
    const res = await GET_PUBLIC_DOWNLOAD(req as any, makeParams(q.id));
    expect(res.status).toBe(202);
    expect(res.headers.get("content-type")).toContain("text/html");
    const body = await res.text();
    expect(body).toContain("PDF");
  });

  it("returns 500 when pdfUrl fails SSRF check", async () => {
    setAuthToken(adminAToken);
    const q = await createTestQuote();
    const db = await prisma.quote.findUnique({ where: { id: q.id } });
    const shareToken = db!.shareToken!;
    await prisma.quote.update({ where: { id: q.id }, data: { pdfUrl: "http://evil.local/bad.pdf" } });
    setAuthToken(null);

    const req = buildGetRequest(`/api/p/quotes/${q.id}/download`, { token: shareToken });
    const res = await GET_PUBLIC_DOWNLOAD(req as any, makeParams(q.id));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toContain("PDF storage error");
  });
});

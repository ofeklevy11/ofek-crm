import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";

// ── Mocks ───────────────────────────────────────────────────────────
vi.mock("@/lib/permissions-server", () => ({
  getCurrentUser: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(null),
  RATE_LIMITS: {
    api: { prefix: "api", max: 120, windowSeconds: 60 },
  },
}));

// ── Imports ─────────────────────────────────────────────────────────
import { GET } from "@/app/api/finance/search-clients/route";
import { getCurrentUser } from "@/lib/permissions-server";
import { buildGetRequest } from "@/tests/helpers/finance-mocks";
import {
  testPrisma,
  seedCompany,
  seedUser,
  cleanupAll,
} from "./helpers";

const mockGetCurrentUser = getCurrentUser as ReturnType<typeof vi.fn>;
const BASE_URL = "http://localhost:3000/api/finance/search-clients";

let company: any;
let adminUser: any;
let table: any;
let otherCompany: any;
let otherTable: any;
let numericOnlyRecordId: number;

beforeAll(async () => {
  await cleanupAll();

  company = await seedCompany();
  otherCompany = await seedCompany();
  adminUser = await seedUser(company.id, { role: "admin" });
  const otherUser = await seedUser(otherCompany.id, { role: "admin" });

  table = await testPrisma.tableMeta.create({
    data: {
      companyId: company.id,
      createdBy: adminUser.id,
      name: "Clients Table",
      slug: "work-dm",
      schemaJson: {},
    },
  });

  otherTable = await testPrisma.tableMeta.create({
    data: {
      companyId: otherCompany.id,
      createdBy: otherUser.id,
      name: "Other Table",
      slug: "other-dm",
      schemaJson: {},
    },
  });

  // Seed records with various data shapes for name extraction tests
  await testPrisma.record.create({
    data: {
      companyId: company.id,
      tableId: table.id,
      data: { c_name: "Alice Corp", email: "alice@corp.com" },
    },
  });
  await testPrisma.record.create({
    data: {
      companyId: company.id,
      tableId: table.id,
      data: { name: "Bob Ltd", phone: "123" },
    },
  });
  await testPrisma.record.create({
    data: {
      companyId: company.id,
      tableId: table.id,
      data: { client_name: "Charlie Inc" },
    },
  });
  await testPrisma.record.create({
    data: {
      companyId: company.id,
      tableId: table.id,
      data: { foo: "Dave Shop", bar: 42 },
    },
  });
  const numericOnly = await testPrisma.record.create({
    data: {
      companyId: company.id,
      tableId: table.id,
      data: { count: 99 },
    },
  });
  numericOnlyRecordId = numericOnly.id;

  // Other company record — should never appear in our searches
  await testPrisma.record.create({
    data: {
      companyId: otherCompany.id,
      tableId: otherTable.id,
      data: { name: "Eve Secrets" },
    },
  });
});

afterAll(async () => {
  await cleanupAll();
});

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCurrentUser.mockResolvedValue(adminUser);
});

// ── Auth ──────────────────────────────────────────────────────────────

describe("GET /api/finance/search-clients — auth", () => {
  it("returns 401 when user is not authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const res = await GET(buildGetRequest(BASE_URL, { table: "work-dm" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("returns 403 when basic user lacks canViewFinance", async () => {
    const basicUser = await seedUser(company.id, {
      role: "basic",
      permissions: {},
    });
    mockGetCurrentUser.mockResolvedValue(basicUser);
    const res = await GET(buildGetRequest(BASE_URL, { table: "work-dm" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("returns 200 for admin user", async () => {
    const res = await GET(buildGetRequest(BASE_URL, { table: "work-dm" }));
    expect(res.status).toBe(200);
  });

  it("returns 200 for basic user with canViewFinance", async () => {
    const basicWithFinance = await seedUser(company.id, {
      role: "basic",
      permissions: { canViewFinance: true },
    });
    mockGetCurrentUser.mockResolvedValue(basicWithFinance);
    const res = await GET(buildGetRequest(BASE_URL, { table: "work-dm" }));
    expect(res.status).toBe(200);
  });
});

// ── Validation ────────────────────────────────────────────────────────

describe("GET /api/finance/search-clients — validation", () => {
  it("returns 400 when table param is missing", async () => {
    const res = await GET(buildGetRequest(BASE_URL));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/table/i);
  });

  it("returns 400 when table slug > 100 chars", async () => {
    const res = await GET(
      buildGetRequest(BASE_URL, { table: "a".repeat(101) }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/table/i);
  });

  it("returns 400 when search > 200 chars", async () => {
    const res = await GET(
      buildGetRequest(BASE_URL, {
        table: "work-dm",
        search: "a".repeat(201),
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/search/i);
  });

  it("returns 404 when slug does not match any company table", async () => {
    const res = await GET(
      buildGetRequest(BASE_URL, { table: "nonexistent-slug" }),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });
});

// ── Name extraction ───────────────────────────────────────────────────

describe("GET /api/finance/search-clients — name extraction", () => {
  it("returns records with correct name extraction from various data shapes", async () => {
    const res = await GET(
      buildGetRequest(BASE_URL, { table: "work-dm" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.length).toBe(5);

    const names = body.map((r: any) => r.name);
    // c_name has highest priority
    expect(names).toContain("Alice Corp");
    // name key
    expect(names).toContain("Bob Ltd");
    // client_name (matches *name* wildcard)
    expect(names).toContain("Charlie Inc");
    // First string fallback
    expect(names).toContain("Dave Shop");
  });

  it("extracts 'Record #ID' when no string fields exist", async () => {
    const res = await GET(
      buildGetRequest(BASE_URL, { table: "work-dm" }),
    );
    const body = await res.json();
    // Find the record we know has only numeric data
    const numericOnly = body.find((r: any) => r.id === numericOnlyRecordId);
    expect(numericOnly).toBeDefined();
    expect(numericOnly.name).toBe(`Record #${numericOnlyRecordId}`);
  });
});

// ── Response shape ────────────────────────────────────────────────────

describe("GET /api/finance/search-clients — response shape", () => {
  it("each record has exactly id, name, data, tableSlug", async () => {
    const res = await GET(
      buildGetRequest(BASE_URL, { table: "work-dm" }),
    );
    const body = await res.json();
    expect(body.length).toBeGreaterThan(0);

    for (const record of body) {
      expect(Object.keys(record).sort()).toEqual(
        ["data", "id", "name", "tableSlug"].sort(),
      );
      expect(typeof record.id).toBe("number");
      expect(typeof record.name).toBe("string");
      expect(typeof record.data).toBe("object");
      expect(record.tableSlug).toBe("work-dm");
    }
  });
});

// ── ILIKE search ──────────────────────────────────────────────────────

describe("GET /api/finance/search-clients — search", () => {
  it("filters records via ILIKE search (case-insensitive)", async () => {
    const res = await GET(
      buildGetRequest(BASE_URL, { table: "work-dm", search: "alice" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.length).toBe(1);
    expect(body[0].name).toBe("Alice Corp");
  });

  it("returns empty array when search matches nothing", async () => {
    const res = await GET(
      buildGetRequest(BASE_URL, {
        table: "work-dm",
        search: "zzz-no-match-ever",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it("handles SQL special characters in search (%, _, \\)", async () => {
    // These should not break the query — route escapes them
    const res = await GET(
      buildGetRequest(BASE_URL, { table: "work-dm", search: "100%" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // No records match "100%" — just verify it doesn't error
    expect(Array.isArray(body)).toBe(true);
  });

  it("handles underscore wildcard in search safely", async () => {
    const res = await GET(
      buildGetRequest(BASE_URL, { table: "work-dm", search: "A_ice" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // "_" is escaped, so it won't match "Alice" as a wildcard
    expect(body).toEqual([]);
  });
});

// ── Company isolation ─────────────────────────────────────────────────

describe("GET /api/finance/search-clients — company isolation", () => {
  it("cannot access other company's table by slug", async () => {
    const res = await GET(
      buildGetRequest(BASE_URL, { table: "other-dm" }),
    );
    expect(res.status).toBe(404);
  });

  it("other company's records never appear in results", async () => {
    const res = await GET(
      buildGetRequest(BASE_URL, { table: "work-dm" }),
    );
    const body = await res.json();
    const names = body.map((r: any) => r.name);
    expect(names).not.toContain("Eve Secrets");
  });
});

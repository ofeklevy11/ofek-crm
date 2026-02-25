import { vi, describe, it, expect, beforeEach } from "vitest";
import {
  createMockUser,
  createPrismaMock,
  buildGetRequest,
} from "@/tests/helpers/finance-mocks";

/* ------------------------------------------------------------------ */
/*  Module mocks                                                       */
/* ------------------------------------------------------------------ */

vi.mock("@/lib/permissions-server", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/permissions", async () => {
  const actual = await vi.importActual("@/lib/permissions");
  return actual;
});

let prismaMock: ReturnType<typeof createPrismaMock>;

vi.mock("@/lib/prisma", () => ({
  get prisma() {
    return prismaMock;
  },
}));

vi.mock("@/lib/db-retry", () => ({
  withRetry: vi.fn((fn: any) => fn()),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(null),
  RATE_LIMITS: { api: { prefix: "api", max: 120, windowSeconds: 60 } },
}));

/* ------------------------------------------------------------------ */
/*  Imports (after mocks)                                              */
/* ------------------------------------------------------------------ */

import { GET } from "@/app/api/finance/search-clients/route";
import { getCurrentUser } from "@/lib/permissions-server";
import { checkRateLimit } from "@/lib/rate-limit";
import { NextResponse } from "next/server";

const mockGetCurrentUser = getCurrentUser as ReturnType<typeof vi.fn>;
const mockCheckRateLimit = checkRateLimit as ReturnType<typeof vi.fn>;

const BASE_URL = "http://localhost:3000/api/finance/search-clients";

/* ------------------------------------------------------------------ */
/*  Setup                                                              */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock = createPrismaMock();
  mockGetCurrentUser.mockResolvedValue(createMockUser());
  mockCheckRateLimit.mockResolvedValue(null);
});

/* ================================================================== */
/*  GET /api/finance/search-clients                                    */
/* ================================================================== */

describe("GET /api/finance/search-clients", () => {
  /* ---------------------------------------------------------------- */
  /*  Auth & Permissions                                               */
  /* ---------------------------------------------------------------- */

  it("returns 401 when user is not authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const req = buildGetRequest(BASE_URL, { table: "clients" });
    const res = await GET(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 when user lacks canViewFinance flag", async () => {
    mockGetCurrentUser.mockResolvedValue(
      createMockUser({ role: "basic", permissions: {} }),
    );
    const req = buildGetRequest(BASE_URL, { table: "clients" });
    const res = await GET(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
  });

  it("returns 429 when rate limited", async () => {
    const rateLimitResponse = NextResponse.json(
      { error: "Too many requests" },
      { status: 429 },
    );
    mockCheckRateLimit.mockResolvedValue(rateLimitResponse);
    const req = buildGetRequest(BASE_URL, { table: "clients" });
    const res = await GET(req);
    expect(res.status).toBe(429);
  });

  /* ---------------------------------------------------------------- */
  /*  Param validation                                                 */
  /* ---------------------------------------------------------------- */

  it("returns 400 when table param is missing", async () => {
    const req = buildGetRequest(BASE_URL);
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Table parameter is required");
  });

  it("returns 400 when table param exceeds 100 characters", async () => {
    const req = buildGetRequest(BASE_URL, { table: "x".repeat(101) });
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Table parameter is required");
  });

  it("returns 400 when search query exceeds 200 characters", async () => {
    const req = buildGetRequest(BASE_URL, {
      table: "clients",
      search: "a".repeat(201),
    });
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Search query too long");
  });

  /* ---------------------------------------------------------------- */
  /*  Table lookup                                                     */
  /* ---------------------------------------------------------------- */

  it("returns 404 when table is not found", async () => {
    prismaMock.tableMeta.findFirst.mockResolvedValue(null);
    const req = buildGetRequest(BASE_URL, { table: "nonexistent" });
    const res = await GET(req);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Table not found");
  });

  it("scopes table lookup to the user companyId", async () => {
    prismaMock.tableMeta.findFirst.mockResolvedValue(null);
    const req = buildGetRequest(BASE_URL, { table: "work-dm" });
    await GET(req);
    expect(prismaMock.tableMeta.findFirst).toHaveBeenCalledWith({
      where: { slug: "work-dm", companyId: 1 },
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Raw SQL search (with search param)                               */
  /* ---------------------------------------------------------------- */

  it("uses $queryRaw when search param is provided", async () => {
    prismaMock.tableMeta.findFirst.mockResolvedValue({
      id: 10,
      slug: "test",
      companyId: 1,
    });
    prismaMock.$queryRaw.mockResolvedValue([
      { id: 1, data: { name: "Test Client" } },
    ]);

    const req = buildGetRequest(BASE_URL, { table: "test", search: "john" });
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(prismaMock.$queryRaw).toHaveBeenCalled();
    expect(prismaMock.record.findMany).not.toHaveBeenCalled();
  });

  it("escapes special SQL characters (%, _, \\) in search query", async () => {
    prismaMock.tableMeta.findFirst.mockResolvedValue({
      id: 10,
      slug: "test",
      companyId: 1,
    });
    prismaMock.$queryRaw.mockResolvedValue([]);

    const req = buildGetRequest(BASE_URL, {
      table: "test",
      search: "test%100_val\\ue",
    });
    await GET(req);

    expect(prismaMock.$queryRaw).toHaveBeenCalled();
    // The tagged template literal passes the search pattern as one of the
    // interpolated values. We inspect the call args to confirm escaping.
    const callArgs = prismaMock.$queryRaw.mock.calls[0];
    // The last interpolated value is the ILIKE search pattern with wrapping %.
    // For a tagged template, callArgs is [TemplateStringsArray, val1, val2, val3].
    const searchPattern = callArgs[callArgs.length - 1] as string;
    expect(searchPattern).toBe("%test\\%100\\_val\\\\ue%");
  });

  /* ---------------------------------------------------------------- */
  /*  No-search fallback (findMany)                                    */
  /* ---------------------------------------------------------------- */

  it("uses record.findMany when no search param is provided", async () => {
    prismaMock.tableMeta.findFirst.mockResolvedValue({
      id: 10,
      slug: "test",
      companyId: 1,
    });
    prismaMock.record.findMany.mockResolvedValue([
      { id: 1, data: { name: "Client A" } },
    ]);

    const req = buildGetRequest(BASE_URL, { table: "test" });
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(prismaMock.record.findMany).toHaveBeenCalledWith({
      where: { tableId: 10, companyId: 1 },
      select: { id: true, data: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
  });

  /* ---------------------------------------------------------------- */
  /*  Name detection priority                                          */
  /* ---------------------------------------------------------------- */

  it("picks c_name with highest priority", async () => {
    prismaMock.tableMeta.findFirst.mockResolvedValue({
      id: 10,
      slug: "test",
      companyId: 1,
    });
    prismaMock.record.findMany.mockResolvedValue([
      { id: 1, data: { c_name: "Primary", name: "Secondary" } },
    ]);

    const req = buildGetRequest(BASE_URL, { table: "test" });
    const res = await GET(req);
    const body = await res.json();

    expect(body).toHaveLength(1);
    expect(body[0].name).toBe("Primary");
  });

  it("falls back to name field when c_name is absent", async () => {
    prismaMock.tableMeta.findFirst.mockResolvedValue({
      id: 10,
      slug: "test",
      companyId: 1,
    });
    prismaMock.record.findMany.mockResolvedValue([
      { id: 1, data: { name: "Test Name", email: "test@test.com" } },
    ]);

    const req = buildGetRequest(BASE_URL, { table: "test" });
    const res = await GET(req);
    const body = await res.json();

    expect(body[0].name).toBe("Test Name");
  });

  it("uses key containing 'name' when standard keys are absent", async () => {
    prismaMock.tableMeta.findFirst.mockResolvedValue({
      id: 10,
      slug: "test",
      companyId: 1,
    });
    prismaMock.record.findMany.mockResolvedValue([
      { id: 1, data: { customerName: "Found", email: "e" } },
    ]);

    const req = buildGetRequest(BASE_URL, { table: "test" });
    const res = await GET(req);
    const body = await res.json();

    expect(body[0].name).toBe("Found");
  });

  it("falls back to first string value when no name-like keys exist", async () => {
    prismaMock.tableMeta.findFirst.mockResolvedValue({
      id: 10,
      slug: "test",
      companyId: 1,
    });
    prismaMock.record.findMany.mockResolvedValue([
      { id: 1, data: { id: 123, value: "Some Value" } },
    ]);

    const req = buildGetRequest(BASE_URL, { table: "test" });
    const res = await GET(req);
    const body = await res.json();

    expect(body[0].name).toBe("Some Value");
  });

  it("falls back to Record #id when data has no suitable strings", async () => {
    prismaMock.tableMeta.findFirst.mockResolvedValue({
      id: 10,
      slug: "test",
      companyId: 1,
    });
    prismaMock.record.findMany.mockResolvedValue([
      { id: 1, data: { count: 42, active: true } },
    ]);

    const req = buildGetRequest(BASE_URL, { table: "test" });
    const res = await GET(req);
    const body = await res.json();

    expect(body[0].name).toBe("Record #1");
  });

  /* ---------------------------------------------------------------- */
  /*  Data parsing                                                     */
  /* ---------------------------------------------------------------- */

  it("parses JSON string data into an object", async () => {
    prismaMock.tableMeta.findFirst.mockResolvedValue({
      id: 10,
      slug: "test",
      companyId: 1,
    });
    prismaMock.record.findMany.mockResolvedValue([
      { id: 1, data: '{"name":"Parsed"}' },
    ]);

    const req = buildGetRequest(BASE_URL, { table: "test" });
    const res = await GET(req);
    const body = await res.json();

    expect(body[0].name).toBe("Parsed");
    expect(body[0].data).toEqual({ name: "Parsed" });
  });

  /* ---------------------------------------------------------------- */
  /*  Response format                                                  */
  /* ---------------------------------------------------------------- */

  it("returns 500 on database failure", async () => {
    prismaMock.tableMeta.findFirst.mockRejectedValue(new Error("DB down"));

    const req = buildGetRequest(BASE_URL, { table: "clients" });
    const res = await GET(req);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to search clients");
  });

  it("handles invalid JSON string data gracefully", async () => {
    prismaMock.tableMeta.findFirst.mockResolvedValue({
      id: 10,
      slug: "test",
      companyId: 1,
    });
    prismaMock.record.findMany.mockResolvedValue([
      { id: 42, data: "not-valid-json{{{" },
    ]);

    const req = buildGetRequest(BASE_URL, { table: "test" });
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe("Record #42");
    expect(body[0].data).toEqual({});
  });

  it("returns array of objects with id, name, data, and tableSlug", async () => {
    prismaMock.tableMeta.findFirst.mockResolvedValue({
      id: 10,
      slug: "work-dm",
      companyId: 1,
    });
    prismaMock.record.findMany.mockResolvedValue([
      { id: 5, data: { c_name: "Client A", phone: "123" } },
      { id: 8, data: { name: "Client B" } },
    ]);

    const req = buildGetRequest(BASE_URL, { table: "work-dm" });
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveLength(2);

    expect(body[0]).toEqual({
      id: 5,
      name: "Client A",
      data: { c_name: "Client A", phone: "123" },
      tableSlug: "work-dm",
    });

    expect(body[1]).toEqual({
      id: 8,
      name: "Client B",
      data: { name: "Client B" },
      tableSlug: "work-dm",
    });
  });
});

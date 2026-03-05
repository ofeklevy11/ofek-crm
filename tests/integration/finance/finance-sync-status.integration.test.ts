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
import { GET } from "@/app/api/finance-sync/status/[jobId]/route";
import { getCurrentUser } from "@/lib/permissions-server";
import { buildGetRequest } from "@/tests/helpers/finance-mocks";
import {
  testPrisma,
  seedCompany,
  seedUser,
  cleanupAll,
} from "./helpers";

const mockGetCurrentUser = getCurrentUser as ReturnType<typeof vi.fn>;
const BASE_URL = "http://localhost:3000/api/finance-sync/status";

let company: any;
let adminUser: any;
let otherCompany: any;
let syncRule: any;
let queuedJob: any;
let completedJob: any;
let failedJob: any;
let otherCompanyJob: any;

function buildJobParams(jobId: string) {
  return { params: Promise.resolve({ jobId }) };
}

beforeAll(async () => {
  await cleanupAll();

  company = await seedCompany();
  otherCompany = await seedCompany();
  adminUser = await seedUser(company.id, { role: "admin" });
  const otherUser = await seedUser(otherCompany.id, { role: "admin" });

  syncRule = await testPrisma.financeSyncRule.create({
    data: {
      companyId: company.id,
      name: "Monthly Income Sync",
      targetType: "INCOME",
      sourceType: "TABLE",
      fieldMapping: { amountField: "price", dateField: "date" },
    },
  });

  const otherRule = await testPrisma.financeSyncRule.create({
    data: {
      companyId: otherCompany.id,
      name: "Other Company Rule",
      targetType: "EXPENSE",
      sourceType: "TRANSACTIONS",
      fieldMapping: {},
    },
  });

  // Job with null summary (QUEUED)
  queuedJob = await testPrisma.financeSyncJob.create({
    data: {
      companyId: company.id,
      syncRuleId: syncRule.id,
      status: "QUEUED",
      summary: null,
    },
  });

  // Job with populated summary (COMPLETED)
  completedJob = await testPrisma.financeSyncJob.create({
    data: {
      companyId: company.id,
      syncRuleId: syncRule.id,
      status: "COMPLETED",
      summary: {
        scanned: 50,
        created: 30,
        updated: 10,
        skippedExists: 5,
        skippedError: 2,
        errors: ["Row 12: invalid amount"],
        error: null,
        completedAt: "2026-02-20T10:00:00Z",
      },
    },
  });

  // Job with error (FAILED)
  failedJob = await testPrisma.financeSyncJob.create({
    data: {
      companyId: company.id,
      syncRuleId: syncRule.id,
      status: "FAILED",
      summary: {
        scanned: 10,
        created: 0,
        updated: 0,
        skippedExists: 0,
        skippedError: 10,
        errors: ["Row 1: missing field", "Row 2: invalid type"],
        error: "Sync aborted due to too many errors",
        completedAt: null,
      },
    },
  });

  // Other company's job — should be inaccessible
  otherCompanyJob = await testPrisma.financeSyncJob.create({
    data: {
      companyId: otherCompany.id,
      syncRuleId: otherRule.id,
      status: "QUEUED",
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

describe("GET /api/finance-sync/status/[jobId] — auth", () => {
  it("returns 401 when user is not authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const res = await GET(
      buildGetRequest(`${BASE_URL}/${queuedJob.id}`),
      buildJobParams(queuedJob.id),
    );
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
    const res = await GET(
      buildGetRequest(`${BASE_URL}/${queuedJob.id}`),
      buildJobParams(queuedJob.id),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("returns 200 for admin user", async () => {
    const res = await GET(
      buildGetRequest(`${BASE_URL}/${queuedJob.id}`),
      buildJobParams(queuedJob.id),
    );
    expect(res.status).toBe(200);
  });

  it("returns 200 for basic user with canViewFinance", async () => {
    const basicWithFinance = await seedUser(company.id, {
      role: "basic",
      permissions: { canViewFinance: true },
    });
    mockGetCurrentUser.mockResolvedValue(basicWithFinance);
    const res = await GET(
      buildGetRequest(`${BASE_URL}/${queuedJob.id}`),
      buildJobParams(queuedJob.id),
    );
    expect(res.status).toBe(200);
  });
});

// ── COMPLETED job with full summary ───────────────────────────────────

describe("GET /api/finance-sync/status/[jobId] — completed job", () => {
  it("returns all summary fields for completed job", async () => {
    const res = await GET(
      buildGetRequest(`${BASE_URL}/${completedJob.id}`),
      buildJobParams(completedJob.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(completedJob.id);
    expect(body.status).toBe("COMPLETED");
    expect(body.scanned).toBe(50);
    expect(body.created).toBe(30);
    expect(body.updated).toBe(10);
    expect(body.skippedExists).toBe(5);
    expect(body.skippedError).toBe(2);
    expect(body.errors).toEqual(["Row 12: invalid amount"]);
    expect(body.error).toBeNull();
    expect(body.completedAt).toBe("2026-02-20T10:00:00Z");
  });

  it("response contains only expected fields", async () => {
    const res = await GET(
      buildGetRequest(`${BASE_URL}/${completedJob.id}`),
      buildJobParams(completedJob.id),
    );
    const body = await res.json();
    const expectedKeys = [
      "id", "status", "scanned", "created", "updated",
      "skippedExists", "skippedError", "errors", "error", "completedAt",
    ];
    expect(Object.keys(body).sort()).toEqual(expectedKeys.sort());
  });
});

// ── QUEUED job with null summary ──────────────────────────────────────

describe("GET /api/finance-sync/status/[jobId] — queued job (null summary)", () => {
  it("defaults all summary fields to 0/null/[] when summary is null", async () => {
    const res = await GET(
      buildGetRequest(`${BASE_URL}/${queuedJob.id}`),
      buildJobParams(queuedJob.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(queuedJob.id);
    expect(body.status).toBe("QUEUED");
    expect(body.scanned).toBe(0);
    expect(body.created).toBe(0);
    expect(body.updated).toBe(0);
    expect(body.skippedExists).toBe(0);
    expect(body.skippedError).toBe(0);
    expect(body.errors).toEqual([]);
    expect(body.error).toBeNull();
    expect(body.completedAt).toBeNull();
  });
});

// ── FAILED job ────────────────────────────────────────────────────────

describe("GET /api/finance-sync/status/[jobId] — failed job", () => {
  it("returns error field and partial summary for failed job", async () => {
    const res = await GET(
      buildGetRequest(`${BASE_URL}/${failedJob.id}`),
      buildJobParams(failedJob.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(failedJob.id);
    expect(body.status).toBe("FAILED");
    expect(body.error).toBe("Sync aborted due to too many errors");
    expect(body.scanned).toBe(10);
    expect(body.created).toBe(0);
    expect(body.skippedError).toBe(10);
    expect(body.errors).toHaveLength(2);
    expect(body.completedAt).toBeNull();
  });
});

// ── 404 cases ─────────────────────────────────────────────────────────

describe("GET /api/finance-sync/status/[jobId] — 404", () => {
  it("returns 404 for non-existent job ID", async () => {
    const res = await GET(
      buildGetRequest(`${BASE_URL}/clnonexistent123`),
      buildJobParams("clnonexistent123"),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });

  it("returns 404 for job in different company (company isolation)", async () => {
    const res = await GET(
      buildGetRequest(`${BASE_URL}/${otherCompanyJob.id}`),
      buildJobParams(otherCompanyJob.id),
    );
    expect(res.status).toBe(404);
  });
});

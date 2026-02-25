import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---
vi.mock("@/lib/permissions-server", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({
  canManageAnalytics: vi.fn(),
}));

const mockRedisMulti = {
  incr: vi.fn(),
  expire: vi.fn(),
  exec: vi.fn(),
};
mockRedisMulti.incr.mockReturnThis();
mockRedisMulti.expire.mockReturnThis();

vi.mock("@/lib/redis", () => ({
  redis: {
    multi: vi.fn(() => mockRedisMulti),
    ping: vi.fn(),
    set: vi.fn(),
  },
}));

vi.mock("@/lib/rate-limit-action", () => ({
  checkMemoryRateLimit: vi.fn(),
}));

vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tableMeta: { findMany: vi.fn() },
    company: { findUnique: vi.fn() },
    analyticsView: { findMany: vi.fn() },
    task: { count: vi.fn() },
    retainer: { count: vi.fn() },
    oneTimePayment: { count: vi.fn() },
    transaction: { count: vi.fn() },
    calendarEvent: { count: vi.fn() },
    client: { count: vi.fn() },
    user: { findMany: vi.fn() },
    record: { groupBy: vi.fn(), findMany: vi.fn() },
  },
}));

vi.mock("crypto", () => ({
  randomUUID: vi.fn(() => "test-uuid"),
}));

// --- Imports ---
import { POST } from "@/app/api/ai/generate-analytics/route";
import { getCurrentUser } from "@/lib/permissions-server";
import { canManageAnalytics } from "@/lib/permissions";
import { redis } from "@/lib/redis";
import { checkMemoryRateLimit } from "@/lib/rate-limit-action";
import { inngest } from "@/lib/inngest/client";
import { prisma } from "@/lib/prisma";

// --- Fixtures ---
const adminUser = {
  id: 1,
  companyId: 100,
  name: "Admin",
  email: "admin@test.com",
  role: "admin" as const,
  isPremium: "basic",
  allowedWriteTableIds: [] as number[],
  permissions: {} as Record<string, boolean>,
};

function makeReq(body: any, options?: { oversized?: boolean }) {
  const bodyStr = options?.oversized
    ? "x".repeat(600 * 1024) // > 512KB
    : JSON.stringify(body);
  return new Request("http://localhost/api/ai/generate-analytics", {
    method: "POST",
    body: bodyStr,
  });
}

const validBody = {
  prompt: "Show me sales data",
  tables: [{ id: 1, name: "Deals", schemaJson: [{ name: "amount", type: "number" }] }],
  mode: "single",
};

// Default mock setup for DB queries
function setupDefaultDbMocks() {
  vi.mocked(prisma.tableMeta.findMany).mockResolvedValue([
    { id: 1, name: "Deals", schemaJson: [{ name: "amount", type: "number" }] },
  ] as any);
  vi.mocked(prisma.company.findUnique).mockResolvedValue({ name: "TestCo", businessType: "SaaS" } as any);
  vi.mocked(prisma.analyticsView.findMany).mockResolvedValue([]);
  vi.mocked(prisma.task.count).mockResolvedValue(10);
  vi.mocked(prisma.retainer.count).mockResolvedValue(5);
  vi.mocked(prisma.oneTimePayment.count).mockResolvedValue(3);
  vi.mocked(prisma.transaction.count).mockResolvedValue(20);
  vi.mocked(prisma.calendarEvent.count).mockResolvedValue(8);
  vi.mocked(prisma.client.count).mockResolvedValue(15);
  vi.mocked(prisma.user.findMany).mockResolvedValue([{ name: "Alice" }] as any);
  vi.mocked(prisma.record.groupBy).mockResolvedValue([{ tableId: 1, _count: 50 }] as any);
  vi.mocked(prisma.record.findMany).mockResolvedValue([{ data: { amount: 100 } }] as any);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
  vi.mocked(canManageAnalytics).mockReturnValue(true);
  mockRedisMulti.exec.mockResolvedValue([[null, 1], [null, true]]);
  vi.mocked(redis.ping).mockResolvedValue("PONG" as any);
  vi.mocked(redis.set).mockResolvedValue("OK" as any);
  vi.mocked(inngest.send).mockResolvedValue(undefined as any);
  vi.mocked(checkMemoryRateLimit).mockReturnValue(false);
  setupDefaultDbMocks();
});

// ═══════════════════════════════════════════════════════════════
// Auth
// ═══════════════════════════════════════════════════════════════
describe("Auth", () => {
  it("returns 401 when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(401);
  });

  it("returns 403 when no canManageAnalytics", async () => {
    vi.mocked(canManageAnalytics).mockReturnValue(false);
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════
// Body parsing
// ═══════════════════════════════════════════════════════════════
describe("Body parsing", () => {
  it("returns 413 when raw body > 512KB", async () => {
    const res = await POST(makeReq(null, { oversized: true }));
    expect(res.status).toBe(413);
  });

  it("returns 400 for invalid JSON", async () => {
    const req = new Request("http://localhost/api/ai/generate-analytics", {
      method: "POST",
      body: "not json {{{",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid JSON");
  });
});

// ═══════════════════════════════════════════════════════════════
// Input validation
// ═══════════════════════════════════════════════════════════════
describe("Input validation", () => {
  it("returns 400 when tables is not array", async () => {
    const res = await POST(makeReq({ ...validBody, tables: "not-array" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when tables > 100", async () => {
    const tables = Array.from({ length: 101 }, (_, i) => ({ id: i }));
    const res = await POST(makeReq({ ...validBody, tables }));
    expect(res.status).toBe(400);
  });

  it("accepts exactly 100 tables", async () => {
    const tables = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, name: `T${i}` }));
    const res = await POST(makeReq({ ...validBody, tables }));
    expect(res.status).toBe(202);
  });

  it("returns 400 for invalid mode", async () => {
    const res = await POST(makeReq({ ...validBody, mode: "bad-mode" }));
    expect(res.status).toBe(400);
  });

  it.each(["single", "report", "refine", "single-refine", "suggestions"])(
    "accepts valid mode: %s",
    async (mode) => {
      const body = { ...validBody, mode };
      if (mode === "refine") body.currentReport = { views: [] };
      if (mode === "single-refine") body.currentView = { type: "COUNT" };
      if (mode === "suggestions") delete (body as any).prompt;
      const res = await POST(makeReq(body));
      expect(res.status).toBe(202);
    },
  );

  it("returns 400 when prompt missing for non-suggestions mode", async () => {
    const res = await POST(makeReq({ tables: validBody.tables, mode: "single" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Prompt is required");
  });

  it("returns 400 when prompt > 10000 chars", async () => {
    const res = await POST(makeReq({ ...validBody, prompt: "x".repeat(10001) }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for suggestions mode with prompt > 10000 chars", async () => {
    const res = await POST(makeReq({
      tables: validBody.tables,
      mode: "suggestions",
      prompt: "x".repeat(10001),
    }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Prompt is too long");
  });

  it("accepts prompt exactly 10000 characters", async () => {
    const res = await POST(makeReq({ ...validBody, prompt: "x".repeat(10000) }));
    expect(res.status).toBe(202);
  });

  it("allows missing prompt for suggestions mode", async () => {
    const res = await POST(makeReq({ tables: validBody.tables, mode: "suggestions" }));
    expect(res.status).toBe(202);
  });

  it("returns 400 for refine without currentReport", async () => {
    const res = await POST(makeReq({ ...validBody, mode: "refine" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("currentReport");
  });

  it("returns 400 for single-refine without currentView", async () => {
    const res = await POST(makeReq({ ...validBody, mode: "single-refine" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("currentView");
  });
});

// ═══════════════════════════════════════════════════════════════
// Rate limiting
// ═══════════════════════════════════════════════════════════════
describe("Rate limiting", () => {
  it("returns 429 from Redis rate limit", async () => {
    mockRedisMulti.exec.mockResolvedValue([[null, 6], [null, true]]);
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(429);
  });

  it("falls back to memory when Redis throws", async () => {
    mockRedisMulti.exec.mockRejectedValue(new Error("Redis down"));
    vi.mocked(checkMemoryRateLimit).mockReturnValue(false);
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(202);
    expect(checkMemoryRateLimit).toHaveBeenCalled();
  });

  it("returns 429 from memory fallback", async () => {
    mockRedisMulti.exec.mockRejectedValue(new Error("Redis down"));
    vi.mocked(checkMemoryRateLimit).mockReturnValue(true);
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(429);
  });

  it("passes when rate limit allowed", async () => {
    mockRedisMulti.exec.mockResolvedValue([[null, 1], [null, true]]);
    const res = await POST(makeReq(validBody));
    expect(res.status).not.toBe(429);
  });

  it("returns 429 when exec() returns null results", async () => {
    mockRedisMulti.exec.mockResolvedValue(null);
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(429);
  });
});

// ═══════════════════════════════════════════════════════════════
// Redis health
// ═══════════════════════════════════════════════════════════════
describe("Redis health", () => {
  it("returns 503 when ping fails", async () => {
    vi.mocked(redis.ping).mockRejectedValue(new Error("Redis unavailable"));
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(503);
  });
});

// ═══════════════════════════════════════════════════════════════
// DB queries & enriched context
// ═══════════════════════════════════════════════════════════════
describe("DB queries & enriched context", () => {
  it("filters tables by company", async () => {
    await POST(makeReq(validBody));
    expect(prisma.tableMeta.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: 100 } }),
    );
  });

  it("executes all required DB queries", async () => {
    await POST(makeReq(validBody));
    expect(prisma.tableMeta.findMany).toHaveBeenCalled();
    expect(prisma.company.findUnique).toHaveBeenCalled();
    expect(prisma.task.count).toHaveBeenCalled();
    expect(prisma.client.count).toHaveBeenCalled();
  });

  it("builds formattedTables with columns", async () => {
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(202);
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          context: expect.objectContaining({
            formattedTables: expect.arrayContaining([
              expect.objectContaining({ id: 1, name: "Deals", columns: expect.any(Array) }),
            ]),
          }),
        }),
      }),
    );
  });

  it("filters out client tables not in DB", async () => {
    vi.mocked(prisma.tableMeta.findMany).mockResolvedValue([
      { id: 1, name: "T1", schemaJson: [{ name: "col1", type: "text" }] },
    ] as any);
    const body = { ...validBody, tables: [{ id: 1 }, { id: 99 }] };
    const res = await POST(makeReq(body));
    expect(res.status).toBe(202);
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          context: expect.objectContaining({
            formattedTables: expect.arrayContaining([expect.objectContaining({ id: 1 })]),
          }),
        }),
      }),
    );
    const sentData = vi.mocked(inngest.send).mock.calls[0][0] as any;
    expect(sentData.data.context.formattedTables).toHaveLength(1);
  });

  it("returns 202 when all client tables are filtered out", async () => {
    vi.mocked(prisma.tableMeta.findMany).mockResolvedValue([] as any);
    const body = { ...validBody, tables: [{ id: 999, name: "Ghost" }] };
    const res = await POST(makeReq(body));
    expect(res.status).toBe(202);
    const sentData = vi.mocked(inngest.send).mock.calls[0][0] as any;
    expect(sentData.data.context.formattedTables).toHaveLength(0);
  });

  it("samples up to 3 tables", async () => {
    const tables = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, name: `T${i}`, schemaJson: [] }));
    vi.mocked(prisma.tableMeta.findMany).mockResolvedValue(tables as any);
    const body = {
      ...validBody,
      tables: tables.map((t) => ({ id: t.id, name: t.name })),
    };
    await POST(makeReq(body));
    // record.findMany should be called 3 times (for the first 3 tables)
    expect(prisma.record.findMany).toHaveBeenCalledTimes(3);
  });

  it("includes currentReport for refine mode", async () => {
    const body = {
      ...validBody,
      mode: "refine",
      currentReport: { views: [{ title: "V" }] },
    };
    const res = await POST(makeReq(body));
    expect(res.status).toBe(202);
    // Verify inngest received the data with context containing currentReport
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          context: expect.objectContaining({ currentReport: { views: [{ title: "V" }] } }),
        }),
      }),
    );
  });

  it("includes currentView for single-refine mode", async () => {
    const body = {
      ...validBody,
      mode: "single-refine",
      currentView: { type: "COUNT", config: {} },
    };
    const res = await POST(makeReq(body));
    expect(res.status).toBe(202);
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          context: expect.objectContaining({ currentView: { type: "COUNT", config: {} } }),
        }),
      }),
    );
  });

  it("parses string schemaJson via JSON.parse", async () => {
    vi.mocked(prisma.tableMeta.findMany).mockResolvedValue([
      { id: 1, name: "Deals", schemaJson: JSON.stringify([{ name: "amount", type: "number" }]) },
    ] as any);
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(202);
    const sentData = vi.mocked(inngest.send).mock.calls[0][0] as any;
    const table = sentData.data.context.formattedTables[0];
    expect(table.columns).toHaveLength(1);
    expect(table.columns[0].systemName).toBe("amount");
  });

  it("defaults orgInfo to 'העסק' when company not found", async () => {
    vi.mocked(prisma.company.findUnique).mockResolvedValue(null);
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(202);
    const sentData = vi.mocked(inngest.send).mock.calls[0][0] as any;
    expect(sentData.data.context.orgInfo.companyName).toBe("העסק");
  });

  it("extracts columns from schema.columns object format", async () => {
    vi.mocked(prisma.tableMeta.findMany).mockResolvedValue([
      { id: 1, name: "Deals", schemaJson: { columns: [{ name: "amount", type: "number" }] } },
    ] as any);
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(202);
    const sentData = vi.mocked(inngest.send).mock.calls[0][0] as any;
    const table = sentData.data.context.formattedTables[0];
    expect(table.columns).toHaveLength(1);
    expect(table.columns[0].systemName).toBe("amount");
  });
});

// ═══════════════════════════════════════════════════════════════
// Event mapping
// ═══════════════════════════════════════════════════════════════
describe("Event mapping", () => {
  it("maps single mode to analytics event type", async () => {
    const res = await POST(makeReq({ ...validBody, mode: "single" }));
    expect(res.status).toBe(202);
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "analytics" }) }),
    );
  });

  it("maps report mode to analytics-report event type", async () => {
    const res = await POST(makeReq({ ...validBody, mode: "report" }));
    expect(res.status).toBe(202);
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "analytics-report" }) }),
    );
  });

  it("maps refine mode to analytics-report-refine event type", async () => {
    const body = { ...validBody, mode: "refine", currentReport: { views: [] } };
    const res = await POST(makeReq(body));
    expect(res.status).toBe(202);
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "analytics-report-refine" }) }),
    );
  });

  it("maps single-refine mode to analytics-single-refine event type", async () => {
    const body = { ...validBody, mode: "single-refine", currentView: { type: "COUNT" } };
    const res = await POST(makeReq(body));
    expect(res.status).toBe(202);
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "analytics-single-refine" }) }),
    );
  });

  it("maps suggestions mode to analytics-suggestions event type", async () => {
    const body = { tables: validBody.tables, mode: "suggestions" };
    const res = await POST(makeReq(body));
    expect(res.status).toBe(202);
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "analytics-suggestions" }) }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// Payload guard
// ═══════════════════════════════════════════════════════════════
describe("Payload guard", () => {
  it("returns 413 when enriched payload > 400KB", async () => {
    // Make the context huge by returning many columns per table (stay under 100 tables)
    vi.mocked(prisma.tableMeta.findMany).mockResolvedValue(
      Array.from({ length: 80 }, (_, i) => ({
        id: i + 1,
        name: `Table${i}`,
        schemaJson: Array.from({ length: 100 }, (__, j) => ({
          name: `col_${"x".repeat(200)}_${j}`,
          type: "text",
          options: Array.from({ length: 20 }, (___, k) => `opt_${"y".repeat(50)}_${k}`),
        })),
      })) as any,
    );
    const tables = Array.from({ length: 80 }, (_, i) => ({ id: i + 1, name: `Table${i}` }));
    const res = await POST(makeReq({ ...validBody, tables }));
    expect(res.status).toBe(413);
  });
});

// ═══════════════════════════════════════════════════════════════
// Job dispatch
// ═══════════════════════════════════════════════════════════════
describe("Job dispatch", () => {
  it("stores pending job in Redis with TTL", async () => {
    await POST(makeReq(validBody));
    expect(redis.set).toHaveBeenCalledWith(
      "ai-job:test-uuid",
      expect.stringContaining("pending"),
      "EX",
      600,
    );
  });

  it("returns 503 on Redis set failure", async () => {
    vi.mocked(redis.set).mockRejectedValue(new Error("Redis set failed"));
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(503);
  });

  it("dispatches Inngest event", async () => {
    await POST(makeReq(validBody));
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "ai-gen-test-uuid",
        name: "ai/generation.requested",
        data: expect.objectContaining({ jobId: "test-uuid" }),
      }),
    );
  });

  it("returns 202 with jobId", async () => {
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(202);
    const data = await res.json();
    expect(data.jobId).toBe("test-uuid");
  });
});

// ═══════════════════════════════════════════════════════════════
// Error handling
// ═══════════════════════════════════════════════════════════════
describe("Error handling", () => {
  it("returns 500 on unexpected error", async () => {
    vi.mocked(prisma.tableMeta.findMany).mockRejectedValue(new Error("Unexpected DB error"));
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("Internal Server Error");
  });

  it("returns 500 when inngest.send fails", async () => {
    vi.mocked(inngest.send).mockRejectedValue(new Error("Inngest down"));
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(500);
  });
});

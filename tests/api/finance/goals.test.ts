import { vi, describe, it, expect, beforeEach } from "vitest";
import {
  createMockUser,
  createPrismaMock,
  buildGetRequest,
  buildJsonRequest,
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
  RATE_LIMITS: {
    api: { prefix: "api", max: 120, windowSeconds: 60 },
    goalRead: { prefix: "goal-read", max: 60, windowSeconds: 60 },
    goalMutation: { prefix: "goal-mut", max: 30, windowSeconds: 60 },
  },
}));

vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@/lib/services/dashboard-cache", () => ({
  invalidateGoalsCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@prisma/client", () => {
  class Decimal {
    private val: any;
    constructor(v: any) {
      this.val = v;
    }
    toString() {
      return String(this.val);
    }
    toNumber() {
      return Number(this.val);
    }
  }
  return {
    Prisma: {
      Decimal,
      TransactionIsolationLevel: {
        ReadUncommitted: "ReadUncommitted",
        ReadCommitted: "ReadCommitted",
        RepeatableRead: "RepeatableRead",
        Serializable: "Serializable",
      },
    },
  };
});

/* ------------------------------------------------------------------ */
/*  Imports (after mocks)                                              */
/* ------------------------------------------------------------------ */

import { GET, POST } from "@/app/api/finance/goals/route";
import { getCurrentUser } from "@/lib/permissions-server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { inngest } from "@/lib/inngest/client";
import { NextResponse } from "next/server";

const mockGetCurrentUser = getCurrentUser as ReturnType<typeof vi.fn>;
const mockCheckRateLimit = checkRateLimit as ReturnType<typeof vi.fn>;
const mockInngestSend = inngest.send as ReturnType<typeof vi.fn>;

const BASE_URL = "http://localhost:3000/api/finance/goals";

const validBody = {
  name: "Revenue Goal",
  metricType: "REVENUE",
  targetValue: 10000,
  startDate: "2025-01-01T00:00:00.000Z",
  endDate: "2025-12-31T00:00:00.000Z",
  warningThreshold: 70,
  criticalThreshold: 50,
};

const mockGoal = {
  id: 1,
  name: "Revenue Goal",
  metricType: "REVENUE",
  targetType: "SUM",
  targetValue: "10000",
  periodType: "MONTHLY",
  startDate: "2025-01-01T00:00:00.000Z",
  endDate: "2025-12-31T00:00:00.000Z",
  filters: {},
  warningThreshold: 70,
  criticalThreshold: 50,
  isActive: true,
  isArchived: false,
  order: 0,
  notes: null,
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
};

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
/*  GET /api/finance/goals                                             */
/* ================================================================== */

describe("GET /api/finance/goals", () => {
  it("returns 401 when user is not authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const req = buildGetRequest(BASE_URL);

    const res = await GET();

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 when user lacks canViewFinance", async () => {
    mockGetCurrentUser.mockResolvedValue(
      createMockUser({ role: "basic", permissions: {} }),
    );
    const req = buildGetRequest(BASE_URL);

    const res = await GET();

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
  });

  it("returns 403 when user has canViewFinance but lacks canViewGoals", async () => {
    mockGetCurrentUser.mockResolvedValue(
      createMockUser({
        role: "basic",
        permissions: { canViewFinance: true },
      }),
    );
    const req = buildGetRequest(BASE_URL);

    const res = await GET();

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
  });

  it("returns 429 when rate limited", async () => {
    mockCheckRateLimit.mockResolvedValue(
      NextResponse.json({ error: "Too many requests" }, { status: 429 }),
    );

    const res = await GET();

    expect(res.status).toBe(429);
  });

  it("returns non-archived goals", async () => {
    prismaMock.goal.findMany.mockResolvedValue([mockGoal]);

    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe("Revenue Goal");
  });

  it("queries with orderBy [order asc, endDate asc]", async () => {
    prismaMock.goal.findMany.mockResolvedValue([]);

    await GET();

    expect(prismaMock.goal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ order: "asc" }, { endDate: "asc" }],
      }),
    );
  });

  it("limits query to 200 results", async () => {
    prismaMock.goal.findMany.mockResolvedValue([]);

    await GET();

    expect(prismaMock.goal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 200,
      }),
    );
  });

  it("filters by companyId and isArchived false", async () => {
    prismaMock.goal.findMany.mockResolvedValue([]);

    await GET();

    expect(prismaMock.goal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: 1, isArchived: false },
      }),
    );
  });

  it("returns 500 on database failure", async () => {
    prismaMock.goal.findMany.mockRejectedValue(new Error("DB down"));

    const res = await GET();

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to fetch goals");
  });

  it("uses goalRead rate limit key", async () => {
    prismaMock.goal.findMany.mockResolvedValue([]);

    await GET();

    expect(mockCheckRateLimit).toHaveBeenCalledWith("1", RATE_LIMITS.goalRead);
  });
});

/* ================================================================== */
/*  POST /api/finance/goals                                            */
/* ================================================================== */

describe("POST /api/finance/goals", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const req = buildJsonRequest(BASE_URL, "POST", validBody);

    const res = await POST(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 when user lacks canViewFinance", async () => {
    mockGetCurrentUser.mockResolvedValue(
      createMockUser({ role: "basic", permissions: {} }),
    );
    const req = buildJsonRequest(BASE_URL, "POST", validBody);

    const res = await POST(req);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
  });

  it("returns 403 when user has canViewFinance but lacks canViewGoals", async () => {
    mockGetCurrentUser.mockResolvedValue(
      createMockUser({
        role: "basic",
        permissions: { canViewFinance: true },
      }),
    );
    const req = buildJsonRequest(BASE_URL, "POST", validBody);

    const res = await POST(req);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
  });

  it("returns 429 when rate limited", async () => {
    mockCheckRateLimit.mockResolvedValue(
      NextResponse.json({ error: "Too many requests" }, { status: 429 }),
    );
    const req = buildJsonRequest(BASE_URL, "POST", validBody);

    const res = await POST(req);

    expect(res.status).toBe(429);
  });

  it("returns 413 when payload exceeds MAX_GOAL_PAYLOAD_BYTES", async () => {
    const req = buildJsonRequest(BASE_URL, "POST", validBody, {
      "content-length": "200000",
    });

    const res = await POST(req);

    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toBe("Payload too large");
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new (await import("next/server")).NextRequest(
      new URL(BASE_URL),
      {
        method: "POST",
        body: "not-json{{{",
        headers: { "content-type": "application/json" },
      },
    );

    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid JSON body");
  });

  it("returns 400 when name is missing", async () => {
    const { name, ...bodyWithoutName } = validBody;
    const req = buildJsonRequest(BASE_URL, "POST", bodyWithoutName);

    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
  });

  it("returns 400 when endDate < startDate", async () => {
    const req = buildJsonRequest(BASE_URL, "POST", {
      ...validBody,
      startDate: "2025-12-31T00:00:00.000Z",
      endDate: "2025-01-01T00:00:00.000Z",
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
  });

  it("returns 400 when warningThreshold < criticalThreshold", async () => {
    const req = buildJsonRequest(BASE_URL, "POST", {
      ...validBody,
      warningThreshold: 30,
      criticalThreshold: 80,
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
  });

  it("returns 400 for invalid metricType", async () => {
    const req = buildJsonRequest(BASE_URL, "POST", {
      ...validBody,
      metricType: "INVALID_TYPE",
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
  });

  it("returns 400 when MAX_GOALS_PER_COMPANY reached", async () => {
    prismaMock.goal.count.mockResolvedValue(50);
    prismaMock.goal.create.mockResolvedValue(mockGoal);
    const req = buildJsonRequest(BASE_URL, "POST", validBody);

    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("50");
  });

  it("returns 400 when tableId is invalid (not found for company)", async () => {
    prismaMock.goal.count.mockResolvedValue(0);
    prismaMock.tableMeta.findFirst.mockResolvedValue(null);
    const req = buildJsonRequest(BASE_URL, "POST", {
      ...validBody,
      tableId: 999,
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid tableId");
  });

  it("returns 400 when productId is invalid (not found for company)", async () => {
    prismaMock.goal.count.mockResolvedValue(0);
    prismaMock.product.findFirst.mockResolvedValue(null);
    const req = buildJsonRequest(BASE_URL, "POST", {
      ...validBody,
      productId: 999,
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid productId");
  });

  it("uses Serializable transaction isolation level", async () => {
    prismaMock.goal.count.mockResolvedValue(0);
    prismaMock.goal.create.mockResolvedValue(mockGoal);
    const req = buildJsonRequest(BASE_URL, "POST", validBody);

    await POST(req);

    expect(prismaMock.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: "Serializable" }),
    );
  });

  it("creates goal with companyId and targetValue as Decimal", async () => {
    prismaMock.goal.count.mockResolvedValue(0);
    prismaMock.goal.create.mockResolvedValue(mockGoal);
    const req = buildJsonRequest(BASE_URL, "POST", validBody);

    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Revenue Goal");

    const createCall = prismaMock.goal.create.mock.calls[0][0];
    expect(createCall.data.companyId).toBe(1);
    expect(createCall.data.name).toBe("Revenue Goal");
    expect(createCall.data.metricType).toBe("REVENUE");
    expect(createCall.data.targetValue.toString()).toBe("10000");
  });

  it("calls invalidateGoalsCache after successful creation", async () => {
    prismaMock.goal.count.mockResolvedValue(0);
    prismaMock.goal.create.mockResolvedValue(mockGoal);
    const req = buildJsonRequest(BASE_URL, "POST", validBody);

    await POST(req);

    const { invalidateGoalsCache } = await import(
      "@/lib/services/dashboard-cache"
    );
    expect(invalidateGoalsCache).toHaveBeenCalledWith(1);
  });

  it("calls inngest.send after successful creation", async () => {
    prismaMock.goal.count.mockResolvedValue(0);
    prismaMock.goal.create.mockResolvedValue(mockGoal);
    const req = buildJsonRequest(BASE_URL, "POST", validBody);

    await POST(req);

    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "dashboard/refresh-goals",
        data: { companyId: 1 },
      }),
    );
  });

  it("swallows cache invalidation errors and still returns goal", async () => {
    prismaMock.goal.count.mockResolvedValue(0);
    prismaMock.goal.create.mockResolvedValue(mockGoal);

    const { invalidateGoalsCache } = await import(
      "@/lib/services/dashboard-cache"
    );
    (invalidateGoalsCache as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Cache failure"),
    );

    const req = buildJsonRequest(BASE_URL, "POST", validBody);
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Revenue Goal");
  });

  it("swallows inngest.send errors and still returns goal", async () => {
    prismaMock.goal.count.mockResolvedValue(0);
    prismaMock.goal.create.mockResolvedValue(mockGoal);
    mockInngestSend.mockRejectedValue(new Error("Inngest failure"));

    const req = buildJsonRequest(BASE_URL, "POST", validBody);
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Revenue Goal");
  });

  it("uses goalMutation rate limit key", async () => {
    prismaMock.goal.count.mockResolvedValue(0);
    prismaMock.goal.create.mockResolvedValue(mockGoal);
    const req = buildJsonRequest(BASE_URL, "POST", validBody);

    await POST(req);

    expect(mockCheckRateLimit).toHaveBeenCalledWith("1", RATE_LIMITS.goalMutation);
  });

  it("returns 500 on unexpected database failure", async () => {
    prismaMock.$transaction.mockRejectedValue(new Error("Unexpected DB error"));
    const req = buildJsonRequest(BASE_URL, "POST", validBody);

    const res = await POST(req);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to create goal");
  });
});

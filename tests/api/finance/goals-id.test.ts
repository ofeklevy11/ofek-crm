import { vi, describe, it, expect, beforeEach } from "vitest";
import {
  createMockUser,
  createPrismaMock,
  buildGetRequest,
  buildJsonRequest,
  buildParams,
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

vi.mock("@/lib/prisma-error", () => ({
  handlePrismaError: vi.fn(),
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

import { GET, PATCH, DELETE } from "@/app/api/finance/goals/[id]/route";
import { getCurrentUser } from "@/lib/permissions-server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { inngest } from "@/lib/inngest/client";
import { handlePrismaError } from "@/lib/prisma-error";
import { NextResponse } from "next/server";

const mockGetCurrentUser = getCurrentUser as ReturnType<typeof vi.fn>;
const mockCheckRateLimit = checkRateLimit as ReturnType<typeof vi.fn>;
const mockInngestSend = inngest.send as ReturnType<typeof vi.fn>;
const mockHandlePrismaError = handlePrismaError as ReturnType<typeof vi.fn>;

const BASE_URL = "http://localhost:3000/api/finance/goals/1";

const existingGoal = {
  id: 1,
  name: "Revenue Goal",
  metricType: "REVENUE",
  targetType: "SUM",
  targetValue: "10000",
  periodType: "MONTHLY",
  startDate: new Date("2025-01-01T00:00:00.000Z"),
  endDate: new Date("2025-12-31T00:00:00.000Z"),
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
  mockHandlePrismaError.mockImplementation((_error: unknown, _context: string) => {
    return NextResponse.json({ error: "handled" }, { status: 500 });
  });
});

/* ================================================================== */
/*  GET /api/finance/goals/[id]                                        */
/* ================================================================== */

describe("GET /api/finance/goals/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const req = buildGetRequest(BASE_URL);

    const res = await GET(req, buildParams(1));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 when user lacks canViewFinance", async () => {
    mockGetCurrentUser.mockResolvedValue(
      createMockUser({ role: "basic", permissions: {} }),
    );
    const req = buildGetRequest(BASE_URL);

    const res = await GET(req, buildParams(1));

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

    const res = await GET(req, buildParams(1));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
  });

  it("returns 429 when rate limited", async () => {
    mockCheckRateLimit.mockResolvedValue(
      NextResponse.json({ error: "Too many requests" }, { status: 429 }),
    );
    const req = buildGetRequest(BASE_URL);

    const res = await GET(req, buildParams(1));

    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid goal ID", async () => {
    const req = buildGetRequest(
      "http://localhost:3000/api/finance/goals/abc",
    );

    const res = await GET(req, buildParams("abc"));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid goal ID");
  });

  it("returns goal when found", async () => {
    prismaMock.goal.findUnique.mockResolvedValue(existingGoal);
    const req = buildGetRequest(BASE_URL);

    const res = await GET(req, buildParams(1));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Revenue Goal");
  });

  it("returns 404 when goal not found", async () => {
    prismaMock.goal.findUnique.mockResolvedValue(null);
    const req = buildGetRequest(BASE_URL);

    const res = await GET(req, buildParams(1));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Goal not found");
  });

  it("returns 500 on database failure", async () => {
    prismaMock.goal.findUnique.mockRejectedValue(new Error("DB down"));
    const req = buildGetRequest(BASE_URL);

    const res = await GET(req, buildParams(1));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to fetch goal");
  });

  it("uses goalRead rate limit key", async () => {
    prismaMock.goal.findUnique.mockResolvedValue(existingGoal);
    const req = buildGetRequest(BASE_URL);
    await GET(req, buildParams(1));
    expect(mockCheckRateLimit).toHaveBeenCalledWith("1", RATE_LIMITS.goalRead);
  });

  it("queries findUnique by id and companyId", async () => {
    prismaMock.goal.findUnique.mockResolvedValue(existingGoal);
    const req = buildGetRequest(BASE_URL);

    await GET(req, buildParams(1));

    expect(prismaMock.goal.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1, companyId: 1 },
      }),
    );
  });
});

/* ================================================================== */
/*  PATCH /api/finance/goals/[id]                                      */
/* ================================================================== */

describe("PATCH /api/finance/goals/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const req = buildJsonRequest(BASE_URL, "PATCH", { name: "Updated" });

    const res = await PATCH(req, buildParams(1));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 when user lacks canViewFinance", async () => {
    mockGetCurrentUser.mockResolvedValue(
      createMockUser({ role: "basic", permissions: {} }),
    );
    const req = buildJsonRequest(BASE_URL, "PATCH", { name: "Updated" });

    const res = await PATCH(req, buildParams(1));

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
    const req = buildJsonRequest(BASE_URL, "PATCH", { name: "Updated" });

    const res = await PATCH(req, buildParams(1));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
  });

  it("returns 429 when rate limited", async () => {
    mockCheckRateLimit.mockResolvedValue(
      NextResponse.json({ error: "Too many requests" }, { status: 429 }),
    );
    const req = buildJsonRequest(BASE_URL, "PATCH", { name: "Updated" });

    const res = await PATCH(req, buildParams(1));

    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid goal ID", async () => {
    const req = buildJsonRequest(
      "http://localhost:3000/api/finance/goals/abc",
      "PATCH",
      { name: "Updated" },
    );

    const res = await PATCH(req, buildParams("abc"));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid goal ID");
  });

  it("returns 413 when payload exceeds MAX_GOAL_PAYLOAD_BYTES", async () => {
    const req = buildJsonRequest(BASE_URL, "PATCH", { name: "Updated" }, {
      "content-length": "200000",
    });

    const res = await PATCH(req, buildParams(1));

    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toBe("Payload too large");
  });

  it("returns 400 for invalid JSON body", async () => {
    const { NextRequest } = await import("next/server");
    const req = new NextRequest(new URL(BASE_URL), {
      method: "PATCH",
      body: "not-json{{{",
      headers: { "content-type": "application/json" },
    });

    const res = await PATCH(req, buildParams(1));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid JSON body");
  });

  it("returns 404 when existing goal not found for cross-field validation", async () => {
    prismaMock.goal.findUnique.mockResolvedValue(null);
    const req = buildJsonRequest(BASE_URL, "PATCH", { name: "Updated" });

    const res = await PATCH(req, buildParams(1));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Goal not found");
  });

  it("returns 400 when merged endDate < startDate", async () => {
    // Existing goal has startDate 2025-06-01. Provide endDate before that.
    prismaMock.goal.findUnique.mockResolvedValue({
      startDate: new Date("2025-06-01T00:00:00.000Z"),
      endDate: new Date("2025-12-31T00:00:00.000Z"),
      warningThreshold: 70,
      criticalThreshold: 50,
    });
    const req = buildJsonRequest(BASE_URL, "PATCH", {
      endDate: "2025-01-01T00:00:00.000Z",
    });

    const res = await PATCH(req, buildParams(1));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.details.endDate).toBeDefined();
  });

  it("returns 400 when merged warningThreshold < criticalThreshold", async () => {
    // Existing goal has criticalThreshold 50. Provide warningThreshold below that.
    prismaMock.goal.findUnique.mockResolvedValue({
      startDate: new Date("2025-01-01T00:00:00.000Z"),
      endDate: new Date("2025-12-31T00:00:00.000Z"),
      warningThreshold: 70,
      criticalThreshold: 50,
    });
    const req = buildJsonRequest(BASE_URL, "PATCH", {
      warningThreshold: 30,
    });

    const res = await PATCH(req, buildParams(1));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.details.warningThreshold).toBeDefined();
  });

  it("updates only provided fields on happy path", async () => {
    prismaMock.goal.findUnique.mockResolvedValue({
      startDate: new Date("2025-01-01T00:00:00.000Z"),
      endDate: new Date("2025-12-31T00:00:00.000Z"),
      warningThreshold: 70,
      criticalThreshold: 50,
    });
    const updatedGoal = { ...existingGoal, name: "Updated Name" };
    prismaMock.goal.update.mockResolvedValue(updatedGoal);

    const req = buildJsonRequest(BASE_URL, "PATCH", { name: "Updated Name" });
    const res = await PATCH(req, buildParams(1));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Updated Name");

    expect(prismaMock.goal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1, companyId: 1 },
        data: expect.objectContaining({ name: "Updated Name" }),
      }),
    );
  });

  it("converts targetValue to Decimal when provided", async () => {
    prismaMock.goal.findUnique.mockResolvedValue({
      startDate: new Date("2025-01-01T00:00:00.000Z"),
      endDate: new Date("2025-12-31T00:00:00.000Z"),
      warningThreshold: 70,
      criticalThreshold: 50,
    });
    prismaMock.goal.update.mockResolvedValue({
      ...existingGoal,
      targetValue: "25000",
    });

    const req = buildJsonRequest(BASE_URL, "PATCH", { targetValue: 25000 });
    const res = await PATCH(req, buildParams(1));

    expect(res.status).toBe(200);
    const updateCall = prismaMock.goal.update.mock.calls[0][0];
    expect(updateCall.data.targetValue.toString()).toBe("25000");
  });

  it("sends inngest event after successful update", async () => {
    prismaMock.goal.findUnique.mockResolvedValue({
      startDate: new Date("2025-01-01T00:00:00.000Z"),
      endDate: new Date("2025-12-31T00:00:00.000Z"),
      warningThreshold: 70,
      criticalThreshold: 50,
    });
    prismaMock.goal.update.mockResolvedValue(existingGoal);

    const req = buildJsonRequest(BASE_URL, "PATCH", { name: "Updated" });
    await PATCH(req, buildParams(1));

    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "dashboard/refresh-goals",
        data: { companyId: 1 },
      }),
    );
  });

  it("swallows inngest.send error and still returns 200", async () => {
    prismaMock.goal.findUnique.mockResolvedValue({
      startDate: new Date("2025-01-01T00:00:00.000Z"),
      endDate: new Date("2025-12-31T00:00:00.000Z"),
      warningThreshold: 70,
      criticalThreshold: 50,
    });
    prismaMock.goal.update.mockResolvedValue(existingGoal);
    mockInngestSend.mockRejectedValue(new Error("Inngest failure"));

    const req = buildJsonRequest(BASE_URL, "PATCH", { name: "Updated" });
    const res = await PATCH(req, buildParams(1));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Revenue Goal");
  });

  it("uses goalMutation rate limit key", async () => {
    prismaMock.goal.findUnique.mockResolvedValue({
      startDate: new Date("2025-01-01T00:00:00.000Z"),
      endDate: new Date("2025-12-31T00:00:00.000Z"),
      warningThreshold: 70,
      criticalThreshold: 50,
    });
    prismaMock.goal.update.mockResolvedValue(existingGoal);
    const req = buildJsonRequest(BASE_URL, "PATCH", { name: "Updated" });
    await PATCH(req, buildParams(1));
    expect(mockCheckRateLimit).toHaveBeenCalledWith("1", RATE_LIMITS.goalMutation);
  });

  it("delegates to handlePrismaError on Prisma error", async () => {
    const dbError = new Error("P2025 mock");
    mockHandlePrismaError.mockReturnValue(
      NextResponse.json({ error: "not found" }, { status: 404 }),
    );
    prismaMock.goal.findUnique.mockRejectedValue(dbError);

    const req = buildJsonRequest(BASE_URL, "PATCH", { name: "Updated" });
    const res = await PATCH(req, buildParams(1));

    expect(mockHandlePrismaError).toHaveBeenCalledWith(dbError, "goal");
    expect(res.status).toBe(404);
  });
});

/* ================================================================== */
/*  DELETE /api/finance/goals/[id]                                     */
/* ================================================================== */

describe("DELETE /api/finance/goals/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const req = buildGetRequest(BASE_URL);

    const res = await DELETE(req, buildParams(1));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 when user lacks canViewFinance", async () => {
    mockGetCurrentUser.mockResolvedValue(
      createMockUser({ role: "basic", permissions: {} }),
    );
    const req = buildGetRequest(BASE_URL);

    const res = await DELETE(req, buildParams(1));

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

    const res = await DELETE(req, buildParams(1));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
  });

  it("returns 429 when rate limited", async () => {
    mockCheckRateLimit.mockResolvedValue(
      NextResponse.json({ error: "Too many requests" }, { status: 429 }),
    );
    const req = buildGetRequest(BASE_URL);

    const res = await DELETE(req, buildParams(1));

    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid ID", async () => {
    const req = buildGetRequest(
      "http://localhost:3000/api/finance/goals/abc",
    );

    const res = await DELETE(req, buildParams("abc"));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid goal ID");
  });

  it("archives goal with isArchived true and isActive false", async () => {
    prismaMock.goal.update.mockResolvedValue({
      ...existingGoal,
      isArchived: true,
      isActive: false,
    });
    const req = buildGetRequest(BASE_URL);

    const res = await DELETE(req, buildParams(1));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    expect(prismaMock.goal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1, companyId: 1 },
        data: { isArchived: true, isActive: false },
      }),
    );
  });

  it("sends inngest event after successful deletion", async () => {
    prismaMock.goal.update.mockResolvedValue({
      ...existingGoal,
      isArchived: true,
      isActive: false,
    });
    const req = buildGetRequest(BASE_URL);

    await DELETE(req, buildParams(1));

    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "dashboard/refresh-goals",
        data: { companyId: 1 },
      }),
    );
  });

  it("swallows inngest.send error without affecting response", async () => {
    prismaMock.goal.update.mockResolvedValue({
      ...existingGoal,
      isArchived: true,
      isActive: false,
    });
    mockInngestSend.mockRejectedValue(new Error("Inngest down"));

    const req = buildGetRequest(BASE_URL);
    const res = await DELETE(req, buildParams(1));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("uses goalMutation rate limit key", async () => {
    prismaMock.goal.update.mockResolvedValue({
      ...existingGoal,
      isArchived: true,
      isActive: false,
    });
    const req = buildGetRequest(BASE_URL);
    await DELETE(req, buildParams(1));
    expect(mockCheckRateLimit).toHaveBeenCalledWith("1", RATE_LIMITS.goalMutation);
  });

  it("delegates to handlePrismaError on failure", async () => {
    const dbError = new Error("DB failure");
    mockHandlePrismaError.mockReturnValue(
      NextResponse.json({ error: "handled" }, { status: 500 }),
    );
    prismaMock.goal.update.mockRejectedValue(dbError);

    const req = buildGetRequest(BASE_URL);
    const res = await DELETE(req, buildParams(1));

    expect(mockHandlePrismaError).toHaveBeenCalledWith(dbError, "goal");
    expect(res.status).toBe(500);
  });
});

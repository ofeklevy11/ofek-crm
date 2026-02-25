import { vi, describe, it, expect, beforeEach } from "vitest";
import {
  createMockUser,
  createPrismaMock,
  buildJsonRequest,
  buildGetRequest,
  buildParams,
} from "@/tests/helpers/finance-mocks";

let prismaMock: ReturnType<typeof createPrismaMock>;

vi.mock("@/lib/permissions-server", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/permissions", async () => {
  const actual = await vi.importActual("@/lib/permissions");
  return actual;
});

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

import { GET, PATCH, DELETE } from "@/app/api/finance/retainers/[id]/route";
import { getCurrentUser } from "@/lib/permissions-server";
import { checkRateLimit } from "@/lib/rate-limit";
import { NextResponse } from "next/server";

const mockGetCurrentUser = getCurrentUser as ReturnType<typeof vi.fn>;
const mockCheckRateLimit = checkRateLimit as ReturnType<typeof vi.fn>;

const BASE_URL = "http://localhost:3000/api/finance/retainers/1";

function sampleRetainer(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    clientId: 10,
    title: "Monthly Support",
    amount: 2500,
    frequency: "monthly",
    startDate: new Date("2025-01-15"),
    nextDueDate: new Date("2025-02-15"),
    status: "active",
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    client: {
      id: 10,
      name: "Acme Corp",
      email: "acme@test.com",
      phone: "0501234567",
      businessName: "Acme",
    },
    ...overrides,
  };
}

// ─── GET ────────────────────────────────────────────────────────────────────

describe("GET /api/finance/retainers/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock = createPrismaMock();
    mockGetCurrentUser.mockResolvedValue(createMockUser());
    mockCheckRateLimit.mockResolvedValue(null);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await GET(buildGetRequest(BASE_URL), buildParams(1));

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });

  it("returns 403 when user lacks canViewFinance", async () => {
    mockGetCurrentUser.mockResolvedValue(
      createMockUser({ role: "basic", permissions: {} })
    );

    const res = await GET(buildGetRequest(BASE_URL), buildParams(1));

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("Forbidden");
  });

  it("returns 429 when rate limited", async () => {
    mockCheckRateLimit.mockResolvedValue(
      NextResponse.json({ error: "Too many requests" }, { status: 429 })
    );

    const res = await GET(buildGetRequest(BASE_URL), buildParams(1));

    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid ID", async () => {
    const res = await GET(
      buildGetRequest("http://localhost:3000/api/finance/retainers/abc"),
      buildParams("abc")
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Invalid retainer ID");
  });

  it("returns retainer with client data", async () => {
    const retainer = sampleRetainer();
    prismaMock.retainer.findFirst.mockResolvedValue(retainer);

    const res = await GET(buildGetRequest(BASE_URL), buildParams(1));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.title).toBe("Monthly Support");
    expect(json.client.name).toBe("Acme Corp");
  });

  it("returns 404 when retainer not found", async () => {
    prismaMock.retainer.findFirst.mockResolvedValue(null);

    const res = await GET(buildGetRequest(BASE_URL), buildParams(1));

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Retainer not found");
  });

  it("returns 500 on database failure", async () => {
    prismaMock.retainer.findFirst.mockRejectedValue(new Error("DB down"));

    const res = await GET(buildGetRequest(BASE_URL), buildParams(1));

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Failed to fetch retainer");
  });
});

// ─── PATCH ──────────────────────────────────────────────────────────────────

describe("PATCH /api/finance/retainers/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock = createPrismaMock();
    mockGetCurrentUser.mockResolvedValue(createMockUser());
    mockCheckRateLimit.mockResolvedValue(null);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const req = buildJsonRequest(BASE_URL, "PATCH", { title: "Updated" });
    const res = await PATCH(req, buildParams(1));

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });

  it("returns 403 when user lacks canViewFinance", async () => {
    mockGetCurrentUser.mockResolvedValue(
      createMockUser({ role: "basic", permissions: {} })
    );

    const req = buildJsonRequest(BASE_URL, "PATCH", { title: "Updated" });
    const res = await PATCH(req, buildParams(1));

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("Forbidden");
  });

  it("returns 429 when rate limited", async () => {
    mockCheckRateLimit.mockResolvedValue(
      NextResponse.json({ error: "Too many requests" }, { status: 429 })
    );

    const req = buildJsonRequest(BASE_URL, "PATCH", { title: "Updated" });
    const res = await PATCH(req, buildParams(1));

    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid ID", async () => {
    const req = buildJsonRequest(
      "http://localhost:3000/api/finance/retainers/abc",
      "PATCH",
      { title: "Updated" }
    );
    const res = await PATCH(req, buildParams("abc"));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Invalid retainer ID");
  });

  it("performs partial update with just title", async () => {
    const existing = sampleRetainer();
    const updated = { ...existing, title: "Updated Title" };
    prismaMock.retainer.findFirst.mockResolvedValue(existing);
    prismaMock.retainer.update.mockResolvedValue(updated);

    const req = buildJsonRequest(BASE_URL, "PATCH", { title: "Updated Title" });
    const res = await PATCH(req, buildParams(1));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.title).toBe("Updated Title");
  });

  it("returns 400 for invalid status", async () => {
    const req = buildJsonRequest(BASE_URL, "PATCH", { status: "bogus" });
    const res = await PATCH(req, buildParams(1));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Validation failed");
    expect(json.details.status).toBeDefined();
  });

  it("returns 400 for invalid frequency", async () => {
    const req = buildJsonRequest(BASE_URL, "PATCH", { frequency: "biweekly" });
    const res = await PATCH(req, buildParams(1));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Validation failed");
    expect(json.details.frequency).toBeDefined();
  });

  it("returns 404 when retainer not found in transaction", async () => {
    prismaMock.retainer.findFirst.mockResolvedValue(null);

    const req = buildJsonRequest(BASE_URL, "PATCH", { title: "Updated" });
    const res = await PATCH(req, buildParams(1));

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Retainer not found");
  });

  it("uses RepeatableRead isolation level", async () => {
    const existing = sampleRetainer();
    prismaMock.retainer.findFirst.mockResolvedValue(existing);
    prismaMock.retainer.update.mockResolvedValue(existing);

    const req = buildJsonRequest(BASE_URL, "PATCH", { title: "Updated" });
    await PATCH(req, buildParams(1));

    expect(prismaMock.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: "RepeatableRead" }
    );
  });

  it("returns 500 on database failure", async () => {
    prismaMock.$transaction.mockRejectedValue(new Error("DB connection lost"));

    const req = buildJsonRequest(BASE_URL, "PATCH", { title: "Updated" });
    const res = await PATCH(req, buildParams(1));

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Failed to update retainer");
  });
});

// ─── DELETE ─────────────────────────────────────────────────────────────────

describe("DELETE /api/finance/retainers/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock = createPrismaMock();
    mockGetCurrentUser.mockResolvedValue(createMockUser());
    mockCheckRateLimit.mockResolvedValue(null);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const req = buildGetRequest(BASE_URL);
    const res = await DELETE(req, buildParams(1));

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });

  it("returns 403 when user lacks canViewFinance", async () => {
    mockGetCurrentUser.mockResolvedValue(
      createMockUser({ role: "basic", permissions: {} })
    );

    const req = buildGetRequest(BASE_URL);
    const res = await DELETE(req, buildParams(1));

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("Forbidden");
  });

  it("returns 429 when rate limited", async () => {
    mockCheckRateLimit.mockResolvedValue(
      NextResponse.json({ error: "Too many requests" }, { status: 429 })
    );

    const req = buildGetRequest(BASE_URL);
    const res = await DELETE(req, buildParams(1));

    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid ID", async () => {
    const req = buildGetRequest(
      "http://localhost:3000/api/finance/retainers/abc"
    );
    const res = await DELETE(req, buildParams("abc"));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Invalid retainer ID");
  });

  it("soft-deletes and returns success when count > 0", async () => {
    prismaMock.retainer.updateMany.mockResolvedValue({ count: 1 });

    const req = buildGetRequest(BASE_URL);
    const res = await DELETE(req, buildParams(1));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(prismaMock.retainer.updateMany).toHaveBeenCalledWith({
      where: { id: 1, companyId: 1, deletedAt: null },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it("returns 404 when count === 0", async () => {
    prismaMock.retainer.updateMany.mockResolvedValue({ count: 0 });

    const req = buildGetRequest(BASE_URL);
    const res = await DELETE(req, buildParams(1));

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Retainer not found");
  });

  it("uses updateMany directly, not $transaction", async () => {
    prismaMock.retainer.updateMany.mockResolvedValue({ count: 1 });

    const req = buildGetRequest(BASE_URL);
    await DELETE(req, buildParams(1));

    expect(prismaMock.retainer.updateMany).toHaveBeenCalledWith({
      where: { id: 1, companyId: 1, deletedAt: null },
      data: { deletedAt: expect.any(Date) },
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("returns 500 on database failure", async () => {
    prismaMock.retainer.updateMany.mockRejectedValue(new Error("DB connection lost"));

    const req = buildGetRequest(BASE_URL);
    const res = await DELETE(req, buildParams(1));

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Failed to delete retainer");
  });
});

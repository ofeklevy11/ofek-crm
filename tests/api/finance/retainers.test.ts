import { vi, describe, it, expect, beforeEach } from "vitest";
import {
  createMockUser,
  createPrismaMock,
  buildJsonRequest,
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

import { POST } from "@/app/api/finance/retainers/route";
import { getCurrentUser } from "@/lib/permissions-server";
import { checkRateLimit } from "@/lib/rate-limit";
import { NextResponse } from "next/server";

const mockGetCurrentUser = getCurrentUser as ReturnType<typeof vi.fn>;
const mockCheckRateLimit = checkRateLimit as ReturnType<typeof vi.fn>;

const BASE_URL = "http://localhost:3000/api/finance/retainers";

function validBody(overrides: Record<string, any> = {}) {
  return {
    title: "Monthly Support",
    clientId: 10,
    amount: 2500,
    frequency: "monthly",
    startDate: "2025-01-15",
    notes: "Some notes",
    ...overrides,
  };
}

describe("POST /api/finance/retainers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock = createPrismaMock();
    mockGetCurrentUser.mockResolvedValue(createMockUser());
    mockCheckRateLimit.mockResolvedValue(null);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const req = buildJsonRequest(BASE_URL, "POST", validBody());
    const res = await POST(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });

  it("returns 403 when user lacks canViewFinance", async () => {
    mockGetCurrentUser.mockResolvedValue(
      createMockUser({ role: "basic", permissions: {} })
    );

    const req = buildJsonRequest(BASE_URL, "POST", validBody());
    const res = await POST(req);

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("Forbidden");
  });

  it("returns 429 when rate limited", async () => {
    mockCheckRateLimit.mockResolvedValue(
      NextResponse.json({ error: "Too many requests" }, { status: 429 })
    );

    const req = buildJsonRequest(BASE_URL, "POST", validBody());
    const res = await POST(req);

    expect(res.status).toBe(429);
  });

  it("returns 400 when title is missing", async () => {
    const req = buildJsonRequest(BASE_URL, "POST", validBody({ title: "" }));
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Validation failed");
  });

  it("returns 400 for invalid frequency", async () => {
    const req = buildJsonRequest(
      BASE_URL,
      "POST",
      validBody({ frequency: "biweekly" })
    );
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Validation failed");
    expect(json.details.frequency).toBeDefined();
  });

  it("returns 400 for non-positive amount", async () => {
    const req = buildJsonRequest(
      BASE_URL,
      "POST",
      validBody({ amount: -100 })
    );
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Validation failed");
    expect(json.details.amount).toBeDefined();
  });

  it("calculates nextDueDate as +1 month for monthly", async () => {
    prismaMock.client.findFirst.mockResolvedValue({ id: 10 });
    prismaMock.retainer.create.mockResolvedValue({
      id: 1,
      title: "Monthly Support",
      status: "active",
    });

    const req = buildJsonRequest(
      BASE_URL,
      "POST",
      validBody({ frequency: "monthly", startDate: "2025-01-15" })
    );
    const res = await POST(req);

    expect(res.status).toBe(201);
    const createCall = prismaMock.retainer.create.mock.calls[0][0];
    const expectedDate = new Date("2025-01-15");
    expectedDate.setMonth(expectedDate.getMonth() + 1);
    expect(createCall.data.nextDueDate).toEqual(expectedDate);
  });

  it("calculates nextDueDate as +3 months for quarterly", async () => {
    prismaMock.client.findFirst.mockResolvedValue({ id: 10 });
    prismaMock.retainer.create.mockResolvedValue({
      id: 1,
      title: "Quarterly Support",
      status: "active",
    });

    const req = buildJsonRequest(
      BASE_URL,
      "POST",
      validBody({ frequency: "quarterly", startDate: "2025-01-15" })
    );
    const res = await POST(req);

    expect(res.status).toBe(201);
    const createCall = prismaMock.retainer.create.mock.calls[0][0];
    const expectedDate = new Date("2025-01-15");
    expectedDate.setMonth(expectedDate.getMonth() + 3);
    expect(createCall.data.nextDueDate).toEqual(expectedDate);
  });

  it("calculates nextDueDate as +1 year for annually", async () => {
    prismaMock.client.findFirst.mockResolvedValue({ id: 10 });
    prismaMock.retainer.create.mockResolvedValue({
      id: 1,
      title: "Annual Support",
      status: "active",
    });

    const req = buildJsonRequest(
      BASE_URL,
      "POST",
      validBody({ frequency: "annually", startDate: "2025-01-15" })
    );
    const res = await POST(req);

    expect(res.status).toBe(201);
    const createCall = prismaMock.retainer.create.mock.calls[0][0];
    const expectedDate = new Date("2025-01-15");
    expectedDate.setFullYear(expectedDate.getFullYear() + 1);
    expect(createCall.data.nextDueDate).toEqual(expectedDate);
  });

  it("returns 404 when client not found in transaction", async () => {
    prismaMock.client.findFirst.mockResolvedValue(null);

    const req = buildJsonRequest(BASE_URL, "POST", validBody());
    const res = await POST(req);

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Client not found");
  });

  it("returns 201 with status active on happy path", async () => {
    const retainerData = {
      id: 1,
      clientId: 10,
      title: "Monthly Support",
      amount: 2500,
      frequency: "monthly",
      startDate: new Date("2025-01-15"),
      nextDueDate: new Date("2025-02-15"),
      status: "active",
      notes: "Some notes",
      createdAt: new Date(),
    };
    prismaMock.client.findFirst.mockResolvedValue({ id: 10 });
    prismaMock.retainer.create.mockResolvedValue(retainerData);

    const req = buildJsonRequest(BASE_URL, "POST", validBody());
    const res = await POST(req);

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.status).toBe("active");
    expect(json.title).toBe("Monthly Support");
  });

  it("sets notes to null when notes is omitted", async () => {
    prismaMock.client.findFirst.mockResolvedValue({ id: 10 });
    prismaMock.retainer.create.mockResolvedValue({
      id: 1,
      title: "No Notes",
      status: "active",
      notes: null,
    });

    const body = validBody();
    delete body.notes;
    const req = buildJsonRequest(BASE_URL, "POST", body);
    const res = await POST(req);

    expect(res.status).toBe(201);
    const createCall = prismaMock.retainer.create.mock.calls[0][0];
    expect(createCall.data.notes).toBeNull();
  });

  it("returns 500 on database failure", async () => {
    prismaMock.$transaction.mockRejectedValue(new Error("DB connection lost"));

    const req = buildJsonRequest(BASE_URL, "POST", validBody());
    const res = await POST(req);

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Failed to create retainer");
  });
});

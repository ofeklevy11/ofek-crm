import { vi } from "vitest";
import { NextRequest } from "next/server";

export function createMockUser(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    companyId: 1,
    name: "Test Admin",
    email: "admin@test.com",
    role: "admin" as const,
    allowedWriteTableIds: [],
    permissions: {},
    ...overrides,
  };
}

export function createPrismaMock() {
  const mock: Record<string, any> = {
    client: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      count: vi.fn().mockResolvedValue(0),
    },
    oneTimePayment: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    retainer: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    goal: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      count: vi.fn().mockResolvedValue(0),
    },
    tableMeta: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    product: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    record: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    transaction: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    financeRecord: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: vi.fn(async (fn: any) => {
      if (typeof fn === "function") {
        return fn(mock);
      }
      return fn;
    }),
    $queryRaw: vi.fn().mockResolvedValue([]),
  };
  return mock;
}

export function buildGetRequest(url: string, params?: Record<string, string>): NextRequest {
  const u = new URL(url);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      u.searchParams.set(k, v);
    }
  }
  return new NextRequest(u);
}

export function buildJsonRequest(
  url: string,
  method: string,
  body: any,
  headers?: Record<string, string>,
): NextRequest {
  return new NextRequest(new URL(url), {
    method,
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      ...headers,
    },
  });
}

export function buildParams(id: number | string) {
  return { params: Promise.resolve({ id: String(id) }) };
}

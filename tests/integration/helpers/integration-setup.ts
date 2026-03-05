/**
 * Shared helpers for integration tests.
 * Provides seed factories, auth token helpers, request builders, and cleanup.
 */
import { prisma } from "@/lib/prisma";
import { signUserId } from "@/lib/auth";

// ── Auth token control ─────────────────────────────────────────────
let _authToken: string | null = null;

export function setAuthToken(token: string | null) {
  _authToken = token;
}

export function getAuthToken(): string | null {
  return _authToken;
}

export function signTokenForUser(userId: number): string {
  return signUserId(userId);
}

// ── Seed factories ─────────────────────────────────────────────────

export async function seedCompany(overrides: Record<string, any> = {}) {
  return prisma.company.create({
    data: {
      name: overrides.name ?? "Test Company",
      slug: overrides.slug ?? `test-co-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...overrides,
    },
  });
}

export async function seedUser(
  companyId: number,
  overrides: Record<string, any> = {}
) {
  const uniq = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return prisma.user.create({
    data: {
      companyId,
      name: overrides.name ?? "Test User",
      email: overrides.email ?? `user-${uniq}@test.com`,
      passwordHash: overrides.passwordHash ?? "not-a-real-hash",
      role: overrides.role ?? "basic",
      permissions: overrides.permissions ?? {},
      tablePermissions: overrides.tablePermissions ?? {},
      allowedWriteTableIds: overrides.allowedWriteTableIds ?? [],
      ...overrides,
    },
  });
}

export async function seedTable(
  companyId: number,
  createdBy: number,
  overrides: Record<string, any> = {}
) {
  const uniq = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return prisma.tableMeta.create({
    data: {
      companyId,
      createdBy,
      name: overrides.name ?? "Test Table",
      slug: overrides.slug ?? `test-table-${uniq}`,
      schemaJson: overrides.schemaJson ?? {},
      ...overrides,
    },
  });
}

export async function seedCategory(
  companyId: number,
  name?: string
) {
  return prisma.tableCategory.create({
    data: {
      companyId,
      name: name ?? `Category ${Date.now()}`,
    },
  });
}

export async function seedRecord(
  companyId: number,
  tableId: number,
  data: Record<string, any> = {}
) {
  return prisma.record.create({
    data: {
      companyId,
      tableId,
      data,
    },
  });
}

export async function seedFile(companyId: number, recordId: number) {
  return prisma.file.create({
    data: {
      companyId,
      recordId,
      name: `file-${Date.now()}.txt`,
      url: `https://example.com/files/${Date.now()}`,
      key: `key-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      size: 1024,
      type: "text/plain",
    },
  });
}

export async function seedView(
  companyId: number,
  tableId: number,
  slug?: string
) {
  return prisma.view.create({
    data: {
      companyId,
      tableId,
      name: `View ${Date.now()}`,
      slug: slug ?? `view-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      config: { type: "count", filters: [] },
      isEnabled: true,
      order: 0,
    },
  });
}

// ── Request builders ───────────────────────────────────────────────

export function buildGetRequest(
  url: string,
  params?: Record<string, string>
): Request {
  const u = new URL(url, "http://localhost:3000");
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      u.searchParams.set(k, v);
    }
  }
  return new Request(u.toString(), { method: "GET" });
}

export function buildJsonRequest(
  url: string,
  method: string,
  body: unknown
): Request {
  return new Request(new URL(url, "http://localhost:3000").toString(), {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Build the params object expected by Next.js [id] route handlers. */
export function makeParams(id: number | string) {
  return { params: Promise.resolve({ id: String(id) }) };
}

import { describe, it, expect, vi, beforeAll, afterAll, afterEach, beforeEach } from "vitest";

// ── Mocks (infrastructure only — Prisma stays real) ─────────────────────────
vi.mock("@/lib/permissions-server", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(null),
  checkActionRateLimit: vi.fn().mockResolvedValue(false),
  RATE_LIMITS: {
    fileRead: { prefix: "file-read", max: 60, windowSeconds: 60 },
    fileMutation: { prefix: "file-mut", max: 30, windowSeconds: 60 },
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// ── UTApi mock — expose `mockDeleteFiles` so tests can assert calls ─────────
const mockDeleteFiles = vi.fn().mockResolvedValue(undefined);
vi.mock("uploadthing/server", () => {
  return { UTApi: vi.fn().mockImplementation(() => ({ deleteFiles: mockDeleteFiles })) };
});

// ── Real imports ────────────────────────────────────────────────────────────
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { revalidatePath } from "next/cache";

import { PUT } from "@/app/api/files/[id]/route";
import { GET } from "@/app/api/files/[id]/download/route";

import {
  getStorageData,
  getAllFiles,
  saveFileMetadata,
  moveFileToFolder,
  createFolder,
  renameFolder,
  updateFile,
  deleteFolder,
  deleteFile,
} from "@/app/actions/storage";

// ── Helpers ─────────────────────────────────────────────────────────────────

const mockGetCurrentUser = getCurrentUser as ReturnType<typeof vi.fn>;
const mockRevalidatePath = revalidatePath as ReturnType<typeof vi.fn>;

interface TestUser {
  id: number;
  companyId: number;
  name: string;
  email: string;
  role: string;
  permissions: Record<string, boolean>;
  allowedWriteTableIds: number[];
}

const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
let counter = 0;
function uniq() {
  return `${suffix}-${++counter}`;
}

function mockUser(user: TestUser | null) {
  mockGetCurrentUser.mockResolvedValue(user ? ({ ...user } as any) : null);
}

function makeParams(id: number | string) {
  return { params: Promise.resolve({ id: String(id) }) };
}

function buildPutRequest(url: string, body: unknown): Request {
  return new Request(new URL(url, "http://localhost:3000").toString(), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function buildPutRequestRaw(url: string, rawBody: string): Request {
  return new Request(new URL(url, "http://localhost:3000").toString(), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: rawBody,
  });
}

function buildGetRequest(url: string): Request {
  return new Request(new URL(url, "http://localhost:3000").toString(), { method: "GET" });
}

async function seedFileRow(companyId: number, overrides: Record<string, any> = {}) {
  return prisma.file.create({
    data: {
      companyId,
      name: overrides.name ?? `file-${uniq()}.txt`,
      url: overrides.url ?? `https://utfs.io/f/${uniq()}`,
      key: overrides.key ?? `key-${uniq()}`,
      size: overrides.size ?? 1024,
      type: overrides.type ?? "text/plain",
      displayName: overrides.displayName ?? undefined,
      source: overrides.source ?? undefined,
      folderId: overrides.folderId ?? undefined,
      recordId: overrides.recordId ?? undefined,
    },
  });
}

async function seedFolderRow(companyId: number, overrides: Record<string, any> = {}) {
  return prisma.folder.create({
    data: {
      companyId,
      name: overrides.name ?? `Folder-${uniq()}`,
      parentId: overrides.parentId ?? undefined,
    },
  });
}

// ── State ───────────────────────────────────────────────────────────────────

let companyA: number;
let companyB: number;
let adminA: TestUser;
let basicA: TestUser; // no canViewFiles
let basicWithFiles: TestUser; // basic role WITH canViewFiles
let adminB: TestUser;

// For record-related tests
let tableA: any;
let recordA: any;

// For cross-company record tests (seeded once, cleaned up in afterAll)
let tableB: any;
let recordB: any;

// ── Setup / Teardown ────────────────────────────────────────────────────────

beforeAll(async () => {
  const coA = await prisma.company.create({ data: { name: "Files Co A", slug: `files-co-a-${suffix}` } });
  const coB = await prisma.company.create({ data: { name: "Files Co B", slug: `files-co-b-${suffix}` } });
  companyA = coA.id;
  companyB = coB.id;

  const mkUser = async (
    compId: number,
    name: string,
    role: string,
    perms: Record<string, boolean>,
  ): Promise<TestUser> => {
    const u = await prisma.user.create({
      data: {
        companyId: compId,
        name,
        email: `${name.toLowerCase().replace(/\s/g, "-")}-${suffix}@test.com`,
        passwordHash: "$unused$",
        role: role as any,
        permissions: perms,
        allowedWriteTableIds: [],
      },
    });
    return {
      id: u.id,
      companyId: u.companyId,
      name: u.name,
      email: u.email,
      role: u.role,
      permissions: perms,
      allowedWriteTableIds: [],
    };
  };

  adminA = await mkUser(companyA, "File Admin A", "admin", {});
  basicA = await mkUser(companyA, "File Basic A", "basic", {}); // no canViewFiles
  basicWithFiles = await mkUser(companyA, "File Basic Files", "basic", { canViewFiles: true });
  adminB = await mkUser(companyB, "File Admin B", "admin", {});

  // Seed a table + record for record-linking tests (company A)
  tableA = await prisma.tableMeta.create({
    data: {
      companyId: companyA,
      createdBy: adminA.id,
      name: "Projects",
      slug: `projects-${suffix}`,
      schemaJson: {},
    },
  });
  recordA = await prisma.record.create({
    data: { companyId: companyA, tableId: tableA.id, data: {} },
  });

  // Seed table + record for company B (used in cross-company tests)
  tableB = await prisma.tableMeta.create({
    data: {
      companyId: companyB,
      createdBy: adminB.id,
      name: "B Projects",
      slug: `b-projects-${suffix}`,
      schemaJson: {},
    },
  });
  recordB = await prisma.record.create({
    data: { companyId: companyB, tableId: tableB.id, data: {} },
  });
});

afterEach(async () => {
  // FK-safe order: files before folders
  await prisma.file.deleteMany({ where: { companyId: { in: [companyA, companyB] } } });
  await prisma.folder.deleteMany({ where: { companyId: { in: [companyA, companyB] } } });
  vi.clearAllMocks();
  // Re-default mocks
  mockUser(adminA);
});

afterAll(async () => {
  if (!companyA) return;
  await prisma.file.deleteMany({ where: { companyId: { in: [companyA, companyB] } } });
  await prisma.folder.deleteMany({ where: { companyId: { in: [companyA, companyB] } } });
  await prisma.record.deleteMany({ where: { companyId: { in: [companyA, companyB] } } });
  await prisma.tableMeta.deleteMany({ where: { companyId: { in: [companyA, companyB] } } });
  await prisma.user.deleteMany({ where: { companyId: { in: [companyA, companyB] } } });
  await prisma.company.deleteMany({ where: { id: { in: [companyA, companyB] } } });
  await prisma.$disconnect();
});

beforeEach(() => {
  mockUser(adminA);
});

// ═════════════════════════════════════════════════════════════════════════════
// PUT /api/files/[id] — Update File Display Name
// ═════════════════════════════════════════════════════════════════════════════

describe("PUT /api/files/[id] — Update File Display Name", () => {
  describe("Auth & Permissions", () => {
    it("returns 401 when unauthenticated", async () => {
      mockUser(null);
      const file = await seedFileRow(companyA);
      const res = await PUT(buildPutRequest(`/api/files/${file.id}`, { displayName: "new" }), makeParams(file.id));
      expect(res.status).toBe(401);
      expect((await res.json()).error).toBe("Unauthorized");
    });

    it("returns 403 when user lacks canViewFiles", async () => {
      mockUser(basicA);
      const file = await seedFileRow(companyA);
      const res = await PUT(buildPutRequest(`/api/files/${file.id}`, { displayName: "new" }), makeParams(file.id));
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe("Forbidden");
    });

    it("returns 200 for admin user and updates DB", async () => {
      const file = await seedFileRow(companyA);
      const res = await PUT(buildPutRequest(`/api/files/${file.id}`, { displayName: "Updated" }), makeParams(file.id));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.displayName).toBe("Updated");
      const dbFile = await prisma.file.findUnique({ where: { id: file.id } });
      expect(dbFile!.displayName).toBe("Updated");
    });

    it("returns 200 for basic user with canViewFiles", async () => {
      mockUser(basicWithFiles);
      const file = await seedFileRow(companyA);
      const res = await PUT(buildPutRequest(`/api/files/${file.id}`, { displayName: "Basic Updated" }), makeParams(file.id));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.displayName).toBe("Basic Updated");
      const dbFile = await prisma.file.findUnique({ where: { id: file.id } });
      expect(dbFile!.displayName).toBe("Basic Updated");
    });
  });

  describe("Validation", () => {
    it("returns 400 for non-numeric file ID", async () => {
      const res = await PUT(buildPutRequest("/api/files/abc", { displayName: "x" }), makeParams("abc"));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("Invalid file ID");
    });

    it("returns 400 for negative file ID", async () => {
      const res = await PUT(buildPutRequest("/api/files/-1", { displayName: "x" }), makeParams("-1"));
      expect(res.status).toBe(400);
    });

    it("returns 400 for zero file ID", async () => {
      const res = await PUT(buildPutRequest("/api/files/0", { displayName: "x" }), makeParams("0"));
      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid JSON body", async () => {
      const file = await seedFileRow(companyA);
      const res = await PUT(buildPutRequestRaw(`/api/files/${file.id}`, "not-json{"), makeParams(file.id));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("Invalid JSON body");
    });

    it("returns 400 when displayName exceeds 255 chars", async () => {
      const file = await seedFileRow(companyA);
      const longName = "x".repeat(256);
      const res = await PUT(buildPutRequest(`/api/files/${file.id}`, { displayName: longName }), makeParams(file.id));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("Invalid display name");
    });

    it("returns 400 when displayName is not a string", async () => {
      const file = await seedFileRow(companyA);
      const res = await PUT(buildPutRequest(`/api/files/${file.id}`, { displayName: 123 }), makeParams(file.id));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("Invalid display name");
    });

    it("accepts null displayName and clears it in DB", async () => {
      const file = await seedFileRow(companyA, { displayName: "Original" });
      const res = await PUT(buildPutRequest(`/api/files/${file.id}`, { displayName: null }), makeParams(file.id));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.displayName).toBeNull();
      const dbFile = await prisma.file.findUnique({ where: { id: file.id } });
      expect(dbFile!.displayName).toBeNull();
    });

    it("accepts undefined displayName (empty body) and clears it in DB", async () => {
      const file = await seedFileRow(companyA, { displayName: "Original" });
      const res = await PUT(buildPutRequest(`/api/files/${file.id}`, {}), makeParams(file.id));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.displayName).toBeNull();
      const dbFile = await prisma.file.findUnique({ where: { id: file.id } });
      expect(dbFile!.displayName).toBeNull();
    });
  });

  describe("CRUD", () => {
    it("updates displayName and verifies DB state", async () => {
      const file = await seedFileRow(companyA);
      const res = await PUT(buildPutRequest(`/api/files/${file.id}`, { displayName: "My Report" }), makeParams(file.id));
      expect(res.status).toBe(200);

      const dbFile = await prisma.file.findUnique({ where: { id: file.id } });
      expect(dbFile!.displayName).toBe("My Report");
    });

    it("trims whitespace from displayName and verifies DB", async () => {
      const file = await seedFileRow(companyA);
      const res = await PUT(buildPutRequest(`/api/files/${file.id}`, { displayName: "  Trimmed  " }), makeParams(file.id));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.displayName).toBe("Trimmed");
      const dbFile = await prisma.file.findUnique({ where: { id: file.id } });
      expect(dbFile!.displayName).toBe("Trimmed");
    });

    it("sets displayName to null when empty string provided and verifies DB", async () => {
      const file = await seedFileRow(companyA, { displayName: "Original" });
      const res = await PUT(buildPutRequest(`/api/files/${file.id}`, { displayName: "" }), makeParams(file.id));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.displayName).toBeNull();
      const dbFile = await prisma.file.findUnique({ where: { id: file.id } });
      expect(dbFile!.displayName).toBeNull();
    });

    it("returns response with downloadUrl field", async () => {
      const file = await seedFileRow(companyA);
      const res = await PUT(buildPutRequest(`/api/files/${file.id}`, { displayName: "X" }), makeParams(file.id));
      const body = await res.json();
      expect(body.downloadUrl).toBe(`/api/files/${file.id}/download`);
    });

    it("response matches expected shape and does not leak sensitive fields", async () => {
      const file = await seedFileRow(companyA, { name: "shape-test.txt" });
      const res = await PUT(buildPutRequest(`/api/files/${file.id}`, { displayName: "Shape" }), makeParams(file.id));
      const body = await res.json();
      // Strict toEqual — catches any extra field leak (url, key, companyId, etc.)
      expect(body).toEqual({
        id: file.id,
        name: "shape-test.txt",
        displayName: "Shape",
        size: 1024,
        type: "text/plain",
        folderId: null,
        recordId: null,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        downloadUrl: `/api/files/${file.id}/download`,
      });
    });

    it("updatedAt changes after update", async () => {
      const file = await seedFileRow(companyA);
      const beforeUpdate = file.updatedAt;
      // Small delay to ensure different timestamp
      await new Promise((r) => setTimeout(r, 50));
      const res = await PUT(buildPutRequest(`/api/files/${file.id}`, { displayName: "Later" }), makeParams(file.id));
      const body = await res.json();
      expect(new Date(body.updatedAt).getTime()).toBeGreaterThan(new Date(beforeUpdate).getTime());
    });
  });

  describe("Multi-Tenant Isolation", () => {
    it("returns 404 when updating file from another company", async () => {
      const fileB = await seedFileRow(companyB, { displayName: null });
      mockUser(adminA); // company A user
      const res = await PUT(buildPutRequest(`/api/files/${fileB.id}`, { displayName: "hacked" }), makeParams(fileB.id));
      expect(res.status).toBe(404);
      const dbFile = await prisma.file.findUnique({ where: { id: fileB.id } });
      expect(dbFile!.displayName).toBeNull();
    });

    it("P2025 error mapped to 404", async () => {
      const res = await PUT(buildPutRequest("/api/files/999999", { displayName: "nope" }), makeParams(999999));
      expect(res.status).toBe(404);
      expect((await res.json()).error).toBe("File not found");
    });
  });

  describe("DateTime Serialization", () => {
    it("createdAt/updatedAt are valid ISO 8601 strings", async () => {
      const file = await seedFileRow(companyA);
      const res = await PUT(buildPutRequest(`/api/files/${file.id}`, { displayName: "dates" }), makeParams(file.id));
      const body = await res.json();
      expect(() => new Date(body.createdAt)).not.toThrow();
      expect(new Date(body.createdAt).toISOString()).toBe(body.createdAt);
      expect(() => new Date(body.updatedAt)).not.toThrow();
      expect(new Date(body.updatedAt).toISOString()).toBe(body.updatedAt);
    });
  });

  describe("Edge Cases", () => {
    it("unicode displayName stored and returned correctly", async () => {
      const file = await seedFileRow(companyA);
      const unicodeName = "דוח_שנתי_2024_📊";
      const res = await PUT(buildPutRequest(`/api/files/${file.id}`, { displayName: unicodeName }), makeParams(file.id));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.displayName).toBe(unicodeName);
      const dbFile = await prisma.file.findUnique({ where: { id: file.id } });
      expect(dbFile!.displayName).toBe(unicodeName);
    });

    it("whitespace-only displayName is treated as null (trim → empty → null)", async () => {
      const file = await seedFileRow(companyA, { displayName: "Original" });
      const res = await PUT(buildPutRequest(`/api/files/${file.id}`, { displayName: "   " }), makeParams(file.id));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.displayName).toBeNull();
      const dbFile = await prisma.file.findUnique({ where: { id: file.id } });
      expect(dbFile!.displayName).toBeNull();
    });

    it("displayName at exactly 255 chars succeeds and verifies DB", async () => {
      const file = await seedFileRow(companyA);
      const exactName = "a".repeat(255);
      const res = await PUT(buildPutRequest(`/api/files/${file.id}`, { displayName: exactName }), makeParams(file.id));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.displayName).toBe(exactName);
      const dbFile = await prisma.file.findUnique({ where: { id: file.id } });
      expect(dbFile!.displayName).toBe(exactName);
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GET /api/files/[id]/download — File Download
// ═════════════════════════════════════════════════════════════════════════════

describe("GET /api/files/[id]/download — File Download", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function mockFetch(opts: {
    ok?: boolean;
    status?: number;
    body?: string;
    contentType?: string;
    contentLength?: string;
  } = {}) {
    const { ok = true, status = 200, body = "file-content", contentType = "text/plain", contentLength } = opts;
    const headers = new Headers({ "content-type": contentType });
    if (contentLength) headers.set("content-length", contentLength);

    global.fetch = vi.fn().mockResolvedValue({
      ok,
      status,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(body));
          controller.close();
        },
      }),
      headers,
    });
  }

  describe("Auth & Permissions", () => {
    it("returns 401 when unauthenticated", async () => {
      mockUser(null);
      const file = await seedFileRow(companyA);
      const res = await GET(buildGetRequest(`/api/files/${file.id}/download`) as any, makeParams(file.id));
      expect(res.status).toBe(401);
    });

    it("returns 403 when user lacks canViewFiles", async () => {
      mockUser(basicA);
      const file = await seedFileRow(companyA);
      const res = await GET(buildGetRequest(`/api/files/${file.id}/download`) as any, makeParams(file.id));
      expect(res.status).toBe(403);
    });

    it("succeeds for authorized admin user", async () => {
      const file = await seedFileRow(companyA);
      mockFetch();
      const res = await GET(buildGetRequest(`/api/files/${file.id}/download`) as any, makeParams(file.id));
      expect(res.status).toBe(200);
    });

    it("succeeds for basic user with canViewFiles", async () => {
      mockUser(basicWithFiles);
      const file = await seedFileRow(companyA);
      mockFetch();
      const res = await GET(buildGetRequest(`/api/files/${file.id}/download`) as any, makeParams(file.id));
      expect(res.status).toBe(200);
    });
  });

  describe("Validation", () => {
    it("returns 400 for invalid file ID", async () => {
      const res = await GET(buildGetRequest("/api/files/abc/download") as any, makeParams("abc"));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("Invalid file ID");
    });
  });

  describe("File Lookup", () => {
    it("returns 404 when file doesn't exist", async () => {
      const res = await GET(buildGetRequest("/api/files/999999/download") as any, makeParams(999999));
      expect(res.status).toBe(404);
    });

    it("returns 404 when file belongs to another company", async () => {
      const fileB = await seedFileRow(companyB);
      mockUser(adminA);
      const res = await GET(buildGetRequest(`/api/files/${fileB.id}/download`) as any, makeParams(fileB.id));
      expect(res.status).toBe(404);
    });
  });

  describe("SSRF Protection", () => {
    it("returns 500 when file URL is not a safe storage host", async () => {
      const file = await seedFileRow(companyA, { url: "https://evil.com/malware.exe" });
      const res = await GET(buildGetRequest(`/api/files/${file.id}/download`) as any, makeParams(file.id));
      expect(res.status).toBe(500);
      expect((await res.json()).error).toBe("File storage error");
    });
  });

  describe("Download Proxy", () => {
    it("streams file content with correct Content-Type header", async () => {
      const file = await seedFileRow(companyA, { type: "application/pdf" });
      mockFetch({ contentType: "application/pdf" });
      const res = await GET(buildGetRequest(`/api/files/${file.id}/download`) as any, makeParams(file.id));
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("application/pdf");
    });

    it("falls back to application/octet-stream when file type is null", async () => {
      // Seed file with null type directly in DB (bypassing Zod which requires non-empty)
      const file = await prisma.file.create({
        data: {
          companyId: companyA,
          name: `nulltype-${uniq()}.bin`,
          url: `https://utfs.io/f/${uniq()}`,
          key: `key-${uniq()}`,
          size: 100,
          type: "",
        },
      });
      mockFetch();
      const res = await GET(buildGetRequest(`/api/files/${file.id}/download`) as any, makeParams(file.id));
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
    });

    it("sets Content-Disposition with encoded filename", async () => {
      const file = await seedFileRow(companyA, { name: "report 2024.pdf" });
      mockFetch();
      const res = await GET(buildGetRequest(`/api/files/${file.id}/download`) as any, makeParams(file.id));
      const disposition = res.headers.get("Content-Disposition")!;
      expect(disposition).toContain("attachment");
      expect(disposition).toContain(encodeURIComponent("report 2024.pdf"));
    });

    it("uses displayName for download filename when available", async () => {
      const file = await seedFileRow(companyA, { name: "original.pdf", displayName: "Custom Name.pdf" });
      mockFetch();
      const res = await GET(buildGetRequest(`/api/files/${file.id}/download`) as any, makeParams(file.id));
      const disposition = res.headers.get("Content-Disposition")!;
      expect(disposition).toContain(encodeURIComponent("Custom Name.pdf"));
    });

    it("falls back to name when no displayName", async () => {
      const file = await seedFileRow(companyA, { name: "fallback.txt" });
      mockFetch();
      const res = await GET(buildGetRequest(`/api/files/${file.id}/download`) as any, makeParams(file.id));
      const disposition = res.headers.get("Content-Disposition")!;
      expect(disposition).toContain(encodeURIComponent("fallback.txt"));
    });

    it("sets Cache-Control: private, max-age=3600", async () => {
      const file = await seedFileRow(companyA);
      mockFetch();
      const res = await GET(buildGetRequest(`/api/files/${file.id}/download`) as any, makeParams(file.id));
      expect(res.headers.get("Cache-Control")).toBe("private, max-age=3600");
    });

    it("sets X-Content-Type-Options: nosniff", async () => {
      const file = await seedFileRow(companyA);
      mockFetch();
      const res = await GET(buildGetRequest(`/api/files/${file.id}/download`) as any, makeParams(file.id));
      expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    });

    it("returns 413 when upstream content-length exceeds 50MB", async () => {
      const file = await seedFileRow(companyA);
      mockFetch({ contentLength: "60000000" });
      const res = await GET(buildGetRequest(`/api/files/${file.id}/download`) as any, makeParams(file.id));
      expect(res.status).toBe(413);
      expect((await res.json()).error).toBe("File too large");
    });

    it("forwards Content-Length from upstream when under 50MB", async () => {
      const file = await seedFileRow(companyA);
      mockFetch({ contentLength: "12345" });
      const res = await GET(buildGetRequest(`/api/files/${file.id}/download`) as any, makeParams(file.id));
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Length")).toBe("12345");
    });
  });

  describe("Upstream Errors", () => {
    it("returns 502 when upstream fetch fails", async () => {
      const file = await seedFileRow(companyA);
      mockFetch({ ok: false, status: 500 });
      const res = await GET(buildGetRequest(`/api/files/${file.id}/download`) as any, makeParams(file.id));
      expect(res.status).toBe(502);
      expect((await res.json()).error).toBe("Failed to fetch file from storage");
    });

    it("returns 500 when fetch throws a network error", async () => {
      const file = await seedFileRow(companyA);
      global.fetch = vi.fn().mockRejectedValue(new Error("network timeout"));
      const res = await GET(buildGetRequest(`/api/files/${file.id}/download`) as any, makeParams(file.id));
      expect(res.status).toBe(500);
      expect((await res.json()).error).toBe("Internal server error");
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Server Actions — storage.ts
// ═════════════════════════════════════════════════════════════════════════════

describe("Server Actions — storage.ts", () => {
  // ── getStorageData ──────────────────────────────────────────────────────
  describe("getStorageData", () => {
    it("returns folders and files for root (null folderId)", async () => {
      const folder = await seedFolderRow(companyA, { name: "Docs" });
      const file = await seedFileRow(companyA, { folderId: null });

      const result = await getStorageData(null);
      expect(result.folders.some((f: any) => f.id === folder.id)).toBe(true);
      expect(result.files.some((f: any) => f.id === file.id)).toBe(true);
    });

    it("returns files in a specific subfolder", async () => {
      const folder = await seedFolderRow(companyA);
      const fileInFolder = await seedFileRow(companyA, { folderId: folder.id });
      const fileAtRoot = await seedFileRow(companyA, { folderId: null });

      const result = await getStorageData(folder.id);
      expect(result.files.some((f: any) => f.id === fileInFolder.id)).toBe(true);
      expect(result.files.some((f: any) => f.id === fileAtRoot.id)).toBe(false);
    });

    it("returns breadcrumbs for nested folder navigation", async () => {
      const parent = await seedFolderRow(companyA, { name: "Root Folder" });
      const child = await seedFolderRow(companyA, { name: "Sub Folder", parentId: parent.id });

      const result = await getStorageData(child.id);
      expect(result.breadcrumbs).toHaveLength(2);
      expect(result.breadcrumbs[0].id).toBe(parent.id);
      expect(result.breadcrumbs[0].name).toBe("Root Folder");
      expect(result.breadcrumbs[1].id).toBe(child.id);
      expect(result.breadcrumbs[1].name).toBe("Sub Folder");
    });

    it("returns totalUsage (sum of all file sizes)", async () => {
      await seedFileRow(companyA, { size: 100 });
      await seedFileRow(companyA, { size: 200 });

      const result = await getStorageData(null);
      expect(result.totalUsage).toBe(300);
    });

    it("returns folder totalSize via groupBy aggregation", async () => {
      const folder = await seedFolderRow(companyA, { name: "Sized" });
      await seedFileRow(companyA, { folderId: folder.id, size: 500 });
      await seedFileRow(companyA, { folderId: folder.id, size: 300 });

      const result = await getStorageData(null);
      const sizedFolder = result.folders.find((f: any) => f.id === folder.id);
      expect(sizedFolder).toBeDefined();
      expect(sizedFolder!.totalSize).toBe(800);
    });

    it("returns downloadUrl for each file", async () => {
      const file = await seedFileRow(companyA);
      const result = await getStorageData(null);
      const found = result.files.find((f: any) => f.id === file.id);
      expect(found!.downloadUrl).toBe(`/api/files/${file.id}/download`);
    });

    it("includes record relation data", async () => {
      const file = await seedFileRow(companyA, { recordId: recordA.id });
      const result = await getStorageData(null);
      const found = result.files.find((f: any) => f.id === file.id);
      expect(found!.record).toBeDefined();
      expect(found!.record!.id).toBe(recordA.id);
      expect(found!.record!.tableId).toBe(tableA.id);
      expect(found!.record!.tableName).toBe("Projects");
    });

    it("returns record: null for file without a record", async () => {
      const file = await seedFileRow(companyA); // no recordId
      const result = await getStorageData(null);
      const found = result.files.find((f: any) => f.id === file.id);
      expect(found).toBeDefined();
      expect(found!.record).toBeNull();
    });

    it("files are ordered by createdAt desc", async () => {
      const older = await seedFileRow(companyA, { name: "older-file.txt" });
      await new Promise((r) => setTimeout(r, 50));
      const newer = await seedFileRow(companyA, { name: "newer-file.txt" });

      const result = await getStorageData(null);
      const idxOlder = result.files.findIndex((f: any) => f.id === older.id);
      const idxNewer = result.files.findIndex((f: any) => f.id === newer.id);
      expect(idxNewer).toBeLessThan(idxOlder);
    });

    it("serializes dates as ISO 8601", async () => {
      await seedFileRow(companyA);
      const result = await getStorageData(null);
      for (const f of result.files) {
        expect(() => new Date(f.createdAt)).not.toThrow();
        expect(new Date(f.createdAt).toISOString()).toBe(f.createdAt);
      }
    });

    it("throws on invalid folderId", async () => {
      await expect(getStorageData(-1)).rejects.toThrow("Invalid folder ID");
    });

    it("returns empty arrays when no files or folders exist", async () => {
      const result = await getStorageData(null);
      expect(result.folders).toEqual([]);
      expect(result.files).toEqual([]);
      expect(result.totalUsage).toBe(0);
      expect(result.breadcrumbs).toEqual([]);
    });

    it("folders include _count.files", async () => {
      const folder = await seedFolderRow(companyA, { name: "Counted" });
      await seedFileRow(companyA, { folderId: folder.id });
      await seedFileRow(companyA, { folderId: folder.id });
      await seedFileRow(companyA, { folderId: folder.id });

      const result = await getStorageData(null);
      const found = result.folders.find((f: any) => f.id === folder.id);
      expect(found).toBeDefined();
      expect(found!._count.files).toBe(3);
    });

    it("file response does not include key or companyId", async () => {
      const file = await seedFileRow(companyA, { name: "shape-leak-test.txt" });
      const result = await getStorageData(null);
      const found = result.files.find((f: any) => f.id === file.id);
      expect(found).toBeDefined();
      expect((found as any).key).toBeUndefined();
      expect((found as any).companyId).toBeUndefined();
    });

    it("file response includes all expected fields (positive shape test)", async () => {
      const folder = await seedFolderRow(companyA, { name: "ShapeFolder" });
      const file = await seedFileRow(companyA, {
        name: "shape-full.txt",
        displayName: "Shape Full",
        folderId: folder.id,
        recordId: recordA.id,
        size: 4096,
        type: "text/plain",
      });
      const result = await getStorageData(folder.id);
      const found = result.files.find((f: any) => f.id === file.id);
      expect(found).toBeDefined();
      // Strict toEqual — catches any extra field leak (key, companyId, etc.)
      expect(found).toEqual({
        id: file.id,
        name: "shape-full.txt",
        displayName: "Shape Full",
        url: expect.any(String),
        size: 4096,
        type: "text/plain",
        folderId: folder.id,
        recordId: recordA.id,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        downloadUrl: `/api/files/${file.id}/download`,
        record: {
          id: recordA.id,
          tableId: tableA.id,
          tableName: "Projects",
          recordNumber: recordA.id,
        },
      });
    });

    it("folder response includes all expected fields (positive shape test)", async () => {
      const parent = await seedFolderRow(companyA, { name: "ShapeParent" });
      await seedFileRow(companyA, { folderId: parent.id, size: 750 });
      await seedFileRow(companyA, { folderId: parent.id, size: 250 });

      const result = await getStorageData(null);
      const found = result.folders.find((f: any) => f.id === parent.id);
      expect(found).toBeDefined();
      // Strict toEqual — catches any extra field leak (companyId, etc.)
      expect(found).toEqual({
        id: parent.id,
        name: "ShapeParent",
        parentId: null,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        _count: { files: 2 },
        totalSize: 1000,
      });
    });

    it("folders are ordered by name ascending", async () => {
      await seedFolderRow(companyA, { name: "Zebra" });
      await seedFolderRow(companyA, { name: "Alpha" });
      await seedFolderRow(companyA, { name: "Middle" });

      const result = await getStorageData(null);
      const names = result.folders.map((f: any) => f.name);
      expect(names).toEqual(["Alpha", "Middle", "Zebra"]);
    });

    it("returns empty results for non-existent valid folderId (no throw)", async () => {
      const result = await getStorageData(999999);
      expect(result.folders).toEqual([]);
      expect(result.files).toEqual([]);
      expect(result.breadcrumbs).toEqual([]);
      expect(typeof result.totalUsage).toBe("number");
    });
  });

  // ── getAllFiles ──────────────────────────────────────────────────────────
  describe("getAllFiles", () => {
    it("returns all files for the company", async () => {
      const f1 = await seedFileRow(companyA);
      const f2 = await seedFileRow(companyA);

      const files = await getAllFiles();
      const ids = files.map((f: any) => f.id);
      expect(ids).toContain(f1.id);
      expect(ids).toContain(f2.id);
    });

    it("returns download URLs", async () => {
      const f1 = await seedFileRow(companyA);
      const files = await getAllFiles();
      const found = files.find((f: any) => f.id === f1.id);
      expect(found!.url).toBe(`/api/files/${f1.id}/download`);
    });

    it("ordered by createdAt desc", async () => {
      const older = await seedFileRow(companyA);
      // Small delay to ensure different timestamps
      await new Promise((r) => setTimeout(r, 50));
      const newer = await seedFileRow(companyA);

      const files = await getAllFiles();
      const idxOlder = files.findIndex((f: any) => f.id === older.id);
      const idxNewer = files.findIndex((f: any) => f.id === newer.id);
      expect(idxNewer).toBeLessThan(idxOlder);
    });

    it("respects company isolation", async () => {
      await seedFileRow(companyA);
      const fileB = await seedFileRow(companyB);

      mockUser(adminA);
      const filesA = await getAllFiles();
      expect(filesA.some((f: any) => f.id === fileB.id)).toBe(false);
    });

    it("returns empty array when no files exist", async () => {
      const files = await getAllFiles();
      expect(files).toEqual([]);
    });

    it("response shape contains only id, name, type, url", async () => {
      await seedFileRow(companyA, { name: "shape.txt", type: "text/plain" });
      const files = await getAllFiles();
      const file = files.find((f: any) => f.name === "shape.txt");
      expect(file).toBeDefined();
      // Strict toEqual — catches any extra field leak (size, key, companyId, etc.)
      expect(file).toEqual({
        id: expect.any(Number),
        name: "shape.txt",
        type: "text/plain",
        url: expect.stringContaining("/api/files/"),
      });
    });
  });

  // ── saveFileMetadata ────────────────────────────────────────────────────
  describe("saveFileMetadata", () => {
    const validFile = () => ({
      name: `upload-${uniq()}.pdf`,
      url: `https://utfs.io/f/${uniq()}`,
      key: `key-${uniq()}`,
      size: 2048,
      type: "application/pdf",
    });

    it("creates a new file and verifies DB state", async () => {
      const fd = validFile();
      const result = await saveFileMetadata(fd, null);
      expect(result.id).toBeDefined();
      expect(result.downloadUrl).toBe(`/api/files/${result.id}/download`);

      const dbFile = await prisma.file.findUnique({ where: { id: result.id } });
      expect(dbFile).not.toBeNull();
      expect(dbFile!.name).toBe(fd.name);
      expect(dbFile!.companyId).toBe(companyA);
    });

    it("links file to folder when folderId provided", async () => {
      const folder = await seedFolderRow(companyA);
      const fd = validFile();
      const result = await saveFileMetadata(fd, folder.id);
      const dbFile = await prisma.file.findUnique({ where: { id: result.id } });
      expect(dbFile!.folderId).toBe(folder.id);
    });

    it("links file to record when recordId provided", async () => {
      const fd = validFile();
      const result = await saveFileMetadata(fd, null, recordA.id);
      const dbFile = await prisma.file.findUnique({ where: { id: result.id } });
      expect(dbFile!.recordId).toBe(recordA.id);
    });

    it("links file to both folder and record simultaneously", async () => {
      const folder = await seedFolderRow(companyA);
      const fd = validFile();
      const result = await saveFileMetadata(fd, folder.id, recordA.id);
      const dbFile = await prisma.file.findUnique({ where: { id: result.id } });
      expect(dbFile!.folderId).toBe(folder.id);
      expect(dbFile!.recordId).toBe(recordA.id);
    });

    it("returns duplicate flag when key already exists for company", async () => {
      const fd = validFile();
      const first = await saveFileMetadata(fd, null);
      const second = await saveFileMetadata(fd, null);
      expect(second.duplicate).toBe(true);
      expect(second.id).toBe(first.id);
    });

    it("duplicate response contains only id, downloadUrl, duplicate (no sensitive fields)", async () => {
      const fd = validFile();
      await saveFileMetadata(fd, null);
      const dup = await saveFileMetadata(fd, null);
      // The duplicate response must have EXACTLY these 3 fields
      expect(dup).toEqual({
        id: expect.any(Number),
        downloadUrl: expect.any(String),
        duplicate: true,
      });
      // Explicitly verify sensitive/extra fields are absent
      expect((dup as any).url).toBeUndefined();
      expect((dup as any).key).toBeUndefined();
      expect((dup as any).companyId).toBeUndefined();
      expect((dup as any).name).toBeUndefined();
      expect((dup as any).size).toBeUndefined();
    });

    it("duplicate key does not create an extra file row in DB", async () => {
      const fd = validFile();
      await saveFileMetadata(fd, null);
      const dup = await saveFileMetadata(fd, null);
      expect(dup.duplicate).toBe(true);
      const count = await prisma.file.count({ where: { key: fd.key, companyId: companyA } });
      expect(count).toBe(1);
    });

    it("calls revalidatePath after successful create", async () => {
      const fd = validFile();
      await saveFileMetadata(fd, null);
      expect(mockRevalidatePath).toHaveBeenCalledWith("/files");
    });

    it("throws on invalid folder (doesn't belong to company) and does not create file", async () => {
      const folderB = await seedFolderRow(companyB);
      const fd = validFile();
      const beforeCount = await prisma.file.count({ where: { companyId: companyA } });
      mockUser(adminA);
      await expect(saveFileMetadata(fd, folderB.id)).rejects.toThrow("Invalid folder");
      const afterCount = await prisma.file.count({ where: { companyId: companyA } });
      expect(afterCount).toBe(beforeCount);
    });

    it("throws on invalid record (doesn't belong to company) and does not create file", async () => {
      const fd = validFile();
      const beforeCount = await prisma.file.count({ where: { companyId: companyA } });
      mockUser(adminA);
      await expect(saveFileMetadata(fd, null, recordB.id)).rejects.toThrow("Invalid record");
      const afterCount = await prisma.file.count({ where: { companyId: companyA } });
      expect(afterCount).toBe(beforeCount);
    });

    it("validates Zod: empty name rejects (.min(1))", async () => {
      await expect(
        saveFileMetadata({ ...validFile(), name: "" }, null),
      ).rejects.toThrow("Invalid file data");
    });

    it("validates Zod: invalid url rejects (.url())", async () => {
      await expect(
        saveFileMetadata({ ...validFile(), url: "not-a-url" }, null),
      ).rejects.toThrow("Invalid file data");
    });

    it("validates Zod: size exceeding 100MB rejects", async () => {
      await expect(
        saveFileMetadata({ ...validFile(), size: 100_000_001 }, null),
      ).rejects.toThrow("Invalid file data");
    });

    it("validates Zod: url exceeding 2048 chars rejects", async () => {
      await expect(
        saveFileMetadata({ ...validFile(), url: "https://utfs.io/f/" + "x".repeat(2048) }, null),
      ).rejects.toThrow("Invalid file data");
    });

    it("validates Zod: key exceeding 1000 chars rejects", async () => {
      await expect(
        saveFileMetadata({ ...validFile(), key: "k".repeat(1001) }, null),
      ).rejects.toThrow("Invalid file data");
    });

    it("validates Zod: type exceeding 255 chars rejects", async () => {
      await expect(
        saveFileMetadata({ ...validFile(), type: "t".repeat(256) }, null),
      ).rejects.toThrow("Invalid file data");
    });

    it("validates Zod: empty type rejects (.min(1))", async () => {
      await expect(
        saveFileMetadata({ ...validFile(), type: "" }, null),
      ).rejects.toThrow("Invalid file data");
    });

    it("validates Zod: negative size rejects (.nonnegative())", async () => {
      await expect(
        saveFileMetadata({ ...validFile(), size: -1 }, null),
      ).rejects.toThrow("Invalid file data");
    });

    it("accepts zero-size file (boundary for .nonnegative())", async () => {
      const fd = { ...validFile(), size: 0 };
      const result = await saveFileMetadata(fd, null);
      expect(result.id).toBeDefined();
      const dbFile = await prisma.file.findUnique({ where: { id: result.id } });
      expect(dbFile!.size).toBe(0);
    });

    it("validates Zod: empty key rejects (.min(1))", async () => {
      await expect(
        saveFileMetadata({ ...validFile(), key: "" }, null),
      ).rejects.toThrow("Invalid file data");
    });

    it("rejects negative folderId via folderIdSchema", async () => {
      const fd = validFile();
      await expect(saveFileMetadata(fd, -5)).rejects.toThrow("Invalid folder ID");
    });

    it("rejects negative recordId via positiveIntSchema", async () => {
      const fd = validFile();
      await expect(saveFileMetadata(fd, null, -1)).rejects.toThrow("Invalid record ID");
    });

    it("response shape does not leak url, key, or companyId", async () => {
      const fd = { ...validFile(), displayName: "Shape Test", source: "manual" };
      const result = await saveFileMetadata(fd, null);
      // Strict toEqual — catches any extra field leak (url, key, companyId, etc.)
      expect(result).toEqual({
        id: expect.any(Number),
        name: fd.name,
        size: fd.size,
        type: fd.type,
        displayName: "Shape Test",
        source: "manual",
        folderId: null,
        recordId: null,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
        downloadUrl: expect.stringMatching(/^\/api\/files\/\d+\/download$/),
      });
    });

    it("calls revalidatePath even on duplicate key", async () => {
      const fd = validFile();
      await saveFileMetadata(fd, null);
      mockRevalidatePath.mockClear();
      // Second call with same key → duplicate
      const dup = await saveFileMetadata(fd, null);
      expect(dup.duplicate).toBe(true);
      expect(mockRevalidatePath).toHaveBeenCalledWith("/files");
    });

    it("returned object has createdAt/updatedAt populated (@default values)", async () => {
      const fd = validFile();
      const result = await saveFileMetadata(fd, null);
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
      // Verify they are valid dates
      expect(new Date(result.createdAt).getTime()).toBeGreaterThan(0);
      expect(new Date(result.updatedAt).getTime()).toBeGreaterThan(0);
    });

    it("stores displayName and source correctly", async () => {
      const fd = { ...validFile(), displayName: "Friendly Name", source: "quote-logo" };
      const result = await saveFileMetadata(fd, null);
      const dbFile = await prisma.file.findUnique({ where: { id: result.id } });
      expect(dbFile!.displayName).toBe("Friendly Name");
      expect(dbFile!.source).toBe("quote-logo");
    });

    it("whitespace-only displayName is stored as null", async () => {
      const fd = { ...validFile(), displayName: "   " };
      const result = await saveFileMetadata(fd, null);
      const dbFile = await prisma.file.findUnique({ where: { id: result.id } });
      expect(dbFile!.displayName).toBeNull();
    });
  });

  // ── moveFileToFolder ────────────────────────────────────────────────────
  describe("moveFileToFolder", () => {
    it("moves file to target folder and verifies DB", async () => {
      const folder = await seedFolderRow(companyA);
      const file = await seedFileRow(companyA);

      await moveFileToFolder(file.id, folder.id);
      const dbFile = await prisma.file.findUnique({ where: { id: file.id } });
      expect(dbFile!.folderId).toBe(folder.id);
    });

    it("moves file to root (null folderId)", async () => {
      const folder = await seedFolderRow(companyA);
      const file = await seedFileRow(companyA, { folderId: folder.id });

      await moveFileToFolder(file.id, null);
      const dbFile = await prisma.file.findUnique({ where: { id: file.id } });
      expect(dbFile!.folderId).toBeNull();
    });

    it("calls revalidatePath after move", async () => {
      const folder = await seedFolderRow(companyA);
      const file = await seedFileRow(companyA);
      await moveFileToFolder(file.id, folder.id);
      expect(mockRevalidatePath).toHaveBeenCalledWith("/files");
    });

    it("throws when file not found / wrong company", async () => {
      const fileB = await seedFileRow(companyB);
      mockUser(adminA);
      await expect(moveFileToFolder(fileB.id, null)).rejects.toThrow("File not found");
    });

    it("throws when target folder not found / wrong company and does not mutate DB", async () => {
      const folderA = await seedFolderRow(companyA);
      const file = await seedFileRow(companyA, { folderId: folderA.id });
      const folderB = await seedFolderRow(companyB);
      mockUser(adminA);
      await expect(moveFileToFolder(file.id, folderB.id)).rejects.toThrow("Folder not found");
      const dbFile = await prisma.file.findUnique({ where: { id: file.id } });
      expect(dbFile!.folderId).toBe(folderA.id);
    });

    it("validates input (negative IDs)", async () => {
      await expect(moveFileToFolder(-1, null)).rejects.toThrow("Invalid file ID");
    });

    it("validates input (non-integer)", async () => {
      await expect(moveFileToFolder(1.5, null)).rejects.toThrow("Invalid file ID");
    });

    it("validates negative folderId rejects", async () => {
      const file = await seedFileRow(companyA);
      await expect(moveFileToFolder(file.id, -5 as any)).rejects.toThrow("Invalid folder ID");
    });
  });

  // ── createFolder ────────────────────────────────────────────────────────
  describe("createFolder", () => {
    it("creates root folder and verifies DB", async () => {
      await createFolder("New Root", null);
      const folder = await prisma.folder.findFirst({
        where: { companyId: companyA, name: "New Root" },
      });
      expect(folder).not.toBeNull();
      expect(folder!.parentId).toBeNull();
    });

    it("creates nested folder with parentId", async () => {
      const parent = await seedFolderRow(companyA, { name: "Parent" });
      await createFolder("Child", parent.id);
      const child = await prisma.folder.findFirst({
        where: { companyId: companyA, name: "Child" },
      });
      expect(child).not.toBeNull();
      expect(child!.parentId).toBe(parent.id);
    });

    it("calls revalidatePath after create", async () => {
      await createFolder("Revalidated", null);
      expect(mockRevalidatePath).toHaveBeenCalledWith("/files");
    });

    it("throws when max depth (10) exceeded", async () => {
      // Build a chain of 10 nested folders
      let currentId: number | null = null;
      for (let i = 0; i < 10; i++) {
        const f = await seedFolderRow(companyA, { name: `Depth${i}`, parentId: currentId });
        currentId = f.id;
      }
      // Trying to create depth 11 should fail
      await expect(createFolder("TooDeep", currentId)).rejects.toThrow("Maximum folder depth reached");
    });

    it("throws when parent folder not found / wrong company and does not create folder", async () => {
      const folderB = await seedFolderRow(companyB);
      const beforeCount = await prisma.folder.count({ where: { companyId: companyA } });
      mockUser(adminA);
      await expect(createFolder("Orphan", folderB.id)).rejects.toThrow("Parent folder not found");
      const afterCount = await prisma.folder.count({ where: { companyId: companyA } });
      expect(afterCount).toBe(beforeCount);
    });

    it("trims whitespace from folder name (nameSchema .trim())", async () => {
      await createFolder("  Spaced Folder  ", null);
      const folder = await prisma.folder.findFirst({
        where: { companyId: companyA, name: "Spaced Folder" },
      });
      expect(folder).not.toBeNull();
      expect(folder!.name).toBe("Spaced Folder");
    });

    it("validates folder name (empty)", async () => {
      await expect(createFolder("", null)).rejects.toThrow("Invalid folder name");
    });

    it("validates folder name (too long)", async () => {
      await expect(createFolder("x".repeat(256), null)).rejects.toThrow("Invalid folder name");
    });

    it("rejects negative parentId via folderIdSchema", async () => {
      await expect(createFolder("Test", -3)).rejects.toThrow("Invalid parent folder ID");
    });
  });

  // ── renameFolder ────────────────────────────────────────────────────────
  describe("renameFolder", () => {
    it("renames folder and verifies DB", async () => {
      const folder = await seedFolderRow(companyA, { name: "OldName" });
      await renameFolder(folder.id, "NewName");
      const dbFolder = await prisma.folder.findUnique({ where: { id: folder.id } });
      expect(dbFolder!.name).toBe("NewName");
    });

    it("trims whitespace from folder name", async () => {
      const folder = await seedFolderRow(companyA, { name: "Original" });
      await renameFolder(folder.id, "  Trimmed  ");
      const dbFolder = await prisma.folder.findUnique({ where: { id: folder.id } });
      expect(dbFolder!.name).toBe("Trimmed");
    });

    it("calls revalidatePath after rename", async () => {
      const folder = await seedFolderRow(companyA, { name: "ToRename" });
      await renameFolder(folder.id, "Renamed");
      expect(mockRevalidatePath).toHaveBeenCalledWith("/files");
    });

    it("throws when folder not found / wrong company and does not mutate DB", async () => {
      const folderB = await seedFolderRow(companyB, { name: "OriginalName" });
      mockUser(adminA);
      await expect(renameFolder(folderB.id, "Nope")).rejects.toThrow("Folder not found");
      const dbFolder = await prisma.folder.findUnique({ where: { id: folderB.id } });
      expect(dbFolder!.name).toBe("OriginalName");
    });

    it("validates name (empty)", async () => {
      await expect(renameFolder(1, "")).rejects.toThrow("Invalid folder name");
    });

    it("validates name (too long)", async () => {
      await expect(renameFolder(1, "x".repeat(256))).rejects.toThrow("Invalid folder name");
    });

    it("throws on invalid folder ID (negative)", async () => {
      await expect(renameFolder(-1, "Valid")).rejects.toThrow("Invalid folder ID");
    });
  });

  // ── updateFile ──────────────────────────────────────────────────────────
  describe("updateFile", () => {
    it("updates displayName via server action", async () => {
      const file = await seedFileRow(companyA);
      await updateFile(file.id, { displayName: "Action Updated" });
      const dbFile = await prisma.file.findUnique({ where: { id: file.id } });
      expect(dbFile!.displayName).toBe("Action Updated");
    });

    it("clears displayName (null)", async () => {
      const file = await seedFileRow(companyA, { displayName: "Clear Me" });
      await updateFile(file.id, { displayName: null });
      const dbFile = await prisma.file.findUnique({ where: { id: file.id } });
      expect(dbFile!.displayName).toBeNull();
    });

    it("calls revalidatePath after update", async () => {
      const file = await seedFileRow(companyA);
      await updateFile(file.id, { displayName: "Revalidated" });
      expect(mockRevalidatePath).toHaveBeenCalledWith("/files");
    });

    it("updatedAt changes after updateFile", async () => {
      const file = await seedFileRow(companyA);
      const beforeUpdatedAt = file.updatedAt;
      await new Promise((r) => setTimeout(r, 50));
      await updateFile(file.id, { displayName: "Later Update" });
      const dbFile = await prisma.file.findUnique({ where: { id: file.id } });
      expect(dbFile!.updatedAt.getTime()).toBeGreaterThan(beforeUpdatedAt.getTime());
    });

    it("throws when file not found / wrong company", async () => {
      const fileB = await seedFileRow(companyB);
      mockUser(adminA);
      await expect(updateFile(fileB.id, { displayName: "nope" })).rejects.toThrow("File not found");
    });

    it("validates displayName length", async () => {
      const file = await seedFileRow(companyA);
      await expect(updateFile(file.id, { displayName: "x".repeat(256) })).rejects.toThrow("Invalid display name");
    });

    it("throws on invalid file ID (negative)", async () => {
      await expect(updateFile(-1, { displayName: "x" })).rejects.toThrow("Invalid file ID");
    });

    it("whitespace-only displayName is treated as null (trim behavior)", async () => {
      const file = await seedFileRow(companyA, { displayName: "Original" });
      await updateFile(file.id, { displayName: "   " });
      const dbFile = await prisma.file.findUnique({ where: { id: file.id } });
      expect(dbFile!.displayName).toBeNull();
    });
  });

  // ── deleteFolder ────────────────────────────────────────────────────────
  describe("deleteFolder", () => {
    it("deletes folder and all its files atomically", async () => {
      const folder = await seedFolderRow(companyA);
      const file1 = await seedFileRow(companyA, { folderId: folder.id });
      const file2 = await seedFileRow(companyA, { folderId: folder.id });

      await deleteFolder(folder.id);

      const dbFolder = await prisma.folder.findUnique({ where: { id: folder.id } });
      expect(dbFolder).toBeNull();

      const dbFile1 = await prisma.file.findUnique({ where: { id: file1.id } });
      const dbFile2 = await prisma.file.findUnique({ where: { id: file2.id } });
      expect(dbFile1).toBeNull();
      expect(dbFile2).toBeNull();
    });

    it("throws when folder has subfolders", async () => {
      const parent = await seedFolderRow(companyA);
      await seedFolderRow(companyA, { parentId: parent.id });

      await expect(deleteFolder(parent.id)).rejects.toThrow("Folder must be empty of subfolders to delete.");
    });

    it("throws when folder not found / wrong company", async () => {
      const folderB = await seedFolderRow(companyB);
      mockUser(adminA);
      // Prisma delete with wrong companyId throws P2025 "Record to delete does not exist"
      await expect(deleteFolder(folderB.id)).rejects.toThrow();
      // Verify folder still exists in company B
      const dbFolder = await prisma.folder.findUnique({ where: { id: folderB.id } });
      expect(dbFolder).not.toBeNull();
    });

    it("deletes empty folder (no files) without calling UTApi", async () => {
      const folder = await seedFolderRow(companyA, { name: "Empty Folder" });

      await deleteFolder(folder.id);

      const dbFolder = await prisma.folder.findUnique({ where: { id: folder.id } });
      expect(dbFolder).toBeNull();
      // UTApi should NOT be called when there are no file keys
      expect(mockDeleteFiles).not.toHaveBeenCalled();
    });

    it("calls UTApi.deleteFiles with correct keys", async () => {
      const folder = await seedFolderRow(companyA);
      await seedFileRow(companyA, { folderId: folder.id, key: "ut-folder-key-1" });
      await seedFileRow(companyA, { folderId: folder.id, key: "ut-folder-key-2" });

      await deleteFolder(folder.id);

      expect(mockDeleteFiles).toHaveBeenCalledTimes(1);
      const calledWith = mockDeleteFiles.mock.calls[0][0] as string[];
      expect(calledWith).toContain("ut-folder-key-1");
      expect(calledWith).toContain("ut-folder-key-2");
    });

    it("calls revalidatePath after delete", async () => {
      const folder = await seedFolderRow(companyA);
      await deleteFolder(folder.id);
      expect(mockRevalidatePath).toHaveBeenCalledWith("/files");
    });

    it("throws on invalid folder ID (negative)", async () => {
      await expect(deleteFolder(-1)).rejects.toThrow("Invalid folder ID");
    });

    it("throws on invalid folder ID (non-integer)", async () => {
      await expect(deleteFolder(1.5)).rejects.toThrow("Invalid folder ID");
    });

    it("still succeeds when UTApi.deleteFiles throws (error resilience)", async () => {
      const folder = await seedFolderRow(companyA);
      await seedFileRow(companyA, { folderId: folder.id, key: "ut-fail-key" });

      mockDeleteFiles.mockRejectedValueOnce(new Error("UT unavailable"));

      // Action should still complete — DB records deleted, UT failure is best-effort
      await deleteFolder(folder.id);

      const dbFolder = await prisma.folder.findUnique({ where: { id: folder.id } });
      expect(dbFolder).toBeNull();
      expect(mockDeleteFiles).toHaveBeenCalledTimes(1);
    });
  });

  // ── deleteFile ──────────────────────────────────────────────────────────
  describe("deleteFile", () => {
    it("deletes file and verifies DB", async () => {
      const file = await seedFileRow(companyA);
      await deleteFile(file.id);
      const dbFile = await prisma.file.findUnique({ where: { id: file.id } });
      expect(dbFile).toBeNull();
    });

    it("no-ops gracefully when file doesn't exist", async () => {
      // Should not throw
      await expect(deleteFile(999999)).resolves.not.toThrow();
    });

    it("calls UTApi.deleteFiles with the correct key", async () => {
      const file = await seedFileRow(companyA, { key: "ut-delete-key-abc" });
      await deleteFile(file.id);
      const dbFile = await prisma.file.findUnique({ where: { id: file.id } });
      expect(dbFile).toBeNull();
      expect(mockDeleteFiles).toHaveBeenCalledWith("ut-delete-key-abc");
    });

    it("calls revalidatePath after delete", async () => {
      const file = await seedFileRow(companyA);
      await deleteFile(file.id);
      expect(mockRevalidatePath).toHaveBeenCalledWith("/files");
    });

    it("calls revalidatePath even when file not found (no-op path)", async () => {
      await deleteFile(999999);
      expect(mockRevalidatePath).toHaveBeenCalledWith("/files");
    });

    it("respects company isolation", async () => {
      const fileB = await seedFileRow(companyB);
      mockUser(adminA);
      await deleteFile(fileB.id); // should no-op (file not found for company A)
      const dbFile = await prisma.file.findUnique({ where: { id: fileB.id } });
      expect(dbFile).not.toBeNull(); // still exists
    });

    it("throws on invalid file ID (negative)", async () => {
      await expect(deleteFile(-1)).rejects.toThrow("Invalid file ID");
    });

    it("throws on invalid file ID (non-integer)", async () => {
      await expect(deleteFile(1.5)).rejects.toThrow("Invalid file ID");
    });

    it("still succeeds when UTApi.deleteFiles throws (error resilience)", async () => {
      const file = await seedFileRow(companyA, { key: "ut-fail-key-file" });

      mockDeleteFiles.mockRejectedValueOnce(new Error("UT unavailable"));

      // Action should still complete — DB record deleted, UT failure is best-effort
      await deleteFile(file.id);

      const dbFile = await prisma.file.findUnique({ where: { id: file.id } });
      expect(dbFile).toBeNull();
      expect(mockDeleteFiles).toHaveBeenCalledWith("ut-fail-key-file");
    });
  });

  // ── Auth for all server actions ──────────────────────────────────────────
  describe("Server action auth (requireFilesUser)", () => {
    it("getStorageData throws Unauthorized when not logged in", async () => {
      mockUser(null);
      await expect(getStorageData(null)).rejects.toThrow("Unauthorized");
    });

    it("getStorageData throws Forbidden when user lacks canViewFiles", async () => {
      mockUser(basicA);
      await expect(getStorageData(null)).rejects.toThrow("Forbidden");
    });

    it("getAllFiles throws Unauthorized when not logged in", async () => {
      mockUser(null);
      await expect(getAllFiles()).rejects.toThrow("Unauthorized");
    });

    it("getAllFiles throws Forbidden when user lacks canViewFiles", async () => {
      mockUser(basicA);
      await expect(getAllFiles()).rejects.toThrow("Forbidden");
    });

    it("saveFileMetadata throws Unauthorized when not logged in", async () => {
      mockUser(null);
      const fd = { name: "x", url: "https://utfs.io/f/x", key: "k", size: 0, type: "t" };
      await expect(saveFileMetadata(fd, null)).rejects.toThrow("Unauthorized");
    });

    it("saveFileMetadata throws Forbidden when user lacks canViewFiles", async () => {
      mockUser(basicA);
      const fd = { name: "x", url: "https://utfs.io/f/x", key: "k", size: 0, type: "t" };
      await expect(saveFileMetadata(fd, null)).rejects.toThrow("Forbidden");
    });

    it("deleteFile throws Unauthorized when not logged in", async () => {
      mockUser(null);
      await expect(deleteFile(1)).rejects.toThrow("Unauthorized");
    });

    it("deleteFile throws Forbidden when user lacks canViewFiles", async () => {
      mockUser(basicA);
      await expect(deleteFile(1)).rejects.toThrow("Forbidden");
    });

    it("moveFileToFolder throws Unauthorized when not logged in", async () => {
      mockUser(null);
      await expect(moveFileToFolder(1, null)).rejects.toThrow("Unauthorized");
    });

    it("moveFileToFolder throws Forbidden when user lacks canViewFiles", async () => {
      mockUser(basicA);
      await expect(moveFileToFolder(1, null)).rejects.toThrow("Forbidden");
    });

    it("createFolder throws Unauthorized when not logged in", async () => {
      mockUser(null);
      await expect(createFolder("Test", null)).rejects.toThrow("Unauthorized");
    });

    it("createFolder throws Forbidden when user lacks canViewFiles", async () => {
      mockUser(basicA);
      await expect(createFolder("Test", null)).rejects.toThrow("Forbidden");
    });

    it("renameFolder throws Unauthorized when not logged in", async () => {
      mockUser(null);
      await expect(renameFolder(1, "New")).rejects.toThrow("Unauthorized");
    });

    it("renameFolder throws Forbidden when user lacks canViewFiles", async () => {
      mockUser(basicA);
      await expect(renameFolder(1, "New")).rejects.toThrow("Forbidden");
    });

    it("updateFile throws Unauthorized when not logged in", async () => {
      mockUser(null);
      await expect(updateFile(1, { displayName: "x" })).rejects.toThrow("Unauthorized");
    });

    it("updateFile throws Forbidden when user lacks canViewFiles", async () => {
      mockUser(basicA);
      await expect(updateFile(1, { displayName: "x" })).rejects.toThrow("Forbidden");
    });

    it("deleteFolder throws Unauthorized when not logged in", async () => {
      mockUser(null);
      await expect(deleteFolder(1)).rejects.toThrow("Unauthorized");
    });

    it("deleteFolder throws Forbidden when user lacks canViewFiles", async () => {
      mockUser(basicA);
      await expect(deleteFolder(1)).rejects.toThrow("Forbidden");
    });

    it("basic user with canViewFiles can use server actions", async () => {
      mockUser(basicWithFiles);
      await seedFileRow(companyA);
      const files = await getAllFiles();
      expect(files.length).toBeGreaterThan(0);
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Multi-Tenant Isolation
// ═════════════════════════════════════════════════════════════════════════════

describe("Multi-Tenant Isolation", () => {
  it("company B cannot see company A's files via getStorageData", async () => {
    await seedFileRow(companyA, { name: "secret-a.pdf" });
    mockUser(adminB);
    const result = await getStorageData(null);
    expect(result.files.some((f: any) => f.name === "secret-a.pdf")).toBe(false);
  });

  it("company B cannot see company A's files via getAllFiles", async () => {
    const fileA = await seedFileRow(companyA);
    mockUser(adminB);
    const files = await getAllFiles();
    expect(files.some((f: any) => f.id === fileA.id)).toBe(false);
  });

  it("company B cannot move company A's file", async () => {
    const folder = await seedFolderRow(companyA, { name: "IsolationFolder" });
    const fileA = await seedFileRow(companyA, { folderId: folder.id });
    mockUser(adminB);
    await expect(moveFileToFolder(fileA.id, null)).rejects.toThrow("File not found");
    const dbFile = await prisma.file.findUnique({ where: { id: fileA.id } });
    expect(dbFile!.folderId).toBe(folder.id);
  });

  it("company B cannot delete company A's file", async () => {
    const fileA = await seedFileRow(companyA);
    mockUser(adminB);
    await deleteFile(fileA.id);
    // File should still exist (no-op)
    const dbFile = await prisma.file.findUnique({ where: { id: fileA.id } });
    expect(dbFile).not.toBeNull();
  });

  it("company B cannot update company A's file", async () => {
    const fileA = await seedFileRow(companyA, { displayName: null });
    mockUser(adminB);
    await expect(updateFile(fileA.id, { displayName: "hacked" })).rejects.toThrow("File not found");
    const dbFile = await prisma.file.findUnique({ where: { id: fileA.id } });
    expect(dbFile!.displayName).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Prisma Constraints & Edge Cases
// ═════════════════════════════════════════════════════════════════════════════

describe("Prisma Constraints & Edge Cases", () => {
  it("record deletion sets file.recordId to null (onDelete: SetNull)", async () => {
    // Create a dedicated record for this test
    const tempRecord = await prisma.record.create({
      data: { companyId: companyA, tableId: tableA.id, data: {} },
    });
    const file = await seedFileRow(companyA, { recordId: tempRecord.id });
    expect(file.recordId).toBe(tempRecord.id);

    await prisma.record.delete({ where: { id: tempRecord.id } });
    const dbFile = await prisma.file.findUnique({ where: { id: file.id } });
    expect(dbFile!.recordId).toBeNull();
  });

  it("company deletion cascades to files and folders (onDelete: Cascade)", async () => {
    // Create an isolated company for this test — no Users to avoid FK back-references
    const cascadeCo = await prisma.company.create({
      data: { name: "Cascade Test Co", slug: `cascade-test-${suffix}` },
    });

    // Seed files and folders directly (no user needed for direct Prisma inserts)
    const folder = await seedFolderRow(cascadeCo.id, { name: "Cascade Folder" });
    const file1 = await seedFileRow(cascadeCo.id, { folderId: folder.id });
    const file2 = await seedFileRow(cascadeCo.id);

    // Delete ONLY the company — cascade should remove files and folders automatically
    await prisma.company.delete({ where: { id: cascadeCo.id } });

    // Verify everything is gone via cascade (NOT manual cleanup)
    expect(await prisma.folder.findUnique({ where: { id: folder.id } })).toBeNull();
    expect(await prisma.file.findUnique({ where: { id: file1.id } })).toBeNull();
    expect(await prisma.file.findUnique({ where: { id: file2.id } })).toBeNull();
  });

  it("missing companyId throws on file create", async () => {
    await expect(
      prisma.file.create({ data: { name: "x", url: "x", key: "x", size: 0, type: "x" } as any }),
    ).rejects.toThrow();
  });

  it("optional fields handle null correctly", async () => {
    const file = await prisma.file.create({
      data: {
        companyId: companyA,
        name: "nullable-test.txt",
        url: "https://utfs.io/f/test",
        key: `nullable-${uniq()}`,
        size: 100,
        type: "text/plain",
        displayName: null,
        source: null,
        folderId: null,
        recordId: null,
      },
    });
    expect(file.displayName).toBeNull();
    expect(file.source).toBeNull();
    expect(file.folderId).toBeNull();
    expect(file.recordId).toBeNull();
  });

  it("key+companyId index — deduplication works via saveFileMetadata", async () => {
    const fd = {
      name: "dup.txt",
      url: "https://utfs.io/f/dup",
      key: `dedup-key-${uniq()}`,
      size: 100,
      type: "text/plain",
    };
    const first = await saveFileMetadata(fd, null);
    const second = await saveFileMetadata(fd, null);
    expect(second.duplicate).toBe(true);
    expect(second.id).toBe(first.id);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Multi-Step Flows
// ═════════════════════════════════════════════════════════════════════════════

describe("Multi-Step Flows", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("create folder → create file in folder → move file to root → verify", async () => {
    // Step 1: create folder
    await createFolder("Flow Folder", null);
    const folder = await prisma.folder.findFirst({
      where: { companyId: companyA, name: "Flow Folder" },
    });
    expect(folder).not.toBeNull();

    // Step 2: save file in folder
    const fd = {
      name: `flow-${uniq()}.pdf`,
      url: `https://utfs.io/f/${uniq()}`,
      key: `flow-key-${uniq()}`,
      size: 512,
      type: "application/pdf",
    };
    const saved = await saveFileMetadata(fd, folder!.id);
    let dbFile = await prisma.file.findUnique({ where: { id: saved.id } });
    expect(dbFile!.folderId).toBe(folder!.id);

    // Step 3: move to root
    await moveFileToFolder(saved.id, null);
    dbFile = await prisma.file.findUnique({ where: { id: saved.id } });
    expect(dbFile!.folderId).toBeNull();
  });

  it("create file → update displayName → download (verify Content-Disposition) → delete → verify gone", async () => {
    // Step 1: create file
    const fd = {
      name: `lifecycle-${uniq()}.txt`,
      url: `https://utfs.io/f/${uniq()}`,
      key: `lifecycle-${uniq()}`,
      size: 128,
      type: "text/plain",
    };
    const saved = await saveFileMetadata(fd, null);

    // Step 2: update displayName
    await updateFile(saved.id, { displayName: "Pretty Name.txt" });
    const dbFile = await prisma.file.findUnique({ where: { id: saved.id } });
    expect(dbFile!.displayName).toBe("Pretty Name.txt");

    // Step 3: download (mock fetch) — verify Content-Disposition uses displayName
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: new ReadableStream({
        start(c) { c.enqueue(new TextEncoder().encode("data")); c.close(); },
      }),
      headers: new Headers({ "content-type": "text/plain" }),
    });
    const downloadRes = await GET(
      buildGetRequest(`/api/files/${saved.id}/download`) as any,
      makeParams(saved.id),
    );
    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers.get("Content-Disposition")).toContain(
      encodeURIComponent("Pretty Name.txt"),
    );

    // Step 4: delete
    await deleteFile(saved.id);
    const gone = await prisma.file.findUnique({ where: { id: saved.id } });
    expect(gone).toBeNull();
  });

  it("create folder → add files → delete folder → verify files also deleted", async () => {
    // Step 1: create folder
    await createFolder("Doomed Folder", null);
    const folder = await prisma.folder.findFirst({
      where: { companyId: companyA, name: "Doomed Folder" },
    });

    // Step 2: add files
    const f1 = await seedFileRow(companyA, { folderId: folder!.id });
    const f2 = await seedFileRow(companyA, { folderId: folder!.id });

    // Step 3: delete folder
    await deleteFolder(folder!.id);

    // Step 4: verify everything is gone
    expect(await prisma.folder.findUnique({ where: { id: folder!.id } })).toBeNull();
    expect(await prisma.file.findUnique({ where: { id: f1.id } })).toBeNull();
    expect(await prisma.file.findUnique({ where: { id: f2.id } })).toBeNull();
  });
});

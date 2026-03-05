import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";

// ── MOCK (infrastructure only — keep everything else real) ──────────────────
vi.mock("@/lib/permissions-server", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(),
  RATE_LIMITS: {
    taskRead: { prefix: "task-read", max: 60, windowSeconds: 60 },
    taskMutation: { prefix: "task-mut", max: 30, windowSeconds: 60 },
  },
}));

vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: vi.fn() },
}));

vi.mock("@/app/actions/automations-core", () => ({
  processTaskStatusChange: vi.fn(),
}));

// ── REAL: prisma, validations/tasks, permissions, company-validation ────────
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { checkRateLimit } from "@/lib/rate-limit";
import { inngest } from "@/lib/inngest/client";

import { GET as GET_LIST, POST } from "@/app/api/tasks/route";
import { GET as GET_ONE, PATCH, DELETE } from "@/app/api/tasks/[id]/route";
import { NextResponse } from "next/server";

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeListReq(method = "GET", body?: unknown) {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new Request("http://localhost:3000/api/tasks", init);
}

function makeIdReq(id: string, method = "GET", body?: unknown) {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new Request(`http://localhost:3000/api/tasks/${id}`, init);
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function seedTask(companyId: number, creatorId: number, overrides: Record<string, unknown> = {}) {
  return prisma.task.create({
    data: {
      companyId,
      creatorId,
      title: overrides.title as string ?? "Seeded Task",
      status: (overrides.status as any) ?? "todo",
      priority: (overrides.priority as any) ?? undefined,
      tags: (overrides.tags as string[]) ?? [],
      assigneeId: overrides.assigneeId as number ?? undefined,
      description: overrides.description as string ?? undefined,
      dueDate: overrides.dueDate as Date ?? undefined,
    },
  });
}

function mockUser(user: Record<string, unknown>) {
  vi.mocked(getCurrentUser).mockResolvedValue({
    allowedWriteTableIds: [],
    ...user,
  } as any);
}

/** Expected keys for list/POST responses (no description, no companyId, no relations) */
const LIST_RESPONSE_KEYS = [
  "assigneeId", "createdAt", "creatorId", "dueDate", "id",
  "priority", "status", "tags", "title", "updatedAt",
];

/** Expected keys for detail responses (GET [id], PATCH — includes description + relations) */
const DETAIL_RESPONSE_KEYS = [
  "assignee", "assigneeId", "createdAt", "creator", "creatorId",
  "description", "dueDate", "id", "priority", "status", "tags",
  "title", "updatedAt",
];

// ── State ───────────────────────────────────────────────────────────────────
let companyA: number;
let companyB: number;
let adminUserA: { id: number; companyId: number; name: string; email: string; role: string; permissions: Record<string, boolean> };
let viewerUserA: typeof adminUserA;
let creatorUserA: typeof adminUserA;
let viewAllUserA: typeof adminUserA;
let noPermsUserA: typeof adminUserA;
let adminUserB: typeof adminUserA;

const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// ── Setup / Teardown ────────────────────────────────────────────────────────

beforeAll(async () => {
  const coA = await prisma.company.create({ data: { name: "Tasks Co A", slug: `tasks-co-a-${suffix}` } });
  const coB = await prisma.company.create({ data: { name: "Tasks Co B", slug: `tasks-co-b-${suffix}` } });
  companyA = coA.id;
  companyB = coB.id;

  const mkUser = async (compId: number, name: string, role: string, perms: Record<string, boolean>) => {
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
    return { id: u.id, companyId: u.companyId, name: u.name, email: u.email, role: u.role, permissions: perms };
  };

  adminUserA = await mkUser(companyA, "Admin A", "admin", {});
  viewerUserA = await mkUser(companyA, "Viewer A", "basic", { canViewTasks: true });
  creatorUserA = await mkUser(companyA, "Creator A", "basic", { canViewTasks: true, canCreateTasks: true });
  viewAllUserA = await mkUser(companyA, "ViewAll A", "basic", { canViewTasks: true, canViewAllTasks: true });
  noPermsUserA = await mkUser(companyA, "NoPerms A", "basic", {});
  adminUserB = await mkUser(companyB, "Admin B", "admin", {});
});

afterEach(async () => {
  // FK-safe order: auditLog → task
  await prisma.auditLog.deleteMany({ where: { companyId: { in: [companyA, companyB] } } });
  await prisma.task.deleteMany({ where: { companyId: { in: [companyA, companyB] } } });

  vi.clearAllMocks();
  // Re-default mocks
  vi.mocked(checkRateLimit).mockResolvedValue(null as any);
  vi.mocked(inngest.send).mockResolvedValue(undefined as any);
});

afterAll(async () => {
  if (!companyA) return;
  await prisma.auditLog.deleteMany({ where: { companyId: { in: [companyA, companyB] } } });
  await prisma.task.deleteMany({ where: { companyId: { in: [companyA, companyB] } } });
  await prisma.user.deleteMany({ where: { companyId: { in: [companyA, companyB] } } });
  await prisma.company.deleteMany({ where: { id: { in: [companyA, companyB] } } });
  await prisma.$disconnect();
});

// ═════════════════════════════════════════════════════════════════════════════
// GET /api/tasks
// ═════════════════════════════════════════════════════════════════════════════

describe("GET /api/tasks", () => {
  it("admin sees all company tasks", async () => {
    mockUser(adminUserA);
    await seedTask(companyA, adminUserA.id, { title: "Review Q4 financials", assigneeId: viewerUserA.id });
    await seedTask(companyA, creatorUserA.id, { title: "Prepare client proposal", assigneeId: creatorUserA.id });

    const res = await GET_LIST(makeListReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    // Verify tasks have different creators (non-trivial multi-creator assertion)
    const creatorIds = body.map((t: any) => t.creatorId);
    expect(creatorIds).toContain(adminUserA.id);
    expect(creatorIds).toContain(creatorUserA.id);
  });

  it("basic user with canViewTasks sees only own assigned tasks", async () => {
    mockUser(viewerUserA);
    await seedTask(companyA, adminUserA.id, { title: "Assigned to viewer", assigneeId: viewerUserA.id });
    await seedTask(companyA, adminUserA.id, { title: "Assigned to creator", assigneeId: creatorUserA.id });

    const res = await GET_LIST(makeListReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].title).toBe("Assigned to viewer");
  });

  it("user with canViewAllTasks sees all company tasks", async () => {
    mockUser(viewAllUserA);
    await seedTask(companyA, adminUserA.id, { title: "Task for viewer", assigneeId: viewerUserA.id });
    await seedTask(companyA, adminUserA.id, { title: "Task for creator", assigneeId: creatorUserA.id });

    const res = await GET_LIST(makeListReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
  });

  it("company A admin cannot see company B tasks", async () => {
    mockUser(adminUserA);
    await seedTask(companyB, adminUserB.id, { title: "Company B confidential" });

    const res = await GET_LIST(makeListReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveLength(0);
  });

  it("returns empty array when no tasks exist", async () => {
    mockUser(adminUserA);
    const res = await GET_LIST(makeListReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("tasks returned in descending createdAt order", async () => {
    mockUser(adminUserA);
    const t1 = await seedTask(companyA, adminUserA.id, { title: "First created" });
    const t2 = await seedTask(companyA, adminUserA.id, { title: "Second created" });

    const res = await GET_LIST(makeListReq());
    const body = await res.json();
    expect(body[0].id).toBe(t2.id);
    expect(body[1].id).toBe(t1.id);
  });

  it("response shape: exactly 10 fields, no description/companyId", async () => {
    mockUser(adminUserA);
    await seedTask(companyA, adminUserA.id, { title: "Contract shape check", description: "Should be excluded" });

    const res = await GET_LIST(makeListReq());
    const body = await res.json();
    expect(Object.keys(body[0]).sort()).toEqual(LIST_RESPONSE_KEYS);
    expect(body[0]).not.toHaveProperty("description");
    expect(body[0]).not.toHaveProperty("companyId");
  });

  it("forbidden for noPermsUserA → 403", async () => {
    mockUser(noPermsUserA);
    const res = await GET_LIST(makeListReq());
    expect(res.status).toBe(403);
  });

  it("viewer with no assigned tasks → empty array, not 403", async () => {
    mockUser(viewerUserA);
    await seedTask(companyA, adminUserA.id, { title: "Unassigned task" });

    const res = await GET_LIST(makeListReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/tasks
// ═════════════════════════════════════════════════════════════════════════════

describe("POST /api/tasks", () => {
  it("minimal creation (title only) → 201 and persists in DB", async () => {
    mockUser(adminUserA);
    const res = await POST(makeListReq("POST", { title: "Onboard new client" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.title).toBe("Onboard new client");
    expect(body.status).toBe("todo");

    const inDb = await prisma.task.findUnique({ where: { id: body.id } });
    expect(inDb).not.toBeNull();
    expect(inDb!.title).toBe("Onboard new client");
    expect(inDb!.companyId).toBe(companyA);
    expect(inDb!.creatorId).toBe(adminUserA.id);
  });

  it("full creation with all fields", async () => {
    mockUser(adminUserA);
    const res = await POST(makeListReq("POST", {
      title: "Prepare quarterly report",
      description: "Include revenue breakdown by segment",
      status: "in_progress",
      priority: "high",
      assigneeId: viewerUserA.id,
      tags: ["urgent", "finance"],
      dueDate: "2026-06-15",
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.title).toBe("Prepare quarterly report");
    expect(body.status).toBe("in_progress");
    expect(body.priority).toBe("high");
    expect(body.tags).toEqual(["urgent", "finance"]);

    const inDb = await prisma.task.findUnique({ where: { id: body.id } });
    expect(inDb!.description).toBe("Include revenue breakdown by segment");
    expect(inDb!.assigneeId).toBe(viewerUserA.id);
    expect(inDb!.dueDate).toBeInstanceOf(Date);
    expect(inDb!.dueDate!.toISOString().slice(0, 10)).toBe("2026-06-15");
  });

  it("canCreateTasks user can create → persists in DB", async () => {
    mockUser(creatorUserA);
    const res = await POST(makeListReq("POST", { title: "Draft meeting agenda" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.creatorId).toBe(creatorUserA.id);

    const inDb = await prisma.task.findUnique({ where: { id: body.id } });
    expect(inDb).not.toBeNull();
    expect(inDb!.title).toBe("Draft meeting agenda");
    expect(inDb!.creatorId).toBe(creatorUserA.id);
  });

  it("forbidden for user without canCreateTasks → 403, no task in DB", async () => {
    mockUser(viewerUserA);
    const res = await POST(makeListReq("POST", { title: "Should not persist" }));
    expect(res.status).toBe(403);

    const count = await prisma.task.count({ where: { companyId: companyA } });
    expect(count).toBe(0);
  });

  it("forbidden for user with no permissions → 403, no task in DB", async () => {
    mockUser(noPermsUserA);
    const res = await POST(makeListReq("POST", { title: "Should not persist" }));
    expect(res.status).toBe(403);

    const count = await prisma.task.count({ where: { companyId: companyA } });
    expect(count).toBe(0);
  });

  it("validation: empty title → 400", async () => {
    mockUser(adminUserA);
    const res = await POST(makeListReq("POST", { title: "" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Validation failed");
  });

  it("validation: title > 200 chars → 400", async () => {
    mockUser(adminUserA);
    const res = await POST(makeListReq("POST", { title: "a".repeat(201) }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Validation failed");
  });

  it("validation: invalid status enum → 400", async () => {
    mockUser(adminUserA);
    const res = await POST(makeListReq("POST", { title: "Valid title", status: "banana" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Validation failed");
  });

  it("validation: invalid priority enum → 400", async () => {
    mockUser(adminUserA);
    const res = await POST(makeListReq("POST", { title: "Valid title", priority: "ultra" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Validation failed");
  });

  it("validation: invalid dueDate → 400", async () => {
    mockUser(adminUserA);
    const res = await POST(makeListReq("POST", { title: "Valid title", dueDate: "not-a-date" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Validation failed");
  });

  it("validation: description > 5000 chars → 400", async () => {
    mockUser(adminUserA);
    const res = await POST(makeListReq("POST", { title: "Valid title", description: "x".repeat(5001) }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Validation failed");
  });

  it("validation: tags array > 30 items → 400", async () => {
    mockUser(adminUserA);
    const res = await POST(makeListReq("POST", { title: "Valid title", tags: Array.from({ length: 31 }, (_, i) => `t${i}`) }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Validation failed");
  });

  it("validation: single tag > 100 chars → 400", async () => {
    mockUser(adminUserA);
    const res = await POST(makeListReq("POST", { title: "Valid title", tags: ["a".repeat(101)] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Validation failed");
  });

  it("validation: negative assigneeId → 400", async () => {
    mockUser(adminUserA);
    const res = await POST(makeListReq("POST", { title: "Valid title", assigneeId: -1 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Validation failed");
  });

  it("validation: assigneeId 0 → 400 (positive required)", async () => {
    mockUser(adminUserA);
    const res = await POST(makeListReq("POST", { title: "Valid title", assigneeId: 0 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Validation failed");
  });

  it("validation: assigneeId float → 400 (integer required)", async () => {
    mockUser(adminUserA);
    const res = await POST(makeListReq("POST", { title: "Valid title", assigneeId: 1.5 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Validation failed");
  });

  it("real DB: assignee from same company passes validateUserInCompany", async () => {
    mockUser(adminUserA);
    const res = await POST(makeListReq("POST", { title: "Assigned to teammate", assigneeId: viewerUserA.id }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.assigneeId).toBe(viewerUserA.id);
    const inDb = await prisma.task.findUnique({ where: { id: body.id } });
    expect(inDb!.assigneeId).toBe(viewerUserA.id);
  });

  it("real DB: assignee from different company → 400", async () => {
    mockUser(adminUserA);
    const res = await POST(makeListReq("POST", { title: "Cross-company assign", assigneeId: adminUserB.id }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid assignee");
  });

  it("real DB: non-existent assigneeId → 400", async () => {
    mockUser(adminUserA);
    const res = await POST(makeListReq("POST", { title: "Ghost assignee", assigneeId: 999999 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid assignee");
  });

  it("no assigneeId → DB record has assigneeId: null", async () => {
    mockUser(adminUserA);
    const res = await POST(makeListReq("POST", { title: "Unassigned work item" }));
    expect(res.status).toBe(201);
    const body = await res.json();

    const inDb = await prisma.task.findUnique({ where: { id: body.id } });
    expect(inDb!.assigneeId).toBeNull();
  });

  it("invalid JSON body → 400", async () => {
    mockUser(adminUserA);
    const res = await POST(makeListReq("POST", "not json{{{"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid JSON body");
  });

  it("companyId set from user context, not request body", async () => {
    mockUser(adminUserA);
    const res = await POST(makeListReq("POST", { title: "Forced company", companyId: companyB }));
    expect(res.status).toBe(201);
    const body = await res.json();

    const inDb = await prisma.task.findUnique({ where: { id: body.id } });
    expect(inDb!.companyId).toBe(companyA);
  });

  it("creatorId set from user context, not request body", async () => {
    mockUser(adminUserA);
    const res = await POST(makeListReq("POST", { title: "Spoofed creator", creatorId: viewerUserA.id }));
    expect(res.status).toBe(201);
    const body = await res.json();

    const inDb = await prisma.task.findUnique({ where: { id: body.id } });
    expect(inDb!.creatorId).toBe(adminUserA.id);
  });

  it("title is trimmed before persisting → DB stores trimmed value", async () => {
    mockUser(adminUserA);
    const res = await POST(makeListReq("POST", { title: "  Quarterly budget review  " }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.title).toBe("Quarterly budget review");
    const inDb = await prisma.task.findUnique({ where: { id: body.id } });
    expect(inDb!.title).toBe("Quarterly budget review");
  });

  it("response shape: excludes description and companyId", async () => {
    mockUser(adminUserA);
    const res = await POST(makeListReq("POST", { title: "Verify response contract", description: "Should not appear in response" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(LIST_RESPONSE_KEYS);
    expect(body).not.toHaveProperty("description");
    expect(body).not.toHaveProperty("companyId");

    const inDb = await prisma.task.findUnique({ where: { id: body.id } });
    expect(inDb).not.toBeNull();
    expect(inDb!.description).toBe("Should not appear in response");
  });

  it("boundary: title exactly 200 chars → succeeds and persists", async () => {
    mockUser(adminUserA);
    const title = "a".repeat(200);
    const res = await POST(makeListReq("POST", { title }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.title).toBe(title);

    const inDb = await prisma.task.findUnique({ where: { id: body.id } });
    expect(inDb!.title).toHaveLength(200);
  });

  it("boundary: exactly 30 tags → succeeds and persists", async () => {
    mockUser(adminUserA);
    const tags = Array.from({ length: 30 }, (_, i) => `tag-${i}`);
    const res = await POST(makeListReq("POST", { title: "Many tags task", tags }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.tags).toHaveLength(30);

    const inDb = await prisma.task.findUnique({ where: { id: body.id } });
    expect(inDb!.tags).toHaveLength(30);
    expect(inDb!.tags).toEqual(tags);
  });

  it("boundary: description exactly 5000 chars → succeeds", async () => {
    mockUser(adminUserA);
    const description = "d".repeat(5000);
    const res = await POST(makeListReq("POST", { title: "Long description task", description }));
    expect(res.status).toBe(201);
    const body = await res.json();

    const inDb = await prisma.task.findUnique({ where: { id: body.id } });
    expect(inDb!.description).toHaveLength(5000);
  });

  it("@default values: tags=[], status=todo, priority=null, dueDate=null", async () => {
    mockUser(adminUserA);
    const res = await POST(makeListReq("POST", { title: "Defaults verification" }));
    expect(res.status).toBe(201);
    const body = await res.json();

    const inDb = await prisma.task.findUnique({ where: { id: body.id } });
    expect(inDb!.tags).toEqual([]);
    expect(inDb!.status).toBe("todo");
    expect(inDb!.priority).toBeNull();
    expect(inDb!.dueDate).toBeNull();
    expect(inDb!.description).toBeNull();
    expect(inDb!.assigneeId).toBeNull();
  });

  it("validation: whitespace-only title → 400, no task in DB", async () => {
    mockUser(adminUserA);
    const res = await POST(makeListReq("POST", { title: "   " }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Validation failed");

    const count = await prisma.task.count({ where: { companyId: companyA } });
    expect(count).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GET /api/tasks/[id]
// ═════════════════════════════════════════════════════════════════════════════

describe("GET /api/tasks/[id]", () => {
  it("admin fetches task with nested assignee and creator relations", async () => {
    mockUser(adminUserA);
    const task = await seedTask(companyA, adminUserA.id, { title: "Detailed review", assigneeId: viewerUserA.id });

    const res = await GET_ONE(makeIdReq(task.id, "GET"), ctx(task.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.assignee).toEqual({ id: viewerUserA.id, name: viewerUserA.name });
    expect(body.creator).toEqual({ id: adminUserA.id, name: adminUserA.name });
  });

  it("response includes correct relation data for different users", async () => {
    mockUser(adminUserA);
    const task = await seedTask(companyA, creatorUserA.id, { title: "Cross-user relations", assigneeId: viewAllUserA.id });

    const res = await GET_ONE(makeIdReq(task.id, "GET"), ctx(task.id));
    const body = await res.json();
    expect(body.creator.id).toBe(creatorUserA.id);
    expect(body.creator.name).toBe(creatorUserA.name);
    expect(body.assignee.id).toBe(viewAllUserA.id);
    expect(body.assignee.name).toBe(viewAllUserA.name);
  });

  it("basic user can only see own assigned tasks (404 for others)", async () => {
    mockUser(viewerUserA);
    const task = await seedTask(companyA, adminUserA.id, { title: "Not assigned to viewer", assigneeId: creatorUserA.id });

    const res = await GET_ONE(makeIdReq(task.id, "GET"), ctx(task.id));
    expect(res.status).toBe(404);
  });

  it("canViewAllTasks user sees any company task", async () => {
    mockUser(viewAllUserA);
    const task = await seedTask(companyA, adminUserA.id, { title: "Client onboarding plan", assigneeId: creatorUserA.id });

    const res = await GET_ONE(makeIdReq(task.id, "GET"), ctx(task.id));
    expect(res.status).toBe(200);
    expect((await res.json()).title).toBe("Client onboarding plan");
  });

  it("multi-tenancy: cannot fetch other company's task → 404", async () => {
    mockUser(adminUserA);
    const task = await seedTask(companyB, adminUserB.id, { title: "Company B internal" });

    const res = await GET_ONE(makeIdReq(task.id, "GET"), ctx(task.id));
    expect(res.status).toBe(404);
  });

  it("non-existent task ID → 404", async () => {
    mockUser(adminUserA);
    const res = await GET_ONE(makeIdReq("nonexistent-id", "GET"), ctx("nonexistent-id"));
    expect(res.status).toBe(404);
  });

  it("task without assignee returns null for assignee relation", async () => {
    mockUser(adminUserA);
    const task = await seedTask(companyA, adminUserA.id, { title: "Solo task" });

    const res = await GET_ONE(makeIdReq(task.id, "GET"), ctx(task.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.assignee).toBeNull();
  });

  it("forbidden for noPermsUserA → 403", async () => {
    mockUser(noPermsUserA);
    const task = await seedTask(companyA, adminUserA.id, { title: "Hidden from no perms" });

    const res = await GET_ONE(makeIdReq(task.id, "GET"), ctx(task.id));
    expect(res.status).toBe(403);
  });

  it("response shape: includes description, assignee, creator; excludes companyId", async () => {
    mockUser(adminUserA);
    const task = await seedTask(companyA, adminUserA.id, {
      title: "Response contract check",
      description: "Verify NDA terms",
      assigneeId: viewerUserA.id,
    });

    const res = await GET_ONE(makeIdReq(task.id, "GET"), ctx(task.id));
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(DETAIL_RESPONSE_KEYS);
    expect(body.description).toBe("Verify NDA terms");
    expect(body).not.toHaveProperty("companyId");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// PATCH /api/tasks/[id]
// ═════════════════════════════════════════════════════════════════════════════

describe("PATCH /api/tasks/[id]", () => {
  it("admin updates title only → DB state updated, no AuditLog", async () => {
    mockUser(adminUserA);
    const task = await seedTask(companyA, adminUserA.id, { title: "Review contract draft" });

    const res = await PATCH(makeIdReq(task.id, "PATCH", { title: "Review final contract" }), ctx(task.id));
    expect(res.status).toBe(200);
    expect((await res.json()).title).toBe("Review final contract");

    const inDb = await prisma.task.findUnique({ where: { id: task.id } });
    expect(inDb!.title).toBe("Review final contract");

    const logs = await prisma.auditLog.findMany({ where: { taskId: task.id } });
    expect(logs).toHaveLength(0);
  });

  it("status change creates AuditLog with correct companyId and userId", async () => {
    mockUser(adminUserA);
    const task = await seedTask(companyA, adminUserA.id, { title: "Status audit check" });

    const res = await PATCH(makeIdReq(task.id, "PATCH", { status: "in_progress" }), ctx(task.id));
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("in_progress");

    const inDb = await prisma.task.findUnique({ where: { id: task.id } });
    expect(inDb!.status).toBe("in_progress");

    const logs = await prisma.auditLog.findMany({ where: { taskId: task.id } });
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe("UPDATE");
    expect(logs[0].taskId).toBe(task.id);
    expect(logs[0].diffJson).toEqual({ status: { from: "todo", to: "in_progress" } });
    expect(logs[0].companyId).toBe(companyA);
    expect(logs[0].userId).toBe(adminUserA.id);

    // Verify inngest.send was called with correct payload
    expect(inngest.send).toHaveBeenCalledOnce();
    expect(inngest.send).toHaveBeenCalledWith({
      id: `task-status-${companyA}-${task.id}-in_progress`,
      name: "automation/task-status-change",
      data: {
        taskId: task.id,
        taskTitle: "Status audit check",
        fromStatus: "todo",
        toStatus: "in_progress",
        companyId: companyA,
      },
    });
  });

  it("same status sent → no AuditLog, inngest not called", async () => {
    mockUser(adminUserA);
    const task = await seedTask(companyA, adminUserA.id, { title: "No-op status", status: "todo" });

    const res = await PATCH(makeIdReq(task.id, "PATCH", { status: "todo" }), ctx(task.id));
    expect(res.status).toBe(200);

    const logs = await prisma.auditLog.findMany({ where: { taskId: task.id } });
    expect(logs).toHaveLength(0);
    expect(inngest.send).not.toHaveBeenCalled();
  });

  it("multi-field update (title + status + priority)", async () => {
    mockUser(adminUserA);
    const task = await seedTask(companyA, adminUserA.id, { title: "Multi-field target" });

    const res = await PATCH(makeIdReq(task.id, "PATCH", {
      title: "Updated multi-field",
      status: "done",
      priority: "high",
    }), ctx(task.id));
    expect(res.status).toBe(200);

    const inDb = await prisma.task.findUnique({ where: { id: task.id } });
    expect(inDb!.title).toBe("Updated multi-field");
    expect(inDb!.status).toBe("done");
    expect(inDb!.priority).toBe("high");

    const logs = await prisma.auditLog.findMany({ where: { taskId: task.id } });
    expect(logs).toHaveLength(1);
  });

  it("assignee can edit their own task → DB verified", async () => {
    mockUser(viewerUserA);
    const task = await seedTask(companyA, adminUserA.id, { title: "Assignee's work item", assigneeId: viewerUserA.id });

    const res = await PATCH(makeIdReq(task.id, "PATCH", { title: "Edited by assignee" }), ctx(task.id));
    expect(res.status).toBe(200);
    expect((await res.json()).title).toBe("Edited by assignee");

    const inDb = await prisma.task.findUnique({ where: { id: task.id } });
    expect(inDb!.title).toBe("Edited by assignee");
  });

  it("non-assignee without canViewAllTasks → 403, DB unchanged", async () => {
    mockUser(viewerUserA);
    const task = await seedTask(companyA, adminUserA.id, { title: "Forbidden edit target", assigneeId: creatorUserA.id });

    const res = await PATCH(makeIdReq(task.id, "PATCH", { title: "Should not change" }), ctx(task.id));
    expect(res.status).toBe(403);

    const inDb = await prisma.task.findUnique({ where: { id: task.id } });
    expect(inDb!.title).toBe("Forbidden edit target");
  });

  it("canViewAllTasks user can edit non-assigned task → DB verified", async () => {
    mockUser(viewAllUserA);
    const task = await seedTask(companyA, adminUserA.id, { title: "ViewAll edit target", assigneeId: creatorUserA.id });

    const res = await PATCH(makeIdReq(task.id, "PATCH", { title: "Edited by ViewAll user" }), ctx(task.id));
    expect(res.status).toBe(200);
    expect((await res.json()).title).toBe("Edited by ViewAll user");

    const inDb = await prisma.task.findUnique({ where: { id: task.id } });
    expect(inDb!.title).toBe("Edited by ViewAll user");
  });

  it("real DB: reassign to same-company user succeeds", async () => {
    mockUser(adminUserA);
    const task = await seedTask(companyA, adminUserA.id, { title: "Reassignment test", assigneeId: viewerUserA.id });

    const res = await PATCH(makeIdReq(task.id, "PATCH", { assigneeId: creatorUserA.id }), ctx(task.id));
    expect(res.status).toBe(200);

    const inDb = await prisma.task.findUnique({ where: { id: task.id } });
    expect(inDb!.assigneeId).toBe(creatorUserA.id);
  });

  it("real DB: reassign to cross-company user → 400", async () => {
    mockUser(adminUserA);
    const task = await seedTask(companyA, adminUserA.id, { title: "Cross-company reassign" });

    const res = await PATCH(makeIdReq(task.id, "PATCH", { assigneeId: adminUserB.id }), ctx(task.id));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid assignee");

    const inDb = await prisma.task.findUnique({ where: { id: task.id } });
    expect(inDb!.assigneeId).toBeNull();
  });

  it("real DB: reassign to non-existent user → 400, DB unchanged", async () => {
    mockUser(adminUserA);
    const task = await seedTask(companyA, adminUserA.id, { title: "Ghost reassign test", assigneeId: viewerUserA.id });
    const res = await PATCH(makeIdReq(task.id, "PATCH", { assigneeId: 999999 }), ctx(task.id));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid assignee");
    const inDb = await prisma.task.findUnique({ where: { id: task.id } });
    expect(inDb!.assigneeId).toBe(viewerUserA.id);
  });

  it("clear assignee with null → DB shows null", async () => {
    mockUser(adminUserA);
    const task = await seedTask(companyA, adminUserA.id, { title: "Clear assignee test", assigneeId: viewerUserA.id });

    const res = await PATCH(makeIdReq(task.id, "PATCH", { assigneeId: null }), ctx(task.id));
    expect(res.status).toBe(200);

    const inDb = await prisma.task.findUnique({ where: { id: task.id } });
    expect(inDb!.assigneeId).toBeNull();
  });

  it("non-existent task → 404", async () => {
    mockUser(adminUserA);
    const res = await PATCH(makeIdReq("nonexistent-id", "PATCH", { title: "X" }), ctx("nonexistent-id"));
    expect(res.status).toBe(404);
  });

  it("multi-tenancy: cannot update other company's task → 404, DB unchanged", async () => {
    mockUser(adminUserA);
    const task = await seedTask(companyB, adminUserB.id, { title: "Company B task" });

    const res = await PATCH(makeIdReq(task.id, "PATCH", { title: "Should not change" }), ctx(task.id));
    expect(res.status).toBe(404);

    const inDb = await prisma.task.findUnique({ where: { id: task.id } });
    expect(inDb!.title).toBe("Company B task");
  });

  it("validation: empty title → 400, DB unchanged", async () => {
    mockUser(adminUserA);
    const task = await seedTask(companyA, adminUserA.id, { title: "Keep this title" });
    const res = await PATCH(makeIdReq(task.id, "PATCH", { title: "" }), ctx(task.id));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Validation failed");

    const inDb = await prisma.task.findUnique({ where: { id: task.id } });
    expect(inDb!.title).toBe("Keep this title");
  });

  it("validation: title > 200 chars → 400, DB unchanged", async () => {
    mockUser(adminUserA);
    const task = await seedTask(companyA, adminUserA.id, { title: "Keep this title" });
    const res = await PATCH(makeIdReq(task.id, "PATCH", { title: "a".repeat(201) }), ctx(task.id));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Validation failed");

    const inDb = await prisma.task.findUnique({ where: { id: task.id } });
    expect(inDb!.title).toBe("Keep this title");
  });

  it("validation: invalid status → 400, DB unchanged", async () => {
    mockUser(adminUserA);
    const task = await seedTask(companyA, adminUserA.id, { title: "Keep this status" });
    const res = await PATCH(makeIdReq(task.id, "PATCH", { status: "banana" }), ctx(task.id));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Validation failed");

    const inDb = await prisma.task.findUnique({ where: { id: task.id } });
    expect(inDb!.status).toBe("todo");
  });

  it("validation: invalid dueDate → 400, DB unchanged", async () => {
    mockUser(adminUserA);
    const task = await seedTask(companyA, adminUserA.id, { title: "Keep this dueDate" });
    const res = await PATCH(makeIdReq(task.id, "PATCH", { dueDate: "not-a-date" }), ctx(task.id));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Validation failed");

    const inDb = await prisma.task.findUnique({ where: { id: task.id } });
    expect(inDb!.dueDate).toBeNull();
  });

  it("validation: whitespace-only title → 400, DB unchanged", async () => {
    mockUser(adminUserA);
    const task = await seedTask(companyA, adminUserA.id, { title: "Keep this title" });
    const res = await PATCH(makeIdReq(task.id, "PATCH", { title: "   " }), ctx(task.id));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Validation failed");
    const inDb = await prisma.task.findUnique({ where: { id: task.id } });
    expect(inDb!.title).toBe("Keep this title");
  });

  it("validation: description > 5000 chars → 400, DB unchanged", async () => {
    mockUser(adminUserA);
    const task = await seedTask(companyA, adminUserA.id, { title: "Keep this task", description: "Original" });
    const res = await PATCH(makeIdReq(task.id, "PATCH", { description: "x".repeat(5001) }), ctx(task.id));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Validation failed");
    const inDb = await prisma.task.findUnique({ where: { id: task.id } });
    expect(inDb!.description).toBe("Original");
  });

  it("validation: tags > 30 items → 400, DB unchanged", async () => {
    mockUser(adminUserA);
    const task = await seedTask(companyA, adminUserA.id, { title: "Keep tags", tags: ["original"] });
    const res = await PATCH(makeIdReq(task.id, "PATCH", { tags: Array.from({ length: 31 }, (_, i) => `t${i}`) }), ctx(task.id));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Validation failed");
    const inDb = await prisma.task.findUnique({ where: { id: task.id } });
    expect(inDb!.tags).toEqual(["original"]);
  });

  it("validation: single tag > 100 chars → 400, DB unchanged", async () => {
    mockUser(adminUserA);
    const task = await seedTask(companyA, adminUserA.id, { title: "Keep tags", tags: ["original"] });
    const res = await PATCH(makeIdReq(task.id, "PATCH", { tags: ["a".repeat(101)] }), ctx(task.id));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Validation failed");
    const inDb = await prisma.task.findUnique({ where: { id: task.id } });
    expect(inDb!.tags).toEqual(["original"]);
  });

  it("title is trimmed before persisting via PATCH → DB stores trimmed value", async () => {
    mockUser(adminUserA);
    const task = await seedTask(companyA, adminUserA.id, { title: "Original untrimmed" });
    const res = await PATCH(makeIdReq(task.id, "PATCH", { title: "  Quarterly budget review  " }), ctx(task.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe("Quarterly budget review");
    const inDb = await prisma.task.findUnique({ where: { id: task.id } });
    expect(inDb!.title).toBe("Quarterly budget review");
  });

  it("invalid JSON body → 400", async () => {
    mockUser(adminUserA);
    const task = await seedTask(companyA, adminUserA.id, { title: "Valid task" });
    const res = await PATCH(makeIdReq(task.id, "PATCH", "bad json{{"), ctx(task.id));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid JSON body");
  });

  it("inngest failure triggers processTaskStatusChange fallback", async () => {
    mockUser(adminUserA);
    vi.mocked(inngest.send).mockRejectedValue(new Error("Inngest down"));
    const task = await seedTask(companyA, adminUserA.id, { title: "Fallback test" });

    const res = await PATCH(makeIdReq(task.id, "PATCH", { status: "done" }), ctx(task.id));
    expect(res.status).toBe(200);

    const inDb = await prisma.task.findUnique({ where: { id: task.id } });
    expect(inDb!.status).toBe("done");

    // Verify inngest.send was actually called (and failed) before fallback
    expect(inngest.send).toHaveBeenCalledOnce();

    const { processTaskStatusChange } = await import("@/app/actions/automations-core");
    expect(processTaskStatusChange).toHaveBeenCalledWith(
      task.id, "Fallback test", "todo", "done", companyA,
    );

    // AuditLog was created inside $transaction BEFORE inngest failure
    const logs = await prisma.auditLog.findMany({ where: { taskId: task.id } });
    expect(logs).toHaveLength(1);
    expect(logs[0].diffJson).toEqual({ status: { from: "todo", to: "done" } });
  });

  it("both inngest and fallback fail → still returns 200, task updated", async () => {
    mockUser(adminUserA);
    vi.mocked(inngest.send).mockRejectedValue(new Error("Inngest down"));
    const { processTaskStatusChange } = await import("@/app/actions/automations-core");
    vi.mocked(processTaskStatusChange).mockRejectedValue(new Error("Fallback also down"));

    const task = await seedTask(companyA, adminUserA.id, { title: "Both fail test" });

    const res = await PATCH(makeIdReq(task.id, "PATCH", { status: "done" }), ctx(task.id));
    expect(res.status).toBe(200);

    const inDb = await prisma.task.findUnique({ where: { id: task.id } });
    expect(inDb!.status).toBe("done");
    expect(inngest.send).toHaveBeenCalledOnce();

    // AuditLog was committed in $transaction before post-transaction failures
    const logs = await prisma.auditLog.findMany({ where: { taskId: task.id } });
    expect(logs).toHaveLength(1);
    expect(logs[0].diffJson).toEqual({ status: { from: "todo", to: "done" } });
  });

  it("update tags array → verify in DB", async () => {
    mockUser(adminUserA);
    const task = await seedTask(companyA, adminUserA.id, { title: "Tag update test", tags: ["legacy"] });

    const res = await PATCH(makeIdReq(task.id, "PATCH", { tags: ["updated", "reviewed"] }), ctx(task.id));
    expect(res.status).toBe(200);

    const inDb = await prisma.task.findUnique({ where: { id: task.id } });
    expect(inDb!.tags).toEqual(["updated", "reviewed"]);
  });

  it("all status transitions work with AuditLogs", async () => {
    mockUser(adminUserA);
    const task = await seedTask(companyA, adminUserA.id, { title: "Full transitions", status: "todo" });
    const statuses = ["in_progress", "waiting_client", "on_hold", "completed_month", "done"] as const;

    for (const status of statuses) {
      const res = await PATCH(makeIdReq(task.id, "PATCH", { status }), ctx(task.id));
      expect(res.status).toBe(200);
    }

    const logs = await prisma.auditLog.findMany({
      where: { taskId: task.id },
      orderBy: { timestamp: "asc" },
    });
    expect(logs).toHaveLength(5);
    expect((logs[0].diffJson as any).status.from).toBe("todo");
    expect((logs[0].diffJson as any).status.to).toBe("in_progress");
    expect((logs[4].diffJson as any).status.from).toBe("completed_month");
    expect((logs[4].diffJson as any).status.to).toBe("done");

    // Verify inngest.send was called for each status transition
    expect(inngest.send).toHaveBeenCalledTimes(5);
  });

  it("forbidden for noPermsUserA → 403, DB unchanged", async () => {
    mockUser(noPermsUserA);
    const task = await seedTask(companyA, adminUserA.id, { title: "Hidden from no perms", assigneeId: viewerUserA.id });

    const res = await PATCH(makeIdReq(task.id, "PATCH", { title: "Should not change" }), ctx(task.id));
    expect(res.status).toBe(403);

    const inDb = await prisma.task.findUnique({ where: { id: task.id } });
    expect(inDb!.title).toBe("Hidden from no perms");
  });

  it("update description → verify in DB", async () => {
    mockUser(adminUserA);
    const task = await seedTask(companyA, adminUserA.id, { title: "Description update test" });

    const res = await PATCH(makeIdReq(task.id, "PATCH", { description: "New detailed description" }), ctx(task.id));
    expect(res.status).toBe(200);

    const inDb = await prisma.task.findUnique({ where: { id: task.id } });
    expect(inDb!.description).toBe("New detailed description");
  });

  it("update dueDate → verify in DB", async () => {
    mockUser(adminUserA);
    const task = await seedTask(companyA, adminUserA.id, { title: "DueDate update test" });

    const res = await PATCH(makeIdReq(task.id, "PATCH", { dueDate: "2026-12-31" }), ctx(task.id));
    expect(res.status).toBe(200);

    const inDb = await prisma.task.findUnique({ where: { id: task.id } });
    expect(inDb!.dueDate).toBeInstanceOf(Date);
    expect(inDb!.dueDate!.toISOString().slice(0, 10)).toBe("2026-12-31");
  });

  it("clear description with null → DB shows null", async () => {
    mockUser(adminUserA);
    const task = await seedTask(companyA, adminUserA.id, {
      title: "Clear description test",
      description: "Original description",
    });

    const res = await PATCH(makeIdReq(task.id, "PATCH", { description: null }), ctx(task.id));
    expect(res.status).toBe(200);

    const inDb = await prisma.task.findUnique({ where: { id: task.id } });
    expect(inDb!.description).toBeNull();
  });

  it("response includes assignee/creator relation objects", async () => {
    mockUser(adminUserA);
    const task = await seedTask(companyA, adminUserA.id, { title: "Response contract", assigneeId: viewerUserA.id });

    const res = await PATCH(makeIdReq(task.id, "PATCH", { title: "Updated contract" }), ctx(task.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(DETAIL_RESPONSE_KEYS);
    expect(body.assignee).toEqual({ id: viewerUserA.id, name: viewerUserA.name });
    expect(body.creator).toEqual({ id: adminUserA.id, name: adminUserA.name });
    expect(body).not.toHaveProperty("companyId");

    const inDb = await prisma.task.findUnique({ where: { id: task.id } });
    expect(inDb!.title).toBe("Updated contract");
  });

  it("empty body {} → 200, task data unchanged in DB, no AuditLog", async () => {
    mockUser(adminUserA);
    const task = await seedTask(companyA, adminUserA.id, {
      title: "Stable quarterly review",
      status: "in_progress",
      priority: "medium",
      tags: ["finance"],
    });

    const res = await PATCH(makeIdReq(task.id, "PATCH", {}), ctx(task.id));
    expect(res.status).toBe(200);

    const inDb = await prisma.task.findUnique({ where: { id: task.id } });
    expect(inDb!.title).toBe("Stable quarterly review");
    expect(inDb!.status).toBe("in_progress");
    expect(inDb!.priority).toBe("medium");
    expect(inDb!.tags).toEqual(["finance"]);

    const logs = await prisma.auditLog.findMany({ where: { taskId: task.id } });
    expect(logs).toHaveLength(0);
  });

  it("clear dueDate with null → DB shows null", async () => {
    mockUser(adminUserA);
    const task = await seedTask(companyA, adminUserA.id, {
      title: "Clear dueDate test",
      dueDate: new Date("2026-12-31"),
    });

    const res = await PATCH(makeIdReq(task.id, "PATCH", { dueDate: null }), ctx(task.id));
    expect(res.status).toBe(200);

    const inDb = await prisma.task.findUnique({ where: { id: task.id } });
    expect(inDb!.dueDate).toBeNull();
  });

  it("clear priority with null → DB shows null", async () => {
    mockUser(adminUserA);
    const task = await seedTask(companyA, adminUserA.id, {
      title: "Clear priority test",
      priority: "high",
    });

    const res = await PATCH(makeIdReq(task.id, "PATCH", { priority: null }), ctx(task.id));
    expect(res.status).toBe(200);

    const inDb = await prisma.task.findUnique({ where: { id: task.id } });
    expect(inDb!.priority).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// DELETE /api/tasks/[id]
// ═════════════════════════════════════════════════════════════════════════════

describe("DELETE /api/tasks/[id]", () => {
  it("admin deletes task → 200, findUnique returns null", async () => {
    mockUser(adminUserA);
    const task = await seedTask(companyA, adminUserA.id, { title: "Scheduled for deletion" });

    const res = await DELETE(makeIdReq(task.id, "DELETE"), ctx(task.id));
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);

    const inDb = await prisma.task.findUnique({ where: { id: task.id } });
    expect(inDb).toBeNull();
  });

  it("canCreateTasks user can delete → DB verified", async () => {
    mockUser(creatorUserA);
    const task = await seedTask(companyA, adminUserA.id, { title: "Creator deletes this" });

    const res = await DELETE(makeIdReq(task.id, "DELETE"), ctx(task.id));
    expect(res.status).toBe(200);

    const inDb = await prisma.task.findUnique({ where: { id: task.id } });
    expect(inDb).toBeNull();
  });

  it("forbidden for user without canCreateTasks → 403, task still in DB", async () => {
    mockUser(viewerUserA);
    const task = await seedTask(companyA, adminUserA.id, { title: "Cannot delete this" });

    const res = await DELETE(makeIdReq(task.id, "DELETE"), ctx(task.id));
    expect(res.status).toBe(403);

    const inDb = await prisma.task.findUnique({ where: { id: task.id } });
    expect(inDb).not.toBeNull();
  });

  it("forbidden for user with no permissions → 403, task still in DB", async () => {
    mockUser(noPermsUserA);
    const task = await seedTask(companyA, adminUserA.id, { title: "No perms delete target" });

    const res = await DELETE(makeIdReq(task.id, "DELETE"), ctx(task.id));
    expect(res.status).toBe(403);

    const inDb = await prisma.task.findUnique({ where: { id: task.id } });
    expect(inDb).not.toBeNull();
  });

  it("viewAllUserA (no canCreateTasks) cannot delete → 403, task still in DB", async () => {
    mockUser(viewAllUserA);
    const task = await seedTask(companyA, adminUserA.id, { title: "ViewAll cannot delete" });
    const res = await DELETE(makeIdReq(task.id, "DELETE"), ctx(task.id));
    expect(res.status).toBe(403);
    const inDb = await prisma.task.findUnique({ where: { id: task.id } });
    expect(inDb).not.toBeNull();
  });

  it("non-existent task → 404", async () => {
    mockUser(adminUserA);
    const res = await DELETE(makeIdReq("nonexistent-id", "DELETE"), ctx("nonexistent-id"));
    expect(res.status).toBe(404);
  });

  it("multi-tenancy: cannot delete other company's task → 404, task still in DB", async () => {
    mockUser(adminUserA);
    const task = await seedTask(companyB, adminUserB.id, { title: "Company B protected" });

    const res = await DELETE(makeIdReq(task.id, "DELETE"), ctx(task.id));
    expect(res.status).toBe(404);

    const inDb = await prisma.task.findUnique({ where: { id: task.id } });
    expect(inDb).not.toBeNull();
  });

  it("delete task with audit logs → orphaned audit logs remain", async () => {
    mockUser(adminUserA);
    const task = await seedTask(companyA, adminUserA.id, { title: "Has audit history" });

    // Create a status change to generate audit log
    await PATCH(makeIdReq(task.id, "PATCH", { status: "done" }), ctx(task.id));
    const logsBefore = await prisma.auditLog.findMany({ where: { taskId: task.id } });
    expect(logsBefore).toHaveLength(1);

    // Delete the task
    const res = await DELETE(makeIdReq(task.id, "DELETE"), ctx(task.id));
    expect(res.status).toBe(200);

    // Task is gone
    const inDb = await prisma.task.findUnique({ where: { id: task.id } });
    expect(inDb).toBeNull();

    // Audit logs still exist (orphaned — no FK relation from AuditLog.taskId to Task)
    const logsAfter = await prisma.auditLog.findMany({ where: { taskId: task.id } });
    expect(logsAfter).toHaveLength(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Cross-cutting
// ═════════════════════════════════════════════════════════════════════════════

describe("Cross-cutting", () => {
  it("all 5 endpoints return 401 when unauthenticated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const r1 = await GET_LIST(makeListReq());
    const r2 = await POST(makeListReq("POST", { title: "T" }));
    const r3 = await GET_ONE(makeIdReq("fake-id", "GET"), ctx("fake-id"));
    const r4 = await PATCH(makeIdReq("fake-id", "PATCH", { title: "X" }), ctx("fake-id"));
    const r5 = await DELETE(makeIdReq("fake-id", "DELETE"), ctx("fake-id"));

    expect(r1.status).toBe(401);
    expect(r2.status).toBe(401);
    expect(r3.status).toBe(401);
    expect(r4.status).toBe(401);
    expect(r5.status).toBe(401);
  });

  it("rate limit mock returns 429 for all 5 endpoints → no DB side effects", async () => {
    mockUser(adminUserA);
    // Seed a task to test PATCH/DELETE/GET[id] rate limiting
    vi.mocked(checkRateLimit).mockResolvedValue(null as any);
    const task = await seedTask(companyA, adminUserA.id, { title: "Rate limit target", status: "todo" });
    vi.mocked(checkRateLimit).mockResolvedValue(
      NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 }),
    );

    // GET /api/tasks → 429
    const r1 = await GET_LIST(makeListReq());
    expect(r1.status).toBe(429);

    // POST /api/tasks → 429, no new task in DB
    const r2 = await POST(makeListReq("POST", { title: "Rate limited create" }));
    expect(r2.status).toBe(429);
    const taskCount = await prisma.task.count({ where: { companyId: companyA } });
    expect(taskCount).toBe(1); // Only the seeded task

    // GET /api/tasks/[id] → 429
    const r3 = await GET_ONE(makeIdReq(task.id, "GET"), ctx(task.id));
    expect(r3.status).toBe(429);

    // PATCH /api/tasks/[id] → 429, DB unchanged
    const r4 = await PATCH(makeIdReq(task.id, "PATCH", { status: "done" }), ctx(task.id));
    expect(r4.status).toBe(429);
    const afterPatch = await prisma.task.findUnique({ where: { id: task.id } });
    expect(afterPatch!.status).toBe("todo");

    // DELETE /api/tasks/[id] → 429, task still in DB
    const r5 = await DELETE(makeIdReq(task.id, "DELETE"), ctx(task.id));
    expect(r5.status).toBe(429);
    const afterDelete = await prisma.task.findUnique({ where: { id: task.id } });
    expect(afterDelete).not.toBeNull();

    // No audit logs created
    const logs = await prisma.auditLog.count({ where: { companyId: companyA } });
    expect(logs).toBe(0);

    // checkRateLimit was called for all 5 endpoints
    expect(checkRateLimit).toHaveBeenCalledTimes(5);
    // Verify correct config (taskRead vs taskMutation) per endpoint
    expect(checkRateLimit).toHaveBeenNthCalledWith(1, String(adminUserA.id), expect.objectContaining({ prefix: "task-read" }));
    expect(checkRateLimit).toHaveBeenNthCalledWith(2, String(adminUserA.id), expect.objectContaining({ prefix: "task-mut" }));
    expect(checkRateLimit).toHaveBeenNthCalledWith(3, String(adminUserA.id), expect.objectContaining({ prefix: "task-read" }));
    expect(checkRateLimit).toHaveBeenNthCalledWith(4, String(adminUserA.id), expect.objectContaining({ prefix: "task-mut" }));
    expect(checkRateLimit).toHaveBeenNthCalledWith(5, String(adminUserA.id), expect.objectContaining({ prefix: "task-mut" }));
  });

  it("createdAt/updatedAt: create sets both, update changes updatedAt (verified via DB)", async () => {
    mockUser(adminUserA);
    const createRes = await POST(makeListReq("POST", { title: "Timestamp verification" }));
    const created = await createRes.json();
    expect(created.createdAt).toBeDefined();
    expect(created.updatedAt).toBeDefined();

    // Verify in DB
    const createdInDb = await prisma.task.findUnique({ where: { id: created.id } });
    expect(createdInDb!.createdAt).toBeInstanceOf(Date);
    expect(createdInDb!.updatedAt).toBeInstanceOf(Date);

    // Small delay to ensure updatedAt differs
    await new Promise((r) => setTimeout(r, 50));

    const patchRes = await PATCH(makeIdReq(created.id, "PATCH", { title: "Updated timestamp" }), ctx(created.id));
    const updated = await patchRes.json();
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(new Date(created.updatedAt).getTime());

    // Verify updatedAt changed in DB too
    const updatedInDb = await prisma.task.findUnique({ where: { id: created.id } });
    expect(updatedInDb!.updatedAt.getTime()).toBeGreaterThan(createdInDb!.updatedAt.getTime());
    // createdAt should remain unchanged
    expect(updatedInDb!.createdAt.getTime()).toBe(createdInDb!.createdAt.getTime());
  });
});

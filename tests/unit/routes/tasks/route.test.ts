import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// --- Mocks ---
vi.mock("@/lib/permissions-server", () => ({
  getCurrentUser: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    task: { findMany: vi.fn(), create: vi.fn() },
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(),
  RATE_LIMITS: {
    taskRead: { prefix: "task-read", max: 60, windowSeconds: 60 },
    taskMutation: { prefix: "task-mut", max: 30, windowSeconds: 60 },
  },
}));
vi.mock("@/lib/company-validation", () => ({
  validateUserInCompany: vi.fn(),
}));

import { GET, POST } from "@/app/api/tasks/route";
import { getCurrentUser } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { validateUserInCompany } from "@/lib/company-validation";

// --- Fixtures ---
const adminUser = {
  id: 1,
  companyId: 100,
  name: "Admin",
  email: "admin@test.com",
  role: "admin" as const,
  allowedWriteTableIds: [] as number[],
  permissions: {},
};

const basicUserCanView = {
  id: 2,
  companyId: 100,
  name: "Viewer",
  email: "viewer@test.com",
  role: "basic" as const,
  allowedWriteTableIds: [] as number[],
  permissions: { canViewTasks: true } as Record<string, boolean>,
};

const basicUserCanCreate = {
  id: 4,
  companyId: 100,
  name: "Creator",
  email: "creator@test.com",
  role: "basic" as const,
  allowedWriteTableIds: [] as number[],
  permissions: { canViewTasks: true, canCreateTasks: true } as Record<string, boolean>,
};

const basicUserCanViewAll = {
  id: 5,
  companyId: 100,
  name: "ViewAll",
  email: "viewall@test.com",
  role: "basic" as const,
  allowedWriteTableIds: [] as number[],
  permissions: { canViewTasks: true, canViewAllTasks: true } as Record<string, boolean>,
};

const basicUserNoPerms = {
  id: 3,
  companyId: 100,
  name: "NoPerms",
  email: "none@test.com",
  role: "basic" as const,
  allowedWriteTableIds: [] as number[],
  permissions: {} as Record<string, boolean>,
};

function makeReq(method = "GET", body?: unknown) {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new NextRequest("http://localhost/api/tasks", init);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(checkRateLimit).mockResolvedValue(null);
  vi.mocked(validateUserInCompany).mockResolvedValue(true);
});

// ─── GET /api/tasks ──────────────────────────────────────────────────────
describe("GET /api/tasks", () => {
  it("returns 401 when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 403 when user lacks canViewTasks", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserNoPerms as any);
    const res = await GET(makeReq());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("returns rate-limited response when checkRateLimit fires", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const rl = NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
    vi.mocked(checkRateLimit).mockResolvedValue(rl);

    const res = await GET(makeReq());
    expect(res.status).toBe(429);
    expect(checkRateLimit).toHaveBeenCalledWith(String(adminUser.id), expect.objectContaining({ prefix: "task-read" }));
  });

  it("returns all company tasks for admin (no assigneeId filter)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const tasks = [{ id: "t1", title: "Task 1", status: "todo" }];
    vi.mocked(prisma.task.findMany).mockResolvedValue(tasks as any);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(tasks);
    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: 100 } }),
    );
  });

  it("returns all company tasks for non-admin with canViewAllTasks (no assigneeId filter)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserCanViewAll as any);
    vi.mocked(prisma.task.findMany).mockResolvedValue([]);

    await GET(makeReq());
    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: 100 } }),
    );
  });

  it("adds assigneeId filter for basic user without canViewAllTasks", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserCanView as any);
    vi.mocked(prisma.task.findMany).mockResolvedValue([]);

    await GET(makeReq());
    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: 100, assigneeId: 2 } }),
    );
  });

  it("always includes companyId in the query", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.task.findMany).mockResolvedValue([]);
    await GET(makeReq());
    const call = vi.mocked(prisma.task.findMany).mock.calls[0][0];
    expect(call?.where).toHaveProperty("companyId", 100);
  });

  it("selects the expected fields", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.task.findMany).mockResolvedValue([]);
    await GET(makeReq());
    const call = vi.mocked(prisma.task.findMany).mock.calls[0][0];
    expect(call?.select).toEqual(
      expect.objectContaining({ id: true, title: true, status: true, priority: true, tags: true }),
    );
  });

  it("returns 500 on DB error", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.task.findMany).mockRejectedValue(new Error("DB down"));

    const res = await GET(makeReq());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to fetch tasks" });
  });
});

// ─── POST /api/tasks ─────────────────────────────────────────────────────
describe("POST /api/tasks", () => {
  it("returns 401 when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await POST(makeReq("POST", { title: "T" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 403 when user lacks canCreateTasks", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserCanView as any);
    const res = await POST(makeReq("POST", { title: "T" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("returns rate-limited response", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(checkRateLimit).mockResolvedValue(
      NextResponse.json({ error: "Rate limited" }, { status: 429 }),
    );
    const res = await POST(makeReq("POST", { title: "T" }));
    expect(res.status).toBe(429);
    expect(checkRateLimit).toHaveBeenCalledWith(String(adminUser.id), expect.objectContaining({ prefix: "task-mut" }));
  });

  it("returns 400 for invalid JSON body", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const res = await POST(makeReq("POST", "not json{{{"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON body" });
  });

  it("returns 400 when title is empty", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const res = await POST(makeReq("POST", { title: "" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.details).toBeDefined();
  });

  it("returns 400 when title exceeds max length", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const res = await POST(makeReq("POST", { title: "a".repeat(201) }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
  });

  it("returns 400 for invalid status", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const res = await POST(makeReq("POST", { title: "OK", status: "banana" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
  });

  it("returns 400 for invalid priority", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const res = await POST(makeReq("POST", { title: "OK", priority: "ultra" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
  });

  it("returns 400 for invalid dueDate string", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const res = await POST(makeReq("POST", { title: "OK", dueDate: "not-a-date" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.details).toBeDefined();
  });

  it("returns 400 when assignee is from different company", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(validateUserInCompany).mockResolvedValue(false);

    const res = await POST(makeReq("POST", { title: "Valid", assigneeId: 999 }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid assignee" });
    expect(validateUserInCompany).toHaveBeenCalledWith(999, 100);
  });

  it("creates task with companyId & creatorId, returns 201", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const created = { id: "t1", title: "New", status: "todo" };
    vi.mocked(prisma.task.create).mockResolvedValue(created as any);

    const res = await POST(makeReq("POST", { title: "New" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(created);
    expect(prisma.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ companyId: 100, creatorId: 1, title: "New" }),
      }),
    );
  });

  it("creates task with only required fields and includes defaults", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.task.create).mockResolvedValue({ id: "t2" } as any);

    const res = await POST(makeReq("POST", { title: "Minimal" }));
    expect(res.status).toBe(201);
    expect(prisma.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          companyId: 100,
          creatorId: 1,
          title: "Minimal",
          status: "todo",
        }),
      }),
    );
  });

  it("allows basicUserCanCreate to create a task", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserCanCreate as any);
    vi.mocked(prisma.task.create).mockResolvedValue({ id: "t3", title: "Created" } as any);

    const res = await POST(makeReq("POST", { title: "Created" }));
    expect(res.status).toBe(201);
    expect(prisma.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ companyId: 100, creatorId: 4, title: "Created" }),
      }),
    );
  });

  it("does not call validateUserInCompany when no assigneeId provided", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.task.create).mockResolvedValue({ id: "t4" } as any);

    await POST(makeReq("POST", { title: "No Assignee" }));
    expect(validateUserInCompany).not.toHaveBeenCalled();
  });

  it("returns 500 on DB error", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.task.create).mockRejectedValue(new Error("DB"));

    const res = await POST(makeReq("POST", { title: "Fail" }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to create task" });
  });
});

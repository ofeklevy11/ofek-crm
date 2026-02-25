import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// --- Mocks ---
vi.mock("@/lib/permissions-server", () => ({
  getCurrentUser: vi.fn(),
}));

const mockTx = {
  task: { update: vi.fn() },
  auditLog: { create: vi.fn() },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    task: { findFirst: vi.fn(), deleteMany: vi.fn() },
    $transaction: vi.fn((fn: any) => fn(mockTx)),
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
vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: vi.fn() },
}));
vi.mock("@/app/actions/automations-core", () => ({
  processTaskStatusChange: vi.fn(),
}));

import { GET, PATCH, DELETE } from "@/app/api/tasks/[id]/route";
import { getCurrentUser } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { validateUserInCompany } from "@/lib/company-validation";
import { inngest } from "@/lib/inngest/client";

// --- Fixtures ---
const adminUser = {
  id: 1,
  companyId: 100,
  name: "Admin",
  email: "admin@test.com",
  role: "admin" as const,
  allowedWriteTableIds: [] as number[],
  permissions: {} as Record<string, boolean>,
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

const TASK_ID = "task-1";
const ctx = { params: Promise.resolve({ id: TASK_ID }) };

function makeReq(method = "GET", body?: unknown) {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new NextRequest(`http://localhost/api/tasks/${TASK_ID}`, init);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(checkRateLimit).mockResolvedValue(null);
  vi.mocked(validateUserInCompany).mockResolvedValue(true);
  // Reset $transaction to default pass-through
  vi.mocked(prisma.$transaction).mockImplementation((fn: any) => fn(mockTx));
});

// ─── GET /api/tasks/:id ──────────────────────────────────────────────────
describe("GET /api/tasks/:id", () => {
  it("returns 401 when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await GET(makeReq(), ctx);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 403 without canViewTasks", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserNoPerms as any);
    const res = await GET(makeReq(), ctx);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("returns rate-limited response", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(checkRateLimit).mockResolvedValue(
      NextResponse.json({ error: "RL" }, { status: 429 }),
    );
    const res = await GET(makeReq(), ctx);
    expect(res.status).toBe(429);
    expect(checkRateLimit).toHaveBeenCalledWith(String(adminUser.id), expect.objectContaining({ prefix: "task-read" }));
  });

  it("returns 404 when task not found", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.task.findFirst).mockResolvedValue(null);

    const res = await GET(makeReq(), ctx);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Task not found" });
  });

  it("returns task for admin (queried by id + companyId)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const task = { id: TASK_ID, title: "Task", assignee: { id: 2, name: "V" }, creator: { id: 1, name: "A" } };
    vi.mocked(prisma.task.findFirst).mockResolvedValue(task as any);

    const res = await GET(makeReq(), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(task);
    expect(prisma.task.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: TASK_ID, companyId: 100 } }),
    );
  });

  it("does not add assigneeId filter for non-admin with canViewAllTasks", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserCanViewAll as any);
    vi.mocked(prisma.task.findFirst).mockResolvedValue({ id: TASK_ID } as any);

    await GET(makeReq(), ctx);
    expect(prisma.task.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: TASK_ID, companyId: 100 } }),
    );
  });

  it("adds assigneeId filter for non-admin without canViewAllTasks", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserCanView as any);
    vi.mocked(prisma.task.findFirst).mockResolvedValue(null);

    await GET(makeReq(), ctx);
    expect(prisma.task.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: TASK_ID, companyId: 100, assigneeId: 2 } }),
    );
  });

  it("response includes assignee and creator relations", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.task.findFirst).mockResolvedValue({ id: TASK_ID } as any);

    await GET(makeReq(), ctx);
    const call = vi.mocked(prisma.task.findFirst).mock.calls[0][0];
    expect(call?.select).toHaveProperty("assignee");
    expect(call?.select).toHaveProperty("creator");
  });

  it("returns 500 on DB error", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.task.findFirst).mockRejectedValue(new Error("DB"));

    const res = await GET(makeReq(), ctx);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to fetch task" });
  });
});

// ─── PATCH /api/tasks/:id ────────────────────────────────────────────────
describe("PATCH /api/tasks/:id", () => {
  const existingTask = { id: TASK_ID, assigneeId: 1, status: "todo" };

  beforeEach(() => {
    // Default: existing task found, tx.task.update returns updated task
    vi.mocked(prisma.task.findFirst).mockResolvedValue(existingTask as any);
    mockTx.task.update.mockResolvedValue({ ...existingTask, title: "Updated" });
    mockTx.auditLog.create.mockResolvedValue({});
    vi.mocked(inngest.send).mockResolvedValue(undefined as any);
  });

  it("returns 401 when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await PATCH(makeReq("PATCH", { title: "X" }), ctx);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 403 without canViewTasks", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserNoPerms as any);
    const res = await PATCH(makeReq("PATCH", { title: "X" }), ctx);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("returns rate-limited response", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(checkRateLimit).mockResolvedValue(
      NextResponse.json({ error: "RL" }, { status: 429 }),
    );
    const res = await PATCH(makeReq("PATCH", { title: "X" }), ctx);
    expect(res.status).toBe(429);
    expect(checkRateLimit).toHaveBeenCalledWith(String(adminUser.id), expect.objectContaining({ prefix: "task-mut" }));
  });

  it("returns 400 for invalid JSON", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const res = await PATCH(makeReq("PATCH", "bad json{{"), ctx);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON body" });
  });

  it("returns 400 on Zod validation failure", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const res = await PATCH(makeReq("PATCH", { title: "" }), ctx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.details).toBeDefined();
  });

  it("returns 400 for invalid dueDate format", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const res = await PATCH(makeReq("PATCH", { dueDate: "not-a-date" }), ctx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.details).toBeDefined();
  });

  it("returns 400 when assignee is from different company", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(validateUserInCompany).mockResolvedValue(false);

    const res = await PATCH(makeReq("PATCH", { assigneeId: 999 }), ctx);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid assignee" });
  });

  it("assigneeId: null clears assignee without calling validateUserInCompany", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const updated = { id: TASK_ID, title: "T", status: "todo", assigneeId: null };
    mockTx.task.update.mockResolvedValue(updated);

    const res = await PATCH(makeReq("PATCH", { assigneeId: null }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(updated);
    expect(validateUserInCompany).not.toHaveBeenCalled();
    expect(mockTx.task.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ assigneeId: null }),
      }),
    );
  });

  it("returns 404 when existing task not found", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.task.findFirst).mockResolvedValue(null);

    const res = await PATCH(makeReq("PATCH", { title: "X" }), ctx);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Task not found" });
  });

  it("returns 403 when non-admin, non-assignee tries to edit", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserCanView as any); // id=2
    vi.mocked(prisma.task.findFirst).mockResolvedValue({ id: TASK_ID, assigneeId: 999, status: "todo" } as any);

    const res = await PATCH(makeReq("PATCH", { title: "X" }), ctx);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("allows assignee to edit their own task", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserCanView as any); // id=2
    vi.mocked(prisma.task.findFirst).mockResolvedValue({ id: TASK_ID, assigneeId: 2, status: "todo" } as any);
    const updated = { id: TASK_ID, title: "Edited by assignee", status: "todo" };
    mockTx.task.update.mockResolvedValue(updated);

    const res = await PATCH(makeReq("PATCH", { title: "Edited by assignee" }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(updated);
    expect(mockTx.task.update).toHaveBeenCalled();
  });

  it("allows non-admin with canViewAllTasks to edit a non-assigned task", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserCanViewAll as any); // id=5
    vi.mocked(prisma.task.findFirst).mockResolvedValue({ id: TASK_ID, assigneeId: 1, status: "todo" } as any);
    const updated = { id: TASK_ID, title: "Edited by viewAll user", status: "todo" };
    mockTx.task.update.mockResolvedValue(updated);

    const res = await PATCH(makeReq("PATCH", { title: "Edited by viewAll user" }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(updated);
    expect(mockTx.task.update).toHaveBeenCalled();
  });

  it("multi-field update (title + status): updates title and creates audit log", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.task.findFirst).mockResolvedValue({ id: TASK_ID, assigneeId: 1, status: "todo" } as any);
    const updated = { id: TASK_ID, title: "New Title", status: "done" };
    mockTx.task.update.mockResolvedValue(updated);

    const res = await PATCH(makeReq("PATCH", { title: "New Title", status: "done" }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(updated);

    // Title is in the update data
    expect(mockTx.task.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ title: "New Title", status: "done" }),
      }),
    );

    // Audit log created for status change
    expect(mockTx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        taskId: TASK_ID,
        action: "UPDATE",
        diffJson: { status: { from: "todo", to: "done" } },
      }),
    });
  });

  it("sends same status as existing: no audit log, no Inngest", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.task.findFirst).mockResolvedValue({ id: TASK_ID, assigneeId: 1, status: "todo" } as any);
    const updated = { id: TASK_ID, title: "T", status: "todo" };
    mockTx.task.update.mockResolvedValue(updated);

    const res = await PATCH(makeReq("PATCH", { status: "todo" }), ctx);
    expect(res.status).toBe(200);
    expect(mockTx.auditLog.create).not.toHaveBeenCalled();
    expect(inngest.send).not.toHaveBeenCalled();
  });

  it("tx.task.update receives where clause with id and companyId", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const updated = { id: TASK_ID, title: "Updated" };
    mockTx.task.update.mockResolvedValue(updated);

    await PATCH(makeReq("PATCH", { title: "Updated" }), ctx);
    expect(mockTx.task.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: TASK_ID, companyId: 100 },
      }),
    );
  });

  it("updates title (no status change): no audit log, no Inngest", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const updated = { id: TASK_ID, title: "New Title", status: "todo" };
    mockTx.task.update.mockResolvedValue(updated);

    const res = await PATCH(makeReq("PATCH", { title: "New Title" }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(updated);
    expect(mockTx.auditLog.create).not.toHaveBeenCalled();
    expect(inngest.send).not.toHaveBeenCalled();
  });

  it("status change: creates audit log in transaction and sends Inngest event", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const updated = { id: TASK_ID, title: "T", status: "done" };
    mockTx.task.update.mockResolvedValue(updated);

    const res = await PATCH(makeReq("PATCH", { status: "done" }), ctx);
    expect(res.status).toBe(200);

    // Audit log
    expect(mockTx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        taskId: TASK_ID,
        action: "UPDATE",
        companyId: 100,
        userId: 1,
        diffJson: { status: { from: "todo", to: "done" } },
      }),
    });

    // Inngest event
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "automation/task-status-change",
        data: expect.objectContaining({
          taskId: TASK_ID,
          taskTitle: "T",
          fromStatus: "todo",
          toStatus: "done",
          companyId: 100,
        }),
      }),
    );
  });

  it("falls back to processTaskStatusChange when Inngest fails", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const updated = { id: TASK_ID, title: "T", status: "done" };
    mockTx.task.update.mockResolvedValue(updated);
    vi.mocked(inngest.send).mockRejectedValue(new Error("Inngest down"));

    const res = await PATCH(makeReq("PATCH", { status: "done" }), ctx);
    expect(res.status).toBe(200);

    const { processTaskStatusChange } = await import("@/app/actions/automations-core");
    expect(processTaskStatusChange).toHaveBeenCalledWith(
      TASK_ID, "T", "todo", "done", 100,
    );
  });

  it("returns 200 even when both Inngest and processTaskStatusChange fail", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const updated = { id: TASK_ID, title: "T", status: "done" };
    mockTx.task.update.mockResolvedValue(updated);
    vi.mocked(inngest.send).mockRejectedValue(new Error("Inngest down"));
    const { processTaskStatusChange } = await import("@/app/actions/automations-core");
    vi.mocked(processTaskStatusChange).mockRejectedValue(new Error("Direct also failed"));

    const res = await PATCH(makeReq("PATCH", { status: "done" }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(updated);
  });

  it("returns 404 on Prisma P2025 error", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const p2025 = Object.assign(new Error("Not found"), { code: "P2025" });
    vi.mocked(prisma.$transaction).mockRejectedValue(p2025);

    const res = await PATCH(makeReq("PATCH", { title: "X" }), ctx);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Task not found" });
  });

  it("returns 500 on generic DB error", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.$transaction).mockRejectedValue(new Error("DB"));

    const res = await PATCH(makeReq("PATCH", { title: "X" }), ctx);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to update task" });
  });
});

// ─── DELETE /api/tasks/:id ───────────────────────────────────────────────
describe("DELETE /api/tasks/:id", () => {
  it("returns 401 when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await DELETE(makeReq("DELETE"), ctx);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 403 without canCreateTasks", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserCanView as any);
    const res = await DELETE(makeReq("DELETE"), ctx);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("returns rate-limited response", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(checkRateLimit).mockResolvedValue(
      NextResponse.json({ error: "RL" }, { status: 429 }),
    );
    const res = await DELETE(makeReq("DELETE"), ctx);
    expect(res.status).toBe(429);
    expect(checkRateLimit).toHaveBeenCalledWith(String(adminUser.id), expect.objectContaining({ prefix: "task-mut" }));
  });

  it("returns 404 when task not found (count=0)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.task.deleteMany).mockResolvedValue({ count: 0 } as any);

    const res = await DELETE(makeReq("DELETE"), ctx);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Task not found" });
  });

  it("deletes task scoped to companyId and returns success", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.task.deleteMany).mockResolvedValue({ count: 1 } as any);

    const res = await DELETE(makeReq("DELETE"), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(prisma.task.deleteMany).toHaveBeenCalledWith({
      where: { id: TASK_ID, companyId: 100 },
    });
  });

  it("returns 500 on DB error", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.task.deleteMany).mockRejectedValue(new Error("DB"));

    const res = await DELETE(makeReq("DELETE"), ctx);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to delete task" });
  });
});

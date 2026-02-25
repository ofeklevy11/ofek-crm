import { describe, it, expect, vi, beforeEach } from "vitest";

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
    task: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
    $transaction: vi.fn((fn: any) => fn(mockTx)),
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  checkActionRateLimit: vi.fn(),
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
vi.mock("@/lib/db-retry", () => ({
  withRetry: vi.fn((fn: any) => fn()),
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));
vi.mock("@/app/actions/automations-core", () => ({
  processTaskStatusChange: vi.fn(),
}));

import {
  getTasks,
  getDoneTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
} from "@/app/actions/tasks";
import { getCurrentUser } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { checkActionRateLimit } from "@/lib/rate-limit";
import { validateUserInCompany } from "@/lib/company-validation";
import { inngest } from "@/lib/inngest/client";
import { revalidatePath } from "next/cache";

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

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(checkActionRateLimit).mockResolvedValue(false);
  vi.mocked(validateUserInCompany).mockResolvedValue(true);
  vi.mocked(inngest.send).mockResolvedValue(undefined as any);
  vi.mocked(prisma.$transaction).mockImplementation((fn: any) => fn(mockTx));
  mockTx.task.update.mockReset();
  mockTx.auditLog.create.mockReset();
});

// ─── getTasks ────────────────────────────────────────────────────────────
describe("getTasks", () => {
  it("returns Unauthorized when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await getTasks();
    expect(res).toEqual({ success: false, error: "Unauthorized" });
  });

  it("returns Forbidden when user lacks canViewTasks", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserNoPerms as any);
    const res = await getTasks();
    expect(res).toEqual({ success: false, error: "Forbidden" });
  });

  it("returns rate limit error when rate limited", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(checkActionRateLimit).mockResolvedValue(true);
    const res = await getTasks();
    expect(res).toEqual({ success: false, error: "Rate limit exceeded. Please try again later." });
  });

  it("returns all company tasks for admin", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const tasks = [{ id: "t1" }];
    vi.mocked(prisma.task.findMany).mockResolvedValue(tasks as any);

    const res = await getTasks();
    expect(res).toEqual({ success: true, data: tasks });
    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: 100 } }),
    );
  });

  it("adds assigneeId filter for basic user without canViewAllTasks", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserCanView as any);
    vi.mocked(prisma.task.findMany).mockResolvedValue([]);

    await getTasks();
    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: 100, assigneeId: 2 } }),
    );
  });

  it("returns all company tasks for non-admin with canViewAllTasks (no assigneeId filter)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserCanViewAll as any);
    vi.mocked(prisma.task.findMany).mockResolvedValue([]);

    await getTasks();
    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: 100 } }),
    );
  });

  it("proceeds when checkActionRateLimit throws (fail-open)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(checkActionRateLimit).mockRejectedValue(new Error("Redis down"));
    vi.mocked(prisma.task.findMany).mockResolvedValue([{ id: "t1" }] as any);

    const res = await getTasks();
    expect(res).toEqual({ success: true, data: [{ id: "t1" }] });
  });

  it("returns error on DB failure", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.task.findMany).mockRejectedValue(new Error("DB"));

    const res = await getTasks();
    expect(res).toEqual({ success: false, error: "Failed to fetch tasks" });
  });
});

// ─── getDoneTasks ────────────────────────────────────────────────────────
describe("getDoneTasks", () => {
  it("fetches with statusFilter done, orderBy updatedAt, take 500", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.task.findMany).mockResolvedValue([]);

    await getDoneTasks();
    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "done" }),
        orderBy: { updatedAt: "desc" },
        take: 500,
      }),
    );
  });
});

// ─── getTaskById ─────────────────────────────────────────────────────────
describe("getTaskById", () => {
  it("returns Unauthorized when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await getTaskById("t1");
    expect(res).toEqual({ success: false, error: "Unauthorized" });
  });

  it("returns Forbidden when user lacks canViewTasks", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserNoPerms as any);
    const res = await getTaskById("t1");
    expect(res).toEqual({ success: false, error: "Forbidden" });
  });

  it("returns rate limit error", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(checkActionRateLimit).mockResolvedValue(true);
    const res = await getTaskById("t1");
    expect(res).toEqual({ success: false, error: "Rate limit exceeded. Please try again later." });
  });

  it("returns not found when task is null", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.task.findFirst).mockResolvedValue(null);

    const res = await getTaskById("t1");
    expect(res).toEqual({ success: false, error: "Task not found" });
  });

  it("returns task with visibility filter for non-admin", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserCanView as any);
    vi.mocked(prisma.task.findFirst).mockResolvedValue(null);

    await getTaskById("t1");
    expect(prisma.task.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "t1", companyId: 100, assigneeId: 2 } }),
    );
  });

  it("returns task for non-admin with canViewAllTasks (no assigneeId in where)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserCanViewAll as any); // id=5
    vi.mocked(prisma.task.findFirst).mockResolvedValue({ id: "t1", title: "Task" } as any);

    await getTaskById("t1");
    expect(prisma.task.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "t1", companyId: 100 } }),
    );
  });

  it("returns task on success", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const task = { id: "t1", title: "Task" };
    vi.mocked(prisma.task.findFirst).mockResolvedValue(task as any);

    const res = await getTaskById("t1");
    expect(res).toEqual({ success: true, data: task });
  });

  it("returns error on DB failure", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.task.findFirst).mockRejectedValue(new Error("DB"));

    const res = await getTaskById("t1");
    expect(res).toEqual({ success: false, error: "Failed to fetch task" });
  });
});

// ─── createTask ──────────────────────────────────────────────────────────
describe("createTask", () => {
  it("returns Unauthorized when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await createTask({ title: "T" });
    expect(res).toEqual({ success: false, error: "Unauthorized" });
  });

  it("returns Hebrew error when user lacks canCreateTasks", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserCanView as any);
    const res = await createTask({ title: "T" });
    expect(res).toEqual({ success: false, error: "אין לך הרשאה ליצור משימות" });
  });

  it("returns rate limit error", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(checkActionRateLimit).mockResolvedValue(true);
    const res = await createTask({ title: "T" });
    expect(res).toEqual({ success: false, error: "Rate limit exceeded. Please try again later." });
  });

  it("returns validation failure for empty title", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const res = await createTask({ title: "" });
    expect(res.success).toBe(false);
    expect(res.error).toBe("Validation failed");
  });

  it("returns error when assignee is from different company", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(validateUserInCompany).mockResolvedValue(false);
    const res = await createTask({ title: "T", assigneeId: 999 });
    expect(res).toEqual({ success: false, error: "Invalid assignee" });
  });

  it("creates task, revalidates paths, returns data", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const task = { id: "t1", title: "New" };
    vi.mocked(prisma.task.create).mockResolvedValue(task as any);

    const res = await createTask({ title: "New" });
    expect(res).toEqual({ success: true, data: task });
    expect(prisma.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ companyId: 100, creatorId: 1, title: "New" }),
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/tasks");
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("allows basicUserCanCreate to create a task", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserCanCreate as any);
    const task = { id: "t2", title: "Created" };
    vi.mocked(prisma.task.create).mockResolvedValue(task as any);

    const res = await createTask({ title: "Created" });
    expect(res).toEqual({ success: true, data: task });
    expect(prisma.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ companyId: 100, creatorId: 4, title: "Created" }),
      }),
    );
  });

  it("does not call validateUserInCompany when no assigneeId provided", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.task.create).mockResolvedValue({ id: "t3" } as any);

    await createTask({ title: "No Assignee" });
    expect(validateUserInCompany).not.toHaveBeenCalled();
  });

  it("proceeds when checkActionRateLimit throws (fail-open)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(checkActionRateLimit).mockRejectedValue(new Error("Redis down"));
    const task = { id: "t1", title: "Created" };
    vi.mocked(prisma.task.create).mockResolvedValue(task as any);

    const res = await createTask({ title: "Created" });
    expect(res).toEqual({ success: true, data: task });
  });

  it("returns error on DB failure", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.task.create).mockRejectedValue(new Error("DB"));
    const res = await createTask({ title: "T" });
    expect(res).toEqual({ success: false, error: "Failed to create task" });
  });
});

// ─── updateTask ──────────────────────────────────────────────────────────
describe("updateTask", () => {
  const existingTask = { id: "t1", assigneeId: 1, status: "todo" };

  beforeEach(() => {
    vi.mocked(prisma.task.findFirst).mockResolvedValue(existingTask as any);
    mockTx.task.update.mockResolvedValue({ ...existingTask, title: "Updated" });
    mockTx.auditLog.create.mockResolvedValue({});
  });

  it("returns Unauthorized when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await updateTask("t1", { title: "X" });
    expect(res).toEqual({ success: false, error: "Unauthorized" });
  });

  it("returns Forbidden when user lacks canViewTasks", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserNoPerms as any);
    const res = await updateTask("t1", { title: "X" });
    expect(res).toEqual({ success: false, error: "Forbidden" });
  });

  it("returns rate limit error", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(checkActionRateLimit).mockResolvedValue(true);
    const res = await updateTask("t1", { title: "X" });
    expect(res).toEqual({ success: false, error: "Rate limit exceeded. Please try again later." });
  });

  it("returns validation failure for empty title", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const res = await updateTask("t1", { title: "" });
    expect(res.success).toBe(false);
    expect(res.error).toBe("Validation failed");
  });

  it("returns validation failure for invalid dueDate format", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const res = await updateTask("t1", { dueDate: "not-a-date" });
    expect(res.success).toBe(false);
    expect(res.error).toBe("Validation failed");
  });

  it("returns not found when task does not exist", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.task.findFirst).mockResolvedValue(null);
    const res = await updateTask("t1", { title: "X" });
    expect(res).toEqual({ success: false, error: "Task not found" });
  });

  it("returns Hebrew error when non-admin non-assignee tries to edit", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserCanView as any); // id=2
    vi.mocked(prisma.task.findFirst).mockResolvedValue({ id: "t1", assigneeId: 999, status: "todo" } as any);

    const res = await updateTask("t1", { title: "X" });
    expect(res).toEqual({ success: false, error: "אין לך הרשאה לערוך משימה זו" });
  });

  it("allows assignee to edit their own task", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserCanView as any); // id=2
    vi.mocked(prisma.task.findFirst).mockResolvedValue({ id: "t1", assigneeId: 2, status: "todo" } as any);
    const updated = { id: "t1", title: "Edited by assignee", status: "todo" };
    mockTx.task.update.mockResolvedValue(updated);

    const res = await updateTask("t1", { title: "Edited by assignee" });
    expect(res).toEqual({ success: true, data: updated });
    expect(mockTx.task.update).toHaveBeenCalled();
  });

  it("allows non-admin with canViewAllTasks to edit a non-assigned task", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserCanViewAll as any); // id=5
    vi.mocked(prisma.task.findFirst).mockResolvedValue({ id: "t1", assigneeId: 1, status: "todo" } as any);
    const updated = { id: "t1", title: "Edited by viewAll user", status: "todo" };
    mockTx.task.update.mockResolvedValue(updated);

    const res = await updateTask("t1", { title: "Edited by viewAll user" });
    expect(res).toEqual({ success: true, data: updated });
    expect(mockTx.task.update).toHaveBeenCalled();
  });

  it("tx.task.update receives where clause with id and companyId", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const updated = { id: "t1", title: "Updated" };
    mockTx.task.update.mockResolvedValue(updated);

    await updateTask("t1", { title: "Updated" });
    expect(mockTx.task.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "t1", companyId: 100 },
      }),
    );
  });

  it("sends same status as existing: no audit log, no Inngest", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.task.findFirst).mockResolvedValue({ id: "t1", assigneeId: 1, status: "todo" } as any);
    const updated = { id: "t1", title: "T", status: "todo" };
    mockTx.task.update.mockResolvedValue(updated);

    const res = await updateTask("t1", { status: "todo" });
    expect(res.success).toBe(true);
    expect(mockTx.auditLog.create).not.toHaveBeenCalled();
    expect(inngest.send).not.toHaveBeenCalled();
  });

  it("returns error when assignee is from different company", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(validateUserInCompany).mockResolvedValue(false);
    const res = await updateTask("t1", { assigneeId: 999 });
    expect(res).toEqual({ success: false, error: "Invalid assignee" });
  });

  it("updates title (no status change): no audit log, no Inngest", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const updated = { id: "t1", title: "New", status: "todo" };
    mockTx.task.update.mockResolvedValue(updated);

    const res = await updateTask("t1", { title: "New" });
    expect(res).toEqual({ success: true, data: updated });
    expect(mockTx.auditLog.create).not.toHaveBeenCalled();
    expect(inngest.send).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/tasks");
  });

  it("status change: creates audit log and sends Inngest event", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const updated = { id: "t1", title: "T", status: "done" };
    mockTx.task.update.mockResolvedValue(updated);

    const res = await updateTask("t1", { status: "done" });
    expect(res.success).toBe(true);

    expect(mockTx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        taskId: "t1",
        action: "UPDATE",
        companyId: 100,
        userId: 1,
        diffJson: { status: { from: "todo", to: "done" } },
      }),
    });

    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "automation/task-status-change",
        data: expect.objectContaining({
          taskId: "t1",
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
    const updated = { id: "t1", title: "T", status: "done" };
    mockTx.task.update.mockResolvedValue(updated);
    vi.mocked(inngest.send).mockRejectedValue(new Error("Inngest down"));

    const res = await updateTask("t1", { status: "done" });
    expect(res.success).toBe(true);

    const { processTaskStatusChange } = await import("@/app/actions/automations-core");
    expect(processTaskStatusChange).toHaveBeenCalledWith("t1", "T", "todo", "done", 100);
  });

  it("returns success even when both Inngest and processTaskStatusChange fail", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const updated = { id: "t1", title: "T", status: "done" };
    mockTx.task.update.mockResolvedValue(updated);
    vi.mocked(inngest.send).mockRejectedValue(new Error("Inngest down"));
    const { processTaskStatusChange } = await import("@/app/actions/automations-core");
    vi.mocked(processTaskStatusChange).mockRejectedValue(new Error("Direct also failed"));

    const res = await updateTask("t1", { status: "done" });
    expect(res.success).toBe(true);
    expect(res.data).toEqual(updated);
  });

  it("revalidates paths after update", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    mockTx.task.update.mockResolvedValue({ id: "t1" });

    await updateTask("t1", { title: "X" });
    expect(revalidatePath).toHaveBeenCalledWith("/tasks");
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("proceeds when checkActionRateLimit throws (fail-open)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(checkActionRateLimit).mockRejectedValue(new Error("Redis down"));
    const updated = { id: "t1", title: "Updated", status: "todo" };
    mockTx.task.update.mockResolvedValue(updated);

    const res = await updateTask("t1", { title: "Updated" });
    expect(res).toEqual({ success: true, data: updated });
  });

  it("returns error on DB failure", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.$transaction).mockRejectedValue(new Error("DB"));

    const res = await updateTask("t1", { title: "X" });
    expect(res).toEqual({ success: false, error: "Failed to update task" });
  });
});

// ─── deleteTask ──────────────────────────────────────────────────────────
describe("deleteTask", () => {
  it("returns Unauthorized when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await deleteTask("t1");
    expect(res).toEqual({ success: false, error: "Unauthorized" });
  });

  it("returns Forbidden when user lacks canViewTasks", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserNoPerms as any);
    const res = await deleteTask("t1");
    expect(res).toEqual({ success: false, error: "Forbidden" });
  });

  it("returns Hebrew error when user lacks canCreateTasks", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUserCanView as any); // has canViewTasks but no canCreateTasks
    const res = await deleteTask("t1");
    expect(res).toEqual({ success: false, error: "אין לך הרשאה למחוק משימות" });
  });

  it("returns rate limit error", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(checkActionRateLimit).mockResolvedValue(true);
    const res = await deleteTask("t1");
    expect(res).toEqual({ success: false, error: "Rate limit exceeded. Please try again later." });
  });

  it("returns not found when count is 0", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.task.deleteMany).mockResolvedValue({ count: 0 } as any);

    const res = await deleteTask("t1");
    expect(res).toEqual({ success: false, error: "Task not found" });
  });

  it("deletes task scoped to companyId, revalidates, returns success", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.task.deleteMany).mockResolvedValue({ count: 1 } as any);

    const res = await deleteTask("t1");
    expect(res).toEqual({ success: true });
    expect(prisma.task.deleteMany).toHaveBeenCalledWith({
      where: { id: "t1", companyId: 100 },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/tasks");
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("proceeds when checkActionRateLimit throws (fail-open)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(checkActionRateLimit).mockRejectedValue(new Error("Redis down"));
    vi.mocked(prisma.task.deleteMany).mockResolvedValue({ count: 1 } as any);

    const res = await deleteTask("t1");
    expect(res).toEqual({ success: true });
  });

  it("returns error on DB failure", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.task.deleteMany).mockRejectedValue(new Error("DB"));

    const res = await deleteTask("t1");
    expect(res).toEqual({ success: false, error: "Failed to delete task" });
  });
});

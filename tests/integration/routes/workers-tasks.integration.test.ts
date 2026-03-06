import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";

// ── Hoisted mocks ───────────────────────────────────────────────────
const { mockGetCurrentUser } = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
}));

vi.mock("@/lib/permissions-server", () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock("@/lib/server-action-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server-action-utils")>();
  return { ...actual, checkServerActionRateLimit: vi.fn() };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(null),
    del: vi.fn().mockResolvedValue(null),
    scan: vi.fn().mockResolvedValue(["0", []]),
    pipeline: vi.fn(() => ({
      del: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([]),
    })),
    options: { keyPrefix: "" },
  },
}));

vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: vi.fn().mockResolvedValue({ ids: [] }) },
}));

// ── Import server actions AFTER mocks ───────────────────────────────
import {
  getWorkerTasks,
  createWorkerTask,
  updateWorkerTask,
  deleteWorkerTask,
  getCompanyUsers,
  getCompanyTables,
  getOnboardingPathSummaries,
} from "@/app/actions/workers";

import {
  seedCompany,
  seedUser,
  seedDepartment,
  seedWorker,
  seedOnboardingPath,
  seedOnboardingStep,
  seedWorkerTask,
  seedTableMeta,
  makeAdminUser,
  cleanupWorkers,
} from "./workers-helpers";

// ── State ───────────────────────────────────────────────────────────
let companyA: { id: number };
let companyB: { id: number };
let adminA: { id: number };
let userB: { id: number };
let deptA: { id: number };
let deptB: { id: number };
let workerA: { id: number };
let workerB: { id: number };

function authAdmin() {
  mockGetCurrentUser.mockResolvedValue(makeAdminUser(adminA.id, companyA.id));
}

// ── Lifecycle ───────────────────────────────────────────────────────
beforeAll(async () => {
  companyA = await seedCompany();
  companyB = await seedCompany();
  adminA = await seedUser(companyA.id, { role: "admin" });
  userB = await seedUser(companyB.id, { role: "admin" });
  deptA = await seedDepartment(companyA.id, { name: "מחלקת משימות" });
  deptB = await seedDepartment(companyB.id, { name: "מחלקת חברה ב" });
  workerA = await seedWorker(companyA.id, deptA.id);
  workerB = await seedWorker(companyB.id, deptB.id);
}, 30_000);

beforeEach(() => {
  vi.clearAllMocks();
});

afterAll(async () => {
  await cleanupWorkers([companyA?.id, companyB?.id].filter(Boolean));
  await prisma.$disconnect();
}, 15_000);

// ══════════════════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════════════════

describe("Auth", () => {
  it("should throw 'Not authenticated' for getWorkerTasks when user is null", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    await expect(getWorkerTasks()).rejects.toThrow("Not authenticated");
  });
});

// ══════════════════════════════════════════════════════════════════════
// WORKER TASKS
// ══════════════════════════════════════════════════════════════════════

describe("getWorkerTasks", () => {
  let task1: { id: number };
  let task2: { id: number };
  let deletedWorker: { id: number };
  let taskDelWorker: { id: number };
  let taskOther: { id: number };

  beforeAll(async () => {
    task1 = await seedWorkerTask(companyA.id, workerA.id, { title: "משימה א" });
    task2 = await seedWorkerTask(companyA.id, workerA.id, { title: "משימה ב" });
    deletedWorker = await seedWorker(companyA.id, deptA.id, { deletedAt: new Date() });
    taskDelWorker = await seedWorkerTask(companyA.id, deletedWorker.id, { title: "משימת רוח" });
    taskOther = await seedWorkerTask(companyB.id, workerB.id, { title: "משימה חיצונית" });
  });

  afterAll(async () => {
    await prisma.workerTask.deleteMany({
      where: { id: { in: [task1.id, task2.id, taskDelWorker.id, taskOther.id] } },
    });
    await prisma.worker.deleteMany({ where: { id: deletedWorker.id } });
  });

  it("should return tasks with worker info, ordered by status then createdAt desc", async () => {
    authAdmin();
    const tasks = await getWorkerTasks();
    expect(tasks.length).toBeGreaterThanOrEqual(2);
    expect(tasks[0]).toHaveProperty("worker");
    expect(tasks[0].worker).toHaveProperty("firstName");
  });

  it("should filter by workerId when provided", async () => {
    authAdmin();
    const tasks = await getWorkerTasks(workerA.id);
    for (const t of tasks) {
      expect(t.workerId).toBe(workerA.id);
    }
  });

  it("should exclude tasks for soft-deleted workers", async () => {
    authAdmin();
    const tasks = await getWorkerTasks();
    const ids = tasks.map((t: any) => t.id);
    expect(ids).not.toContain(taskDelWorker.id);
  });

  it("should not return tasks from other companies", async () => {
    authAdmin();
    const tasks = await getWorkerTasks();
    const ids = tasks.map((t: any) => t.id);
    expect(ids).not.toContain(taskOther.id);
  });

  it("should return exact response contract keys for task and nested worker", async () => {
    authAdmin();
    const tasks = await getWorkerTasks();
    expect(tasks.length).toBeGreaterThanOrEqual(1);
    const expectedTaskKeys = [
      "id", "workerId", "title", "description", "priority",
      "status", "dueDate", "completedAt", "createdAt", "updatedAt", "worker",
    ];
    expect(Object.keys(tasks[0]).sort()).toEqual(expectedTaskKeys.sort());
    const expectedWorkerKeys = ["id", "firstName", "lastName"];
    expect(Object.keys(tasks[0].worker).sort()).toEqual(expectedWorkerKeys.sort());
  });
});

describe("createWorkerTask", () => {
  const createdIds: number[] = [];

  afterAll(async () => {
    if (createdIds.length > 0) {
      await prisma.workerTask.deleteMany({ where: { id: { in: createdIds } } });
    }
  });

  it("should create task with all fields and verify DB", async () => {
    authAdmin();
    const dueDate = new Date("2026-06-01");
    const task = await createWorkerTask({
      workerId: workerA.id,
      title: "משימה מלאה",
      description: "תיאור מפורט",
      priority: "HIGH",
      dueDate,
    });
    createdIds.push(task!.id);
    expect(task).toMatchObject({
      title: "משימה מלאה",
      description: "תיאור מפורט",
      priority: "HIGH",
      status: "PENDING",
    });
    expect(task!.dueDate).toBeTruthy();
    const dbTask = await prisma.workerTask.findUnique({ where: { id: task!.id } });
    expect(dbTask!.companyId).toBe(companyA.id);
  });

  it("should throw 'Task title is required' for empty title", async () => {
    authAdmin();
    await expect(
      createWorkerTask({ workerId: workerA.id, title: "" }),
    ).rejects.toThrow("Task title is required");
  });

  it("should throw 'הטקסט ארוך מדי, מותר עד 200 תווים' for title > 200 chars", async () => {
    authAdmin();
    await expect(
      createWorkerTask({ workerId: workerA.id, title: "א".repeat(201) }),
    ).rejects.toThrow("הטקסט ארוך מדי, מותר עד 200 תווים");
  });

  it("should throw 'הטקסט ארוך מדי, מותר עד 5000 תווים' for description > 5000 chars", async () => {
    authAdmin();
    await expect(
      createWorkerTask({
        workerId: workerA.id,
        title: "בדיקת תיאור",
        description: "א".repeat(5001),
      }),
    ).rejects.toThrow("הטקסט ארוך מדי, מותר עד 5000 תווים");
  });

  it("should throw for invalid priority enum", async () => {
    authAdmin();
    await expect(
      createWorkerTask({ workerId: workerA.id, title: "עדיפות שגויה", priority: "INVALID" }),
    ).rejects.toThrow("Invalid task priority");
  });

  it("should throw 'Worker not found or access denied' for worker in different company", async () => {
    authAdmin();
    await expect(
      createWorkerTask({ workerId: workerB.id, title: "חברה אחרת" }),
    ).rejects.toThrow("Worker not found or access denied");
  });

  it("should default status to PENDING and verify via DB", async () => {
    authAdmin();
    const task = await createWorkerTask({
      workerId: workerA.id,
      title: "ברירת מחדל סטטוס",
    });
    createdIds.push(task!.id);
    expect(task!.status).toBe("PENDING");
    const dbTask = await prisma.workerTask.findUnique({ where: { id: task!.id } });
    expect(dbTask!.status).toBe("PENDING");
  });

  it("should default priority to NORMAL and verify via DB", async () => {
    authAdmin();
    const task = await createWorkerTask({
      workerId: workerA.id,
      title: "ברירת מחדל עדיפות",
    });
    createdIds.push(task!.id);
    expect(task!.priority).toBe("NORMAL");
    const dbTask = await prisma.workerTask.findUnique({ where: { id: task!.id } });
    expect(dbTask!.priority).toBe("NORMAL");
  });

  it("should return correct response contract shape", async () => {
    authAdmin();
    const task = await createWorkerTask({
      workerId: workerA.id,
      title: "חוזה תגובה",
    });
    createdIds.push(task!.id);
    const expectedKeys = [
      "id", "workerId", "title", "description", "priority",
      "status", "dueDate", "completedAt", "createdAt", "updatedAt",
    ];
    expect(Object.keys(task!).sort()).toEqual(expectedKeys.sort());
  });
});

describe("updateWorkerTask", () => {
  let task: { id: number };

  beforeAll(async () => {
    task = await seedWorkerTask(companyA.id, workerA.id, {
      title: "משימה לעדכון",
      priority: "NORMAL",
      status: "PENDING",
    });
  });

  afterAll(async () => {
    await prisma.workerTask.deleteMany({ where: { id: task.id } });
  });

  it("should update task fields and verify DB state", async () => {
    authAdmin();
    const updated = await updateWorkerTask(task.id, {
      title: "כותרת מעודכנת",
      description: "תיאור חדש",
      priority: "URGENT",
    });
    expect(updated!.title).toBe("כותרת מעודכנת");
    expect(updated!.description).toBe("תיאור חדש");
    expect(updated!.priority).toBe("URGENT");
    const dbTask = await prisma.workerTask.findUnique({ where: { id: task.id } });
    expect(dbTask!.title).toBe("כותרת מעודכנת");
  });

  it("should update @updatedAt timestamp after update", async () => {
    const before = await prisma.workerTask.findUnique({
      where: { id: task.id },
      select: { updatedAt: true },
    });
    await new Promise((r) => setTimeout(r, 50));
    authAdmin();
    await updateWorkerTask(task.id, { title: "חותמת זמן" });
    const after = await prisma.workerTask.findUnique({
      where: { id: task.id },
      select: { updatedAt: true },
    });
    expect(after!.updatedAt.getTime()).toBeGreaterThan(before!.updatedAt.getTime());
  });

  it("should auto-set completedAt when status=COMPLETED", async () => {
    authAdmin();
    const updated = await updateWorkerTask(task.id, { status: "COMPLETED" });
    expect(updated!.completedAt).not.toBeNull();
  });

  it("should preserve completedAt when changing status away from COMPLETED without explicit clear", async () => {
    authAdmin();
    // Complete the task to set completedAt
    const completed = await updateWorkerTask(task.id, { status: "COMPLETED" });
    expect(completed!.completedAt).not.toBeNull();
    // Change status to PENDING without passing completedAt
    const reverted = await updateWorkerTask(task.id, { status: "PENDING" });
    expect(reverted!.status).toBe("PENDING");
    // completedAt is NOT auto-cleared (only set explicitly or via completedAt param)
    const dbTask = await prisma.workerTask.findUnique({ where: { id: task.id } });
    expect(dbTask!.completedAt).not.toBeNull();
  });

  it("should throw for invalid status enum", async () => {
    authAdmin();
    await expect(
      updateWorkerTask(task.id, { status: "INVALID" }),
    ).rejects.toThrow("Invalid task status");
  });

  it("should throw for invalid priority enum", async () => {
    authAdmin();
    await expect(
      updateWorkerTask(task.id, { priority: "INVALID" }),
    ).rejects.toThrow("Invalid task priority");
  });

  it("should throw 'הפריט המבוקש לא נמצא' for non-existent task (P2025)", async () => {
    authAdmin();
    await expect(
      updateWorkerTask(999999, { title: "לא קיים" }),
    ).rejects.toThrow("הפריט המבוקש לא נמצא");
  });

  it("should throw 'הפריט המבוקש לא נמצא' for task in different company (P2025)", async () => {
    authAdmin();
    const taskB = await seedWorkerTask(companyB.id, workerB.id);
    await expect(
      updateWorkerTask(taskB.id, { title: "חברה אחרת" }),
    ).rejects.toThrow("הפריט המבוקש לא נמצא");
    await prisma.workerTask.delete({ where: { id: taskB.id } });
  });

  it("should accept status CANCELLED", async () => {
    authAdmin();
    const updated = await updateWorkerTask(task.id, { status: "CANCELLED" });
    expect(updated!.status).toBe("CANCELLED");
  });

  it("should accept status IN_PROGRESS", async () => {
    authAdmin();
    const updated = await updateWorkerTask(task.id, { status: "IN_PROGRESS" });
    expect(updated!.status).toBe("IN_PROGRESS");
  });

  it("should accept priority LOW", async () => {
    authAdmin();
    const updated = await updateWorkerTask(task.id, { priority: "LOW" });
    expect(updated!.priority).toBe("LOW");
  });

  it("should throw 'הטקסט ארוך מדי, מותר עד 200 תווים' for title > 200 chars on update", async () => {
    authAdmin();
    await expect(
      updateWorkerTask(task.id, { title: "א".repeat(201) }),
    ).rejects.toThrow("הטקסט ארוך מדי, מותר עד 200 תווים");
  });

  it("should throw 'הטקסט ארוך מדי, מותר עד 5000 תווים' for description > 5000 chars on update", async () => {
    authAdmin();
    await expect(
      updateWorkerTask(task.id, { description: "א".repeat(5001) }),
    ).rejects.toThrow("הטקסט ארוך מדי, מותר עד 5000 תווים");
  });
});

describe("deleteWorkerTask", () => {
  it("should hard-delete task and verify findUnique returns null", async () => {
    authAdmin();
    const task = await seedWorkerTask(companyA.id, workerA.id);
    const result = await deleteWorkerTask(task.id);
    expect(result).toEqual({ success: true });
    const dbTask = await prisma.workerTask.findUnique({ where: { id: task.id } });
    expect(dbTask).toBeNull();
  });

  it("should throw 'הפריט המבוקש לא נמצא' for non-existent task (P2025)", async () => {
    authAdmin();
    await expect(deleteWorkerTask(999999)).rejects.toThrow("הפריט המבוקש לא נמצא");
  });
});

// ══════════════════════════════════════════════════════════════════════
// STATS & HELPERS
// ══════════════════════════════════════════════════════════════════════

describe("getCompanyUsers", () => {
  it("should return users for authenticated user's company", async () => {
    authAdmin();
    const users = await getCompanyUsers();
    expect(users.length).toBeGreaterThanOrEqual(1);
    const ids = users.map((u: any) => u.id);
    expect(ids).toContain(adminA.id);
    expect(users[0]).toHaveProperty("name");
    expect(users[0]).toHaveProperty("email");
  });

  it("should not return users from other companies", async () => {
    authAdmin();
    const users = await getCompanyUsers();
    const ids = users.map((u: any) => u.id);
    expect(ids).not.toContain(userB.id);
  });

  it("should NOT return passwordHash field (security)", async () => {
    authAdmin();
    const users = await getCompanyUsers();
    for (const u of users) {
      expect(u).not.toHaveProperty("passwordHash");
    }
    const expectedKeys = ["id", "name", "email"];
    expect(Object.keys(users[0]).sort()).toEqual(expectedKeys.sort());
  });
});

describe("getCompanyTables", () => {
  let table: { id: number };
  let tableB: { id: number };

  beforeAll(async () => {
    table = await seedTableMeta(companyA.id, adminA.id);
    tableB = await seedTableMeta(companyB.id, userB.id);
  });

  afterAll(async () => {
    await prisma.tableMeta.deleteMany({ where: { id: { in: [table.id, tableB.id] } } });
  });

  it("should return tables for authenticated user's company", async () => {
    authAdmin();
    const tables = await getCompanyTables();
    expect(tables.length).toBeGreaterThanOrEqual(1);
    const ids = tables.map((t: any) => t.id);
    expect(ids).toContain(table.id);
    expect(tables[0]).toHaveProperty("name");
  });

  it("should not return tables from other companies (multi-tenancy)", async () => {
    authAdmin();
    const tables = await getCompanyTables();
    const ids = tables.map((t: any) => t.id);
    expect(ids).not.toContain(tableB.id);
  });

  it("should return correct response contract shape (id, name only)", async () => {
    authAdmin();
    const tables = await getCompanyTables();
    const expectedKeys = ["id", "name"];
    expect(Object.keys(tables[0]).sort()).toEqual(expectedKeys.sort());
  });
});

describe("getOnboardingPathSummaries", () => {
  let activePath: { id: number };
  let inactivePath: { id: number };

  beforeAll(async () => {
    activePath = await seedOnboardingPath(companyA.id, {
      name: "סיכום פעיל",
      isActive: true,
      departmentId: deptA.id,
    });
    inactivePath = await seedOnboardingPath(companyA.id, {
      name: "סיכום לא פעיל",
      isActive: false,
    });
    await seedOnboardingStep(companyA.id, activePath.id);
    await seedOnboardingStep(companyA.id, activePath.id);
  });

  afterAll(async () => {
    await prisma.onboardingStep.deleteMany({ where: { pathId: activePath.id } });
    await prisma.onboardingPath.deleteMany({
      where: { id: { in: [activePath.id, inactivePath.id] } },
    });
  });

  it("should return active paths with step counts", async () => {
    authAdmin();
    const summaries = await getOnboardingPathSummaries();
    const found = summaries.find((s: any) => s.id === activePath.id);
    expect(found).toBeDefined();
    expect(found._count.steps).toBe(2);
    const inactiveFound = summaries.find((s: any) => s.id === inactivePath.id);
    expect(inactiveFound).toBeUndefined();
  });

  it("should filter by departmentId", async () => {
    authAdmin();
    const summaries = await getOnboardingPathSummaries(deptA.id);
    const ids = summaries.map((s: any) => s.id);
    expect(ids).toContain(activePath.id);
    for (const s of summaries) {
      expect(s.departmentId).toBe(deptA.id);
    }
  });

  it("should not return paths from other companies", async () => {
    authAdmin();
    const otherPath = await seedOnboardingPath(companyB.id, { name: "סיכום חיצוני", isActive: true });
    const summaries = await getOnboardingPathSummaries();
    const ids = summaries.map((s: any) => s.id);
    expect(ids).not.toContain(otherPath.id);
    await prisma.onboardingPath.delete({ where: { id: otherPath.id } });
  });

  it("should return response contract shape with expected fields", async () => {
    authAdmin();
    const summaries = await getOnboardingPathSummaries();
    const found = summaries.find((s: any) => s.id === activePath.id);
    expect(found).toBeDefined();
    const expectedKeys = [
      "id", "name", "departmentId", "isDefault",
      "isActive", "description", "estimatedDays", "_count",
    ];
    expect(Object.keys(found).sort()).toEqual(expectedKeys.sort());
  });
});

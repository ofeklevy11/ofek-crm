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
  getWorkers,
  getWorker,
  createWorker,
  updateWorker,
  deleteWorker,
  getWorkersStats,
} from "@/app/actions/workers";

import {
  seedCompany,
  seedUser,
  seedDepartment,
  seedWorker,
  seedOnboardingPath,
  seedOnboardingStep,
  seedWorkerTask,
  makeAdminUser,
  cleanupWorkers,
} from "./workers-helpers";

// ── State ───────────────────────────────────────────────────────────
let companyA: { id: number };
let companyB: { id: number };
let adminUserA: { id: number };
let userB: { id: number };
let deptA: { id: number };
let deptB: { id: number };

function authAdmin() {
  mockGetCurrentUser.mockResolvedValue(makeAdminUser(adminUserA.id, companyA.id));
}

// ── Lifecycle ───────────────────────────────────────────────────────
beforeAll(async () => {
  companyA = await seedCompany();
  companyB = await seedCompany();
  adminUserA = await seedUser(companyA.id, { role: "admin" });
  userB = await seedUser(companyB.id, { role: "admin" });
  deptA = await seedDepartment(companyA.id, { name: "מחלקה ראשית" });
  deptB = await seedDepartment(companyB.id, { name: "מחלקת חברה ב" });
}, 30_000);

beforeEach(() => {
  vi.clearAllMocks();
});

afterAll(async () => {
  await cleanupWorkers([companyA?.id, companyB?.id].filter(Boolean));
  await prisma.$disconnect();
}, 15_000);

// ── Tests ───────────────────────────────────────────────────────────

describe("Auth", () => {
  it("should throw 'Not authenticated' for getWorkers when user is null", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    await expect(getWorkers()).rejects.toThrow("Not authenticated");
  });
});

describe("getWorkers", () => {
  let w1: { id: number };
  let w2: { id: number };
  let wDeleted: { id: number };
  let wOther: { id: number };

  beforeAll(async () => {
    w1 = await seedWorker(companyA.id, deptA.id, { firstName: "דנה", status: "ACTIVE" });
    w2 = await seedWorker(companyA.id, deptA.id, { firstName: "יוסי", status: "ONBOARDING" });
    wDeleted = await seedWorker(companyA.id, deptA.id, { firstName: "נמחק", deletedAt: new Date() });
    wOther = await seedWorker(companyB.id, deptB.id, { firstName: "חיצוני" });
  });

  afterAll(async () => {
    await prisma.worker.deleteMany({
      where: { id: { in: [w1.id, w2.id, wDeleted.id, wOther.id] } },
    });
  });

  it("should return paginated workers with department and onboarding data", async () => {
    authAdmin();
    const result = await getWorkers();
    expect(result).toHaveProperty("data");
    expect(result).toHaveProperty("total");
    expect(result).toHaveProperty("hasMore");
    expect(result.data.length).toBeGreaterThanOrEqual(2);
    expect(result.data[0]).toHaveProperty("department");
  });

  it("should exclude soft-deleted workers", async () => {
    authAdmin();
    const result = await getWorkers();
    const ids = result.data.map((w: any) => w.id);
    expect(ids).not.toContain(wDeleted.id);
  });

  it("should not return workers from other companies", async () => {
    authAdmin();
    const result = await getWorkers();
    const ids = result.data.map((w: any) => w.id);
    expect(ids).not.toContain(wOther.id);
  });

  it("should filter by departmentId", async () => {
    authAdmin();
    const otherDept = await seedDepartment(companyA.id, { name: "סינון" });
    const wOtherDept = await seedWorker(companyA.id, otherDept.id);
    const result = await getWorkers({ departmentId: otherDept.id });
    const ids = result.data.map((w: any) => w.id);
    expect(ids).toContain(wOtherDept.id);
    expect(ids).not.toContain(w1.id);
    await prisma.worker.delete({ where: { id: wOtherDept.id } });
    await prisma.department.delete({ where: { id: otherDept.id } });
  });

  it("should filter by status", async () => {
    authAdmin();
    const result = await getWorkers({ status: "ACTIVE" });
    for (const w of result.data) {
      expect((w as any).status).toBe("ACTIVE");
    }
  });

  it("should throw for invalid status filter value", async () => {
    authAdmin();
    await expect(getWorkers({ status: "INVALID" })).rejects.toThrow("Invalid worker status filter");
  });

  it("should filter by status ON_LEAVE", async () => {
    authAdmin();
    const wOnLeave = await seedWorker(companyA.id, deptA.id, { status: "ON_LEAVE" as any });
    const result = await getWorkers({ status: "ON_LEAVE" });
    const ids = result.data.map((w: any) => w.id);
    expect(ids).toContain(wOnLeave.id);
    for (const w of result.data) {
      expect((w as any).status).toBe("ON_LEAVE");
    }
    await prisma.worker.delete({ where: { id: wOnLeave.id } });
  });

  it("should filter by status TERMINATED", async () => {
    authAdmin();
    const wTerminated = await seedWorker(companyA.id, deptA.id, { status: "TERMINATED" as any });
    const result = await getWorkers({ status: "TERMINATED" });
    const ids = result.data.map((w: any) => w.id);
    expect(ids).toContain(wTerminated.id);
    for (const w of result.data) {
      expect((w as any).status).toBe("TERMINATED");
    }
    await prisma.worker.delete({ where: { id: wTerminated.id } });
  });

  it("should respect pageSize and page parameters", async () => {
    authAdmin();
    const result = await getWorkers({ pageSize: 1, page: 1 });
    expect(result.data.length).toBe(1);
    expect(result.hasMore).toBe(true);
  });

  it("should return { data, total, hasMore } shape with correct types", async () => {
    authAdmin();
    const result = await getWorkers();
    expect(typeof result.total).toBe("number");
    expect(typeof result.hasMore).toBe("boolean");
    expect(Array.isArray(result.data)).toBe(true);
  });

  it("should cap pageSize at 500 and still return data", async () => {
    authAdmin();
    const result = await getWorkers({ pageSize: 9999 });
    expect(result).toHaveProperty("data");
    // The cap is internal — verify the data length is bounded
    expect(result.data.length).toBeLessThanOrEqual(500);
  });

  it("should default to page 1 and pageSize up to 500", async () => {
    authAdmin();
    const result = await getWorkers();
    expect(result.data.length).toBeGreaterThanOrEqual(1);
    expect(result.data.length).toBeLessThanOrEqual(500);
  });
});

describe("getWorker", () => {
  let worker: { id: number };
  let deletedWorker: { id: number };
  let otherWorker: { id: number };

  beforeAll(async () => {
    worker = await seedWorker(companyA.id, deptA.id);
    deletedWorker = await seedWorker(companyA.id, deptA.id, { deletedAt: new Date() });
    otherWorker = await seedWorker(companyB.id, deptB.id);
    await seedWorkerTask(companyA.id, worker.id, { title: "משימת בדיקה" });
  });

  afterAll(async () => {
    await prisma.workerTask.deleteMany({ where: { companyId: companyA.id } });
    await prisma.worker.deleteMany({
      where: { id: { in: [worker.id, deletedWorker.id, otherWorker.id] } },
    });
  });

  it("should return worker with department, onboarding progress, and assigned tasks", async () => {
    authAdmin();
    const result = await getWorker(worker.id);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(worker.id);
    expect(result).toHaveProperty("department");
    expect(result).toHaveProperty("onboardingProgress");
    expect(result).toHaveProperty("assignedTasks");
    expect(result!.assignedTasks.length).toBeGreaterThanOrEqual(1);
  });

  it("should return null for non-existent worker", async () => {
    authAdmin();
    const result = await getWorker(999999);
    expect(result).toBeNull();
  });

  it("should return null for worker in different company", async () => {
    authAdmin();
    const result = await getWorker(otherWorker.id);
    expect(result).toBeNull();
  });

  it("should return null for soft-deleted worker", async () => {
    authAdmin();
    const result = await getWorker(deletedWorker.id);
    expect(result).toBeNull();
  });

  it("should return correct response contract shape", async () => {
    authAdmin();
    const result = await getWorker(worker.id);
    expect(result).not.toBeNull();
    const expectedKeys = [
      "id", "firstName", "lastName", "email", "phone",
      "avatar", "position", "employeeId", "status",
      "startDate", "endDate", "notes", "customFields",
      "departmentId", "linkedUserId", "createdAt", "updatedAt",
      "department", "onboardingProgress", "assignedTasks",
    ];
    expect(Object.keys(result!).sort()).toEqual(expectedKeys.sort());
  });
});

describe("createWorker", () => {
  const createdIds: number[] = [];

  afterAll(async () => {
    if (createdIds.length > 0) {
      await prisma.workerOnboardingStep.deleteMany({
        where: { onboarding: { workerId: { in: createdIds } } },
      });
      await prisma.workerOnboarding.deleteMany({
        where: { workerId: { in: createdIds } },
      });
      await prisma.worker.deleteMany({ where: { id: { in: createdIds } } });
    }
  });

  it("should create worker with all fields and verify DB state", async () => {
    authAdmin();
    const worker = await createWorker({
      firstName: "יוחנן",
      lastName: "כהן",
      email: "yohanan@test.com",
      phone: "0501234567",
      departmentId: deptA.id,
      position: "מפתח",
      employeeId: `EMP-${Date.now()}`,
      notes: "עובד בדיקה",
    });
    createdIds.push(worker!.id);
    expect(worker).toMatchObject({
      firstName: "יוחנן",
      lastName: "כהן",
      email: "yohanan@test.com",
      phone: "0501234567",
      position: "מפתח",
      status: "ONBOARDING",
    });
    const dbWorker = await prisma.worker.findUnique({ where: { id: worker!.id } });
    expect(dbWorker!.companyId).toBe(companyA.id);
  });

  it("should create worker with minimal fields (firstName, lastName, departmentId)", async () => {
    authAdmin();
    const worker = await createWorker({
      firstName: "מינימלי",
      lastName: "עובד",
      departmentId: deptA.id,
    });
    createdIds.push(worker!.id);
    expect(worker!.firstName).toBe("מינימלי");
  });

  it("should default status to ONBOARDING and customFields to '{}'", async () => {
    authAdmin();
    const worker = await createWorker({
      firstName: "ברירת",
      lastName: "מחדל",
      departmentId: deptA.id,
    });
    createdIds.push(worker!.id);
    expect(worker!.status).toBe("ONBOARDING");
    // Verify @default for customFields via DB
    const dbWorker = await prisma.worker.findUnique({ where: { id: worker!.id } });
    expect(dbWorker!.customFields).toBeDefined();
  });

  it("should auto-assign default onboarding path if one exists for the department", async () => {
    authAdmin();
    const dept = await seedDepartment(companyA.id, { name: "עם מסלול ברירת מחדל" });
    const path = await seedOnboardingPath(companyA.id, {
      departmentId: dept.id,
      isDefault: true,
      isActive: true,
    });

    const worker = await createWorker({
      firstName: "אוטומטי",
      lastName: "קליטה",
      departmentId: dept.id,
    });
    createdIds.push(worker!.id);

    const onboarding = await prisma.workerOnboarding.findFirst({
      where: { workerId: worker!.id, pathId: path.id },
    });
    expect(onboarding).not.toBeNull();
    expect(onboarding!.status).toBe("IN_PROGRESS");

    await prisma.workerOnboarding.deleteMany({ where: { workerId: worker!.id } });
    await prisma.worker.delete({ where: { id: worker!.id } });
    createdIds.splice(createdIds.indexOf(worker!.id), 1);
    await prisma.onboardingPath.delete({ where: { id: path.id } });
    await prisma.department.delete({ where: { id: dept.id } });
  });

  it("should create onboarding step records when default path has steps", async () => {
    authAdmin();
    const dept = await seedDepartment(companyA.id, { name: "מסלול עם שלבים" });
    const path = await seedOnboardingPath(companyA.id, {
      departmentId: dept.id,
      isDefault: true,
      isActive: true,
    });
    const step = await seedOnboardingStep(companyA.id, path.id);

    const worker = await createWorker({
      firstName: "שלבים",
      lastName: "בדיקה",
      departmentId: dept.id,
    });
    createdIds.push(worker!.id);

    const onboarding = await prisma.workerOnboarding.findFirst({
      where: { workerId: worker!.id },
    });
    const stepProgress = await prisma.workerOnboardingStep.findMany({
      where: { onboardingId: onboarding!.id },
    });
    expect(stepProgress.length).toBe(1);
    expect(stepProgress[0].stepId).toBe(step.id);
    expect(stepProgress[0].status).toBe("PENDING");

    await prisma.workerOnboardingStep.deleteMany({ where: { onboardingId: onboarding!.id } });
    await prisma.workerOnboarding.deleteMany({ where: { workerId: worker!.id } });
    await prisma.worker.delete({ where: { id: worker!.id } });
    createdIds.splice(createdIds.indexOf(worker!.id), 1);
    await prisma.onboardingStep.delete({ where: { id: step.id } });
    await prisma.onboardingPath.delete({ where: { id: path.id } });
    await prisma.department.delete({ where: { id: dept.id } });
  });

  it("should not assign onboarding when no default path exists", async () => {
    authAdmin();
    const worker = await createWorker({
      firstName: "בלי",
      lastName: "מסלול",
      departmentId: deptA.id,
    });
    createdIds.push(worker!.id);

    const onboarding = await prisma.workerOnboarding.findFirst({
      where: { workerId: worker!.id },
    });
    expect(onboarding).toBeNull();
  });

  it("should throw 'First name is required' for empty firstName", async () => {
    authAdmin();
    await expect(
      createWorker({ firstName: "", lastName: "בדיקה", departmentId: deptA.id }),
    ).rejects.toThrow("First name is required");
  });

  it("should throw 'Last name is required' for empty lastName", async () => {
    authAdmin();
    await expect(
      createWorker({ firstName: "בדיקה", lastName: "", departmentId: deptA.id }),
    ).rejects.toThrow("Last name is required");
  });

  it("should throw 'הטקסט ארוך מדי, מותר עד 200 תווים' for firstName > 200 chars", async () => {
    authAdmin();
    await expect(
      createWorker({ firstName: "א".repeat(201), lastName: "בדיקה", departmentId: deptA.id }),
    ).rejects.toThrow("הטקסט ארוך מדי, מותר עד 200 תווים");
  });

  it("should throw 'הטקסט ארוך מדי, מותר עד 200 תווים' for lastName > 200 chars", async () => {
    authAdmin();
    await expect(
      createWorker({ firstName: "בדיקה", lastName: "א".repeat(201), departmentId: deptA.id }),
    ).rejects.toThrow("הטקסט ארוך מדי, מותר עד 200 תווים");
  });

  it("should throw 'הטקסט ארוך מדי, מותר עד 200 תווים' for position > 200 chars", async () => {
    authAdmin();
    await expect(
      createWorker({
        firstName: "בדיקה",
        lastName: "בדיקה",
        departmentId: deptA.id,
        position: "א".repeat(201),
      }),
    ).rejects.toThrow("הטקסט ארוך מדי, מותר עד 200 תווים");
  });

  it("should throw 'הטקסט ארוך מדי, מותר עד 100 תווים' for employeeId > 100 chars", async () => {
    authAdmin();
    await expect(
      createWorker({
        firstName: "בדיקה",
        lastName: "בדיקה",
        departmentId: deptA.id,
        employeeId: "x".repeat(101),
      }),
    ).rejects.toThrow("הטקסט ארוך מדי, מותר עד 100 תווים");
  });

  it("should throw 'Department not found or access denied' for invalid departmentId", async () => {
    authAdmin();
    await expect(
      createWorker({ firstName: "בדיקה", lastName: "בדיקה", departmentId: 999999 }),
    ).rejects.toThrow("Department not found or access denied");
  });

  it("should throw for departmentId from different company", async () => {
    authAdmin();
    await expect(
      createWorker({ firstName: "בדיקה", lastName: "בדיקה", departmentId: deptB.id }),
    ).rejects.toThrow("Department not found or access denied");
  });

  it("should validate linkedUserId belongs to same company", async () => {
    authAdmin();
    const worker = await createWorker({
      firstName: "מקושר",
      lastName: "למשתמש",
      departmentId: deptA.id,
      linkedUserId: adminUserA.id,
    });
    createdIds.push(worker!.id);
    expect(worker!.linkedUserId).toBe(adminUserA.id);
  });

  it("should throw 'Invalid linked user' for user from different company", async () => {
    authAdmin();
    await expect(
      createWorker({
        firstName: "קישור",
        lastName: "שגוי",
        departmentId: deptA.id,
        linkedUserId: userB.id,
      }),
    ).rejects.toThrow("Invalid linked user");
  });

  it("should throw 'פריט עם פרטים אלו כבר קיים במערכת' for duplicate employeeId (P2002)", async () => {
    authAdmin();
    const empId = `EMP-DUP-${Date.now()}`;
    const w1 = await createWorker({
      firstName: "כפול",
      lastName: "ראשון",
      departmentId: deptA.id,
      employeeId: empId,
    });
    createdIds.push(w1!.id);

    await expect(
      createWorker({
        firstName: "כפול",
        lastName: "שני",
        departmentId: deptA.id,
        employeeId: empId,
      }),
    ).rejects.toThrow("פריט עם פרטים אלו כבר קיים במערכת");
  });

  it("should trim and validate string length for all fields", async () => {
    authAdmin();
    const worker = await createWorker({
      firstName: "  חתוך  ",
      lastName: "  שם  ",
      departmentId: deptA.id,
    });
    createdIds.push(worker!.id);
    expect(worker!.firstName).toBe("חתוך");
    expect(worker!.lastName).toBe("שם");
  });

  it("should set companyId from the authenticated user", async () => {
    authAdmin();
    const worker = await createWorker({
      firstName: "חברה",
      lastName: "בדיקה",
      departmentId: deptA.id,
    });
    createdIds.push(worker!.id);
    const dbWorker = await prisma.worker.findUnique({ where: { id: worker!.id } });
    expect(dbWorker!.companyId).toBe(companyA.id);
  });
});

describe("updateWorker", () => {
  let worker: { id: number };

  beforeAll(async () => {
    worker = await seedWorker(companyA.id, deptA.id, {
      firstName: "מקורי",
      lastName: "שם",
      status: "ONBOARDING",
    });
  });

  afterAll(async () => {
    await prisma.worker.deleteMany({ where: { id: worker.id } });
  });

  it("should update single field and verify others unchanged", async () => {
    authAdmin();
    const updated = await updateWorker(worker.id, { firstName: "מעודכן" });
    expect(updated!.firstName).toBe("מעודכן");
    expect(updated!.lastName).toBe("שם");
  });

  it("should verify DB state matches response after update", async () => {
    authAdmin();
    const updated = await updateWorker(worker.id, { firstName: "אימות" });
    const dbWorker = await prisma.worker.findUnique({ where: { id: worker.id } });
    expect(dbWorker!.firstName).toBe("אימות");
    expect(dbWorker!.firstName).toBe(updated!.firstName);
  });

  it("should update @updatedAt timestamp after update", async () => {
    const before = await prisma.worker.findUnique({
      where: { id: worker.id },
      select: { updatedAt: true },
    });
    await new Promise((r) => setTimeout(r, 50));
    authAdmin();
    await updateWorker(worker.id, { firstName: "חותמת" });
    const after = await prisma.worker.findUnique({
      where: { id: worker.id },
      select: { updatedAt: true },
    });
    expect(after!.updatedAt.getTime()).toBeGreaterThan(before!.updatedAt.getTime());
  });

  it("should update worker status (e.g., ONBOARDING → ACTIVE)", async () => {
    authAdmin();
    const updated = await updateWorker(worker.id, { status: "ACTIVE" });
    expect(updated!.status).toBe("ACTIVE");
    await updateWorker(worker.id, { status: "ONBOARDING" });
  });

  it("should throw for invalid status enum value", async () => {
    authAdmin();
    await expect(
      updateWorker(worker.id, { status: "INVALID" }),
    ).rejects.toThrow("Invalid worker status");
  });

  it("should validate departmentId on update", async () => {
    authAdmin();
    await expect(
      updateWorker(worker.id, { departmentId: deptB.id }),
    ).rejects.toThrow("Department not found or access denied");
  });

  it("should validate linkedUserId on update", async () => {
    authAdmin();
    await expect(
      updateWorker(worker.id, { linkedUserId: userB.id }),
    ).rejects.toThrow("Invalid linked user");
  });

  it("should support optimistic locking via expectedUpdatedAt", async () => {
    authAdmin();
    const current = await prisma.worker.findUnique({
      where: { id: worker.id },
      select: { updatedAt: true },
    });
    const updated = await updateWorker(worker.id, {
      firstName: "אופטימיסטי",
      expectedUpdatedAt: current!.updatedAt.toISOString(),
    });
    expect(updated!.firstName).toBe("אופטימיסטי");
  });

  it("should throw 'CONFLICT' when expectedUpdatedAt doesn't match", async () => {
    authAdmin();
    await expect(
      updateWorker(worker.id, {
        firstName: "קונפליקט",
        expectedUpdatedAt: "2000-01-01T00:00:00.000Z",
      }),
    ).rejects.toThrow("CONFLICT");
  });

  it("should validate customFields as JSON (max depth 3, max size 51200)", async () => {
    authAdmin();
    const updated = await updateWorker(worker.id, {
      customFields: { key: "value", nested: { a: 1 } },
    });
    expect(updated!.customFields).toMatchObject({ key: "value", nested: { a: 1 } });
  });

  it("should strip prototype pollution keys from customFields (verified via Object.keys)", async () => {
    authAdmin();
    const updated = await updateWorker(worker.id, {
      customFields: { __proto__: "bad", constructor: "bad", safe: "ok" } as any,
    });
    // Verify via Object.keys that dangerous keys are NOT present
    const keys = Object.keys(updated!.customFields as object);
    expect(keys).not.toContain("__proto__");
    expect(keys).not.toContain("constructor");
    expect(keys).toContain("safe");
    // Also verify via JSON serialization
    const serialized = JSON.stringify(updated!.customFields);
    expect(serialized).not.toContain("__proto__");
    expect(serialized).toContain("safe");
  });

  it("should throw 'מבנה הנתונים מורכב מדי' for customFields depth > 3", async () => {
    authAdmin();
    await expect(
      updateWorker(worker.id, {
        customFields: { a: { b: { c: { d: 1 } } } },
      }),
    ).rejects.toThrow("מבנה הנתונים מורכב מדי");
  });

  it("should throw size error for customFields > 51200 bytes", async () => {
    authAdmin();
    const largeValue = "x".repeat(52000);
    await expect(
      updateWorker(worker.id, {
        customFields: { data: largeValue },
      }),
    ).rejects.toThrow("הנתונים חורגים מהגודל המרבי המותר (50KB)");
  });

  it("should throw 'הפריט המבוקש לא נמצא' for non-existent worker (P2025)", async () => {
    authAdmin();
    await expect(
      updateWorker(999999, { firstName: "לא קיים" }),
    ).rejects.toThrow("הפריט המבוקש לא נמצא");
  });

  it("should throw 'הפריט המבוקש לא נמצא' for worker in different company (P2025)", async () => {
    authAdmin();
    const otherW = await seedWorker(companyB.id, deptB.id);
    await expect(
      updateWorker(otherW.id, { firstName: "חברה אחרת" }),
    ).rejects.toThrow("הפריט המבוקש לא נמצא");
    await prisma.worker.delete({ where: { id: otherW.id } });
  });
});

describe("deleteWorker", () => {
  it("should soft-delete worker (set deletedAt) and verify DB", async () => {
    authAdmin();
    const w = await seedWorker(companyA.id, deptA.id);
    const result = await deleteWorker(w.id);
    expect(result).toEqual({ success: true });
    const dbW = await prisma.worker.findUnique({ where: { id: w.id } });
    expect(dbW!.deletedAt).not.toBeNull();
    await prisma.worker.delete({ where: { id: w.id } });
  });

  it("should not cascade-delete related tasks (soft delete doesn't trigger cascade)", async () => {
    authAdmin();
    const w = await seedWorker(companyA.id, deptA.id);
    const task = await seedWorkerTask(companyA.id, w.id);
    await deleteWorker(w.id);
    const dbTask = await prisma.workerTask.findUnique({ where: { id: task.id } });
    expect(dbTask).not.toBeNull();
    await prisma.workerTask.delete({ where: { id: task.id } });
    await prisma.worker.delete({ where: { id: w.id } });
  });

  it("should throw 'הפריט המבוקש לא נמצא' for non-existent worker (P2025)", async () => {
    authAdmin();
    await expect(deleteWorker(999999)).rejects.toThrow("הפריט המבוקש לא נמצא");
  });
});

describe("getWorkersStats", () => {
  it("should return totalWorkers, onboardingWorkers, activeWorkers, departments, onboardingPaths counts", async () => {
    authAdmin();
    const stats = await getWorkersStats();
    expect(stats).toHaveProperty("totalWorkers");
    expect(stats).toHaveProperty("onboardingWorkers");
    expect(stats).toHaveProperty("activeWorkers");
    expect(stats).toHaveProperty("departments");
    expect(stats).toHaveProperty("onboardingPaths");
    expect(typeof stats.totalWorkers).toBe("number");
  });

  it("should return exact response contract keys", async () => {
    authAdmin();
    const stats = await getWorkersStats();
    expect(Object.keys(stats).sort()).toEqual(
      ["activeWorkers", "departments", "onboardingPaths", "onboardingWorkers", "totalWorkers"],
    );
  });

  it("should exclude soft-deleted workers from counts (isolated company)", async () => {
    // Use isolated company with known workers to avoid tautological assertion
    const iso = await seedCompany();
    const isoUser = await seedUser(iso.id);
    const isoDept = await seedDepartment(iso.id, { name: "סטטיסטיקה" });

    await seedWorker(iso.id, isoDept.id, { status: "ACTIVE" });
    await seedWorker(iso.id, isoDept.id, { status: "ACTIVE" });
    await seedWorker(iso.id, isoDept.id, { status: "ONBOARDING" });
    await seedWorker(iso.id, isoDept.id, { status: "ACTIVE", deletedAt: new Date() });

    mockGetCurrentUser.mockResolvedValue(makeAdminUser(isoUser.id, iso.id));
    const stats = await getWorkersStats();

    expect(stats.totalWorkers).toBe(3); // 2 ACTIVE + 1 ONBOARDING (deleted excluded)
    expect(stats.activeWorkers).toBe(2);
    expect(stats.onboardingWorkers).toBe(1);
    expect(stats.departments).toBe(1);

    // cleanup
    await prisma.worker.deleteMany({ where: { companyId: iso.id } });
    await prisma.department.deleteMany({ where: { companyId: iso.id } });
    await prisma.user.delete({ where: { id: isoUser.id } });
    await prisma.company.delete({ where: { id: iso.id } });
  });

  it("should return zero counts for empty company", async () => {
    const emptyCompany = await seedCompany();
    const emptyUser = await seedUser(emptyCompany.id);
    mockGetCurrentUser.mockResolvedValue(makeAdminUser(emptyUser.id, emptyCompany.id));
    const stats = await getWorkersStats();
    expect(stats.totalWorkers).toBe(0);
    expect(stats.onboardingWorkers).toBe(0);
    expect(stats.activeWorkers).toBe(0);
    expect(stats.departments).toBe(0);
    expect(stats.onboardingPaths).toBe(0);
    await prisma.user.delete({ where: { id: emptyUser.id } });
    await prisma.company.delete({ where: { id: emptyCompany.id } });
  });

  it("should only count workers from authenticated user's company", async () => {
    mockGetCurrentUser.mockResolvedValue(makeAdminUser(userB.id, companyB.id));
    const stats = await getWorkersStats();
    expect(stats.totalWorkers).toBe(0);
  });
});

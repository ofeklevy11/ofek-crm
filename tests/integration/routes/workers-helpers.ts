import { prisma } from "@/lib/prisma";
import type { User } from "@/lib/permissions";

let counter = 0;
function uniq() {
  return `${Date.now()}-${++counter}-${Math.random().toString(36).slice(2, 6)}`;
}

// ── Seed Factories ──────────────────────────────────────────────────

export async function seedCompany(overrides: Record<string, unknown> = {}) {
  return prisma.company.create({
    data: {
      name: `חברת בדיקות ${uniq()}`,
      slug: `test-co-${uniq()}`,
      ...overrides,
    },
  });
}

export async function seedUser(
  companyId: number,
  overrides: Record<string, unknown> = {},
) {
  return prisma.user.create({
    data: {
      companyId,
      name: `משתמש ${uniq()}`,
      email: `user-${uniq()}@test.co.il`,
      passwordHash: "$2b$10$fakehashedpassword",
      role: "admin",
      permissions: {},
      tablePermissions: {},
      ...overrides,
    },
  });
}

export async function seedDepartment(
  companyId: number,
  overrides: Record<string, unknown> = {},
) {
  return prisma.department.create({
    data: {
      companyId,
      name: `מחלקה ${uniq()}`,
      ...overrides,
    },
  });
}

export async function seedWorker(
  companyId: number,
  departmentId: number,
  overrides: Record<string, unknown> = {},
) {
  return prisma.worker.create({
    data: {
      companyId,
      departmentId,
      firstName: `ישראל`,
      lastName: `ישראלי-${uniq()}`,
      status: "ONBOARDING",
      ...overrides,
    },
  });
}

export async function seedOnboardingPath(
  companyId: number,
  overrides: Record<string, unknown> = {},
) {
  return prisma.onboardingPath.create({
    data: {
      companyId,
      name: `מסלול ${uniq()}`,
      isActive: true,
      ...overrides,
    },
  });
}

export async function seedOnboardingStep(
  companyId: number,
  pathId: number,
  overrides: Record<string, unknown> = {},
) {
  return prisma.onboardingStep.create({
    data: {
      companyId,
      pathId,
      title: `שלב ${uniq()}`,
      type: "TASK",
      order: 0,
      ...overrides,
    },
  });
}

export async function seedWorkerOnboarding(
  companyId: number,
  workerId: number,
  pathId: number,
) {
  return prisma.workerOnboarding.create({
    data: {
      companyId,
      workerId,
      pathId,
      status: "IN_PROGRESS",
    },
  });
}

export async function seedWorkerTask(
  companyId: number,
  workerId: number,
  overrides: Record<string, unknown> = {},
) {
  return prisma.workerTask.create({
    data: {
      companyId,
      workerId,
      title: `משימה ${uniq()}`,
      ...overrides,
    },
  });
}

export async function seedTableMeta(
  companyId: number,
  createdBy: number,
  overrides: Record<string, unknown> = {},
) {
  return prisma.tableMeta.create({
    data: {
      companyId,
      name: `טבלה ${uniq()}`,
      slug: `table-${uniq()}`,
      createdBy,
      schemaJson: {},
      ...overrides,
    },
  });
}

// ── User Factories (for mockGetCurrentUser) ─────────────────────────

export function makeAdminUser(userId: number, companyId: number): User {
  return {
    id: userId,
    companyId,
    name: "מנהל מערכת",
    email: "admin@test.co.il",
    role: "admin",
    allowedWriteTableIds: [],
    permissions: {},
    tablePermissions: {},
  };
}

export function makeBasicUserWithWorkerPerms(
  userId: number,
  companyId: number,
): User {
  return {
    id: userId,
    companyId,
    name: "משתמש עם הרשאות",
    email: "basic-manage@test.co.il",
    role: "basic",
    allowedWriteTableIds: [],
    permissions: { canViewWorkers: true, canManageWorkers: true },
    tablePermissions: {},
  };
}

export function makeBasicUserViewOnly(
  userId: number,
  companyId: number,
): User {
  return {
    id: userId,
    companyId,
    name: "משתמש צפייה",
    email: "basic-view@test.co.il",
    role: "basic",
    allowedWriteTableIds: [],
    permissions: { canViewWorkers: true },
    tablePermissions: {},
  };
}

export function makeBasicUserNoPerms(
  userId: number,
  companyId: number,
): User {
  return {
    id: userId,
    companyId,
    name: "משתמש ללא הרשאות",
    email: "no-perms@test.co.il",
    role: "basic",
    allowedWriteTableIds: [],
    permissions: {},
    tablePermissions: {},
  };
}

// ── Cleanup ─────────────────────────────────────────────────────────

export async function cleanupWorkers(companyIds: number[]) {
  if (companyIds.length === 0) return;
  const where = { companyId: { in: companyIds } };

  // FK-safe order: deepest children first
  await prisma.workerOnboardingStep.deleteMany({ where });
  await prisma.workerOnboarding.deleteMany({ where });
  await prisma.workerTask.deleteMany({ where });
  await prisma.worker.deleteMany({ where });
  await prisma.onboardingStep.deleteMany({ where });
  await prisma.onboardingPath.deleteMany({ where });
  await prisma.department.deleteMany({ where });
  await prisma.tableMeta.deleteMany({ where });
  await prisma.user.deleteMany({ where });
  await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
}

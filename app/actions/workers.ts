"use server";

import { prisma } from "@/lib/prisma";
import { withRetry } from "@/lib/db-retry";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/permissions-server";
import { validateUserInCompany, validateWorkerInCompany } from "@/lib/company-validation";
import { redis } from "@/lib/redis";

// -- Status validation (P6) --
const VALID_WORKER_STATUSES = ["ONBOARDING", "ACTIVE", "ON_LEAVE", "TERMINATED"] as const;
const VALID_STEP_STATUSES = ["PENDING", "IN_PROGRESS", "COMPLETED", "SKIPPED"] as const;
const VALID_TASK_STATUSES = ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
const VALID_TASK_PRIORITIES = ["URGENT", "HIGH", "NORMAL", "LOW"] as const;
const VALID_STEP_TYPES = ["TASK", "TRAINING", "DOCUMENT", "MEETING", "CHECKLIST"] as const;

function validateEnum(value: string | undefined, valid: readonly string[], label: string): void {
  if (value !== undefined && !valid.includes(value)) {
    throw new Error(`Invalid ${label}: "${value}". Must be one of: ${valid.join(", ")}`);
  }
}

// -- Cache helpers (P9) --
const CACHE_TTL = 60; // 60 seconds

async function getCached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  try {
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached) as T;
  } catch { /* Redis down — fall through */ }
  const data = await fetcher();
  try { redis.set(key, JSON.stringify(data), "EX", CACHE_TTL); } catch { /* non-critical */ }
  return data;
}

async function invalidateWorkersCache(companyId: number) {
  try {
    await redis.del(`workers:${companyId}:departments`);
    // Delete all path cache variants (base + per-department)
    const prefix = redis.options.keyPrefix || "";
    const pathKeys = await redis.keys(`workers:${companyId}:paths*`);
    if (pathKeys.length > 0) {
      // redis.keys() returns fully-prefixed keys; redis.del() auto-prepends prefix,
      // so strip prefix before passing to del()
      await redis.del(...pathKeys.map(k => k.startsWith(prefix) ? k.slice(prefix.length) : k));
    }
  } catch { /* non-critical */ }
}

// ==========================================
// DEPARTMENTS
// ==========================================

export async function getDepartments() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  return getCached(`workers:${user.companyId}:departments`, () =>
    withRetry(() => prisma.department.findMany({
      where: { companyId: user.companyId, deletedAt: null },
      include: {
        _count: {
          select: { workers: { where: { deletedAt: null } }, onboardingPaths: true },
        },
      },
      orderBy: { name: "asc" },
      take: 500,
    }))
  );
}

export async function getDepartment(id: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  return withRetry(() => prisma.department.findFirst({
    where: { id, companyId: user.companyId, deletedAt: null },
    include: {
      workers: {
        where: { deletedAt: null },
        select: { id: true, firstName: true, lastName: true, status: true, position: true },
        take: 200,
      },
      onboardingPaths: {
        select: {
          id: true,
          name: true,
          isDefault: true,
          isActive: true,
          steps: {
            select: { id: true, title: true, order: true, type: true },
            orderBy: { order: "asc" },
          },
        },
      },
      _count: { select: { workers: { where: { deletedAt: null } } } },
    },
  }));
}

export async function createDepartment(data: {
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  managerId?: number;
}) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  // SECURITY: Validate managerId belongs to same company
  if (data.managerId) {
    if (!(await validateUserInCompany(data.managerId, user.companyId))) {
      throw new Error("Invalid manager");
    }
  }

  const department = await withRetry(() => prisma.department.create({
    data: {
      ...data,
      companyId: user.companyId,
    },
  }));

  revalidatePath("/workers");
  await invalidateWorkersCache(user.companyId);
  return department;
}

export async function updateDepartment(
  id: number,
  data: {
    name?: string;
    description?: string;
    color?: string;
    icon?: string;
    managerId?: number;
    isActive?: boolean;
  },
) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  // SECURITY: Validate managerId belongs to same company
  if (data.managerId) {
    if (!(await validateUserInCompany(data.managerId, user.companyId))) {
      throw new Error("Invalid manager");
    }
  }

  // SECURITY: Atomic companyId check in update WHERE clause
  const department = await withRetry(() => prisma.department.update({
    where: { id, companyId: user.companyId, deletedAt: null },
    data,
  }));

  revalidatePath("/workers");
  await invalidateWorkersCache(user.companyId);
  return department;
}

export async function deleteDepartment(id: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  // Transaction prevents race: a concurrent createWorker could assign a worker
  // between the count check and the soft-delete, causing orphans
  await withRetry(() => prisma.$transaction(async (tx) => {
    const workersCount = await tx.worker.count({
      where: { departmentId: id, companyId: user.companyId, deletedAt: null },
    });

    if (workersCount > 0) {
      throw new Error("Cannot delete department with active workers");
    }

    await tx.department.update({
      where: { id, companyId: user.companyId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }, { maxWait: 5000, timeout: 10000 }));

  revalidatePath("/workers");
  await invalidateWorkersCache(user.companyId);
  return { success: true };
}

// ==========================================
// WORKERS
// ==========================================

export async function getWorkers(filters?: {
  departmentId?: number;
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  const pageSize = Math.min(filters?.pageSize ?? 500, 500);
  const page = filters?.page ?? 1;
  const skip = (page - 1) * pageSize;

  const where = {
    companyId: user.companyId,
    deletedAt: null as null,
    ...(filters?.departmentId && { departmentId: filters.departmentId }),
    ...(filters?.status && { status: filters.status }),
  };

  const [data, total] = await Promise.all([
    withRetry(() => prisma.worker.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        avatar: true,
        position: true,
        employeeId: true,
        status: true,
        startDate: true,
        endDate: true,
        notes: true,
        departmentId: true,
        linkedUserId: true,
        department: {
          select: { id: true, name: true, description: true, color: true, icon: true, managerId: true, isActive: true },
        },
        onboardingProgress: {
          select: {
            id: true,
            pathId: true,
            status: true,
            path: {
              select: {
                name: true,
                _count: { select: { steps: true } },
              },
            },
            stepProgress: {
              select: { stepId: true, status: true },
            },
          },
        },
        _count: {
          select: { assignedTasks: true },
        },
      },
      orderBy: [{ status: "asc" }, { firstName: "asc" }],
      skip,
      take: pageSize,
    })),
    withRetry(() => prisma.worker.count({ where })),
  ]);

  return { data, total, hasMore: skip + data.length < total };
}

export async function getWorker(id: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  return withRetry(() => prisma.worker.findFirst({
    where: { id, companyId: user.companyId, deletedAt: null },
    include: {
      department: {
        select: { id: true, name: true, description: true, color: true, icon: true, managerId: true, isActive: true },
      },
      onboardingProgress: {
        include: {
          path: {
            include: {
              steps: { orderBy: { order: "asc" } },
            },
          },
          stepProgress: {
            select: { id: true, stepId: true, status: true, notes: true, score: true, feedback: true, completedAt: true },
          },
        },
      },
      assignedTasks: {
        orderBy: { createdAt: "desc" },
        take: 100,
      },
    },
  }));
}

export async function createWorker(data: {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  departmentId: number;
  position?: string;
  employeeId?: string;
  startDate?: Date;
  notes?: string;
  linkedUserId?: number;
}) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  // Validate FK refs outside transaction (read-only, safe)
  const dept = await withRetry(() => prisma.department.findFirst({
    where: { id: data.departmentId, companyId: user.companyId, deletedAt: null },
    select: { id: true },
  }));
  if (!dept) throw new Error("Department not found or access denied");

  // SECURITY: Validate linkedUserId belongs to same company
  if (data.linkedUserId) {
    if (!(await validateUserInCompany(data.linkedUserId, user.companyId))) {
      throw new Error("Invalid linked user");
    }
  }

  // Atomic: create worker + assign default path in one transaction (P2)
  const worker = await withRetry(() => prisma.$transaction(async (tx) => {
    const w = await tx.worker.create({
      data: {
        ...data,
        companyId: user.companyId,
        status: "ONBOARDING",
      },
    });

    const defaultPath = await tx.onboardingPath.findFirst({
      where: {
        companyId: user.companyId,
        departmentId: data.departmentId,
        isDefault: true,
        isActive: true,
      },
      select: { id: true, steps: { select: { id: true } } },
    });

    if (defaultPath) {
      const onboarding = await tx.workerOnboarding.create({
        data: { companyId: user.companyId, workerId: w.id, pathId: defaultPath.id, status: "IN_PROGRESS" },
      });
      if (defaultPath.steps.length > 0) {
        await tx.workerOnboardingStep.createMany({
          data: defaultPath.steps.map((s) => ({
            companyId: user.companyId,
            onboardingId: onboarding.id,
            stepId: s.id,
            status: "PENDING",
          })),
        });
      }
    }

    return w;
  }, { maxWait: 5000, timeout: 10000 }));

  revalidatePath("/workers");
  await invalidateWorkersCache(user.companyId);
  return worker;
}

export async function updateWorker(
  id: number,
  data: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    departmentId?: number;
    position?: string;
    employeeId?: string;
    startDate?: Date;
    endDate?: Date;
    status?: string;
    notes?: string;
    linkedUserId?: number;
    avatar?: string;
    customFields?: Record<string, unknown>;
    expectedUpdatedAt?: string; // ISO string for optimistic locking (P5)
  },
) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  const { expectedUpdatedAt, ...updateData } = data;

  // P6: validate status
  validateEnum(updateData.status, VALID_WORKER_STATUSES, "worker status");

  // SECURITY: Validate departmentId belongs to user's company if provided
  if (updateData.departmentId) {
    const dept = await withRetry(() => prisma.department.findFirst({
      where: { id: updateData.departmentId, companyId: user.companyId, deletedAt: null },
      select: { id: true },
    }));
    if (!dept) throw new Error("Department not found or access denied");
  }

  // SECURITY: Validate linkedUserId belongs to same company
  if (updateData.linkedUserId) {
    if (!(await validateUserInCompany(updateData.linkedUserId, user.companyId))) {
      throw new Error("Invalid linked user");
    }
  }

  try {
    const worker = await withRetry(() => prisma.$transaction(async (tx) => {
      // P5: optimistic lock check
      if (expectedUpdatedAt) {
        const current = await tx.worker.findFirst({
          where: { id, companyId: user.companyId, deletedAt: null },
          select: { updatedAt: true },
        });
        if (!current) throw new Error("Worker not found or access denied");
        if (current.updatedAt.toISOString() !== expectedUpdatedAt) {
          throw new Error("CONFLICT: Worker was modified by another user. Please refresh and try again.");
        }
      }

      return tx.worker.update({
        where: { id, companyId: user.companyId, deletedAt: null },
        data: updateData as any,
      });
    }, { maxWait: 5000, timeout: 10000 }));

    revalidatePath("/workers");
    return worker;
  } catch (e: any) {
    if (e.code === "P2025") throw new Error("Worker not found or access denied");
    throw e;
  }
}

export async function deleteWorker(id: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  // P10: Soft delete instead of hard delete
  try {
    await withRetry(() => prisma.worker.update({
      where: { id, companyId: user.companyId, deletedAt: null },
      data: { deletedAt: new Date() },
    }));
  } catch (e: any) {
    if (e.code === "P2025") throw new Error("Worker not found or access denied");
    throw e;
  }

  revalidatePath("/workers");
  await invalidateWorkersCache(user.companyId);
  return { success: true };
}

// ==========================================
// ONBOARDING PATHS
// ==========================================

export async function getOnboardingPaths(departmentId?: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  return getCached(
    `workers:${user.companyId}:paths${departmentId ? `:${departmentId}` : ""}`,
    () => withRetry(() => prisma.onboardingPath.findMany({
      where: {
        companyId: user.companyId,
        ...(departmentId && { departmentId }),
      },
      include: {
        department: {
          select: { id: true, name: true, color: true },
        },
        steps: {
          select: {
            id: true,
            pathId: true,
            title: true,
            description: true,
            type: true,
            order: true,
            estimatedMinutes: true,
            resourceUrl: true,
            resourceType: true,
            isRequired: true,
            onCompleteActions: true,
          },
          orderBy: { order: "asc" },
        },
        _count: {
          select: { workerProgress: true, steps: true },
        },
      },
      orderBy: { name: "asc" },
      take: 500,
    }))
  );
}

export async function getOnboardingPath(id: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  return withRetry(() => prisma.onboardingPath.findFirst({
    where: { id, companyId: user.companyId },
    include: {
      department: {
        select: { id: true, name: true, description: true, color: true, icon: true, managerId: true, isActive: true },
      },
      steps: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          title: true,
          description: true,
          type: true,
          order: true,
          estimatedMinutes: true,
          isRequired: true,
          resourceUrl: true,
          resourceType: true,
          onCompleteActions: true,
        },
      },
      workerProgress: {
        include: {
          worker: {
            select: { id: true, firstName: true, lastName: true, avatar: true, position: true, status: true },
          },
          stepProgress: {
            select: { stepId: true, status: true, completedAt: true },
          },
        },
        take: 100,
      },
    },
  }));
}

export async function createOnboardingPath(data: {
  name: string;
  description?: string;
  departmentId?: number;
  isDefault?: boolean;
  isActive?: boolean;
  estimatedDays?: number;
  steps?: Array<{
    title: string;
    description?: string;
    type?: string;
    order?: number;
    estimatedMinutes?: number;
    resourceUrl?: string;
    resourceType?: string;
    isRequired?: boolean;
    onCompleteActions?: unknown;
  }>;
}) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  const { steps: stepsData, ...pathData } = data;

  // Validate step types upfront
  if (stepsData?.length) {
    for (const s of stepsData) {
      validateEnum(s.type, VALID_STEP_TYPES, "step type");
    }
  }

  // Transaction prevents race: two concurrent creates both unsetting the old default
  // Also creates steps atomically with the path
  const path = await withRetry(() => prisma.$transaction(async (tx) => {
    // If setting as default, unset other defaults for this department
    if (pathData.isDefault && pathData.departmentId) {
      await tx.onboardingPath.updateMany({
        where: {
          companyId: user.companyId,
          departmentId: pathData.departmentId,
          isDefault: true,
        },
        data: { isDefault: false },
      });
    }

    const created = await tx.onboardingPath.create({
      data: {
        ...pathData,
        companyId: user.companyId,
      },
    });

    if (stepsData?.length) {
      await tx.onboardingStep.createMany({
        data: stepsData.map((s, i) => ({
          ...s,
          pathId: created.id,
          companyId: user.companyId,
          order: s.order ?? i,
        })),
      });
    }

    return created;
  }, { maxWait: 5000, timeout: 10000 }));

  revalidatePath("/workers");
  await invalidateWorkersCache(user.companyId);
  return path;
}

export async function updateOnboardingPath(
  id: number,
  data: {
    name?: string;
    description?: string;
    departmentId?: number;
    isDefault?: boolean;
    isActive?: boolean;
    estimatedDays?: number;
  },
) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  // Transaction prevents race: concurrent updates both unsetting the old default
  console.error("[updateOnboardingPath] id:", id, "companyId:", user.companyId, "data:", JSON.stringify(data));
  try {
    const path = await withRetry(() => prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        const currentPath = await tx.onboardingPath.findFirst({
          where: { id, companyId: user.companyId },
          select: { departmentId: true },
        });
        if (!currentPath) throw new Error("Onboarding path not found or access denied");
        const deptId = data.departmentId || currentPath.departmentId;
        if (deptId) {
          await tx.onboardingPath.updateMany({
            where: {
              companyId: user.companyId,
              departmentId: deptId,
              isDefault: true,
              NOT: { id },
            },
            data: { isDefault: false },
          });
        }
      }

      return tx.onboardingPath.update({
        where: { id, companyId: user.companyId },
        data,
      });
    }, { maxWait: 5000, timeout: 10000 }));

    revalidatePath("/workers");
    await invalidateWorkersCache(user.companyId);
    return path;
  } catch (e: any) {
    if (e.code === "P2025") throw new Error("Onboarding path not found or access denied");
    throw e;
  }
}

export async function deleteOnboardingPath(id: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  // Transaction prevents concurrent assignOnboardingPath from inserting between deleteMany and delete
  try {
    await withRetry(() => prisma.$transaction(async (tx) => {
      // Delete all related WorkerOnboarding records first (WorkerOnboardingStep will cascade delete)
      await tx.workerOnboarding.deleteMany({
        where: { pathId: id, path: { companyId: user.companyId } },
      });

      // Now delete the path (OnboardingStep will cascade delete due to onDelete: Cascade)
      await tx.onboardingPath.delete({
        where: { id, companyId: user.companyId },
      });
    }, { maxWait: 5000, timeout: 10000 }));
  } catch (e: any) {
    if (e.code === "P2025") throw new Error("Onboarding path not found or access denied");
    throw e;
  }

  revalidatePath("/workers");
  await invalidateWorkersCache(user.companyId);
  return { success: true };
}

// ==========================================
// ONBOARDING STEPS
// ==========================================

export async function createOnboardingStep(data: {
  pathId: number;
  title: string;
  description?: string;
  type?: string;
  order?: number;
  estimatedMinutes?: number;
  resourceUrl?: string;
  resourceType?: string;
  isRequired?: boolean;
}) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  // P6: validate step type
  validateEnum(data.type, VALID_STEP_TYPES, "step type");

  // SECURITY: Verify pathId belongs to user's company
  console.error("[createOnboardingStep] pathId:", data.pathId, "companyId:", user.companyId);
  const path = await withRetry(() => prisma.onboardingPath.findFirst({
    where: { id: data.pathId, companyId: user.companyId },
    select: { id: true },
  }));
  if (!path) throw new Error("Onboarding path not found or access denied");

  // Get max order if not specified
  if (data.order === undefined) {
    const maxOrder = await withRetry(() => prisma.onboardingStep.aggregate({
      where: { pathId: data.pathId, companyId: user.companyId },
      _max: { order: true },
    }));
    data.order = (maxOrder._max.order ?? -1) + 1;
  }

  const step = await withRetry(() => prisma.onboardingStep.create({
    data: { ...data, companyId: user.companyId },
  }));

  revalidatePath("/workers");
  await invalidateWorkersCache(user.companyId);
  return step;
}

export async function updateOnboardingStep(
  id: number,
  data: {
    title?: string;
    description?: string;
    type?: string;
    order?: number;
    estimatedMinutes?: number;
    resourceUrl?: string;
    resourceType?: string;
    isRequired?: boolean;
    onCompleteActions?: unknown[];
  },
) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  // P115: Atomic verify+update in transaction to prevent TOCTOU
  const step = await withRetry(() => prisma.$transaction(async (tx) => {
    const existing = await tx.onboardingStep.findFirst({
      where: { id, path: { companyId: user.companyId } },
      select: { id: true },
    });
    if (!existing) {
      throw new Error("Step not found or access denied");
    }

    return tx.onboardingStep.update({
      where: { id },
      data: data as any,
    });
  }, { maxWait: 5000, timeout: 10000 }));

  revalidatePath("/workers");
  await invalidateWorkersCache(user.companyId);
  return step;
}

export async function deleteOnboardingStep(id: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  // P115: Atomic verify+delete in transaction to prevent TOCTOU
  await withRetry(() => prisma.$transaction(async (tx) => {
    const existing = await tx.onboardingStep.findFirst({
      where: { id, path: { companyId: user.companyId } },
      select: { id: true },
    });
    if (!existing) {
      throw new Error("Step not found or access denied");
    }

    await tx.onboardingStep.delete({
      where: { id },
    });
  }, { maxWait: 5000, timeout: 10000 }));

  revalidatePath("/workers");
  await invalidateWorkersCache(user.companyId);
  return { success: true };
}

export async function reorderOnboardingSteps(
  pathId: number,
  stepIds: number[],
) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  if (stepIds.length > 200) {
    throw new Error("Too many steps to reorder");
  }

  // P8: Wrap ownership check + raw SQL in a single transaction
  await withRetry(() => prisma.$transaction(async (tx) => {
    const path = await tx.onboardingPath.findFirst({
      where: { id: pathId, companyId: user.companyId },
      select: { id: true },
    });
    if (!path) throw new Error("Path not found or access denied");

    if (stepIds.length > 0) {
      // Params layout: [stepId0, order0, stepId1, order1, ..., pathId, companyId]
      const params: number[] = [];
      const cases: string[] = [];
      const inPlaceholders: string[] = [];

      stepIds.forEach((id, index) => {
        params.push(id, index);
        const idIdx = params.length - 1; // 0-based
        const orderIdx = params.length;   // 0-based
        cases.push(`WHEN "id" = $${idIdx} THEN $${orderIdx}`);
        inPlaceholders.push(`$${idIdx}`);
      });

      params.push(pathId, user.companyId);
      const pathIdx = params.length - 1;
      const companyIdx = params.length;

      await tx.$executeRawUnsafe(
        `UPDATE "OnboardingStep" SET "order" = CASE ${cases.join(" ")} END, "updatedAt" = NOW()
         WHERE "pathId" = $${pathIdx} AND "companyId" = $${companyIdx} AND "id" IN (${inPlaceholders.join(", ")})`,
        ...params,
      );
    }
  }, { maxWait: 5000, timeout: 10000 }));

  revalidatePath("/workers");
  await invalidateWorkersCache(user.companyId);
  return { success: true };
}

// ==========================================
// WORKER ONBOARDING PROGRESS
// ==========================================

// Internal helper: skips auth/validation (caller must have already verified ownership)
async function _assignOnboardingPathInternal(
  workerId: number,
  pathId: number,
  stepIds: number[],
  companyId: number,
) {
  return withRetry(() => prisma.$transaction(async (tx) => {
    const onboarding = await tx.workerOnboarding.create({
      data: { companyId, workerId, pathId, status: "IN_PROGRESS" },
    });

    if (stepIds.length > 0) {
      await tx.workerOnboardingStep.createMany({
        data: stepIds.map((stepId) => ({
          companyId,
          onboardingId: onboarding.id,
          stepId,
          status: "PENDING",
        })),
      });
    }

    return onboarding;
  }, { maxWait: 5000, timeout: 10000 }));
}

export async function assignOnboardingPath(workerId: number, pathId: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  const path = await withRetry(() => prisma.onboardingPath.findFirst({
    where: { id: pathId, companyId: user.companyId },
    select: { id: true, steps: { select: { id: true } } },
  }));
  if (!path) throw new Error("Onboarding path not found");

  // SECURITY: Verify worker belongs to user's company
  const worker = await withRetry(() => prisma.worker.findFirst({
    where: { id: workerId, companyId: user.companyId, deletedAt: null },
    select: { id: true },
  }));
  if (!worker) throw new Error("Worker not found or access denied");

  const onboarding = await _assignOnboardingPathInternal(
    workerId,
    pathId,
    path.steps.map((s) => s.id),
    user.companyId,
  );

  revalidatePath("/workers");
  await invalidateWorkersCache(user.companyId);
  return onboarding;
}

export async function updateStepProgress(
  onboardingId: number,
  stepId: number,
  data: {
    status: string;
    notes?: string;
    score?: number;
    feedback?: string;
  },
) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  // P6: validate step status
  validateEnum(data.status, VALID_STEP_STATUSES, "step status");

  // Get the step with its onCompleteActions — scoped by companyId
  const step = await withRetry(() => prisma.onboardingStep.findFirst({
    where: { id: stepId, path: { companyId: user.companyId } },
    select: {
      id: true,
      title: true,
      onCompleteActions: true,
      path: {
        select: { name: true, companyId: true },
      },
    },
  }));

  if (!step) {
    throw new Error("Step not found or access denied");
  }

  // Lightweight ownership check — avoids loading worker/path/steps for non-COMPLETED updates
  const onboardingCheck = await withRetry(() => prisma.workerOnboarding.findFirst({
    where: { id: onboardingId, worker: { companyId: user.companyId } },
    select: { id: true, workerId: true },
  }));
  if (!onboardingCheck) throw new Error("Onboarding not found or access denied");

  // P4: Wrap upsert in transaction to detect if status actually changed
  const { stepProgress, statusChanged } = await withRetry(() => prisma.$transaction(async (tx) => {
    const current = await tx.workerOnboardingStep.findUnique({
      where: { onboardingId_stepId: { onboardingId, stepId } },
      select: { status: true },
    });
    const wasAlreadyCompleted = current?.status === "COMPLETED";

    const sp = await tx.workerOnboardingStep.upsert({
      where: {
        onboardingId_stepId: { onboardingId, stepId },
      },
      update: {
        status: data.status,
        notes: data.notes,
        score: data.score,
        feedback: data.feedback,
        completedAt: data.status === "COMPLETED" ? new Date() : null,
      },
      create: {
        companyId: user.companyId,
        onboardingId,
        stepId,
        status: data.status,
        notes: data.notes,
        score: data.score,
        feedback: data.feedback,
        completedAt: data.status === "COMPLETED" ? new Date() : null,
      },
    });

    return { stepProgress: sp, statusChanged: data.status === "COMPLETED" && !wasAlreadyCompleted };
  }, { maxWait: 5000, timeout: 10000 }));

  // P4: Only run automations if this request actually caused the transition
  if (statusChanged) {
    // Acquire Redis NX lock to prevent duplicate automations from concurrent requests
    let lockAcquired = false;
    try {
      const result = await redis.set(`workers:step-lock:${onboardingId}:${stepId}`, "1", "EX", 30, "NX");
      lockAcquired = result === "OK";
    } catch { lockAcquired = true; /* Redis down — proceed */ }

    if (lockAcquired) {
      const onboarding = await withRetry(() => prisma.workerOnboarding.findFirst({
        where: { id: onboardingId },
        include: {
          worker: {
            select: { id: true, firstName: true, lastName: true, email: true, phone: true, position: true, status: true, departmentId: true },
          },
          path: {
            include: {
              steps: { select: { id: true, isRequired: true } },
            },
          },
        },
      }));

      // Execute automations if step has onCompleteActions
      if (onboarding && step?.onCompleteActions) {
        try {
          const actions = step.onCompleteActions as Array<{
            actionType: string;
            config: Record<string, unknown>;
          }>;
          if (Array.isArray(actions) && actions.length > 0) {
            console.log(
              `[Workers] Executing ${actions.length} automations for step ${step.title}`,
            );

            await executeOnboardingStepAutomations(
              actions,
              step,
              user,
              onboarding.worker,
            );
          }
        } catch (autoError) {
          console.error("[Workers] Error executing automations:", autoError);
          // Don't fail the whole operation if automation fails
        }
      }

      // Check onboarding completion in a transaction with fresh data to prevent race conditions
      if (onboarding) {
        await withRetry(() => prisma.$transaction(async (tx) => {
          const freshStepProgress = await tx.workerOnboardingStep.findMany({
            where: { onboardingId },
            select: { stepId: true, status: true },
          });
          const freshOnboarding = await tx.workerOnboarding.findFirst({
            where: { id: onboardingId },
            select: { status: true },
          });
          if (!freshOnboarding) return;

          const progressMap = new Map(
            freshStepProgress.map((sp) => [sp.stepId, sp.status]),
          );

          const requiredSteps = onboarding.path.steps.filter((s) => s.isRequired);
          const allRequiredCompleted =
            requiredSteps.length > 0 &&
            requiredSteps.every((rs) => progressMap.get(rs.id) === "COMPLETED");

          if (allRequiredCompleted && freshOnboarding.status !== "COMPLETED") {
            await tx.workerOnboarding.update({
              where: { id: onboardingId },
              data: { status: "COMPLETED", completedAt: new Date() },
            });
            await tx.worker.update({
              where: { id: onboarding.worker.id, companyId: user.companyId },
              data: { status: "ACTIVE" },
            });
          } else if (!allRequiredCompleted && freshOnboarding.status === "COMPLETED") {
            await tx.workerOnboarding.update({
              where: { id: onboardingId },
              data: { status: "IN_PROGRESS", completedAt: null },
            });
            await tx.worker.update({
              where: { id: onboarding.worker.id, companyId: user.companyId },
              data: { status: "ONBOARDING" },
            });
          }
        }, { maxWait: 5000, timeout: 10000 }));
      }
    } // lockAcquired
  } // statusChanged

  revalidatePath("/workers");
  await invalidateWorkersCache(user.companyId);
  return stepProgress;
}

// Get workers by onboarding path with their progress
export async function getWorkersByOnboardingPath(pathId: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  // Fetch path steps once (shared across all workers) instead of duplicating per row
  const path = await withRetry(() => prisma.onboardingPath.findFirst({
    where: { id: pathId, companyId: user.companyId },
    select: {
      steps: { select: { id: true } },
    },
  }));
  if (!path) throw new Error("Path not found or access denied");

  const totalSteps = path.steps.length;
  const stepIdSet = new Set(path.steps.map((s) => s.id));

  const workerProgress = await withRetry(() => prisma.workerOnboarding.findMany({
    where: {
      pathId,
      worker: { companyId: user.companyId, deletedAt: null },
    },
    select: {
      id: true,
      status: true,
      completedAt: true,
      createdAt: true,
      worker: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatar: true,
          position: true,
          department: { select: { name: true, color: true } },
        },
      },
      stepProgress: { select: { stepId: true, status: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  }));

  return workerProgress.map((wp) => {
    const completedSteps = wp.stepProgress.filter(
      (sp) => sp.status === "COMPLETED" && stepIdSet.has(sp.stepId),
    ).length;
    const progress =
      totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

    const actualStatus =
      (totalSteps > 0 && completedSteps === totalSteps) ||
      wp.status === "COMPLETED"
        ? "COMPLETED"
        : wp.status;

    return {
      id: wp.id,
      workerId: wp.worker.id,
      worker: wp.worker,
      status: actualStatus,
      progress,
      completedSteps,
      totalSteps,
      startedAt: wp.createdAt,
      completedAt: wp.completedAt,
    };
  });
}

// ==========================================
// WORKER TASKS
// ==========================================

export async function getWorkerTasks(workerId?: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  return withRetry(() => prisma.workerTask.findMany({
    where: {
      companyId: user.companyId,
      ...(workerId && { workerId }),
      worker: { deletedAt: null },
    },
    include: {
      worker: {
        select: { id: true, firstName: true, lastName: true },
      },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 500,
  }));
}

export async function createWorkerTask(data: {
  workerId: number;
  title: string;
  description?: string;
  priority?: string;
  dueDate?: Date;
}) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  // P6: validate priority
  validateEnum(data.priority, VALID_TASK_PRIORITIES, "task priority");

  // SECURITY: Validate workerId belongs to same company
  if (!(await validateWorkerInCompany(data.workerId, user.companyId))) {
    throw new Error("Worker not found or access denied");
  }

  const task = await withRetry(() => prisma.workerTask.create({
    data: {
      ...data,
      companyId: user.companyId,
    },
  }));

  revalidatePath("/workers");
  await invalidateWorkersCache(user.companyId);
  return task;
}

export async function updateWorkerTask(
  id: number,
  data: {
    title?: string;
    description?: string;
    priority?: string;
    status?: string;
    dueDate?: Date;
    completedAt?: Date;
  },
) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  // P6: validate status and priority
  validateEnum(data.status, VALID_TASK_STATUSES, "task status");
  validateEnum(data.priority, VALID_TASK_PRIORITIES, "task priority");

  // Auto-set completedAt if marking as completed
  if (data.status === "COMPLETED" && !data.completedAt) {
    data.completedAt = new Date();
  }

  // P115: Add companyId to prevent cross-tenant worker task updates
  try {
    const task = await withRetry(() => prisma.workerTask.update({
      where: { id, companyId: user.companyId },
      data,
    }));

    revalidatePath("/workers");
    await invalidateWorkersCache(user.companyId);
    return task;
  } catch (e: any) {
    if (e.code === "P2025") throw new Error("Worker task not found or access denied");
    throw e;
  }
}

export async function deleteWorkerTask(id: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  // P115: Add companyId to prevent cross-tenant worker task deletes
  try {
    await withRetry(() => prisma.workerTask.delete({
      where: { id, companyId: user.companyId },
    }));
  } catch (e: any) {
    if (e.code === "P2025") throw new Error("Worker task not found or access denied");
    throw e;
  }

  revalidatePath("/workers");
  await invalidateWorkersCache(user.companyId);
  return { success: true };
}

// ==========================================
// STATS
// ==========================================

export async function getWorkersStats() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  const [
    totalWorkers,
    onboardingWorkers,
    activeWorkers,
    departments,
    onboardingPaths,
  ] = await Promise.all([
    withRetry(() => prisma.worker.count({ where: { companyId: user.companyId, deletedAt: null } })),
    withRetry(() => prisma.worker.count({
      where: { companyId: user.companyId, status: "ONBOARDING", deletedAt: null },
    })),
    withRetry(() => prisma.worker.count({
      where: { companyId: user.companyId, status: "ACTIVE", deletedAt: null },
    })),
    withRetry(() => prisma.department.count({ where: { companyId: user.companyId, deletedAt: null } })),
    withRetry(() => prisma.onboardingPath.count({
      where: { companyId: user.companyId, isActive: true },
    })),
  ]);

  return {
    totalWorkers,
    onboardingWorkers,
    activeWorkers,
    departments,
    onboardingPaths,
  };
}

// P11: Lightweight path summaries (no step details) for worker detail pages
export async function getOnboardingPathSummaries(departmentId?: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  return withRetry(() => prisma.onboardingPath.findMany({
    where: {
      companyId: user.companyId,
      isActive: true,
      ...(departmentId && { departmentId }),
    },
    select: {
      id: true, name: true, departmentId: true, isDefault: true,
      isActive: true, description: true, estimatedDays: true,
      _count: { select: { steps: true } },
    },
    orderBy: { name: "asc" },
    take: 500,
  }));
}

// ==========================================
// ONBOARDING STEP AUTOMATIONS
// ==========================================

interface OnboardingStepAction {
  actionType: string;
  config: Record<string, unknown>;
}

interface StepContext {
  id: number;
  title: string;
  path: { name: string; companyId: number };
}

interface UserContext {
  id: number;
  companyId: number;
  name: string;
}

// Execute automation actions when onboarding step is completed
async function executeOnboardingStepAutomations(
  actions: OnboardingStepAction[],
  step: StepContext,
  user: UserContext,
  workerData?: any,
) {
  if (!actions || !Array.isArray(actions) || actions.length === 0) return;

  const { inngest } = await import("@/lib/inngest/client");

  console.log(
    `[Workers] Executing ${actions.length} automations for step: ${step.title}`,
  );

  for (const action of actions) {
    try {
      switch (action.actionType) {
        case "UPDATE_RECORD":
          await executeUpdateRecordAction(action.config, step.path.companyId);
          break;
        case "CREATE_RECORD":
          await executeCreateRecordAction(action.config, step.path.companyId);
          break;
        case "CREATE_TASK":
          await executeCreateTaskAction(action.config, user);
          break;
        case "UPDATE_TASK":
          await executeUpdateTaskAction(action.config, step.path.companyId);
          break;
        case "CREATE_FINANCE":
          await executeCreateFinanceAction(action.config, step.path.companyId);
          break;
        case "SEND_NOTIFICATION":
          await executeSendNotificationAction(action.config, step, user);
          break;
        case "SEND_WHATSAPP":
          if (workerData) {
            let phoneNumber: string | null = null;

            // Check if phone source is from table
            if (
              action.config.phoneSource === "table" &&
              action.config.waTableId &&
              action.config.waPhoneColumn
            ) {
              // Fetch phone from the specified table
              try {
                let record;
                if (action.config.waRecordId) {
                  // Fetch specific record by ID — only need `data` for phone extraction
                  record = await withRetry(() => prisma.record.findFirst({
                    where: {
                      id: Number(action.config.waRecordId),
                      tableId: Number(action.config.waTableId),
                      companyId: step.path.companyId,
                    },
                    select: { data: true },
                  }));
                } else {
                  // Fetch the last created record from the table — only need `data`
                  record = await withRetry(() => prisma.record.findFirst({
                    where: {
                      tableId: Number(action.config.waTableId),
                      companyId: step.path.companyId,
                    },
                    orderBy: { createdAt: "desc" },
                    select: { data: true },
                  }));
                }

                if (record && record.data) {
                  const recordData = record.data as Record<string, unknown>;
                  phoneNumber = recordData[
                    action.config.waPhoneColumn as string
                  ] as string;
                  console.log(
                    `[Workers] WhatsApp: Fetched phone ${phoneNumber} from table ${action.config.waTableId}, column ${action.config.waPhoneColumn}`,
                  );
                } else {
                  console.warn(
                    `[Workers] WhatsApp: Record not found in table ${action.config.waTableId}`,
                  );
                }
              } catch (fetchError) {
                console.error(
                  "[Workers] WhatsApp: Error fetching phone from table:",
                  fetchError,
                );
              }
            } else {
              // Manual phone entry
              phoneNumber = action.config.phone as string;
            }

            if (phoneNumber) {
              try {
                await inngest.send({
                  id: `wa-worker-${step.path.companyId}-${phoneNumber}-${step.id}-${Math.floor(Date.now() / 5000)}`,
                  name: "automation/send-whatsapp",
                  data: {
                    companyId: step.path.companyId,
                    phone: String(phoneNumber),
                    content: action.config.message || "",
                    messageType: action.config.messageType,
                    mediaFileId: action.config.mediaFileId,
                    delay: action.config.delay,
                  },
                });
              } catch (err) {
                console.error("[Workers] Failed to enqueue WhatsApp job:", err);
              }
            } else {
              console.warn(
                "[Workers] WhatsApp: No valid phone number available",
              );
            }
          }
          break;
        case "WEBHOOK":
          if (workerData) {
            const webhookData = {
              ...workerData,
              stepId: step.id,
              stepTitle: step.title,
              pathName: step.path.name,
              actorName: user.name,
            };
            const webhookUrl = action.config.webhookUrl || action.config.url;
            if (webhookUrl) {
              try {
                await inngest.send({
                  id: `webhook-worker-${step.path.companyId}-${step.id}-${Math.floor(Date.now() / 5000)}`,
                  name: "automation/send-webhook",
                  data: {
                    url: webhookUrl,
                    companyId: step.path.companyId,
                    ruleId: 0,
                    payload: {
                      ruleId: 0,
                      ruleName: `Onboarding: ${step.title}`,
                      triggerType: "ONBOARDING_STEP_COMPLETED",
                      companyId: step.path.companyId,
                      data: webhookData,
                    },
                  },
                });
              } catch (err) {
                console.error("[Workers] Failed to enqueue Webhook job:", err);
              }
            } else {
              console.error("[Workers] Webhook: No URL configured");
            }
          }
          break;
        case "CREATE_CALENDAR_EVENT":
          await executeCreateCalendarEventAction(action.config, user);
          break;
        default:
          console.warn(`[Workers] Unknown action type: ${action.actionType}`);
      }
    } catch (error) {
      console.error(
        `[Workers] Failed to execute ${action.actionType} for step "${step.title}" (path "${step.path.name}", company ${step.path.companyId}):`,
        error,
      );
    }
  }
}

// Create a calendar event
async function executeCreateCalendarEventAction(
  config: Record<string, unknown>,
  user: UserContext,
) {
  const { createCalendarEvent } = await import("./calendar");
  const { title, description, startTime, endTime, color } = config as {
    title?: string;
    description?: string;
    startTime?: string;
    endTime?: string;
    color?: string;
  };

  if (!title || !startTime || !endTime) return;

  await createCalendarEvent({
    title,
    description: description || undefined,
    startTime,
    endTime,
    color: color || undefined,
  });

  console.log(`[Workers] Created calendar event: ${title}`);
}

// Update a record in a table
async function executeUpdateRecordAction(
  config: Record<string, unknown>,
  companyId: number,
) {
  const { tableId, recordId, updates } = config as {
    tableId: number;
    recordId: number;
    updates: Record<string, unknown>;
  };

  if (!tableId || !recordId || !updates) return;

  // Verify record belongs to company
  const record = await withRetry(() => prisma.record.findFirst({
    where: { id: recordId, tableId, companyId },
    select: { id: true, data: true },
  }));

  if (!record) {
    console.warn(`[Workers] Record ${recordId} not found or unauthorized`);
    return;
  }

  const currentData = record.data as Record<string, unknown>;
  const newData = { ...currentData, ...updates };

  await withRetry(() => prisma.record.update({
    where: { id: recordId, companyId },
    data: { data: JSON.parse(JSON.stringify(newData)) },
  }));

  console.log(`[Workers] Updated record ${recordId} in table ${tableId}`);
}

// Create a new record in a table
async function executeCreateRecordAction(
  config: Record<string, unknown>,
  companyId: number,
) {
  const { tableId, values } = config as {
    tableId: number;
    values: Record<string, unknown>;
  };

  if (!tableId) return;

  // SECURITY: Validate tableId belongs to same company
  const tableOk = await withRetry(() => prisma.tableMeta.findFirst({
    where: { id: tableId, companyId },
    select: { id: true },
  }));
  if (!tableOk) return;

  await withRetry(() => prisma.record.create({
    data: {
      tableId,
      companyId,
      data: values ? JSON.parse(JSON.stringify(values)) : {},
    },
  }));

  console.log(`[Workers] Created record in table ${tableId}`);
}

// Create a new task
async function executeCreateTaskAction(
  config: Record<string, unknown>,
  user: UserContext,
) {
  const { title, description, status, priority, assigneeId, dueDate } =
    config as {
      title?: string;
      description?: string;
      status?: string;
      priority?: string;
      assigneeId?: number;
      dueDate?: string;
    };

  if (!title) return;

  // SECURITY: Validate assigneeId at execution time
  let validatedAssigneeId: number | null = null;
  if (assigneeId) {
    const ok = await validateUserInCompany(assigneeId, user.companyId);
    if (ok) validatedAssigneeId = assigneeId;
  }

  await withRetry(() => prisma.task.create({
    data: {
      companyId: user.companyId,
      title,
      description: description || null,
      status: status || "todo",
      priority: priority || null,
      assigneeId: validatedAssigneeId,
      dueDate: dueDate ? new Date(dueDate) : null,
    },
  }));

  console.log(`[Workers] Created task: ${title}`);
  revalidatePath("/tasks");
}

// Update an existing task
async function executeUpdateTaskAction(config: Record<string, unknown>, companyId: number) {
  const { taskId, updates } = config as {
    taskId: string;
    updates: Record<string, unknown>;
  };

  if (!taskId || !updates) return;

  const updateData: Record<string, unknown> = {};
  if (updates.status !== undefined) updateData.status = updates.status;
  if (updates.priority !== undefined) updateData.priority = updates.priority;
  if (updates.assigneeId !== undefined)
    updateData.assigneeId = updates.assigneeId;
  if (updates.title !== undefined) updateData.title = updates.title;
  if (updates.description !== undefined)
    updateData.description = updates.description;

  await withRetry(() => prisma.task.update({
    where: { id: taskId, companyId },
    data: updateData,
  }));

  console.log(`[Workers] Updated task ${taskId}`);
  revalidatePath("/tasks");
}

// Create a finance record
async function executeCreateFinanceAction(
  config: Record<string, unknown>,
  companyId: number,
) {
  const { title, amount, type, category, clientId, description } = config as {
    title?: string;
    amount?: number;
    type?: string;
    category?: string;
    clientId?: number;
    description?: string;
  };

  if (!title || !amount || !type) return;

  // SECURITY: Validate clientId belongs to same company
  let validatedClientId: number | null = null;
  if (clientId) {
    const clientOk = await withRetry(() => prisma.client.findFirst({
      where: { id: clientId, companyId },
      select: { id: true },
    }));
    if (clientOk) validatedClientId = clientId;
  }

  await withRetry(() => prisma.financeRecord.create({
    data: {
      companyId,
      title,
      amount,
      type, // "INCOME" or "EXPENSE"
      category: category || null,
      clientId: validatedClientId,
      description: description || null,
      status: "COMPLETED",
    },
  }));

  console.log(`[Workers] Created finance record: ${title} - ${amount}`);
  revalidatePath("/finance");
}

// Send a notification
async function executeSendNotificationAction(
  config: Record<string, unknown>,
  step: StepContext,
  user: UserContext,
) {
  const { recipientId, title, message } = config as {
    recipientId?: number;
    title?: string;
    message?: string;
  };

  if (!recipientId) return;

  // SECURITY: Validate recipientId belongs to the same company before sending
  if (!(await validateUserInCompany(recipientId, step.path.companyId))) {
    console.warn(`[Workers] Notification recipient ${recipientId} not in company ${step.path.companyId}`);
    return;
  }

  // Replace placeholders
  const finalTitle = (title || "שלב קליטה הושלם")
    .replace("{stepTitle}", step.title)
    .replace("{pathName}", step.path.name)
    .replace("{userName}", user.name);

  const finalMessage = (message || "השלב {stepTitle} הושלם על ידי {userName}")
    .replace("{stepTitle}", step.title)
    .replace("{pathName}", step.path.name)
    .replace("{userName}", user.name);

  const { createNotificationForCompany } = await import("./notifications");
  await createNotificationForCompany({
    companyId: step.path.companyId,
    userId: recipientId,
    title: finalTitle,
    message: finalMessage,
    link: "/workers",
  });

  console.log(`[Workers] Sent notification to user ${recipientId}`);
}

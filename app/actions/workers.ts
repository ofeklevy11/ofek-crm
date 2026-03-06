"use server";

import type { WorkerStatus, OnboardingStepType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withRetry } from "@/lib/db-retry";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { validateUserInCompany, validateWorkerInCompany } from "@/lib/company-validation";
import { redis } from "@/lib/redis";
import {
  checkServerActionRateLimit,
  WORKER_RATE_LIMITS,
  validateStringLength,
  validateJsonValue,
  validateUrl,
  validateWebhookUrl,
  validateOnCompleteActions,
  wrapPrismaError,
  validateNonNegativeInt,
  MAX_LENGTHS,
} from "@/lib/server-action-utils";
import { createLogger } from "@/lib/logger";

const log = createLogger("Workers");

// -- Status validation --
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

// -- Permission helpers --
function requireManageWorkers(user: { role: string; permissions?: Record<string, boolean> }): void {
  if (!hasUserFlag(user as any, "canManageWorkers")) {
    throw new Error("Permission denied");
  }
}

function requireViewWorkers(user: { role: string; permissions?: Record<string, boolean> }): void {
  if (!hasUserFlag(user as any, "canViewWorkers")) {
    throw new Error("Permission denied");
  }
}

// -- Cache helpers --
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

async function invalidateDepartmentsCache(companyId: number) {
  try {
    await redis.del(`workers:${companyId}:departments`);
  } catch { /* non-critical */ }
}

async function invalidatePathsCache(companyId: number) {
  try {
    const prefix = redis.options.keyPrefix || "";
    const prefixLen = prefix.length;
    const pattern = `workers:${companyId}:paths*`;
    let cursor = "0";
    let iterations = 0;
    do {
      const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        const pipeline = redis.pipeline();
        for (const key of keys) {
          pipeline.del(key.slice(prefixLen));
        }
        await pipeline.exec();
      }
      iterations++;
      if (iterations >= 1000) break;
    } while (cursor !== "0");
  } catch { /* non-critical */ }
}

async function invalidateWorkersCache(companyId: number) {
  await Promise.all([
    invalidateDepartmentsCache(companyId),
    invalidatePathsCache(companyId),
  ]);
}

// ==========================================
// DEPARTMENTS
// ==========================================

export async function getDepartments() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  requireViewWorkers(user);

  await checkServerActionRateLimit(String(user.id), WORKER_RATE_LIMITS.read);

  return getCached(`workers:${user.companyId}:departments`, () =>
    withRetry(() => prisma.department.findMany({
      where: { companyId: user.companyId, deletedAt: null },
      select: {
        id: true, name: true, description: true, color: true, icon: true,
        managerId: true, isActive: true, createdAt: true, updatedAt: true,
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
  requireViewWorkers(user);

  await checkServerActionRateLimit(String(user.id), WORKER_RATE_LIMITS.read);

  return withRetry(() => prisma.department.findFirst({
    where: { id, companyId: user.companyId, deletedAt: null },
    select: {
      id: true, name: true, description: true, color: true, icon: true,
      managerId: true, isActive: true, createdAt: true, updatedAt: true,
      workers: {
        where: { deletedAt: null },
        select: { id: true, firstName: true, lastName: true, status: true, position: true },
        take: 200,
      },
      onboardingPaths: {
        select: {
          id: true, name: true, isDefault: true, isActive: true,
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
  requireManageWorkers(user);
  await checkServerActionRateLimit(String(user.id), WORKER_RATE_LIMITS.mutation);

  // Validate & whitelist fields
  const name = validateStringLength(data.name, MAX_LENGTHS.name, "Department name");
  if (!name) throw new Error("Department name is required");
  const description = validateStringLength(data.description, MAX_LENGTHS.description, "Description");
  const color = validateStringLength(data.color, MAX_LENGTHS.color, "Color");
  const icon = validateStringLength(data.icon, MAX_LENGTHS.icon, "Icon");

  // Validate managerId belongs to same company
  if (data.managerId) {
    if (!(await validateUserInCompany(data.managerId, user.companyId))) {
      throw new Error("Invalid manager");
    }
  }

  try {
    const department = await withRetry(() => prisma.department.create({
      data: {
        name,
        description,
        color,
        icon,
        managerId: data.managerId,
        companyId: user.companyId,
      },
      select: {
        id: true, name: true, description: true, color: true, icon: true,
        managerId: true, isActive: true, createdAt: true, updatedAt: true,
      },
    }));

    revalidatePath("/workers");
    await invalidateDepartmentsCache(user.companyId);
    return department;
  } catch (e: any) {
    wrapPrismaError(e, "Department");
  }
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
  requireManageWorkers(user);
  await checkServerActionRateLimit(String(user.id), WORKER_RATE_LIMITS.mutation);

  // Validate & whitelist fields
  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) updateData.name = validateStringLength(data.name, MAX_LENGTHS.name, "Department name");
  if (data.description !== undefined) updateData.description = validateStringLength(data.description, MAX_LENGTHS.description, "Description");
  if (data.color !== undefined) updateData.color = validateStringLength(data.color, MAX_LENGTHS.color, "Color");
  if (data.icon !== undefined) updateData.icon = validateStringLength(data.icon, MAX_LENGTHS.icon, "Icon");
  if (typeof data.isActive === "boolean") updateData.isActive = data.isActive;

  // Validate managerId belongs to same company
  if (data.managerId !== undefined) {
    if (data.managerId !== null && data.managerId) {
      if (!(await validateUserInCompany(data.managerId, user.companyId))) {
        throw new Error("Invalid manager");
      }
    }
    updateData.managerId = data.managerId;
  }

  try {
    const department = await withRetry(() => prisma.department.update({
      where: { id, companyId: user.companyId, deletedAt: null },
      data: updateData,
      select: {
        id: true, name: true, description: true, color: true, icon: true,
        managerId: true, isActive: true, createdAt: true, updatedAt: true,
      },
    }));

    revalidatePath("/workers");
    await invalidateDepartmentsCache(user.companyId);
    return department;
  } catch (e: any) {
    wrapPrismaError(e, "Department");
  }
}

export async function deleteDepartment(id: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  requireManageWorkers(user);
  await checkServerActionRateLimit(String(user.id), WORKER_RATE_LIMITS.dangerous);

  try {
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
  } catch (e: any) {
    wrapPrismaError(e, "Department");
  }

  revalidatePath("/workers");
  await invalidateDepartmentsCache(user.companyId);
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
  requireViewWorkers(user);

  await checkServerActionRateLimit(String(user.id), WORKER_RATE_LIMITS.read);

  // Validate status filter against enum
  if (filters?.status) {
    validateEnum(filters.status, VALID_WORKER_STATUSES, "worker status filter");
  }

  const pageSize = Math.min(Math.max(1, Math.floor(filters?.pageSize ?? 500)), 500);
  const page = Math.max(1, Math.floor(filters?.page ?? 1));
  const skip = (page - 1) * pageSize;

  const where = {
    companyId: user.companyId,
    deletedAt: null as null,
    ...(filters?.departmentId && { departmentId: filters.departmentId }),
    ...(filters?.status && { status: filters.status as WorkerStatus }),
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
            _count: {
              select: {
                stepProgress: true,
              },
            },
            stepProgress: {
              where: { status: "COMPLETED" },
              select: { stepId: true },
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
  requireViewWorkers(user);

  await checkServerActionRateLimit(String(user.id), WORKER_RATE_LIMITS.read);

  return withRetry(() => prisma.worker.findFirst({
    where: { id, companyId: user.companyId, deletedAt: null },
    select: {
      id: true, firstName: true, lastName: true, email: true, phone: true,
      avatar: true, position: true, employeeId: true, status: true,
      startDate: true, endDate: true, notes: true, customFields: true,
      departmentId: true, linkedUserId: true, createdAt: true, updatedAt: true,
      department: {
        select: { id: true, name: true, description: true, color: true, icon: true, managerId: true, isActive: true },
      },
      onboardingProgress: {
        select: {
          id: true, pathId: true, workerId: true, status: true, completedAt: true, createdAt: true,
          path: {
            select: {
              id: true, name: true, description: true, departmentId: true,
              isDefault: true, isActive: true, estimatedDays: true,
              steps: {
                orderBy: { order: "asc" },
                select: {
                  id: true, pathId: true, title: true, description: true, type: true,
                  order: true, estimatedMinutes: true, resourceUrl: true,
                  resourceType: true, isRequired: true, onCompleteActions: true,
                },
              },
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
        select: {
          id: true, title: true, description: true, priority: true,
          status: true, dueDate: true, completedAt: true,
          createdAt: true, updatedAt: true,
        },
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
  requireManageWorkers(user);
  await checkServerActionRateLimit(String(user.id), WORKER_RATE_LIMITS.mutation);

  // Validate & whitelist fields
  const firstName = validateStringLength(data.firstName, MAX_LENGTHS.name, "First name");
  if (!firstName) throw new Error("First name is required");
  const lastName = validateStringLength(data.lastName, MAX_LENGTHS.name, "Last name");
  if (!lastName) throw new Error("Last name is required");
  const email = validateStringLength(data.email, MAX_LENGTHS.email, "Email");
  const phone = validateStringLength(data.phone, MAX_LENGTHS.phone, "Phone");
  const position = validateStringLength(data.position, MAX_LENGTHS.position, "Position");
  const employeeId = validateStringLength(data.employeeId, MAX_LENGTHS.employeeId, "Employee ID");
  const notes = validateStringLength(data.notes, MAX_LENGTHS.notes, "Notes");

  // Validate FK refs
  const dept = await withRetry(() => prisma.department.findFirst({
    where: { id: data.departmentId, companyId: user.companyId, deletedAt: null },
    select: { id: true },
  }));
  if (!dept) throw new Error("Department not found or access denied");

  if (data.linkedUserId) {
    if (!(await validateUserInCompany(data.linkedUserId, user.companyId))) {
      throw new Error("Invalid linked user");
    }
  }

  try {
    const worker = await withRetry(() => prisma.$transaction(async (tx) => {
      const w = await tx.worker.create({
        data: {
          firstName,
          lastName,
          email,
          phone,
          position,
          employeeId,
          notes,
          departmentId: data.departmentId,
          startDate: data.startDate,
          linkedUserId: data.linkedUserId,
          companyId: user.companyId,
          status: "ONBOARDING",
        },
        select: {
          id: true, firstName: true, lastName: true, email: true, phone: true,
          avatar: true, position: true, employeeId: true, status: true,
          startDate: true, endDate: true, notes: true, customFields: true,
          departmentId: true, linkedUserId: true, createdAt: true, updatedAt: true,
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
  } catch (e: any) {
    wrapPrismaError(e, "Worker");
  }
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
    expectedUpdatedAt?: string;
  },
) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  requireManageWorkers(user);
  await checkServerActionRateLimit(String(user.id), WORKER_RATE_LIMITS.mutation);

  const { expectedUpdatedAt, customFields: rawCustomFields, ...rest } = data;

  // Validate status
  validateEnum(rest.status, VALID_WORKER_STATUSES, "worker status");

  // Validate & whitelist fields
  const updateData: Record<string, unknown> = {};
  if (rest.firstName !== undefined) updateData.firstName = validateStringLength(rest.firstName, MAX_LENGTHS.name, "First name");
  if (rest.lastName !== undefined) updateData.lastName = validateStringLength(rest.lastName, MAX_LENGTHS.name, "Last name");
  if (rest.email !== undefined) updateData.email = validateStringLength(rest.email, MAX_LENGTHS.email, "Email");
  if (rest.phone !== undefined) updateData.phone = validateStringLength(rest.phone, MAX_LENGTHS.phone, "Phone");
  if (rest.position !== undefined) updateData.position = validateStringLength(rest.position, MAX_LENGTHS.position, "Position");
  if (rest.employeeId !== undefined) updateData.employeeId = validateStringLength(rest.employeeId, MAX_LENGTHS.employeeId, "Employee ID");
  if (rest.notes !== undefined) updateData.notes = validateStringLength(rest.notes, MAX_LENGTHS.notes, "Notes");
  if (rest.avatar !== undefined) updateData.avatar = validateStringLength(rest.avatar, MAX_LENGTHS.avatar, "Avatar");
  if (rest.status !== undefined) updateData.status = rest.status;
  if (rest.startDate !== undefined) updateData.startDate = rest.startDate;
  if (rest.endDate !== undefined) updateData.endDate = rest.endDate;

  // Validate customFields JSON
  if (rawCustomFields !== undefined) {
    updateData.customFields = validateJsonValue(rawCustomFields, 3, 51200, "Custom fields");
  }

  // Validate departmentId belongs to user's company
  if (rest.departmentId !== undefined) {
    const dept = await withRetry(() => prisma.department.findFirst({
      where: { id: rest.departmentId, companyId: user.companyId, deletedAt: null },
      select: { id: true },
    }));
    if (!dept) throw new Error("Department not found or access denied");
    updateData.departmentId = rest.departmentId;
  }

  // Validate linkedUserId belongs to same company
  if (rest.linkedUserId !== undefined) {
    if (rest.linkedUserId) {
      if (!(await validateUserInCompany(rest.linkedUserId, user.companyId))) {
        throw new Error("Invalid linked user");
      }
    }
    updateData.linkedUserId = rest.linkedUserId;
  }

  try {
    const worker = await withRetry(() => prisma.$transaction(async (tx) => {
      // Optimistic lock check
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
        data: updateData,
        select: {
          id: true, firstName: true, lastName: true, email: true, phone: true,
          avatar: true, position: true, employeeId: true, status: true,
          startDate: true, endDate: true, notes: true, customFields: true,
          departmentId: true, linkedUserId: true, createdAt: true, updatedAt: true,
        },
      });
    }, { maxWait: 5000, timeout: 10000 }));

    revalidatePath("/workers");
    return worker;
  } catch (e: any) {
    wrapPrismaError(e, "Worker");
  }
}

export async function deleteWorker(id: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  requireManageWorkers(user);
  await checkServerActionRateLimit(String(user.id), WORKER_RATE_LIMITS.dangerous);

  try {
    await withRetry(() => prisma.worker.update({
      where: { id, companyId: user.companyId, deletedAt: null },
      data: { deletedAt: new Date() },
    }));
  } catch (e: any) {
    wrapPrismaError(e, "Worker");
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
  requireViewWorkers(user);

  await checkServerActionRateLimit(String(user.id), WORKER_RATE_LIMITS.read);

  return getCached(
    `workers:${user.companyId}:paths${departmentId ? `:${departmentId}` : ""}`,
    () => withRetry(() => prisma.onboardingPath.findMany({
      where: {
        companyId: user.companyId,
        ...(departmentId && { departmentId }),
      },
      select: {
        id: true, name: true, description: true, departmentId: true,
        isDefault: true, isActive: true, estimatedDays: true,
        createdAt: true, updatedAt: true,
        department: {
          select: { id: true, name: true, color: true },
        },
        steps: {
          select: {
            id: true, pathId: true, title: true, description: true,
            type: true, order: true, estimatedMinutes: true,
            resourceUrl: true, resourceType: true, isRequired: true,
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
  requireViewWorkers(user);

  await checkServerActionRateLimit(String(user.id), WORKER_RATE_LIMITS.read);

  return withRetry(() => prisma.onboardingPath.findFirst({
    where: { id, companyId: user.companyId },
    select: {
      id: true, name: true, description: true, departmentId: true,
      isDefault: true, isActive: true, estimatedDays: true,
      createdAt: true, updatedAt: true,
      department: {
        select: { id: true, name: true, description: true, color: true, icon: true, managerId: true, isActive: true },
      },
      steps: {
        orderBy: { order: "asc" },
        select: {
          id: true, title: true, description: true, type: true,
          order: true, estimatedMinutes: true, isRequired: true,
          resourceUrl: true, resourceType: true, onCompleteActions: true,
        },
      },
      workerProgress: {
        select: {
          id: true, pathId: true, workerId: true, status: true,
          completedAt: true, createdAt: true,
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
  requireManageWorkers(user);
  await checkServerActionRateLimit(String(user.id), WORKER_RATE_LIMITS.mutation);

  // Validate & whitelist path fields
  const name = validateStringLength(data.name, MAX_LENGTHS.name, "Path name");
  if (!name) throw new Error("Path name is required");
  const description = validateStringLength(data.description, MAX_LENGTHS.description, "Description");

  const estimatedDays = validateNonNegativeInt(data.estimatedDays, "Estimated days");

  // Cross-tenant departmentId validation
  if (data.departmentId) {
    const dept = await withRetry(() => prisma.department.findFirst({
      where: { id: data.departmentId, companyId: user.companyId, deletedAt: null },
      select: { id: true },
    }));
    if (!dept) throw new Error("Department not found or access denied");
  }

  // Validate & whitelist step fields
  const stepsData = data.steps;
  if (stepsData && stepsData.length > 200) {
    throw new Error("Onboarding path can have at most 200 steps");
  }
  if (stepsData?.length) {
    for (const s of stepsData) {
      validateEnum(s.type, VALID_STEP_TYPES, "step type");
    }
  }

  const validatedSteps = stepsData?.map((s, i) => ({
    title: validateStringLength(s.title, MAX_LENGTHS.title, `Step ${i} title`) || "",
    description: validateStringLength(s.description, MAX_LENGTHS.description, `Step ${i} description`),
    type: s.type as OnboardingStepType | undefined,
    order: validateNonNegativeInt(s.order, `Step ${i} order`) ?? i,
    estimatedMinutes: validateNonNegativeInt(s.estimatedMinutes, `Step ${i} estimatedMinutes`),
    resourceUrl: validateUrl(s.resourceUrl, `Step ${i} resourceUrl`),
    resourceType: validateStringLength(s.resourceType, MAX_LENGTHS.resourceType, `Step ${i} resourceType`),
    isRequired: s.isRequired,
    onCompleteActions: s.onCompleteActions !== undefined
      ? validateOnCompleteActions(s.onCompleteActions)
      : undefined,
  }));

  try {
    const path = await withRetry(() => prisma.$transaction(async (tx) => {
      // If setting as default, unset other defaults for this department
      if (data.isDefault && data.departmentId) {
        await tx.onboardingPath.updateMany({
          where: {
            companyId: user.companyId,
            departmentId: data.departmentId,
            isDefault: true,
          },
          data: { isDefault: false },
        });
      }

      const created = await tx.onboardingPath.create({
        data: {
          name,
          description,
          departmentId: data.departmentId,
          isDefault: data.isDefault,
          isActive: data.isActive,
          estimatedDays,
          companyId: user.companyId,
        },
      });

      if (validatedSteps?.length) {
        await tx.onboardingStep.createMany({
          data: validatedSteps.map((s) => ({
            ...s,
            pathId: created.id,
            companyId: user.companyId,
          })),
        });
      }

      return created;
    }, { maxWait: 5000, timeout: 10000 }));

    revalidatePath("/workers");
    await invalidateWorkersCache(user.companyId);
    return path;
  } catch (e: any) {
    wrapPrismaError(e, "Onboarding path");
  }
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
  requireManageWorkers(user);
  await checkServerActionRateLimit(String(user.id), WORKER_RATE_LIMITS.mutation);

  // Validate & whitelist fields
  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) updateData.name = validateStringLength(data.name, MAX_LENGTHS.name, "Path name");
  if (data.description !== undefined) updateData.description = validateStringLength(data.description, MAX_LENGTHS.description, "Description");
  if (typeof data.isDefault === "boolean") updateData.isDefault = data.isDefault;
  if (typeof data.isActive === "boolean") updateData.isActive = data.isActive;
  if (data.estimatedDays !== undefined) updateData.estimatedDays = validateNonNegativeInt(data.estimatedDays, "Estimated days");

  // Cross-tenant departmentId validation
  if (data.departmentId !== undefined) {
    if (data.departmentId) {
      const dept = await withRetry(() => prisma.department.findFirst({
        where: { id: data.departmentId, companyId: user.companyId, deletedAt: null },
        select: { id: true },
      }));
      if (!dept) throw new Error("Department not found or access denied");
    }
    updateData.departmentId = data.departmentId;
  }

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
        data: updateData,
      });
    }, { maxWait: 5000, timeout: 10000 }));

    revalidatePath("/workers");
    await invalidatePathsCache(user.companyId);
    return path;
  } catch (e: any) {
    wrapPrismaError(e, "Onboarding path");
  }
}

export async function deleteOnboardingPath(id: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  requireManageWorkers(user);
  await checkServerActionRateLimit(String(user.id), WORKER_RATE_LIMITS.dangerous);

  try {
    await withRetry(() => prisma.$transaction(async (tx) => {
      await tx.workerOnboarding.deleteMany({
        where: { pathId: id, path: { companyId: user.companyId } },
      });

      await tx.onboardingPath.delete({
        where: { id, companyId: user.companyId },
      });
    }, { maxWait: 5000, timeout: 10000 }));
  } catch (e: any) {
    wrapPrismaError(e, "Onboarding path");
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
  requireManageWorkers(user);
  await checkServerActionRateLimit(String(user.id), WORKER_RATE_LIMITS.mutation);

  // Validate step type
  validateEnum(data.type, VALID_STEP_TYPES, "step type");

  // Validate & whitelist fields
  const title = validateStringLength(data.title, MAX_LENGTHS.title, "Step title");
  if (!title) throw new Error("Step title is required");
  const description = validateStringLength(data.description, MAX_LENGTHS.description, "Description");
  const resourceUrl = validateUrl(data.resourceUrl, "Resource URL");
  const resourceType = validateStringLength(data.resourceType, MAX_LENGTHS.resourceType, "Resource type");

  // Validate numeric fields
  const estimatedMinutes = validateNonNegativeInt(data.estimatedMinutes, "Estimated minutes");
  const validatedOrder = validateNonNegativeInt(data.order, "Order");

  // Verify pathId belongs to user's company
  const path = await withRetry(() => prisma.onboardingPath.findFirst({
    where: { id: data.pathId, companyId: user.companyId },
    select: { id: true },
  }));
  if (!path) throw new Error("Onboarding path not found or access denied");

  // Get max order if not specified
  let order = validatedOrder;
  if (order === undefined) {
    const maxOrder = await withRetry(() => prisma.onboardingStep.aggregate({
      where: { pathId: data.pathId, companyId: user.companyId },
      _max: { order: true },
    }));
    order = (maxOrder._max.order ?? -1) + 1;
  }

  try {
    const step = await withRetry(() => prisma.onboardingStep.create({
      data: {
        title,
        description,
        type: data.type as OnboardingStepType | undefined,
        order,
        estimatedMinutes,
        resourceUrl,
        resourceType,
        isRequired: data.isRequired,
        pathId: data.pathId,
        companyId: user.companyId,
      },
      select: {
        id: true, title: true, description: true, type: true, order: true,
        estimatedMinutes: true, resourceUrl: true, resourceType: true,
        isRequired: true, pathId: true, onCompleteActions: true,
        createdAt: true, updatedAt: true,
      },
    }));

    revalidatePath("/workers");
    await invalidatePathsCache(user.companyId);
    return step;
  } catch (e: any) {
    wrapPrismaError(e, "Onboarding step");
  }
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
  requireManageWorkers(user);
  await checkServerActionRateLimit(String(user.id), WORKER_RATE_LIMITS.mutation);

  // Validate step type
  validateEnum(data.type, VALID_STEP_TYPES, "step type");

  // Validate & whitelist fields
  const updateData: Record<string, unknown> = {};
  if (data.title !== undefined) updateData.title = validateStringLength(data.title, MAX_LENGTHS.title, "Step title");
  if (data.description !== undefined) updateData.description = validateStringLength(data.description, MAX_LENGTHS.description, "Description");
  if (data.type !== undefined) updateData.type = data.type;
  if (data.order !== undefined) updateData.order = validateNonNegativeInt(data.order, "Order");
  if (data.estimatedMinutes !== undefined) updateData.estimatedMinutes = validateNonNegativeInt(data.estimatedMinutes, "Estimated minutes");
  if (data.resourceUrl !== undefined) updateData.resourceUrl = validateUrl(data.resourceUrl, "Resource URL");
  if (data.resourceType !== undefined) updateData.resourceType = validateStringLength(data.resourceType, MAX_LENGTHS.resourceType, "Resource type");
  if (typeof data.isRequired === "boolean") updateData.isRequired = data.isRequired;

  // Validate onCompleteActions
  if (data.onCompleteActions !== undefined) {
    updateData.onCompleteActions = validateOnCompleteActions(data.onCompleteActions);
  }

  try {
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
        data: updateData,
        select: {
          id: true, title: true, description: true, type: true, order: true,
          estimatedMinutes: true, resourceUrl: true, resourceType: true,
          isRequired: true, pathId: true, onCompleteActions: true,
          createdAt: true, updatedAt: true,
        },
      });
    }, { maxWait: 5000, timeout: 10000 }));

    revalidatePath("/workers");
    await invalidatePathsCache(user.companyId);
    return step;
  } catch (e: any) {
    wrapPrismaError(e, "Onboarding step");
  }
}

export async function deleteOnboardingStep(id: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  requireManageWorkers(user);
  await checkServerActionRateLimit(String(user.id), WORKER_RATE_LIMITS.dangerous);

  try {
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
  } catch (e: any) {
    wrapPrismaError(e, "Onboarding step");
  }

  revalidatePath("/workers");
  await invalidatePathsCache(user.companyId);
  return { success: true };
}

export async function reorderOnboardingSteps(
  pathId: number,
  stepIds: number[],
) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  requireManageWorkers(user);
  await checkServerActionRateLimit(String(user.id), WORKER_RATE_LIMITS.mutation);

  if (stepIds.length > 200) {
    throw new Error("Too many steps to reorder");
  }

  try {
    await withRetry(() => prisma.$transaction(async (tx) => {
      const path = await tx.onboardingPath.findFirst({
        where: { id: pathId, companyId: user.companyId },
        select: { id: true },
      });
      if (!path) throw new Error("Path not found or access denied");

      if (stepIds.length > 0) {
        const params: number[] = [];
        const cases: string[] = [];
        const inPlaceholders: string[] = [];

        stepIds.forEach((id, index) => {
          params.push(id, index);
          const idIdx = params.length - 1;
          const orderIdx = params.length;
          cases.push(`WHEN "id" = $${idIdx}::integer THEN $${orderIdx}::integer`);
          inPlaceholders.push(`$${idIdx}::integer`);
        });

        params.push(pathId, user.companyId);
        const pathIdx = params.length - 1;
        const companyIdx = params.length;

        await tx.$executeRawUnsafe(
          `UPDATE "OnboardingStep" SET "order" = CASE ${cases.join(" ")} END, "updatedAt" = NOW()
           WHERE "pathId" = $${pathIdx}::integer AND "companyId" = $${companyIdx}::integer AND "id" IN (${inPlaceholders.join(", ")})`,
          ...params,
        );
      }
    }, { maxWait: 5000, timeout: 10000 }));
  } catch (e: any) {
    wrapPrismaError(e, "Onboarding steps");
  }

  revalidatePath("/workers");
  await invalidatePathsCache(user.companyId);
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
  requireManageWorkers(user);
  await checkServerActionRateLimit(String(user.id), WORKER_RATE_LIMITS.mutation);

  const [path, worker] = await Promise.all([
    withRetry(() => prisma.onboardingPath.findFirst({
      where: { id: pathId, companyId: user.companyId },
      select: { id: true, steps: { select: { id: true } } },
    })),
    withRetry(() => prisma.worker.findFirst({
      where: { id: workerId, companyId: user.companyId, deletedAt: null },
      select: { id: true },
    })),
  ]);
  if (!path) throw new Error("Onboarding path not found");
  if (!worker) throw new Error("Worker not found or access denied");

  try {
    const onboarding = await _assignOnboardingPathInternal(
      workerId,
      pathId,
      path.steps.map((s) => s.id),
      user.companyId,
    );

    revalidatePath("/workers");
    await invalidatePathsCache(user.companyId);
    return onboarding;
  } catch (e: any) {
    wrapPrismaError(e, "Onboarding assignment");
  }
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
  requireManageWorkers(user);
  await checkServerActionRateLimit(String(user.id), WORKER_RATE_LIMITS.mutation);

  // Validate step status
  validateEnum(data.status, VALID_STEP_STATUSES, "step status");

  // Validate string fields
  const notes = validateStringLength(data.notes, MAX_LENGTHS.notes, "Notes");
  const feedback = validateStringLength(data.feedback, MAX_LENGTHS.feedback, "Feedback");

  // Validate score range
  if (data.score !== undefined) {
    if (typeof data.score !== "number" || !Number.isFinite(data.score) || data.score < 0 || data.score > 100) {
      throw new Error("Score must be between 0 and 100");
    }
  }

  // Validate step + onboarding ownership in parallel
  const [step, onboardingCheck] = await Promise.all([
    withRetry(() => prisma.onboardingStep.findFirst({
      where: { id: stepId, path: { companyId: user.companyId } },
      select: {
        id: true,
        title: true,
        onCompleteActions: true,
        path: {
          select: { name: true, companyId: true },
        },
      },
    })),
    withRetry(() => prisma.workerOnboarding.findFirst({
      where: { id: onboardingId, worker: { companyId: user.companyId } },
      select: { id: true, workerId: true },
    })),
  ]);

  if (!step) throw new Error("Step not found or access denied");
  if (!onboardingCheck) throw new Error("Onboarding not found or access denied");

  // Wrap upsert in transaction to detect if status actually changed
  let stepProgress, statusChanged;
  try {
    const result = await withRetry(() => prisma.$transaction(async (tx) => {
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
          status: data.status as any,
          notes,
          score: data.score,
          feedback,
          completedAt: data.status === "COMPLETED" ? new Date() : null,
        },
        create: {
          companyId: user.companyId,
          onboardingId,
          stepId,
          status: data.status as any,
          notes,
          score: data.score,
          feedback,
          completedAt: data.status === "COMPLETED" ? new Date() : null,
        },
        select: {
          id: true, onboardingId: true, stepId: true, status: true,
          notes: true, score: true, feedback: true, completedAt: true,
          createdAt: true, updatedAt: true,
        },
      });

      const wasUncompleted = wasAlreadyCompleted && data.status !== "COMPLETED";
      return { stepProgress: sp, statusChanged: (data.status === "COMPLETED" && !wasAlreadyCompleted) || wasUncompleted };
    }, { maxWait: 5000, timeout: 10000 }));
    stepProgress = result.stepProgress;
    statusChanged = result.statusChanged;
  } catch (e: any) {
    wrapPrismaError(e, "Step progress");
  }

  // Only run automations if this request actually caused the transition
  if (statusChanged) {
    let lockAcquired = false;
    try {
      const result = await redis.set(`workers:step-lock:${onboardingId}:${stepId}`, "1", "EX", 30, "NX");
      lockAcquired = result === "OK";
    } catch { lockAcquired = true; /* Redis down — proceed */ }

    if (lockAcquired) {
      const onboarding = await withRetry(() => prisma.workerOnboarding.findFirst({
        where: { id: onboardingId },
        select: {
          id: true,
          status: true,
          worker: {
            select: { id: true, firstName: true, lastName: true, email: true, phone: true, position: true, status: true, departmentId: true },
          },
          path: {
            select: {
              id: true,
              name: true,
              companyId: true,
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
            log.debug("Executing automations for step", { count: actions.length, stepTitle: step.title });

            await executeOnboardingStepAutomations(
              actions,
              step,
              user,
              onboarding.worker,
            );
          }
        } catch (autoError) {
          log.error("Error executing automations", { error: String(autoError) });
        }
      }

      // Check onboarding completion
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
  requireViewWorkers(user);

  await checkServerActionRateLimit(String(user.id), WORKER_RATE_LIMITS.read);

  const [path, workerProgress] = await Promise.all([
    withRetry(() => prisma.onboardingPath.findFirst({
      where: { id: pathId, companyId: user.companyId },
      select: {
        _count: { select: { steps: true } },
      },
    })),
    withRetry(() => prisma.workerOnboarding.findMany({
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
        stepProgress: { where: { status: "COMPLETED" }, select: { stepId: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    })),
  ]);
  if (!path) throw new Error("Path not found or access denied");

  const totalSteps = path._count.steps;

  return workerProgress.map((wp) => {
    const completedSteps = Math.min(wp.stepProgress.length, totalSteps);
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

// Lazy-load step progress for a specific onboarding (used by expanded rows in WorkersList)
export async function getWorkerStepProgress(onboardingId: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  requireViewWorkers(user);

  await checkServerActionRateLimit(String(user.id), WORKER_RATE_LIMITS.read);

  return withRetry(() => prisma.workerOnboardingStep.findMany({
    where: {
      onboardingId,
      onboarding: { worker: { companyId: user.companyId, deletedAt: null } },
    },
    select: { stepId: true, status: true },
    orderBy: { stepId: "asc" },
  }));
}

// ==========================================
// WORKER TASKS
// ==========================================

export async function getWorkerTasks(workerId?: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  requireViewWorkers(user);

  await checkServerActionRateLimit(String(user.id), WORKER_RATE_LIMITS.read);

  return withRetry(() => prisma.workerTask.findMany({
    where: {
      companyId: user.companyId,
      ...(workerId && { workerId }),
      worker: { deletedAt: null },
    },
    select: {
      id: true, workerId: true, title: true, description: true,
      priority: true, status: true, dueDate: true, completedAt: true,
      createdAt: true, updatedAt: true,
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
  requireManageWorkers(user);
  await checkServerActionRateLimit(String(user.id), WORKER_RATE_LIMITS.mutation);

  // Validate priority
  validateEnum(data.priority, VALID_TASK_PRIORITIES, "task priority");

  // Validate & whitelist fields
  const title = validateStringLength(data.title, MAX_LENGTHS.title, "Task title");
  if (!title) throw new Error("Task title is required");
  const description = validateStringLength(data.description, MAX_LENGTHS.description, "Description");

  // Validate workerId belongs to same company
  if (!(await validateWorkerInCompany(data.workerId, user.companyId))) {
    throw new Error("Worker not found or access denied");
  }

  try {
    const task = await withRetry(() => prisma.workerTask.create({
      data: {
        title,
        description,
        priority: data.priority as any,
        dueDate: data.dueDate,
        workerId: data.workerId,
        companyId: user.companyId,
      },
      select: {
        id: true, workerId: true, title: true, description: true,
        priority: true, status: true, dueDate: true, completedAt: true,
        createdAt: true, updatedAt: true,
      },
    }));

    revalidatePath("/workers");
    return task;
  } catch (e: any) {
    wrapPrismaError(e, "Worker task");
  }
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
  requireManageWorkers(user);
  await checkServerActionRateLimit(String(user.id), WORKER_RATE_LIMITS.mutation);

  // Validate status and priority
  validateEnum(data.status, VALID_TASK_STATUSES, "task status");
  validateEnum(data.priority, VALID_TASK_PRIORITIES, "task priority");

  // Validate & whitelist fields
  const updateData: Record<string, unknown> = {};
  if (data.title !== undefined) updateData.title = validateStringLength(data.title, MAX_LENGTHS.title, "Task title");
  if (data.description !== undefined) updateData.description = validateStringLength(data.description, MAX_LENGTHS.description, "Description");
  if (data.priority !== undefined) updateData.priority = data.priority;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.dueDate !== undefined) updateData.dueDate = data.dueDate;

  // Auto-set completedAt if marking as completed
  if (data.status === "COMPLETED") {
    updateData.completedAt = data.completedAt ?? new Date();
  } else if (data.completedAt !== undefined) {
    updateData.completedAt = data.completedAt;
  }

  try {
    const task = await withRetry(() => prisma.workerTask.update({
      where: { id, companyId: user.companyId },
      data: updateData,
      select: {
        id: true, workerId: true, title: true, description: true,
        priority: true, status: true, dueDate: true, completedAt: true,
        createdAt: true, updatedAt: true,
      },
    }));

    revalidatePath("/workers");
    return task;
  } catch (e: any) {
    wrapPrismaError(e, "Worker task");
  }
}

export async function deleteWorkerTask(id: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  requireManageWorkers(user);
  await checkServerActionRateLimit(String(user.id), WORKER_RATE_LIMITS.dangerous);

  try {
    await withRetry(() => prisma.workerTask.delete({
      where: { id, companyId: user.companyId },
    }));
  } catch (e: any) {
    wrapPrismaError(e, "Worker task");
  }

  revalidatePath("/workers");
  return { success: true };
}

// ==========================================
// STATS
// ==========================================

export async function getWorkersStats() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  requireViewWorkers(user);

  await checkServerActionRateLimit(String(user.id), WORKER_RATE_LIMITS.read);

  const [
    workersByStatus,
    departments,
    onboardingPaths,
  ] = await Promise.all([
    withRetry(() => prisma.worker.groupBy({
      by: ["status"],
      where: { companyId: user.companyId, deletedAt: null },
      _count: true,
    })),
    withRetry(() => prisma.department.count({ where: { companyId: user.companyId, deletedAt: null } })),
    withRetry(() => prisma.onboardingPath.count({
      where: { companyId: user.companyId, isActive: true },
    })),
  ]);

  const statusCounts = new Map(workersByStatus.map(g => [g.status, g._count]));
  const totalWorkers = workersByStatus.reduce((sum, g) => sum + g._count, 0);

  return {
    totalWorkers,
    onboardingWorkers: statusCounts.get("ONBOARDING") ?? 0,
    activeWorkers: statusCounts.get("ACTIVE") ?? 0,
    departments,
    onboardingPaths,
  };
}

// Lightweight path summaries for worker detail pages
export async function getOnboardingPathSummaries(departmentId?: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  requireViewWorkers(user);

  await checkServerActionRateLimit(String(user.id), WORKER_RATE_LIMITS.read);

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
// LAZY-LOADED DATA FOR MODALS
// ==========================================

export async function getCompanyUsers() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  requireViewWorkers(user);

  await checkServerActionRateLimit(String(user.id), WORKER_RATE_LIMITS.read);

  return withRetry(() => prisma.user.findMany({
    where: { companyId: user.companyId },
    select: { id: true, name: true, email: true },
    take: 1000,
  }));
}

export async function getCompanyTables() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  requireViewWorkers(user);

  await checkServerActionRateLimit(String(user.id), WORKER_RATE_LIMITS.read);

  return withRetry(() => prisma.tableMeta.findMany({
    where: { companyId: user.companyId },
    select: { id: true, name: true },
    take: 1000,
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

  log.debug("Executing automations for onboarding step", { count: actions.length, stepTitle: step.title });

  const executeAction = async (action: OnboardingStepAction): Promise<void> => {
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

          if (
            action.config.phoneSource === "table" &&
            action.config.waTableId &&
            action.config.waPhoneColumn
          ) {
            try {
              let record;
              if (action.config.waRecordId) {
                record = await withRetry(() => prisma.record.findFirst({
                  where: {
                    id: Number(action.config.waRecordId),
                    tableId: Number(action.config.waTableId),
                    companyId: step.path.companyId,
                  },
                  select: { data: true },
                }));
              } else {
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
                log.debug("WhatsApp: Fetched phone from table", { tableId: action.config.waTableId, column: action.config.waPhoneColumn });
              } else {
                log.warn("WhatsApp: Record not found in table", { tableId: action.config.waTableId });
              }
            } catch (fetchError) {
              log.error("WhatsApp: Error fetching phone from table", { error: String(fetchError) });
            }
          } else {
            phoneNumber = action.config.phone as string;
          }

          if (phoneNumber) {
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
          } else {
            log.warn("WhatsApp: No valid phone number available");
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
          const rawWebhookUrl = action.config.webhookUrl || action.config.url;
          if (rawWebhookUrl) {
            const webhookUrl = validateWebhookUrl(String(rawWebhookUrl));
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
          } else {
            log.error("Webhook: No URL configured");
          }
        }
        break;
      case "CREATE_CALENDAR_EVENT":
        await executeCreateCalendarEventAction(action.config, user);
        break;
      default:
        log.warn("Unknown action type", { actionType: action.actionType });
    }
  };

  const results = await Promise.allSettled(actions.map(executeAction));
  for (let i = 0; i < results.length; i++) {
    if (results[i].status === "rejected") {
      log.error("Failed to execute action for step", {
        actionType: actions[i].actionType,
        stepTitle: step.title,
        pathName: step.path.name,
        companyId: step.path.companyId,
        error: String((results[i] as PromiseRejectedResult).reason),
      });
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

  log.info("Created calendar event", { title });
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

  const record = await withRetry(() => prisma.record.findFirst({
    where: { id: recordId, tableId, companyId },
    select: { id: true, data: true },
  }));

  if (!record) {
    log.warn("Record not found or unauthorized", { recordId });
    return;
  }

  const currentData = record.data as Record<string, unknown>;
  const newData = { ...currentData, ...updates };

  await withRetry(() => prisma.record.update({
    where: { id: recordId, companyId },
    data: { data: JSON.parse(JSON.stringify(newData)) },
  }));

  log.info("Updated record", { recordId, tableId });
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

  log.info("Created record", { tableId });
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
      status: (status || "todo") as "todo" | "in_progress" | "waiting_client" | "on_hold" | "completed_month" | "done",
      priority: (priority || null) as "low" | "medium" | "high" | null,
      assigneeId: validatedAssigneeId,
      dueDate: dueDate ? new Date(dueDate) : null,
    },
  }));

  log.info("Created task", { title });
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

  log.info("Updated task", { taskId });
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
      type: type as "INCOME" | "EXPENSE",
      category: category || null,
      clientId: validatedClientId,
      description: description || null,
      status: "COMPLETED",
    },
  }));

  log.info("Created finance record", { title });
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

  if (!(await validateUserInCompany(recipientId, step.path.companyId))) {
    log.warn("Notification recipient not in company", { recipientId, companyId: step.path.companyId });
    return;
  }

  const finalTitle = (title || "שלב קליטה הושלם")
    .replace("{stepTitle}", step.title)
    .replace("{pathName}", step.path.name)
    .replace("{userName}", user.name);

  const finalMessage = (message || "השלב {stepTitle} הושלם על ידי {userName}")
    .replace("{stepTitle}", step.title)
    .replace("{pathName}", step.path.name)
    .replace("{userName}", user.name);

  const { createNotificationForCompany } = await import("@/lib/notifications-internal");
  await createNotificationForCompany({
    companyId: step.path.companyId,
    userId: recipientId,
    title: finalTitle,
    message: finalMessage,
    link: "/workers",
  });

  log.info("Sent notification to user", { recipientId });
}

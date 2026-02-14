"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/permissions-server";
import { validateUserInCompany, validateWorkerInCompany } from "@/lib/company-validation";

// ==========================================
// DEPARTMENTS
// ==========================================

export async function getDepartments() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  return prisma.department.findMany({
    where: { companyId: user.companyId },
    include: {
      _count: {
        select: { workers: true, onboardingPaths: true },
      },
    },
    orderBy: { name: "asc" },
    take: 500,
  });
}

export async function getDepartment(id: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  return prisma.department.findFirst({
    where: { id, companyId: user.companyId },
    include: {
      workers: true,
      onboardingPaths: {
        include: {
          steps: { orderBy: { order: "asc" } },
        },
      },
    },
  });
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

  const department = await prisma.department.create({
    data: {
      ...data,
      companyId: user.companyId,
    },
  });

  revalidatePath("/workers");
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
  const department = await prisma.department.update({
    where: { id, companyId: user.companyId },
    data,
  });

  revalidatePath("/workers");
  return department;
}

export async function deleteDepartment(id: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  // Check if department has workers
  const workersCount = await prisma.worker.count({
    where: { departmentId: id, companyId: user.companyId },
  });

  if (workersCount > 0) {
    throw new Error("Cannot delete department with active workers");
  }

  // SECURITY: Atomic companyId check in delete WHERE clause
  await prisma.department.delete({
    where: { id, companyId: user.companyId },
  });

  revalidatePath("/workers");
  return { success: true };
}

// ==========================================
// WORKERS
// ==========================================

export async function getWorkers(filters?: {
  departmentId?: number;
  status?: string;
}) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  return prisma.worker.findMany({
    where: {
      companyId: user.companyId,
      ...(filters?.departmentId && { departmentId: filters.departmentId }),
      ...(filters?.status && { status: filters.status }),
    },
    include: {
      department: true,
      onboardingProgress: {
        include: {
          path: {
            include: {
              department: true,
              steps: true,
              _count: { select: { steps: true, workerProgress: true } },
            },
          },
          stepProgress: true,
        },
      },
      _count: {
        select: { assignedTasks: true },
      },
    },
    orderBy: [{ status: "asc" }, { firstName: "asc" }],
    take: 2000,
  });
}

export async function getWorker(id: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  return prisma.worker.findFirst({
    where: { id, companyId: user.companyId },
    include: {
      department: true,
      onboardingProgress: {
        include: {
          path: {
            include: {
              steps: { orderBy: { order: "asc" } },
            },
          },
          stepProgress: {
            include: { step: true },
          },
        },
      },
      assignedTasks: {
        orderBy: { createdAt: "desc" },
      },
    },
  });
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

  // SECURITY: Validate departmentId belongs to user's company
  const dept = await prisma.department.findFirst({
    where: { id: data.departmentId, companyId: user.companyId },
    select: { id: true },
  });
  if (!dept) throw new Error("Department not found or access denied");

  // SECURITY: Validate linkedUserId belongs to same company
  if (data.linkedUserId) {
    if (!(await validateUserInCompany(data.linkedUserId, user.companyId))) {
      throw new Error("Invalid linked user");
    }
  }

  const worker = await prisma.worker.create({
    data: {
      ...data,
      companyId: user.companyId,
      status: "ONBOARDING",
    },
  });

  // Auto-assign default onboarding path for department if exists
  const defaultPath = await prisma.onboardingPath.findFirst({
    where: {
      companyId: user.companyId,
      departmentId: data.departmentId,
      isDefault: true,
      isActive: true,
    },
    include: { steps: true },
  });

  if (defaultPath) {
    await assignOnboardingPath(worker.id, defaultPath.id);
  }

  revalidatePath("/workers");
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
  },
) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  // CRITICAL: Verify worker belongs to user's company
  const existing = await prisma.worker.findFirst({
    where: { id, companyId: user.companyId },
  });
  if (!existing) throw new Error("Worker not found or access denied");

  // SECURITY: Validate departmentId belongs to user's company if provided
  if (data.departmentId) {
    const dept = await prisma.department.findFirst({
      where: { id: data.departmentId, companyId: user.companyId },
      select: { id: true },
    });
    if (!dept) throw new Error("Department not found or access denied");
  }

  // SECURITY: Validate linkedUserId belongs to same company
  if (data.linkedUserId) {
    if (!(await validateUserInCompany(data.linkedUserId, user.companyId))) {
      throw new Error("Invalid linked user");
    }
  }

  const worker = await prisma.worker.update({
    where: { id, companyId: user.companyId },
    data: data as any,
  });

  revalidatePath("/workers");
  return worker;
}

export async function deleteWorker(id: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  // CRITICAL: Verify worker belongs to user's company
  const existing = await prisma.worker.findFirst({
    where: { id, companyId: user.companyId },
  });
  if (!existing) throw new Error("Worker not found or access denied");

  await prisma.worker.delete({
    where: { id, companyId: user.companyId },
  });

  revalidatePath("/workers");
  return { success: true };
}

// ==========================================
// ONBOARDING PATHS
// ==========================================

export async function getOnboardingPaths(departmentId?: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  return prisma.onboardingPath.findMany({
    where: {
      companyId: user.companyId,
      ...(departmentId && { departmentId }),
    },
    include: {
      department: true,
      steps: { orderBy: { order: "asc" } },
      _count: {
        select: { workerProgress: true, steps: true },
      },
    },
    orderBy: { name: "asc" },
    take: 500,
  });
}

export async function getOnboardingPath(id: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  return prisma.onboardingPath.findFirst({
    where: { id, companyId: user.companyId },
    include: {
      department: true,
      steps: { orderBy: { order: "asc" } },
      workerProgress: {
        include: {
          worker: true,
          stepProgress: true,
        },
      },
    },
  });
}

export async function createOnboardingPath(data: {
  name: string;
  description?: string;
  departmentId?: number;
  isDefault?: boolean;
  estimatedDays?: number;
}) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  // If setting as default, unset other defaults for this department
  if (data.isDefault && data.departmentId) {
    await prisma.onboardingPath.updateMany({
      where: {
        companyId: user.companyId,
        departmentId: data.departmentId,
        isDefault: true,
      },
      data: { isDefault: false },
    });
  }

  const path = await prisma.onboardingPath.create({
    data: {
      ...data,
      companyId: user.companyId,
    },
  });

  revalidatePath("/workers");
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

  // CRITICAL: Verify path belongs to user's company before update
  const existing = await prisma.onboardingPath.findFirst({
    where: { id, companyId: user.companyId },
  });
  if (!existing) throw new Error("Onboarding path not found or access denied");

  // If setting as default, unset other defaults for this department
  if (data.isDefault) {
    const currentPath = await prisma.onboardingPath.findFirst({
      where: { id, companyId: user.companyId },
    });
    const deptId = data.departmentId || currentPath?.departmentId;
    if (deptId) {
      await prisma.onboardingPath.updateMany({
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

  const path = await prisma.onboardingPath.update({
    where: { id, companyId: user.companyId },
    data,
  });

  revalidatePath("/workers");
  return path;
}

export async function deleteOnboardingPath(id: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  // CRITICAL: Verify path belongs to user's company before deletion
  const existing = await prisma.onboardingPath.findFirst({
    where: { id, companyId: user.companyId },
  });
  if (!existing) throw new Error("Onboarding path not found or access denied");

  // Delete all related WorkerOnboarding records first (WorkerOnboardingStep will cascade delete)
  await prisma.workerOnboarding.deleteMany({
    where: { pathId: id, path: { companyId: user.companyId } },
  });

  // Now delete the path (OnboardingStep will cascade delete due to onDelete: Cascade)
  await prisma.onboardingPath.delete({
    where: { id, companyId: user.companyId },
  });

  revalidatePath("/workers");
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

  // SECURITY: Verify pathId belongs to user's company
  const path = await prisma.onboardingPath.findFirst({
    where: { id: data.pathId, companyId: user.companyId },
    select: { id: true },
  });
  if (!path) throw new Error("Onboarding path not found or access denied");

  // Get max order if not specified
  if (data.order === undefined) {
    const maxOrder = await prisma.onboardingStep.aggregate({
      where: { pathId: data.pathId },
      _max: { order: true },
    });
    data.order = (maxOrder._max.order ?? -1) + 1;
  }

  const step = await prisma.onboardingStep.create({
    data: { ...data, companyId: user.companyId },
  });

  revalidatePath("/workers");
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
  const step = await prisma.$transaction(async (tx) => {
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
  });

  revalidatePath("/workers");
  return step;
}

export async function deleteOnboardingStep(id: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  // P115: Atomic verify+delete in transaction to prevent TOCTOU
  await prisma.$transaction(async (tx) => {
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
  });

  revalidatePath("/workers");
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

  // P115: Verify path belongs to user's company
  const path = await prisma.onboardingPath.findFirst({
    where: { id: pathId, companyId: user.companyId },
  });
  if (!path) throw new Error("Path not found or access denied");

  const transaction = stepIds.map((id, index) =>
    prisma.onboardingStep.updateMany({
      where: { id, pathId, path: { companyId: user.companyId } },
      data: { order: index },
    }),
  );
  await prisma.$transaction(transaction);

  revalidatePath("/workers");
  return { success: true };
}

// ==========================================
// WORKER ONBOARDING PROGRESS
// ==========================================

export async function assignOnboardingPath(workerId: number, pathId: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  const path = await prisma.onboardingPath.findFirst({
    where: { id: pathId, companyId: user.companyId },
    include: { steps: true },
  });

  if (!path) throw new Error("Onboarding path not found");

  // SECURITY: Verify worker belongs to user's company
  const worker = await prisma.worker.findFirst({
    where: { id: workerId, companyId: user.companyId },
    select: { id: true },
  });
  if (!worker) throw new Error("Worker not found or access denied");

  // Create worker onboarding
  const onboarding = await prisma.workerOnboarding.create({
    data: {
      companyId: user.companyId,
      workerId,
      pathId,
      status: "IN_PROGRESS",
    },
  });

  // Create step progress for all steps
  await prisma.workerOnboardingStep.createMany({
    data: path.steps.map((step) => ({
      companyId: user.companyId,
      onboardingId: onboarding.id,
      stepId: step.id,
      status: "PENDING",
    })),
  });

  revalidatePath("/workers");
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

  // Get the step with its onCompleteActions — scoped by companyId
  const step = await prisma.onboardingStep.findFirst({
    where: { id: stepId, path: { companyId: user.companyId } },
    select: {
      id: true,
      title: true,
      onCompleteActions: true,
      path: {
        select: { name: true, companyId: true },
      },
    },
  });

  if (!step) {
    throw new Error("Step not found or access denied");
  }

  // SECURITY: Verify onboardingId belongs to user's company (Issue C)
  const onboardingCheck = await prisma.workerOnboarding.findFirst({
    where: { id: onboardingId, worker: { companyId: user.companyId } },
    select: { id: true },
  });
  if (!onboardingCheck) throw new Error("Onboarding not found or access denied");

  const stepProgress = await prisma.workerOnboardingStep.upsert({
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

  // Execute automations if step is being marked as COMPLETED
  if (data.status === "COMPLETED" && step?.onCompleteActions) {
    try {
      const actions = step.onCompleteActions as Array<{
        actionType: string;
        config: Record<string, unknown>;
      }>;
      if (Array.isArray(actions) && actions.length > 0) {
        console.log(
          `[Workers] Executing ${actions.length} automations for step ${step.title}`,
        );

        // Fetch worker for automation context — scope via worker.companyId
        const onboardingRec = await prisma.workerOnboarding.findFirst({
          where: { id: onboardingId, worker: { companyId: user.companyId } },
          include: { worker: true },
        });

        if (onboardingRec?.worker) {
          await executeOnboardingStepAutomations(
            actions,
            step,
            user,
            onboardingRec.worker,
          );
        }
      }
    } catch (autoError) {
      console.error("[Workers] Error executing automations:", autoError);
      // Don't fail the whole operation if automation fails
    }
  }

  // Check onboarding completion status — scope via worker.companyId
  const onboarding = await prisma.workerOnboarding.findFirst({
    where: { id: onboardingId, worker: { companyId: user.companyId } },
    include: {
      path: {
        include: { steps: true },
      },
      stepProgress: true,
      worker: { select: { id: true } },
    },
  });

  if (onboarding) {
    const requiredSteps = onboarding.path.steps.filter((s) => s.isRequired);
    const completedRequired = onboarding.stepProgress.filter(
      (sp) =>
        sp.status === "COMPLETED" &&
        requiredSteps.some((rs) => rs.id === sp.stepId),
    );

    const allRequiredCompleted =
      completedRequired.length === requiredSteps.length &&
      requiredSteps.length > 0;

    if (allRequiredCompleted && onboarding.status !== "COMPLETED") {
      // All required steps completed - mark onboarding as complete
      await prisma.workerOnboarding.updateMany({
        where: { id: onboardingId, worker: { companyId: user.companyId } },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
        },
      });

      // SECURITY: Update worker status with companyId guard
      await prisma.worker.update({
        where: { id: onboarding.worker.id, companyId: user.companyId },
        data: { status: "ACTIVE" },
      });
    } else if (!allRequiredCompleted && onboarding.status === "COMPLETED") {
      // Not all required steps completed but status is COMPLETED - revert to IN_PROGRESS
      await prisma.workerOnboarding.updateMany({
        where: { id: onboardingId, worker: { companyId: user.companyId } },
        data: {
          status: "IN_PROGRESS",
          completedAt: null,
        },
      });

      // SECURITY: Revert worker status with companyId guard
      await prisma.worker.update({
        where: { id: onboarding.worker.id, companyId: user.companyId },
        data: { status: "ONBOARDING" },
      });
    }
  }

  revalidatePath("/workers");
  return stepProgress;
}

// Get workers by onboarding path with their progress
export async function getWorkersByOnboardingPath(pathId: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  const workerProgress = await prisma.workerOnboarding.findMany({
    where: {
      pathId,
      worker: { companyId: user.companyId },
    },
    include: {
      worker: {
        include: {
          department: true,
        },
      },
      stepProgress: true,
      path: {
        include: {
          steps: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 2000,
  });

  return workerProgress.map((wp) => {
    const totalSteps = wp.path.steps.length;
    const stepIds = new Set(wp.path.steps.map((s) => s.id));
    const completedSteps = wp.stepProgress.filter(
      (sp) => sp.status === "COMPLETED" && stepIds.has(sp.stepId),
    ).length;
    const progress =
      totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

    // Determine actual status based on progress (in case DB status is not updated)
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

  return prisma.workerTask.findMany({
    where: {
      companyId: user.companyId,
      ...(workerId && { workerId }),
    },
    include: {
      worker: true,
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 5000,
  });
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

  // SECURITY: Validate workerId belongs to same company
  if (!(await validateWorkerInCompany(data.workerId, user.companyId))) {
    throw new Error("Worker not found or access denied");
  }

  const task = await prisma.workerTask.create({
    data: {
      ...data,
      companyId: user.companyId,
    },
  });

  revalidatePath("/workers");
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

  // Auto-set completedAt if marking as completed
  if (data.status === "COMPLETED" && !data.completedAt) {
    data.completedAt = new Date();
  }

  // P115: Add companyId to prevent cross-tenant worker task updates
  const task = await prisma.workerTask.update({
    where: { id, companyId: user.companyId },
    data,
  });

  revalidatePath("/workers");
  return task;
}

export async function deleteWorkerTask(id: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  // P115: Add companyId to prevent cross-tenant worker task deletes
  await prisma.workerTask.delete({
    where: { id, companyId: user.companyId },
  });

  revalidatePath("/workers");
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
    prisma.worker.count({ where: { companyId: user.companyId } }),
    prisma.worker.count({
      where: { companyId: user.companyId, status: "ONBOARDING" },
    }),
    prisma.worker.count({
      where: { companyId: user.companyId, status: "ACTIVE" },
    }),
    prisma.department.count({ where: { companyId: user.companyId } }),
    prisma.onboardingPath.count({
      where: { companyId: user.companyId, isActive: true },
    }),
  ]);

  return {
    totalWorkers,
    onboardingWorkers,
    activeWorkers,
    departments,
    onboardingPaths,
  };
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
                  // Fetch specific record by ID
                  record = await prisma.record.findFirst({
                    where: {
                      id: Number(action.config.waRecordId),
                      tableId: Number(action.config.waTableId),
                      companyId: step.path.companyId,
                    },
                  });
                } else {
                  // Fetch the last created record from the table
                  record = await prisma.record.findFirst({
                    where: {
                      tableId: Number(action.config.waTableId),
                      companyId: step.path.companyId,
                    },
                    orderBy: { createdAt: "desc" },
                  });
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
  const record = await prisma.record.findFirst({
    where: { id: recordId, tableId, companyId },
  });

  if (!record) {
    console.warn(`[Workers] Record ${recordId} not found or unauthorized`);
    return;
  }

  const currentData = record.data as Record<string, unknown>;
  const newData = { ...currentData, ...updates };

  await prisma.record.update({
    where: { id: recordId, companyId },
    data: { data: JSON.parse(JSON.stringify(newData)) },
  });

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
  const tableOk = await prisma.tableMeta.findFirst({
    where: { id: tableId, companyId },
    select: { id: true },
  });
  if (!tableOk) return;

  await prisma.record.create({
    data: {
      tableId,
      companyId,
      data: values ? JSON.parse(JSON.stringify(values)) : {},
    },
  });

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

  await prisma.task.create({
    data: {
      companyId: user.companyId,
      title,
      description: description || null,
      status: status || "todo",
      priority: priority || null,
      assigneeId: validatedAssigneeId,
      dueDate: dueDate ? new Date(dueDate) : null,
    },
  });

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

  await prisma.task.update({
    where: { id: taskId, companyId },
    data: updateData,
  });

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
    const clientOk = await prisma.client.findFirst({
      where: { id: clientId, companyId },
      select: { id: true },
    });
    if (clientOk) validatedClientId = clientId;
  }

  await prisma.financeRecord.create({
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
  });

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

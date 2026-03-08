"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { inngest } from "@/lib/inngest/client";
import { validateUserInCompany } from "@/lib/company-validation";
import { withRetry } from "@/lib/db-retry";
import { checkActionRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { createTaskSchema, updateTaskSchema } from "@/lib/validations/tasks";
import { createLogger } from "@/lib/logger";

const log = createLogger("Tasks");

async function fetchTasksInternal(options?: {
  statusFilter?: string;
  orderBy?: "createdAt" | "updatedAt";
  take?: number;
}) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    const canView = user.role === "admin" || hasUserFlag(user, "canViewTasks");
    if (!canView) {
      return { success: false, error: "Forbidden" };
    }

    const rateLimited = await checkActionRateLimit(String(user.id), RATE_LIMITS.taskRead).catch(() => false);
    if (rateLimited) {
      return { success: false, error: "Rate limit exceeded. Please try again later." };
    }

    const canViewAll =
      user.role === "admin" || hasUserFlag(user, "canViewAllTasks");
    const whereClause = {
      companyId: user.companyId,
      ...(!canViewAll && { assigneeId: user.id }),
      ...(options?.statusFilter && { status: options.statusFilter as any }),
    };

    const tasks = await withRetry(() => prisma.task.findMany({
      where: whereClause,
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        assigneeId: true,
        priority: true,
        dueDate: true,
        tags: true,
        creatorId: true,
        createdAt: true,
        updatedAt: true,
        assignee: {
          select: { id: true, name: true },
        },
        creator: {
          select: { id: true, name: true },
        },
      },
      orderBy: { [options?.orderBy || "createdAt"]: "desc" },
      take: options?.take ?? 5000,
    }));
    return { success: true, data: tasks };
  } catch (error) {
    log.error("Error fetching tasks", { error: String(error) });
    return { success: false, error: "Failed to fetch tasks" };
  }
}

export async function getTasks() {
  return fetchTasksInternal({ take: 5000 });
}

export async function getDoneTasks() {
  return fetchTasksInternal({ statusFilter: "done", orderBy: "updatedAt", take: 500 });
}

export async function getTaskById(id: string) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    // Permission check
    const canView = user.role === "admin" || hasUserFlag(user, "canViewTasks");
    if (!canView) {
      return { success: false, error: "Forbidden" };
    }

    // Rate limit (fail open)
    const rateLimited = await checkActionRateLimit(String(user.id), RATE_LIMITS.taskRead).catch(() => false);
    if (rateLimited) {
      return { success: false, error: "Rate limit exceeded. Please try again later." };
    }

    // SECURITY: Filter by companyId + visibility filtering
    const canViewAll = user.role === "admin" || hasUserFlag(user, "canViewAllTasks");
    const whereClause = canViewAll
      ? { id, companyId: user.companyId }
      : { id, companyId: user.companyId, assigneeId: user.id };

    const task = await withRetry(() => prisma.task.findFirst({
      where: whereClause,
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        assigneeId: true,
        priority: true,
        dueDate: true,
        tags: true,
        creatorId: true,
        createdAt: true,
        updatedAt: true,
        assignee: {
          select: { id: true, name: true },
        },
        creator: {
          select: { id: true, name: true },
        },
      },
    }));

    if (!task) {
      return { success: false, error: "Task not found" };
    }

    return { success: true, data: task };
  } catch (error) {
    log.error("Error fetching task", { error: String(error) });
    return { success: false, error: "Failed to fetch task" };
  }
}

export async function createTask(data: {
  title: string;
  description?: string;
  status?: string;
  assigneeId?: number;
  priority?: string;
  tags?: string[];
  dueDate?: string;
}) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    const canCreate =
      user.role === "admin" || hasUserFlag(user, "canCreateTasks");

    if (!canCreate) {
      return { success: false, error: "אין לך הרשאה ליצור משימות" };
    }

    // Rate limit (fail open)
    const rateLimited = await checkActionRateLimit(String(user.id), RATE_LIMITS.taskMutation).catch(() => false);
    if (rateLimited) {
      return { success: false, error: "Rate limit exceeded. Please try again later." };
    }

    // Validate input
    const parsed = createTaskSchema.safeParse(data);
    if (!parsed.success) {
      return { success: false, error: "Validation failed", details: parsed.error.flatten().fieldErrors };
    }

    const validated = parsed.data;

    // SECURITY: Validate assigneeId belongs to same company
    if (validated.assigneeId) {
      if (!(await validateUserInCompany(validated.assigneeId, user.companyId))) {
        return { success: false, error: "Invalid assignee" };
      }
    }

    const newTask = await prisma.task.create({
      data: {
        companyId: user.companyId,
        title: validated.title,
        description: validated.description ?? undefined,
        status: validated.status,
        assigneeId: validated.assigneeId ?? undefined,
        priority: validated.priority ?? undefined,
        tags: validated.tags || [],
        dueDate: validated.dueDate,
        creatorId: user.id,
      },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        assigneeId: true,
        priority: true,
        dueDate: true,
        tags: true,
        creatorId: true,
        createdAt: true,
        updatedAt: true,
        assignee: {
          select: { id: true, name: true },
        },
        creator: {
          select: { id: true, name: true },
        },
      },
    });

    revalidatePath("/tasks");
    revalidatePath("/");

    return { success: true, data: newTask };
  } catch (error) {
    log.error("Error creating task", { error: String(error) });
    return { success: false, error: "Failed to create task" };
  }
}

export async function updateTask(
  id: string,
  data: {
    title?: string;
    description?: string;
    status?: string;
    assigneeId?: number | null;
    priority?: string;
    tags?: string[];
    dueDate?: string | null;
  },
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    // Base permission check (consistent with API route)
    const canView = user.role === "admin" || hasUserFlag(user, "canViewTasks");
    if (!canView) {
      return { success: false, error: "Forbidden" };
    }

    // Rate limit (fail open)
    const rateLimited = await checkActionRateLimit(String(user.id), RATE_LIMITS.taskMutation).catch(() => false);
    if (rateLimited) {
      return { success: false, error: "Rate limit exceeded. Please try again later." };
    }

    // Validate input
    const parsed = updateTaskSchema.safeParse(data);
    if (!parsed.success) {
      return { success: false, error: "Validation failed", details: parsed.error.flatten().fieldErrors };
    }

    const validated = parsed.data;

    // Build update data from validated fields
    const updateData: Record<string, unknown> = {};
    if (validated.title !== undefined) updateData.title = validated.title;
    if (validated.description !== undefined) updateData.description = validated.description;
    if (validated.status !== undefined) updateData.status = validated.status;
    if (validated.assigneeId !== undefined) updateData.assigneeId = validated.assigneeId;
    if (validated.priority !== undefined) updateData.priority = validated.priority;
    if (validated.tags !== undefined) updateData.tags = validated.tags;
    if (validated.dueDate !== undefined) updateData.dueDate = validated.dueDate;

    // Fetch only the fields needed for permission check and status-change detection
    const existingTask = await withRetry(() => prisma.task.findFirst({
      where: { id, companyId: user.companyId },
      select: { id: true, assigneeId: true, status: true },
    }));

    if (!existingTask) {
      return { success: false, error: "Task not found" };
    }

    const canViewAll =
      user.role === "admin" || hasUserFlag(user, "canViewAllTasks");
    const isAssignee = existingTask.assigneeId === user.id;

    if (!canViewAll && !isAssignee) {
      return { success: false, error: "אין לך הרשאה לערוך משימה זו" };
    }

    // SECURITY: Validate assigneeId belongs to same company
    if (validated.assigneeId) {
      if (!(await validateUserInCompany(validated.assigneeId, user.companyId))) {
        return { success: false, error: "Invalid assignee" };
      }
    }

    const isStatusChange = validated.status && existingTask.status !== validated.status;

    // Wrap update + audit log in a transaction to prevent audit trail loss
    const task = await withRetry(() => prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({
        where: { id, companyId: user.companyId },
        data: updateData,
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          assigneeId: true,
          priority: true,
          dueDate: true,
          tags: true,
          creatorId: true,
          createdAt: true,
          updatedAt: true,
          assignee: {
            select: { id: true, name: true },
          },
          creator: {
            select: { id: true, name: true },
          },
        },
      });

      if (isStatusChange) {
        await tx.auditLog.create({
          data: {
            taskId: id,
            action: "UPDATE",
            companyId: user.companyId,
            userId: user.id,
            diffJson: {
              status: {
                from: existingTask.status,
                to: validated.status,
              },
            },
          },
        });
      }

      return updated;
    }, { maxWait: 5000, timeout: 10000 }));

    // Send automation event outside transaction (idempotent, has own retry, with direct fallback)
    if (isStatusChange) {
      try {
        await inngest.send({
          id: `task-status-${user.companyId}-${task.id}-${validated.status}`,
          name: "automation/task-status-change",
          data: {
            taskId: task.id,
            taskTitle: task.title,
            fromStatus: existingTask.status,
            toStatus: validated.status!,
            companyId: user.companyId,
          },
        });
      } catch (autoError) {
        log.error("Inngest send failed, falling back to direct automation execution", { error: String(autoError) });
        try {
          const { processTaskStatusChange } = await import("@/app/actions/automations-core");
          await processTaskStatusChange(task.id, task.title, existingTask.status, validated.status!, user.companyId);
        } catch (directErr) {
          log.error("Direct automation execution also failed", { error: String(directErr) });
        }
      }
    }

    revalidatePath("/tasks");
    revalidatePath("/");

    return { success: true, data: task };
  } catch (error) {
    log.error("Error updating task", { error: String(error) });
    return { success: false, error: "Failed to update task" };
  }
}

export async function deleteTask(id: string) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    // Base permission check (consistent with updateTask and API route)
    const canView = user.role === "admin" || hasUserFlag(user, "canViewTasks");
    if (!canView) {
      return { success: false, error: "Forbidden" };
    }

    // Only allow deletion if user can create tasks (Manager logic) or is Admin
    const canDelete =
      user.role === "admin" || hasUserFlag(user, "canCreateTasks");

    if (!canDelete) {
      return { success: false, error: "אין לך הרשאה למחוק משימות" };
    }

    // Rate limit (fail open)
    const rateLimited = await checkActionRateLimit(String(user.id), RATE_LIMITS.taskMutation).catch(() => false);
    if (rateLimited) {
      return { success: false, error: "Rate limit exceeded. Please try again later." };
    }

    // Single query: deleteMany returns count, no need for find-first
    const result = await prisma.task.deleteMany({
      where: { id, companyId: user.companyId },
    });

    if (result.count === 0) {
      return { success: false, error: "Task not found" };
    }

    revalidatePath("/tasks");
    revalidatePath("/");

    return { success: true };
  } catch (error) {
    log.error("Error deleting task", { error: String(error) });
    return { success: false, error: "Failed to delete task" };
  }
}

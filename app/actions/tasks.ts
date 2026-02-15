"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { inngest } from "@/lib/inngest/client";
import { validateUserInCompany } from "@/lib/company-validation";
import { withRetry } from "@/lib/db-retry";

export async function getTasks() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    const canViewAll =
      user.role === "admin" || hasUserFlag(user, "canViewAllTasks");
    // CRITICAL: Always filter by companyId for multi-tenancy
    const whereClause = canViewAll
      ? { companyId: user.companyId }
      : { companyId: user.companyId, assigneeId: user.id };

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
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        creator: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 5000,
    }));
    return { success: true, data: tasks };
  } catch (error) {
    console.error("Error fetching tasks:", error);
    return { success: false, error: "Failed to fetch tasks" };
  }
}

export async function getTaskById(id: string) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    // SECURITY: Filter by companyId to prevent cross-tenant access
    const task = await withRetry(() => prisma.task.findFirst({
      where: { id, companyId: user.companyId },
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
          select: { id: true, name: true, email: true },
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
    console.error("Error fetching task:", error);
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

    // SECURITY: Validate assigneeId belongs to same company
    if (data.assigneeId) {
      if (!(await validateUserInCompany(data.assigneeId, user.companyId))) {
        return { success: false, error: "Invalid assignee" };
      }
    }

    const dueDate = data.dueDate ? new Date(data.dueDate) : null;

    const newTask = await prisma.task.create({
      data: {
        companyId: user.companyId,
        title: data.title,
        description: data.description,
        status: data.status ?? "todo",
        assigneeId: data.assigneeId,
        priority: data.priority,
        tags: data.tags || [],
        dueDate: dueDate,
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
          select: { id: true, name: true, email: true },
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
    console.error("Error creating task:", error);
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
    // Whitelist allowed update fields to prevent mass assignment
    const allowedFields = ["title", "description", "status", "assigneeId", "priority", "dueDate", "tags"] as const;
    const updateData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        updateData[field] = field === "dueDate" && data[field] ? new Date(data[field] as string) : data[field];
      }
    }

    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

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
    if (data.assigneeId) {
      if (!(await validateUserInCompany(data.assigneeId, user.companyId))) {
        return { success: false, error: "Invalid assignee" };
      }
    }

    const isStatusChange = data.status && existingTask.status !== data.status;

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
            select: { id: true, name: true, email: true },
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
                to: data.status,
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
          id: `task-status-${user.companyId}-${task.id}-${data.status}`,
          name: "automation/task-status-change",
          data: {
            taskId: task.id,
            taskTitle: task.title,
            fromStatus: existingTask.status,
            toStatus: data.status,
            companyId: user.companyId,
          },
        });
      } catch (autoError) {
        console.error(`[Tasks] Inngest send failed, falling back to direct automation execution:`, autoError);
        try {
          const { processTaskStatusChange } = await import("@/app/actions/automations");
          await processTaskStatusChange(task.id, task.title, existingTask.status, data.status!, user.companyId);
        } catch (directErr) {
          console.error(`[Tasks] Direct automation execution also failed:`, directErr);
        }
      }
    }

    revalidatePath("/tasks");
    revalidatePath("/");

    return { success: true, data: task };
  } catch (error) {
    console.error("Error updating task:", error);
    return { success: false, error: "Failed to update task" };
  }
}

export async function deleteTask(id: string) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    // Only allow deletion if user can create tasks (Manager logic) or is Admin
    const canDelete =
      user.role === "admin" || hasUserFlag(user, "canCreateTasks");

    if (!canDelete) {
      return { success: false, error: "אין לך הרשאה למחוק משימות" };
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
    console.error("Error deleting task:", error);
    return { success: false, error: "Failed to delete task" };
  }
}

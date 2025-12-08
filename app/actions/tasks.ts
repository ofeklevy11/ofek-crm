"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";

export async function getTasks() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    const canViewAll =
      user.role === "admin" || hasUserFlag(user, "canViewAllTasks");

    const whereClause = canViewAll ? {} : { assigneeId: user.id };

    const tasks = await prisma.task.findMany({
      where: whereClause,
      include: {
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return { success: true, data: tasks };
  } catch (error) {
    console.error("Error fetching tasks:", error);
    return { success: false, error: "Failed to fetch tasks" };
  }
}

export async function getTaskById(id: string) {
  try {
    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

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

    const dueDate = data.dueDate ? new Date(data.dueDate) : null;

    const newTask = await prisma.task.create({
      data: {
        title: data.title,
        description: data.description,
        status: data.status ?? "todo",
        assigneeId: data.assigneeId,
        priority: data.priority,
        tags: data.tags || [],
        dueDate: dueDate,
      },
      include: {
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    revalidatePath("/tasks");
    revalidatePath("/");

    // Trigger automations
    console.log(
      `[Task Actions] Created task ${newTask.id}, triggering automations`
    );
    try {
      const { processViewAutomations } = await import("./automations");
      await processViewAutomations();
    } catch (autoError) {
      console.error("[Task Actions] Failed to trigger automations:", autoError);
    }

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
  }
) {
  try {
    const updateData: Record<string, unknown> = { ...data };

    if (data.dueDate !== undefined) {
      updateData.dueDate = data.dueDate ? new Date(data.dueDate) : null;
    }

    // Fetch old task to get previous status
    const existingTask = await prisma.task.findUnique({
      where: { id },
      include: {
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!existingTask) {
      return { success: false, error: "Task not found" };
    }

    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    const canViewAll =
      user.role === "admin" || hasUserFlag(user, "canViewAllTasks");
    const isAssignee = existingTask.assigneeId === user.id;

    if (!canViewAll && !isAssignee) {
      return { success: false, error: "אין לך הרשאה לערוך משימה זו" };
    }

    const task = await prisma.task.update({
      where: { id },
      data: updateData,
      include: {
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (existingTask && data.status && existingTask.status !== data.status) {
      // Create Audit Log
      await prisma.auditLog.create({
        data: {
          taskId: id,
          action: "UPDATE",
          diffJson: {
            status: {
              from: existingTask.status,
              to: data.status,
            },
          },
          // Assuming system user or currently logged in user triggers this.
          // Since updateTask is generic server action, we might not have userId easily here without auth context.
          // For now leaving userId null or we could get it if we had auth in scope.
        },
      });

      const { processTaskStatusChange } = await import("./automations");
      // Now passing taskId and correct fromStatus
      await processTaskStatusChange(
        task.id,
        task.title,
        existingTask.status,
        data.status
      );
    }

    revalidatePath("/tasks");
    revalidatePath("/");

    // Trigger automations for any update (not just status change)
    try {
      const { processViewAutomations } = await import("./automations");
      await processViewAutomations();
    } catch (autoError) {
      console.error(
        "[Task Actions] Failed to trigger view automations:",
        autoError
      );
    }

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

    await prisma.task.delete({
      where: { id },
    });

    revalidatePath("/tasks");
    revalidatePath("/");

    // Trigger automations
    console.log(`[Task Actions] Deleted task ${id}, triggering automations`);
    try {
      const { processViewAutomations } = await import("./automations");
      await processViewAutomations();
    } catch (autoError) {
      console.error("[Task Actions] Failed to trigger automations:", autoError);
    }

    return { success: true };
  } catch (error) {
    console.error("Error deleting task:", error);
    return { success: false, error: "Failed to delete task" };
  }
}

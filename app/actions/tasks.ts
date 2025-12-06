"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function getTasks() {
  try {
    const tasks = await prisma.task.findMany({
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
  assignee?: string;
  priority?: string;
  tags?: string[];
  dueDate?: string;
}) {
  try {
    const dueDate = data.dueDate ? new Date(data.dueDate) : null;

    const newTask = await prisma.task.create({
      data: {
        title: data.title,
        description: data.description,
        status: data.status ?? "todo",
        assignee: data.assignee,
        priority: data.priority,
        tags: data.tags || [],
        dueDate: dueDate,
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
    assignee?: string;
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
    });

    const task = await prisma.task.update({
      where: { id },
      data: updateData,
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

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

    const task = await prisma.task.update({
      where: { id },
      data: updateData,
    });

    if (data.status) {
      // Old hardcoded notification - remove if no longer needed, or keep for testing specific case
      // For now, replacing with the dynamic automation system
      const { processTaskStatusChange } = await import("./automations");
      // Getting the task before update to know previous status would be ideal for "fromStatus" logic
      // Since we already fetched it at the start or database, but updateTask doesn't fetch first.
      // For simplified "Status Changed To" logic:
      await processTaskStatusChange(task.title, "unknown", data.status);
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
    await prisma.task.delete({
      where: { id },
    });

    revalidatePath("/tasks");
    revalidatePath("/");

    return { success: true };
  } catch (error) {
    console.error("Error deleting task:", error);
    return { success: false, error: "Failed to delete task" };
  }
}

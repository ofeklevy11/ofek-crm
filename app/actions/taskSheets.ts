"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/permissions-server";
import { inngest } from "@/lib/inngest/client";
import type { OnCompleteAction } from "@/lib/task-sheet-automations";

// Types
export interface TaskSheetItemInput {
  title: string;
  description?: string;
  priority?: string;
  category?: string;
  order?: number;
  dueTime?: string;
  linkedTaskId?: string;
  onCompleteActions?: Array<{
    actionType:
      | "UPDATE_RECORD"
      | "CREATE_TASK"
      | "CREATE_FINANCE"
      | "SEND_NOTIFICATION"
      | "UPDATE_TASK"
      | "SEND_WEBHOOK"
      | "SEND_WHATSAPP"
      | "CREATE_CALENDAR_EVENT"
      | "CREATE_RECORD";
    config: Record<string, unknown>;
  }>;
}

export interface TaskSheetInput {
  title: string;
  description?: string;
  type: "DAILY" | "WEEKLY";
  assigneeId: number;
  validFrom?: string;
  validUntil?: string;
  items?: TaskSheetItemInput[];
}

// Get all task sheets (admin sees all, employee sees only assigned)
export async function getTaskSheets() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    const isAdmin = user.role === "admin";

    const sheets = await prisma.taskSheet.findMany({
      where: {
        companyId: user.companyId,
        ...(isAdmin ? {} : { assigneeId: user.id }),
        isActive: true,
      },
      include: {
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
          },
        },
        items: {
          orderBy: { order: "asc" },
        },
        _count: {
          select: { items: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return { success: true, data: sheets };
  } catch (error) {
    console.error("Error fetching task sheets:", error);
    return { success: false, error: "Failed to fetch task sheets" };
  }
}

// Get a single task sheet by ID
export async function getTaskSheetById(id: number) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    const sheet = await prisma.taskSheet.findFirst({
      where: {
        id,
        companyId: user.companyId,
        // Allow access if admin or assigned to this user
        ...(user.role !== "admin" ? { assigneeId: user.id } : {}),
      },
      include: {
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
          },
        },
        items: {
          orderBy: [{ order: "asc" }, { priority: "asc" }],
          include: {
            linkedTask: {
              select: {
                id: true,
                title: true,
                status: true,
                priority: true,
              },
            },
          },
        },
      },
    });

    if (!sheet) {
      return { success: false, error: "Task sheet not found" };
    }

    return { success: true, data: sheet };
  } catch (error) {
    console.error("Error fetching task sheet:", error);
    return { success: false, error: "Failed to fetch task sheet" };
  }
}

// Create a new task sheet (admin only)
export async function createTaskSheet(data: TaskSheetInput) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    if (user.role !== "admin") {
      return { success: false, error: "רק מנהלים יכולים ליצור דפי משימות" };
    }

    const sheet = await prisma.taskSheet.create({
      data: {
        companyId: user.companyId,
        title: data.title,
        description: data.description,
        type: data.type,
        assigneeId: data.assigneeId,
        createdById: user.id,
        validFrom: data.validFrom ? new Date(data.validFrom) : new Date(),
        validUntil: data.validUntil ? new Date(data.validUntil) : null,
        items: data.items
          ? {
              create: data.items.map((item, index) => ({
                title: item.title,
                description: item.description,
                priority: item.priority || "NORMAL",
                category: item.category,
                order: item.order ?? index,
                dueTime: item.dueTime,
                linkedTaskId: item.linkedTaskId,
                onCompleteActions: JSON.parse(
                  JSON.stringify(item.onCompleteActions || []),
                ),
              })),
            }
          : undefined,
      },
      include: {
        assignee: {
          select: { id: true, name: true, email: true },
        },
        items: true,
      },
    });

    revalidatePath("/tasks");
    revalidatePath("/tasks/my-sheets");

    return { success: true, data: sheet };
  } catch (error) {
    console.error("Error creating task sheet:", error);
    return { success: false, error: "Failed to create task sheet" };
  }
}

// Update a task sheet (admin only)
export async function updateTaskSheet(
  id: number,
  data: Partial<TaskSheetInput>,
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    if (user.role !== "admin") {
      return { success: false, error: "רק מנהלים יכולים לערוך דפי משימות" };
    }

    // P114: Add companyId to prevent cross-tenant task sheet updates
    const sheet = await prisma.taskSheet.update({
      where: { id, companyId: user.companyId },
      data: {
        ...(data.title && { title: data.title }),
        ...(data.description !== undefined && {
          description: data.description,
        }),
        ...(data.type && { type: data.type }),
        ...(data.assigneeId && { assigneeId: data.assigneeId }),
        ...(data.validFrom && { validFrom: new Date(data.validFrom) }),
        ...(data.validUntil !== undefined && {
          validUntil: data.validUntil ? new Date(data.validUntil) : null,
        }),
      },
      include: {
        assignee: {
          select: { id: true, name: true, email: true },
        },
        items: true,
      },
    });

    revalidatePath("/tasks");
    revalidatePath("/tasks/my-sheets");

    return { success: true, data: sheet };
  } catch (error) {
    console.error("Error updating task sheet:", error);
    return { success: false, error: "Failed to update task sheet" };
  }
}

// Delete a task sheet (admin only)
export async function deleteTaskSheet(id: number) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    if (user.role !== "admin") {
      return { success: false, error: "רק מנהלים יכולים למחוק דפי משימות" };
    }

    // P114: Add companyId to prevent cross-tenant task sheet deletes
    await prisma.taskSheet.delete({
      where: { id, companyId: user.companyId },
    });

    revalidatePath("/tasks");
    revalidatePath("/tasks/my-sheets");

    return { success: true };
  } catch (error) {
    console.error("Error deleting task sheet:", error);
    return { success: false, error: "Failed to delete task sheet" };
  }
}

// Add item to a task sheet (admin only)
export async function addTaskSheetItem(
  sheetId: number,
  item: TaskSheetItemInput,
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    if (user.role !== "admin") {
      return { success: false, error: "רק מנהלים יכולים להוסיף פריטים" };
    }

    // LL: Verify the sheet belongs to the current user's company
    const sheet = await prisma.taskSheet.findFirst({
      where: { id: sheetId, companyId: user.companyId },
      select: { id: true },
    });
    if (!sheet) {
      return { success: false, error: "Task sheet not found" };
    }

    // SECURITY: Validate linkedTaskId belongs to user's company
    if (item.linkedTaskId) {
      const linkedTask = await prisma.task.findFirst({
        where: { id: item.linkedTaskId, companyId: user.companyId },
        select: { id: true },
      });
      if (!linkedTask) {
        return { success: false, error: "Invalid linked task" };
      }
    }

    // Get max order
    const maxOrder = await prisma.taskSheetItem.aggregate({
      where: { sheetId },
      _max: { order: true },
    });

    const newItem = await prisma.taskSheetItem.create({
      data: {
        sheetId,
        title: item.title,
        description: item.description,
        priority: item.priority || "NORMAL",
        category: item.category,
        order: item.order ?? (maxOrder._max.order ?? 0) + 1,
        dueTime: item.dueTime,
        linkedTaskId: item.linkedTaskId,
        onCompleteActions: JSON.parse(
          JSON.stringify(item.onCompleteActions || []),
        ),
      },
    });

    revalidatePath("/tasks");
    revalidatePath("/tasks/my-sheets");

    return { success: true, data: newItem };
  } catch (error) {
    console.error("Error adding task sheet item:", error);
    return { success: false, error: "Failed to add item" };
  }
}

// Update a task sheet item
export async function updateTaskSheetItem(
  itemId: number,
  data: Partial<TaskSheetItemInput & { isCompleted?: boolean; notes?: string }>,
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    // Get the item and check access
    const existingItem = await prisma.taskSheetItem.findUnique({
      where: { id: itemId },
      include: {
        sheet: {
          select: { assigneeId: true, companyId: true, title: true },
        },
      },
    });

    if (!existingItem || existingItem.sheet.companyId !== user.companyId) {
      return { success: false, error: "Item not found" };
    }

    // Only admin or assignee can update
    const isAssignee = existingItem.sheet.assigneeId === user.id;
    const isAdmin = user.role === "admin";

    if (!isAdmin && !isAssignee) {
      return { success: false, error: "אין לך הרשאה לעדכן פריט זה" };
    }

    // Non-admins can only update isCompleted and notes
    const updateData: Record<string, unknown> = {};

    if (isAdmin) {
      if (data.title !== undefined) updateData.title = data.title;
      if (data.description !== undefined)
        updateData.description = data.description;
      if (data.priority !== undefined) updateData.priority = data.priority;
      if (data.category !== undefined) updateData.category = data.category;
      if (data.order !== undefined) updateData.order = data.order;
      if (data.dueTime !== undefined) updateData.dueTime = data.dueTime;
      if (data.linkedTaskId !== undefined)
        updateData.linkedTaskId = data.linkedTaskId;
      if (data.onCompleteActions !== undefined)
        updateData.onCompleteActions = data.onCompleteActions;
    }

    // Both admin and assignee can update completion status
    if (data.isCompleted !== undefined) {
      updateData.isCompleted = data.isCompleted;
      updateData.completedAt = data.isCompleted ? new Date() : null;
    }
    if (data.notes !== undefined) updateData.notes = data.notes;

    // SECURITY: Scope update via sheet companyId join to prevent TOCTOU
    const updateResult = await prisma.taskSheetItem.updateMany({
      where: { id: itemId, sheet: { companyId: user.companyId } },
      data: updateData,
    });
    if (updateResult.count === 0) {
      return { success: false, error: "Item not found" };
    }
    const updatedItem = await prisma.taskSheetItem.findUnique({
      where: { id: itemId },
    });

    // Fire automations when isCompleted transitions false → true
    const transitionedToCompleted =
      data.isCompleted === true && !existingItem.isCompleted;
    if (transitionedToCompleted && existingItem.onCompleteActions) {
      try {
        await inngest.send({
          id: `task-sheet-item-${itemId}-${Date.now()}`,
          name: "task-sheet/item-completed",
          data: {
            actions: existingItem.onCompleteActions as unknown as OnCompleteAction[],
            item: {
              id: existingItem.id,
              title: existingItem.title,
              sheet: {
                title: existingItem.sheet.title,
                companyId: existingItem.sheet.companyId,
              },
            },
            user: {
              id: user.id,
              companyId: user.companyId,
              name: user.name,
            },
            companyId: user.companyId,
          },
        });
      } catch (sendError) {
        console.error("[TaskSheets] Error sending automation event:", sendError);
      }
    }

    revalidatePath("/tasks");
    revalidatePath("/tasks/my-sheets");

    return { success: true, data: updatedItem };
  } catch (error) {
    console.error("Error updating task sheet item:", error);
    return { success: false, error: "Failed to update item" };
  }
}

// Delete a task sheet item (admin only)
export async function deleteTaskSheetItem(itemId: number) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    if (user.role !== "admin") {
      return { success: false, error: "רק מנהלים יכולים למחוק פריטים" };
    }

    // W13: Verify item belongs to user's company via sheet join
    const item = await prisma.taskSheetItem.findFirst({
      where: { id: itemId, sheet: { companyId: user.companyId } },
      select: { id: true },
    });
    if (!item) {
      return { success: false, error: "Item not found" };
    }

    // SECURITY: Scope delete via sheet companyId join to prevent TOCTOU
    await prisma.taskSheetItem.deleteMany({
      where: { id: itemId, sheet: { companyId: user.companyId } },
    });

    revalidatePath("/tasks");
    revalidatePath("/tasks/my-sheets");

    return { success: true };
  } catch (error) {
    console.error("Error deleting task sheet item:", error);
    return { success: false, error: "Failed to delete item" };
  }
}

// Toggle item completion (for employees) and execute automations
export async function toggleTaskSheetItemCompletion(itemId: number) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    const item = await prisma.taskSheetItem.findUnique({
      where: { id: itemId },
      include: {
        sheet: {
          select: { assigneeId: true, companyId: true, title: true },
        },
      },
    });

    if (!item || item.sheet.companyId !== user.companyId) {
      return { success: false, error: "Item not found" };
    }

    // Check if user has access
    const isAssignee = item.sheet.assigneeId === user.id;
    const isAdmin = user.role === "admin";

    if (!isAdmin && !isAssignee) {
      return { success: false, error: "אין לך הרשאה לעדכן פריט זה" };
    }

    const wasCompleted = item.isCompleted;
    const isNowCompleted = !wasCompleted;

    // Use atomic updateMany with a where-guard on the current state to prevent
    // double-click races: only the first toggle that matches the current state wins.
    // SECURITY: Scope via sheet companyId join for defense-in-depth
    const result = await prisma.taskSheetItem.updateMany({
      where: { id: itemId, sheetId: item.sheetId, isCompleted: wasCompleted, sheet: { companyId: user.companyId } },
      data: {
        isCompleted: isNowCompleted,
        completedAt: isNowCompleted ? new Date() : null,
      },
    });

    if (result.count === 0) {
      // Another request already toggled this item — return current state
      return { success: true, data: item, alreadyToggled: true };
    }

    // Re-fetch the updated item for the response
    const updatedItem = await prisma.taskSheetItem.findUnique({
      where: { id: itemId },
    });

    // Offload automations to background job so the checkbox UX is never blocked
    if (isNowCompleted && item.onCompleteActions) {
      try {
        await inngest.send({
          id: `task-sheet-item-${itemId}-${Date.now()}`,
          name: "task-sheet/item-completed",
          data: {
            actions: item.onCompleteActions as unknown as OnCompleteAction[],
            item: {
              id: item.id,
              title: item.title,
              sheet: {
                title: item.sheet.title,
                companyId: item.sheet.companyId,
              },
            },
            user: {
              id: user.id,
              companyId: user.companyId,
              name: user.name,
            },
            companyId: user.companyId,
          },
        });
      } catch (sendError) {
        console.error("[TaskSheets] Error sending automation event:", sendError);
        // Don't fail the toggle if event dispatch fails
      }
    }

    revalidatePath("/tasks");
    revalidatePath("/tasks/my-sheets");

    return { success: true, data: updatedItem };
  } catch (error) {
    console.error("Error toggling item completion:", error);
    return { success: false, error: "Failed to toggle completion" };
  }
}


// Get my task sheets (for current user only)
export async function getMyTaskSheets() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    const now = new Date();

    const sheets = await prisma.taskSheet.findMany({
      where: {
        companyId: user.companyId,
        assigneeId: user.id,
        isActive: true,
        validFrom: { lte: now },
        OR: [{ validUntil: null }, { validUntil: { gte: now } }],
      },
      include: {
        items: {
          orderBy: [
            { isCompleted: "asc" },
            { priority: "asc" },
            { order: "asc" },
          ],
          include: {
            linkedTask: {
              select: {
                id: true,
                title: true,
                status: true,
                priority: true,
              },
            },
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [{ type: "asc" }, { createdAt: "desc" }],
    });

    return { success: true, data: sheets };
  } catch (error) {
    console.error("Error fetching my task sheets:", error);
    return { success: false, error: "Failed to fetch task sheets" };
  }
}

// Reset task sheet items (mark all as incomplete)
export async function resetTaskSheetItems(sheetId: number) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    // Verify sheet ownership/access
    const sheet = await prisma.taskSheet.findFirst({
      where: {
        id: sheetId,
        companyId: user.companyId,
        assigneeId: user.id, // Only assignee can reset their own sheet
      },
    });

    if (!sheet) {
      return { success: false, error: "Task sheet not found or unauthorized" };
    }

    const result = await prisma.taskSheetItem.updateMany({
      where: {
        sheetId: sheetId,
        isCompleted: true,
        sheet: { companyId: user.companyId },
      },
      data: {
        isCompleted: false,
        completedAt: null,
      },
    });

    revalidatePath("/tasks");
    revalidatePath("/tasks/my-sheets");

    return { success: true, count: result.count };
  } catch (error) {
    console.error("Error resetting task sheet:", error);
    return { success: false, error: "Failed to reset task sheet" };
  }
}

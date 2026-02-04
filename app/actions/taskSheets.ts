"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/permissions-server";

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
      | "SEND_WEBHOOK";
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

    const sheet = await prisma.taskSheet.update({
      where: { id },
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

    await prisma.taskSheet.delete({
      where: { id },
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
          select: { assigneeId: true, companyId: true },
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

    const updatedItem = await prisma.taskSheetItem.update({
      where: { id: itemId },
      data: updateData,
    });

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

    await prisma.taskSheetItem.delete({
      where: { id: itemId },
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

    const updatedItem = await prisma.taskSheetItem.update({
      where: { id: itemId },
      data: {
        isCompleted: isNowCompleted,
        completedAt: isNowCompleted ? new Date() : null,
      },
    });

    // Execute on-complete automations if item was just completed
    if (isNowCompleted && item.onCompleteActions) {
      try {
        await executeItemAutomations(
          item.onCompleteActions as unknown as OnCompleteAction[],
          item,
          user,
        );
      } catch (autoError) {
        console.error("[TaskSheets] Error executing automations:", autoError);
        // Don't fail the whole operation if automation fails
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

// Types for automation actions
interface OnCompleteAction {
  actionType:
    | "UPDATE_RECORD"
    | "CREATE_TASK"
    | "CREATE_FINANCE"
    | "SEND_NOTIFICATION"
    | "UPDATE_TASK"
    | "SEND_WEBHOOK";
  config: Record<string, unknown>;
}

// Execute automation actions when item is completed
async function executeItemAutomations(
  actions: OnCompleteAction[],
  item: {
    id: number;
    title: string;
    sheet: { title: string; companyId: number };
  },
  user: { id: number; companyId: number; name: string },
) {
  if (!actions || !Array.isArray(actions) || actions.length === 0) return;

  console.log(
    `[TaskSheets] Executing ${actions.length} automations for item ${item.id}`,
  );

  for (const action of actions) {
    try {
      switch (action.actionType) {
        case "UPDATE_RECORD":
          await executeUpdateRecord(action.config, user.companyId);
          break;
        case "CREATE_TASK":
          await executeCreateTask(action.config, user);
          break;
        case "UPDATE_TASK":
          await executeUpdateTask(action.config);
          break;
        case "CREATE_FINANCE":
          await executeCreateFinance(action.config, user.companyId);
          break;
        case "SEND_NOTIFICATION":
          await executeSendNotification(action.config, item, user);
          break;
        case "SEND_WEBHOOK":
          await executeSendWebhook(action.config, item, user);
          break;
        case "SEND_WHATSAPP":
          await executeSendWhatsapp(action.config, item, user);
          break;
        default:
          console.warn(
            `[TaskSheets] Unknown action type: ${action.actionType}`,
          );
      }
    } catch (error) {
      console.error(
        `[TaskSheets] Failed to execute ${action.actionType}:`,
        error,
      );
    }
  }
}

// Update a record in a table
async function executeUpdateRecord(
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
    console.warn(`[TaskSheets] Record ${recordId} not found or unauthorized`);
    return;
  }

  const currentData = record.data as Record<string, unknown>;
  const newData = { ...currentData, ...updates };

  await prisma.record.update({
    where: { id: recordId },
    data: { data: JSON.parse(JSON.stringify(newData)) },
  });

  console.log(`[TaskSheets] Updated record ${recordId} in table ${tableId}`);
}

// Create a new task
async function executeCreateTask(
  config: Record<string, unknown>,
  user: { id: number; companyId: number },
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

  await prisma.task.create({
    data: {
      companyId: user.companyId,
      title,
      description: description || null,
      status: status || "todo",
      priority: priority || null,
      assigneeId: assigneeId || null,
      dueDate: dueDate ? new Date(dueDate) : null,
    },
  });

  console.log(`[TaskSheets] Created task: ${title}`);
  revalidatePath("/tasks");
}

// Update an existing task
async function executeUpdateTask(config: Record<string, unknown>) {
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
    where: { id: taskId },
    data: updateData,
  });

  console.log(`[TaskSheets] Updated task ${taskId}`);
  revalidatePath("/tasks");
}

// Create a finance record
async function executeCreateFinance(
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

  await prisma.financeRecord.create({
    data: {
      companyId,
      title,
      amount,
      type, // "INCOME" or "EXPENSE"
      category: category || null,
      clientId: clientId || null,
      description: description || null,
      status: "COMPLETED",
    },
  });

  console.log(`[TaskSheets] Created finance record: ${title} - ${amount}`);
  revalidatePath("/finance");
}

// Send a notification
async function executeSendNotification(
  config: Record<string, unknown>,
  item: { id: number; title: string; sheet: { title: string } },
  user: { id: number; name: string },
) {
  const { recipientId, title, message } = config as {
    recipientId?: number;
    title?: string;
    message?: string;
  };

  if (!recipientId) return;

  // Replace placeholders
  const finalTitle = (title || "משימה הושלמה")
    .replace("{itemTitle}", item.title)
    .replace("{sheetTitle}", item.sheet.title)
    .replace("{userName}", user.name);

  const finalMessage = (message || "הפריט {itemTitle} הושלם")
    .replace("{itemTitle}", item.title)
    .replace("{sheetTitle}", item.sheet.title)
    .replace("{userName}", user.name);

  const { sendNotification } = await import("./notifications");
  await sendNotification({
    userId: recipientId,
    title: finalTitle,
    message: finalMessage,
    link: "/tasks?view=my-sheets",
  });

  console.log(`[TaskSheets] Sent notification to user ${recipientId}`);
}

// Send a webhook
async function executeSendWebhook(
  config: Record<string, unknown>,
  item: { id: number; title: string; sheet: { title: string } },
  user: { id: number; name: string },
) {
  const { url } = config as { url?: string };

  if (!url) return;

  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        event: "TASK_ITEM_COMPLETED",
        timestamp: new Date().toISOString(),
        item: {
          id: item.id,
          title: item.title,
        },
        sheet: {
          title: item.sheet.title,
        },
        completedBy: {
          id: user.id,
          name: user.name,
        },
      }),
    });

    console.log(`[TaskSheets] Sent webhook to ${url}`);
  } catch (error) {
    console.error(`[TaskSheets] Failed to send webhook to ${url}:`, error);
  }
}

// Send WhatsApp message
async function executeSendWhatsapp(
  config: Record<string, unknown>,
  item: {
    id: number;
    title: string;
    sheet: { title: string; companyId: number };
  },
  user: { id: number; name: string },
) {
  const { phone, message } = config as { phone?: string; message?: string };

  if (!phone || !message) return;

  // Replace placeholders
  const finalMessage = message
    .replace("{itemTitle}", item.title)
    .replace("{sheetTitle}", item.sheet.title)
    .replace("{userName}", user.name);

  try {
    const { sendGreenApiMessage } = await import("./green-api");
    await sendGreenApiMessage(item.sheet.companyId, phone, finalMessage);
    console.log(`[TaskSheets] Sent WhatsApp to ${phone}`);
  } catch (error) {
    console.error(`[TaskSheets] Failed to send WhatsApp to ${phone}:`, error);
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

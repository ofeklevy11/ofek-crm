/**
 * Task sheet automation executors.
 *
 * These are intentionally NOT in a "use server" file so they cannot be invoked
 * as public Next.js server actions. They are called only from background jobs
 * (Inngest) and from the server-action layer in app/actions/taskSheets.ts.
 */

import { prisma } from "@/lib/prisma";

// Types for automation actions
export interface OnCompleteAction {
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
}

export interface AutomationItem {
  id: number;
  title: string;
  sheet: { title: string; companyId: number };
}

export interface AutomationUser {
  id: number;
  companyId: number;
  name: string;
}

/**
 * Execute a single automation action.
 * Designed to be called per-action from individual Inngest step.run() calls.
 */
export async function executeSingleAction(
  action: OnCompleteAction,
  item: AutomationItem,
  user: AutomationUser,
) {
  switch (action.actionType) {
    case "UPDATE_RECORD":
      await executeUpdateRecord(action.config, user.companyId);
      break;
    case "CREATE_TASK":
      await executeCreateTask(action.config, user);
      break;
    case "UPDATE_TASK":
      await executeUpdateTask(action.config, user.companyId);
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
    case "CREATE_CALENDAR_EVENT":
      await executeCreateCalendarEvent(action.config, user);
      break;
    case "CREATE_RECORD":
      await executeCreateRecord(action.config, user.companyId);
      break;
    default:
      console.warn(
        `[TaskSheets] Unknown action type: ${action.actionType}`,
      );
  }
}

// Create calendar event
async function executeCreateCalendarEvent(
  config: Record<string, unknown>,
  user: { id: number; companyId: number },
) {
  const { title, description, startTime, endTime } = config as {
    title?: string;
    description?: string;
    startTime?: string;
    endTime?: string;
  };

  if (!title || !startTime || !endTime) return;

  // createCalendarEvent is a server action that derives companyId from
  // getCurrentUser(). In background context there is no session, so we
  // create the event directly via Prisma instead.
  await prisma.calendarEvent.create({
    data: {
      companyId: user.companyId,
      title,
      description: description || null,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
    },
  });

  console.log(`[TaskSheets] Created calendar event: ${title}`);
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

  // SECURITY: Include companyId and tableId in WHERE to prevent TOCTOU race
  await prisma.record.update({
    where: { id: recordId, companyId, tableId },
    data: { data: JSON.parse(JSON.stringify(newData)) },
  });

  console.log(`[TaskSheets] Updated record ${recordId} in table ${tableId}`);
}

// Create a new record in a table
async function executeCreateRecord(
  config: Record<string, unknown>,
  companyId: number,
) {
  const { tableId, values } = config as {
    tableId: number;
    values: Record<string, unknown>;
  };

  if (!tableId || !values) return;

  // SECURITY: Validate tableId belongs to the same company
  const table = await prisma.tableMeta.findFirst({
    where: { id: tableId, companyId },
    select: { id: true },
  });
  if (!table) {
    console.warn(`[TaskSheets] Table ${tableId} not found or unauthorized for company ${companyId}`);
    return;
  }

  await prisma.record.create({
    data: {
      companyId,
      tableId,
      data: JSON.parse(JSON.stringify(values)),
    },
  });

  console.log(`[TaskSheets] Created record in table ${tableId}`);
}

// Create a new task (no revalidatePath — runs in background context)
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

  // SECURITY: Validate assigneeId belongs to the same company
  let validAssigneeId: number | null = assigneeId || null;
  if (validAssigneeId) {
    const validUser = await prisma.user.findFirst({
      where: { id: validAssigneeId, companyId: user.companyId },
      select: { id: true },
    });
    if (!validUser) validAssigneeId = null;
  }

  await prisma.task.create({
    data: {
      companyId: user.companyId,
      title,
      description: description || null,
      status: status || "todo",
      priority: priority || null,
      assigneeId: validAssigneeId,
      dueDate: dueDate ? new Date(dueDate) : null,
    },
  });

  console.log(`[TaskSheets] Created task: ${title}`);
}

// Update an existing task (no revalidatePath — runs in background context)
async function executeUpdateTask(config: Record<string, unknown>, companyId: number) {
  const { taskId, updates } = config as {
    taskId: string;
    updates: Record<string, unknown>;
  };

  if (!taskId || !updates) return;

  // Verify task belongs to the same company before updating
  const task = await prisma.task.findFirst({
    where: { id: taskId, companyId },
    select: { id: true },
  });

  if (!task) {
    console.warn(`[TaskSheets] Task ${taskId} not found or unauthorized for company ${companyId}`);
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (updates.status !== undefined) updateData.status = updates.status;
  if (updates.priority !== undefined) updateData.priority = updates.priority;
  if (updates.assigneeId !== undefined) {
    if (updates.assigneeId) {
      const validUser = await prisma.user.findFirst({
        where: { id: Number(updates.assigneeId), companyId },
        select: { id: true },
      });
      updateData.assigneeId = validUser ? Number(updates.assigneeId) : null;
    } else {
      updateData.assigneeId = null;
    }
  }
  if (updates.title !== undefined) updateData.title = updates.title;
  if (updates.description !== undefined)
    updateData.description = updates.description;

  await prisma.task.update({
    where: { id: taskId, companyId },
    data: updateData,
  });

  console.log(`[TaskSheets] Updated task ${taskId}`);
}

// Create a finance record (no revalidatePath — runs in background context)
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

  // SECURITY: Validate clientId belongs to the same company
  let validClientId: number | null = clientId || null;
  if (validClientId) {
    const validClient = await prisma.client.findFirst({
      where: { id: validClientId, companyId },
      select: { id: true },
    });
    if (!validClient) validClientId = null;
  }

  await prisma.financeRecord.create({
    data: {
      companyId,
      title,
      amount,
      type,
      category: category || null,
      clientId: validClientId,
      description: description || null,
      status: "COMPLETED",
    },
  });

  console.log(`[TaskSheets] Created finance record: ${title} - ${amount}`);
}

// Send a notification
async function executeSendNotification(
  config: Record<string, unknown>,
  item: { id: number; title: string; sheet: { title: string; companyId: number } },
  user: { id: number; name: string },
) {
  const { recipientId, title, message } = config as {
    recipientId?: number;
    title?: string;
    message?: string;
  };

  if (!recipientId) return;

  const finalTitle = (title || "משימה הושלמה")
    .replace("{itemTitle}", item.title)
    .replace("{sheetTitle}", item.sheet.title)
    .replace("{userName}", user.name);

  const finalMessage = (message || "הפריט {itemTitle} הושלם")
    .replace("{itemTitle}", item.title)
    .replace("{sheetTitle}", item.sheet.title)
    .replace("{userName}", user.name);

  const { createNotificationForCompany } = await import("@/app/actions/notifications");
  await createNotificationForCompany({
    companyId: item.sheet.companyId,
    userId: recipientId,
    title: finalTitle,
    message: finalMessage,
    link: "/tasks?view=my-sheets",
  });

  console.log(`[TaskSheets] Sent notification to user ${recipientId}`);
}

// Send a webhook via Inngest for retry + rate limiting
async function executeSendWebhook(
  config: Record<string, unknown>,
  item: { id: number; title: string; sheet: { title: string; companyId: number } },
  user: { id: number; name: string },
) {
  const { url } = config as { url?: string };

  if (!url) return;

  const { inngest } = await import("@/lib/inngest/client");
  try {
    const urlHost = (() => { try { return new URL(url).hostname; } catch { return "invalid"; } })();
    await inngest.send({
      id: `webhook-tasksheet-${item.sheet.companyId}-${item.id}-${urlHost}-${Math.floor(Date.now() / 5000)}`,
      name: "automation/send-webhook",
      data: {
        url,
        companyId: item.sheet.companyId,
        ruleId: 0,
        payload: {
          ruleId: 0,
          ruleName: `TaskSheet: ${item.sheet.title}`,
          triggerType: "TASK_ITEM_COMPLETED",
          companyId: item.sheet.companyId,
          data: {
            item: { id: item.id, title: item.title },
            sheet: { title: item.sheet.title },
            completedBy: { id: user.id, name: user.name },
          },
        },
      },
    });
    console.log(`[TaskSheets] Webhook job enqueued to ${url}`);
  } catch (err) {
    console.error(`[TaskSheets] Failed to enqueue webhook job:`, err);
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
  let phoneNumber: string | null = null;

  if (
    config.phoneSource === "table" &&
    config.waTableId &&
    config.waPhoneColumn
  ) {
    // SECURITY: Validate waTableId belongs to the same company
    const waTable = await prisma.tableMeta.findFirst({
      where: { id: Number(config.waTableId), companyId: item.sheet.companyId },
      select: { id: true },
    });
    if (!waTable) {
      console.warn(`[TaskSheets] WhatsApp: Table ${config.waTableId} not found or unauthorized`);
      return;
    }

    try {
      let record;
      if (config.waRecordId) {
        record = await prisma.record.findFirst({
          where: {
            id: Number(config.waRecordId),
            tableId: Number(config.waTableId),
            companyId: item.sheet.companyId,
          },
        });
      } else {
        record = await prisma.record.findFirst({
          where: {
            tableId: Number(config.waTableId),
            companyId: item.sheet.companyId,
          },
          orderBy: { createdAt: "desc" },
        });
      }

      if (record && record.data) {
        const recordData = record.data as Record<string, unknown>;
        phoneNumber = recordData[config.waPhoneColumn as string] as string;
        console.log(
          `[TaskSheets] WhatsApp: Fetched phone ${phoneNumber} from table ${config.waTableId}, column ${config.waPhoneColumn}`,
        );
      } else {
        console.warn(
          `[TaskSheets] WhatsApp: Record not found in table ${config.waTableId}`,
        );
      }
    } catch (fetchError) {
      console.error(
        "[TaskSheets] WhatsApp: Error fetching phone from table:",
        fetchError,
      );
    }
  } else {
    phoneNumber = config.phone as string;
  }

  const message = config.message as string | undefined;

  if (!phoneNumber || !message) {
    console.warn("[TaskSheets] WhatsApp: Missing phone or message");
    return;
  }

  const finalMessage = message
    .replace("{itemTitle}", item.title)
    .replace("{sheetTitle}", item.sheet.title)
    .replace("{userName}", user.name);

  // Dispatch to Inngest for retry + rate limiting instead of direct API call
  const { inngest } = await import("@/lib/inngest/client");
  try {
    await inngest.send({
      id: `wa-tasksheet-${item.sheet.companyId}-${phoneNumber}-${item.id}-${Math.floor(Date.now() / 5000)}`,
      name: "automation/send-whatsapp",
      data: {
        companyId: item.sheet.companyId,
        phone: String(phoneNumber),
        content: finalMessage,
      },
    });
    console.log(`[TaskSheets] WhatsApp job enqueued for ${phoneNumber}`);
  } catch (err) {
    console.error(`[TaskSheets] Failed to enqueue WhatsApp job:`, err);
  }
}

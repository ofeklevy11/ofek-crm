/**
 * Task sheet automation executors.
 *
 * These are intentionally NOT in a "use server" file so they cannot be invoked
 * as public Next.js server actions. They are called only from background jobs
 * (Inngest) and from the server-action layer in app/actions/taskSheets.ts.
 */

import { prisma } from "@/lib/prisma";
import { isPrivateUrl } from "@/lib/security/ssrf";
import { createLogger } from "@/lib/logger";

const log = createLogger("TaskSheetAuto");

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
    | "SEND_SMS"
    | "SEND_EMAIL"
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
    case "SEND_SMS":
      await executeSendSms(action.config, item, user);
      break;
    case "SEND_EMAIL":
      await executeSendEmail(action.config, item, user);
      break;
    case "CREATE_CALENDAR_EVENT":
      await executeCreateCalendarEvent(action.config, user);
      break;
    case "CREATE_RECORD":
      await executeCreateRecord(action.config, user.companyId);
      break;
    default:
      log.warn("Unknown action type", { actionType: action.actionType });
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

  log.info("Created calendar event", { title });
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
    log.warn("Record not found or unauthorized", { recordId });
    return;
  }

  const currentData = record.data as Record<string, unknown>;
  const newData = { ...currentData, ...updates };

  // SECURITY: Include companyId and tableId in WHERE to prevent TOCTOU race
  await prisma.record.update({
    where: { id: recordId, companyId, tableId },
    data: { data: JSON.parse(JSON.stringify(newData)) },
  });

  log.info("Updated record", { recordId, tableId });
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
    log.warn("Table not found or unauthorized", { tableId, companyId });
    return;
  }

  await prisma.record.create({
    data: {
      companyId,
      tableId,
      data: JSON.parse(JSON.stringify(values)),
    },
  });

  log.info("Created record in table", { tableId });
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
      status: (status || "todo") as "todo" | "in_progress" | "waiting_client" | "on_hold" | "completed_month" | "done",
      priority: (priority || null) as "low" | "medium" | "high" | null,
      assigneeId: validAssigneeId,
      dueDate: dueDate ? new Date(dueDate) : null,
    },
  });

  log.info("Created task", { title });
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
    log.warn("Task not found or unauthorized", { taskId, companyId });
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

  log.info("Updated task", { taskId });
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
      type: type as "INCOME" | "EXPENSE",
      category: category || null,
      clientId: validClientId,
      description: description || null,
      status: "COMPLETED",
    },
  });

  log.info("Created finance record", { title });
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

  const { createNotificationForCompany } = await import("@/lib/notifications-internal");
  await createNotificationForCompany({
    companyId: item.sheet.companyId,
    userId: recipientId,
    title: finalTitle,
    message: finalMessage,
    link: "/tasks?view=my-sheets",
  });

  log.info("Sent notification to user", { recipientId });
}

// Send a webhook via Inngest for retry + rate limiting
async function executeSendWebhook(
  config: Record<string, unknown>,
  item: { id: number; title: string; sheet: { title: string; companyId: number } },
  user: { id: number; name: string },
) {
  const { url } = config as { url?: string };

  if (!url) return;

  if (isPrivateUrl(url)) {
    log.warn("SSRF blocked on task-sheet webhook");
    return;
  }

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
    log.info("Webhook job enqueued", { hostname: urlHost });
  } catch (err) {
    log.error("Failed to enqueue webhook job", { error: String(err) });
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
      log.warn("WhatsApp: Table not found or unauthorized", { waTableId: config.waTableId });
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
        log.debug("WhatsApp: Fetched phone from table", { waTableId: config.waTableId, waPhoneColumn: config.waPhoneColumn });
      } else {
        log.warn("WhatsApp: Record not found in table", { waTableId: config.waTableId });
      }
    } catch (fetchError) {
      log.error("WhatsApp: Error fetching phone from table", { error: String(fetchError) });
    }
  } else {
    phoneNumber = config.phone as string;
  }

  const message = config.message as string | undefined;

  if (!phoneNumber || !message) {
    log.warn("WhatsApp: Missing phone or message");
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
    log.info("WhatsApp job enqueued");
  } catch (err) {
    log.error("Failed to enqueue WhatsApp job", { error: String(err) });
  }
}

// Send SMS message
async function executeSendSms(
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
    const smsTable = await prisma.tableMeta.findFirst({
      where: { id: Number(config.waTableId), companyId: item.sheet.companyId },
      select: { id: true },
    });
    if (!smsTable) {
      log.warn("SMS: Table not found or unauthorized", { waTableId: config.waTableId });
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
      } else {
        log.warn("SMS: Record not found in table", { waTableId: config.waTableId });
      }
    } catch (fetchError) {
      log.error("SMS: Error fetching phone from table", { error: String(fetchError) });
    }
  } else {
    phoneNumber = config.phone as string;
  }

  const message = config.message as string | undefined;

  if (!phoneNumber || !message) {
    log.warn("SMS: Missing phone or message");
    return;
  }

  const finalMessage = message
    .replace("{itemTitle}", item.title)
    .replace("{sheetTitle}", item.sheet.title)
    .replace("{userName}", user.name);

  const { inngest } = await import("@/lib/inngest/client");
  try {
    await inngest.send({
      id: `sms-tasksheet-${item.sheet.companyId}-${phoneNumber}-${item.id}-${Math.floor(Date.now() / 5000)}`,
      name: "automation/send-sms",
      data: {
        companyId: item.sheet.companyId,
        phone: String(phoneNumber),
        content: finalMessage,
      },
    });
    log.info("SMS job enqueued");
  } catch (err) {
    log.error("Failed to enqueue SMS job", { error: String(err) });
  }
}

// Send Email
async function executeSendEmail(
  config: Record<string, unknown>,
  item: {
    id: number;
    title: string;
    sheet: { title: string; companyId: number };
  },
  user: { id: number; name: string },
) {
  let emailAddress: string | null = null;

  if (
    config.emailSource === "table" &&
    config.emailTableId &&
    config.emailColumn
  ) {
    const emailTable = await prisma.tableMeta.findFirst({
      where: { id: Number(config.emailTableId), companyId: item.sheet.companyId },
      select: { id: true },
    });
    if (!emailTable) {
      log.warn("Email: Table not found or unauthorized", { emailTableId: config.emailTableId });
      return;
    }

    try {
      let record;
      if (config.emailRecordId) {
        record = await prisma.record.findFirst({
          where: {
            id: Number(config.emailRecordId),
            tableId: Number(config.emailTableId),
            companyId: item.sheet.companyId,
          },
        });
      } else {
        record = await prisma.record.findFirst({
          where: {
            tableId: Number(config.emailTableId),
            companyId: item.sheet.companyId,
          },
          orderBy: { createdAt: "desc" },
        });
      }

      if (record && record.data) {
        const recordData = record.data as Record<string, unknown>;
        emailAddress = recordData[config.emailColumn as string] as string;
      } else {
        log.warn("Email: Record not found in table", { emailTableId: config.emailTableId });
      }
    } catch (fetchError) {
      log.error("Email: Error fetching email from table", { error: String(fetchError) });
    }
  } else {
    emailAddress = config.email as string;
  }

  const subject = config.subject as string | undefined;
  const message = config.message as string | undefined;

  if (!emailAddress || !message) {
    log.warn("Email: Missing email or message");
    return;
  }

  const finalSubject = (subject || "")
    .replace("{itemTitle}", item.title)
    .replace("{sheetTitle}", item.sheet.title)
    .replace("{userName}", user.name);

  const finalMessage = message
    .replace("{itemTitle}", item.title)
    .replace("{sheetTitle}", item.sheet.title)
    .replace("{userName}", user.name);

  const { inngest } = await import("@/lib/inngest/client");
  try {
    await inngest.send({
      id: `email-tasksheet-${item.sheet.companyId}-${emailAddress}-${item.id}-${Math.floor(Date.now() / 5000)}`,
      name: "automation/send-email",
      data: {
        companyId: item.sheet.companyId,
        to: String(emailAddress),
        subject: finalSubject,
        body: finalMessage,
      },
    });
    log.info("Email job enqueued");
  } catch (err) {
    log.error("Failed to enqueue Email job", { error: String(err) });
  }
}

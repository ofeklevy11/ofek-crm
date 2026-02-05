"use server";

import { prisma } from "@/lib/prisma";
// import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import {
  sendNotification,
  createNotificationForCompany,
} from "./notifications";
import { processMultiEventDurationTrigger } from "./multi-event-automations";
import { calculateViewStats } from "./analytics";

// --- Types ---
interface TriggerConfig {
  fromStatus?: string;
  toStatus?: string;
  tableId?: string | number; // Support both for safety
  columnId?: string;
  toValue?: any;
  fromValue?: any;
  viewId?: number | string;
  operator?: "lt" | "gt";
  threshold?: number | string;
  [key: string]: any;
}

interface ActionConfig {
  recipientId?: number;
  messageTemplate?: string;
  titleTemplate?: string;
  title?: string;
  description?: string;
  assigneeId?: number | string;
  status?: string;
  priority?: string;
  dueDate?: string | Date;
  actions?: { type: string; config: any }[]; // For MULTI_ACTION
  [key: string]: any;
}

// Unified Action Executor
export async function executeRuleActions(
  rule: any,
  context: {
    recordData?: any;
    oldRecordData?: any;
    taskId?: string;
    taskTitle?: string;
    fromStatus?: string;
    toStatus?: string;
    tableName?: string;
    tableId?: number;
    recordId?: number;
  },
) {
  const { companyId, id: ruleId, createdBy } = rule;

  const executeSingle = async (type: string, config: any) => {
    console.log(`[Automations] Executing Action: ${type} for Rule ${ruleId}`);
    try {
      if (type === "SEND_NOTIFICATION") {
        if (config.recipientId) {
          let message = config.messageTemplate || "עדכון במערכת";
          let title = config.titleTemplate || "עדכון אוטומטי";
          let link = "/";

          // Dynamic Replacements
          if (context.tableName) {
            message = message.replace("{tableName}", context.tableName);
            title = title.replace("{tableName}", context.tableName);
            if (context.tableName === "Calendar") {
              link = "/calendar";
            } else {
              link = `/tables/${context.tableId}`;
            }
          }
          if (context.recordData) {
            for (const key in context.recordData) {
              message = message.replace(
                new RegExp(`{${key}}`, "g"),
                String(context.recordData[key] || ""),
              );
            }
          }
          if (context.taskTitle) {
            message = message
              .replace("{taskTitle}", context.taskTitle)
              .replace("{fromStatus}", context.fromStatus || "")
              .replace("{toStatus}", context.toStatus || "");
            link = "/tasks";
          }
          // Field Change Replacements
          if (
            context.oldRecordData &&
            rule.triggerType === "RECORD_FIELD_CHANGE"
          ) {
            const colId = rule.triggerConfig?.columnId;
            if (colId) {
              message = message
                .replace(`{fieldName}`, colId)
                .replace(`{fromValue}`, String(context.oldRecordData[colId]))
                .replace(`{toValue}`, String(context.recordData[colId]));
            }
          }

          const notifRes = await createNotificationForCompany({
            companyId,
            userId: config.recipientId,
            title,
            message,
            link,
          });
          if (!notifRes.success) {
            console.error(
              `[Automations] Notification failed for rule ${ruleId}: ${notifRes.error}`,
            );
          }
        }
      } else if (type === "SEND_WHATSAPP") {
        // Sleep if configured (to avoid blocks)
        if (config.delay) {
          console.log(
            `[Automations] Sleeping for ${config.delay} seconds before sending WhatsApp...`,
          );
          await new Promise((r) => setTimeout(r, config.delay * 1000));
        }

        // Prepare data for WA
        const data = { ...context.recordData };
        if (context.taskTitle) {
          data.taskTitle = context.taskTitle;
          data.fromStatus = context.fromStatus;
          data.toStatus = context.toStatus;
        }
        await executeWhatsAppAction({ actionConfig: config }, data, companyId);
      } else if (type === "WEBHOOK") {
        const data = { ...context.recordData, ...context };
        await executeWebhookAction(
          { ...rule, actionConfig: config },
          data,
          companyId,
        );
      } else if (type === "CALCULATE_DURATION") {
        // This is specific logic that relies on DB logs.
        // We'll keep the specific logic in the trigger functions for now
        // OR we should move it here?
        // Duration calculation is complex and depends on trigger type.
        // For now, if we use MULTI_ACTION, we might skip Duration or handle it if we can.
        // Current implementation of 'processTaskStatusChange' handles it specifically.
        // Let's defer it to the specific handlers if possible, or implement generic here.
        // Since calculate duration writes to DB based on audit logs, it's safer to keep the specialized logic
        // BUT we want to support it in multi-action.
        // I will implement a generic "Trigger Calculation" call if possible?
        // Actually, let's leave Duration for the specific handlers to call if the type matches,
        // BUT standard "multi-action" flow usually implies "Send X, then Send Y".
        // Duration is usually a standalone metric tracker.
        // If the user wants to calculate duration AND send whatsapp, we should support it.

        if (
          rule.triggerType === "TASK_STATUS_CHANGE" &&
          context.taskId &&
          context.fromStatus
        ) {
          await calculateTaskDuration(context.taskId, context.fromStatus);
        } else if (
          rule.triggerType === "RECORD_FIELD_CHANGE" &&
          context.recordId &&
          context.oldRecordData
        ) {
          const colId = rule.triggerConfig?.columnId;
          if (colId)
            await calculateRecordDuration(
              rule.id,
              context.recordId,
              colId,
              context.oldRecordData[colId],
              context.recordData[colId],
            );
        }
      } else if (type === "ADD_TO_NURTURE_LIST") {
        // Logic for nurture list
        if (context.recordData) {
          const mapping = config.mapping || {};
          const name = context.recordData[mapping.name] || "Unknown";
          const email = context.recordData[mapping.email] || "";
          const phone = context.recordData[mapping.phone] || "";

          if (email || phone) {
            await addToNurtureList({
              companyId,
              listSlug: config.listId,
              name,
              email,
              phone,
              sourceType: "TABLE",
              sourceId: String(context.recordId),
              sourceTableId: context.tableId,
            });
          }
        }
      } else if (type === "UPDATE_RECORD_FIELD") {
        // Update a specific field in the current record
        if (context.recordId && config.columnId) {
          try {
            const record = await prisma.record.findFirst({
              where: { id: context.recordId, companyId },
            });

            if (record) {
              const currentData = record.data as Record<string, unknown>;
              const newData = {
                ...currentData,
                [config.columnId]: config.value,
              };

              await prisma.record.update({
                where: { id: context.recordId },
                data: { data: JSON.parse(JSON.stringify(newData)) },
              });

              console.log(
                `[Automations] Updated field ${config.columnId} to "${config.value}" for record ${context.recordId}`,
              );
            }
          } catch (updateError) {
            console.error(
              `[Automations] Error updating record field:`,
              updateError,
            );
          }
        }
      } else if (type === "CREATE_TASK") {
        const {
          title,
          description,
          status,
          priority,
          assigneeId,
          dueDays,
          tags,
        } = config;

        let finalTitle = title || "משימה חדשה";
        let finalDesc = description || "";

        // Dynamic Replacements Helper
        const replaceText = (text: string) => {
          let res = text;
          if (context.tableName) {
            res = res.replace(/{tableName}/g, context.tableName);
          }
          if (context.recordData) {
            for (const key in context.recordData) {
              const val = context.recordData[key];
              res = res.replace(new RegExp(`{${key}}`, "g"), String(val || ""));
            }
          }
          if (context.taskTitle) {
            res = res
              .replace(/{taskTitle}/g, context.taskTitle)
              .replace(/{fromStatus}/g, context.fromStatus || "")
              .replace(/{toStatus}/g, context.toStatus || "");
          }
          if (
            context.oldRecordData &&
            rule.triggerType === "RECORD_FIELD_CHANGE"
          ) {
            const colId = rule.triggerConfig?.columnId;
            if (colId) {
              res = res
                .replace(/{fieldName}/g, colId)
                .replace(/{fromValue}/g, String(context.oldRecordData[colId]))
                .replace(/{toValue}/g, String(context.recordData[colId]));
            }
          }
          return res;
        };

        finalTitle = replaceText(finalTitle);
        finalDesc = replaceText(finalDesc);

        // Calculate Due Date
        let dueDate = null;
        if (dueDays !== undefined && dueDays !== null && dueDays !== "") {
          const date = new Date();
          date.setDate(date.getDate() + Number(dueDays));
          dueDate = date;
        }

        console.log(
          `[Automations] Creating Task: ${finalTitle} (Assignee: ${assigneeId}, Due: ${dueDate})`,
        );

        try {
          await prisma.task.create({
            data: {
              title: finalTitle,
              description: finalDesc,
              status: status || "todo",
              priority: priority || "low",
              assigneeId: assigneeId ? Number(assigneeId) : null,
              dueDate: dueDate,
              tags: tags || [],
              companyId: companyId,
            },
          });
          console.log(`[Automations] Task created successfully.`);
        } catch (taskError) {
          console.error(`[Automations] Task Creation Error:`, taskError);
          // If this fails, we want to know why.
        }
      }
    } catch (e) {
      console.error(`[Automations] Error executing action ${type}:`, e);
    }
  };

  if (rule.actionType === "MULTI_ACTION") {
    const actions = rule.actionConfig?.actions || [];
    for (const action of actions) {
      await executeSingle(action.type, action.config);
    }
  } else {
    await executeSingle(rule.actionType, rule.actionConfig);
  }
}

// Helpers for Duration (moved/extracted logic)
async function calculateTaskDuration(taskId: string, fromStatus: string) {
  const recentLogs = await prisma.auditLog.findMany({
    where: { taskId: taskId, action: "UPDATE" },
    orderBy: { timestamp: "desc" },
    take: 20,
  });
  let previousChange = null;
  for (const log of recentLogs) {
    const diff = log.diffJson as any;
    if (diff && diff.status && diff.status.to === fromStatus) {
      previousChange = log;
      break;
    }
  }
  if (previousChange) {
    const startTime = new Date(previousChange.timestamp).getTime();
    const endTime = new Date().getTime();
    const diffMs = endTime - startTime;
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffDays = Math.floor(diffMinutes / (60 * 24));
    const remHours = Math.floor((diffMinutes % (60 * 24)) / 60);
    const remMins = diffMinutes % 60;

    const durationString = `${diffDays}d ${remHours}h ${remMins}m|->`;
    await prisma.task.update({
      where: { id: taskId },
      data: { duration_status_change: durationString },
    });
  }
}

async function calculateRecordDuration(
  ruleId: number,
  recordId: number,
  columnId: string,
  oldValue: any,
  newValue: any,
) {
  // Simplified Logic
  const recentLogs = await prisma.auditLog.findMany({
    where: { recordId: recordId, action: { in: ["UPDATE", "CREATE"] } },
    orderBy: { timestamp: "desc" },
    take: 100,
  });

  let startTime: Date | null = null;
  for (const log of recentLogs) {
    const logData = log.diffJson as any;
    if (logData && String(logData[columnId]) === String(oldValue)) {
      startTime = log.timestamp;
      break;
    }
  }
  if (!startTime) {
    // Check Create
    const createLog = recentLogs.find((l) => l.action === "CREATE");
    if (createLog) {
      const d = createLog.diffJson as any;
      if (d && String(d[columnId]) === String(oldValue))
        startTime = createLog.timestamp;
    }
  }

  if (startTime) {
    const endTime = new Date();
    const diffMs = endTime.getTime() - new Date(startTime).getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    await prisma.statusDuration.create({
      data: {
        automationRuleId: ruleId,
        recordId: recordId,
        durationSeconds: diffSeconds,
        durationString: `${Math.floor(diffSeconds / 86400)}d...`, // Simplified
        fromValue: String(oldValue),
        toValue: String(newValue),
      },
    });
  }
}

export async function executeWhatsAppAction(
  rule: any,
  recordData: any,
  companyId: number,
) {
  const { sendGreenApiMessage, sendGreenApiFile } = await import("./green-api");
  const config = rule.actionConfig;
  const phoneColumnId = config.phoneColumnId;

  if (!phoneColumnId) return;

  if (!phoneColumnId) return;

  let phone = "";
  if (phoneColumnId.startsWith("manual:")) {
    phone = phoneColumnId.replace("manual:", "");
  } else {
    phone = recordData[phoneColumnId];
  }

  if (!phone) {
    console.log(
      `[Automations] WhatsApp action: No phone number resolved from ${phoneColumnId}`,
    );
    return;
  }

  // Resolve content
  let content = config.content || "";
  // Check for dynamic placeholders {Key}
  for (const key in recordData) {
    const val = recordData[key];
    // Replace all occurrences
    content = content.split(`{${key}}`).join(String(val || ""));
  }

  try {
    if (config.messageType === "media" && config.mediaFileId) {
      const file = await prisma.file.findUnique({
        where: { id: Number(config.mediaFileId) },
      });

      if (file && file.url) {
        await sendGreenApiFile(
          companyId,
          String(phone),
          file.url,
          file.name,
          content,
        );
        console.log(`[Automations] WhatsApp file sent to ${phone}`);
      } else {
        console.error(
          `[Automations] WhatsApp file not found: ${config.mediaFileId}`,
        );
      }
    } else {
      // Normal message (private or just text)
      await sendGreenApiMessage(companyId, String(phone), content);
      console.log(`[Automations] WhatsApp message sent to ${phone}`);
    }
  } catch (err) {
    console.error(`[Automations] WhatsApp Send Error:`, err);
  }
}

export async function executeWebhookAction(
  rule: any,
  data: any,
  companyId: number,
) {
  const config = rule.actionConfig;
  const url = config.webhookUrl || config.url;

  if (!url) {
    console.warn(
      `[Automations] Webhook action missing URL (checked webhookUrl and url) for Rule ${rule.id}`,
    );
    return;
  }

  console.log(`[Automations] Executing Webhook for Rule ${rule.id} to ${url}`);
  console.log(
    `[Automations] Webhook Payload Preview:`,
    JSON.stringify(data).substring(0, 200) + "...",
  );

  try {
    const payload = {
      ruleId: rule.id,
      ruleName: rule.name,
      triggerType: rule.triggerType,
      companyId: companyId,
      timestamp: new Date().toISOString(),
      data: data,
    };

    const response = await fetch(url, {
      method: "POST", // Support config.method later if needed, but UI saves method too at config.method
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error(
        `[Automations] Webhook failed with status ${response.status}: ${response.statusText}`,
      );
      const text = await response.text();
      console.error(`[Automations] Webhook response body:`, text);
    } else {
      console.log(`[Automations] Webhook sent successfully.`);
    }
  } catch (err) {
    console.error(`[Automations] Webhook Execution Error:`, err);
  }
}

// --- CRUD Actions ---

export async function getAutomationRules() {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return { success: false, error: "Authentication required" };
    }

    // CRITICAL: Filter by companyId for multi-tenancy
    const rules = await prisma.automationRule.findMany({
      where: { companyId: currentUser.companyId },
      orderBy: { createdAt: "desc" },
      include: {
        creator: {
          select: { name: true },
        },
        calendarEvent: {
          select: { title: true },
        },
      },
    });
    return { success: true, data: rules };
  } catch (error) {
    console.error("Error fetching automation rules:", error);
    return { success: false, error: "Failed to fetch automation rules" };
  }
}

export async function createAutomationRule(data: {
  name: string;
  triggerType: string;
  triggerConfig: any;
  actionType: string;
  actionConfig: any;
}) {
  try {
    // Get the current authenticated user from session
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return { success: false, error: "Authentication required" };
    }

    // Validate TIME_SINCE_CREATION with minutes unit
    if (data.triggerType === "TIME_SINCE_CREATION") {
      const { timeValue, timeUnit } = data.triggerConfig || {};
      if (timeUnit === "minutes" && Number(timeValue) < 5) {
        return {
          success: false,
          error: "בעת בחירת דקות, הזמן המינימלי הוא 5 דקות לפחות",
        };
      }
    }

    let folderId: number | null = (data as any).folderId || null;

    // Auto-assign folder for specific triggers if no folder provided
    if (!folderId) {
      if (
        data.triggerType === "TICKET_STATUS_CHANGE" ||
        data.triggerType === "SLA_BREACH"
      ) {
        const folderName = "אוטומציות שירות"; // Service Automations
        const folder = await prisma.viewFolder.findFirst({
          where: {
            companyId: currentUser.companyId,
            name: folderName,
            type: "AUTOMATION",
          },
        });

        if (folder) {
          folderId = folder.id;
        } else {
          const newFolder = await prisma.viewFolder.create({
            data: {
              companyId: currentUser.companyId,
              name: folderName,
              type: "AUTOMATION",
            },
          });
          folderId = newFolder.id;
        }
      } else if (data.triggerType === "TASK_STATUS_CHANGE") {
        const folderName = "אוטומציות משימות"; // Task Automations
        const folder = await prisma.viewFolder.findFirst({
          where: {
            companyId: currentUser.companyId,
            name: folderName,
            type: "AUTOMATION",
          },
        });

        if (folder) {
          folderId = folder.id;
        } else {
          const newFolder = await prisma.viewFolder.create({
            data: {
              companyId: currentUser.companyId,
              name: folderName,
              type: "AUTOMATION",
            },
          });
          folderId = newFolder.id;
        }
      } else if (data.triggerType === "MULTI_EVENT_DURATION") {
        const folderName = "אוטומציות אירועים מרובים";
        const folder = await prisma.viewFolder.findFirst({
          where: {
            companyId: currentUser.companyId,
            name: folderName,
            type: "AUTOMATION",
          },
        });

        if (folder) {
          folderId = folder.id;
        } else {
          const newFolder = await prisma.viewFolder.create({
            data: {
              companyId: currentUser.companyId,
              name: folderName,
              type: "AUTOMATION",
            },
          });
          folderId = newFolder.id;
        }
      }
    }

    const rule = await prisma.automationRule.create({
      data: {
        name: data.name,
        triggerType: data.triggerType,
        triggerConfig: data.triggerConfig as any,
        actionType: data.actionType,
        actionConfig: data.actionConfig as any,
        folderId: folderId ?? null,

        createdBy: currentUser.id,
        companyId: currentUser.companyId,
      },
    });

    // DISABLED Retroactive calculation by default as per user request (2025-01-24)
    // New automations should only apply to future events.
    /*
    try {
      if (rule.actionType === "CALCULATE_DURATION") {
        await applyRetroactiveAutomation(rule);
      }
    } catch (retroError) {
      console.error("Error applying retroactive automation:", retroError);
    }
    */

    revalidatePath("/automations");
    return { success: true, data: rule };
  } catch (error) {
    console.error("Error creating automation rule:", error);
    return { success: false, error: "Failed to create automation rule" };
  }
}

async function applyRetroactiveAutomation(rule: any) {
  console.log(
    `[Automations] Applying retroactive automation for rule ${rule.id}`,
  );
  const triggerConfig = rule.triggerConfig as any;

  if (rule.triggerType === "TASK_STATUS_CHANGE") {
    const toStatus = triggerConfig.toStatus;
    const fromStatus = triggerConfig.fromStatus;

    const tasks = await prisma.task.findMany({
      where: toStatus ? { status: toStatus } : {},
    });

    for (const task of tasks) {
      const logs = await prisma.auditLog.findMany({
        where: { taskId: task.id, action: "UPDATE" },
        orderBy: { timestamp: "desc" },
        take: 100,
      });

      let endLog = null;
      let startLog = null;

      for (let i = 0; i < logs.length; i++) {
        const log = logs[i];
        const diff = log.diffJson as any;

        if (diff?.status?.to) {
          if ((!toStatus || diff.status.to === toStatus) && !endLog) {
            endLog = log;
            const targetFromStatus = fromStatus || diff.status.from;

            for (let j = i + 1; j < logs.length; j++) {
              const prevLog = logs[j];
              const prevDiff = prevLog.diffJson as any;
              if (prevDiff?.status?.to === targetFromStatus) {
                startLog = prevLog;
                break;
              }
            }
            if (startLog) break;
          }
        }
      }

      if (endLog && startLog) {
        const startTime = new Date((startLog as any).timestamp).getTime();
        const endTime = new Date((endLog as any).timestamp).getTime();
        const diffMs = endTime - startTime;

        const diffMinutes = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMinutes / 60);
        const diffDays = Math.floor(diffHours / 24);
        const remainingHours = diffHours % 24;
        const remainingMinutes = diffMinutes % 60;
        const remainingSeconds = Math.floor((diffMs % (1000 * 60)) / 1000);

        let fromVal = (startLog.diffJson as any)?.status?.to || "Unknown";
        let toVal = (endLog.diffJson as any)?.status?.to || "Unknown";

        const durationString = `${diffDays}d ${remainingHours}h ${remainingMinutes}m ${remainingSeconds}s|${fromVal}->${toVal}`;

        await prisma.task.update({
          where: { id: task.id },
          data: { duration_status_change: durationString },
        });
      }
    }
  } else if (rule.triggerType === "RECORD_FIELD_CHANGE") {
    const tableId = triggerConfig.tableId
      ? Number(triggerConfig.tableId)
      : null;
    const columnId = triggerConfig.columnId;
    const toValue = triggerConfig.toValue;
    const fromValue = triggerConfig.fromValue;

    if (!tableId || !columnId) return;

    const records = await prisma.record.findMany({
      where: { tableId },
    });

    for (const record of records) {
      const logs = await prisma.auditLog.findMany({
        where: { recordId: record.id, action: { in: ["UPDATE", "CREATE"] } },
        orderBy: { timestamp: "desc" },
        take: 100,
      });

      let endLog = null;
      let startLog = null;
      let foundToVal = "";
      let foundFromVal = "";

      for (let i = 0; i < logs.length; i++) {
        const log = logs[i];
        const diff = log.diffJson as any;
        const val = diff ? diff[columnId] : undefined;

        if (val !== undefined) {
          if (!endLog) {
            if (!toValue || String(val) === String(toValue)) {
              endLog = log;
              foundToVal = String(val);
              continue;
            }
          } else {
            if (!fromValue || String(val) === String(fromValue)) {
              startLog = log;
              foundFromVal = String(val);
              break;
            }
          }
        }
      }

      if (endLog && !startLog) {
        const createLog = logs.find((l: any) => l.action === "CREATE");
        if (createLog) {
          const createData = createLog.diffJson as any;
          if (createData && createData[columnId] !== undefined) {
            const val = createData[columnId];
            if (!fromValue || String(val) === String(fromValue)) {
              startLog = createLog;
              foundFromVal = String(val);
            }
          }
        }
      }

      if (endLog && startLog) {
        const startTime = new Date(startLog.timestamp).getTime();
        const endTime = new Date(endLog.timestamp).getTime();
        const diffMs = endTime - startTime;

        const durationSeconds = Math.floor(diffMs / 1000);

        const diffMinutes = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMinutes / 60);
        const diffDays = Math.floor(diffHours / 24);
        const remainingHours = diffHours % 24;
        const remainingMinutes = diffMinutes % 60;
        const remainingSeconds = Math.floor((diffMs % (1000 * 60)) / 1000);

        const durationString = `${diffDays}d ${remainingHours}h ${remainingMinutes}m ${remainingSeconds}s|${foundFromVal}->${foundToVal}`;

        await prisma.statusDuration.create({
          data: {
            automationRuleId: rule.id,
            recordId: record.id,
            durationSeconds: durationSeconds,
            durationString: durationString,
            fromValue: String(foundFromVal),
            toValue: String(foundToVal),
          },
        });
      }
    }
  }
}

export async function updateAutomationRule(
  id: number,
  data: {
    name: string;
    triggerType: string;
    triggerConfig: any;
    actionType: string;
    actionConfig: any;
  },
) {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return { success: false, error: "Authentication required" };
    }

    // Validate TIME_SINCE_CREATION with minutes unit
    if (data.triggerType === "TIME_SINCE_CREATION") {
      const { timeValue, timeUnit } = data.triggerConfig || {};
      if (timeUnit === "minutes" && Number(timeValue) < 5) {
        return {
          success: false,
          error: "בעת בחירת דקות, הזמן המינימלי הוא 5 דקות לפחות",
        };
      }
    }

    const rule = await prisma.automationRule.update({
      where: { id, companyId: currentUser.companyId },
      data: {
        name: data.name,
        triggerType: data.triggerType,
        triggerConfig: data.triggerConfig as any,
        actionType: data.actionType,
        actionConfig: data.actionConfig as any,
      },
    });
    revalidatePath("/automations");
    return { success: true, data: rule };
  } catch (error) {
    console.error("Error updating automation rule:", error);
    return { success: false, error: "Failed to update automation rule" };
  }
}

export async function deleteAutomationRule(id: number) {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return { success: false, error: "Authentication required" };
    }

    await prisma.automationRule.delete({
      where: { id, companyId: currentUser.companyId },
    });
    revalidatePath("/automations");
    return { success: true };
  } catch (error) {
    console.error("Error deleting automation rule:", error);
    return { success: false, error: "Failed to delete automation rule" };
  }
}

export async function toggleAutomationRule(id: number, isActive: boolean) {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return { success: false, error: "Authentication required" };
    }

    await prisma.automationRule.update({
      where: { id, companyId: currentUser.companyId },
      data: { isActive },
    });
    revalidatePath("/automations");
    return { success: true };
  } catch (error) {
    console.error("Error toggling automation rule:", error);
    return { success: false, error: "Failed to toggle automation rule" };
  }
}

// --- Processor Logic ---

// Helper to check Business Hours
function checkBusinessHours(config: any): boolean {
  if (!config.businessHours) return true; // No restriction

  const { days, start, end } = config.businessHours;
  const now = new Date();

  // FIX: Shift to Israel Time (UTC+2 or UTC+3).
  // For simplicity, we will just use the server time if hosted in Israel region,
  // OR we can manually adjust if we know server is UTC.
  // Assuming Vercel is UTC. Israel is GMT+2 (Winter) or GMT+3 (Summer).
  // Let's assume GMT+3 for now to be safe or use proper library if available.
  // Actually, let's stick to local server time for now but Log it clearly.
  // Ideally, we store "timezone" in config, but for this specific user request,
  // we will just check the day.

  const currentDay = now.getDay(); // 0-6
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  // 1. Day Check
  if (Array.isArray(days) && days.length > 0) {
    if (!days.includes(currentDay)) {
      console.log(
        `[Automations] ⏳ Skipping Rule (Business Hours - Day ${currentDay} not in ${days})`,
      );
      return false;
    }
  }

  // 2. Time Check
  const [startH, startM] = (start || "00:00").split(":").map(Number);
  const [endH, endM] = (end || "23:59").split(":").map(Number);

  const currentTimeInMinutes = currentHour * 60 + currentMinute;
  const startTimeInMinutes = startH * 60 + startM;
  const endTimeInMinutes = endH * 60 + endM;

  if (
    currentTimeInMinutes < startTimeInMinutes ||
    currentTimeInMinutes > endTimeInMinutes
  ) {
    console.log(
      `[Automations] ⏳ Skipping Rule (Business Hours - Time ${currentHour}:${currentMinute} not in ${start}-${end})`,
    );
    return false;
  }

  return true;
}

export async function processViewAutomations(
  tableId?: number,
  taskId?: string,
  companyId?: number, // Added companyId parameter
) {
  console.log(
    `\n🔍🔍🔍 [Automations] CHECKING VIEW AUTOMATIONS - Table=${tableId}, Task=${taskId}, Company=${companyId}\n`,
  );
  try {
    const rules = await prisma.automationRule.findMany({
      where: {
        isActive: true, // Only active rules
        triggerType: "VIEW_METRIC_THRESHOLD",
        companyId: companyId, // Filter by company if provided
      },
    });

    console.log(
      `[Automations DEBUG] Found ${rules.length} active view automation rules.`,
    );

    for (const rule of rules) {
      const triggerConfig = rule.triggerConfig as TriggerConfig;

      // --- Business Hours Check ---
      if (!checkBusinessHours(triggerConfig)) continue;

      // Basic Validation
      if (!triggerConfig || !triggerConfig.viewId) {
        console.log(
          `[Automations DEBUG] Rule ${rule.id} missing viewId in config.`,
        );
        continue;
      }

      console.log(
        `[Automations DEBUG] Processing Rule ${rule.id} for View ${triggerConfig.viewId}`,
      );

      const view = await prisma.analyticsView.findUnique({
        where: { id: Number(triggerConfig.viewId) },
      });

      if (!view) {
        console.log(
          `[Automations DEBUG] View ${triggerConfig.viewId} not found.`,
        );
        continue;
      }

      const viewConfig = view.config as any;
      let shouldCheck = false;

      // Smart Matching Logic
      // If no specific context provided, check all views
      if (!tableId && !taskId) {
        shouldCheck = true;
      } else {
        // If taskId provided, only check Task-based views
        if (taskId && viewConfig.model === "Task") shouldCheck = true;
        // If tableId provided, only check views for that table
        if (
          tableId &&
          viewConfig.tableId &&
          String(viewConfig.tableId) === String(tableId)
        ) {
          shouldCheck = true;
        }
      }

      // Fallback: If we can't definitively determine, maybe checking anyway is safer?
      if (!shouldCheck) {
        console.log(
          `[Automations DEBUG] Skipping Rule ${rule.id} because context doesn't match view config.`,
          {
            requestedTable: tableId,
            requestedTask: taskId,
            viewTable: viewConfig.tableId,
            viewModel: viewConfig.model,
          },
        );
        continue;
      }

      console.log(
        `[Automations DEBUG] ✅ Context Matched. Calculating stats for ${view.title}`,
      );

      const { stats } = await calculateViewStats(view);

      if (!stats || stats.rawMetric === undefined) {
        console.log(
          `[Automations DEBUG] No valid metric data (rawMetric) for view ${view.id}`,
          stats,
        );
        continue;
      }

      const currentVal = stats.rawMetric;
      // Ensure threshold is number
      const threshold = parseFloat(String(triggerConfig.threshold));

      let triggered = false;

      if (triggerConfig.operator === "lt") {
        triggered = currentVal < threshold;
      } else if (triggerConfig.operator === "gt") {
        triggered = currentVal > threshold;
      }

      console.log(
        `[Automations DEBUG] Metric Check: ${currentVal} ${triggerConfig.operator} ${threshold} = ${triggered}`,
      );

      if (triggered) {
        // --- Frequency Check ---
        const frequency = triggerConfig.frequency || "always";
        const lastRunAt = triggerConfig.lastRunAt
          ? new Date(triggerConfig.lastRunAt)
          : null;

        let shouldRunFrequency = true;
        const now = new Date();

        if (frequency === "once" && lastRunAt) {
          shouldRunFrequency = false;
          console.log(
            `[Automations] ⏳ Skipping Rule ${rule.id} (Frequency: ONCE, already ran at ${lastRunAt})`,
          );
        } else if (frequency === "daily" && lastRunAt) {
          const diffHours =
            (now.getTime() - lastRunAt.getTime()) / (1000 * 60 * 60);
          if (diffHours < 24) {
            shouldRunFrequency = false;
            console.log(
              `[Automations] ⏳ Skipping Rule ${
                rule.id
              } (Frequency: DAILY, ran ${diffHours.toFixed(1)}h ago)`,
            );
          }
        } else if (frequency === "weekly" && lastRunAt) {
          const diffDays =
            (now.getTime() - lastRunAt.getTime()) / (1000 * 60 * 60 * 24);
          if (diffDays < 7) {
            shouldRunFrequency = false;
            console.log(
              `[Automations] ⏳ Skipping Rule ${
                rule.id
              } (Frequency: WEEKLY, ran ${diffDays.toFixed(1)}d ago)`,
            );
          }
        }

        if (!shouldRunFrequency) {
          continue; // Skip execution
        }

        console.log(
          `[Automations] 🔔 Rule ${rule.id} TRIGGERED! Executing Action...`,
        );

        let actionSuccess = false;

        if (rule.actionType === "SEND_NOTIFICATION") {
          const actionConfig = rule.actionConfig as ActionConfig;
          console.log(
            `[Automations] Sending notification to ${actionConfig.recipientId}`,
          );

          if (actionConfig.recipientId) {
            try {
              const result = await sendNotification({
                userId: actionConfig.recipientId,
                title: actionConfig.titleTemplate || "התראת תצוגה",
                message: (actionConfig.messageTemplate || "התנאי התקיים")
                  .replace("{value}", String(currentVal))
                  .replace("{threshold}", String(threshold)),
                link: "/analytics",
              });
              console.log(`[Automations] Notification send result:`, result);
              actionSuccess = true;
            } catch (err) {
              console.error(`[Automations] Failed to send notification:`, err);
            }
          } else {
            console.warn(
              "[Automations] No recipientId configured for notification",
            );
          }
        } else if (rule.actionType === "CREATE_TASK") {
          const actionConfig = rule.actionConfig as ActionConfig;
          try {
            const taskData: any = {
              title: actionConfig.title || "משימה אוטומטית",
              description: actionConfig.description,
              status: actionConfig.status || "todo",
            };

            if (actionConfig.priority)
              taskData.priority = actionConfig.priority;
            if (actionConfig.dueDate)
              taskData.dueDate = new Date(actionConfig.dueDate);
            if (actionConfig.assigneeId)
              taskData.assignee = String(actionConfig.assigneeId);

            await prisma.task.create({
              data: taskData,
            });
            console.log(`[Automations] Task created for rule ${rule.id}`);
            actionSuccess = true;
          } catch (err) {
            console.error(`[Automations] Failed to create task:`, err);
          }
        }

        // Update lastRunAt if successful
        if (actionSuccess) {
          try {
            await prisma.automationRule.update({
              where: { id: rule.id },
              data: {
                triggerConfig: {
                  ...triggerConfig,
                  lastRunAt: new Date().toISOString(),
                },
              },
            });
            console.log(
              `[Automations] ✅ Updated lastRunAt for rule ${rule.id}`,
            );
          } catch (updateErr) {
            console.error(
              `[Automations] Failed to update lastRunAt for rule ${rule.id}:`,
              updateErr,
            );
          }
        }
      } else {
        console.log(`[Automations DEBUG] Rule condition not met.`);
      }
    }
  } catch (e) {
    console.error("Error processing view automations:", e);
  }
}

export async function processTaskStatusChange(
  taskId: string,
  taskTitle: string,
  fromStatus: string,
  toStatus: string,
) {
  try {
    // Fetch task to get companyId
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { companyId: true },
    });

    if (!task) {
      console.log(
        `[Automations] Task ${taskId} not found for status change processing.`,
      );
      return;
    }

    const rules = await prisma.automationRule.findMany({
      where: {
        isActive: true,
        triggerType: "TASK_STATUS_CHANGE",
        companyId: task.companyId, // Filter by company
      },
    });

    for (const rule of rules) {
      const triggerConfig = rule.triggerConfig as TriggerConfig;

      // --- Business Hours Check ---
      if (!checkBusinessHours(triggerConfig)) continue;

      if (triggerConfig.fromStatus && triggerConfig.fromStatus !== fromStatus)
        continue;
      if (triggerConfig.toStatus && triggerConfig.toStatus !== toStatus)
        continue;

      const context = {
        taskId,
        taskTitle,
        fromStatus,
        toStatus,
        companyId: task.companyId,
      };
      await executeRuleActions(rule, context);
    }

    // Check view automations with company context
    await processViewAutomations(undefined, taskId, task.companyId);
  } catch (error) {
    console.error("Error processing task status automations:", error);
  }
}

export async function processNewRecordTrigger(
  tableId: number,
  tableName: string,
  recordId: number,
) {
  try {
    // Fetch record first to get companyId
    const record = await prisma.record.findUnique({
      where: { id: recordId },
    });

    if (!record) {
      console.log(
        `[Automations] Record ${recordId} not found, skipping NEW_RECORD automations.`,
      );
      return;
    }

    const rules = await prisma.automationRule.findMany({
      where: {
        isActive: true,
        triggerType: "NEW_RECORD",
        companyId: record.companyId, // Filter by company
      },
    });

    if (!record) {
      console.log(
        `[Automations] Record ${recordId} not found, skipping NEW_RECORD automations.`,
      );
      return;
    }
    const recordData = record.data as any;

    for (const rule of rules) {
      const triggerConfig = rule.triggerConfig as TriggerConfig;

      // --- Business Hours Check ---
      if (!checkBusinessHours(triggerConfig)) continue;

      if (
        triggerConfig.tableId &&
        parseInt(String(triggerConfig.tableId)) !== tableId
      )
        continue;

      // --- NEW Condition Check (Optional) ---
      if (triggerConfig.conditionColumnId) {
        const colId = triggerConfig.conditionColumnId;
        const recordVal = recordData[colId];
        const targetVal = triggerConfig.conditionValue;

        // If condition requires a value but record has none
        if (recordVal === undefined || recordVal === null) continue;

        if (triggerConfig.operator) {
          // Numeric Comparison
          const valNum = Number(recordVal);
          const targetNum = Number(targetVal);

          if (isNaN(valNum) || isNaN(targetNum)) continue;

          let match = false;
          switch (triggerConfig.operator) {
            case "gt":
              match = valNum > targetNum;
              break;
            case "lt":
              match = valNum < targetNum;
              break;
            case "gte":
              match = valNum >= targetNum;
              break;
            case "lte":
              match = valNum <= targetNum;
              break;
            case "eq":
              match = valNum === targetNum;
              break;
            case "neq":
              match = valNum !== targetNum;
              break;
          }
          if (!match) continue;
        } else {
          // String Comparison (Select/Text)
          // If conditionValue is provided, it must match
          if (
            targetVal !== undefined &&
            String(recordVal) !== String(targetVal)
          ) {
            continue;
          }
        }
      }

      await executeRuleActions(rule, {
        recordData,
        tableId,
        tableName,
        recordId,
      });
    }

    // Check all view automations to ensure they trigger correctly
    await processViewAutomations(tableId, undefined, record.companyId);

    // --- REAL TEME FINANCE SYNC ---
    // Check if this table is source for any sync rule
    try {
      const syncRules = await prisma.financeSyncRule.findMany({
        where: { sourceType: "TABLE", sourceId: tableId, isActive: true },
      });

      if (syncRules.length > 0) {
        console.log(
          `[Automations] Found ${syncRules.length} sync rules for Table ${tableId}. Triggering sync...`,
        );
        const { runSyncRule } = await import("./finance-sync");
        for (const rule of syncRules) {
          // Run sync asynchronously to not block the user response
          // We use processTableRecord logic there which handles "exists" checks efficiently
          runSyncRule(rule.id).catch((e) =>
            console.error(`[Auto-Sync] Failed to run rule ${rule.id}`, e),
          );
        }
      }
    } catch (err) {
      console.error("[Automations] Error checking finance sync rules:", err);
    }
  } catch (error) {
    console.error("Error processing new record automations:", error);
  }
}

export async function processRecordUpdate(
  tableId: number,
  recordId: number,
  oldData: any,
  newData: any,
) {
  console.log(
    `[Automations] Processing update for Table ${tableId}, Record ${recordId}`,
  );
  try {
    // Need companyId to key safely
    const record = await prisma.record.findUnique({
      where: { id: recordId },
      select: { companyId: true },
    });

    if (!record) return;

    const rules = await prisma.automationRule.findMany({
      where: {
        isActive: true,
        triggerType: "RECORD_FIELD_CHANGE",
        companyId: record.companyId, // Filter by company
      },
    });

    const table = await prisma.tableMeta.findUnique({
      where: { id: tableId },
      select: { name: true },
    });
    const tableName = table?.name || "Unknown Table";

    for (const rule of rules) {
      const triggerConfig = rule.triggerConfig as TriggerConfig;

      // --- Business Hours Check ---
      if (!checkBusinessHours(triggerConfig)) continue;

      if (triggerConfig.tableId && Number(triggerConfig.tableId) !== tableId)
        continue;

      const columnId = triggerConfig.columnId;
      if (!columnId) continue;

      const oldValue = oldData[columnId];
      const newValue = newData[columnId];

      if (newValue === undefined || oldValue === newValue) continue;

      // Numeric/Score Operator Check
      if (triggerConfig.operator && triggerConfig.toValue !== undefined) {
        const val = Number(newValue);
        const target = Number(triggerConfig.toValue);

        // If not a valid number, skip or treat as false?
        // Let's assume strict number requirement for these operators
        if (isNaN(val) || isNaN(target)) continue;

        let match = false;
        switch (triggerConfig.operator) {
          case "gt":
            match = val > target;
            break;
          case "lt":
            match = val < target;
            break;
          case "gte":
            match = val >= target;
            break;
          case "lte":
            match = val <= target;
            break;
          case "eq":
            match = val === target;
            break; // Note: strict number equality
          case "neq":
            match = val !== target;
            break;
        }
        if (!match) continue;
      } else {
        // Default String Equality Check
        if (
          triggerConfig.fromValue &&
          String(oldValue) !== String(triggerConfig.fromValue)
        )
          continue;
        if (
          triggerConfig.toValue &&
          String(newValue) !== String(triggerConfig.toValue)
        )
          continue;
      }

      await executeRuleActions(rule, {
        recordData: newData,
        oldRecordData: oldData,
        tableId,
        tableName,
        recordId,
      });
    }

    // Run multi-event automations in background (fire-and-forget) to not block the UI
    // This is important because multi-event automations may have delays/sleeps
    processMultiEventDurationTrigger(tableId, recordId, oldData, newData).catch(
      (err) =>
        console.error("[Automations] Multi-Event background error:", err),
    );

    // Check all view automations to ensure they trigger correctly
    console.log(
      `[Automations] 🎯 About to check VIEW AUTOMATIONS after record update`,
    );
    await processViewAutomations(tableId, undefined, record.companyId);
    console.log(`[Automations] ✅ Finished checking VIEW AUTOMATIONS`);

    // --- REAL TEME FINANCE SYNC (ON UPDATE) ---
    try {
      const syncRules = await prisma.financeSyncRule.findMany({
        where: { sourceType: "TABLE", sourceId: tableId, isActive: true },
      });

      if (syncRules.length > 0) {
        console.log(
          `[Automations] Record update in Table ${tableId}. Triggering ${syncRules.length} sync rules...`,
        );
        const { runSyncRule } = await import("./finance-sync");
        for (const rule of syncRules) {
          runSyncRule(rule.id).catch((e) =>
            console.error(`[Auto-Sync] Failed to run rule ${rule.id}`, e),
          );
        }
      }
    } catch (err) {
      console.error("[Automations] Error triggering sync on update:", err);
    }
  } catch (error) {
    console.error("Error processing record update automations:", error);
  }
}

export async function getViewAutomations(viewId: number) {
  try {
    const rules = await prisma.automationRule.findMany({
      where: {
        triggerType: "VIEW_METRIC_THRESHOLD",
      },
      orderBy: { createdAt: "desc" },
    });

    const filtered = rules.filter((r) => {
      const config = r.triggerConfig as TriggerConfig;
      return config && Number(config.viewId) === Number(viewId);
    });

    return { success: true, data: filtered };
  } catch (error) {
    console.error("Error fetching view automations:", error);
    return { success: false, error: "Failed to fetch view automations" };
  }
}

// Helper to add subscriber to nurture list
async function addToNurtureList(params: {
  companyId: number;
  listSlug: string;
  name: string;
  email?: string;
  phone?: string;
  sourceType: string;
  sourceId: string;
  sourceTableId?: number;
}) {
  const {
    companyId,
    listSlug,
    name,
    email,
    phone,
    sourceType,
    sourceId,
    sourceTableId,
  } = params;

  if (!email && !phone) return false;

  try {
    // 1. Find or create the list
    let list = await prisma.nurtureList.findUnique({
      where: {
        companyId_slug: {
          companyId,
          slug: listSlug,
        },
      },
    });

    if (!list) {
      list = await prisma.nurtureList.create({
        data: {
          companyId,
          slug: listSlug,
          name:
            listSlug.charAt(0).toUpperCase() +
            listSlug.slice(1).replace("-", " "),
        },
      });
    }

    // 2. Check if subscriber exists (by email or phone)
    const conditions: any[] = [];
    if (email) conditions.push({ email });
    if (phone) conditions.push({ phone });

    const existing = await prisma.nurtureSubscriber.findFirst({
      where: {
        nurtureListId: list.id,
        OR: conditions,
      },
    });

    if (!existing) {
      await prisma.nurtureSubscriber.create({
        data: {
          nurtureListId: list.id,
          name,
          email,
          phone,
          sourceType,
          sourceId,
          sourceTableId,
        },
      });
      return true;
    }

    return false;
  } catch (error) {
    console.error("Error adding to nurture list:", error);
    return false;
  }
}

export async function processTimeBasedAutomations() {
  console.log("⏰ Checking time-based automations...");
  try {
    const rules = await prisma.automationRule.findMany({
      where: {
        isActive: true,
        triggerType: "TIME_SINCE_CREATION",
      },
    });

    console.log(`Found ${rules.length} active time-based rules.`);

    for (const rule of rules) {
      const config = rule.triggerConfig as any;
      if (!config.tableId || !config.timeValue || !config.timeUnit) continue;

      // --- Business Hours Check ---
      if (!checkBusinessHours(config)) continue;

      const timeValue = Number(config.timeValue);
      const timeUnit = config.timeUnit;

      const now = new Date();
      let cutoffTime = new Date();

      if (timeUnit === "minutes") {
        cutoffTime.setMinutes(now.getMinutes() - timeValue);
      } else if (timeUnit === "hours") {
        cutoffTime.setHours(now.getHours() - timeValue);
      } else if (timeUnit === "days") {
        cutoffTime.setDate(now.getDate() - timeValue);
      }

      // Find records created before cutoffTime AND not yet processed by this rule
      // We check the AutomationLog table
      // CRITICAL FIX: Only process records created AFTER the automation rule was created (unless applyToPast is implemented)
      // to avoid spamming notifications for old records.
      const records = await prisma.record.findMany({
        where: {
          tableId: Number(config.tableId),
          companyId: rule.companyId, // CRITICAL: Ensure we only process records for the same company
          createdAt: {
            lte: cutoffTime,
            gte: rule.createdAt, // Only records created AFTER this rule
          },
          automationLogs: {
            none: {
              automationRuleId: rule.id,
            },
          },
        },
      });

      console.log(
        `Rule ${rule.name}: Found ${records.length} potential records.`,
      );

      for (const record of records) {
        // Check extra conditions
        let conditionMet = true;
        if (config.conditionColumnId && config.conditionValue) {
          const recordData = record.data as any;
          const val = recordData[config.conditionColumnId];
          // Simple string comparison for now
          // If conditionValue is user input string, we compare as string
          if (String(val) !== String(config.conditionValue)) {
            conditionMet = false;
          }
        }

        if (conditionMet) {
          console.log(`Rule ${rule.name}: Triggering for record ${record.id}`);

          await executeRuleActions(rule, {
            recordData: record.data,
            tableId: Number(config.tableId),
            recordId: record.id,
          });

          // Log execution to prevent re-running
          await prisma.automationLog.create({
            data: {
              automationRuleId: rule.id,
              recordId: record.id,
            },
          });
        }
      }
    }
  } catch (error) {
    console.error("Error processing time-based automations:", error);
  }
}

/**
 * Process automations triggered by direct dial action on a record.
 * This is called when a user clicks the direct dial button on a record.
 */
export async function processDirectDialTrigger(
  tableId: number,
  recordId: number,
  companyId: number,
) {
  console.log(
    `[Automations] Processing direct dial trigger for Table ${tableId}, Record ${recordId}`,
  );

  try {
    // Find all active DIRECT_DIAL automation rules for this table
    const rules = await prisma.automationRule.findMany({
      where: {
        companyId,
        triggerType: "DIRECT_DIAL",
        isActive: true,
      },
    });

    // Filter rules that are configured for this specific table
    const matchingRules = rules.filter((rule) => {
      const config = rule.triggerConfig as any;
      if (!config?.tableId) return false;
      return Number(config.tableId) === tableId;
    });

    if (matchingRules.length === 0) {
      console.log(
        `[Automations] No DIRECT_DIAL rules found for table ${tableId}`,
      );
      return;
    }

    // Get the record data
    const record = await prisma.record.findFirst({
      where: { id: recordId, companyId },
    });

    if (!record) {
      console.log(`[Automations] Record ${recordId} not found`);
      return;
    }

    // Get table name for notifications
    const table = await prisma.tableMeta.findUnique({
      where: { id: tableId },
      select: { name: true },
    });

    const recordData = record.data as Record<string, unknown>;

    // Execute each matching rule
    for (const rule of matchingRules) {
      console.log(
        `[Automations] Executing DIRECT_DIAL rule: ${rule.name} (ID: ${rule.id})`,
      );

      await executeRuleActions(rule, {
        recordData,
        tableId,
        recordId,
        tableName: table?.name,
      });
    }
  } catch (error) {
    console.error("Error processing direct dial automations:", error);
  }
}

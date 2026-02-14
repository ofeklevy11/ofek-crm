"use server";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { createNotificationForCompany } from "./notifications";
import { inngest } from "@/lib/inngest/client";
import { calculateViewStats } from "@/lib/analytics/calculate";
import { invalidateFullCache } from "@/lib/services/analytics-cache";

// --- Types ---
interface TriggerConfig {
  fromStatus?: string;
  toStatus?: string;
  tableId?: string | number; // Support both for safety
  columnId?: string;
  toValue?: any;
  fromValue?: any;
  viewId?: number | string;
  operator?: "lt" | "lte" | "gt" | "gte" | "eq" | "neq";
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
    previousDialedAt?: string | null;
    recordCreatedAt?: string;
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
        // Prepare data for WA
        const waData = { ...context.recordData };
        if (context.taskTitle) {
          waData.taskTitle = context.taskTitle;
          waData.fromStatus = context.fromStatus;
          waData.toStatus = context.toStatus;
        }

        // Resolve phone number
        const phoneColumnId = config.phoneColumnId;
        let phone = "";
        if (phoneColumnId?.startsWith("manual:")) {
          phone = phoneColumnId.replace("manual:", "");
        } else if (phoneColumnId) {
          phone = waData[phoneColumnId] || "";
        }

        // Resolve content with dynamic placeholders
        let waContent = config.content || "";
        for (const key in waData) {
          waContent = waContent.split(`{${key}}`).join(String(waData[key] || ""));
        }

        if (!phone) {
          console.error(`[Automations] WhatsApp: No phone resolved from ${phoneColumnId}`);
        } else {
          // Dispatch to dedicated Inngest job with retry + rate limiting
          try {
            await inngest.send({
              id: `wa-${companyId}-${phone}-${ruleId}-${Math.floor(Date.now() / 5000)}`,
              name: "automation/send-whatsapp",
              data: {
                companyId,
                phone: String(phone),
                content: waContent,
                messageType: config.messageType,
                mediaFileId: config.mediaFileId,
                delay: config.delay,
              },
            });
            console.log(`[Automations] WhatsApp job enqueued for ${phone}`);
          } catch (err) {
            console.error(`[Automations] Failed to enqueue WhatsApp job for rule ${ruleId}:`, err);
          }
        }
      } else if (type === "WEBHOOK") {
        const webhookData = {
          ...context.recordData,
          tableId: context.tableId,
          recordId: context.recordId,
          tableName: context.tableName,
        };
        const webhookUrl = config.webhookUrl || config.url;

        if (!webhookUrl) {
          console.error(`[Automations] Webhook missing URL for Rule ${ruleId}`);
        } else {
          // Dispatch to dedicated Inngest job with retry + rate limiting
          try {
            const urlHost = (() => { try { return new URL(webhookUrl).hostname; } catch { return "invalid"; } })();
            await inngest.send({
              id: `webhook-${companyId}-${ruleId}-${urlHost}-${context.recordId || context.taskId || Date.now()}`,
              name: "automation/send-webhook",
              data: {
                url: webhookUrl,
                companyId,
                ruleId,
                payload: {
                  ruleId: rule.id,
                  ruleName: rule.name,
                  triggerType: rule.triggerType,
                  companyId,
                  data: webhookData,
                },
              },
            });
            console.log(`[Automations] Webhook job enqueued for rule ${ruleId} to ${webhookUrl}`);
          } catch (err) {
            console.error(`[Automations] Failed to enqueue Webhook job for rule ${ruleId}:`, err);
          }
        }
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
          await calculateTaskDuration(context.taskId, context.fromStatus, companyId);
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
              companyId,
            );
        } else if (rule.triggerType === "DIRECT_DIAL" && context.recordId) {
          const previousDialedAt = context.previousDialedAt;
          let startTime: number;
          let fromValue: string;
          let toValue: string;

          if (previousDialedAt) {
            startTime = new Date(previousDialedAt).getTime();
            fromValue = "חיוג קודם";
            toValue = "חיוג נוכחי";
          } else if (context.recordCreatedAt) {
            startTime = new Date(context.recordCreatedAt).getTime();
            fromValue = "יצירת רשומה";
            toValue = "חיוג ראשון";
          } else {
            return;
          }

          const endTime = Date.now();
          const durationSeconds = Math.floor((endTime - startTime) / 1000);
          const days = Math.floor(durationSeconds / 86400);
          const hours = Math.floor((durationSeconds % 86400) / 3600);
          const minutes = Math.floor((durationSeconds % 3600) / 60);
          const durationString = `${days}d ${hours}h ${minutes}m`;

          await prisma.statusDuration.create({
            data: {
              automationRuleId: rule.id,
              recordId: context.recordId,
              companyId,
              durationSeconds,
              durationString,
              fromValue,
              toValue,
            },
          });
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
        // P96: Wrap in serializable transaction to prevent lost-update race condition
        if (context.recordId && config.columnId) {
          try {
            await prisma.$transaction(async (tx) => {
              const record = await tx.record.findFirst({
                where: { id: context.recordId, companyId },
              });

              if (record) {
                const currentData = record.data as Record<string, unknown>;
                const newData = {
                  ...currentData,
                  [config.columnId]: config.value,
                };

                await tx.record.update({
                  where: { id: context.recordId, companyId },
                  data: { data: JSON.parse(JSON.stringify(newData)) },
                });

                console.log(
                  `[Automations] Updated field ${config.columnId} to "${config.value}" for record ${context.recordId}`,
                );
              }
            }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
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
          // SECURITY: Validate assigneeId belongs to same company
          let validAssigneeId: number | null = null;
          if (assigneeId) {
            const assigneeOk = await prisma.user.findFirst({
              where: { id: Number(assigneeId), companyId },
              select: { id: true },
            });
            if (assigneeOk) validAssigneeId = Number(assigneeId);
          }

          await prisma.task.create({
            data: {
              title: finalTitle,
              description: finalDesc,
              status: status || "todo",
              priority: priority || "low",
              assigneeId: validAssigneeId,
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
      } else if (type === "CREATE_RECORD") {
        // Create a new record in a specified table
        const { tableId, fieldMappings } = config;

        if (!tableId) {
          console.error(`[Automations] CREATE_RECORD: No tableId specified`);
          return;
        }

        // SECURITY: Validate tableId belongs to same company
        const targetTable = await prisma.tableMeta.findFirst({
          where: { id: Number(tableId), companyId },
          select: { id: true },
        });
        if (!targetTable) {
          console.error(`[Automations] CREATE_RECORD: Table ${tableId} not found in company ${companyId}`);
          return;
        }

        // Dynamic Replacements Helper
        const replaceText = (text: string) => {
          if (!text) return text;
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
          return res;
        };

        try {
          // Build record data from field mappings
          const recordData: Record<string, unknown> = {};

          if (fieldMappings && Array.isArray(fieldMappings)) {
            for (const mapping of fieldMappings) {
              const { columnId, value } = mapping;
              if (columnId && value !== undefined) {
                recordData[columnId] = replaceText(String(value));
              }
            }
          }

          console.log(
            `[Automations] Creating record in table ${tableId} with data:`,
            recordData,
          );

          try {
            await prisma.record.create({
              data: {
                tableId: Number(tableId),
                companyId: companyId,
                data: recordData as any,
                createdBy: createdBy, // Try with original creator
              },
            });
          } catch (fkError: any) {
            // P101: Only retry without createdBy for FK constraint violations (P2003)
            if (fkError?.code === "P2003") {
              console.warn(
                `[Automations] FK violation for creator ${createdBy}, retrying without...`,
                fkError.message,
              );
              await prisma.record.create({
                data: {
                  tableId: Number(tableId),
                  companyId: companyId,
                  data: recordData as any,
                  createdBy: null, // Fallback
                },
              });
            } else {
              throw fkError; // Re-throw non-FK errors
            }
          }

          console.log(
            `[Automations] Record created successfully in table ${tableId}`,
          );
        } catch (recordError) {
          console.error(`[Automations] Record Creation Error:`, recordError);
        }
      } else if (type === "CREATE_CALENDAR_EVENT") {
        // Create a new calendar event
        const { title, description, startOffset, endOffset, color } = config;

        // Dynamic Replacements Helper
        const replaceText = (text: string) => {
          if (!text) return text;
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
          return res;
        };

        try {
          const finalTitle = replaceText(title || "אירוע אוטומטי");
          const finalDesc = replaceText(description || "");

          // Calculate start and end times based on offsets
          const now = new Date();

          let startMultiplier = 24 * 60 * 60 * 1000; // Default days
          if (config.startOffsetUnit === "minutes") startMultiplier = 60 * 1000;
          if (config.startOffsetUnit === "hours")
            startMultiplier = 60 * 60 * 1000;

          const startTime = new Date(
            now.getTime() + (Number(startOffset) || 0) * startMultiplier,
          );

          let durationMultiplier = 60 * 60 * 1000; // Default hours
          if (config.endOffsetUnit === "minutes")
            durationMultiplier = 60 * 1000;
          // if (config.endOffsetUnit === "hours") // already default

          const endTime = new Date(
            startTime.getTime() + (Number(endOffset) || 1) * durationMultiplier,
          );

          console.log(
            `[Automations] Creating calendar event: ${finalTitle} at ${startTime.toISOString()}`,
          );

          await prisma.calendarEvent.create({
            data: {
              companyId: companyId,
              title: finalTitle,
              description: finalDesc,
              startTime: startTime,
              endTime: endTime,
              color: color || "#4f95ff",
            },
          });

          console.log(`[Automations] Calendar event created successfully.`);
        } catch (eventError) {
          console.error(
            `[Automations] Calendar Event Creation Error:`,
            eventError,
          );
        }
      }
    } catch (e) {
      console.error(`[Automations] Error executing action ${type}:`, e);
      throw e; // Re-throw so callers know the action failed
    }
  };

  if (rule.actionType === "MULTI_ACTION") {
    const actions = rule.actionConfig?.actions || [];
    if (actions.length > 50) {
      console.error(`[Automations] MULTI_ACTION for rule ${ruleId} has ${actions.length} actions (max 50), skipping`);
      return;
    }
    const errors: string[] = [];
    for (const action of actions) {
      try {
        await executeSingle(action.type, action.config);
      } catch (e: any) {
        errors.push(`${action.type}: ${e.message || e}`);
        // Continue executing remaining actions even if one fails
      }
    }
    if (errors.length > 0) {
      console.error(
        `[Automations] ${errors.length} action(s) failed in MULTI_ACTION for rule ${ruleId}:`,
        errors,
      );
      throw new Error(`MULTI_ACTION: ${errors.length}/${actions.length} action(s) failed — ${errors[0]}`);
    }
  } else {
    await executeSingle(rule.actionType, rule.actionConfig);
  }
}

// Helpers for Duration (moved/extracted logic)
// P94: companyId is required to prevent cross-tenant audit log access
async function calculateTaskDuration(taskId: string, fromStatus: string, companyId: number) {
  if (!companyId) {
    console.error("[Automations] calculateTaskDuration called without companyId, skipping");
    return;
  }
  const recentLogs = await prisma.auditLog.findMany({
    where: { taskId: taskId, action: "UPDATE", companyId },
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
      where: { id: taskId, companyId },
      data: { duration_status_change: durationString },
    });
  }
}

// P95: companyId is required to prevent cross-tenant audit log access
async function calculateRecordDuration(
  ruleId: number,
  recordId: number,
  columnId: string,
  oldValue: any,
  newValue: any,
  companyId: number,
) {
  if (!companyId) {
    console.error("[Automations] calculateRecordDuration called without companyId, skipping");
    return;
  }
  const recentLogs = await prisma.auditLog.findMany({
    where: { recordId: recordId, action: { in: ["UPDATE", "CREATE"] }, companyId },
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
        companyId,
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
      take: 500,
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

    await invalidateFullCache(currentUser.companyId);
    revalidatePath("/automations");
    revalidatePath("/analytics");
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
      where: {
        ...(toStatus ? { status: toStatus } : {}),
        companyId: rule.companyId,
      },
      take: 500,
    });

    // Batch-fetch all audit logs for tasks in a single query (avoids N+1)
    const taskIds = tasks.map(t => t.id);
    const allTaskLogs = taskIds.length > 0 ? await prisma.auditLog.findMany({
      where: { taskId: { in: taskIds }, action: "UPDATE", companyId: rule.companyId },
      orderBy: { timestamp: "desc" },
      take: 5000,
    }) : [];
    const logsByTask = new Map<string, typeof allTaskLogs>();
    for (const log of allTaskLogs) {
      if (!log.taskId) continue;
      const existing = logsByTask.get(log.taskId) || [];
      existing.push(log);
      logsByTask.set(log.taskId, existing);
    }

    // P224: Collect updates, then batch in chunks of 100 (avoids N+1 sequential updates)
    const taskUpdates: { id: string; duration_status_change: string }[] = [];

    for (const task of tasks) {
      const logs = logsByTask.get(task.id) || [];

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

        taskUpdates.push({ id: task.id, duration_status_change: durationString });
      }
    }

    // Batch updates in chunks of 100
    for (let i = 0; i < taskUpdates.length; i += 100) {
      const chunk = taskUpdates.slice(i, i + 100);
      await Promise.all(
        chunk.map((u) =>
          prisma.task.update({
            where: { id: u.id, companyId: rule.companyId },
            data: { duration_status_change: u.duration_status_change },
          })
        )
      );
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
      where: { tableId, companyId: rule.companyId },
      take: 500,
    });

    // Batch-fetch all audit logs for records in a single query (avoids N+1)
    const recordIds = records.map(r => r.id);
    const allRecordLogs = recordIds.length > 0 ? await prisma.auditLog.findMany({
      where: { recordId: { in: recordIds }, action: { in: ["UPDATE", "CREATE"] }, companyId: rule.companyId },
      orderBy: { timestamp: "desc" },
      take: 5000,
    }) : [];
    const logsByRecord = new Map<number, typeof allRecordLogs>();
    for (const log of allRecordLogs) {
      if (!log.recordId) continue;
      const existing = logsByRecord.get(log.recordId) || [];
      existing.push(log);
      logsByRecord.set(log.recordId, existing);
    }

    // P225: Collect creates, then batch with createMany (avoids N+1 sequential creates)
    const durationCreates: {
      automationRuleId: number;
      recordId: number;
      durationSeconds: number;
      durationString: string;
      fromValue: string;
      toValue: string;
    }[] = [];

    for (const record of records) {
      const logs = logsByRecord.get(record.id) || [];

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

        durationCreates.push({
          companyId: rule.companyId,
          automationRuleId: rule.id,
          recordId: record.id,
          durationSeconds,
          durationString,
          fromValue: String(foundFromVal),
          toValue: String(foundToVal),
        });
      }
    }

    if (durationCreates.length > 0) {
      await prisma.statusDuration.createMany({ data: durationCreates });
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
    await invalidateFullCache(currentUser.companyId);
    revalidatePath("/automations");
    revalidatePath("/analytics");
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
    await invalidateFullCache(currentUser.companyId);
    revalidatePath("/automations");
    revalidatePath("/analytics");
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
    await invalidateFullCache(currentUser.companyId);
    revalidatePath("/automations");
    revalidatePath("/analytics");
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
  tableId: number | undefined,
  taskId: string | undefined,
  companyId: number,
) {
  // P69: Guard against undefined companyId to prevent cross-tenant queries
  if (!companyId) {
    console.error("[Automations] processViewAutomations called without companyId");
    return;
  }

  console.log(
    `\n🔍🔍🔍 [Automations] CHECKING VIEW AUTOMATIONS - Table=${tableId}, Task=${taskId}, Company=${companyId}\n`,
  );
  try {
    const rules = await prisma.automationRule.findMany({
      where: {
        isActive: true, // Only active rules
        triggerType: "VIEW_METRIC_THRESHOLD",
        companyId: companyId,
      },
      take: 200,
    });

    console.log(
      `[Automations DEBUG] Found ${rules.length} active view automation rules.`,
    );

    // P70: Batch-fetch all views upfront to avoid N+1 queries
    const viewIds = new Set<number>();
    for (const rule of rules) {
      const tc = rule.triggerConfig as TriggerConfig;
      if (tc?.viewId) viewIds.add(Number(tc.viewId));
    }
    const views = viewIds.size > 0
      ? await prisma.analyticsView.findMany({
          where: { id: { in: Array.from(viewIds) }, companyId },
        })
      : [];
    const viewMap = new Map(views.map((v) => [v.id, v]));

    // Pre-filter rules synchronously (business hours, viewId, context matching)
    const eligibleRules = rules.filter((rule) => {
      const triggerConfig = rule.triggerConfig as TriggerConfig;
      if (!checkBusinessHours(triggerConfig)) return false;
      if (!triggerConfig || !triggerConfig.viewId) {
        console.log(`[Automations DEBUG] Rule ${rule.id} missing viewId in config.`);
        return false;
      }
      const view = viewMap.get(Number(triggerConfig.viewId));
      if (!view) {
        console.log(`[Automations DEBUG] View ${triggerConfig.viewId} not found.`);
        return false;
      }
      const viewConfig = view.config as any;
      let shouldCheck = false;
      if (!tableId && !taskId) {
        shouldCheck = true;
      } else {
        if (taskId && viewConfig.model === "Task") shouldCheck = true;
        if (tableId && viewConfig.tableId && String(viewConfig.tableId) === String(tableId)) shouldCheck = true;
      }
      if (!shouldCheck) {
        console.log(`[Automations DEBUG] Skipping Rule ${rule.id} because context doesn't match view config.`, {
          requestedTable: tableId, requestedTask: taskId, viewTable: viewConfig.tableId, viewModel: viewConfig.model,
        });
        return false;
      }
      return true;
    });

    if (eligibleRules.length === 0) return;

    // Issue Q fix: Promise-based dedup cache to prevent concurrent duplicate calculateViewStats calls
    const statsPromises = new Map<number, Promise<{ stats: any } | null>>();
    function getCachedStats(viewId: number, cId: number) {
      if (!statsPromises.has(viewId)) {
        const view = viewMap.get(viewId)!;
        statsPromises.set(viewId, calculateViewStats(view, cId).then(r => r?.stats ? r : null));
      }
      return statsPromises.get(viewId)!;
    }

    // Issue L fix: Process rules in parallel with concurrency limit of 5
    // Issue R fix: Track failures and signal to Inngest if majority fail
    const RULE_CONCURRENCY = 5;
    let totalFailures = 0;
    for (let i = 0; i < eligibleRules.length; i += RULE_CONCURRENCY) {
      const batch = eligibleRules.slice(i, i + RULE_CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map(async (rule) => {
          const triggerConfig = rule.triggerConfig as TriggerConfig;
          const viewId = Number(triggerConfig.viewId);
          const view = viewMap.get(viewId)!;

          console.log(`[Automations DEBUG] Processing Rule ${rule.id} for View ${viewId}`);

          const cached = await getCachedStats(viewId, companyId ?? rule.companyId);
          if (!cached || !cached.stats || cached.stats.rawMetric === undefined) {
            console.log(`[Automations DEBUG] No valid metric data (rawMetric) for view ${viewId}`);
            return;
          }

          const { stats } = cached;
          const currentVal = stats.rawMetric;
          const currentSnapshot = JSON.stringify(stats);
          const threshold = parseFloat(String(triggerConfig.threshold));

          let triggered = false;
          switch (triggerConfig.operator) {
            case "lt": triggered = currentVal < threshold; break;
            case "lte": triggered = currentVal <= threshold; break;
            case "gt": triggered = currentVal > threshold; break;
            case "gte": triggered = currentVal >= threshold; break;
            case "eq": triggered = currentVal === threshold; break;
            case "neq": triggered = currentVal !== threshold; break;
          }

          console.log(`[Automations DEBUG] Metric Check: ${currentVal} ${triggerConfig.operator} ${threshold} = ${triggered}`);

          if (!triggered) {
            console.log(`[Automations DEBUG] Rule condition not met.`);
            return;
          }

          // --- Frequency Check ---
          const frequency = triggerConfig.frequency || "always";
          const lastRunAt = triggerConfig.lastRunAt ? new Date(triggerConfig.lastRunAt) : null;
          let shouldRunFrequency = true;
          const now = new Date();

          if (frequency === "once" && lastRunAt) {
            shouldRunFrequency = false;
            console.log(`[Automations] ⏳ Skipping Rule ${rule.id} (Frequency: ONCE, already ran at ${lastRunAt})`);
          } else if (frequency === "daily" && lastRunAt) {
            const diffHours = (now.getTime() - lastRunAt.getTime()) / (1000 * 60 * 60);
            if (diffHours < 24) {
              shouldRunFrequency = false;
              console.log(`[Automations] ⏳ Skipping Rule ${rule.id} (Frequency: DAILY, ran ${diffHours.toFixed(1)}h ago)`);
            }
          } else if (frequency === "weekly" && lastRunAt) {
            const diffDays = (now.getTime() - lastRunAt.getTime()) / (1000 * 60 * 60 * 24);
            if (diffDays < 7) {
              shouldRunFrequency = false;
              console.log(`[Automations] ⏳ Skipping Rule ${rule.id} (Frequency: WEEKLY, ran ${diffDays.toFixed(1)}d ago)`);
            }
          } else if (frequency === "always" && triggerConfig.lastDataSnapshot === currentSnapshot) {
            shouldRunFrequency = false;
            console.log(`[Automations] ⏳ Skipping Rule ${rule.id} (Frequency: ALWAYS, data unchanged since last check)`);
          }

          if (!shouldRunFrequency) return;

          console.log(`[Automations] 🔔 Rule ${rule.id} TRIGGERED! Executing Action: ${rule.actionType}`);
          console.log(`[Automations] Action Config:`, JSON.stringify(rule.actionConfig).substring(0, 500));

          let actionSuccess = false;
          try {
            await executeRuleActions(rule, {
              recordData: {
                value: String(currentVal),
                threshold: String(threshold),
                viewName: view.title || "",
              },
              tableName: "Analytics",
            });
            actionSuccess = true;
          } catch (execErr) {
            console.error(`[Automations] Failed to execute actions for rule ${rule.id}:`, execErr);
          }

          // Atomic conditional update to prevent race condition
          try {
            const nowIso = new Date().toISOString();
            const previousLastRunAt = triggerConfig.lastRunAt || null;

            if (previousLastRunAt) {
              await prisma.$executeRaw`
                UPDATE "AutomationRule"
                SET "triggerConfig" = jsonb_set(
                  jsonb_set("triggerConfig", '{lastRunAt}', ${JSON.stringify(nowIso)}::jsonb),
                  '{lastDataSnapshot}', ${JSON.stringify(currentSnapshot)}::jsonb
                )
                WHERE id = ${rule.id}
                AND "companyId" = ${rule.companyId}
                AND "triggerConfig"->>'lastRunAt' = ${previousLastRunAt}
              `;
            } else {
              await prisma.automationRule.update({
                where: { id: rule.id, companyId: rule.companyId },
                data: {
                  triggerConfig: {
                    ...triggerConfig,
                    lastRunAt: nowIso,
                    lastDataSnapshot: currentSnapshot,
                  },
                },
              });
            }
            console.log(`[Automations] ✅ Updated lastRunAt for rule ${rule.id} (actionSuccess: ${actionSuccess})`);
          } catch (updateErr) {
            console.error(`[Automations] Failed to update lastRunAt for rule ${rule.id}:`, updateErr);
          }
        }),
      );

      for (let j = 0; j < results.length; j++) {
        if (results[j].status === "rejected") {
          totalFailures++;
          console.error(`[Automations] Error processing view rule ${batch[j].id}:`, (results[j] as PromiseRejectedResult).reason);
        }
      }
    }

    // Issue R fix: Signal failure to Inngest so it can retry if majority of rules failed
    if (totalFailures > 0 && totalFailures >= eligibleRules.length * 0.5) {
      throw new Error(`[Automations] ${totalFailures}/${eligibleRules.length} view automation rules failed — triggering Inngest retry`);
    }
  } catch (e) {
    console.error("Error processing view automations:", e);
    throw e; // Re-throw so Inngest sees the failure
  }
}

export async function processTaskStatusChange(
  taskId: string,
  taskTitle: string,
  fromStatus: string,
  toStatus: string,
  companyId: number, // SECURITY: Required for tenant scoping (Issue D)
) {
  try {
    // Fetch task scoped by companyId
    const task = await prisma.task.findFirst({ where: { id: taskId, companyId }, select: { companyId: true } });

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
      take: 200,
    });

    // Issue V fix: Track failures and signal to Inngest if majority fail
    let totalFailures = 0;
    let totalProcessed = 0;
    for (const rule of rules) {
      try {
        const triggerConfig = rule.triggerConfig as TriggerConfig;

        // --- Business Hours Check ---
        if (!checkBusinessHours(triggerConfig)) continue;

        if (triggerConfig.fromStatus && triggerConfig.fromStatus !== fromStatus)
          continue;
        if (triggerConfig.toStatus && triggerConfig.toStatus !== toStatus)
          continue;

        totalProcessed++;
        const context = {
          taskId,
          taskTitle,
          fromStatus,
          toStatus,
          companyId: task.companyId,
        };
        await executeRuleActions(rule, context);
      } catch (ruleError) {
        totalFailures++;
        console.error(`[Automations] Error executing rule ${rule.id} in processTaskStatusChange:`, ruleError);
      }
    }

    if (totalProcessed > 0 && totalFailures >= totalProcessed * 0.5) {
      throw new Error(`[Automations] ${totalFailures}/${totalProcessed} task status rules failed — triggering Inngest retry`);
    }
  } catch (error) {
    console.error("Error processing task status automations:", error);
    throw error; // Re-throw so Inngest sees the failure
  }
}

export async function processNewRecordTrigger(
  tableId: number,
  tableName: string,
  recordId: number,
  companyId: number, // SECURITY: Required for tenant scoping (Issue D)
) {
  try {
    // Fetch record scoped by companyId
    const record = await prisma.record.findFirst({ where: { id: recordId, companyId } });

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
      take: 200,
    });

    const recordData = record.data as any;

    // Issue V fix: Track failures and signal to Inngest if majority fail
    let totalFailures = 0;
    let totalProcessed = 0;
    for (const rule of rules) {
      try {
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

        totalProcessed++;
        await executeRuleActions(rule, {
          recordData,
          tableId,
          tableName,
          recordId,
        });
      } catch (ruleError) {
        totalFailures++;
        console.error(`[Automations] Error executing rule ${rule.id} in processNewRecordTrigger:`, ruleError);
      }
    }

    if (totalProcessed > 0 && totalFailures >= totalProcessed * 0.5) {
      throw new Error(`[Automations] ${totalFailures}/${totalProcessed} new record rules failed — triggering Inngest retry`);
    }

    // --- REAL TEME FINANCE SYNC ---
    // Check if this table is source for any sync rule
    try {
      const syncRules = await prisma.financeSyncRule.findMany({
        where: { sourceType: "TABLE", sourceId: tableId, isActive: true, companyId: record.companyId },
        take: 200,
      });

      if (syncRules.length > 0) {
        console.log(
          `[Automations] Found ${syncRules.length} sync rules for Table ${tableId}. Enqueuing sync jobs...`,
        );
        const { inngest } = await import("@/lib/inngest/client");

        // P89: Batch-fetch existing jobs upfront to avoid N+1
        const ruleIds = syncRules.map((r) => r.id);
        const existingJobs = await prisma.financeSyncJob.findMany({
          where: { syncRuleId: { in: ruleIds }, status: { in: ["QUEUED", "RUNNING"] } },
          select: { syncRuleId: true },
        });
        const existingRuleIds = new Set(existingJobs.map((j) => j.syncRuleId));

        const newRules = syncRules.filter((r) => !existingRuleIds.has(r.id));
        if (newRules.length > 0) {
          // Create all jobs in parallel, then batch-send Inngest events
          const jobs = await Promise.all(
            newRules.map((rule) =>
              prisma.financeSyncJob.create({
                data: { companyId: rule.companyId, syncRuleId: rule.id, status: "QUEUED" },
              }).then((job) => ({ job, rule }))
            ),
          );

          try {
            await inngest.send(
              jobs.map(({ job, rule }) => ({
                id: `finance-sync-${rule.companyId}-${rule.id}-${job.id}`,
                name: "finance-sync/job.started" as const,
                data: { jobId: job.id, syncRuleId: rule.id, companyId: rule.companyId },
              })),
            );
          } catch (e) {
            console.error(`[Auto-Sync] Failed to batch-enqueue ${jobs.length} sync jobs`, e);
          }
        }
      }
    } catch (err) {
      console.error("[Automations] Error checking finance sync rules:", err);
    }
  } catch (error) {
    console.error("Error processing new record automations:", error);
    throw error; // Re-throw so Inngest sees the failure
  }
}

export async function processRecordUpdate(
  tableId: number,
  recordId: number,
  oldData: any,
  newData: any,
  companyId: number, // SECURITY: Required for tenant scoping (Issue D)
) {
  console.log(
    `[Automations] Processing update for Table ${tableId}, Record ${recordId}`,
  );
  try {
    // Fetch record scoped by companyId
    const record = await prisma.record.findFirst({ where: { id: recordId, companyId }, select: { companyId: true } });

    if (!record) return;

    const rules = await prisma.automationRule.findMany({
      where: {
        isActive: true,
        triggerType: "RECORD_FIELD_CHANGE",
        companyId: record.companyId, // Filter by company
      },
      take: 200,
    });

    const table = await prisma.tableMeta.findFirst({
      where: { id: tableId, companyId: record.companyId },
      select: { name: true },
    });
    const tableName = table?.name || "Unknown Table";

    // Issue Z1 fix: Track failures and signal to Inngest if majority fail
    let totalFailures = 0;
    let totalProcessed = 0;
    for (const rule of rules) {
      try {
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

        totalProcessed++;
        await executeRuleActions(rule, {
          recordData: newData,
          oldRecordData: oldData,
          tableId,
          tableName,
          recordId,
        });
      } catch (ruleError) {
        totalFailures++;
        console.error(`[Automations] Error executing rule ${rule.id} in processRecordUpdate:`, ruleError);
      }
    }

    if (totalProcessed > 0 && totalFailures >= totalProcessed * 0.5) {
      throw new Error(`[Automations] ${totalFailures}/${totalProcessed} record update rules failed — triggering Inngest retry`);
    }

    // Offload multi-event automations to Inngest background job
    // These involve recursive relation lookups and CPU-intensive event chain matching
    try {
      await inngest.send({
        id: `multi-event-${record.companyId}-${recordId}-${Math.floor(Date.now() / 60000)}`,
        name: "automation/multi-event-duration",
        data: { tableId, recordId, companyId: record.companyId },
      });
    } catch (err) {
      console.error("[Automations] Failed to enqueue multi-event job:", err);
    }

    // --- REAL TEME FINANCE SYNC (ON UPDATE) ---
    try {
      const syncRules = await prisma.financeSyncRule.findMany({
        where: { sourceType: "TABLE", sourceId: tableId, isActive: true, companyId: record.companyId },
        take: 200,
      });

      if (syncRules.length > 0) {
        console.log(
          `[Automations] Record update in Table ${tableId}. Enqueuing ${syncRules.length} sync jobs...`,
        );
        const { inngest } = await import("@/lib/inngest/client");

        // P89: Batch-fetch existing jobs upfront to avoid N+1
        const ruleIds = syncRules.map((r) => r.id);
        const existingJobs = await prisma.financeSyncJob.findMany({
          where: { syncRuleId: { in: ruleIds }, status: { in: ["QUEUED", "RUNNING"] } },
          select: { syncRuleId: true },
        });
        const existingRuleIds = new Set(existingJobs.map((j) => j.syncRuleId));

        const newRules = syncRules.filter((r) => !existingRuleIds.has(r.id));
        if (newRules.length > 0) {
          const jobs = await Promise.all(
            newRules.map((rule) =>
              prisma.financeSyncJob.create({
                data: { companyId: rule.companyId, syncRuleId: rule.id, status: "QUEUED" },
              }).then((job) => ({ job, rule }))
            ),
          );

          try {
            await inngest.send(
              jobs.map(({ job, rule }) => ({
                id: `finance-sync-${rule.companyId}-${rule.id}-${job.id}`,
                name: "finance-sync/job.started" as const,
                data: { jobId: job.id, syncRuleId: rule.id, companyId: rule.companyId },
              })),
            );
          } catch (e) {
            console.error(`[Auto-Sync] Failed to batch-enqueue ${jobs.length} sync jobs on update`, e);
          }
        }
      }
    } catch (err) {
      console.error("[Automations] Error triggering sync on update:", err);
    }
  } catch (error) {
    console.error("Error processing record update automations:", error);
    throw error; // Re-throw so Inngest sees the failure
  }
}

export async function getViewAutomations(viewId: number) {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };

    const rules = await prisma.automationRule.findMany({
      where: {
        triggerType: "VIEW_METRIC_THRESHOLD",
        companyId: user.companyId,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
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

/**
 * Count total automation actions across all analytics views for the current company.
 * This is used to enforce plan-based limits:
 * - Basic: 10 actions
 * - Premium: 30 actions
 * - Super: unlimited
 */
export async function getAnalyticsAutomationsActionCount() {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const currentUser = await getCurrentUser();

    if (!currentUser?.companyId) {
      console.log("[Analytics Actions] No auth or companyId found");
      return { success: false, error: "Unauthorized", count: 0 };
    }

    const companyId = currentUser.companyId;

    // Get all VIEW_METRIC_THRESHOLD rules for this company
    const rules = await prisma.automationRule.findMany({
      where: {
        companyId: companyId,
        triggerType: "VIEW_METRIC_THRESHOLD",
      },
      select: {
        actionType: true,
        actionConfig: true,
      },
      take: 500,
    });

    // Count total actions
    let totalActions = 0;
    for (const rule of rules) {
      if (rule.actionType === "MULTI_ACTION") {
        const config = rule.actionConfig as any;
        totalActions += config?.actions?.length || 0;
      } else if (rule.actionType) {
        totalActions += 1;
      }
    }

    return { success: true, count: totalActions };
  } catch (error) {
    console.error("Error counting analytics automation actions:", error);
    return { success: false, error: "Failed to count actions", count: 0 };
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
    // Issue U fix: Catch P2002 unique constraint violation to handle concurrent inserts
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
      try {
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
      } catch (createErr: any) {
        if (createErr?.code === "P2002") {
          // Duplicate created by concurrent automation — safe to ignore
          return false;
        }
        throw createErr;
      }
    }

    return false;
  } catch (error) {
    console.error("Error adding to nurture list:", error);
    return false;
  }
}

// P102: companyId is now required to prevent cross-company rule leakage
export async function processTimeBasedAutomations(companyId: number) {
  if (!companyId) {
    console.error("[Automations] processTimeBasedAutomations called without companyId, skipping");
    return;
  }
  console.log(`⏰ Checking time-based automations for company ${companyId}...`);
  try {
    const rules = await prisma.automationRule.findMany({
      where: {
        isActive: true,
        triggerType: "TIME_SINCE_CREATION",
        companyId,
      },
      take: 200,
    });

    console.log(`Found ${rules.length} active time-based rules for company ${companyId}.`);

    // Filter rules that pass basic config validation and business hours check upfront
    const validRules = rules.filter((rule) => {
      const config = rule.triggerConfig as any;
      if (!config.tableId || !config.timeValue || !config.timeUnit) return false;
      if (!checkBusinessHours(config)) return false;
      return true;
    });

    if (validRules.length === 0) return;

    // Batch-fetch all table names upfront to avoid N+1
    const tableIds = [...new Set(validRules.map((r) => Number((r.triggerConfig as any).tableId)))];
    const tables = await prisma.tableMeta.findMany({
      where: { id: { in: tableIds }, companyId },
      select: { id: true, name: true },
    });
    const tableMap = new Map(tables.map((t) => [t.id, t.name]));

    // Process rules in parallel with concurrency limit of 5
    const RULE_CONCURRENCY = 5;
    let totalFailures = 0;
    for (let i = 0; i < validRules.length; i += RULE_CONCURRENCY) {
      const batch = validRules.slice(i, i + RULE_CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map((rule) => processTimeBasedRule(rule, tableMap)),
      );

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        if (result.status === "rejected") {
          totalFailures++;
          console.error(`[Automations] Error processing time-based rule ${batch[j].id} (${batch[j].name}):`, result.reason);
        }
      }
    }

    // Signal failure to Inngest so it can retry if majority of rules failed
    if (totalFailures > 0 && totalFailures >= validRules.length * 0.5) {
      throw new Error(`[Automations] ${totalFailures}/${validRules.length} time-based rules failed — triggering Inngest retry`);
    }
  } catch (error) {
    console.error("Error processing time-based automations:", error);
    throw error; // Re-throw so Inngest sees the failure
  }
}

/** Process a single time-based rule and its matching records. */
async function processTimeBasedRule(
  rule: any,
  tableMap: Map<number, string>,
) {
  const config = rule.triggerConfig as any;
  const tableId = Number(config.tableId);
  const tableName = tableMap.get(tableId);
  const timeValue = Number(config.timeValue);
  const timeUnit = config.timeUnit;

  const now = new Date();
  const cutoffTime = new Date();

  if (timeUnit === "minutes") {
    cutoffTime.setMinutes(now.getMinutes() - timeValue);
  } else if (timeUnit === "hours") {
    cutoffTime.setHours(now.getHours() - timeValue);
  } else if (timeUnit === "days") {
    cutoffTime.setDate(now.getDate() - timeValue);
  }

  // Find records created before cutoffTime AND not yet processed by this rule
  const records = await prisma.record.findMany({
    where: {
      tableId,
      companyId: rule.companyId,
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
    take: 200,
    orderBy: { createdAt: "asc" },
  });

  console.log(
    `Rule ${rule.name}: Found ${records.length} potential records.`,
  );

  if (records.length === 0) return;

  // Filter records by condition upfront
  const matchingRecords = records.filter((record) => {
    if (config.conditionColumnId && config.conditionValue) {
      const recordData = record.data as any;
      const val = recordData[config.conditionColumnId];
      return String(val) === String(config.conditionValue);
    }
    return true;
  });

  if (matchingRecords.length === 0) return;

  // Process records in parallel with concurrency limit of 10
  const RECORD_CONCURRENCY = 10;
  const logsToCreate: { automationRuleId: number; recordId: number }[] = [];

  for (let i = 0; i < matchingRecords.length; i += RECORD_CONCURRENCY) {
    const batch = matchingRecords.slice(i, i + RECORD_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (record) => {
        console.log(`Rule ${rule.name}: Triggering for record ${record.id}`);
        await executeRuleActions(rule, {
          recordData: record.data,
          tableId,
          recordId: record.id,
          tableName,
        });
        return record.id;
      }),
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        logsToCreate.push({ automationRuleId: rule.id, recordId: result.value });
      } else {
        console.error(`[Automations] Error executing actions for rule ${rule.id}:`, result.reason);
      }
    }
  }

  // Batch create all automation logs at once
  // Issue S fix: Re-throw so Inngest retries — without logs, records would be re-executed
  if (logsToCreate.length > 0) {
    try {
      await prisma.automationLog.createMany({ data: logsToCreate });
    } catch (logError) {
      console.error(`[Automations] Error batch-creating automation logs for rule ${rule.id}:`, logError);
      throw logError;
    }
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
  previousDialedAt?: string | null,
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
      take: 200,
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

    // Get table name for notifications — scoped by companyId (Issue K)
    const table = await prisma.tableMeta.findFirst({
      where: { id: tableId, companyId },
      select: { name: true },
    });

    const recordData = record.data as Record<string, unknown>;

    // Issue Z2 fix: Track failures and signal to Inngest if majority fail
    let totalFailures = 0;
    let totalProcessed = 0;

    // Execute each matching rule
    for (const rule of matchingRules) {
      try {
        console.log(
          `[Automations] Executing DIRECT_DIAL rule: ${rule.name} (ID: ${rule.id})`,
        );

        totalProcessed++;
        await executeRuleActions(rule, {
          recordData,
          tableId,
          recordId,
          tableName: table?.name,
          previousDialedAt,
          recordCreatedAt: record.createdAt.toISOString(),
        });
      } catch (ruleError) {
        totalFailures++;
        console.error(
          `[Automations] Error executing DIRECT_DIAL rule ${rule.id} (${rule.name}):`,
          ruleError,
        );
      }
    }

    if (totalProcessed > 0 && totalFailures >= totalProcessed * 0.5) {
      throw new Error(`[Automations] ${totalFailures}/${totalProcessed} direct dial rules failed — triggering Inngest retry`);
    }
  } catch (error) {
    console.error("Error processing direct dial automations:", error);
    throw error; // Re-throw so Inngest sees the failure
  }
}

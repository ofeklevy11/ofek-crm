"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { sendNotification } from "./notifications";
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
  [key: string]: any;
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

    const rule = await prisma.automationRule.create({
      data: {
        name: data.name,
        triggerType: data.triggerType,
        triggerConfig: data.triggerConfig,
        actionType: data.actionType,
        actionConfig: data.actionConfig,
        creator: {
          connect: { id: currentUser.id },
        },
        company: {
          connect: { id: currentUser.companyId },
        },
      },
    });

    try {
      if (rule.actionType === "CALCULATE_DURATION") {
        await applyRetroactiveAutomation(rule);
      }
    } catch (retroError) {
      console.error("Error applying retroactive automation:", retroError);
    }

    revalidatePath("/automations");
    return { success: true, data: rule };
  } catch (error) {
    console.error("Error creating automation rule:", error);
    return { success: false, error: "Failed to create automation rule" };
  }
}

async function applyRetroactiveAutomation(rule: any) {
  console.log(
    `[Automations] Applying retroactive automation for rule ${rule.id}`
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
        const startTime = new Date(startLog.timestamp).getTime();
        const endTime = new Date(endLog.timestamp).getTime();
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
        const createLog = logs.find((l) => l.action === "CREATE");
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
  }
) {
  try {
    const rule = await prisma.automationRule.update({
      where: { id },
      data: {
        name: data.name,
        triggerType: data.triggerType,
        triggerConfig: data.triggerConfig,
        actionType: data.actionType,
        actionConfig: data.actionConfig,
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
    await prisma.automationRule.delete({
      where: { id },
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
    await prisma.automationRule.update({
      where: { id },
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

export async function processViewAutomations(
  tableId?: number,
  taskId?: string
) {
  console.log(
    `\n🔍🔍🔍 [Automations] CHECKING VIEW AUTOMATIONS - Table=${tableId}, Task=${taskId}\n`
  );
  try {
    const rules = await prisma.automationRule.findMany({
      where: {
        isActive: true, // Only active rules
        triggerType: "VIEW_METRIC_THRESHOLD",
      },
    });

    console.log(
      `[Automations DEBUG] Found ${rules.length} active view automation rules.`
    );

    for (const rule of rules) {
      const triggerConfig = rule.triggerConfig as TriggerConfig;

      // Basic Validation
      if (!triggerConfig || !triggerConfig.viewId) {
        console.log(
          `[Automations DEBUG] Rule ${rule.id} missing viewId in config.`
        );
        continue;
      }

      console.log(
        `[Automations DEBUG] Processing Rule ${rule.id} for View ${triggerConfig.viewId}`
      );

      const view = await prisma.analyticsView.findUnique({
        where: { id: Number(triggerConfig.viewId) },
      });

      if (!view) {
        console.log(
          `[Automations DEBUG] View ${triggerConfig.viewId} not found.`
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
          }
        );
        continue;
      }

      console.log(
        `[Automations DEBUG] ✅ Context Matched. Calculating stats for ${view.title}`
      );

      const { stats } = await calculateViewStats(view);

      if (!stats || stats.rawMetric === undefined) {
        console.log(
          `[Automations DEBUG] No valid metric data (rawMetric) for view ${view.id}`,
          stats
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
        `[Automations DEBUG] Metric Check: ${currentVal} ${triggerConfig.operator} ${threshold} = ${triggered}`
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
            `[Automations] ⏳ Skipping Rule ${rule.id} (Frequency: ONCE, already ran at ${lastRunAt})`
          );
        } else if (frequency === "daily" && lastRunAt) {
          const diffHours =
            (now.getTime() - lastRunAt.getTime()) / (1000 * 60 * 60);
          if (diffHours < 24) {
            shouldRunFrequency = false;
            console.log(
              `[Automations] ⏳ Skipping Rule ${
                rule.id
              } (Frequency: DAILY, ran ${diffHours.toFixed(1)}h ago)`
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
              } (Frequency: WEEKLY, ran ${diffDays.toFixed(1)}d ago)`
            );
          }
        }

        if (!shouldRunFrequency) {
          continue; // Skip execution
        }

        console.log(
          `[Automations] 🔔 Rule ${rule.id} TRIGGERED! Executing Action...`
        );

        let actionSuccess = false;

        if (rule.actionType === "SEND_NOTIFICATION") {
          const actionConfig = rule.actionConfig as ActionConfig;
          console.log(
            `[Automations] Sending notification to ${actionConfig.recipientId}`
          );

          if (actionConfig.recipientId) {
            try {
              const result = await sendNotification({
                userId: actionConfig.recipientId,
                title: actionConfig.titleTemplate || "View Alert",
                message: (actionConfig.messageTemplate || "Trigger Met")
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
              "[Automations] No recipientId configured for notification"
            );
          }
        } else if (rule.actionType === "CREATE_TASK") {
          const actionConfig = rule.actionConfig as ActionConfig;
          try {
            const taskData: any = {
              title: actionConfig.title || "Automated Task",
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
              `[Automations] ✅ Updated lastRunAt for rule ${rule.id}`
            );
          } catch (updateErr) {
            console.error(
              `[Automations] Failed to update lastRunAt for rule ${rule.id}:`,
              updateErr
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
  toStatus: string
) {
  try {
    const rules = await prisma.automationRule.findMany({
      where: {
        isActive: true,
        triggerType: "TASK_STATUS_CHANGE",
      },
    });

    for (const rule of rules) {
      const triggerConfig = rule.triggerConfig as TriggerConfig;
      if (triggerConfig.fromStatus && triggerConfig.fromStatus !== fromStatus)
        continue;
      if (triggerConfig.toStatus && triggerConfig.toStatus !== toStatus)
        continue;

      if (rule.actionType === "SEND_NOTIFICATION") {
        const actionConfig = rule.actionConfig as ActionConfig;
        if (actionConfig.recipientId) {
          await sendNotification({
            userId: actionConfig.recipientId,
            title: actionConfig.titleTemplate || "Task Updated",
            message: (
              actionConfig.messageTemplate ||
              "Task {taskTitle} moved to {toStatus}"
            )
              .replace("{taskTitle}", taskTitle)
              .replace("{fromStatus}", fromStatus)
              .replace("{toStatus}", toStatus),
            link: "/tasks",
          });
        }
      } else if (rule.actionType === "CALCULATE_DURATION") {
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
          const diffHours = Math.floor(diffMinutes / 60);
          const diffDays = Math.floor(diffHours / 24);
          const remainingHours = diffHours % 24;
          const remainingMinutes = diffMinutes % 60;

          const durationString = `${diffDays}d ${remainingHours}h ${remainingMinutes}m|->`;

          await prisma.task.update({
            where: { id: taskId },
            data: { duration_status_change: durationString },
          });
        }
      }
    }

    // Check all view automations to ensure they trigger correctly
    await processViewAutomations();
  } catch (error) {
    console.error("Error processing task status automations:", error);
  }
}

export async function processNewRecordTrigger(
  tableId: number,
  tableName: string,
  recordId: number
) {
  try {
    const rules = await prisma.automationRule.findMany({
      where: { isActive: true, triggerType: "NEW_RECORD" },
    });

    for (const rule of rules) {
      const triggerConfig = rule.triggerConfig as TriggerConfig;
      if (
        triggerConfig.tableId &&
        parseInt(String(triggerConfig.tableId)) !== tableId
      )
        continue;

      if (rule.actionType === "SEND_NOTIFICATION") {
        const actionConfig = rule.actionConfig as ActionConfig;
        if (actionConfig.recipientId) {
          await sendNotification({
            userId: actionConfig.recipientId,
            title: actionConfig.titleTemplate || "New Record Created",
            message: (
              actionConfig.messageTemplate || "New record in {tableName}"
            ).replace("{tableName}", tableName),
            link: `/tables/${tableId}`,
          });
        }
      }
    }

    // Check all view automations to ensure they trigger correctly
    await processViewAutomations();

    // --- REAL TEME FINANCE SYNC ---
    // Check if this table is source for any sync rule
    try {
      const syncRules = await prisma.financeSyncRule.findMany({
        where: { sourceType: "TABLE", sourceId: tableId, isActive: true },
      });

      if (syncRules.length > 0) {
        console.log(
          `[Automations] Found ${syncRules.length} sync rules for Table ${tableId}. Triggering sync...`
        );
        const { runSyncRule } = await import("./finance-sync");
        for (const rule of syncRules) {
          // Run sync asynchronously to not block the user response
          // We use processTableRecord logic there which handles "exists" checks efficiently
          runSyncRule(rule.id).catch((e) =>
            console.error(`[Auto-Sync] Failed to run rule ${rule.id}`, e)
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
  newData: any
) {
  console.log(
    `[Automations] Processing update for Table ${tableId}, Record ${recordId}`
  );
  try {
    const rules = await prisma.automationRule.findMany({
      where: { isActive: true, triggerType: "RECORD_FIELD_CHANGE" },
    });

    const table = await prisma.tableMeta.findUnique({
      where: { id: tableId },
      select: { name: true },
    });
    const tableName = table?.name || "Unknown Table";

    for (const rule of rules) {
      const triggerConfig = rule.triggerConfig as TriggerConfig;
      if (triggerConfig.tableId && Number(triggerConfig.tableId) !== tableId)
        continue;

      const columnId = triggerConfig.columnId;
      if (!columnId) continue;

      const oldValue = oldData[columnId];
      const newValue = newData[columnId];

      if (newValue === undefined || oldValue === newValue) continue;

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

      if (rule.actionType === "SEND_NOTIFICATION") {
        const actionConfig = rule.actionConfig as ActionConfig;
        if (actionConfig.recipientId) {
          await sendNotification({
            userId: actionConfig.recipientId,
            title: actionConfig.titleTemplate || "Record Updated",
            message: (
              actionConfig.messageTemplate ||
              "Field {fieldName} changed from {fromValue} to {toValue}"
            )
              .replace("{tableName}", tableName)
              .replace("{fieldName}", columnId)
              .replace("{fromValue}", String(oldValue))
              .replace("{toValue}", String(newValue)),
            link: `/tables/${tableId}`,
          });
        }
      } else if (rule.actionType === "CALCULATE_DURATION") {
        // Duration Logic
        // ...
        // Kept simplified logic for calculating duration
        const recentLogs = await prisma.auditLog.findMany({
          where: { recordId: recordId, action: { in: ["UPDATE", "CREATE"] } },
          orderBy: { timestamp: "desc" },
          take: 100,
        });

        let startTime: Date | null = null;
        for (const log of recentLogs) {
          const logData = log.diffJson as any;
          const logValue = logData ? logData[columnId] : undefined;
          if (logData && String(logValue) === String(oldValue)) {
            startTime = log.timestamp;
            break;
          }
        }
        if (!startTime) {
          const createLog = await prisma.auditLog.findFirst({
            where: { recordId: recordId, action: "CREATE" },
          });
          if (createLog) {
            const createData = createLog.diffJson as any;
            if (
              createData &&
              String(createData[columnId]) === String(oldValue)
            ) {
              startTime = createLog.timestamp;
            }
          }
        }
        if (startTime) {
          const endTime = new Date();
          const diffMs = endTime.getTime() - new Date(startTime).getTime();
          const diffMinutes = Math.floor(diffMs / (1000 * 60));
          const diffHours = Math.floor(diffMinutes / 60);
          const diffDays = Math.floor(diffHours / 24);
          const remainingHours = diffHours % 24;
          const remainingMinutes = diffMinutes % 60;
          const remainingSeconds = Math.floor((diffMs % (1000 * 60)) / 1000);
          const durationString = `${diffDays}d ${remainingHours}h ${remainingMinutes}m ${remainingSeconds}s|${oldValue}->${newValue}`;

          await prisma.statusDuration.create({
            data: {
              automationRuleId: rule.id,
              recordId: recordId,
              durationSeconds: Math.floor(diffMs / 1000),
              durationString: durationString,
              fromValue: String(oldValue),
              toValue: String(newValue),
            },
          });
        }
      }
    }

    await processMultiEventDurationTrigger(tableId, recordId, oldData, newData);

    // Check all view automations to ensure they trigger correctly
    console.log(
      `[Automations] 🎯 About to check VIEW AUTOMATIONS after record update`
    );
    await processViewAutomations();
    console.log(`[Automations] ✅ Finished checking VIEW AUTOMATIONS`);

    // --- REAL TEME FINANCE SYNC (ON UPDATE) ---
    try {
      const syncRules = await prisma.financeSyncRule.findMany({
        where: { sourceType: "TABLE", sourceId: tableId, isActive: true },
      });

      if (syncRules.length > 0) {
        console.log(
          `[Automations] Record update in Table ${tableId}. Triggering ${syncRules.length} sync rules...`
        );
        const { runSyncRule } = await import("./finance-sync");
        for (const rule of syncRules) {
          runSyncRule(rule.id).catch((e) =>
            console.error(`[Auto-Sync] Failed to run rule ${rule.id}`, e)
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

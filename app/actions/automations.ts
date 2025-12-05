"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { sendNotification } from "./notifications";

export async function getAutomationRules() {
  try {
    const rules = await prisma.automationRule.findMany({
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
  createdBy: number;
}) {
  try {
    const rule = await prisma.automationRule.create({
      data: {
        name: data.name,
        triggerType: data.triggerType,
        triggerConfig: data.triggerConfig,
        actionType: data.actionType,
        actionConfig: data.actionConfig,
        createdBy: data.createdBy,
      },
    });

    // Run retroactive automation in the background
    // We don't await this to keep the UI responsive, but in a server action we must ensure it runs.
    // Since Next.js server actions might terminate, we should usually await or use a job queue.
    // For this use case, we'll await it to ensure data consistency for the user immediately.
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
    // Legacy Task Logic
    const toStatus = triggerConfig.toStatus;
    const fromStatus = triggerConfig.fromStatus;

    const tasks = await prisma.task.findMany({
      where: toStatus ? { status: toStatus } : {},
    });

    for (const task of tasks) {
      // Find logs
      const logs = await prisma.auditLog.findMany({
        where: { taskId: task.id, action: "UPDATE" },
        orderBy: { timestamp: "desc" },
        take: 100,
      });

      // Find End Time (Transition TO 'toStatus')
      let endLog = null;
      let startLog = null;

      for (let i = 0; i < logs.length; i++) {
        const log = logs[i];
        const diff = log.diffJson as any;

        // If we found the end point (transition TO current status or matched status)
        if (diff?.status?.to) {
          // Task updates usually structure diff as { status: { from: A, to: B } } or just { status: B } depending on implementation.
          // Based on `processTaskStatusChange` reading `diff.status.to`, let's assume specific structure or just `diff.status` if simple update.
          // `processTaskStatusChange` (Line 183) uses `diff.status.to`. So Task updates seem to store rich diffs.
          if ((!toStatus || diff.status.to === toStatus) && !endLog) {
            endLog = log;
            // Now look for start log (transition TO the 'from' status, which is when we entered it)
            // Continue searching deeper in history
            const targetFromStatus = fromStatus || diff.status.from;

            // We need to find when we *entered* `targetFromStatus`.
            // So we look for a log OLDER than this one where `diff.status.to === targetFromStatus`.
            for (let j = i + 1; j < logs.length; j++) {
              const prevLog = logs[j];
              const prevDiff = prevLog.diffJson as any;
              if (prevDiff?.status?.to === targetFromStatus) {
                startLog = prevLog;
                break;
              }
            }
            if (startLog) break; // Found pair
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

      // 1. Find the LATEST transition that satisfies the rules
      // We iterate form newest to oldest
      for (let i = 0; i < logs.length; i++) {
        const log = logs[i];
        const diff = log.diffJson as any;
        const val = diff ? diff[columnId] : undefined;

        if (val !== undefined) {
          // This log touched the column
          // Is it a candidate for "End"? (Transition TO value)
          if (!endLog) {
            if (!toValue || String(val) === String(toValue)) {
              endLog = log;
              foundToVal = String(val);

              // Now we need to find "Start" (Transition TO fromValue)
              // We keep searching older logs
              continue;
            }
          } else {
            // We have an EndLog. Now looking for StartLog.
            // StartLog should be a transition TO the 'fromValue'.
            // Or if 'fromValue' is any, just the previous value change.

            // Check if this log sets the value to 'fromValue'
            if (!fromValue || String(val) === String(fromValue)) {
              // Also, it must be logically before the end log. (It is, because we iterate desc).
              // But wait, if we have A -> B -> C.
              // logs: [Set C], [Set B], [Set A].
              // If rule is A -> C.
              // EndLog = Set C.
              // We find Set B. It is NOT A. Ignore?
              // If rule is Any -> C.
              // EndLog = Set C.
              // We find Set B. This is the start of state B.
              // But the transition to C happened FROM B.
              // So the duration in "Previous State" (B) is (Time C - Time B).
              // Wait, "Calculate Duration" usually means "How long did it take to handle?"
              // If I move New -> In Progress -> Done.
              // Duration for "Done" is usually "How long was it In Progress?".
              // So Start = Time set to In Progress. End = Time set to Done.

              // So looking for `startLog` means: looking for the log that set the value to `foundFromVal` (where `foundFromVal` is the value we transitioned FROM).
              // But we don't know `foundFromVal` easily from just `endLog` if `diff` doesn't have it.
              // We implicitly assume the value *before* `endLog` was the state we want to measure.
              // The log `logs[i]` sets the value to `val`.
              // So between `logs[i].timestamp` and `endLog.timestamp`, the value was `val`.

              // If `fromValue` matches `val`, then this IS the start of the period we care about.
              startLog = log;
              foundFromVal = String(val);
              break;
            }
          }
        }
      }

      // Special case: If startLog not found, check CREATE log if it set the initial value
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

        const diffMinutes = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMinutes / 60);
        const diffDays = Math.floor(diffHours / 24);
        const remainingHours = diffHours % 24;
        const remainingMinutes = diffMinutes % 60;
        const remainingSeconds = Math.floor((diffMs % (1000 * 60)) / 1000);

        const durationString = `${diffDays}d ${remainingHours}h ${remainingMinutes}m ${remainingSeconds}s|${foundFromVal}->${foundToVal}`;
        console.log(
          `[Automations] Retroactively updated Record ${record.id}: ${durationString}`
        );

        // Determine where `data` field is. Prisma `record.data` is Json.
        const currentData = (record.data as any) || {};
        const updatedData = {
          ...currentData,
          duration_status_change: durationString,
        };

        await prisma.record.update({
          where: { id: record.id },
          data: { data: updatedData },
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
    // Cascade delete is handled by the database schema (StatusDuration -> AutomationRule)
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

// Ensure triggerConfig and actionConfig types are safely handled
interface TriggerConfig {
  fromStatus?: string;
  toStatus?: string;
  [key: string]: any;
}

interface ActionConfig {
  recipientId?: number;
  messageTemplate?: string;
  titleTemplate?: string;
  [key: string]: any;
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

      // Check if rule matches the status change
      if (triggerConfig.fromStatus && triggerConfig.fromStatus !== fromStatus)
        continue;
      if (triggerConfig.toStatus && triggerConfig.toStatus !== toStatus)
        continue;

      // Execute Action
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
        // Only run if we moved away from 'fromStatus' (which is the start status we care about)
        // Actually, we want to know how long it was in 'fromStatus'.
        // So start time is when it *entered* 'fromStatus'.
        // End time is NOW (when it moves to 'toStatus').

        // Find the audit log where status changed TO 'fromStatus'
        // Find the audit log where status changed TO 'fromStatus'
        const recentLogs = await prisma.auditLog.findMany({
          where: {
            taskId: taskId,
            action: "UPDATE",
          },
          orderBy: {
            timestamp: "desc",
          },
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

          // Convert to months, days, hours, minutes
          const diffMinutes = Math.floor(diffMs / (1000 * 60));
          const diffHours = Math.floor(diffMinutes / 60);
          const diffDays = Math.floor(diffHours / 24);
          const diffMonths = Math.floor(diffDays / 30); // Approximation

          const remainingDays = diffDays % 30;
          const remainingHours = diffHours % 24;
          const remainingMinutes = diffMinutes % 60;

          const durationString = `${diffMonths} months, ${remainingDays} days, ${remainingHours} hours, ${remainingMinutes} minutes`;

          // Update the task with this string
          await prisma.task.update({
            where: { id: taskId },
            data: {
              duration_status_change: durationString,
            },
          });
        } else {
          // If no previous log found, maybe it was created in that status?
          // Or we just can't calculate.
          console.log(
            "No previous AuditLog found for status entry:",
            fromStatus
          );
        }
      }
    }
  } catch (error) {
    console.error("Error processing task status automations:", error);
    // Don't throw, just log, so we don't block the main flow
  }
}

export async function processNewRecordTrigger(
  tableId: number,
  tableName: string,
  recordId: number
) {
  try {
    const rules = await prisma.automationRule.findMany({
      where: {
        isActive: true,
        triggerType: "NEW_RECORD",
      },
    });

    for (const rule of rules) {
      const triggerConfig = rule.triggerConfig as TriggerConfig;

      if (triggerConfig.tableId && parseInt(triggerConfig.tableId) !== tableId)
        continue;

      if (rule.actionType === "SEND_NOTIFICATION") {
        const actionConfig = rule.actionConfig as ActionConfig;
        if (actionConfig.recipientId) {
          await sendNotification({
            userId: actionConfig.recipientId,
            title: actionConfig.titleTemplate || "New Record Created",
            message: (
              actionConfig.messageTemplate ||
              "New record created in table {tableName}"
            ).replace("{tableName}", tableName),
            link: `/tables/${tableId}`,
          });
        }
      }
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
      where: {
        isActive: true,
        triggerType: "RECORD_FIELD_CHANGE",
      },
    });

    console.log(
      `[Automations] Found ${rules.length} active rules for RECORD_FIELD_CHANGE`
    );

    const table = await prisma.tableMeta.findUnique({
      where: { id: tableId },
      select: { name: true },
    });

    const tableName = table?.name || "Unknown Table";

    for (const rule of rules) {
      const triggerConfig = rule.triggerConfig as any;

      // 1. Check Table ID
      if (triggerConfig.tableId && Number(triggerConfig.tableId) !== tableId) {
        continue;
      }

      // 2. Check Column Change
      const columnId = triggerConfig.columnId;
      if (!columnId) continue;

      const oldValue = oldData[columnId];
      const newValue = newData[columnId];

      console.log(
        `[Automations] Rule ${rule.id}: Inspecting Column '${columnId}'. Old: '${oldValue}', New: '${newValue}'`
      );

      if (newValue === undefined || oldValue === newValue) {
        continue;
      }

      // 3. Check Specific Values
      if (
        triggerConfig.fromValue &&
        String(oldValue) !== String(triggerConfig.fromValue)
      ) {
        continue;
      }

      if (
        triggerConfig.toValue &&
        String(newValue) !== String(triggerConfig.toValue)
      ) {
        continue;
      }

      console.log(
        `[Automations] Rule ${rule.id} MATCHED. Executing Action: ${rule.actionType}`
      );

      // Execute Action
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
        console.log(
          `[Automations] CALCULATE_DURATION: Looking for when value changed FROM '${oldValue}' TO '${newValue}' in column '${columnId}'`
        );

        // Find when it entered the 'oldValue' state
        let startTime: Date | null = null;

        // 1. Search recent logs (increased limit to 100)
        const recentLogs = await prisma.auditLog.findMany({
          where: {
            recordId: recordId,
            action: { in: ["UPDATE", "CREATE"] },
          },
          orderBy: { timestamp: "desc" },
          take: 100,
        });

        for (const log of recentLogs) {
          const logData = log.diffJson as any;
          const logValue = logData ? logData[columnId] : undefined;

          if (logData && String(logValue) === String(oldValue)) {
            startTime = log.timestamp;
            console.log(
              `[Automations] ✅ Found start time in recent logs: ${startTime} from log ${log.id}`
            );
            break;
          }
        }

        // 2. If not found in recent logs, check the CREATE log specifically
        if (!startTime) {
          console.log(
            `[Automations] No specific update found in recent logs. Checking record creation...`
          );
          const createLog = await prisma.auditLog.findFirst({
            where: {
              recordId: recordId,
              action: "CREATE",
            },
          });

          if (createLog) {
            const createData = createLog.diffJson as any;
            if (
              createData &&
              String(createData[columnId]) === String(oldValue)
            ) {
              startTime = createLog.timestamp;
              console.log(
                `[Automations] ✅ Found start time in CREATE log: ${startTime}`
              );
            }
          }
        }

        // 3. Fallback: If we assume existing records might not have audit logs (e.g. imported)
        // and we know it WAS 'oldValue' (since we just transitioned from it),
        // we might not treat it as valid if we can't reproduce the history.
        // But for now, we rely on AuditLog.

        if (startTime) {
          const endTime = new Date();
          const diffMs = endTime.getTime() - new Date(startTime).getTime();
          console.log(`[Automations] Calculated duration: ${diffMs}ms`);

          const diffMinutes = Math.floor(diffMs / (1000 * 60));
          const diffHours = Math.floor(diffMinutes / 60);
          const diffDays = Math.floor(diffHours / 24);

          const remainingHours = diffHours % 24;
          const remainingMinutes = diffMinutes % 60;
          const remainingSeconds = Math.floor((diffMs % (1000 * 60)) / 1000);

          // Append source->target info to the string for analytics display
          const durationString = `${diffDays}d ${remainingHours}h ${remainingMinutes}m ${remainingSeconds}s|${oldValue}->${newValue}`;
          console.log(`[Automations] Formatted duration: ${durationString}`);

          // Save to StatusDuration table
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
          console.log(
            `[Automations] ✅ Saved duration for Record ${recordId} in StatusDuration`
          );
        } else {
          console.log(
            `[Automations] ❌ Could not find a start time for value '${oldValue}'. No duration calculated.`
          );
        }
      }
    }
  } catch (error) {
    console.error("Error processing record update automations:", error);
  }
}

import { Prisma } from "@prisma/client";
import { inngest } from "../client";
import { prismaBg as prisma } from "@/lib/prisma-background";
import { validateUserInCompany } from "@/lib/company-validation";
import { createNotificationForCompany } from "@/app/actions/notifications";

/**
 * Background job for executing workflow stage automations.
 * Offloaded from the user request path to avoid blocking stage completion.
 */
export const processWorkflowStageAutomations = inngest.createFunction(
  {
    id: "workflow-stage-automations",
    name: "Execute Workflow Stage Automations",
    retries: 3,
    timeouts: { finish: "120s" },
    concurrency: [
      { limit: 3, key: "event.data.companyId" },
    ],
  },
  { event: "workflow/execute-stage-automations" },
  async ({ event, step }) => {
    const {
      stageDetails,
      stageName,
      stageId,
      instanceId,
      instanceName,
      companyId,
      userId,
    } = event.data;

    if (!stageDetails || !Array.isArray(stageDetails.systemActions)) return;

    console.log(
      `[Automation] Processing ${stageDetails.systemActions.length} actions for stage ${stageName}`,
    );

    for (let i = 0; i < stageDetails.systemActions.length; i++) {
      const action = stageDetails.systemActions[i];
      if (typeof action === "string") {
        console.log(`[Automation] Legacy action skipped: ${action}`);
        continue;
      }

      const { type, config } = action;
      if (!type) continue;

      try {
        switch (type) {
          case "create_task":
            if (config.title) {
              await step.run(`create-task-${i}-${config.title}`, async () => {
                let dueDate: Date | undefined = undefined;
                if (
                  config.dueDateOffset !== undefined &&
                  config.dueDateOffset !== ""
                ) {
                  const d = new Date();
                  d.setDate(d.getDate() + Number(config.dueDateOffset));
                  dueDate = d;
                }

                let validatedAssigneeId: number | null = null;
                if (config.assigneeId) {
                  const assigneeOk = await validateUserInCompany(
                    Number(config.assigneeId),
                    companyId,
                  );
                  if (assigneeOk) validatedAssigneeId = Number(config.assigneeId);
                }

                await prisma.task.create({
                  data: {
                    companyId,
                    title: config.title,
                    status: config.status || "todo",
                    assigneeId: validatedAssigneeId,
                    priority: config.priority || "normal",
                    description: config.description || "",
                    dueDate,
                    tags: ['נוצר ע"י אוטומציה מתהליך עבודה'],
                  },
                });
                console.log(`[Automation] Task created: ${config.title}`);
              });
            }
            break;

          case "notification":
            if (config.recipientId && config.message) {
              await step.run(`notification-${i}-${config.recipientId}`, async () => {
                await createNotificationForCompany({
                  companyId,
                  userId: Number(config.recipientId),
                  title: "התראה מתהליך עבודה",
                  message: `${config.message} (תהליך: ${instanceName})`,
                  link: `/workflows`,
                  skipValidation: true, // companyId verified upstream
                });
                console.log(
                  `[Automation] Notification sent to user ${config.recipientId}`,
                );
              });
            }
            break;

          case "create_record":
            if (config.tableId) {
              await step.run(`create-record-${i}-table-${config.tableId}`, async () => {
                const tId = Number(config.tableId);
                const targetTable = await prisma.tableMeta.findFirst({
                  where: { id: tId, companyId },
                  select: { id: true },
                });
                if (!targetTable) return;

                const recordData = config.values || {};
                await prisma.record.create({
                  data: {
                    companyId,
                    tableId: tId,
                    data: recordData,
                    createdBy: userId,
                  },
                });
                console.log(
                  `[Automation] Record created in table ${config.tableId}`,
                );
              });
            }
            break;

          case "update_record":
            if (config.tableId && config.recordId && config.fieldName) {
              await step.run(`update-record-${i}-${config.recordId}`, async () => {
                const recordId = Number(config.recordId);
                const tableId = Number(config.tableId);

                // Transaction with Serializable isolation to prevent lost updates on concurrent arithmetic ops
                // Retry once on serialization failure (matching createStage / updateWorkflowInstanceStage pattern)
                const runTx = () => prisma.$transaction(async (tx) => {
                  const record = await tx.record.findFirst({
                    where: {
                      id: recordId,
                      tableId,
                      companyId,
                    },
                    select: { id: true, data: true },
                  });

                  if (!record) {
                    console.log(
                      `[Automation] Record ${recordId} not found for update in table ${tableId}`,
                    );
                    return;
                  }

                  let newData = { ...(record.data as any) };
                  const field = config.fieldName;
                  let val = config.value;

                  if (
                    config.operation &&
                    config.operation !== "set" &&
                    !isNaN(Number(val))
                  ) {
                    const currentVal = Number(newData[field] || 0);
                    const operVal = Number(val);
                    switch (config.operation) {
                      case "add":
                        val = currentVal + operVal;
                        break;
                      case "subtract":
                        val = currentVal - operVal;
                        break;
                      case "multiply":
                        val = currentVal * operVal;
                        break;
                      case "divide":
                        val = operVal !== 0 ? currentVal / operVal : currentVal;
                        break;
                    }
                  }

                  newData[field] = val;

                  await tx.record.update({
                    where: { id: recordId, companyId },
                    data: { data: newData },
                  });
                  console.log(
                    `[Automation] Record ${recordId} updated: ${field} = ${val}`,
                  );
                }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

                try {
                  await runTx();
                } catch (e: any) {
                  if (e.code === "P2034" || e.message?.includes("40001")) {
                    await runTx();
                  } else {
                    throw e;
                  }
                }
              });
            }
            break;

          case "create_event":
            await step.run(`create-event-${i}-${config.title || "auto"}`, async () => {
              const now = new Date();
              let startTime = new Date(now);

              if (config.timingMode === "relative") {
                if (config.hoursOffset)
                  startTime.setHours(
                    startTime.getHours() + Number(config.hoursOffset),
                  );
                if (config.minutesOffset)
                  startTime.setMinutes(
                    startTime.getMinutes() + Number(config.minutesOffset),
                  );
              } else {
                if (config.daysOffset) {
                  startTime.setDate(
                    startTime.getDate() + Number(config.daysOffset),
                  );
                }
                if (config.startTime) {
                  const [hours, minutes] = config.startTime.split(":").map(Number);
                  if (!isNaN(hours) && !isNaN(minutes)) {
                    startTime.setHours(hours);
                    startTime.setMinutes(minutes);
                    startTime.setSeconds(0);
                    startTime.setMilliseconds(0);
                  }
                }
              }

              const duration = Number(config.duration || 60);
              const endTime = new Date(startTime);
              endTime.setMinutes(endTime.getMinutes() + duration);

              await prisma.calendarEvent.create({
                data: {
                  companyId,
                  title: config.title || "Meeting (Auto)",
                  description:
                    config.description || `Created by workflow: ${instanceName}`,
                  startTime,
                  endTime,
                  color: config.color || "#3788d8",
                },
              });
              console.log(`[Automation] Event created: ${config.title}`);
            });
            break;

          case "whatsapp": {
            let target = config.phoneColumnId || "";
            if (target.startsWith("manual:")) {
              target = target.replace("manual:", "");
            }

            if (target) {
              await inngest.send({
                id: `wa-workflow-${companyId}-${target}-${stageId}-${Math.floor(Date.now() / 5000)}`,
                name: "automation/send-whatsapp",
                data: {
                  companyId,
                  phone: String(target),
                  content: config.content || "",
                  messageType: config.messageType,
                  mediaFileId: config.mediaFileId,
                },
              });
              console.log(`[Automation] WhatsApp job enqueued for ${target}`);
            } else {
              console.warn("[Automation] WhatsApp: No phone number resolved");
            }
            break;
          }

          case "webhook":
            if (config.url) {
              const urlHost = (() => {
                try {
                  return new URL(config.url).hostname;
                } catch {
                  return "invalid";
                }
              })();
              await inngest.send({
                id: `webhook-workflow-${companyId}-${stageId}-${urlHost}-${Math.floor(Date.now() / 5000)}`,
                name: "automation/send-webhook",
                data: {
                  url: config.url,
                  companyId,
                  ruleId: 0,
                  payload: {
                    ruleId: 0,
                    ruleName: `Workflow: ${instanceName}`,
                    triggerType: "STAGE_COMPLETED",
                    companyId,
                    data: {
                      event: "stage_completed",
                      workflow: instanceName,
                      stage: stageName,
                    },
                  },
                },
              });
              console.log(`[Automation] Webhook job enqueued to ${config.url}`);
            }
            break;
        }
      } catch (e) {
        console.error(`[Automation] Failed to execute ${type}:`, e);
      }
    }

    return { success: true };
  },
);

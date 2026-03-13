import { prisma } from "@/lib/prisma";
import { withRetry } from "@/lib/db-retry";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { createNotificationForCompany } from "@/lib/notifications-internal";
import { inngest } from "@/lib/inngest/client";
import { calculateViewStats } from "@/lib/analytics/calculate";
import { invalidateFullCache } from "@/lib/services/analytics-cache";
import { isPrivateUrl } from "@/lib/security/ssrf";
import { validateAutomationInput, validateId } from "@/lib/security/automation-validation";
import { checkCategoryLimitAndCreate } from "@/lib/automation-limit-check";
import { checkActionRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { hasUserFlag } from "@/lib/permissions";
import { createLogger } from "@/lib/logger";
import { createHmac, randomBytes } from "crypto";

const log = createLogger("Automations");

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

/** Extract all webhook URLs from action config (recursive for nested MULTI_ACTION) */
function extractWebhookUrls(actionType: string, actionConfig: any, depth = 0): string[] {
  if (depth > 3) return []; // Prevent infinite recursion
  const urls: string[] = [];
  if (actionType === "WEBHOOK") {
    const url = actionConfig?.webhookUrl || actionConfig?.url;
    if (url) urls.push(url);
  } else if (actionType === "MULTI_ACTION") {
    const actions = actionConfig?.actions;
    if (Array.isArray(actions)) {
      for (const action of actions) {
        urls.push(...extractWebhookUrls(action.type, action.config, depth + 1));
      }
    }
  }
  return urls;
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
    // Meeting context
    meetingId?: string;
    participantName?: string;
    participantEmail?: string;
    participantPhone?: string;
    meetingType?: string;
    meetingStart?: string;
    meetingEnd?: string;
  },
) {
  const { companyId, id: ruleId, createdBy } = rule;

  const executeSingle = async (type: string, config: any) => {
    log.info("Executing action", { type, ruleId });

    // Shared replaceText helper — used by CREATE_TASK, CREATE_RECORD, CREATE_CALENDAR_EVENT
    const replaceText = (text: string) => {
      if (!text) return text;
      let res = text;
      if (context.tableName) {
        res = res.split("{tableName}").join(context.tableName);
      }
      if (context.recordData) {
        for (const key in context.recordData) {
          res = res.split(`{${key}}`).join(String(context.recordData[key] || ""));
        }
      }
      if (context.taskTitle) {
        res = res
          .split("{taskTitle}").join(context.taskTitle)
          .split("{fromStatus}").join(context.fromStatus || "")
          .split("{toStatus}").join(context.toStatus || "");
      }
      if (context.oldRecordData && rule.triggerType === "RECORD_FIELD_CHANGE") {
        const colId = rule.triggerConfig?.columnId;
        if (colId) {
          res = res
            .split("{fieldName}").join(colId)
            .split("{fromValue}").join(String(context.oldRecordData[colId]))
            .split("{toValue}").join(String(context.recordData?.[colId] ?? ""));
        }
      }
      if (context.meetingId) {
        res = res
          .split("{participantName}").join(context.participantName || "")
          .split("{participantEmail}").join(context.participantEmail || "")
          .split("{participantPhone}").join(context.participantPhone || "")
          .split("{meetingType}").join(context.meetingType || "")
          .split("{meetingStart}").join(context.meetingStart || "")
          .split("{meetingEnd}").join(context.meetingEnd || "");
      }
      return res;
    };

    try {
      if (type === "SEND_NOTIFICATION") {
        if (config.recipientId) {
          let message = config.messageTemplate || "עדכון במערכת";
          let title = config.titleTemplate || "עדכון אוטומטי";
          let link = "/";

          // Dynamic Replacements
          if (context.tableName) {
            message = message.split("{tableName}").join(context.tableName);
            title = title.split("{tableName}").join(context.tableName);
            if (context.tableName === "Calendar") {
              link = "/calendar";
            } else {
              link = `/tables/${context.tableId}`;
            }
          }
          if (context.recordData) {
            for (const key in context.recordData) {
              message = message.split(`{${key}}`).join(String(context.recordData[key] || ""));
            }
          }
          if (context.taskTitle) {
            message = message
              .split("{taskTitle}").join(context.taskTitle)
              .split("{fromStatus}").join(context.fromStatus || "")
              .split("{toStatus}").join(context.toStatus || "");
            link = "/tasks";
          }
          // Meeting Replacements
          if (context.meetingId) {
            message = message
              .split("{participantName}").join(context.participantName || "")
              .split("{participantEmail}").join(context.participantEmail || "")
              .split("{participantPhone}").join(context.participantPhone || "")
              .split("{meetingType}").join(context.meetingType || "")
              .split("{meetingStart}").join(context.meetingStart || "")
              .split("{meetingEnd}").join(context.meetingEnd || "");
            title = title
              .split("{participantName}").join(context.participantName || "")
              .split("{meetingType}").join(context.meetingType || "");
            link = "/meetings";
          }
          // Field Change Replacements
          if (
            context.oldRecordData &&
            rule.triggerType === "RECORD_FIELD_CHANGE"
          ) {
            const colId = rule.triggerConfig?.columnId;
            if (colId) {
              message = message
                .split(`{fieldName}`).join(colId)
                .split(`{fromValue}`).join(String(context.oldRecordData[colId]))
                .split(`{toValue}`).join(String(context.recordData[colId]));
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
            log.error("Notification failed for rule", { ruleId, error: notifRes.error });
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

        // Resolve phone number — for meetings, use participant phone directly
        const phoneColumnId = config.phoneColumnId;
        let phone = "";
        if (context.meetingId && context.participantPhone) {
          phone = context.participantPhone;
        } else if (phoneColumnId?.startsWith("manual:")) {
          phone = phoneColumnId.replace("manual:", "");
        } else if (phoneColumnId) {
          phone = waData[phoneColumnId] || "";
        }

        // Resolve content with dynamic placeholders
        let waContent = config.content || config.message || "";
        for (const key in waData) {
          waContent = waContent.split(`{${key}}`).join(String(waData[key] || ""));
        }
        // Meeting-specific replacements
        if (context.meetingId) {
          waContent = waContent
            .split("{participantName}").join(context.participantName || "")
            .split("{participantEmail}").join(context.participantEmail || "")
            .split("{participantPhone}").join(context.participantPhone || "")
            .split("{meetingType}").join(context.meetingType || "")
            .split("{meetingStart}").join(context.meetingStart || "")
            .split("{meetingEnd}").join(context.meetingEnd || "");
        }

        if (!phone) {
          log.error("WhatsApp: No phone resolved from column config");
        } else {
          // Dispatch to dedicated Inngest job with retry + rate limiting
          let inngestOk = false;
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
            inngestOk = true;
            log.info("WhatsApp job enqueued", { phoneMasked: `${String(phone).slice(0, 3)}****${String(phone).slice(-2)}` });
          } catch (err) {
            log.error("Inngest WhatsApp enqueue failed, falling back to direct send", { ruleId, error: String(err) });
          }

          // Direct fallback: send WhatsApp message directly if Inngest is unavailable
          if (!inngestOk) {
            try {
              const { sendGreenApiMessage, sendGreenApiFile } = await import("@/lib/services/green-api");
              const normalizedPhone = String(phone).replace(/[^0-9]/g, "");
              if (normalizedPhone) {
                if (config.messageType === "media" && config.mediaFileId) {
                  const file = await prisma.file.findFirst({
                    where: { id: Number(config.mediaFileId), companyId },
                  });
                  if (file?.url) {
                    await sendGreenApiFile(companyId, normalizedPhone, file.url, file.name, waContent);
                  }
                } else {
                  await sendGreenApiMessage(companyId, normalizedPhone, waContent);
                }
                log.info("WhatsApp sent directly (fallback)", { phoneMasked: `${normalizedPhone.slice(0, 3)}****${normalizedPhone.slice(-2)}` });
              }
            } catch (directErr) {
              log.error("Direct WhatsApp send also failed", { ruleId, error: String(directErr) });
            }
          }
        }
      } else if (type === "SEND_SMS") {
        // Prepare data for SMS
        const smsData = { ...context.recordData };
        if (context.taskTitle) {
          smsData.taskTitle = context.taskTitle;
          smsData.fromStatus = context.fromStatus;
          smsData.toStatus = context.toStatus;
        }

        // Resolve phone number
        const smsPhoneColumnId = config.phoneColumnId;
        let smsPhone = "";
        if (context.meetingId && context.participantPhone) {
          smsPhone = context.participantPhone;
        } else if (smsPhoneColumnId?.startsWith("manual:")) {
          smsPhone = smsPhoneColumnId.replace("manual:", "");
        } else if (smsPhoneColumnId) {
          smsPhone = smsData[smsPhoneColumnId] || "";
        }

        // Resolve content with dynamic placeholders
        let smsContent = config.content || config.message || "";
        for (const key in smsData) {
          smsContent = smsContent.split(`{${key}}`).join(String(smsData[key] || ""));
        }
        if (context.meetingId) {
          smsContent = smsContent
            .split("{participantName}").join(context.participantName || "")
            .split("{participantEmail}").join(context.participantEmail || "")
            .split("{participantPhone}").join(context.participantPhone || "")
            .split("{meetingType}").join(context.meetingType || "")
            .split("{meetingStart}").join(context.meetingStart || "")
            .split("{meetingEnd}").join(context.meetingEnd || "");
        }

        if (!smsPhone) {
          log.error("SMS: No phone resolved from column config");
        } else {
          try {
            await inngest.send({
              id: `sms-${companyId}-${smsPhone}-${ruleId}-${Math.floor(Date.now() / 5000)}`,
              name: "automation/send-sms",
              data: {
                companyId,
                phone: String(smsPhone),
                content: smsContent,
                delay: config.delay,
              },
            });
            log.info("SMS job enqueued", { phoneMasked: `${String(smsPhone).slice(0, 3)}****${String(smsPhone).slice(-2)}` });
          } catch (err) {
            log.error("Inngest SMS enqueue failed", { ruleId, error: String(err) });
          }
        }
      } else if (type === "SEND_EMAIL") {
        // Prepare data for Email
        const emailData = { ...context.recordData };
        if (context.taskTitle) {
          emailData.taskTitle = context.taskTitle;
          emailData.fromStatus = context.fromStatus;
          emailData.toStatus = context.toStatus;
        }

        // Resolve email address
        const emailColumnId = config.emailColumnId;
        let emailAddr = "";
        if (context.meetingId && context.participantEmail) {
          emailAddr = context.participantEmail;
        } else if (emailColumnId?.startsWith("manual:")) {
          emailAddr = emailColumnId.replace("manual:", "");
        } else if (emailColumnId) {
          emailAddr = emailData[emailColumnId] || "";
        }

        // Resolve subject with dynamic placeholders
        let emailSubject = config.subject || "";
        for (const key in emailData) {
          emailSubject = emailSubject.split(`{${key}}`).join(String(emailData[key] || ""));
        }
        // Resolve content with dynamic placeholders
        let emailContent = config.content || config.message || "";
        for (const key in emailData) {
          emailContent = emailContent.split(`{${key}}`).join(String(emailData[key] || ""));
        }
        if (context.meetingId) {
          const meetingReplace = (text: string) => text
            .split("{participantName}").join(context.participantName || "")
            .split("{participantEmail}").join(context.participantEmail || "")
            .split("{participantPhone}").join(context.participantPhone || "")
            .split("{meetingType}").join(context.meetingType || "")
            .split("{meetingStart}").join(context.meetingStart || "")
            .split("{meetingEnd}").join(context.meetingEnd || "");
          emailSubject = meetingReplace(emailSubject);
          emailContent = meetingReplace(emailContent);
        }

        if (!emailAddr) {
          log.error("Email: No email resolved from column config");
        } else {
          try {
            await inngest.send({
              id: `email-${companyId}-${emailAddr}-${ruleId}-${Math.floor(Date.now() / 5000)}`,
              name: "automation/send-email",
              data: {
                companyId,
                to: String(emailAddr),
                subject: emailSubject,
                body: emailContent,
                delay: config.delay,
              },
            });
            log.info("Email job enqueued", { emailMasked: String(emailAddr).replace(/(.{3}).*(@.*)/, "$1***$2") });
          } catch (err) {
            log.error("Inngest Email enqueue failed", { ruleId, error: String(err) });
          }
        }
      } else if (type === "WEBHOOK") {
        const webhookData: Record<string, unknown> = {
          ...context.recordData,
          tableId: context.tableId,
          recordId: context.recordId,
          tableName: context.tableName,
        };
        // Enrich webhook payload with meeting data
        if (context.meetingId) {
          webhookData.meetingId = context.meetingId;
          webhookData.participantName = context.participantName;
          webhookData.participantEmail = context.participantEmail;
          webhookData.participantPhone = context.participantPhone;
          webhookData.meetingType = context.meetingType;
          webhookData.meetingStart = context.meetingStart;
          webhookData.meetingEnd = context.meetingEnd;
        }
        const webhookUrl = config.webhookUrl || config.url;

        if (!webhookUrl) {
          log.error("Webhook missing URL", { ruleId });
        } else if (isPrivateUrl(webhookUrl)) {
          log.error("Webhook URL targets private/internal address, blocking dispatch", { ruleId });
        } else {
          // Dispatch to dedicated Inngest job with retry + rate limiting
          let inngestOk = false;
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
            inngestOk = true;
            log.info("Webhook job enqueued", { ruleId });
          } catch (err) {
            log.error("Inngest Webhook enqueue failed, falling back to direct send", { ruleId, error: String(err) });
          }

          // Direct fallback: send webhook directly if Inngest is unavailable
          if (!inngestOk) {
            if (isPrivateUrl(webhookUrl)) {
              log.error("Webhook URL targets private/internal address, blocking fallback", { ruleId });
            } else try {
              const enrichedPayload = {
                ruleId: rule.id,
                ruleName: rule.name,
                triggerType: rule.triggerType,
                companyId,
                data: webhookData,
                timestamp: new Date().toISOString(),
              };
              const body = JSON.stringify(enrichedPayload);

              // HMAC signing: same pattern as sendWebhookJob (atomic COALESCE)
              const newSecret = randomBytes(32).toString("hex");
              const secretResult = await prisma.$queryRaw<{ webhookSigningSecret: string }[]>`
                UPDATE "Company"
                SET "webhookSigningSecret" = COALESCE("webhookSigningSecret", ${newSecret})
                WHERE id = ${Number(companyId)}
                RETURNING "webhookSigningSecret"
              `;
              const signingSecret = secretResult[0]?.webhookSigningSecret;
              const ts = Math.floor(Date.now() / 1000).toString();
              const signature = signingSecret
                ? createHmac("sha256", signingSecret).update(`${ts}.${body}`).digest("hex")
                : "";

              const res = await fetch(webhookUrl, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  ...(signature && {
                    "X-Webhook-Signature": `sha256=${signature}`,
                    "X-Webhook-Timestamp": ts,
                  }),
                },
                body,
                signal: AbortSignal.timeout(15_000),
                redirect: "error",
              });
              if (!res.ok) {
                log.error("Direct webhook failed", { ruleId, status: res.status, statusText: res.statusText });
              } else {
                log.info("Webhook sent directly (fallback)", { ruleId });
              }
            } catch (directErr) {
              log.error("Direct webhook also failed", { ruleId, error: String(directErr) });
            }
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

          // Extract triggerDate from mapping if configured
          let triggerDate: Date | undefined;
          if (mapping.triggerDate) {
            if (mapping.triggerDate === "__createdAt" || mapping.triggerDate === "__updatedAt") {
              // System fields: fetch from record model
              if (context.recordId) {
                const rec = await prisma.record.findFirst({
                  where: { id: context.recordId, companyId },
                  select: { createdAt: true, updatedAt: true },
                });
                if (rec) {
                  triggerDate = mapping.triggerDate === "__createdAt" ? rec.createdAt : rec.updatedAt;
                }
              }
            } else if (context.recordData[mapping.triggerDate]) {
              const rawDate = context.recordData[mapping.triggerDate];
              const parsed = new Date(rawDate);
              if (!isNaN(parsed.getTime())) {
                triggerDate = parsed;
              }
            }
          }

          if (email || phone) {
            const added = await addToNurtureList({
              companyId,
              listSlug: config.listId,
              name,
              email,
              phone,
              sourceType: "TABLE",
              sourceId: String(context.recordId),
              sourceTableId: context.tableId,
              triggerDate,
            });

            // autoTrigger: immediately dispatch delayed send (for review/upsell)
            if (added && config.autoTrigger && phone) {
              try {
                const { inngest: inngestClient } = await import("@/lib/inngest/client");
                const list = await prisma.nurtureList.findUnique({
                  where: { companyId_slug: { companyId, slug: config.listId } },
                });
                if (list?.configJson && list.isEnabled) {
                  const listConfig = list.configJson as any;
                  const channels = listConfig.channels || {};
                  if (channels.sms || channels.whatsappGreen || channels.whatsappCloud) {
                    // Resolve active message from config (messages[] array, not root fields)
                    const { migrateConfigMessages, getActiveMessage } = await import("@/lib/nurture-messages");
                    const activeMsg = getActiveMessage(migrateConfigMessages(listConfig));

                    // Calculate delay
                    const { NURTURE_TIMING_MAP } = await import("@/lib/nurture-messages");
                    const delayMs = NURTURE_TIMING_MAP[listConfig.timing] ?? 0;

                    const sub = await prisma.nurtureSubscriber.findFirst({
                      where: { nurtureListId: list.id, phone },
                    });

                    if (sub && activeMsg) {
                      await inngestClient.send({
                        name: "nurture/delayed-send",
                        data: {
                          companyId,
                          subscriberId: sub.id,
                          nurtureListId: list.id,
                          subscriberPhone: phone,
                          subscriberName: name,
                          channels,
                          smsBody: activeMsg.smsBody || "",
                          whatsappGreenBody: activeMsg.whatsappGreenBody || "",
                          whatsappCloudTemplateName: activeMsg.whatsappCloudTemplateName || "",
                          whatsappCloudLanguageCode: activeMsg.whatsappCloudLanguageCode || "he",
                          subscriberEmail: sub.email || "",
                          emailSubject: activeMsg.emailSubject || "",
                          emailBody: activeMsg.emailBody || "",
                          slug: config.listId,
                          delayMs,
                          triggerKey: `auto-${config.listId}-${Date.now()}`,
                        },
                      });
                    }
                  }
                }
              } catch (autoErr) {
                log.error("Auto-trigger failed", { error: String(autoErr) });
              }
            }
          }
        }
      } else if (type === "UPDATE_RECORD_FIELD") {
        // P96: Wrap in serializable transaction to prevent lost-update race condition
        // Retry up to 2 times on P2034 serialization conflicts
        if (context.recordId && config.columnId) {
          const MAX_SERIALIZATION_RETRIES = 2;
          for (let attempt = 0; attempt <= MAX_SERIALIZATION_RETRIES; attempt++) {
            try {
              await withRetry(() => prisma.$transaction(async (tx) => {
                const record = await tx.record.findFirst({
                  where: { id: context.recordId, companyId },
                  select: { id: true, data: true },
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

                  log.info("Updated record field", { columnId: config.columnId, recordId: context.recordId });
                }
              }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 }));
              break; // Success — exit retry loop
            } catch (txErr: any) {
              if (txErr?.code === "P2034" && attempt < MAX_SERIALIZATION_RETRIES) {
                log.warn("Serialization conflict on UPDATE_RECORD_FIELD, retrying", { recordId: context.recordId, attempt: attempt + 1, maxRetries: MAX_SERIALIZATION_RETRIES });
                continue;
              }
              throw txErr; // Non-serialization error or retries exhausted — propagate
            }
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

        finalTitle = replaceText(finalTitle);
        finalDesc = replaceText(finalDesc);

        // Calculate Due Date
        let dueDate = null as Date | null;
        if (dueDays !== undefined && dueDays !== null && dueDays !== "") {
          const date = new Date();
          date.setDate(date.getDate() + Number(dueDays));
          dueDate = date;
        }

        log.info("Creating task", { title: finalTitle, assigneeId });

        try {
          // SECURITY: Validate assigneeId belongs to same company
          let validAssigneeId: number | null = null;
          if (assigneeId) {
            const assigneeOk = await withRetry(() => prisma.user.findFirst({
              where: { id: Number(assigneeId), companyId },
              select: { id: true },
            }));
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
          log.info("Task created successfully");
        } catch (taskError) {
          log.error("Task creation error", { error: String(taskError) });
          // If this fails, we want to know why.
        }
      } else if (type === "CREATE_RECORD") {
        // Create a new record in a specified table
        const { tableId, fieldMappings } = config;

        if (!tableId) {
          log.error("CREATE_RECORD: No tableId specified");
          return;
        }

        // SECURITY: Validate tableId belongs to same company
        const targetTable = await withRetry(() => prisma.tableMeta.findFirst({
          where: { id: Number(tableId), companyId },
          select: { id: true },
        }));
        if (!targetTable) {
          log.error("CREATE_RECORD: Table not found in company", { tableId, companyId });
          return;
        }

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

          log.info("Creating record in table", { tableId });

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
              log.warn("FK violation for creator, retrying without", { createdBy, error: fkError.message });
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

          log.info("Record created successfully", { tableId });
        } catch (recordError) {
          log.error("Record creation error", { error: String(recordError) });
        }
      } else if (type === "CREATE_CALENDAR_EVENT") {
        // Create a new calendar event
        const { title, description, startOffset, endOffset, color } = config;

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

          log.info("Creating calendar event", { title: finalTitle, startTime: startTime.toISOString() });

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

          log.info("Calendar event created successfully");
        } catch (eventError) {
          log.error("Calendar event creation error", { error: String(eventError) });
        }
      }
    } catch (e) {
      log.error("Error executing action", { type, error: String(e) });
      throw e; // Re-throw so callers know the action failed
    }
  };

  if (rule.actionType === "MULTI_ACTION") {
    const actions = rule.actionConfig?.actions || [];
    if (actions.length > 50) {
      log.error("MULTI_ACTION exceeds max actions, skipping", { ruleId, actionCount: actions.length });
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
      log.error("Actions failed in MULTI_ACTION", { ruleId, failedCount: errors.length, totalCount: actions.length });
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
    log.error("calculateTaskDuration called without companyId, skipping");
    return;
  }
  const recentLogs = await withRetry(() => prisma.auditLog.findMany({
    where: { taskId: taskId, action: "UPDATE", companyId },
    orderBy: { timestamp: "desc" },
    take: 20,
    select: { diffJson: true, timestamp: true },
  }));
  let previousChange: (typeof recentLogs)[number] | null = null;
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
    log.error("calculateRecordDuration called without companyId, skipping");
    return;
  }
  const recentLogs = await withRetry(() => prisma.auditLog.findMany({
    where: { recordId: recordId, action: { in: ["UPDATE", "CREATE"] }, companyId },
    orderBy: { timestamp: "desc" },
    take: 100,
    select: { diffJson: true, timestamp: true, action: true },
  }));

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

// --- Helpers ---

/** Get or create an automation folder by name. Handles concurrent creation race via P2002 catch. */
async function getOrCreateAutomationFolder(companyId: number, name: string): Promise<number> {
  const existing = await withRetry(() => prisma.viewFolder.findFirst({
    where: { companyId, name, type: "AUTOMATION" },
    select: { id: true },
  }));
  if (existing) return existing.id;

  try {
    const created = await prisma.viewFolder.create({
      data: { companyId, name, type: "AUTOMATION" },
      select: { id: true },
    });
    return created.id;
  } catch (err: any) {
    // Race condition: another request created it first
    if (err?.code === "P2002") {
      const found = await withRetry(() => prisma.viewFolder.findFirst({
        where: { companyId, name, type: "AUTOMATION" },
        select: { id: true },
      }));
      if (found) return found.id;
    }
    throw err;
  }
}

// --- CRUD Actions ---

export async function getAutomationRules(opts?: { cursor?: number; limit?: number }) {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return { success: false, error: "Authentication required" };
    }

    // Authorization: require canViewAutomations flag
    if (!hasUserFlag(currentUser, "canViewAutomations")) {
      return { success: false, error: "Forbidden" };
    }

    // Rate limit reads
    if (await checkActionRateLimit(String(currentUser.id), RATE_LIMITS.automationRead)) {
      return { success: false, error: "Rate limit exceeded. Please try again later." };
    }

    // Clamp limit to [1, 500] to prevent unbounded queries
    const limit = Math.min(Math.max(opts?.limit ?? 500, 1), 500);
    const take = limit + 1; // Fetch one extra to determine hasMore

    // CRITICAL: Filter by companyId for multi-tenancy
    // Only select fields used by the AutomationsList component — no JOINs needed
    const rules = await withRetry(() => prisma.automationRule.findMany({
      where: { companyId: currentUser.companyId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        name: true,
        triggerType: true,
        triggerConfig: true,
        actionType: true,
        actionConfig: true,
        isActive: true,
        folderId: true,
        calendarEventId: true,
        meetingId: true,
        source: true,
        createdAt: true,
      },
      take,
      ...(opts?.cursor ? { skip: 1, cursor: { id: opts.cursor } } : {}),
    }));

    const hasMore = rules.length > limit;
    const data = hasMore ? rules.slice(0, limit) : rules;
    const nextCursor = hasMore ? data[data.length - 1].id ?? null : null;

    return { success: true, data, hasMore, nextCursor };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const errStack = error instanceof Error ? error.stack : undefined;
    log.error("Error fetching automation rules", { error: errMsg, stack: errStack });
    return { success: false, error: "Failed to fetch automation rules" };
  }
}

export async function createAutomationRule(data: {
  name: string;
  triggerType: string;
  triggerConfig: any;
  actionType: string;
  actionConfig: any;
  source?: string;
}) {
  try {
    // Get the current authenticated user from session
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return { success: false, error: "Authentication required" };
    }

    // Authorization: require canViewAutomations flag
    if (!hasUserFlag(currentUser, "canViewAutomations")) {
      return { success: false, error: "Forbidden" };
    }

    // Rate limit mutations
    if (await checkActionRateLimit(String(currentUser.id), RATE_LIMITS.automationMutate)) {
      return { success: false, error: "Rate limit exceeded. Please try again later." };
    }

    // Input validation
    const validationError = validateAutomationInput(data);
    if (validationError) {
      return { success: false, error: validationError };
    }
    data.name = data.name.trim();

    // SSRF check: validate webhook URLs at storage time (top-level + nested MULTI_ACTION)
    const webhookUrls = extractWebhookUrls(data.actionType, data.actionConfig);
    for (const wUrl of webhookUrls) {
      if (isPrivateUrl(wUrl)) {
        return { success: false, error: "Webhook URL targets a private/internal address" };
      }
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
      const folderNameMap: Record<string, string> = {
        TICKET_STATUS_CHANGE: "אוטומציות שירות",
        SLA_BREACH: "אוטומציות שירות",
        TASK_STATUS_CHANGE: "אוטומציות משימות",
        MULTI_EVENT_DURATION: "אוטומציות אירועים מרובים",
      };
      const folderName = folderNameMap[data.triggerType];
      if (folderName) {
        folderId = await getOrCreateAutomationFolder(currentUser.companyId, folderName);
      }
    }

    // Plan-based per-category limit + global safety cap (atomic transaction)
    const userTier = (currentUser as any).isPremium || "basic";
    const result = await checkCategoryLimitAndCreate(
      currentUser.companyId,
      userTier,
      data.triggerType,
      {
        name: data.name,
        triggerType: data.triggerType as any,
        triggerConfig: data.triggerConfig as any,
        actionType: data.actionType as any,
        actionConfig: data.actionConfig as any,
        folderId: folderId ?? null,
        createdBy: currentUser.id,
        companyId: currentUser.companyId,
        ...(data.source ? { source: data.source } : {}),
      },
    );

    if (!result.allowed) {
      return { success: false, error: result.error };
    }

    const rule = result.rule;

    // DISABLED Retroactive calculation by default as per user request (2025-01-24)
    // New automations should only apply to future events.
    /*
    try {
      if (rule.actionType === "CALCULATE_DURATION") {
        await applyRetroactiveAutomation(rule);
      }
    } catch (retroError) {
      log.error("Error applying retroactive automation", { error: String(retroError) });
    }
    */

    await invalidateFullCache(currentUser.companyId);
    revalidatePath("/automations");
    revalidatePath("/analytics");
    return { success: true, data: rule };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    log.error("Error creating automation rule", { error: errMsg, stack: error instanceof Error ? error.stack : undefined });
    return { success: false, error: `Failed to create automation rule: ${errMsg}` };
  }
}

async function applyRetroactiveAutomation(rule: any) {
  log.info("Applying retroactive automation for rule", { ruleId: rule.id });
  const triggerConfig = rule.triggerConfig as any;

  if (rule.triggerType === "TASK_STATUS_CHANGE") {
    const toStatus = triggerConfig.toStatus;
    const fromStatus = triggerConfig.fromStatus;

    const tasks = await withRetry(() => prisma.task.findMany({
      where: {
        ...(toStatus ? { status: toStatus } : {}),
        companyId: rule.companyId,
      },
      select: { id: true },
      take: 500,
    }));

    // Batch-fetch all audit logs for tasks in a single query (avoids N+1)
    const taskIds = tasks.map(t => t.id);
    const allTaskLogs = taskIds.length > 0 ? await withRetry(() => prisma.auditLog.findMany({
      where: { taskId: { in: taskIds }, action: "UPDATE", companyId: rule.companyId },
      orderBy: { timestamp: "desc" },
      take: 5000,
      select: { diffJson: true, timestamp: true, taskId: true, action: true },
    })) : [];
    const logsByTask = new Map<string, typeof allTaskLogs>();
    for (const log of allTaskLogs) {
      if (!log.taskId) continue;
      const existing = logsByTask.get(log.taskId) || [];
      existing.push(log);
      logsByTask.set(log.taskId, existing);
    }

    // P224: Collect updates, then batch in chunks of 100 (avoids N+1 sequential updates)
    const taskUpdates: { id: string; duration_status_change: string }[] = [];

    type TaskLog = (typeof allTaskLogs)[number];

    for (const task of tasks) {
      const logs = logsByTask.get(task.id) || [];

      let endLog: TaskLog | null = null;
      let startLog: TaskLog | null = null;

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

    const records = await withRetry(() => prisma.record.findMany({
      where: { tableId, companyId: rule.companyId },
      select: { id: true },
      take: 500,
    }));

    // Batch-fetch all audit logs for records in a single query (avoids N+1)
    const recordIds = records.map(r => r.id);
    const allRecordLogs = recordIds.length > 0 ? await withRetry(() => prisma.auditLog.findMany({
      where: { recordId: { in: recordIds }, action: { in: ["UPDATE", "CREATE"] }, companyId: rule.companyId },
      orderBy: { timestamp: "desc" },
      take: 5000,
      select: { diffJson: true, timestamp: true, recordId: true, action: true },
    })) : [];
    const logsByRecord = new Map<number, typeof allRecordLogs>();
    for (const log of allRecordLogs) {
      if (!log.recordId) continue;
      const existing = logsByRecord.get(log.recordId) || [];
      existing.push(log);
      logsByRecord.set(log.recordId, existing);
    }

    // P225: Collect creates, then batch with createMany (avoids N+1 sequential creates)
    const durationCreates: {
      companyId: number;
      automationRuleId: number;
      recordId: number;
      durationSeconds: number;
      durationString: string;
      fromValue: string;
      toValue: string;
    }[] = [];

    type RecordLog = (typeof allRecordLogs)[number];

    for (const record of records) {
      const logs = logsByRecord.get(record.id) || [];

      let endLog: RecordLog | null = null;
      let startLog: RecordLog | null = null;
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

    // Authorization: require canViewAutomations flag
    if (!hasUserFlag(currentUser, "canViewAutomations")) {
      return { success: false, error: "Forbidden" };
    }

    // ID validation
    const idError = validateId(id);
    if (idError) {
      return { success: false, error: idError };
    }

    // Rate limit mutations
    if (await checkActionRateLimit(String(currentUser.id), RATE_LIMITS.automationMutate)) {
      return { success: false, error: "Rate limit exceeded. Please try again later." };
    }

    // Input validation
    const validationError = validateAutomationInput(data);
    if (validationError) {
      return { success: false, error: validationError };
    }
    data.name = data.name.trim();

    // SSRF check: validate webhook URLs at storage time (top-level + nested MULTI_ACTION)
    const webhookUrls = extractWebhookUrls(data.actionType, data.actionConfig);
    for (const wUrl of webhookUrls) {
      if (isPrivateUrl(wUrl)) {
        return { success: false, error: "Webhook URL targets a private/internal address" };
      }
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
        triggerType: data.triggerType as any,
        triggerConfig: data.triggerConfig as any,
        actionType: data.actionType as any,
        actionConfig: data.actionConfig as any,
      },
      select: {
        id: true, name: true, triggerType: true, triggerConfig: true,
        actionType: true, actionConfig: true, isActive: true,
        folderId: true, calendarEventId: true, createdBy: true,
        createdAt: true, updatedAt: true,
      },
    });
    await invalidateFullCache(currentUser.companyId);
    revalidatePath("/automations");
    revalidatePath("/analytics");
    return { success: true, data: rule };
  } catch (error) {
    log.error("Error updating automation rule", { error: String(error) });
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

    // Authorization: require canViewAutomations flag
    if (!hasUserFlag(currentUser, "canViewAutomations")) {
      return { success: false, error: "Forbidden" };
    }

    // ID validation
    const idError = validateId(id);
    if (idError) {
      return { success: false, error: idError };
    }

    // Rate limit mutations
    if (await checkActionRateLimit(String(currentUser.id), RATE_LIMITS.automationMutate)) {
      return { success: false, error: "Rate limit exceeded. Please try again later." };
    }

    await prisma.automationRule.delete({
      where: { id, companyId: currentUser.companyId },
    });
    await invalidateFullCache(currentUser.companyId);
    revalidatePath("/automations");
    revalidatePath("/analytics");
    return { success: true };
  } catch (error) {
    log.error("Error deleting automation rule", { error: String(error) });
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

    // Authorization: require canViewAutomations flag
    if (!hasUserFlag(currentUser, "canViewAutomations")) {
      return { success: false, error: "Forbidden" };
    }

    // ID validation
    const idError = validateId(id);
    if (idError) {
      return { success: false, error: idError };
    }

    // Rate limit mutations
    if (await checkActionRateLimit(String(currentUser.id), RATE_LIMITS.automationMutate)) {
      return { success: false, error: "Rate limit exceeded. Please try again later." };
    }

    await prisma.automationRule.update({
      where: { id, companyId: currentUser.companyId },
      data: { isActive },
      select: { id: true },
    });
    await invalidateFullCache(currentUser.companyId);
    revalidatePath("/automations");
    revalidatePath("/analytics");
    return { success: true };
  } catch (error) {
    log.error("Error toggling automation rule", { error: String(error) });
    return { success: false, error: "Failed to toggle automation rule" };
  }
}

// --- Processor Logic ---

// Helper: compare a numeric value against a threshold using an operator string
function matchesOperator(val: number, operator: string, target: number): boolean {
  switch (operator) {
    case "gt": return val > target;
    case "lt": return val < target;
    case "gte": return val >= target;
    case "lte": return val <= target;
    case "eq": return val === target;
    case "neq": return val !== target;
    default: return false;
  }
}

// Pre-computed business hours state (compute once, reuse across all rules in a batch)
interface BusinessHoursState { day: number; timeInMinutes: number }

function computeBusinessHoursState(): BusinessHoursState {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(new Date());
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const day = dayMap[parts.find((p) => p.type === "weekday")!.value];
  const hour = Number(parts.find((p) => p.type === "hour")!.value);
  const minute = Number(parts.find((p) => p.type === "minute")!.value);
  return { day, timeInMinutes: hour * 60 + minute };
}

// Helper to check Business Hours (accepts optional pre-computed state to avoid repeated Intl calls)
function checkBusinessHours(config: any, state?: BusinessHoursState): boolean {
  if (!config.businessHours) return true; // No restriction

  const { days, start, end } = config.businessHours;
  const s = state ?? computeBusinessHoursState();

  // 1. Day Check
  if (Array.isArray(days) && days.length > 0) {
    if (!days.includes(s.day)) {
      return false;
    }
  }

  // 2. Time Check
  const [startH, startM] = (start || "00:00").split(":").map(Number);
  const [endH, endM] = (end || "23:59").split(":").map(Number);

  if (s.timeInMinutes < startH * 60 + startM || s.timeInMinutes > endH * 60 + endM) {
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
    log.error("processViewAutomations called without companyId");
    return;
  }

  log.info("Checking view automations", { tableId, taskId, companyId });
  try {
    const rules = await withRetry(() => prisma.automationRule.findMany({
      where: {
        isActive: true, // Only active rules
        triggerType: "VIEW_METRIC_THRESHOLD",
        companyId: companyId,
      },
      take: 200,
    }));

    log.debug("Found active view automation rules", { count: rules.length });

    // P70: Batch-fetch all views upfront to avoid N+1 queries
    const viewIds = new Set<number>();
    for (const rule of rules) {
      const tc = rule.triggerConfig as TriggerConfig;
      if (tc?.viewId) viewIds.add(Number(tc.viewId));
    }
    const views = viewIds.size > 0
      ? await withRetry(() => prisma.analyticsView.findMany({
          where: { id: { in: Array.from(viewIds) }, companyId },
        }))
      : [];
    const viewMap = new Map(views.map((v) => [v.id, v]));

    // Pre-compute business hours state ONCE for all rules
    const bizState = computeBusinessHoursState();

    // Pre-filter rules synchronously (business hours, viewId, context matching)
    const eligibleRules = rules.filter((rule) => {
      const triggerConfig = rule.triggerConfig as TriggerConfig;
      if (!checkBusinessHours(triggerConfig, bizState)) return false;
      if (!triggerConfig || !triggerConfig.viewId) {
        log.debug("Rule missing viewId in config", { ruleId: rule.id });
        return false;
      }
      const view = viewMap.get(Number(triggerConfig.viewId));
      if (!view) {
        log.debug("View not found", { viewId: triggerConfig.viewId });
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
        log.debug("Skipping rule, context does not match view config", {
          ruleId: rule.id, requestedTable: tableId, requestedTask: taskId, viewTable: viewConfig.tableId, viewModel: viewConfig.model,
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

          log.debug("Processing rule for view", { ruleId: rule.id, viewId });

          const cached = await getCachedStats(viewId, companyId ?? rule.companyId);
          if (!cached || !cached.stats || cached.stats.rawMetric === undefined) {
            log.debug("No valid metric data for view", { viewId });
            return;
          }

          const { stats } = cached;
          const currentVal = stats.rawMetric;
          const currentSnapshot = JSON.stringify(stats);
          const threshold = parseFloat(String(triggerConfig.threshold));

          const triggered = triggerConfig.operator
            ? matchesOperator(currentVal, triggerConfig.operator, threshold)
            : false;

          log.debug("Metric check result", { currentVal, operator: triggerConfig.operator, threshold, triggered });

          if (!triggered) {
            log.debug("Rule condition not met");
            return;
          }

          // --- Frequency Check ---
          const frequency = triggerConfig.frequency || "always";
          const lastRunAt = rule.lastRunAt ?? (triggerConfig.lastRunAt ? new Date(triggerConfig.lastRunAt) : null);
          let shouldRunFrequency = true;
          const now = new Date();

          if (frequency === "once" && lastRunAt) {
            shouldRunFrequency = false;
            log.debug("Skipping rule (frequency: once, already ran)", { ruleId: rule.id });
          } else if (frequency === "daily" && lastRunAt) {
            const diffHours = (now.getTime() - lastRunAt.getTime()) / (1000 * 60 * 60);
            if (diffHours < 24) {
              shouldRunFrequency = false;
              log.debug("Skipping rule (frequency: daily, too recent)", { ruleId: rule.id, hoursAgo: diffHours.toFixed(1) });
            }
          } else if (frequency === "weekly" && lastRunAt) {
            const diffDays = (now.getTime() - lastRunAt.getTime()) / (1000 * 60 * 60 * 24);
            if (diffDays < 7) {
              shouldRunFrequency = false;
              log.debug("Skipping rule (frequency: weekly, too recent)", { ruleId: rule.id, daysAgo: diffDays.toFixed(1) });
            }
          } else if (frequency === "always" && triggerConfig.lastDataSnapshot === currentSnapshot) {
            shouldRunFrequency = false;
            log.debug("Skipping rule (frequency: always, data unchanged)", { ruleId: rule.id });
          }

          if (!shouldRunFrequency) return;

          log.info("Rule triggered", { ruleId: rule.id, actionType: rule.actionType });

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
            log.error("Failed to execute actions for rule", { ruleId: rule.id, error: String(execErr) });
          }

          // Atomic conditional update using top-level lastRunAt column
          try {
            const nowDate = new Date();
            const updated = await prisma.automationRule.updateMany({
              where: {
                id: rule.id,
                companyId: rule.companyId,
                lastRunAt: lastRunAt ?? null, // CAS guard: only update if unchanged
              },
              data: {
                lastRunAt: nowDate,
                triggerConfig: {
                  ...triggerConfig,
                  lastDataSnapshot: currentSnapshot,
                },
              },
            });
            if (updated.count === 0) {
              log.warn("CAS conflict for rule, another worker already updated lastRunAt", { ruleId: rule.id });
            } else {
              log.info("Updated lastRunAt for rule", { ruleId: rule.id, actionSuccess });
            }
          } catch (updateErr) {
            log.error("Failed to update lastRunAt for rule", { ruleId: rule.id, error: String(updateErr) });
          }
        }),
      );

      for (let j = 0; j < results.length; j++) {
        if (results[j].status === "rejected") {
          totalFailures++;
          log.error("Error processing view rule", { ruleId: batch[j].id, error: String((results[j] as PromiseRejectedResult).reason) });
        }
      }
    }

    // Issue R fix: Signal failure to Inngest so it can retry if majority of rules failed
    if (totalFailures > 0 && totalFailures >= eligibleRules.length * 0.5) {
      throw new Error(`[Automations] ${totalFailures}/${eligibleRules.length} view automation rules failed — triggering Inngest retry`);
    }
  } catch (e) {
    log.error("Error processing view automations", { error: String(e) });
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
    // companyId is already passed and validated by the Inngest caller — no need
    // to re-fetch the task just to confirm it exists. If it was deleted between
    // the event send and job execution, the rules simply won't match anything.
    const rules = await withRetry(() => prisma.automationRule.findMany({
      where: {
        isActive: true,
        triggerType: "TASK_STATUS_CHANGE",
        companyId,
      },
      take: 200,
    }));

    // Pre-compute business hours state ONCE for all rules
    const bizState = computeBusinessHoursState();

    // Filter matching rules first (cheap CPU work)
    const matchingRules = rules.filter((rule) => {
      const triggerConfig = rule.triggerConfig as TriggerConfig;
      if (!checkBusinessHours(triggerConfig, bizState)) return false;
      if (triggerConfig.fromStatus && triggerConfig.fromStatus !== fromStatus) return false;
      if (triggerConfig.toStatus && triggerConfig.toStatus !== toStatus) return false;
      return true;
    });

    const totalProcessed = matchingRules.length;
    let totalFailures = 0;

    // Bounded concurrency to avoid DB pool exhaustion
    const CONCURRENCY = 5;
    for (let i = 0; i < matchingRules.length; i += CONCURRENCY) {
      const batch = matchingRules.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map((rule) => {
          const context = { taskId, taskTitle, fromStatus, toStatus, companyId };
          return executeRuleActions(rule, context);
        })
      );
      for (let j = 0; j < results.length; j++) {
        const r = results[j];
        if (r.status === "rejected") {
          totalFailures++;
          log.error("Error executing rule in processTaskStatusChange", { ruleId: batch[j].id, error: String(r.reason) });
        }
      }
    }

    if (totalProcessed > 0 && totalFailures >= totalProcessed * 0.5) {
      throw new Error(`[Automations] ${totalFailures}/${totalProcessed} task status rules failed — triggering Inngest retry`);
    }
  } catch (error) {
    log.error("Error processing task status automations", { error: String(error) });
    throw error; // Re-throw so Inngest sees the failure
  }
}

/** Shared helper: check finance sync rules for a table and enqueue Inngest jobs for new/changed rules. */
async function checkAndEnqueueFinanceSyncJobs(tableId: number, companyId: number, context: string) {
  const syncRules = await withRetry(() => prisma.financeSyncRule.findMany({
    where: { sourceType: "TABLE", sourceId: tableId, isActive: true, companyId },
    take: 200,
  }));

  if (syncRules.length === 0) return;

  log.info("Found sync rules, enqueuing sync jobs", { context, syncRuleCount: syncRules.length, tableId });

  // Batch-fetch existing jobs upfront to avoid N+1
  const ruleIds = syncRules.map((r) => r.id);
  const existingJobs = await withRetry(() => prisma.financeSyncJob.findMany({
    where: { syncRuleId: { in: ruleIds }, status: { in: ["QUEUED", "RUNNING"] }, companyId },
    select: { syncRuleId: true },
  }));
  const existingRuleIds = new Set(existingJobs.map((j) => j.syncRuleId));

  const newRules = syncRules.filter((r) => !existingRuleIds.has(r.id));
  if (newRules.length === 0) return;

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
    log.error("Failed to batch-enqueue sync jobs", { jobCount: jobs.length, context, error: String(e) });
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
    const record = await withRetry(() => prisma.record.findFirst({ where: { id: recordId, companyId }, select: { data: true, companyId: true } }));

    if (!record) {
      log.info("Record not found, skipping NEW_RECORD automations", { recordId });
      return;
    }

    const rules = await withRetry(() => prisma.automationRule.findMany({
      where: {
        isActive: true,
        triggerType: "NEW_RECORD",
        companyId: record.companyId, // Filter by company
      },
      take: 200,
    }));

    const recordData = record.data as any;

    // Pre-compute business hours state ONCE for all rules
    const bizState = computeBusinessHoursState();

    // Pre-filter rules synchronously (cheap CPU checks)
    const eligibleRules = rules.filter((rule) => {
      const triggerConfig = rule.triggerConfig as TriggerConfig;
      if (!checkBusinessHours(triggerConfig, bizState)) return false;
      if (triggerConfig.tableId && parseInt(String(triggerConfig.tableId)) !== tableId) return false;

      // Condition Check (Optional)
      if (triggerConfig.conditionColumnId) {
        const colId = triggerConfig.conditionColumnId;
        const recordVal = recordData[colId];
        const targetVal = triggerConfig.conditionValue;

        if (recordVal === undefined || recordVal === null) return false;

        if (triggerConfig.operator) {
          const valNum = Number(recordVal);
          const targetNum = Number(targetVal);
          if (isNaN(valNum) || isNaN(targetNum)) return false;
          if (!matchesOperator(valNum, triggerConfig.operator, targetNum)) return false;
        } else {
          if (targetVal !== undefined && String(recordVal) !== String(targetVal)) return false;
        }
      }
      return true;
    });

    // Execute in parallel batches
    let totalFailures = 0;
    const totalProcessed = eligibleRules.length;
    const RULE_CONCURRENCY = 5;
    for (let i = 0; i < eligibleRules.length; i += RULE_CONCURRENCY) {
      const batch = eligibleRules.slice(i, i + RULE_CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map((rule) => executeRuleActions(rule, { recordData, tableId, tableName, recordId }))
      );
      for (let j = 0; j < results.length; j++) {
        if (results[j].status === "rejected") {
          totalFailures++;
          log.error("Error executing rule in processNewRecordTrigger", {
            ruleId: batch[j].id, error: String((results[j] as PromiseRejectedResult).reason),
          });
        }
      }
    }

    if (totalProcessed > 0 && totalFailures >= totalProcessed * 0.5) {
      throw new Error(`[Automations] ${totalFailures}/${totalProcessed} new record rules failed — triggering Inngest retry`);
    }

    // --- FINANCE SYNC ---
    try {
      await checkAndEnqueueFinanceSyncJobs(tableId, record.companyId, "New record");
    } catch (err) {
      log.error("Error checking finance sync rules", { error: String(err) });
    }
  } catch (error) {
    log.error("Error processing new record automations", { error: String(error) });
    throw error; // Re-throw so Inngest sees the failure
  }
}

export async function processRecordUpdate(
  tableId: number,
  recordId: number,
  oldData: any,
  newData: any,
  companyId: number, // SECURITY: Required for tenant scoping (Issue D)
  passedTableName?: string, // Optional: avoids extra DB query if caller already knows the name
) {
  log.info("Processing record update", { tableId, recordId });
  try {
    // companyId is already passed and validated by the Inngest caller — no need
    // to re-fetch the record just to confirm it exists. oldData/newData are
    // already provided by the caller, so record.data is not needed either.
    const rules = await withRetry(() => prisma.automationRule.findMany({
      where: {
        isActive: true,
        triggerType: "RECORD_FIELD_CHANGE",
        companyId,
      },
      take: 200,
    }));

    // Use passed table name to avoid an extra DB query when caller already has it
    const tableName = passedTableName ?? (await withRetry(() => prisma.tableMeta.findFirst({
      where: { id: tableId, companyId },
      select: { name: true },
    })))?.name ?? "Unknown Table";

    // Pre-compute business hours state ONCE for all rules
    const bizState = computeBusinessHoursState();

    // Pre-filter rules synchronously (cheap CPU checks)
    const eligibleRules = rules.filter((rule) => {
      const triggerConfig = rule.triggerConfig as TriggerConfig;
      if (!checkBusinessHours(triggerConfig, bizState)) return false;
      if (triggerConfig.tableId && Number(triggerConfig.tableId) !== tableId) return false;

      const columnId = triggerConfig.columnId;
      if (!columnId) return false;

      const oldValue = oldData[columnId];
      const newValue = newData[columnId];
      if (newValue === undefined || oldValue === newValue) return false;

      // Numeric/Score Operator Check
      if (triggerConfig.operator && triggerConfig.toValue !== undefined) {
        const val = Number(newValue);
        const target = Number(triggerConfig.toValue);
        if (isNaN(val) || isNaN(target)) return false;
        if (!matchesOperator(val, triggerConfig.operator, target)) return false;
      } else {
        if (triggerConfig.fromValue && String(oldValue) !== String(triggerConfig.fromValue)) return false;
        if (triggerConfig.toValue && String(newValue) !== String(triggerConfig.toValue)) return false;
      }
      return true;
    });

    // Execute in parallel batches
    let totalFailures = 0;
    const totalProcessed = eligibleRules.length;
    const RULE_CONCURRENCY = 5;
    for (let i = 0; i < eligibleRules.length; i += RULE_CONCURRENCY) {
      const batch = eligibleRules.slice(i, i + RULE_CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map((rule) => executeRuleActions(rule, {
          recordData: newData, oldRecordData: oldData, tableId, tableName, recordId,
        }))
      );
      for (let j = 0; j < results.length; j++) {
        if (results[j].status === "rejected") {
          totalFailures++;
          log.error("Error executing rule in processRecordUpdate", {
            ruleId: batch[j].id, error: String((results[j] as PromiseRejectedResult).reason),
          });
        }
      }
    }

    if (totalProcessed > 0 && totalFailures >= totalProcessed * 0.5) {
      throw new Error(`[Automations] ${totalFailures}/${totalProcessed} record update rules failed — triggering Inngest retry`);
    }

    // Offload multi-event automations to Inngest background job
    // These involve recursive relation lookups and CPU-intensive event chain matching
    try {
      await inngest.send({
        id: `multi-event-${companyId}-${recordId}-${Math.floor(Date.now() / 60000)}`,
        name: "automation/multi-event-duration",
        data: { tableId, recordId, companyId },
      });
    } catch (err) {
      log.error("Failed to enqueue multi-event job", { error: String(err) });
    }

    // --- FINANCE SYNC (ON UPDATE) ---
    try {
      await checkAndEnqueueFinanceSyncJobs(tableId, companyId, "Record update");
    } catch (err) {
      log.error("Error triggering sync on update", { error: String(err) });
    }
  } catch (error) {
    log.error("Error processing record update automations", { error: String(error) });
    throw error; // Re-throw so Inngest sees the failure
  }
}

export async function getViewAutomations(viewId: number) {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };

    if (!hasUserFlag(user, "canViewAutomations")) {
      return { success: false, error: "Forbidden" };
    }
    if (await checkActionRateLimit(String(user.id), RATE_LIMITS.automationRead)) {
      return { success: false, error: "Rate limit exceeded. Please try again later." };
    }
    const idErr = validateId(viewId);
    if (idErr) {
      return { success: false, error: idErr };
    }

    // Filter by viewId in DB. triggerConfig.viewId may be stored as number or string,
    // so match both representations to avoid type mismatch.
    const rules = await withRetry(() => prisma.automationRule.findMany({
      where: {
        triggerType: "VIEW_METRIC_THRESHOLD",
        companyId: user.companyId,
        OR: [
          { triggerConfig: { path: ["viewId"], equals: Number(viewId) } },
          { triggerConfig: { path: ["viewId"], equals: String(viewId) } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }));

    return { success: true, data: rules };
  } catch (error) {
    log.error("Error fetching view automations", { error: String(error) });
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
      log.info("No auth or companyId found for analytics actions");
      return { success: false, error: "Unauthorized", count: 0 };
    }

    if (!hasUserFlag(currentUser, "canViewAutomations")) {
      return { success: false, error: "Forbidden", count: 0 };
    }
    if (await checkActionRateLimit(String(currentUser.id), RATE_LIMITS.automationRead)) {
      return { success: false, error: "Rate limit exceeded", count: 0 };
    }

    const companyId = currentUser.companyId;

    // Get all VIEW_METRIC_THRESHOLD rules for this company
    const rules = await withRetry(() => prisma.automationRule.findMany({
      where: {
        companyId: companyId,
        triggerType: "VIEW_METRIC_THRESHOLD",
      },
      select: {
        actionType: true,
        actionConfig: true,
      },
      take: 500,
    }));

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
    log.error("Error counting analytics automation actions", { error: String(error) });
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
  triggerDate?: Date;
}): Promise<boolean> {
  const {
    companyId,
    listSlug,
    name,
    email,
    phone,
    sourceType,
    sourceId,
    sourceTableId,
    triggerDate,
  } = params;

  if (!email && !phone) return false;

  try {
    // 1. Find or create the list (P2002-safe: concurrent automations may race on the same slug)
    let list = await withRetry(() => prisma.nurtureList.findUnique({
      where: {
        companyId_slug: {
          companyId,
          slug: listSlug,
        },
      },
    }));

    if (!list) {
      try {
        list = await prisma.nurtureList.create({
          data: {
            companyId,
            slug: listSlug,
            name:
              listSlug.charAt(0).toUpperCase() +
              listSlug.slice(1).replace("-", " "),
          },
        });
      } catch (createErr: any) {
        if (createErr?.code === "P2002") {
          // Race condition: another automation created the list first — re-fetch
          list = await withRetry(() => prisma.nurtureList.findUnique({
            where: {
              companyId_slug: {
                companyId,
                slug: listSlug,
              },
            },
          }));
          if (!list) throw createErr; // Should not happen, but fail loudly
        } else {
          throw createErr;
        }
      }
    }

    // 2. Check if subscriber exists (by email or phone)
    // Issue U fix: Catch P2002 unique constraint violation to handle concurrent inserts
    const conditions: any[] = [];
    if (email) conditions.push({ email });
    if (phone) conditions.push({ phone });

    const existing = await withRetry(() => prisma.nurtureSubscriber.findFirst({
      where: {
        nurtureListId: list.id,
        OR: conditions,
      },
    }));

    if (!existing) {
      try {
        const { normalizeToE164 } = await import("@/lib/utils/phone");
        const normalizedPhone = phone ? normalizeToE164(phone) : null;
        await prisma.nurtureSubscriber.create({
          data: {
            nurtureListId: list.id,
            name,
            email,
            phone: normalizedPhone || phone,
            phoneActive: !!normalizedPhone,
            sourceType,
            sourceId,
            sourceTableId,
            triggerDate,
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
    log.error("Error adding to nurture list", { error: String(error) });
    return false;
  }
}

// P102: companyId is now required to prevent cross-company rule leakage
export async function processTimeBasedAutomations(companyId: number) {
  if (!companyId) {
    log.error("processTimeBasedAutomations called without companyId, skipping");
    return;
  }
  log.info("Checking time-based automations", { companyId });
  try {
    const rules = await withRetry(() => prisma.automationRule.findMany({
      where: {
        isActive: true,
        triggerType: "TIME_SINCE_CREATION",
        companyId,
      },
      take: 200,
    }));

    log.info("Found active time-based rules", { count: rules.length, companyId });

    // Filter rules that pass basic config validation and business hours check upfront
    const bizState = computeBusinessHoursState();
    const validRules = rules.filter((rule) => {
      const config = rule.triggerConfig as any;
      if (!config.tableId || !config.timeValue || !config.timeUnit) return false;
      if (!checkBusinessHours(config, bizState)) return false;
      return true;
    });

    if (validRules.length === 0) return;

    // Batch-fetch all table names upfront to avoid N+1
    const tableIds = [...new Set(validRules.map((r) => Number((r.triggerConfig as any).tableId)))];
    const tables = await withRetry(() => prisma.tableMeta.findMany({
      where: { id: { in: tableIds }, companyId },
      select: { id: true, name: true },
    }));
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
          log.error("Error processing time-based rule", { ruleId: batch[j].id, ruleName: batch[j].name, error: String(result.reason) });
        }
      }
    }

    // Signal failure to Inngest so it can retry if majority of rules failed
    if (totalFailures > 0 && totalFailures >= validRules.length * 0.5) {
      throw new Error(`[Automations] ${totalFailures}/${validRules.length} time-based rules failed — triggering Inngest retry`);
    }
  } catch (error) {
    log.error("Error processing time-based automations", { error: String(error) });
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

  // Find records created before cutoffTime AND not yet processed by this rule.
  // Uses raw SQL NOT EXISTS for a more efficient hash anti-join plan vs Prisma's generated subquery.
  const records = await withRetry(() => prisma.$queryRaw<Array<{ id: number; data: any }>>`
    SELECT r.id, r.data
    FROM "Record" r
    WHERE r."tableId" = ${tableId}
      AND r."companyId" = ${rule.companyId}
      AND r."createdAt" <= ${cutoffTime}
      AND r."createdAt" >= ${rule.createdAt}
      AND NOT EXISTS (
        SELECT 1 FROM "AutomationLog" al
        WHERE al."recordId" = r.id AND al."automationRuleId" = ${rule.id}
      )
    ORDER BY r."createdAt" ASC
    LIMIT 200
  `);

  log.info("Found potential records for rule", { ruleName: rule.name, count: records.length });

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
  const logsToCreate: { automationRuleId: number; recordId: number; companyId: number }[] = [];

  for (let i = 0; i < matchingRecords.length; i += RECORD_CONCURRENCY) {
    const batch = matchingRecords.slice(i, i + RECORD_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (record) => {
        log.debug("Triggering rule for record", { ruleName: rule.name, recordId: record.id });
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
        logsToCreate.push({ automationRuleId: rule.id, recordId: result.value, companyId: rule.companyId });
      } else {
        log.error("Error executing actions for rule", { ruleId: rule.id, error: String(result.reason) });
      }
    }
  }

  // Batch create all automation logs at once
  // Issue S fix: Re-throw so Inngest retries — without logs, records would be re-executed
  if (logsToCreate.length > 0) {
    try {
      await prisma.automationLog.createMany({ data: logsToCreate, skipDuplicates: true });
    } catch (logError) {
      log.error("Error batch-creating automation logs", { ruleId: rule.id, error: String(logError) });
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
  log.info("Processing direct dial trigger", { tableId, recordId });

  try {
    // Find all active DIRECT_DIAL automation rules for this specific table.
    // triggerConfig.tableId may be stored as number or string, so match both.
    const matchingRules = await withRetry(() => prisma.automationRule.findMany({
      where: {
        companyId,
        triggerType: "DIRECT_DIAL",
        isActive: true,
        OR: [
          { triggerConfig: { path: ["tableId"], equals: tableId } },
          { triggerConfig: { path: ["tableId"], equals: String(tableId) } },
        ],
      },
      take: 200,
    }));

    if (matchingRules.length === 0) {
      log.info("No DIRECT_DIAL rules found for table", { tableId });
      return;
    }

    // Fetch record and table name in parallel (independent queries)
    const [record, table] = await Promise.all([
      withRetry(() => prisma.record.findFirst({
        where: { id: recordId, companyId },
        select: { data: true, createdAt: true },
      })),
      withRetry(() => prisma.tableMeta.findFirst({
        where: { id: tableId, companyId },
        select: { name: true },
      })),
    ]);

    if (!record) {
      log.info("Record not found", { recordId });
      return;
    }

    const recordData = record.data as Record<string, unknown>;

    // Execute in parallel batches
    let totalFailures = 0;
    const totalProcessed = matchingRules.length;
    const RULE_CONCURRENCY = 5;
    for (let i = 0; i < matchingRules.length; i += RULE_CONCURRENCY) {
      const batch = matchingRules.slice(i, i + RULE_CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map((rule) => executeRuleActions(rule, {
          recordData, tableId, recordId, tableName: table?.name,
          previousDialedAt, recordCreatedAt: record.createdAt.toISOString(),
        }))
      );
      for (let j = 0; j < results.length; j++) {
        if (results[j].status === "rejected") {
          totalFailures++;
          log.error("Error executing DIRECT_DIAL rule", {
            ruleId: batch[j].id, ruleName: batch[j].name,
            error: String((results[j] as PromiseRejectedResult).reason),
          });
        }
      }
    }

    if (totalProcessed > 0 && totalFailures >= totalProcessed * 0.5) {
      throw new Error(`[Automations] ${totalFailures}/${totalProcessed} direct dial rules failed — triggering Inngest retry`);
    }
  } catch (error) {
    log.error("Error processing direct dial automations", { error: String(error) });
    throw error; // Re-throw so Inngest sees the failure
  }
}

// --- Automation Category Usage Query ---
export async function getAutomationCategoryUsage() {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const currentUser = await getCurrentUser();
    if (!currentUser) return { success: false, error: "Authentication required" };

    const { getAutomationCategoryLimit, getTriggerTypesForCategory } = await import("@/lib/plan-limits");
    const { countCategoryAutomations } = await import("@/lib/automation-limit-check");

    const userTier = (currentUser as any).isPremium || "basic";

    const [generalCount, meetingCount, eventCount] = await Promise.all([
      countCategoryAutomations(currentUser.companyId, "general"),
      countCategoryAutomations(currentUser.companyId, "meeting"),
      countCategoryAutomations(currentUser.companyId, "event"),
    ]);

    const limit = getAutomationCategoryLimit(userTier);

    return {
      success: true,
      data: {
        userPlan: userTier,
        general: { count: generalCount, limit },
        meeting: { count: meetingCount, limit },
        event: { count: eventCount, limit },
      },
    };
  } catch (error) {
    log.error("Error fetching automation category usage", { error: String(error) });
    return { success: false, error: "Failed to fetch usage" };
  }
}

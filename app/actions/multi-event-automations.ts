import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { withRetry } from "@/lib/db-retry";
import { createNotificationForCompany } from "@/lib/notifications-internal";
import { isPrivateUrl } from "@/lib/security/ssrf";
import { validateUserInCompany } from "@/lib/company-validation";
import { createLogger } from "@/lib/logger";

const log = createLogger("MultiEventAuto");

const MAX_VISITED_RECORDS = 500;
const MAX_AUDIT_LOGS = 5000;

// פונקציית עזר לחילוץ מזהים מכל סוג של ערך
function extractIdsFromValue(val: any): number[] {
  const ids = new Set<number>();

  if (val === null || val === undefined) return [];

  if (typeof val === "number") {
    ids.add(val);
  } else if (
    typeof val === "string" &&
    !isNaN(Number(val)) &&
    val.trim() !== ""
  ) {
    ids.add(Number(val));
  } else if (Array.isArray(val)) {
    val.forEach((item) => {
      const extracted = extractIdsFromValue(item);
      extracted.forEach((id) => ids.add(id));
    });
  } else if (typeof val === "object" && val !== null) {
    if ("id" in val) {
      const extracted = extractIdsFromValue(val.id);
      extracted.forEach((id) => ids.add(id));
    }
  }

  return Array.from(ids);
}

// Fix D: BFS batch fetch — O(depth) queries instead of O(N) individual queries
// Perf: Cache table schemas across BFS levels to avoid repeated JOINs on TableMeta
async function getRelatedRecordIdsBFS(rootId: number, companyId: number): Promise<Set<number>> {
  const visited = new Set<number>();
  let currentLevel = [rootId];
  const schemaCache = new Map<number, any[]>(); // tableId → schemaJson

  for (let depth = 0; depth < 4 && currentLevel.length > 0; depth++) {
    if (visited.size >= MAX_VISITED_RECORDS) break;

    const idsToFetch = currentLevel
      .filter((id) => !visited.has(id))
      .slice(0, MAX_VISITED_RECORDS - visited.size);

    if (idsToFetch.length === 0) break;

    idsToFetch.forEach((id) => visited.add(id));

    try {
      // Fetch records without JOIN — get tableId instead of nested table object
      const records = await withRetry(() => prisma.record.findMany({
        where: { id: { in: idsToFetch }, companyId },
        select: {
          id: true,
          data: true,
          tableId: true,
        },
      }));

      // Batch-fetch any unknown table schemas (avoids repeated JOINs)
      const unknownTableIds = [...new Set(records.map(r => r.tableId))]
        .filter(id => !schemaCache.has(id));
      if (unknownTableIds.length > 0) {
        const tables = await withRetry(() => prisma.tableMeta.findMany({
          where: { id: { in: unknownTableIds }, companyId },
          select: { id: true, schemaJson: true },
        }));
        for (const t of tables) {
          schemaCache.set(t.id, t.schemaJson as any[]);
        }
      }

      // Use Set to deduplicate nextLevel IDs
      const nextLevelSet = new Set<number>();
      for (const record of records) {
        const schema = schemaCache.get(record.tableId);
        if (!schema || !Array.isArray(schema)) continue;
        const recordData = record.data as any;

        for (const field of schema) {
          if (field.type === "relation" && recordData[field.name]) {
            const linkedIds = extractIdsFromValue(recordData[field.name]);
            linkedIds.forEach((id) => {
              if (!visited.has(id)) nextLevelSet.add(id);
            });
          }
        }
      }
      currentLevel = Array.from(nextLevelSet);
    } catch (err) {
      log.error("Error in BFS lookup", { depth, error: String(err) });
      break;
    }
  }

  return visited;
}

/**
 * חישוב ביצועים - משך זמן בין אירועים מרובים
 */
// Pre-fetched shared data to avoid redundant queries across rules
// Issue P: allLogs removed from shared data to stay under Inngest's 4MB step output limit.
// Each per-rule step re-fetches its own filtered logs using targetRecordIds + relevantColumns.
interface SharedQueryData {
  targetRecordIds: Set<number>;
  allLogs: Array<any>;
  mainRecord: { createdAt: Date | string; data: any } | null;
}

// Lightweight shared data that crosses Inngest step boundaries (no allLogs)
interface StepSharedData {
  targetRecordIds: number[];
  mainRecord: { createdAt: Date | string; data: any } | null;
  relevantColumns: string[];
  companyId: number;
}

// Lightweight rule snapshot passed through step boundary to avoid per-rule DB re-fetch (Issue R)
interface RuleSnapshot {
  id: number;
  name: string;
  actionType: string;
  actionConfig: any;
  companyId: number;
  triggerConfig: any;
}

export async function calculateMultiEventDuration(
  tableId: number,
  recordId: number,
  eventChain: Array<{
    eventName: string;
    columnId: string;
    value: string;
    tableId?: string;
  }>,
  automationRuleId: number,
  oldData: any,
  companyId: number,
  shared?: SharedQueryData,
  ruleSnapshot?: RuleSnapshot,
) {
  log.info("Starting calculation for record", { recordId });

  try {
    // Issue R: Use pre-fetched rule snapshot if available, otherwise fetch from DB
    const rule = ruleSnapshot ?? await withRetry(() => prisma.automationRule.findFirst({
      where: { id: automationRuleId, companyId },
    }));

    // Issue H: Use shared data if provided, otherwise compute (backwards compatible)
    const resolvedCompanyId = companyId || rule?.companyId;
    if (!resolvedCompanyId && !shared?.targetRecordIds) {
      log.error("No companyId available for BFS traversal, skipping rule", { automationRuleId });
      return { result: null, pendingActions: [] };
    }
    const targetRecordIds = shared?.targetRecordIds
      ?? await getRelatedRecordIdsBFS(recordId, resolvedCompanyId!);

    const mainRecord = shared?.mainRecord !== undefined
      ? shared.mainRecord
      : await withRetry(() => prisma.record.findFirst({
          where: { id: recordId, companyId },
          select: { createdAt: true, data: true },
        }));

    // Issue F: Log only the count, not the full ID list
    log.debug("Looking for logs in related records", { count: targetRecordIds.size });

    // Issue O-2: Sort DESC to get the most recent logs, then reverse for chronological order.
    // This ensures that when truncated at MAX_AUDIT_LOGS, we keep the most relevant (recent) logs.
    let allLogs: Array<any>;
    if (shared?.allLogs) {
      allLogs = shared.allLogs;
    } else {
      const rawLogs = await withRetry(() => prisma.auditLog.findMany({
        where: {
          recordId: { in: Array.from(targetRecordIds) },
          action: { in: ["UPDATE", "CREATE"] },
          companyId: resolvedCompanyId,
        },
        orderBy: { timestamp: "desc" },
        take: MAX_AUDIT_LOGS,
        select: { id: true, recordId: true, action: true, diffJson: true, timestamp: true },
      }));
      rawLogs.reverse();
      allLogs = rawLogs;
    }

    log.debug("Found logs combined", { count: allLogs.length });

    // BUG 6 FIX: Batch-load all table names upfront instead of N+1 queries
    const tableIds = [
      tableId,
      ...eventChain.map((e) => (e.tableId ? Number(e.tableId) : tableId)).filter(Boolean),
    ];
    const uniqueTableIds = [...new Set(tableIds)];
    const tables = await withRetry(() => prisma.tableMeta.findMany({
      where: { id: { in: uniqueTableIds }, companyId },
      select: { id: true, name: true },
    }));
    const tableNameMap = new Map<number, string>();
    tables.forEach((t) => tableNameMap.set(t.id, t.name));
    const getTableName = (id: number) => tableNameMap.get(id) || "Unknown Table";

    // BUG 7 FIX: Pre-index logs by columnId for O(1) lookup
    const logsByColumn = new Map<string, typeof allLogs>();
    for (const log of allLogs) {
      const logData = log.diffJson as any;
      if (!logData || typeof logData !== "object") continue;
      for (const key of Object.keys(logData)) {
        if (!logsByColumn.has(key)) {
          logsByColumn.set(key, []);
        }
        logsByColumn.get(key)!.push(log);
      }
    }

    // 3. חיפוש האירועים בשרשרת
    const eventTimestamps: Array<{
      eventName: string;
      timestamp: Date;
      columnId: string;
      value: string;
      tableName: string;
    }> = [];

    let eventIndex = 0;
    for (const event of eventChain) {
      let found = false;
      const targetValue = String(event.value).trim().toLowerCase();

      const eventTableId = event.tableId ? Number(event.tableId) : tableId;
      const tableName = getTableName(eventTableId);

      // BUG 7 FIX: Use pre-indexed logs instead of scanning all logs
      const relevantLogs = logsByColumn.get(event.columnId) || [];
      for (const log of relevantLogs) {
        const logData = log.diffJson as any;
        const logValue = String(logData[event.columnId]).trim().toLowerCase();

        if (logValue === targetValue) {
          eventTimestamps.push({
            eventName: event.eventName,
            timestamp: log.timestamp,
            columnId: event.columnId,
            value: event.value,
            tableName: tableName,
          });
          found = true;
          log.debug("Found event match", { eventName: event.eventName, timestamp: String(log.timestamp), recordId: log.recordId });
          break;
        }
      }

      // אם זה האירוע הראשון ולא מצאנו בלוגים, נבדוק אם זה המצב הקיים ב-oldData
      if (
        !found &&
        eventIndex === 0 &&
        eventTableId === tableId &&
        oldData &&
        mainRecord
      ) {
        const existingValue = oldData[event.columnId];
        if (
          existingValue !== undefined &&
          String(existingValue).trim().toLowerCase() === targetValue
        ) {
          log.debug("Event matches previous state, using record creation time", { eventName: event.eventName });
          found = true;
          eventTimestamps.push({
            eventName: event.eventName,
            timestamp: new Date(mainRecord.createdAt),
            columnId: event.columnId,
            value: event.value,
            tableName: tableName,
          });
        }
      }

      if (!found) {
        log.debug("Event not found", { eventName: event.eventName, columnId: event.columnId, targetValue });
        // Issue J: Return consistent shape instead of bare null to prevent silent action loss
        return { result: null, pendingActions: [] };
      }
      eventIndex++;
    }

    // 4. חישוב זמנים
    const deltas: Array<{
      from: string;
      to: string;
      durationSeconds: number;
      durationString: string;
    }> = [];

    for (let i = 0; i < eventTimestamps.length - 1; i++) {
      const currentEvent = eventTimestamps[i];
      const nextEvent = eventTimestamps[i + 1];

      const diffMs =
        new Date(nextEvent.timestamp).getTime() -
        new Date(currentEvent.timestamp).getTime();
      let diffSeconds = Math.floor(diffMs / 1000);
      if (diffSeconds < 0) {
        log.warn("Negative duration detected, clamping to 0", { diffSeconds, from: currentEvent.eventName, to: nextEvent.eventName });
        diffSeconds = 0;
      }

      const diffMinutes = Math.floor(diffSeconds / 60);
      const diffHours = Math.floor(diffMinutes / 60);
      const diffDays = Math.floor(diffHours / 24);
      const remainingHours = diffHours % 24;
      const remainingMinutes = diffMinutes % 60;
      const remainingSeconds = diffSeconds % 60;

      const durationString = `${diffDays} ימים ${remainingHours} שעות ${remainingMinutes} דקות ${remainingSeconds} שניות`;

      deltas.push({
        from: currentEvent.eventName,
        to: nextEvent.eventName,
        durationSeconds: diffSeconds,
        durationString,
      });
    }

    // 5. סיכום ושמירה
    const totalDurationSeconds = deltas.reduce(
      (sum, delta) => sum + delta.durationSeconds,
      0,
    );

    const totalMinutes = Math.floor(totalDurationSeconds / 60);
    const totalHours = Math.floor(totalMinutes / 60);
    const totalDays = Math.floor(totalHours / 24);
    const totalRemainingHours = totalHours % 24;
    const totalRemainingMinutes = totalMinutes % 60;
    const totalRemainingSeconds = totalDurationSeconds % 60;

    const totalDurationString = `${totalDays} ימים ${totalRemainingHours} שעות ${totalRemainingMinutes} דקות ${totalRemainingSeconds} שניות`;

    const weightedScore =
      deltas.length > 0 ? totalDurationSeconds / deltas.length : 0;

    // Issue S + X: Dedup guard — prevent duplicate rows on Inngest step retry.
    // Check if a duration record was already created for this rule+record in the last 300s.
    // Uses composite index @@index([automationRuleId, recordId, createdAt(sort: Desc)]).
    const existingDuration = await withRetry(() => prisma.multiEventDuration.findFirst({
      where: {
        automationRuleId,
        recordId,
        companyId,
        createdAt: { gte: new Date(Date.now() - 300_000) },
      },
      select: { id: true },
    }));

    if (existingDuration) {
      // Issue T: Warn that actions from the original attempt may have been lost
      log.warn("Dedup: duration already exists, skipping create", { durationId: existingDuration.id, automationRuleId, recordId });
      return { result: existingDuration, pendingActions: [] };
    }

    let result;
    try {
      result = await prisma.multiEventDuration.create({
        data: {
          companyId,
          automationRuleId,
          recordId,
          eventChain: eventTimestamps,
          eventDeltas: deltas,
          totalDurationSeconds,
          totalDurationString,
          weightedScore,
        },
      });
    } catch (createErr) {
      if (createErr instanceof Prisma.PrismaClientKnownRequestError && createErr.code === "P2002") {
        log.warn("P2002 race: duplicate, updating instead", { automationRuleId, recordId });
        result = await prisma.multiEventDuration.updateMany({
          where: { automationRuleId, recordId, companyId },
          data: {
            eventChain: eventTimestamps,
            eventDeltas: deltas,
            totalDurationSeconds,
            totalDurationString,
            weightedScore,
          },
        });
        return { result, pendingActions: [] };
      }
      throw createErr;
    }

    log.info("Successfully saved duration result", { resultId: result.id, duration: totalDurationString });

    // 6. ביצוע פעולה (Action) לפי סוג הכלל
    const pendingActions: Array<{ type: string; config: any; contextData: any; ruleSnapshot: any; companyId: number; delay: number }> = [];

    if (rule) {
      const companyId = rule.companyId;
      const recordData = mainRecord?.data || {};

      const enrichedData = {
        ...(typeof recordData === "object" ? recordData : {}),
        durationString: totalDurationString,
        durationSeconds: totalDurationSeconds,
        weightedScore: weightedScore,
      };

      log.info("Executing action", { actionType: rule.actionType });

      const executeSingleAction = async (
        type: string,
        config: any,
        contextData: any,
      ) => {
        try {
          if (type === "SEND_WHATSAPP") {
            // Fix A: If delay configured, defer to Inngest step.sleep layer
            if (config.delay) {
              pendingActions.push({
                type,
                config,
                contextData,
                ruleSnapshot: { ...rule, actionConfig: config },
                companyId,
                delay: Number(config.delay),
              });
              log.info("WhatsApp action deferred with delay", { delay: config.delay });
              return;
            }

            // Resolve phone and content, then dispatch to Inngest
            const phoneColumnId = config.phoneColumnId;
            let phone = "";
            if (phoneColumnId?.startsWith("manual:")) {
              phone = phoneColumnId.replace("manual:", "");
            } else if (phoneColumnId) {
              phone = contextData[phoneColumnId] || "";
            }
            let waContent = config.content || "";
            for (const key in contextData) {
              waContent = waContent.split(`{${key}}`).join(String(contextData[key] || ""));
            }
            if (phone) {
              const { inngest } = await import("@/lib/inngest/client");
              try {
                await inngest.send({
                  id: `wa-multi-${companyId}-${phone}-${rule.id}-${Math.floor(Date.now() / 5000)}`,
                  name: "automation/send-whatsapp",
                  data: {
                    companyId,
                    phone: String(phone),
                    content: waContent,
                    messageType: config.messageType,
                    mediaFileId: config.mediaFileId,
                  },
                });
              } catch (err) {
                log.error("Failed to enqueue WhatsApp job", { error: String(err) });
              }
            } else {
              log.error("WhatsApp: No phone resolved", { phoneColumnId });
            }
          } else if (type === "WEBHOOK") {
            const webhookUrl = config.webhookUrl || config.url;
            if (webhookUrl) {
              if (isPrivateUrl(webhookUrl)) {
                log.warn("SSRF blocked on multi-event webhook", { ruleId: rule.id });
                return;
              }
              const { inngest } = await import("@/lib/inngest/client");
              try {
                await inngest.send({
                  id: `webhook-multi-${companyId}-${rule.id}-${Math.floor(Date.now() / 5000)}`,
                  name: "automation/send-webhook",
                  data: {
                    url: webhookUrl,
                    companyId,
                    ruleId: rule.id,
                    payload: {
                      ruleId: rule.id,
                      ruleName: rule.name,
                      triggerType: "MULTI_EVENT_DURATION",
                      companyId,
                      data: contextData,
                    },
                  },
                });
              } catch (err) {
                log.error("Failed to enqueue Webhook job", { error: String(err) });
              }
            } else {
              log.error("Webhook: No URL configured for rule", { ruleId: rule.id });
            }
          } else if (type === "SEND_NOTIFICATION") {
            if (config.recipientId) {
              await createNotificationForCompany({
                companyId,
                userId: Number(config.recipientId),
                title: config.titleTemplate || "הושלמה שרשרת אירועים",
                message: (
                  config.messageTemplate ||
                  "התהליך הושלם בהצלחה.\nמשך: {durationString}"
                ).replace("{durationString}", totalDurationString),
                link: `/tables/${tableId}?recordId=${recordId}`,
              });
            }
          } else if (type === "CREATE_TASK") {
            const taskData: any = {
              title: config.title || "משימה מאוטומציה מרובת שלבים",
              description: config.description || "",
              status: config.status || "todo",
              companyId: companyId,
              tags: [...(config.tags || []), 'נוצר ע"י אוטומציה מרובת שלבים'],
            };

            if (config.priority) taskData.priority = config.priority;

            if (config.dueDays) {
              const due = new Date();
              due.setDate(due.getDate() + Number(config.dueDays));
              taskData.dueDate = due;
            } else if (config.dueDate) {
              taskData.dueDate = new Date(config.dueDate);
            }

            if (config.assigneeId) {
              const assigneeOk = await validateUserInCompany(Number(config.assigneeId), companyId);
              if (assigneeOk) taskData.assigneeId = Number(config.assigneeId);
            }

            await prisma.task.create({
              data: taskData,
            });
            log.info("Task created for rule", { ruleId: rule.id });
          } else if (type === "UPDATE_RECORD_FIELD") {
            if (config.columnId) {
              // Issue I: Use serializable transaction to prevent lost-update race condition
              // Issue T: Retry up to 2 times on serialization conflicts instead of silently failing
              const MAX_SERIALIZATION_RETRIES = 2;
              for (let attempt = 0; attempt <= MAX_SERIALIZATION_RETRIES; attempt++) {
                try {
                  await withRetry(() => prisma.$transaction(async (tx) => {
                    const currentRecord = await tx.record.findFirst({
                      where: { id: recordId, companyId: companyId || rule?.companyId },
                      select: { data: true },
                    });

                    if (currentRecord) {
                      const currentData =
                        (currentRecord.data as Record<string, unknown>) || {};
                      const newData = {
                        ...currentData,
                        [config.columnId]: config.value,
                      };

                      await tx.record.update({
                        where: { id: recordId, companyId: companyId || rule?.companyId },
                        data: { data: JSON.parse(JSON.stringify(newData)) },
                      });

                      log.info("Updated record field", { columnId: config.columnId, recordId });
                    }
                  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 }));
                  break; // Success — exit retry loop
                } catch (txErr: any) {
                  if (txErr?.code === "P2034" && attempt < MAX_SERIALIZATION_RETRIES) {
                    log.warn("Serialization conflict on UPDATE_RECORD_FIELD, retrying", { recordId, attempt: attempt + 1, maxRetries: MAX_SERIALIZATION_RETRIES });
                    continue;
                  }
                  throw txErr; // Non-serialization error or retries exhausted — propagate
                }
              }
            }
          }
        } catch (actionErr) {
          log.error("Action execution failed", { type, error: String(actionErr) });
        }
      };

      try {
        if (rule.actionType === "MULTI_ACTION") {
          const actions = (rule.actionConfig as any)?.actions || [];
          for (const action of actions) {
            await executeSingleAction(action.type, action.config, enrichedData);
          }
        } else {
          await executeSingleAction(
            rule.actionType,
            rule.actionConfig,
            enrichedData,
          );

          if (rule.actionType === "CALCULATE_MULTI_EVENT_DURATION") {
            const config = rule.actionConfig as any;
            if (
              config.notification &&
              config.notification.recipientId &&
              config.notification.message
            ) {
              await createNotificationForCompany({
                companyId,
                userId: Number(config.notification.recipientId),
                title: "משימה הושלמה: " + rule.name,
                message: `${config.notification.message}\nמשך כולל: ${totalDurationString}`,
                link: `/tables/${tableId}?recordId=${recordId}`,
              });
            }
          }
        }
      } catch (err) {
        log.error("Error in action orchestration", { error: String(err) });
      }
    }

    return { result, pendingActions };
  } catch (error) {
    // MM: Re-throw transient DB/connection errors so Inngest can retry.
    // Only swallow business-logic "no match" scenarios.
    const msg = error instanceof Error ? error.message : "";
    const isTransient =
      msg.includes("connect") ||
      msg.includes("timeout") ||
      msg.includes("ECONNREFUSED") ||
      msg.includes("P1001") || // Prisma: Can't reach database server
      msg.includes("P1008") || // Prisma: Operations timed out
      msg.includes("P1017") || // Prisma: Server has closed the connection
      msg.includes("P2024");   // Prisma: Timed out fetching connection from pool
    if (isTransient) {
      throw error;
    }
    log.error("Error calculating duration", { error: String(error) });
    return { result: null, pendingActions: [] };
  }
}

/**
 * Issue M: Step 1 — Find matching rules and compute shared query data.
 * Returns serializable data for use across separate Inngest steps.
 */
export async function findMatchingRulesAndSharedData(
  tableId: number,
  recordId: number,
  oldData: any,
  newData: any,
  companyId: number,
): Promise<{
  matchingRules: Array<{ ruleId: number; eventChain: any[]; ruleSnapshot: RuleSnapshot }>;
  shared: StepSharedData | null;
  resolvedCompanyId: number;
}> {
  // Issue N: Always filter by companyId for defense-in-depth
  const record = await withRetry(() => prisma.record.findFirst({
    where: { id: recordId, companyId },
    select: { companyId: true },
  }));

  if (!record) return { matchingRules: [], shared: null, resolvedCompanyId: companyId };

  const rules = await withRetry(() => prisma.automationRule.findMany({
    where: {
      isActive: true,
      triggerType: "MULTI_EVENT_DURATION",
      companyId: record.companyId,
    },
    take: 200,
  }));

  // Issue H: Pre-filter matching rules before expensive queries
  // Issue R: Include lightweight rule snapshot to avoid per-rule DB re-fetch
  const matchingRules: Array<{ ruleId: number; eventChain: any[]; ruleSnapshot: RuleSnapshot }> = [];

  for (const rule of rules) {
    const triggerConfig = rule.triggerConfig as any;
    const eventChain = triggerConfig.eventChain || [];

    if (eventChain.length < 2) continue;

    const lastEvent = eventChain[eventChain.length - 1];

    const expectedTableId = lastEvent.tableId
      ? Number(lastEvent.tableId)
      : triggerConfig.tableId
        ? Number(triggerConfig.tableId)
        : null;

    if (expectedTableId && expectedTableId !== tableId) {
      continue;
    }

    const lastEventColumn = lastEvent.columnId;
    const lastEventValue = String(lastEvent.value).trim().toLowerCase();

    const newValue =
      newData[lastEventColumn] !== undefined
        ? String(newData[lastEventColumn]).trim().toLowerCase()
        : undefined;
    const oldValue =
      oldData[lastEventColumn] !== undefined
        ? String(oldData[lastEventColumn]).trim().toLowerCase()
        : undefined;

    if (
      newValue !== undefined &&
      newValue === lastEventValue &&
      oldValue !== newValue
    ) {
      matchingRules.push({
        ruleId: rule.id,
        eventChain,
        // Issue R: Lightweight snapshot — only fields needed by calculateMultiEventDuration
        ruleSnapshot: {
          id: rule.id,
          name: rule.name,
          actionType: rule.actionType,
          actionConfig: rule.actionConfig,
          companyId: rule.companyId,
          triggerConfig: rule.triggerConfig,
        },
      });
    }
  }

  // Issue H: Compute shared BFS + mainRecord ONCE for all matching rules
  // Issue P: Do NOT include allLogs — each per-rule step re-fetches its own filtered logs
  let shared: StepSharedData | null = null;

  if (matchingRules.length > 0) {
    const targetRecordIds = await getRelatedRecordIdsBFS(recordId, record.companyId);

    const mainRecord = await withRetry(() => prisma.record.findFirst({
      where: { id: recordId, companyId: record.companyId },
      select: { createdAt: true, data: true },
    }));

    // Issue O: Collect all columns referenced by matching rules for per-rule log filtering
    const relevantColumns = new Set<string>();
    for (const { eventChain } of matchingRules) {
      for (const event of eventChain) {
        if (event.columnId) relevantColumns.add(event.columnId);
      }
    }

    shared = {
      targetRecordIds: Array.from(targetRecordIds),
      mainRecord,
      relevantColumns: Array.from(relevantColumns),
      companyId: record.companyId,
    };
  }

  return { matchingRules, shared, resolvedCompanyId: record.companyId };
}

/**
 * Issue M: Step 2 — Calculate a single rule. Called per-rule in its own Inngest step.
 * Issue P: Re-fetches its own filtered audit logs instead of receiving them through step boundary.
 * Issue R: Accepts lightweight rule snapshot to avoid per-rule DB fetch.
 */
/**
 * NN: Fetch audit logs once for all rules sharing the same targetRecordIds.
 * Called once in multi-event-jobs.ts, result passed to each calculateSingleRule.
 */
export async function fetchSharedAuditLogs(
  sharedData: StepSharedData,
): Promise<any[]> {
  const rawLogs = await withRetry(() => prisma.auditLog.findMany({
    where: {
      recordId: { in: sharedData.targetRecordIds },
      action: { in: ["UPDATE", "CREATE"] },
      companyId: sharedData.companyId,
    },
    orderBy: { timestamp: "desc" },
    take: MAX_AUDIT_LOGS,
    select: { id: true, recordId: true, action: true, diffJson: true, timestamp: true },
  }));
  rawLogs.reverse();

  const relevantColumns = new Set(sharedData.relevantColumns);
  return relevantColumns.size > 0
    ? rawLogs.filter((log) => {
        if (!log.diffJson || typeof log.diffJson !== "object") return false;
        const keys = Object.keys(log.diffJson as Record<string, unknown>);
        return keys.some((k) => relevantColumns.has(k));
      })
    : rawLogs;
}

export async function calculateSingleRule(
  tableId: number,
  recordId: number,
  ruleId: number,
  eventChain: any[],
  oldData: any,
  companyId: number,
  sharedData: StepSharedData,
  ruleSnapshot: RuleSnapshot,
  prefetchedLogs?: any[],
): Promise<{ pendingActions: Array<{ type: string; config: any; contextData: any; ruleSnapshot: any; companyId: number; delay: number }> }> {
  log.info("Chain completion detected for rule", { ruleId });

  const targetRecordIds = new Set(sharedData.targetRecordIds);

  // NN: Use pre-fetched logs if available, otherwise fetch (backward compatible)
  const allLogs = prefetchedLogs ?? await fetchSharedAuditLogs(sharedData);

  const shared: SharedQueryData = {
    targetRecordIds,
    allLogs,
    mainRecord: sharedData.mainRecord,
  };

  const calcResult = await calculateMultiEventDuration(
    tableId,
    recordId,
    eventChain,
    ruleId,
    oldData,
    companyId,
    shared,
    ruleSnapshot,
  );

  return { pendingActions: calcResult?.pendingActions || [] };
}

/**
 * טריגר לאוטומציה (legacy — kept for backwards compatibility)
 */
export async function processMultiEventDurationTrigger(
  tableId: number,
  recordId: number,
  oldData: any,
  newData: any,
  companyId: number,
): Promise<{ pendingActions: Array<{ type: string; config: any; contextData: any; ruleSnapshot: any; companyId: number; delay: number }> }> {
  const allPendingActions: Array<{ type: string; config: any; contextData: any; ruleSnapshot: any; companyId: number; delay: number }> = [];

  try {

    const { matchingRules, shared, resolvedCompanyId } = await findMatchingRulesAndSharedData(
      tableId, recordId, oldData, newData, companyId,
    );

    if (!shared) return { pendingActions: [] };

    // Legacy path: fetch logs once for all rules (no step boundary concern)
    const rawLogs = await withRetry(() => prisma.auditLog.findMany({
      where: {
        recordId: { in: shared.targetRecordIds },
        action: { in: ["UPDATE", "CREATE"] },
        companyId: resolvedCompanyId,
      },
      // Issue O-2: Sort DESC to get most recent logs, then reverse for chronological
      orderBy: { timestamp: "desc" },
      take: MAX_AUDIT_LOGS,
      select: { id: true, recordId: true, action: true, diffJson: true, timestamp: true },
    }));
    rawLogs.reverse();

    const relevantColumns = new Set(shared.relevantColumns);
    const filteredLogs = relevantColumns.size > 0
      ? rawLogs.filter((log) => {
          if (!log.diffJson || typeof log.diffJson !== "object") return false;
          const keys = Object.keys(log.diffJson as Record<string, unknown>);
          return keys.some((k) => relevantColumns.has(k));
        })
      : rawLogs;

    const sharedQueryData: SharedQueryData = {
      targetRecordIds: new Set(shared.targetRecordIds),
      allLogs: filteredLogs,
      mainRecord: shared.mainRecord,
    };

    for (const { ruleId, eventChain, ruleSnapshot } of matchingRules) {
      log.info("Chain completion detected for rule (legacy)", { ruleId });

      const calcResult = await calculateMultiEventDuration(
        tableId,
        recordId,
        eventChain,
        ruleId,
        oldData,
        resolvedCompanyId,
        sharedQueryData,
        ruleSnapshot,
      );

      if (calcResult?.pendingActions) {
        allPendingActions.push(...calcResult.pendingActions);
      }
    }
  } catch (error) {
    log.error("Multi-Event Trigger error", { error: String(error) });
  }

  return { pendingActions: allPendingActions };
}

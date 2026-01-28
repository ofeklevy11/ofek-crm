"use server";

import { prisma } from "@/lib/prisma";
import { sendNotification } from "./notifications";

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

// פונקציית עזר לרקורסיה של רשומות קשורות (ללא Soft Match, רק יחסים ישירים)
async function getRelatedRecordIdsRecursive(
  recordId: number,
  visited = new Set<number>(),
  depth = 0,
): Promise<Set<number>> {
  if (visited.has(recordId) || depth >= 4) return visited;
  visited.add(recordId);

  try {
    const record = await prisma.record.findUnique({
      where: { id: recordId },
      include: { table: true },
    });

    if (record && record.table && record.table.schemaJson) {
      const schema = record.table.schemaJson as any[];
      const recordData = record.data as any;

      if (Array.isArray(schema)) {
        const promises: Promise<any>[] = [];

        schema.forEach((field) => {
          if (field.type === "relation" && recordData[field.name]) {
            const val = recordData[field.name];
            const linkedIds = extractIdsFromValue(val);

            linkedIds.forEach((id) => {
              if (!visited.has(id)) {
                promises.push(
                  getRelatedRecordIdsRecursive(id, visited, depth + 1),
                );
              }
            });
          }
        });

        await Promise.all(promises);
      }
    }
  } catch (err) {
    console.error("[Multi-Event] Error in recursive lookup:", err);
  }

  return visited;
}

/**
 * חישוב ביצועים - משך זמן בין אירועים מרובים
 */
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
  oldData?: any,
) {
  console.log(`[Multi-Event] Starting calculation for Record ${recordId}`);

  try {
    const rule = await prisma.automationRule.findUnique({
      where: { id: automationRuleId },
    });

    // 1. איסוף כל הרשומות הקשורות
    const targetRecordIds = await getRelatedRecordIdsRecursive(recordId);

    // קבלת זמון יצירה של הרשומה הראשית לצורך חילוץ "מצב התחלתי"
    const mainRecord = await prisma.record.findUnique({
      where: { id: recordId },
      select: { createdAt: true, data: true },
    });

    console.log(
      `[Multi-Event] Looking for logs in ${
        targetRecordIds.size
      } records: ${Array.from(targetRecordIds).join(", ")}`,
    );

    // 2. משיכת כל ה-audit logs
    const allLogs = await prisma.auditLog.findMany({
      where: {
        recordId: { in: Array.from(targetRecordIds) },
        action: { in: ["UPDATE", "CREATE"] },
      },
      orderBy: { timestamp: "asc" },
    });

    console.log(`[Multi-Event] Found ${allLogs.length} logs combined`);

    // Cache לשמות טבלאות
    const tableNameCache = new Map<number, string>();
    const getTableName = async (id: number) => {
      if (tableNameCache.has(id)) return tableNameCache.get(id)!;
      const t = await prisma.tableMeta.findUnique({ where: { id } });
      const name = t ? t.name : "Unknown Table";
      tableNameCache.set(id, name);
      return name;
    };

    // טעינת הטבלה הראשית לקאש
    await getTableName(tableId);

    // 3. חיפוש האירועים בשרשרת
    const eventTimestamps: Array<{
      eventName: string;
      timestamp: Date;
      columnId: string;
      value: string;
      tableName: string; // הוספנו את שם הטבלאה
    }> = [];

    // נשתמש באינדקס הלולאה כדי לזהות את האירוע הראשון
    let eventIndex = 0;
    for (const event of eventChain) {
      let found = false;
      const targetValue = String(event.value).trim().toLowerCase();

      // שליפת שם הטבלאה של האירוע
      const eventTableId = event.tableId ? Number(event.tableId) : tableId;
      const tableName = await getTableName(eventTableId);

      // חיפוש בלוגים
      for (const log of allLogs) {
        const logData = log.diffJson as any;
        if (!logData || logData[event.columnId] === undefined) continue;

        const logValue = String(logData[event.columnId]).trim().toLowerCase();

        if (logValue === targetValue) {
          eventTimestamps.push({
            eventName: event.eventName,
            timestamp: log.timestamp,
            columnId: event.columnId,
            value: event.value,
            tableName: tableName, // שמירת השם
          });
          found = true;
          console.log(
            `[Multi-Event] ✅ Found '${event.eventName}' at ${log.timestamp} (Record: ${log.recordId})`,
          );
          break;
        }
      }

      // אם זה האירוע הראשון ולא מצאנו בלוגים, נבדוק אם זה המצב הקיים ב-oldData
      // (בתנאי שהאירוע מתייחס לטבלה הראשית)
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
          console.log(
            `[Multi-Event] Event '${event.eventName}' matches previous state (oldData). Using record creation time.`,
          );
          found = true;
          eventTimestamps.push({
            eventName: event.eventName,
            timestamp: mainRecord.createdAt, // שימוש בזמן יצירה כברירת מחדל להתחלה
            columnId: event.columnId,
            value: event.value,
            tableName: tableName,
          });
        }
      }

      if (!found) {
        console.log(
          `[Multi-Event] ⚠️ Event '${event.eventName}' NOT found. Searched for Column: '${event.columnId}' with Value: '${targetValue}'`,
        );
        return null;
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
      if (diffSeconds < 0) diffSeconds = 0; // מניעת זמנים שליליים במקרה קצה

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

    const result = await prisma.multiEventDuration.create({
      data: {
        automationRuleId,
        recordId,
        eventChain: eventTimestamps,
        eventDeltas: deltas,
        totalDurationSeconds,
        totalDurationString,
        weightedScore,
      },
    });

    console.log(
      `[Multi-Event] ✅ Successfully saved result #${result.id}. Duration: ${totalDurationString}`,
    );

    // 6. ביצוע פעולה (Action) לפי סוג הכלל
    if (rule) {
      const companyId = rule.companyId;
      // נשיג את המידע העדכני של הרשומה לצורך הזרקת משתנים
      // (אנחנו כבר השגנו את data ב-mainRecord למעלה אם השתמשנו בו, אבל נשמור על הלוגיקה הקיימת)
      const recordData = mainRecord?.data || {};

      // נוסיף את משך הזמן לנתונים זמינים
      const enrichedData = {
        ...(typeof recordData === "object" ? recordData : {}),
        durationString: totalDurationString,
        durationSeconds: totalDurationSeconds,
        weightedScore: weightedScore,
      };

      console.log(`[Multi-Event] Executing Action: ${rule.actionType}`);

      const executeSingleAction = async (
        type: string,
        config: any,
        contextData: any,
      ) => {
        try {
          if (type === "SEND_WHATSAPP") {
            // Handle delay/sleep if configured (to avoid Green API blocks)
            if (config.delay) {
              console.log(
                `[Multi-Event] Sleeping for ${config.delay} seconds before sending WhatsApp...`,
              );
              await new Promise((resolve) =>
                setTimeout(resolve, config.delay * 1000),
              );
            }

            const { executeWhatsAppAction } = await import("./automations");
            await executeWhatsAppAction(
              { ...rule, actionConfig: config },
              contextData,
              companyId,
            );
          } else if (type === "WEBHOOK") {
            const { executeWebhookAction } = await import("./automations");
            await executeWebhookAction(
              { ...rule, actionConfig: config },
              contextData,
              companyId,
            );
          } else if (type === "SEND_NOTIFICATION") {
            if (config.recipientId) {
              await sendNotification({
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

            if (config.assigneeId)
              taskData.assigneeId = Number(config.assigneeId);

            await prisma.task.create({
              data: taskData,
            });
            console.log(`[Multi-Event] Task created for rule ${rule.id}`);
          }
        } catch (actionErr) {
          console.error(
            `[Multi-Event] Action execution failed (${type}):`,
            actionErr,
          );
        }
      };

      try {
        if (rule.actionType === "MULTI_ACTION") {
          const actions = (rule.actionConfig as any)?.actions || [];
          for (const action of actions) {
            await executeSingleAction(action.type, action.config, enrichedData);
          }
        } else {
          // Single Action
          await executeSingleAction(
            rule.actionType,
            rule.actionConfig,
            enrichedData,
          );

          // Legacy backward compatibility for notifications attached to duration calc
          if (rule.actionType === "CALCULATE_MULTI_EVENT_DURATION") {
            const config = rule.actionConfig as any;
            if (
              config.notification &&
              config.notification.recipientId &&
              config.notification.message
            ) {
              await sendNotification({
                userId: Number(config.notification.recipientId),
                title: "משימה הושלמה: " + rule.name,
                message: `${config.notification.message}\nמשך כולל: ${totalDurationString}`,
                link: `/tables/${tableId}?recordId=${recordId}`,
              });
            }
          }
        }
      } catch (err) {
        console.error("[Multi-Event] Error in action orchestration:", err);
      }
    }

    return result;
  } catch (error) {
    console.error("[Multi-Event] Error calculating duration:", error);
    return null;
  }
}

/**
 * טריגר לאוטומציה
 */
export async function processMultiEventDurationTrigger(
  tableId: number,
  recordId: number,
  oldData: any,
  newData: any,
) {
  try {
    const rules = await prisma.automationRule.findMany({
      where: {
        isActive: true,
        triggerType: "MULTI_EVENT_DURATION",
      },
    });

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
        console.log(
          `[Multi-Event Trigger] ✅ Chain completion detected for Rule ${rule.id}`,
        );

        await calculateMultiEventDuration(
          tableId,
          recordId,
          eventChain,
          rule.id,
          oldData, // העברת המידע הישן לפונקציית החישוב
        );
      }
    }
  } catch (error) {
    console.error("[Multi-Event Trigger] Error:", error);
  }
}

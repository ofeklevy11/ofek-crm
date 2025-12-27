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
  depth = 0
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
                  getRelatedRecordIdsRecursive(id, visited, depth + 1)
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
  automationRuleId: number
) {
  console.log(`[Multi-Event] Starting calculation for Record ${recordId}`);

  try {
    const rule = await prisma.automationRule.findUnique({
      where: { id: automationRuleId },
    });

    // 1. איסוף כל הרשומות הקשורות
    const targetRecordIds = await getRelatedRecordIdsRecursive(recordId);

    console.log(
      `[Multi-Event] Looking for logs in ${
        targetRecordIds.size
      } records: ${Array.from(targetRecordIds).join(", ")}`
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
            `[Multi-Event] ✅ Found '${event.eventName}' at ${log.timestamp} (Record: ${log.recordId})`
          );
          break;
        }
      }

      if (!found) {
        console.log(
          `[Multi-Event] ⚠️ Event '${event.eventName}' NOT found. Searched for Column: '${event.columnId}' with Value: '${targetValue}'`
        );
        return null;
      }
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
      const diffSeconds = Math.floor(diffMs / 1000);

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
      0
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
      `[Multi-Event] ✅ Successfully saved result #${result.id}. Duration: ${totalDurationString}`
    );

    // 6. התראה
    if (rule && rule.actionConfig) {
      const config = rule.actionConfig as any;
      if (
        config.notification &&
        config.notification.recipientId &&
        config.notification.message
      ) {
        console.log(`[Multi-Event] Sending notification...`);
        await sendNotification({
          userId: Number(config.notification.recipientId),
          title: "משימה הושלמה: " + rule.name,
          message: `${config.notification.message}\nמשך כולל: ${totalDurationString}`,
          link: `/tables/${tableId}?recordId=${recordId}`,
        });
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
  newData: any
) {
  try {
    const rules = await prisma.automationRule.findMany({
      where: {
        isActive: true,
        actionType: "CALCULATE_MULTI_EVENT_DURATION",
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
          `[Multi-Event Trigger] ✅ Chain completion detected for Rule ${rule.id}`
        );

        await calculateMultiEventDuration(
          tableId,
          recordId,
          eventChain,
          rule.id
        );
      }
    }
  } catch (error) {
    console.error("[Multi-Event Trigger] Error:", error);
  }
}

"use server";

import { prisma } from "@/lib/prisma";

/**
 * חישוב ביצועים - משך זמן בין אירועים מרובים (Multi-Event Duration Calculation)
 *
 * פונקציה זו מחשבת את הזמן שעבר בין סדרת אירועים ברשומה.
 * לדוגמה: מודדת כמה זמן עבר מ"ליד נוצר" → "בטיפול" → "לקוח משלם"
 *
 * @param tableId - מזהה הטבלה
 * @param recordId - מזהה הרשומה
 * @param eventChain - שרשרת האירועים שצריך למדוד
 * @param automationRuleId - מזהה כלל האוטומציה
 */
export async function calculateMultiEventDuration(
  tableId: number,
  recordId: number,
  eventChain: Array<{
    eventName: string;
    columnId: string;
    value: string;
  }>,
  automationRuleId: number
) {
  console.log(`[Multi-Event] Starting calculation for Record ${recordId}`);

  try {
    // שלב 1: משיכת כל ה-audit logs של הרשומה
    const allLogs = await prisma.auditLog.findMany({
      where: {
        recordId: recordId,
        action: { in: ["UPDATE", "CREATE"] },
      },
      orderBy: { timestamp: "asc" }, // מהישן לחדש
    });

    console.log(`[Multi-Event] Found ${allLogs.length} logs for record`);

    // שלב 2: חיפוש timestamps לכל אירוע בשרשרת
    const eventTimestamps: Array<{
      eventName: string;
      timestamp: Date;
      columnId: string;
      value: string;
    }> = [];

    for (const event of eventChain) {
      let found = false;

      // חיפוש בלוגים
      for (const log of allLogs) {
        const logData = log.diffJson as any;
        const logValue = logData ? logData[event.columnId] : undefined;

        if (
          logValue !== undefined &&
          String(logValue) === String(event.value)
        ) {
          eventTimestamps.push({
            eventName: event.eventName,
            timestamp: log.timestamp,
            columnId: event.columnId,
            value: event.value,
          });
          found = true;
          console.log(
            `[Multi-Event] ✅ Found ${event.eventName} at ${log.timestamp}`
          );
          break;
        }
      }

      if (!found) {
        console.log(
          `[Multi-Event] ⚠️ Event '${event.eventName}' not found in history`
        );
        // אם אירוע לא נמצא, לא נוכל לחשב - נצא
        return null;
      }
    }

    // שלב 3: חישוב דלתות בין אירועים
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

      // המרה לפורמט קריא
      const diffMinutes = Math.floor(diffSeconds / 60);
      const diffHours = Math.floor(diffMinutes / 60);
      const diffDays = Math.floor(diffHours / 24);

      const remainingHours = diffHours % 24;
      const remainingMinutes = diffMinutes % 60;
      const remainingSeconds = diffSeconds % 60;

      const durationString = `${diffDays}d ${remainingHours}h ${remainingMinutes}m ${remainingSeconds}s`;

      deltas.push({
        from: currentEvent.eventName,
        to: nextEvent.eventName,
        durationSeconds: diffSeconds,
        durationString,
      });

      console.log(
        `[Multi-Event] Delta: ${currentEvent.eventName} → ${nextEvent.eventName}: ${durationString}`
      );
    }

    // שלב 4: חישוב זמן כולל
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

    const totalDurationString = `${totalDays}d ${totalRemainingHours}h ${totalRemainingMinutes}m ${totalRemainingSeconds}s`;

    console.log(
      `[Multi-Event] Total duration: ${totalDurationString} (${totalDurationSeconds}s)`
    );

    // שלב 5: חישוב weighted score (ממוצע משוקלל)
    // כרגע פשוט - ממוצע הזמנים
    const weightedScore =
      deltas.length > 0 ? totalDurationSeconds / deltas.length : 0;

    // שלב 6: שמירה בטבלת MultiEventDuration
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
      `[Multi-Event] ✅ Successfully saved multi-event duration record #${result.id}`
    );

    return result;
  } catch (error) {
    console.error("[Multi-Event] Error calculating duration:", error);
    return null;
  }
}

/**
 * פונקציה שמופעלת אוטומטית כשרשומה מתעדכנת - בודקת אם צריך לחשב multi-event duration
 */
export async function processMultiEventDurationTrigger(
  tableId: number,
  recordId: number,
  oldData: any,
  newData: any
) {
  console.log(
    `[Multi-Event Trigger] Checking for multi-event triggers on Record ${recordId}`
  );

  try {
    const rules = await prisma.automationRule.findMany({
      where: {
        isActive: true,
        actionType: "CALCULATE_MULTI_EVENT_DURATION",
      },
    });

    console.log(
      `[Multi-Event Trigger] Found ${rules.length} active multi-event rules`
    );

    for (const rule of rules) {
      const triggerConfig = rule.triggerConfig as any;

      // בדיקה שזה הטבלה הנכונה
      if (triggerConfig.tableId && Number(triggerConfig.tableId) !== tableId) {
        continue;
      }

      const eventChain = triggerConfig.eventChain || [];

      if (eventChain.length < 2) {
        console.log(
          `[Multi-Event Trigger] Rule ${rule.id} has insufficient events in chain`
        );
        continue;
      }

      // בדיקה האם השינוי הנוכחי משלים את שרשרת האירועים
      const lastEvent = eventChain[eventChain.length - 1];
      const lastEventColumn = lastEvent.columnId;
      const lastEventValue = lastEvent.value;

      // האם השינוי הנוכחי הוא המעבר לאירוע האחרון?
      if (
        newData[lastEventColumn] !== undefined &&
        String(newData[lastEventColumn]) === String(lastEventValue) &&
        oldData[lastEventColumn] !== newData[lastEventColumn]
      ) {
        console.log(
          `[Multi-Event Trigger] ✅ Detected completion of event chain for Rule ${rule.id}`
        );

        // מפעילים את החישוב
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

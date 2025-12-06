"use server";

import { prisma } from "@/lib/prisma";

/**
 * Helper function to parse duration string "Xd Yh Zm Qs" to total seconds
 */
function parseDurationToSeconds(durationStr: string): number {
  if (!durationStr) return 0;
  const cleanDuration = durationStr.split("|")[0];
  const daysMatch = cleanDuration.match(/(\d+)d/);
  const hoursMatch = cleanDuration.match(/(\d+)h/);
  const minutesMatch = cleanDuration.match(/(\d+)m/);
  const secondsMatch = cleanDuration.match(/(\d+)s/);
  const days = daysMatch ? parseInt(daysMatch[1]) : 0;
  const hours = hoursMatch ? parseInt(hoursMatch[1]) : 0;
  const minutes = minutesMatch ? parseInt(minutesMatch[1]) : 0;
  const seconds = secondsMatch ? parseInt(secondsMatch[1]) : 0;
  return days * 24 * 3600 + hours * 3600 + minutes * 60 + seconds;
}

/**
 * Helper function to format seconds back to readable string
 */
function formatSecondsToHebrew(totalSeconds: number): string {
  if (totalSeconds === 0) return "0 שניות";
  const days = Math.floor(totalSeconds / (24 * 3600));
  const hours = Math.floor((totalSeconds % (24 * 3600)) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (days > 0) parts.push(`${days} ${days === 1 ? "יום" : "ימים"}`);
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? "שעה" : "שעות"}`);
  if (minutes > 0) parts.push(`${minutes} ${minutes === 1 ? "דקה" : "דקות"}`);
  if (seconds > 0)
    parts.push(`${seconds} ${seconds === 1 ? "שנייה" : "שניות"}`);
  if (parts.length === 0) return "0 שניות";
  return parts.join(", ");
}

export async function getAnalyticsData() {
  try {
    const rules = await prisma.automationRule.findMany({
      where: {
        isActive: true,
        actionType: {
          in: ["CALCULATE_DURATION", "CALCULATE_MULTI_EVENT_DURATION"],
        },
      },
      orderBy: {
        analyticsOrder: "asc", // Sort by persisted order
      },
    });

    const views = [];

    // Cache for table names
    const tableNameCache = new Map<number, string>();
    const getTableName = async (id: number) => {
      if (tableNameCache.has(id)) return tableNameCache.get(id)!;
      const t = await prisma.tableMeta.findUnique({ where: { id } });
      const name = t ? t.name : "טבלה לא ידועה";
      tableNameCache.set(id, name);
      return name;
    };

    for (const rule of rules) {
      let items: any[] = [];
      const ruleName = rule.name;
      const triggerConfig = rule.triggerConfig as any;
      const mainTableId = triggerConfig.tableId
        ? parseInt(triggerConfig.tableId)
        : 0;

      const tableName =
        rule.triggerType === "TASK_STATUS_CHANGE"
          ? "משימות"
          : await getTableName(mainTableId);

      if (rule.actionType === "CALCULATE_MULTI_EVENT_DURATION") {
        // Build a map of eventName -> TableName from the rule config
        // This ensures backwards compatibility for old records
        const eventTableMap = new Map<string, string>();
        if (
          triggerConfig.eventChain &&
          Array.isArray(triggerConfig.eventChain)
        ) {
          for (const event of triggerConfig.eventChain) {
            const tId = event.tableId ? Number(event.tableId) : mainTableId;
            if (tId) {
              const tName = await getTableName(tId);
              eventTableMap.set(event.eventName, tName);
            }
          }
        }

        const multiEventDurations = await prisma.multiEventDuration.findMany({
          where: { automationRuleId: rule.id },
          include: {
            record: true,
            task: true,
          },
          orderBy: { createdAt: "desc" },
        });

        items = multiEventDurations.map((d) => {
          let title = "Unknown";
          if (d.task) {
            title = d.task.title;
          } else if (d.record) {
            const data = d.record.data as any;
            const titleField =
              Object.keys(data).find(
                (k) =>
                  k.toLowerCase().includes("name") ||
                  k.toLowerCase().includes("title") ||
                  (typeof data[k] === "string" &&
                    data[k].length < 50 &&
                    k !== "duration_status_change")
              ) || "Record";
            title = data[titleField]
              ? String(data[titleField])
              : `Record #${d.record.id}`;
          }

          const eventChain = d.eventChain as any[];
          const eventNames = eventChain
            .map((e: any) => {
              // Try to get table name from stored event, or fall back to rule config map
              const tName = e.tableName || eventTableMap.get(e.eventName);
              return tName ? `${e.eventName} (${tName})` : e.eventName;
            })
            .join(" → ");

          return {
            id: d.id,
            title: title,
            status: eventNames,
            duration: d.totalDurationString,
            totalDurationSeconds: d.totalDurationSeconds,
            weightedScore: d.weightedScore,
            eventDeltas: d.eventDeltas,
            updatedAt: d.createdAt,
            type: tableName,
            recordId: d.recordId || d.taskId || "",
          };
        });

        let stats = null;
        if (items.length > 0) {
          const secondsArray = items.map((item) => item.totalDurationSeconds);
          const totalSeconds = secondsArray.reduce((a, b) => a + b, 0);
          const averageSeconds = Math.round(totalSeconds / secondsArray.length);
          const minSeconds = Math.min(...secondsArray);
          const maxSeconds = Math.max(...secondsArray);

          stats = {
            averageDuration: formatSecondsToHebrew(averageSeconds),
            minDuration: formatSecondsToHebrew(minSeconds),
            maxDuration: formatSecondsToHebrew(maxSeconds),
            totalRecords: items.length,
            averageSeconds,
          };
        }

        views.push({
          ruleId: rule.id,
          ruleName: ruleName,
          tableName: tableName,
          type: "multi-event",
          data: items,
          stats: stats,
          order: rule.analyticsOrder ?? 0,
          color: rule.analyticsColor ?? "bg-white",
        });
      } else if (rule.actionType === "CALCULATE_DURATION") {
        const durations = await prisma.statusDuration.findMany({
          where: { automationRuleId: rule.id },
          include: {
            record: true,
            task: true,
          },
          orderBy: { createdAt: "desc" },
        });

        items = durations.map((d) => {
          let title = "Unknown";
          let status = d.toValue || "N/A";

          if (d.task) {
            title = d.task.title;
          } else if (d.record) {
            const data = d.record.data as any;
            const titleField =
              Object.keys(data).find(
                (k) =>
                  k.toLowerCase().includes("name") ||
                  k.toLowerCase().includes("title") ||
                  (typeof data[k] === "string" &&
                    data[k].length < 50 &&
                    k !== "duration_status_change")
              ) || "Record";
            title = data[titleField]
              ? String(data[titleField])
              : `Record #${d.record.id}`;
          }

          let statusDisplay = status;
          if (d.fromValue && d.toValue) {
            statusDisplay = `${d.fromValue} -> ${d.toValue}`;
          }

          return {
            id: d.id,
            title: title,
            status: statusDisplay,
            duration: d.durationString,
            updatedAt: d.createdAt,
            type: tableName,
            recordId: d.recordId || d.taskId || "",
          };
        });

        let stats = null;
        if (items.length > 0) {
          const durationSeconds = await prisma.statusDuration.findMany({
            where: { automationRuleId: rule.id },
            select: { durationSeconds: true },
          });
          const secondsArray = durationSeconds.map((d) => d.durationSeconds);
          if (secondsArray.length > 0) {
            const totalSeconds = secondsArray.reduce((a, b) => a + b, 0);
            const averageSeconds = Math.round(
              totalSeconds / secondsArray.length
            );
            const minSeconds = Math.min(...secondsArray);
            const maxSeconds = Math.max(...secondsArray);
            stats = {
              averageDuration: formatSecondsToHebrew(averageSeconds),
              minDuration: formatSecondsToHebrew(minSeconds),
              maxDuration: formatSecondsToHebrew(maxSeconds),
              totalRecords: items.length,
              averageSeconds,
            };
          }
        }

        views.push({
          ruleId: rule.id,
          ruleName: ruleName,
          tableName: tableName,
          type: "single-event",
          data: items,
          stats: stats,
          order: rule.analyticsOrder ?? 0,
          color: rule.analyticsColor ?? "bg-white",
        });
      }
    }

    // Secondary sort in JS just in case of nulls or mixed query results if needed,
    // but the DB query sort is usually sufficient.
    // We already sorted the fetched rules, so `views` should be roughly in order
    // unless multiple rules map to one view (not the case here).
    views.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    return { success: true, data: views };
  } catch (error) {
    console.error("Error fetching analytics data:", error);
    return { success: false, error: "Failed to fetch analytics data" };
  }
}

export async function updateAnalyticsViewOrder(
  items: { ruleId: number; order: number }[]
) {
  try {
    const updates = items.map((item) =>
      prisma.automationRule.update({
        where: { id: item.ruleId },
        data: { analyticsOrder: item.order },
      })
    );
    await Promise.all(updates);
    return { success: true };
  } catch (error) {
    console.error("Error updating analytics view order:", error);
    return { success: false, error: "Failed to update order" };
  }
}

export async function updateAnalyticsViewColor(ruleId: number, color: string) {
  try {
    await prisma.automationRule.update({
      where: { id: ruleId },
      data: { analyticsColor: color },
    });
    return { success: true };
  } catch (error) {
    console.error("Error updating analytics view color:", error);
    return { success: false, error: "Failed to update color" };
  }
}

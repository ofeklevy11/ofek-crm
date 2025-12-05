"use server";

import { prisma } from "@/lib/prisma";

/**
 * Helper function to parse duration string "Xd Yh Zm Qs" to total seconds
 */
function parseDurationToSeconds(durationStr: string): number {
  if (!durationStr) return 0;

  // Handle format with status suffix "duration|from->to"
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
    // 1. Fetch all active "CALCULATE_DURATION" automation rules
    const rules = await prisma.automationRule.findMany({
      where: {
        isActive: true,
        actionType: "CALCULATE_DURATION",
      },
    });

    const views = [];

    // 2. Iterate through rules and collect data for each
    for (const rule of rules) {
      let items: any[] = [];
      const ruleName = rule.name;
      const tableName =
        rule.triggerType === "TASK_STATUS_CHANGE"
          ? "משימות"
          : (
              await prisma.tableMeta.findUnique({
                where: { id: parseInt((rule.triggerConfig as any).tableId) },
                select: { name: true },
              })
            )?.name || "טבלה לא ידועה";

      if (rule.actionType === "CALCULATE_DURATION") {
        // Query the new StatusDuration table
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
            // Find title field
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

          // Format status as "From -> To" if available
          let statusDisplay = status;
          if (d.fromValue && d.toValue) {
            statusDisplay = `${d.fromValue} -> ${d.toValue}`;
          }

          return {
            id: d.id,
            title: title,
            status: statusDisplay,
            duration: d.durationString, // Already formatted in DB
            updatedAt: d.createdAt, // Or recordUpdatedAt
            type: tableName,
          };
        });
      }

      // Calculate statistics if we have data
      let stats = null;
      if (items.length > 0) {
        // We can fetch aggregate directly from DB if we wanted, but let's stick to JS for now as we have the items

        const durationSeconds = await prisma.statusDuration.findMany({
          where: { automationRuleId: rule.id },
          select: { durationSeconds: true },
        });

        const secondsArray = durationSeconds.map((d) => d.durationSeconds);

        if (secondsArray.length > 0) {
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
      }

      views.push({
        ruleId: rule.id,
        ruleName: ruleName,
        tableName: tableName,
        data: items,
        stats: stats,
      });
    }

    // Sort views by something? Maybe rule ID.
    return { success: true, data: views };
  } catch (error) {
    console.error("Error fetching analytics data:", error);
    return { success: false, error: "Failed to fetch analytics data" };
  }
}

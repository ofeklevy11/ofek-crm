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

// ... imports

// Helper for JS-based filtering of JSON data

// Helper for flexible matching (case-insensitive, trimmed, string conversion)
// Also handles "no filter" case properly
// Helper for flexible matching (case-insensitive, trimmed, string conversion)
function filterRecords(records: any[], filter: any) {
  if (!filter || Object.keys(filter).length === 0) return records;
  return records.filter((r) => {
    return Object.entries(filter).every(([key, value]) => {
      if (!value) return true;

      // flexible access: try .data[key], then [key]
      let dataVal = (r.data as any)?.[key];
      if (dataVal === undefined) {
        dataVal = (r as any)[key];
      }

      if (dataVal === undefined || dataVal === null) return false;

      const strDataVal = String(dataVal).trim().toLowerCase();
      const strFilterVal = String(value).trim().toLowerCase();

      return strDataVal === strFilterVal;
    });
  });
}

export async function createAnalyticsView(data: {
  title: string;
  type: string;
  description?: string;
  config: any;
  color?: string;
}) {
  try {
    const view = await prisma.analyticsView.create({
      data: {
        title: data.title,
        type: data.type,
        description: data.description,
        config: data.config,
        color: data.color || "bg-white",
        // Put it at the end
        order: 999,
      },
    });
    return { success: true, data: view };
  } catch (error) {
    console.error("Error creating analytics view:", error);
    return { success: false, error: "Failed to create view" };
  }
}

export async function deleteAnalyticsView(id: number) {
  try {
    await prisma.analyticsView.delete({ where: { id } });
    return { success: true };
  } catch (error) {
    console.error("Error deleting analytics view:", error);
    return { success: false, error: "Failed to delete view" };
  }
}

export async function updateAnalyticsView(
  id: number,
  data: {
    title?: string;
    type?: string;
    description?: string;
    config?: any;
    color?: string;
  }
) {
  try {
    const view = await prisma.analyticsView.update({
      where: { id },
      data: {
        title: data.title,
        type: data.type,
        description: data.description,
        config: data.config,
        color: data.color,
      },
    });
    return { success: true, data: view };
  } catch (error) {
    console.error("Error updating analytics view:", error);
    return { success: false, error: "Failed to update view" };
  }
}

export async function getAnalyticsData() {
  try {
    // 1. Fetch Automation Rules (Existing)
    const rules = await prisma.automationRule.findMany({
      where: {
        isActive: true,
        actionType: {
          in: ["CALCULATE_DURATION", "CALCULATE_MULTI_EVENT_DURATION"],
        },
      },
    });

    // 2. Fetch Custom Analytics Views (New)
    const customViews = await prisma.analyticsView.findMany();

    const views = [];

    // Cache for table names
    const tableNameCache = new Map<number, string>();
    const getTableName = async (id: number) => {
      if (!id) return "Unknown Table";
      if (tableNameCache.has(id)) return tableNameCache.get(id)!;
      const t = await prisma.tableMeta.findUnique({ where: { id } });
      const name = t ? t.name : "טבלה לא ידועה";
      tableNameCache.set(id, name);
      return name;
    };

    // --- Process Automation Rules ---
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
        // ... (Existing Logic for Multi Event)
        const eventTableMap = new Map<string, string>();
        if (
          triggerConfig.eventChain &&
          Array.isArray(triggerConfig.eventChain)
        ) {
          for (const event of triggerConfig.eventChain) {
            const tId = event.tableId ? Number(event.tableId) : mainTableId;
            if (tId) {
              eventTableMap.set(event.eventName, await getTableName(tId));
            }
          }
        }

        const multiEventDurations = await prisma.multiEventDuration.findMany({
          where: { automationRuleId: rule.id },
          include: { record: true, task: true },
          orderBy: { createdAt: "desc" },
        });

        items = multiEventDurations.map((d) => {
          // ... simplify title logic repeated ...
          let title = "Unknown";
          if (d.task) title = d.task.title;
          else if (d.record) {
            const data = d.record.data as any;
            const titleField =
              Object.keys(data).find(
                (k) =>
                  k.toLowerCase().includes("name") ||
                  k.toLowerCase().includes("title") ||
                  (typeof data[k] === "string" && data[k].length < 50)
              ) || "Record";
            title = data[titleField]
              ? String(data[titleField])
              : `Record #${d.record.id}`;
          }

          const eventChain = d.eventChain as any[];
          const eventNames = eventChain
            .map((e: any) => {
              const tName = e.tableName || eventTableMap.get(e.eventName);
              return tName ? `${e.eventName} (${tName})` : e.eventName;
            })
            .join(" → ");

          return {
            id: d.id,
            title,
            status: eventNames,
            duration: d.totalDurationString,
            totalDurationSeconds: d.totalDurationSeconds,
            weightedScore: d.weightedScore,
            updatedAt: d.createdAt,
            type: tableName,
          };
        });

        // Calculate Stats
        let stats = null;
        if (items.length > 0) {
          const totalSeconds = items.reduce(
            (acc, item) => acc + item.totalDurationSeconds,
            0
          );
          const avg = Math.round(totalSeconds / items.length);
          const min = Math.min(...items.map((i) => i.totalDurationSeconds));
          const max = Math.max(...items.map((i) => i.totalDurationSeconds));
          stats = {
            averageDuration: formatSecondsToHebrew(avg),
            minDuration: formatSecondsToHebrew(min),
            maxDuration: formatSecondsToHebrew(max),
            totalRecords: items.length,
            averageSeconds: avg,
          };
        }

        views.push({
          id: `rule_${rule.id}`, // Unified ID
          ruleId: rule.id, // Keep for backward compat if needed
          ruleName: ruleName,
          tableName: tableName,
          type: "multi-event",
          data: items,
          stats: stats,
          order: rule.analyticsOrder ?? 0,
          color: rule.analyticsColor ?? "bg-white",
          source: "AUTOMATION",
        });
      } else if (rule.actionType === "CALCULATE_DURATION") {
        // ... (Existing Logic for Duration)
        const durations = await prisma.statusDuration.findMany({
          where: { automationRuleId: rule.id },
          include: { record: true, task: true },
          orderBy: { createdAt: "desc" },
        });

        items = durations.map((d) => {
          let title = "Unknown";
          if (d.task) title = d.task.title;
          else if (d.record) {
            const data = d.record.data as any;
            const titleField =
              Object.keys(data).find(
                (k) =>
                  k.toLowerCase().includes("name") ||
                  k.toLowerCase().includes("title") ||
                  (typeof data[k] === "string" && data[k].length < 50)
              ) || "Record";
            title = data[titleField]
              ? String(data[titleField])
              : `Record #${d.record.id}`;
          }

          let statusDisplay = d.toValue || "N/A";
          if (d.fromValue && d.toValue)
            statusDisplay = `${d.fromValue} -> ${d.toValue}`;

          return {
            id: d.id,
            title,
            status: statusDisplay,
            duration: d.durationString,
            durationSeconds: d.durationSeconds,
            updatedAt: d.createdAt,
            type: tableName,
          };
        });

        let stats = null;
        if (items.length > 0) {
          const totalSeconds = items.reduce(
            (acc, item) => acc + item.durationSeconds,
            0
          );
          const avg = Math.round(totalSeconds / items.length);
          stats = {
            averageDuration: formatSecondsToHebrew(avg),
            minDuration: formatSecondsToHebrew(
              Math.min(...items.map((i) => i.durationSeconds))
            ),
            maxDuration: formatSecondsToHebrew(
              Math.max(...items.map((i) => i.durationSeconds))
            ),
            totalRecords: items.length,
            averageSeconds: avg,
          };
        }

        views.push({
          id: `rule_${rule.id}`,
          ruleId: rule.id,
          ruleName: ruleName,
          tableName: tableName,
          type: "single-event",
          data: items,
          stats: stats,
          order: rule.analyticsOrder ?? 0,
          color: rule.analyticsColor ?? "bg-white",
          source: "AUTOMATION",
        });
      }
    }

    // --- Process Custom Views ---
    // --- Process Custom Views ---
    for (const view of customViews) {
      const config = view.config as any;
      let tableName = "System";
      let rawData: any[] = [];

      // 1. Fetch Data Source
      if (config.model === "Task") {
        tableName = "משימות מערכת";
        rawData = await prisma.task.findMany({
          take: 1000,
          orderBy: { createdAt: "desc" },
        });
      } else if (config.model === "Retainer") {
        tableName = "פיננסים: ריטיינרים";
        rawData = await prisma.retainer.findMany({
          take: 1000,
          orderBy: { createdAt: "desc" },
          include: { client: true },
        });
      } else if (config.model === "OneTimePayment") {
        tableName = "פיננסים: תשלומים";
        rawData = await prisma.oneTimePayment.findMany({
          take: 1000,
          orderBy: { createdAt: "desc" },
          include: { client: true },
        });
      } else if (config.model === "Transaction") {
        tableName = "פיננסים: תנועות";
        rawData = await prisma.transaction.findMany({
          take: 1000,
          orderBy: { createdAt: "desc" },
          include: { client: true },
        });
      } else if (config.model === "CalendarEvent") {
        tableName = "יומן: אירועים";
        rawData = await prisma.calendarEvent.findMany({
          take: 1000,
          orderBy: { createdAt: "desc" },
        });
      } else if (config.tableId) {
        tableName = await getTableName(Number(config.tableId));
        rawData = await prisma.record.findMany({
          where: { tableId: Number(config.tableId) },
          orderBy: { createdAt: "desc" },
          take: 1000,
        });
      }

      let stats = null;
      let items: any[] = [];

      // 2. Process View Type
      if (view.type === "CONVERSION") {
        if (config.groupByField) {
          const groups: Record<string, { total: number; success: number }> = {};
          rawData.forEach((r) => {
            if (filterRecords([r], config.totalFilter).length > 0) {
              let rawKey = (r.data as any)?.[config.groupByField];
              if (rawKey === undefined)
                rawKey = (r as any)[config.groupByField];

              const key = rawKey ? String(rawKey) : "ללא";
              if (!groups[key]) groups[key] = { total: 0, success: 0 };
              groups[key].total++;

              if (filterRecords([r], config.successFilter).length > 0) {
                groups[key].success++;
              }
            }
          });

          items = Object.entries(groups)
            .map(([key, val]) => {
              const rate = val.total > 0 ? (val.success / val.total) * 100 : 0;
              return {
                id: key,
                title: key,
                status: `${val.success} / ${val.total}`,
                value: `${rate.toFixed(1)}%`,
                count: val.total,
                type: "conversion-group",
              };
            })
            .sort((a, b) => b.count - a.count);

          const totalAll = Object.values(groups).reduce(
            (acc, g) => acc + g.total,
            0
          );
          const successAll = Object.values(groups).reduce(
            (acc, g) => acc + g.success,
            0
          );
          const globalRate =
            totalAll > 0 ? ((successAll / totalAll) * 100).toFixed(1) : "0";
          stats = {
            mainMetric: `${globalRate}%`,
            subMetric: `סה"כ המרה (${successAll}/${totalAll})`,
            label: "ממוצע כללי",
          };
        } else {
          const totalSet = filterRecords(rawData, config.totalFilter);
          const successSet = filterRecords(rawData, config.successFilter);
          const rate =
            totalSet.length > 0
              ? ((successSet.length / totalSet.length) * 100).toFixed(1)
              : "0";
          stats = {
            mainMetric: `${rate}%`,
            subMetric: `${successSet.length} / ${totalSet.length}`,
            label: "אחוז המרה",
          };

          items = successSet.slice(0, 50).map((r) => ({
            id: r.id,
            title:
              r.title ||
              (r.data as any)?.name ||
              (r.data as any)?.title ||
              `Record ${r.id}`,
            status: r.status || "הושלם",
            updatedAt: r.updatedAt,
          }));
        }
      } else if (view.type === "COUNT") {
        const filtered = filterRecords(rawData, config.filter);

        if (config.groupByField) {
          const groups: Record<string, number> = {};
          filtered.forEach((r) => {
            let rawKey = (r.data as any)?.[config.groupByField];
            if (rawKey === undefined) rawKey = (r as any)[config.groupByField];
            const key = rawKey ? String(rawKey) : "ללא";
            groups[key] = (groups[key] || 0) + 1;
          });

          items = Object.entries(groups)
            .map(([key, count]) => ({
              id: key,
              title: key,
              value: String(count),
              type: "count-group",
            }))
            .sort((a, b) => Number(b.value) - Number(a.value));

          stats = {
            mainMetric: String(filtered.length),
            subMetric: "רשומות",
            label: "סה״כ",
          };
        } else {
          stats = {
            mainMetric: String(filtered.length),
            subMetric: "רשומות",
            label: "כמות",
          };
          items = filtered.slice(0, 50).map((r) => ({
            id: r.id,
            title:
              r.title ||
              (r.data as any)?.name ||
              (r.data as any)?.title ||
              `Record ${r.id}`,
            status: r.status || (r.client ? r.client.name : "-"),
            value: r.amount
              ? `₪${Number(r.amount).toLocaleString()}`
              : undefined,
            updatedAt: r.updatedAt,
          }));
        }
      }

      views.push({
        id: `view_${view.id}`,
        viewId: view.id,
        ruleName: view.title,
        tableName: tableName,
        type: view.type,
        data: items,
        stats: stats,
        order: view.order,
        color: view.color,
        source: "CUSTOM",
        config: config, // Pass config for editing
      });
    }

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

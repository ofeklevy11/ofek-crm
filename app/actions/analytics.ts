"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { canManageAnalytics } from "@/lib/permissions";

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

/**
 * Helper to extract value from record, handling custom fields, system fields, and relations (objects with name/title).
 */
function extractValue(record: any, key: string): any {
  // 1. Try custom data
  let val = (record.data as any)?.[key];

  // 2. Try top-level system field
  if (val === undefined) {
    val = (record as any)[key];
  }

  // 3. Handle relations (e.g. assignee is an User object)
  if (val && typeof val === "object" && !Array.isArray(val)) {
    if ("name" in val) return val.name;
    if ("title" in val) return val.title;
  }

  return val;
}

function extractNumericValue(record: any, key: string): number {
  let val = (record.data as any)?.[key];
  if (val === undefined) val = (record as any)[key];
  if (typeof val === "string") val = val.replace(/[^0-9.-]+/g, ""); // Clean currency/text
  const num = parseFloat(val);
  return isNaN(num) ? 0 : num;
}

/**
 * Helper for flexible matching (case-insensitive, trimmed, string conversion)
 * Also handles "no filter" case properly
 */
function filterRecords(records: any[], filter: any) {
  if (!filter || Object.keys(filter).length === 0) return records;
  return records.filter((r) => {
    return Object.entries(filter).every(([key, value]) => {
      if (!value) return true;

      const dataVal = extractValue(r, key);

      if (dataVal === undefined || dataVal === null) return false;

      const strDataVal = String(dataVal).trim().toLowerCase();

      // Support comma-separated OR logic
      const filterValues = String(value)
        .split(",")
        .map((v) => v.trim().toLowerCase());

      return filterValues.includes(strDataVal);
    });
  });
}

function getDateFilter(config: any) {
  if (!config.dateRangeType || config.dateRangeType === "all") return undefined;

  const now = new Date();
  let startDate: Date | undefined;
  let endDate: Date | undefined;

  switch (config.dateRangeType) {
    case "this_week":
      startDate = new Date(now);
      startDate.setDate(now.getDate() - now.getDay()); // Sunday
      startDate.setHours(0, 0, 0, 0);

      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6); // Saturday
      endDate.setHours(23, 59, 59, 999);
      break;
    case "last_30_days":
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 30);
      break;
    case "last_year":
      startDate = new Date(now);
      startDate.setFullYear(now.getFullYear() - 1);
      break;
    case "custom":
      if (config.customStartDate) startDate = new Date(config.customStartDate);
      if (config.customEndDate) {
        endDate = new Date(config.customEndDate);
        endDate.setHours(23, 59, 59, 999);
      }
      break;
  }

  const filter: any = {};
  if (startDate) filter.gte = startDate;
  if (endDate) filter.lte = endDate;

  return Object.keys(filter).length > 0 ? filter : undefined;
}

const tableNameCache = new Map<number, string>();
const getTableName = async (id: number) => {
  if (!id) return "Unknown Table";
  if (tableNameCache.has(id)) return tableNameCache.get(id)!;
  const t = await prisma.tableMeta.findUnique({ where: { id } });
  const name = t ? t.name : "טבלה לא ידועה";
  tableNameCache.set(id, name);
  return name;
};

/**
 * Calculates stats and items for a SINGLE custom view.
 * Useful for automations to check current value without fetching everything.
 */
export async function calculateViewStats(view: any) {
  const config = view.config as any;
  let tableName = "System";
  let rawData: any[] = [];

  const dateRange = getDateFilter(config);

  const dateField =
    config.model === "CalendarEvent" ? "startTime" : "createdAt";
  const dateFilter = dateRange ? { [dateField]: dateRange } : {};

  // 1. Fetch Data Source
  if (config.model === "Task") {
    tableName = "משימות מערכת";
    rawData = await prisma.task.findMany({
      where: dateFilter,
      take: 1000,
      orderBy: { createdAt: "desc" },
      include: { assignee: true }, // Include assignee for filtering by name
    });
  } else if (config.model === "Retainer") {
    tableName = "פיננסים: ריטיינרים";
    rawData = await prisma.retainer.findMany({
      where: dateFilter,
      take: 1000,
      orderBy: { createdAt: "desc" },
      include: { client: true },
    });
  } else if (config.model === "OneTimePayment") {
    tableName = "פיננסים: תשלומים";
    rawData = await prisma.oneTimePayment.findMany({
      where: dateFilter,
      take: 1000,
      orderBy: { createdAt: "desc" },
      include: { client: true },
    });
  } else if (config.model === "Transaction") {
    tableName = "פיננסים: תנועות";
    rawData = await prisma.transaction.findMany({
      where: dateFilter,
      take: 1000,
      orderBy: { createdAt: "desc" },
      include: { client: true },
    });
  } else if (config.model === "CalendarEvent") {
    tableName = "יומן: אירועים";
    rawData = await prisma.calendarEvent.findMany({
      where: dateFilter,
      take: 1000,
      orderBy: { startTime: "desc" },
    });
  } else if (config.tableId) {
    tableName = await getTableName(Number(config.tableId));
    rawData = await prisma.record.findMany({
      where: { tableId: Number(config.tableId), ...dateFilter },
      orderBy: { createdAt: "desc" },
      take: 1000,
    });
  }

  let stats: any = null;
  let items: any[] = [];

  // 2. Process View Type
  if (view.type === "CONVERSION") {
    // Smart Logic: If filters share the same key, implicit inclusive OR for denominator
    // This solves "Conversion from New to Completed" where a record cannot be both New and Completed at once.
    // We treat the Total as "Funnel Start" which should include "Funnel End".
    const enhancedTotalFilter = { ...config.totalFilter };
    if (config.totalFilter && config.successFilter) {
      Object.keys(config.totalFilter).forEach((key) => {
        if (config.successFilter[key]) {
          const totalVal = String(config.totalFilter[key]);
          const successVal = String(config.successFilter[key]);
          // If values differ, append success value to total value (comma separated)
          if (!totalVal.includes(successVal)) {
            enhancedTotalFilter[key] = `${totalVal},${successVal}`;
          }
        }
      });
    }

    if (config.groupByField) {
      const groups: Record<string, { total: number; success: number }> = {};
      rawData.forEach((r) => {
        // Use enhanced total filter
        if (filterRecords([r], enhancedTotalFilter).length > 0) {
          let rawKey = extractValue(r, config.groupByField);

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
            // rawRate for logic checks
            rawRate: rate,
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
        rawMetric: parseFloat(globalRate), // For automations
      };
    } else {
      const totalSet = filterRecords(rawData, enhancedTotalFilter);
      const successSet = filterRecords(rawData, config.successFilter);
      const rate =
        totalSet.length > 0
          ? ((successSet.length / totalSet.length) * 100).toFixed(1)
          : "0";
      stats = {
        mainMetric: `${rate}%`,
        subMetric: `${successSet.length} / ${totalSet.length}`,
        label: "אחוז המרה",
        rawMetric: parseFloat(rate), // For automations
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
        let rawKey = extractValue(r, config.groupByField);
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
        rawMetric: filtered.length,
      };
    } else {
      stats = {
        mainMetric: String(filtered.length),
        subMetric: "רשומות",
        label: "כמות",
        rawMetric: filtered.length,
      };
      items = filtered.slice(0, 50).map((r) => ({
        id: r.id,
        title:
          r.title ||
          (r.data as any)?.name ||
          (r.data as any)?.title ||
          `Record ${r.id}`,
        status: r.status || (r.client ? r.client.name : "-"),
        value: r.amount ? `₪${Number(r.amount).toLocaleString()}` : undefined,
        updatedAt: r.updatedAt,
      }));
    }
  } else if (view.type === "GRAPH") {
    const filtered = filterRecords(rawData, config.filter);
    const groups: Record<string, { count: number; sum: number }> = {};

    filtered.forEach((r) => {
      let rawKey = extractValue(r, config.groupByField);
      if (rawKey instanceof Date) {
        rawKey = rawKey.toLocaleDateString("he-IL");
      }
      const key = rawKey ? String(rawKey) : "ללא";

      if (!groups[key]) groups[key] = { count: 0, sum: 0 };
      groups[key].count++;

      if (config.yAxisMeasure && config.yAxisMeasure !== "count") {
        groups[key].sum += extractNumericValue(r, config.yAxisField);
      }
    });

    items = Object.entries(groups)
      .map(([key, val]) => {
        let value = val.count;
        if (config.yAxisMeasure === "sum") value = val.sum;
        if (config.yAxisMeasure === "avg")
          value = val.count > 0 ? val.sum / val.count : 0;

        return {
          name: key,
          value: parseFloat(value.toFixed(2)),
          formatted: value.toLocaleString(),
          count: val.count,
        };
      })
      .sort((a, b) => b.value - a.value);

    const totalValue = items.reduce((acc, i) => acc + i.value, 0);
    stats = {
      mainMetric: totalValue.toLocaleString(),
      subMetric:
        config.yAxisMeasure === "count"
          ? "סה״כ רשומות"
          : config.yAxisMeasure === "avg"
          ? "ממוצע כולל"
          : "סכום כולל",
      label: config.chartType || "Graph",
      rawMetric: totalValue,
    };
  }

  return { stats, items, tableName };
}

export async function createAnalyticsView(data: {
  title: string;
  type: string;
  description?: string;
  config: any;
  color?: string;
}) {
  try {
    const user = await getCurrentUser();
    if (!user || !canManageAnalytics(user)) {
      return { success: false, error: "Unauthorized" };
    }

    const view = await prisma.analyticsView.create({
      data: {
        companyId: user.companyId, // CRITICAL: Set companyId for multi-tenancy
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
    const user = await getCurrentUser();
    if (!user || !canManageAnalytics(user)) {
      return { success: false, error: "Unauthorized" };
    }
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
    const user = await getCurrentUser();
    if (!user || !canManageAnalytics(user)) {
      return { success: false, error: "Unauthorized" };
    }

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
    // 1. Fetch Automation Rules (Existing) - FILTERED BY COMPANY
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    const rules = await prisma.automationRule.findMany({
      where: {
        companyId: user.companyId, // CRITICAL: Filter by companyId
        isActive: true,
        actionType: {
          in: ["CALCULATE_DURATION", "CALCULATE_MULTI_EVENT_DURATION"],
        },
      },
    });

    // 2. Fetch Custom Analytics Views (New) - FILTERED BY COMPANY
    const customViews = await prisma.analyticsView.findMany({
      where: { companyId: user.companyId },
    });

    const views = [];

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
          folderId: rule.folderId,
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
          folderId: rule.folderId,
        });
      }
    }

    // --- Process Custom Views ---
    for (const view of customViews) {
      const { stats, items, tableName } = await calculateViewStats(view);

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
        config: view.config, // Pass config for editing
        folderId: view.folderId,
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
  items: { id: number; type: "AUTOMATION" | "CUSTOM"; order: number }[]
) {
  try {
    const user = await getCurrentUser();
    if (!user || !canManageAnalytics(user)) {
      return { success: false, error: "Unauthorized" };
    }

    const updates = items.map((item) => {
      if (item.type === "AUTOMATION") {
        return prisma.automationRule.update({
          where: { id: item.id },
          data: { analyticsOrder: item.order },
        });
      } else {
        return prisma.analyticsView.update({
          where: { id: item.id },
          data: { order: item.order },
        });
      }
    });

    await prisma.$transaction(updates);
    return { success: true };
  } catch (error) {
    console.error("Error updating analytics view order:", error);
    return { success: false, error: "Failed to update order" };
  }
}

export async function updateAnalyticsViewColor(
  id: number,
  type: "AUTOMATION" | "CUSTOM",
  color: string
) {
  try {
    const user = await getCurrentUser();
    if (!user || !canManageAnalytics(user)) {
      return { success: false, error: "Unauthorized" };
    }

    if (type === "AUTOMATION") {
      await prisma.automationRule.update({
        where: { id },
        data: { analyticsColor: color },
      });
    } else {
      await prisma.analyticsView.update({
        where: { id },
        data: { color },
      });
    }
    return { success: true };
  } catch (error) {
    console.error("Error updating analytics view color:", error);
    return { success: false, error: "Failed to update color" };
  }
}

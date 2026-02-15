import { prisma } from "@/lib/prisma";

/**
 * Helper function to parse duration string "Xd Yh Zm Qs" to total seconds
 */
export function parseDurationToSeconds(durationStr: string): number {
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
export function formatSecondsToHebrew(totalSeconds: number): string {
  if (totalSeconds === 0) return "0 שניות";
  const days = Math.floor(totalSeconds / (24 * 3600));
  const hours = Math.floor((totalSeconds % (24 * 3600)) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days} ${days === 1 ? "יום" : "ימים"}`);
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? "שעה" : "שעות"}`);
  if (minutes > 0) parts.push(`${minutes} ${minutes === 1 ? "דקה" : "דקות"}`);
  if (seconds > 0)
    parts.push(`${seconds} ${seconds === 1 ? "שנייה" : "שניות"}`);
  if (parts.length === 0) return "0 שניות";
  return parts.join(", ");
}

/**
 * Helper to extract value from record, handling custom fields, system fields, and relations.
 */
export function extractValue(record: any, key: string): any {
  if (key === "clientName") {
    return record.client?.name || null;
  }

  let val = (record.data as any)?.[key];

  if (val === undefined) {
    val = (record as any)[key];
  }

  if (val && typeof val === "object" && !Array.isArray(val)) {
    if ("name" in val) return val.name;
    if ("title" in val) return val.title;
  }

  return val;
}

export function extractNumericValue(record: any, key: string): number {
  let val = (record.data as any)?.[key];
  if (val === undefined) val = (record as any)[key];
  if (typeof val === "string") val = val.replace(/[^0-9.-]+/g, "");
  const num = parseFloat(val);
  return isNaN(num) ? 0 : num;
}

/**
 * Helper for flexible matching (case-insensitive, trimmed, string conversion)
 */
export function filterRecords(records: any[], filter: any) {
  if (!filter || Object.keys(filter).length === 0) return records;
  return records.filter((r) => {
    return Object.entries(filter).every(([key, value]) => {
      if (!value) return true;

      const dataVal = extractValue(r, key);

      if (dataVal === undefined || dataVal === null) return false;

      const strDataVal = String(dataVal).trim().toLowerCase();

      const filterValues = String(value)
        .split(",")
        .map((v) => v.trim().toLowerCase());

      return filterValues.includes(strDataVal);
    });
  });
}

export function getDateFilter(config: any) {
  if (!config.dateRangeType || config.dateRangeType === "all") return undefined;

  const now = new Date();
  let startDate: Date | undefined;
  let endDate: Date | undefined;

  switch (config.dateRangeType) {
    case "this_week":
      startDate = new Date(now);
      startDate.setDate(now.getDate() - now.getDay());
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);
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

const TABLE_NAME_CACHE_MAX = 500;
const TABLE_NAME_CACHE_TTL = 5 * 60 * 1000; // 5 minutes — prevents stale names in long-lived processes
const tableNameCache = new Map<string, { name: string; ts: number }>();
export const getTableName = async (id: number, companyId: number) => {
  if (!id) return "Unknown Table";
  const cacheKey = `${companyId}:${id}`;
  const entry = tableNameCache.get(cacheKey);
  if (entry && Date.now() - entry.ts < TABLE_NAME_CACHE_TTL) return entry.name;
  // Evict oldest entry if cache exceeds max size (Map preserves insertion order)
  if (tableNameCache.size >= TABLE_NAME_CACHE_MAX) {
    const firstKey = tableNameCache.keys().next().value;
    if (firstKey !== undefined) tableNameCache.delete(firstKey);
  }
  const t = await prisma.tableMeta.findFirst({
    where: { id, companyId },
    select: { name: true },
  });
  const name = t ? t.name : "טבלה לא ידועה";
  tableNameCache.set(cacheKey, { name, ts: Date.now() });
  return name;
};

/**
 * Resolve tableName from a view's config without fetching records.
 */
export async function resolveTableNameFromConfig(config: any, companyId: number): Promise<string> {
  if (config.model === "Task") return "משימות מערכת";
  if (config.model === "Retainer") return "פיננסים: ריטיינרים";
  if (config.model === "OneTimePayment") return "פיננסים: תשלומים";
  if (config.model === "Transaction") return "פיננסים: תנועות";
  if (config.model === "CalendarEvent") return "יומן: אירועים";
  if (config.tableId) return await getTableName(Number(config.tableId), companyId);
  return "System";
}

/**
 * Build a unique cache key for a view's data source (model/tableId + date range).
 * Used by batch prefetch in the background refresh job.
 */
export function buildSourceKey(config: any): string {
  const model = config.model || "";
  const tableId = config.tableId || "";
  const dateType = config.dateRangeType || "all";
  const customStart = config.customStartDate || "";
  const customEnd = config.customEndDate || "";
  return `${model}:${tableId}:${dateType}:${customStart}:${customEnd}`;
}

/**
 * Fetch raw data for a given view config. Extracted so it can be called once per
 * unique source during batch refresh and shared across multiple views.
 */
export async function fetchViewSourceData(
  config: any,
  companyId: number,
): Promise<{ tableName: string; rawData: any[] }> {
  let tableName = "System";
  let rawData: any[] = [];

  const dateRange = getDateFilter(config);
  const dateField =
    config.model === "CalendarEvent" ? "startTime" : "createdAt";
  const dateFilter = dateRange ? { [dateField]: dateRange } : {};
  const companyFilter = companyId ? { companyId } : {};

  if (config.model === "Task") {
    tableName = "משימות מערכת";
    rawData = await prisma.task.findMany({
      where: { ...dateFilter, ...companyFilter },
      take: 1000,
      orderBy: { createdAt: "desc" },
      include: { assignee: { select: { name: true } } },
    });
  } else if (config.model === "Retainer") {
    tableName = "פיננסים: ריטיינרים";
    rawData = await prisma.retainer.findMany({
      where: { ...dateFilter, ...companyFilter },
      take: 1000,
      orderBy: { createdAt: "desc" },
      include: { client: { select: { name: true } } },
    });
  } else if (config.model === "OneTimePayment") {
    tableName = "פיננסים: תשלומים";
    rawData = await prisma.oneTimePayment.findMany({
      where: { ...dateFilter, ...companyFilter },
      take: 1000,
      orderBy: { createdAt: "desc" },
      include: { client: { select: { name: true } } },
    });
  } else if (config.model === "Transaction") {
    tableName = "פיננסים: תנועות";
    rawData = await prisma.transaction.findMany({
      where: { ...dateFilter, ...companyFilter },
      take: 1000,
      orderBy: { createdAt: "desc" },
      include: { client: { select: { name: true } } },
    });
  } else if (config.model === "CalendarEvent") {
    tableName = "יומן: אירועים";
    rawData = await prisma.calendarEvent.findMany({
      where: { ...dateFilter, ...companyFilter },
      take: 1000,
      orderBy: { startTime: "desc" },
    });
  } else if (config.tableId) {
    tableName = await getTableName(Number(config.tableId), companyId);
    rawData = await prisma.record.findMany({
      where: { tableId: Number(config.tableId), ...dateFilter, ...companyFilter },
      orderBy: { createdAt: "desc" },
      take: 1000,
      select: { id: true, data: true, createdAt: true, updatedAt: true },
    });
  }

  return { tableName, rawData };
}

/**
 * Calculates stats and items for a SINGLE custom view.
 * Accepts optional prefetched data to avoid redundant DB queries during batch refresh.
 */
export async function calculateViewStats(
  view: any,
  companyId: number,
  prefetched?: { tableName: string; rawData: any[] },
) {
  const config = view.config as any;
  let tableName: string;
  let rawData: any[];

  // Fast path: table-based COUNT/GRAPH without filter or groupBy → use DB count instead of loading 1000 records
  const hasFilter = config.filter && Object.keys(config.filter).length > 0;
  if (
    !prefetched &&
    config.tableId &&
    view.type === "COUNT" &&
    !config.groupByField &&
    !hasFilter
  ) {
    const dateRange = getDateFilter(config);
    const dateFilter = dateRange ? { createdAt: dateRange } : {};
    const [count, tblName] = await Promise.all([
      prisma.record.count({
        where: { tableId: Number(config.tableId), companyId, ...dateFilter },
      }),
      getTableName(Number(config.tableId), companyId),
    ]);
    return {
      stats: {
        mainMetric: String(count),
        subMetric: "רשומות",
        label: "כמות",
        rawMetric: count,
      },
      items: [],
      tableName: tblName,
    };
  }

  if (prefetched) {
    tableName = prefetched.tableName;
    rawData = prefetched.rawData;
  } else {
    const fetched = await fetchViewSourceData(config, companyId);
    tableName = fetched.tableName;
    rawData = fetched.rawData;
  }

  let stats: any = null;
  let items: any[] = [];

  // 2. Process View Type
  if (view.type === "CONVERSION") {
    const enhancedTotalFilter = { ...config.totalFilter };
    if (config.totalFilter && config.successFilter) {
      Object.keys(config.totalFilter).forEach((key) => {
        const totalVal = String(config.totalFilter[key] || "").trim();
        const successVal = String(config.successFilter[key] || "").trim();

        if (totalVal && successVal && !totalVal.includes(successVal)) {
          enhancedTotalFilter[key] = `${totalVal},${successVal}`;
        }
      });
    }

    if (config.groupByField) {
      const groups: Record<string, { total: number; success: number }> = {};
      rawData.forEach((r) => {
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
            rawRate: rate,
          };
        })
        .sort((a, b) => b.count - a.count);

      const totalAll = Object.values(groups).reduce(
        (acc, g) => acc + g.total,
        0,
      );
      const successAll = Object.values(groups).reduce(
        (acc, g) => acc + g.success,
        0,
      );
      const globalRate =
        totalAll > 0 ? ((successAll / totalAll) * 100).toFixed(1) : "0";
      stats = {
        mainMetric: `${globalRate}%`,
        subMetric: `סה"כ המרה (${successAll}/${totalAll})`,
        label: "ממוצע כללי",
        rawMetric: parseFloat(globalRate),
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
        rawMetric: parseFloat(rate),
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

/**
 * Calculates stats and items for a single automation rule.
 */
export async function calculateRuleStats(
  rule: any,
  companyId: number,
): Promise<{ stats: any; items: any[]; tableName: string }> {
  let items: any[] = [];
  let stats: any = null;
  const triggerConfig = rule.triggerConfig as any;
  const mainTableId = triggerConfig.tableId
    ? parseInt(triggerConfig.tableId)
    : 0;
  const resolvedCompanyId = companyId ?? rule.companyId;
  const tableName =
    rule.triggerType === "TASK_STATUS_CHANGE"
      ? "משימות"
      : await getTableName(mainTableId, resolvedCompanyId);

  // For MULTI_ACTION rules, determine the effective duration action type
  const effectiveActionType = rule.actionType === "MULTI_ACTION"
    ? ((rule.actionConfig as any)?.actions || []).find((a: any) => a.type === "CALCULATE_MULTI_EVENT_DURATION")
      ? "CALCULATE_MULTI_EVENT_DURATION"
      : "CALCULATE_DURATION"
    : rule.actionType;

  if (effectiveActionType === "CALCULATE_MULTI_EVENT_DURATION") {
    const eventTableMap = new Map<string, string>();
    if (triggerConfig.eventChain && Array.isArray(triggerConfig.eventChain)) {
      for (const event of triggerConfig.eventChain) {
        const tId = event.tableId ? Number(event.tableId) : mainTableId;
        if (tId) {
          eventTableMap.set(event.eventName, await getTableName(tId, resolvedCompanyId));
        }
      }
    }

    // P122: take: 1000 already present — verified
    const multiEventDurations = await prisma.multiEventDuration.findMany({
      where: {
        automationRuleId: rule.id,
        automationRule: { companyId: resolvedCompanyId },
        createdAt: { gte: rule.createdAt },
      },
      include: {
        record: { select: { id: true, data: true } },
        task: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 1000,
    });

    items = multiEventDurations.map((d: any) => {
      let title = "Unknown";
      if (d.task) title = d.task.title;
      else if (d.record) {
        const data = d.record.data as any;
        const titleField =
          Object.keys(data).find(
            (k) =>
              k.toLowerCase().includes("name") ||
              k.toLowerCase().includes("title") ||
              (typeof data[k] === "string" && data[k].length < 50),
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
        duration: formatSecondsToHebrew(d.totalDurationSeconds || 0),
        totalDurationSeconds: d.totalDurationSeconds,
        weightedScore: d.weightedScore,
        updatedAt: d.createdAt,
        type: tableName,
      };
    });

    if (items.length > 0) {
      const totalSeconds = items.reduce(
        (acc, item) => acc + item.totalDurationSeconds,
        0,
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
  } else if (effectiveActionType === "CALCULATE_DURATION") {
    const durations = await prisma.statusDuration.findMany({
      where: {
        automationRuleId: rule.id,
        automationRule: { companyId: resolvedCompanyId },
        createdAt: { gte: rule.createdAt },
      },
      include: {
        record: { select: { id: true, data: true } },
        task: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 1000,
    });

    items = durations.map((d: any) => {
      let title = "Unknown";
      if (d.task) title = d.task.title;
      else if (d.record) {
        const data = d.record.data as any;
        const titleField =
          Object.keys(data).find(
            (k) =>
              k.toLowerCase().includes("name") ||
              k.toLowerCase().includes("title") ||
              (typeof data[k] === "string" && data[k].length < 50),
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
        duration: formatSecondsToHebrew(d.durationSeconds || 0),
        durationSeconds: d.durationSeconds,
        updatedAt: d.createdAt,
        type: tableName,
      };
    });

    if (items.length > 0) {
      const totalSeconds = items.reduce(
        (acc, item) => acc + item.durationSeconds,
        0,
      );
      const avg = Math.round(totalSeconds / items.length);
      stats = {
        averageDuration: formatSecondsToHebrew(avg),
        minDuration: formatSecondsToHebrew(
          Math.min(...items.map((i) => i.durationSeconds)),
        ),
        maxDuration: formatSecondsToHebrew(
          Math.max(...items.map((i) => i.durationSeconds)),
        ),
        totalRecords: items.length,
        averageSeconds: avg,
      };
    }
  }

  return { stats, items, tableName };
}

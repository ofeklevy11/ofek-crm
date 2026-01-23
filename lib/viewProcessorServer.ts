import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ViewConfig } from "@/app/actions/views";
import { getCachedMetric } from "@/lib/services/cache-service";

interface ViewProcessParams {
  tableId: number;
  companyId: number;
  config: ViewConfig;
  forceRefresh?: boolean;
}

export async function processViewServer({
  tableId,
  companyId,
  config,
  forceRefresh = false,
}: ViewProcessParams) {
  const { type } = config;

  // 1. Build WHERE clause with filters
  const whereClause = buildWhereClause(tableId, companyId, config);

  // 2. Process based on view type
  switch (type) {
    case "stats":
      return await processStatsServer(
        whereClause,
        config,
        companyId,
        tableId,
        forceRefresh,
      );
    case "aggregation":
    case "chart": // Charts usually use aggregation data
      return await processAggregationServer(
        whereClause,
        config,
        companyId,
        tableId,
        forceRefresh,
      );
    case "legend":
      return await processLegendServer(whereClause, config);
    default:
      return { type: "unknown", data: {} };
  }
}

function buildWhereClause(
  tableId: number,
  companyId: number,
  config: ViewConfig,
) {
  const conditions: Prisma.Sql[] = [];

  // Base conditions
  conditions.push(Prisma.sql`"tableId" = ${tableId}`);
  conditions.push(Prisma.sql`"companyId" = ${companyId}`);

  // Custom filters
  if (config.filters && config.filters.length > 0) {
    for (const filter of config.filters) {
      if (!filter.field || filter.value === undefined || filter.value === "")
        continue;

      const field = filter.field;
      // Check if it's a system field or data field
      const isSystemField = ["createdAt", "updatedAt"].includes(field);
      const columnRef = isSystemField
        ? Prisma.raw(`"${field}"`)
        : Prisma.raw(`"data"->>'${field.replace(/'/g, "''")}'`); // Basic sanitization

      switch (filter.operator) {
        case "equals":
          conditions.push(Prisma.sql`${columnRef} = ${String(filter.value)}`);
          break;
        case "neq":
          conditions.push(Prisma.sql`${columnRef} != ${String(filter.value)}`);
          break;
        case "contains":
          conditions.push(
            Prisma.sql`${columnRef} ILIKE ${"%" + filter.value + "%"}`,
          );
          break;
        case "includes":
          // For array fields in JSON: data->'field' @> '["value"]'
          // Or strict text match if it's not actually an array in DB but treated as one
          // Assuming JSONB array:
          if (isSystemField) {
            conditions.push(Prisma.sql`${columnRef} = ${String(filter.value)}`);
          } else {
            // Try both string match and JSON array containment
            conditions.push(
              Prisma.sql`("data"->'${Prisma.raw(field.replace(/'/g, "''"))}' @> ${JSON.stringify([filter.value])}::jsonb OR ${columnRef} = ${String(filter.value)})`,
            );
          }
          break;
        case "gt":
          conditions.push(
            Prisma.sql`(${columnRef})::numeric > ${Number(filter.value)}`,
          );
          break;
        case "lt":
          conditions.push(
            Prisma.sql`(${columnRef})::numeric < ${Number(filter.value)}`,
          );
          break;
        case "gte":
          conditions.push(
            Prisma.sql`(${columnRef})::numeric >= ${Number(filter.value)}`,
          );
          break;
        case "lte":
          conditions.push(
            Prisma.sql`(${columnRef})::numeric <= ${Number(filter.value)}`,
          );
          break;
      }
    }
  }

  // Date filters
  if (config.dateFilter && config.dateFilter.type !== "all") {
    const {
      field,
      type,
      startDate: customStart,
      endDate: customEnd,
    } = config.dateFilter;
    if (field) {
      const isSystemField = ["createdAt", "updatedAt"].includes(field);
      const columnRef = isSystemField
        ? Prisma.raw(`"${field}"`)
        : Prisma.raw(`("data"->>'${field.replace(/'/g, "''")}')::timestamp`);

      const now = new Date();
      let start: Date, end: Date;

      if (type === "week") {
        start = new Date(now);
        start.setDate(now.getDate() - 7);
        start.setHours(0, 0, 0, 0);
        end = new Date();
        end.setHours(23, 59, 59, 999);
      } else if (type === "month") {
        start = new Date(now);
        start.setMonth(now.getMonth() - 1);
        start.setHours(0, 0, 0, 0);
        end = new Date();
        end.setHours(23, 59, 59, 999);
      } else if (type === "custom" && customStart) {
        start = new Date(customStart);
        start.setHours(0, 0, 0, 0);
        if (customEnd) {
          end = new Date(customEnd);
          end.setHours(23, 59, 59, 999);
        } else {
          end = new Date();
          end.setHours(23, 59, 59, 999);
        }
      } else {
        // Default fallthrough (shouldn't happen with correct config)
        start = new Date(0);
        end = new Date();
      }

      conditions.push(
        Prisma.sql`${columnRef} >= ${start} AND ${columnRef} <= ${end}`,
      );
    }
  }

  return conditions.length > 0
    ? Prisma.sql`${Prisma.join(conditions, " AND ")}`
    : Prisma.sql`1=1`;
}

async function processStatsServer(
  whereClause: Prisma.Sql,
  config: ViewConfig,
  companyId: number,
  tableId: number,
  forceRefresh: boolean = false,
) {
  // Stats view usually shows "New this week/month" or total count

  const cacheKey = `view_stats:${companyId}:${tableId}:${JSON.stringify(config)}`;
  const ttl = forceRefresh ? 0 : 4 * 60 * 60; // 0 seconds vs 4 hours

  return await getCachedMetric(
    cacheKey,
    async () => {
      // We need two counts:
      // 1. Total filtered count (based on regular filters)
      // 2. Time-filtered count (if applicable) - but processView logic seems to apply date filter to MAIN count

      // In `processView`: `actualCount` is filtered by ALL filters + dateFilter.
      // And it compares again with `startDate` (redundant if dateFilter is applied perfectly, but let's see).

      // Actually `processStatsView` in client applies `config.filters` AND `config.dateFilter`.
      // So the whereClause we built ALREADY includes the date filter if present.

      // Wait, `processStatsView` (client) has specific logic:
      // It handles `config.timeRange` SEPARATELY from `config.dateFilter`.
      // `config.timeRange` seems to be legacy or specific to stats view ("week", "month", "all").
      // Let's implement that.

      let timeRangeClause = Prisma.sql`1=1`;
      if (config.timeRange && config.timeRange !== "all") {
        const now = new Date();
        let start: Date;

        // Default to checking 'createdAt' for timeRange if no specific field?
        // Client code: `r.createdAt && new Date(r.createdAt) >= startDate`
        // So it uses `createdAt`.

        if (config.timeRange === "week") {
          start = new Date(now);
          start.setDate(now.getDate() - now.getDay()); // Start of week (Sunday/Monday?)
          start.setHours(0, 0, 0, 0);
        } else {
          // month
          start = new Date(now.getFullYear(), now.getMonth(), 1);
        }

        timeRangeClause = Prisma.sql`"createdAt" >= ${start}`;
      }

      // So count is WHERE (filters) AND (timeRange)
      const query = Prisma.sql`SELECT COUNT(*) as count FROM "Record" WHERE ${whereClause} AND ${timeRangeClause}`;
      const result = await prisma.$queryRaw<[{ count: bigint }]>(query);
      const actualCount = Number(result[0].count);
      const MAX_DISPLAY_COUNT = 999;

      return {
        type: "stats",
        title: config.title,
        data: {
          count:
            actualCount > MAX_DISPLAY_COUNT ? MAX_DISPLAY_COUNT : actualCount,
          actualCount,
          isOverLimit: actualCount > MAX_DISPLAY_COUNT,
          timeRange: config.timeRange,
        },
      };
    },
    ttl,
  );
}

async function processAggregationServer(
  whereClause: Prisma.Sql,
  config: ViewConfig,
  companyId: number,
  tableId: number,
  forceRefresh: boolean = false,
) {
  // Generate a unique key for this specific view configuration
  // We use JSON.stringify(config) to capture all filters, fields, and settings.
  // This ensures that if the user changes ANY filter, they get a fresh result.
  const cacheKey = `view_agg:${companyId}:${tableId}:${JSON.stringify(config)}`;

  // Determine TTL: if forceRefresh is true, we want to bypass the cache check.
  // We can pass 0 or a very small number as TTL to force specific behavior
  // in getCachedMetric. However, getCachedMetric logic is: if (updatedAt > now - ttl) return cached;
  // If we pass ttl=0, cutoff = now. updatedAt (past) > now (future) is FALSE. So it will be treated as stale.
  // But wait, if we calculate a NEW value, we don't want it to expire immediately!
  // The cache service stores 'updatedAt' as NOW.
  // Next read with ttl=4h: updatedAt(Now) > (Now - 4h) -> VALID.
  // So passing ttl=0 for THIS call is correct to FORCE RECALCULATION.
  const ttl = forceRefresh ? 0 : 4 * 60 * 60; // 0 seconds vs 4 hours

  // Wrap the heavy database work in our cache service
  return await getCachedMetric(
    cacheKey,
    async () => {
      // Check for Group By
      if (config.groupByField) {
        const field = config.groupByField;
        const isSystem = ["createdAt", "updatedAt"].includes(field);
        const col = isSystem
          ? Prisma.raw(`"${field}"`)
          : Prisma.raw(`"data"->>'${field.replace(/'/g, "''")}'`);

        // We also need aggregated target field if present
        let aggSelect = Prisma.sql``;
        if (config.targetField) {
          const tf = config.targetField;
          // Ensure target is cast to numeric
          const targetCol = Prisma.raw(
            `("data"->>'${tf.replace(/'/g, "''")}')::numeric`,
          );

          if (config.aggregationType === "sum") {
            aggSelect = Prisma.sql`, SUM(${targetCol}) as sum`;
          } else if (config.aggregationType === "avg") {
            aggSelect = Prisma.sql`, AVG(${targetCol}) as avg`;
          }
        }

        const query = Prisma.sql`
              SELECT ${col} as label, COUNT(*) as count ${aggSelect}
              FROM "Record"
              WHERE ${whereClause}
              GROUP BY ${col}
          `;

        const groups = await prisma.$queryRaw<any[]>(query);

        const totalCount = groups.reduce((acc, g) => acc + Number(g.count), 0);
        const processedGroups = groups.map((g) => ({
          label: g.label || "N/A", // Handle nulls
          count: Number(g.count),
          sum: g.sum ? Number(g.sum) : 0,
          avg: g.avg ? Number(g.avg) : 0,
          percentage: totalCount > 0 ? (Number(g.count) / totalCount) * 100 : 0,
        }));

        return {
          type: config.type, // 'aggregation' or 'chart'
          title: config.title,
          data: {
            groups: processedGroups,
            groupByField: config.groupByField,
            targetField: config.targetField,
            aggregationType: config.aggregationType,
            colorMapping: config.colorMapping,
            chartType: config.chartType,
          },
        };
      }

      // Simple Aggregation (No Group By)
      if (config.aggregationType === "count") {
        const query = Prisma.sql`SELECT COUNT(*) as count FROM "Record" WHERE ${whereClause}`;
        const res = await prisma.$queryRaw<[{ count: bigint }]>(query);
        const count = Number(res[0].count);

        return {
          type: "aggregation",
          title: config.title,
          data: {
            aggregationType: "count",
            result: count,
            count: count,
          },
        };
      }

      if (config.targetField) {
        const tf = config.targetField;
        const targetCol = Prisma.raw(
          `("data"->>'${tf.replace(/'/g, "''")}')::numeric`,
        );
        let query = Prisma.sql``;

        if (config.aggregationType === "sum") {
          query = Prisma.sql`SELECT SUM(${targetCol}) as res, COUNT(*) as count FROM "Record" WHERE ${whereClause}`;
        } else if (config.aggregationType === "avg") {
          query = Prisma.sql`SELECT AVG(${targetCol}) as res, COUNT(*) as count FROM "Record" WHERE ${whereClause}`;
        }

        const res =
          await prisma.$queryRaw<[{ res: number | null; count: bigint }]>(
            query,
          );
        const val = res[0].res ? Number(res[0].res) : 0;
        const count = Number(res[0].count);

        return {
          type: "aggregation",
          title: config.title,
          data: {
            aggregationType: config.aggregationType,
            field: config.targetField,
            result: val,
            count: count,
          },
        };
      }

      return {
        type: "aggregation",
        title: config.title,
        data: { error: "Invalid Config" },
      };
    },
    ttl,
  );
}

async function processLegendServer(
  whereClause: Prisma.Sql,
  config: ViewConfig,
) {
  // Legend view counts items based on legend field
  if (!config.legendField) {
    return {
      type: "legend",
      title: config.title,
      data: { items: [], totalCount: 0 },
    };
  }

  // Group by legend field
  const field = config.legendField;
  const isSystem = ["createdAt", "updatedAt"].includes(field);
  const col = isSystem
    ? Prisma.raw(`"${field}"`)
    : Prisma.raw(`"data"->>'${field.replace(/'/g, "''")}'`);

  const query = Prisma.sql`
        SELECT ${col} as label, COUNT(*) as count 
        FROM "Record" 
        WHERE ${whereClause} 
        GROUP BY ${col}
    `;

  const groups = await prisma.$queryRaw<any[]>(query);
  const totalCountQuery = Prisma.sql`SELECT COUNT(*) as count FROM "Record" WHERE ${whereClause}`;
  const totalRes = await prisma.$queryRaw<[{ count: bigint }]>(totalCountQuery);
  const totalCount = Number(totalRes[0].count);

  const items = config.legendItems || [];
  const itemsWithCounts = items.map((item) => {
    // Find matching group
    // If the group label matches item label
    // Note: Client side logic handles multi-select arrays for legend too.
    // Here we do simple string matching.
    const match = groups.find((g) => String(g.label) === item.label);
    return {
      ...item,
      count: match ? Number(match.count) : 0,
    };
  });

  return {
    type: "legend",
    title: config.title,
    data: {
      items: itemsWithCounts,
      totalCount,
    },
  };
}

import { ViewConfig } from "@/app/actions/views";

interface SchemaField {
  name: string;
  type: string;
  label: string;
  options?: string[];
  relationTableId?: number;
  displayField?: string;
}

interface TableRecord {
  id: number;
  data: any;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProcessedViewData {
  type: string;
  title: string;
  data: any;
}

/**
 * Process a view configuration and return the computed data
 */
export function processView(
  config: ViewConfig,
  records: TableRecord[],
  schema: SchemaField[]
): ProcessedViewData {
  const { type, title } = config;

  switch (type) {
    case "stats":
      return processStatsView(config, records);
    case "aggregation":
      return processAggregationView(config, records, schema);
    case "legend":
      return processLegendView(config, records, schema);
    case "chart":
      return processChartView(config, records, schema);
    default:
      return { type: "unknown", title, data: {} };
  }
}

/**
 * Process time-based statistics (e.g., new records this week/month)
 */
function processStatsView(
  config: ViewConfig,
  records: TableRecord[]
): ProcessedViewData {
  const now = new Date();
  let startDate: Date;

  switch (config.timeRange) {
    case "week":
      startDate = new Date(now);
      startDate.setDate(now.getDate() - now.getDay());
      startDate.setHours(0, 0, 0, 0);
      break;
    case "month":
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case "all":
    default:
      startDate = new Date(0);
  }

  const filteredRecords = applyFilters(
    records,
    config.filters || [],
    config.dateFilter
  );
  const actualCount = filteredRecords.filter(
    (r) => r.createdAt && new Date(r.createdAt) >= startDate
  ).length;

  const MAX_DISPLAY_COUNT = 999;
  const isOverLimit = actualCount > MAX_DISPLAY_COUNT;
  const displayCount = isOverLimit ? MAX_DISPLAY_COUNT : actualCount;

  return {
    type: "stats",
    title: config.title,
    data: {
      count: displayCount,
      actualCount,
      isOverLimit,
      timeRange: config.timeRange,
    },
  };
}

/**
 * Process aggregation views (sum, count, avg, group by)
 */
function processAggregationView(
  config: ViewConfig,
  records: TableRecord[],
  schema: SchemaField[]
): ProcessedViewData {
  // Debug: see what config we receive
  console.log("🔍 processAggregationView config:", {
    type: config.type,
    aggregationType: config.aggregationType,
    targetField: config.targetField,
    dateFilter: config.dateFilter,
    hasDateFilter: !!config.dateFilter,
  });

  const filteredRecords = applyFilters(
    records,
    config.filters || [],
    config.dateFilter
  );

  if (config.groupByField) {
    return processGroupByAggregation(config, filteredRecords, schema);
  }

  // Simple aggregation
  // For count, just count the filtered records
  if (config.aggregationType === "count") {
    return {
      type: "aggregation",
      title: config.title,
      data: {
        aggregationType: "count",
        result: filteredRecords.length,
        count: filteredRecords.length,
      },
    };
  }

  // For sum/avg, we need a target field
  if (!config.targetField) {
    return {
      type: "aggregation",
      title: config.title,
      data: {
        error: "No target field specified for aggregation",
        aggregationType: config.aggregationType,
      },
    };
  }

  const field = schema.find((f) => f.name === config.targetField);
  if (!field) {
    return {
      type: "aggregation",
      title: config.title,
      data: {
        error: `Field "${config.targetField}" not found in schema`,
        availableFields: schema
          .filter((f) => f.type === "number")
          .map((f) => f.name),
      },
    };
  }

  let result = 0;
  switch (config.aggregationType) {
    case "sum":
      result = filteredRecords.reduce((sum, r) => {
        const val = parseFloat(r.data?.[config.targetField!]);
        return sum + (isNaN(val) ? 0 : val);
      }, 0);
      break;
    case "avg":
      const sum = filteredRecords.reduce((sum, r) => {
        const val = parseFloat(r.data?.[config.targetField!]);
        return sum + (isNaN(val) ? 0 : val);
      }, 0);
      result = filteredRecords.length > 0 ? sum / filteredRecords.length : 0;
      break;
  }

  return {
    type: "aggregation",
    title: config.title,
    data: {
      aggregationType: config.aggregationType,
      field: config.targetField,
      result,
      count: filteredRecords.length,
    },
  };
}

/**
 * Process group-by aggregations (e.g., count by status, sum by category)
 */
function processGroupByAggregation(
  config: ViewConfig,
  records: TableRecord[],
  schema: SchemaField[]
): ProcessedViewData {
  const groupField = schema.find((f) => f.name === config.groupByField);
  if (!groupField) {
    return {
      type: "aggregation",
      title: config.title,
      data: { error: "Group field not found" },
    };
  }

  const groups: Record<string, any> = {};

  records.forEach((record) => {
    let groupValues: string[] = [];
    const val = record.data?.[config.groupByField!];

    // Handle multi-select/array fields
    if (Array.isArray(val)) {
      groupValues = val.map((v) => String(v));
    } else if (val !== null && val !== undefined && val !== "") {
      groupValues = [String(val)];
    }

    groupValues.forEach((groupValue) => {
      if (!groups[groupValue]) {
        groups[groupValue] = {
          label: groupValue,
          count: 0,
          sum: 0,
          records: [],
        };
      }

      groups[groupValue].count++;
      groups[groupValue].records.push(record);

      // If we have a target field for sum/avg
      if (config.targetField) {
        const targetVal = parseFloat(record.data?.[config.targetField]);
        if (!isNaN(targetVal)) {
          groups[groupValue].sum += targetVal;
        }
      }
    });
  });

  // Calculate percentages
  const totalRecords = records.length;
  const groupsArray = Object.values(groups).map((group: any) => ({
    ...group,
    percentage: totalRecords > 0 ? (group.count / totalRecords) * 100 : 0,
    avg: group.count > 0 ? group.sum / group.count : 0,
  }));

  return {
    type: "aggregation",
    title: config.title,
    data: {
      groups: groupsArray,
      groupByField: config.groupByField,
      targetField: config.targetField,
      aggregationType: config.aggregationType,
      colorMapping: config.colorMapping,
    },
  };
}

/**
 * Process legend views (static color/label mappings, enhanced with counts)
 */
function processLegendView(
  config: ViewConfig,
  records: TableRecord[],
  schema: SchemaField[]
): ProcessedViewData {
  // Apply filters first
  const filteredRecords = applyFilters(
    records,
    config.filters || [],
    config.dateFilter
  );

  // If we have a legend field, calculate counts
  const items = config.legendItems || [];

  if (config.legendField) {
    const fieldName = config.legendField;

    // Calculate counts for each item
    const itemsWithCounts = items.map((item) => {
      const count = filteredRecords.filter((record) => {
        const val = record.data?.[fieldName];
        // Handle array values (multi-select)
        if (Array.isArray(val)) {
          return val.some((v) => String(v) === item.label);
        }
        return String(val) === item.label;
      }).length;

      return {
        ...item,
        count,
      };
    });

    return {
      type: "legend",
      title: config.title,
      data: {
        items: itemsWithCounts,
        totalCount: filteredRecords.length,
      },
    };
  }

  return {
    type: "legend",
    title: config.title,
    data: {
      items,
      totalCount: filteredRecords.length,
    },
  };
}

/**
 * Process chart views (similar to aggregation but formatted for charts)
 */
function processChartView(
  config: ViewConfig,
  records: TableRecord[],
  schema: SchemaField[]
): ProcessedViewData {
  // For now, charts use the same processing as aggregations
  const aggregationResult = processAggregationView(config, records, schema);

  return {
    type: "chart",
    title: config.title,
    data: {
      ...aggregationResult.data,
      chartType: config.chartType,
    },
  };
}

/**
 * Apply filters to records based on view configuration
 */
export function applyFilters(
  records: TableRecord[],
  filters: Array<{
    field: string;
    operator:
      | "equals"
      | "contains"
      | "includes"
      | "gt"
      | "lt"
      | "gte"
      | "lte"
      | "neq";
    value: any;
  }>,
  dateFilter?: {
    field: string;
    type: "week" | "month" | "custom" | "all";
    startDate?: string;
    endDate?: string;
  }
): TableRecord[] {
  let filteredRecords = records;

  // Apply regular filters
  if (filters && filters.length > 0) {
    filteredRecords = filteredRecords.filter((record) => {
      return filters.every((filter) => {
        const recordValue = record.data?.[filter.field];

        switch (filter.operator) {
          case "equals":
            return recordValue === filter.value;
          case "contains":
            return String(recordValue)
              .toLowerCase()
              .includes(String(filter.value).toLowerCase());
          case "includes":
            if (Array.isArray(recordValue)) {
              return recordValue.includes(filter.value);
            }
            return recordValue === filter.value;
          case "gt":
            return Number(recordValue) > Number(filter.value);
          case "lt":
            return Number(recordValue) < Number(filter.value);
          case "gte":
            return Number(recordValue) >= Number(filter.value);
          case "lte":
            return Number(recordValue) <= Number(filter.value);
          case "neq":
            return recordValue !== filter.value;
          default:
            return true;
        }
      });
    });
  }

  // Apply date filter
  if (dateFilter && dateFilter.type !== "all") {
    const now = new Date();
    let startDate: Date;
    let endDate: Date = new Date();

    switch (dateFilter.type) {
      case "week":
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 7);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        break;
      case "month":
        startDate = new Date(now);
        startDate.setMonth(now.getMonth() - 1);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        break;
      case "custom":
        if (dateFilter.startDate) {
          // Parse date as YYYY-MM-DD and create in local timezone
          const [year, month, day] = dateFilter.startDate
            .split("-")
            .map(Number);
          startDate = new Date(year, month - 1, day, 0, 0, 0, 0);
        } else {
          startDate = new Date(0);
        }
        if (dateFilter.endDate) {
          // Parse date as YYYY-MM-DD and create in local timezone
          const [year, month, day] = dateFilter.endDate.split("-").map(Number);
          endDate = new Date(year, month - 1, day, 23, 59, 59, 999);
        } else {
          endDate = new Date();
          endDate.setHours(23, 59, 59, 999);
        }
        break;
      default:
        return filteredRecords;
    }

    filteredRecords = filteredRecords.filter((record) => {
      // Check if the field is a system field (createdAt, updatedAt) or a custom field
      const dateValue =
        dateFilter.field === "createdAt" || dateFilter.field === "updatedAt"
          ? record[dateFilter.field as keyof TableRecord]
          : record.data?.[dateFilter.field];

      if (!dateValue) return false;

      const recordDate = new Date(dateValue);

      // Debug log (remove in production)
      console.log("Date filter:", {
        field: dateFilter.field,
        recordValue: dateValue,
        recordDate: recordDate.toISOString(),
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        passes: recordDate >= startDate && recordDate <= endDate,
      });

      return recordDate >= startDate && recordDate <= endDate;
    });
  }

  return filteredRecords;
}

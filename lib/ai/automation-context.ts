import { prisma } from "@/lib/prisma";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AutomationRawContext {
  tableIds: Set<number>;
  userIds: Set<number>;
  fieldIdsByTable: Map<number, Set<string>>;
  fieldNameToId: Map<number, Map<string, string>>;
  fieldOptionsByTable: Map<number, Map<string, string[]>>;
  nurtureListSlugs: Set<string>;
}

export interface AutomationFormattedContext {
  orgMetadata: string;
  tables: string;
  users: string;
  existingAutomations: string;
  workflows: string;
  nurtureListsText: string;
  sampleData: string;
}

export interface AutomationContext {
  formatted: AutomationFormattedContext;
  _raw: AutomationRawContext;
}

// Serializable version for Inngest event payloads
export interface SerializedRawContext {
  tableIds: number[];
  userIds: number[];
  fieldIdsByTable: Record<number, string[]>;
  fieldNameToId: Record<number, Record<string, string>>;
  fieldOptionsByTable: Record<number, Record<string, string[]>>;
  nurtureListSlugs: string[];
}

// ─── Token Budget ────────────────────────────────────────────────────────────

const MAX_TOTAL_CHARS = 24000;
const PRIORITY_1_BUDGET = 16000; // tables + users + org metadata
const PRIORITY_2_BUDGET = 5000;  // existing automations + workflows
const PRIORITY_3_BUDGET = 3000;  // sample data + nurture lists

const MAX_FIELDS_PER_TABLE = 30;
const MAX_SAMPLE_TABLES = 5;
const MAX_SAMPLE_ROWS = 3;
const MAX_SAMPLE_VALUE_LEN = 50;

// ─── Main Function ───────────────────────────────────────────────────────────

export async function buildAutomationContext(companyId: number): Promise<AutomationContext> {
  // Phase 1: Parallel queries
  const [
    company,
    tables,
    users,
    automations,
    workflows,
    nurtureLists,
    taskStatusDist,
    ticketStatusDist,
    clientCount,
  ] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, businessType: true, businessWebsite: true, businessEmail: true },
    }),
    prisma.tableMeta.findMany({
      where: { companyId, deletedAt: null },
      select: { id: true, name: true, slug: true, schemaJson: true },
      take: 50,
    }),
    prisma.user.findMany({
      where: { companyId },
      select: { id: true, name: true, email: true, role: true },
      take: 50,
    }),
    prisma.automationRule.findMany({
      where: { companyId },
      select: {
        id: true,
        name: true,
        triggerType: true,
        actionType: true,
        isActive: true,
        triggerConfig: true,
        actionConfig: true,
      },
      take: 50,
    }),
    prisma.workflow.findMany({
      where: { companyId },
      select: {
        id: true,
        name: true,
        stages: {
          select: { name: true, order: true },
          orderBy: { order: "asc" },
        },
      },
      take: 20,
    }),
    prisma.nurtureList.findMany({
      where: { companyId },
      select: { id: true, name: true, slug: true },
      take: 20,
    }),
    prisma.task.groupBy({
      by: ["status"],
      where: { companyId },
      _count: { status: true },
    }),
    prisma.ticket.groupBy({
      by: ["status"],
      where: { companyId },
      _count: { status: true },
    }),
    prisma.client.count({ where: { companyId, deletedAt: null } }),
  ]);

  // Phase 2: Sample records for up to MAX_SAMPLE_TABLES tables
  const sampleTables = tables.slice(0, MAX_SAMPLE_TABLES);
  const sampleRecords = await Promise.all(
    sampleTables.map((t) =>
      prisma.record.findMany({
        where: { tableId: t.id },
        select: { data: true },
        take: MAX_SAMPLE_ROWS,
        orderBy: { createdAt: "desc" },
      })
    )
  );

  // ─── Build raw context for validation ──────────────────────────────────────

  const tableIds = new Set<number>(tables.map((t) => t.id));
  const userIds = new Set<number>(users.map((u) => u.id));
  const fieldIdsByTable = new Map<number, Set<string>>();
  const fieldNameToId = new Map<number, Map<string, string>>();
  const fieldOptionsByTable = new Map<number, Map<string, string[]>>();
  const nurtureListSlugs = new Set<string>(nurtureLists.map((n) => n.slug));

  for (const table of tables) {
    const fields = parseSchemaFields(table.schemaJson);
    const idSet = new Set<string>();
    const nameMap = new Map<string, string>();
    const optionsMap = new Map<string, string[]>();
    for (const f of fields) {
      if (f.id) {
        idSet.add(f.id);
        if (f.name) nameMap.set(f.name.toLowerCase(), f.id);
        if (f.label) nameMap.set(f.label.toLowerCase(), f.id);
        if (f.options && f.options.length > 0) {
          optionsMap.set(f.id, f.options);
        }
      }
    }
    fieldIdsByTable.set(table.id, idSet);
    fieldNameToId.set(table.id, nameMap);
    fieldOptionsByTable.set(table.id, optionsMap);
  }

  const _raw: AutomationRawContext = {
    tableIds,
    userIds,
    fieldIdsByTable,
    fieldNameToId,
    fieldOptionsByTable,
    nurtureListSlugs,
  };

  // ─── Format sections ──────────────────────────────────────────────────────

  // Priority 1: org metadata, tables, users
  const orgMetadata = formatOrgMetadata(company, clientCount, taskStatusDist, ticketStatusDist);
  const tablesText = formatTables(tables);
  const usersText = formatUsers(users);

  // Priority 2: existing automations, workflows
  const automationsText = formatAutomations(automations);
  const workflowsText = formatWorkflows(workflows);

  // Priority 3: sample data, nurture lists
  const sampleDataText = formatSampleData(sampleTables, sampleRecords);
  const nurtureListsText = formatNurtureLists(nurtureLists);

  // Apply token budget with priority-based truncation
  const formatted = applyTokenBudget({
    orgMetadata,
    tables: tablesText,
    users: usersText,
    existingAutomations: automationsText,
    workflows: workflowsText,
    sampleData: sampleDataText,
    nurtureListsText,
  });

  return { formatted, _raw };
}

// ─── Serialization helpers ───────────────────────────────────────────────────

export function serializeRawContext(raw: AutomationRawContext): SerializedRawContext {
  const fieldIdsByTable: Record<number, string[]> = {};
  for (const [tableId, ids] of raw.fieldIdsByTable) {
    fieldIdsByTable[tableId] = [...ids];
  }
  const fieldNameToId: Record<number, Record<string, string>> = {};
  for (const [tableId, nameMap] of raw.fieldNameToId) {
    fieldNameToId[tableId] = Object.fromEntries(nameMap);
  }
  const fieldOptionsByTable: Record<number, Record<string, string[]>> = {};
  for (const [tableId, optionsMap] of raw.fieldOptionsByTable) {
    fieldOptionsByTable[tableId] = Object.fromEntries(optionsMap);
  }
  return {
    tableIds: [...raw.tableIds],
    userIds: [...raw.userIds],
    fieldIdsByTable,
    fieldNameToId,
    fieldOptionsByTable,
    nurtureListSlugs: [...raw.nurtureListSlugs],
  };
}

export function deserializeRawContext(s: SerializedRawContext): AutomationRawContext {
  const fieldIdsByTable = new Map<number, Set<string>>();
  for (const [tableId, ids] of Object.entries(s.fieldIdsByTable)) {
    fieldIdsByTable.set(Number(tableId), new Set(ids));
  }
  const fieldNameToId = new Map<number, Map<string, string>>();
  for (const [tableId, nameMap] of Object.entries(s.fieldNameToId)) {
    fieldNameToId.set(Number(tableId), new Map(Object.entries(nameMap)));
  }
  const fieldOptionsByTable = new Map<number, Map<string, string[]>>();
  if (s.fieldOptionsByTable) {
    for (const [tableId, optionsObj] of Object.entries(s.fieldOptionsByTable)) {
      fieldOptionsByTable.set(Number(tableId), new Map(Object.entries(optionsObj)));
    }
  }
  return {
    tableIds: new Set(s.tableIds),
    userIds: new Set(s.userIds),
    fieldIdsByTable,
    fieldNameToId,
    fieldOptionsByTable,
    nurtureListSlugs: new Set(s.nurtureListSlugs),
  };
}

// ─── Schema field parser ─────────────────────────────────────────────────────

interface ParsedField {
  id?: string;
  name?: string;
  label?: string;
  type?: string;
  options?: string[];
  relationTableId?: number;
}

function parseSchemaFields(schemaJson: any): ParsedField[] {
  if (!schemaJson) return [];
  const arr = Array.isArray(schemaJson) ? schemaJson : [];
  return arr
    .filter((f: any) => f && typeof f === "object")
    .slice(0, MAX_FIELDS_PER_TABLE)
    .map((f: any) => ({
      id: f.id || undefined,
      name: f.name || undefined,
      label: f.label || undefined,
      type: f.type || undefined,
      options: Array.isArray(f.options) ? f.options.map(String) : undefined,
      relationTableId: f.relationTableId ? Number(f.relationTableId) : undefined,
    }));
}

// ─── Formatters ──────────────────────────────────────────────────────────────

function formatOrgMetadata(
  company: any,
  clientCount: number,
  taskStatusDist: any[],
  ticketStatusDist: any[]
): string {
  const lines: string[] = [];
  if (company) {
    lines.push(`Company: ${company.name || "N/A"}`);
    if (company.businessType) lines.push(`Business Type: ${company.businessType}`);
    if (company.businessWebsite) lines.push(`Website: ${company.businessWebsite}`);
  }
  lines.push(`Total Clients: ${clientCount}`);

  if (taskStatusDist.length > 0) {
    const dist = taskStatusDist.map((d: any) => `${d.status}: ${d._count.status}`).join(", ");
    lines.push(`Task Distribution: ${dist}`);
  }
  if (ticketStatusDist.length > 0) {
    const dist = ticketStatusDist.map((d: any) => `${d.status}: ${d._count.status}`).join(", ");
    lines.push(`Ticket Distribution: ${dist}`);
  }

  return lines.join("\n");
}

function formatTables(tables: any[]): string {
  if (tables.length === 0) return "None";

  return tables
    .map((t) => {
      const fields = parseSchemaFields(t.schemaJson);
      const fieldLines = fields.map((f) => {
        let line = `    - ${f.name || "?"} (ID: ${f.id || "?"}, Type: ${f.type || "?"}, Label: "${f.label || ""}")`;
        if (f.options && f.options.length > 0) {
          line += ` [Options: ${f.options.slice(0, 15).join(", ")}]`;
        }
        if (f.relationTableId) {
          line += ` [Relation -> Table ${f.relationTableId}]`;
        }
        return line;
      });
      return `  Table "${t.name}" (ID: ${t.id}, Slug: ${t.slug}):\n${fieldLines.join("\n")}`;
    })
    .join("\n\n");
}

function formatUsers(users: any[]): string {
  if (users.length === 0) return "None";
  return users
    .map((u) => `  - ${u.name} (ID: ${u.id}, Role: ${u.role}, Email: ${u.email})`)
    .join("\n");
}

function formatAutomations(automations: any[]): string {
  if (automations.length === 0) return "None";
  return automations
    .map((a) => {
      const active = a.isActive ? "Active" : "Inactive";
      const tc = a.triggerConfig as any;
      const ac = a.actionConfig as any;
      let detail = "";
      if (tc?.tableId) detail += ` tableId=${tc.tableId}`;
      if (ac?.recipientId) detail += ` recipientId=${ac.recipientId}`;
      return `  - "${a.name}" [${a.triggerType} -> ${a.actionType}] (${active})${detail}`;
    })
    .join("\n");
}

function formatWorkflows(workflows: any[]): string {
  if (workflows.length === 0) return "None";
  return workflows
    .map((w) => {
      const stageNames = w.stages.map((s: any) => s.name).join(" -> ");
      return `  - "${w.name}" (ID: ${w.id}): ${stageNames || "No stages"}`;
    })
    .join("\n");
}

function formatSampleData(tables: any[], sampleRecords: any[][]): string {
  if (tables.length === 0) return "None";
  const parts: string[] = [];

  for (let i = 0; i < tables.length; i++) {
    const t = tables[i];
    const records = sampleRecords[i];
    if (!records || records.length === 0) continue;

    const rows = records.map((r: any, idx: number) => {
      const data = r.data && typeof r.data === "object" ? r.data : {};
      const entries = Object.entries(data)
        .slice(0, 8)
        .map(([k, v]) => {
          const val = String(v ?? "").slice(0, MAX_SAMPLE_VALUE_LEN);
          return `${k}: "${val}"`;
        })
        .join(", ");
      return `    Row ${idx + 1}: { ${entries} }`;
    });

    parts.push(`  Table "${t.name}" (ID: ${t.id}):\n${rows.join("\n")}`);
  }

  return parts.length > 0 ? parts.join("\n\n") : "None";
}

function formatNurtureLists(lists: any[]): string {
  if (lists.length === 0) return "None";
  return lists
    .map((l) => `  - "${l.name}" (Slug: ${l.slug}, ID: ${l.id})`)
    .join("\n");
}

// ─── Token Budget ────────────────────────────────────────────────────────────

function applyTokenBudget(sections: AutomationFormattedContext): AutomationFormattedContext {
  const result = { ...sections };

  // Priority 1: Always included, truncate if needed
  const p1Total = result.orgMetadata.length + result.tables.length + result.users.length;
  if (p1Total > PRIORITY_1_BUDGET) {
    // Truncate tables first (biggest), then users
    const orgLen = result.orgMetadata.length;
    const remaining = PRIORITY_1_BUDGET - orgLen;
    const tabBudget = Math.floor(remaining * 0.8);
    const userBudget = remaining - tabBudget;
    result.tables = truncate(result.tables, tabBudget);
    result.users = truncate(result.users, userBudget);
  }

  // Priority 2: If fits
  const p2Total = result.existingAutomations.length + result.workflows.length;
  if (p2Total > PRIORITY_2_BUDGET) {
    const autoBudget = Math.floor(PRIORITY_2_BUDGET * 0.6);
    const wfBudget = PRIORITY_2_BUDGET - autoBudget;
    result.existingAutomations = truncate(result.existingAutomations, autoBudget);
    result.workflows = truncate(result.workflows, wfBudget);
  }

  // Priority 3: If fits
  const p3Total = result.sampleData.length + result.nurtureListsText.length;
  if (p3Total > PRIORITY_3_BUDGET) {
    const sampleBudget = Math.floor(PRIORITY_3_BUDGET * 0.7);
    const nlBudget = PRIORITY_3_BUDGET - sampleBudget;
    result.sampleData = truncate(result.sampleData, sampleBudget);
    result.nurtureListsText = truncate(result.nurtureListsText, nlBudget);
  }

  // Final global cap
  const totalLen =
    result.orgMetadata.length +
    result.tables.length +
    result.users.length +
    result.existingAutomations.length +
    result.workflows.length +
    result.sampleData.length +
    result.nurtureListsText.length;

  if (totalLen > MAX_TOTAL_CHARS) {
    // Drop priority 3 first
    result.sampleData = "None (truncated)";
    result.nurtureListsText = truncate(result.nurtureListsText, 500);
  }

  return result;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "\n... (truncated)";
}

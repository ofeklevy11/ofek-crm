import { inngest } from "../client";
import { NonRetriableError } from "inngest";
import { redis } from "@/lib/redis";
import { createLogger } from "@/lib/logger";
import type { AutomationRawContext, SerializedRawContext } from "@/lib/ai/automation-context";
import { deserializeRawContext } from "@/lib/ai/automation-context";

const log = createLogger("AiGenerationJobs");

const AI_JOB_TTL = 600; // 10 minutes TTL for results in Redis

type AIJobType = "schema" | "automation" | "analytics" | "analytics-single-refine" | "analytics-report" | "analytics-report-refine" | "analytics-suggestions";

interface AIJobPayload {
  jobId: string;
  type: AIJobType;
  prompt: string;
  context: Record<string, any>;
  companyId: number;
  mode?: "create" | "suggest";
}

function buildSchemaSystemPrompt(prompt: string, context: Record<string, any>): string {
  // --- Build existing-tables block ---
  let tablesBlock = "None";
  if (Array.isArray(context.existingTables) && context.existingTables.length > 0) {
    tablesBlock = context.existingTables
      .map((t: any) => {
        const fieldsList = Array.isArray(t.fields)
          ? t.fields.map((f: any) => `  - ${f.name} (${f.type}) "${f.label}"`).join("\n")
          : "  (no fields)";
        return `Table "${t.name}" (ID: ${t.id}):\n${fieldsList}`;
      })
      .join("\n\n");
  }

  // --- Build categories block ---
  let categoriesBlock = "None";
  if (Array.isArray(context.categories) && context.categories.length > 0) {
    categoriesBlock = context.categories
      .map((c: any) => `- ID: ${c.id}, Name: "${c.name}"`)
      .join("\n");
  }

  let systemPrompt = `You are a database schema expert for a CRM system. The user wants to create or modify a table schema.
The user might ask in Hebrew. You must understand Hebrew but return system names (field names, slug) in English (snake_case preferred). Labels should match the user's language.

IMPORTANT: Return a valid JSON object. No markdown formatting, no \`\`\`json blocks.

EXISTING TABLES IN THE SYSTEM:
${tablesBlock}

AVAILABLE CATEGORIES:
${categoriesBlock}
`;

  if (context.currentSchema) {
    systemPrompt += `
CURRENT SCHEMA (to modify):
${JSON.stringify(context.currentSchema, null, 2)}

USER REQUEST (Modification):
"${prompt}"

INSTRUCTIONS: Update the CURRENT SCHEMA based on the USER REQUEST. Return the fully updated JSON schema. Preserve existing fields unless the user asks to remove them.
`;
  } else {
    systemPrompt += `
USER REQUEST:
"${prompt}"

INSTRUCTIONS: Generate a new JSON schema for the table requested.
`;
  }

  systemPrompt += `
OUTPUT JSON FORMAT:
{
  "tableName": "string (Human readable, in Hebrew if request is Hebrew)",
  "slug": "string (lowercase, dashes only, english, e.g. 'leads', 'project-tasks')",
  "description": "string (short description in user's language)",
  "categoryId": number | null (pick the best matching category ID from AVAILABLE CATEGORIES, or null if none fits),
  "fields": [
    {
      "name": "string (snake_case, unique, ENGLISH only, e.g. 'customer_name')",
      "label": "string (display label in user's language)",
      "type": "string (one of the ALLOWED TYPES below)",
      "options": ["string array, ONLY for select/multi-select/radio/tags types"],
      "optionColors": { "optionValue": "#hexColor" } (optional, for select/multi-select/radio/tags),
      "defaultValue": "string (optional)",
      "min": number (ONLY for score type, e.g. 0),
      "max": number (ONLY for score type, e.g. 10),
      "relationTableId": number (ONLY for relation type — must be an existing table ID from EXISTING TABLES),
      "displayField": "string (ONLY for relation type — field name from the related table to display)",
      "allowMultiple": boolean (ONLY for relation type — true for many-to-many),
      "relationField": "string (ONLY for lookup type — name of a relation field in THIS schema)",
      "lookupField": "string (ONLY for lookup type — field name from the related table to show)",
      "tab": "string (tab ID, only if tabsConfig is generated)"
    }
  ],
  "tabsConfig": {
    "enabled": true,
    "tabs": [
      { "id": "tab_xxx", "label": "string (tab name in user's language)", "order": 0 }
    ]
  } OR null (generate tabs when table has 8+ fields or user requests tabs),
  "displayConfig": {
    "visibleColumns": ["field_name_1", "field_name_2", ...],
    "columnOrder": ["field_name_1", "field_name_2", ...]
  } (pick the most important 5-12 fields to show in table overview)
}

ALLOWED FIELD TYPES (exactly 16):
- "text": Short text / single line
- "textarea": Long text / multi-line
- "number": Numeric value
- "date": Date picker
- "boolean": Yes/No toggle
- "phone": Phone number
- "url": URL / Link
- "select": Single-choice dropdown (requires "options" array)
- "multi-select": Multi-choice dropdown (requires "options" array)
- "tags": Tag chips, similar to multi-select (requires "options" array)
- "radio": Radio button group (requires "options" array)
- "score": Numeric score with min/max (requires "min" and "max")
- "relation": Link to another table (requires "relationTableId" from EXISTING TABLES)
- "lookup": Display a field from a related table (requires "relationField" + "lookupField")
- "record_owner": User/owner selector (treated as select, options will be auto-populated with team members)
- "automation": Automation trigger field (rarely used, only if user explicitly asks)

INVALID TYPES — do NOT use these (use the mapping instead):
- "email" → use "text"
- "currency" → use "number"
- "string" → use "text"
- "checkbox" → use "boolean"
- "dropdown" → use "select"
- "multiselect" → use "multi-select"
- "richtext" → use "textarea"

RULES:
1. Always include a primary name/title field as the first field (e.g. 'name', 'title', 'customer_name').
2. Field type must be EXACTLY one of the 16 ALLOWED FIELD TYPES above.
3. For select/multi-select/radio/tags: always provide "options" as a string array with at least 2 options in the USER'S LANGUAGE. Optionally generate "optionColors" with hex colors.
4. For score: provide "min" and "max" (integers). Ensure min < max.
5. For relation: "relationTableId" MUST be an existing table ID from EXISTING TABLES above. NEVER invent table IDs.
6. For lookup: "relationField" must reference a relation-type field in the SAME schema. "lookupField" must be a field from the related table.
7. Generate tabsConfig when the table has 8+ fields OR the user explicitly requests tabs. Tab IDs should be like "tab_abc123". Assign each field to a tab via the "tab" property.
8. Always generate displayConfig with the 5-12 most important fields for the table overview.
9. Field names must be unique within the schema.
10. Provide at least 5-6 relevant fields for new table requests.
11. Return ONLY the JSON object, nothing else.
`;

  return systemPrompt;
}

const VALID_AUTOMATION_TRIGGERS = new Set([
  "MANUAL", "TASK_STATUS_CHANGE", "RECORD_CREATE", "NEW_RECORD",
  "RECORD_FIELD_CHANGE", "MULTI_EVENT_DURATION", "DIRECT_DIAL",
  "VIEW_METRIC_THRESHOLD", "TIME_SINCE_CREATION", "TICKET_STATUS_CHANGE",
  "SLA_BREACH", "EVENT_TIME",
]);

const VALID_AUTOMATION_ACTIONS = new Set([
  "SEND_NOTIFICATION", "CALCULATE_DURATION", "CALCULATE_MULTI_EVENT_DURATION",
  "UPDATE_RECORD_FIELD", "SEND_WHATSAPP", "WEBHOOK", "ADD_TO_NURTURE_LIST",
  "CREATE_TASK", "CREATE_RECORD", "CREATE_CALENDAR_EVENT", "MULTI_ACTION",
]);

function buildAutomationSystemPrompt(
  prompt: string,
  context: Record<string, any>,
  mode: "create" | "suggest",
  currentSchema?: Record<string, any>
): string {
  const fc = context.formatted || {};

  let basePrompt = `You are an expert CRM automation architect. You build automation rules for a Hebrew CRM system.
All text content (names, titles, messages, descriptions) MUST be in Hebrew.
Return ONLY valid JSON. No markdown, no explanations, no \`\`\`json blocks.

=== ORGANIZATION CONTEXT ===
${fc.orgMetadata || "None"}

=== AVAILABLE TABLES (with field IDs, types, and options) ===
${fc.tables || "None"}

=== AVAILABLE USERS ===
${fc.users || "None"}

=== EXISTING AUTOMATIONS (avoid duplicating these) ===
${fc.existingAutomations || "None"}

=== WORKFLOWS ===
${fc.workflows || "None"}

=== NURTURE LISTS ===
${fc.nurtureListsText || "None"}

=== SAMPLE DATA ===
${fc.sampleData || "None"}

=== ALL TRIGGER TYPES (12 total) ===

1. NEW_RECORD — When a new record is created in a table
   triggerConfig: { tableId: number }

2. RECORD_CREATE — Alias for NEW_RECORD (same behavior)
   triggerConfig: { tableId: number }

3. RECORD_FIELD_CHANGE — When a specific field value changes
   triggerConfig: { tableId: number, columnId: "fld_xxx", fromValue?: string, toValue?: string }

4. TASK_STATUS_CHANGE — When a built-in Task status changes
   triggerConfig: { fromStatus?: string, toStatus?: string }
   Status values: "todo", "in_progress", "waiting_client", "on_hold", "completed_month", "done"

5. TICKET_STATUS_CHANGE — When a built-in Ticket status changes
   triggerConfig: { fromStatus?: string, toStatus?: string }
   Status values: "OPEN", "IN_PROGRESS", "WAITING_CLIENT", "RESOLVED", "CLOSED"

6. MULTI_EVENT_DURATION — When a chain of events completes across fields/tables
   triggerConfig: {
     tableId: number, isMultiTable?: boolean, relationField?: string,
     eventChain: [{ tableId?: number, eventName: string, columnId: "fld_xxx", value: string, order: number }]
   }

7. DIRECT_DIAL — When a phone field is dialed
   triggerConfig: { tableId: number, columnId: "fld_xxx" }

8. VIEW_METRIC_THRESHOLD — When a metric crosses a threshold
   triggerConfig: { viewId: number, operator: "lt"|"lte"|"gt"|"gte"|"eq"|"neq", threshold: number }

9. TIME_SINCE_CREATION — Time-based trigger after record creation
   triggerConfig: { tableId: number, duration: number, unit: "minutes"|"hours"|"days" }
   Note: minimum 5 minutes for minutes unit

10. SLA_BREACH — When an SLA deadline is breached
    triggerConfig: { breachType: "response"|"resolution" }

11. EVENT_TIME — Calendar event time trigger
    triggerConfig: { offsetMinutes: number, offsetDirection: "before"|"after" }

12. MANUAL — User-triggered manually
    triggerConfig: { tableId?: number }

=== ALL ACTION TYPES (11 total) ===

1. SEND_NOTIFICATION — Send notification to a user
   actionConfig: { recipientId: number, title: string, message: string, titleTemplate?: string, messageTemplate?: string }
   Template vars: {tableName}, {recordData}, {taskTitle}, {fromStatus}, {toStatus}, {fieldName}, {fromValue}, {toValue}

2. CREATE_TASK — Create a new task
   actionConfig: { title: string, description?: string, assigneeId: number, priority?: "low"|"medium"|"high", status?: string, dueDays?: number, tags?: string[] }

3. UPDATE_RECORD_FIELD — Update a field in the triggering record
   actionConfig: { columnId: "fld_xxx", value: string|number|boolean }

4. SEND_WHATSAPP — Send a WhatsApp message
   actionConfig: { phoneColumnId: "fld_xxx", content: string, messageType?: "text"|"media", delay?: number }

5. WEBHOOK — Send HTTP webhook
   actionConfig: { url: string, method?: "POST"|"GET", headers?: object }

6. ADD_TO_NURTURE_LIST — Add record to a nurture/mailing list
   actionConfig: { listId: string (slug), mapping: { name?: "fld_xxx", email?: "fld_xxx", phone?: "fld_xxx" } }

7. CREATE_RECORD — Create a record in another table
   actionConfig: { tableId: number, fieldMappings: [{ columnId: "fld_xxx", value: string }] }

8. CREATE_CALENDAR_EVENT — Create a calendar event
   actionConfig: { title: string, description?: string, startOffset?: number, endOffset?: number, startOffsetUnit?: "minutes"|"hours"|"days", endOffsetUnit?: "minutes"|"hours"|"days", color?: string }

9. CALCULATE_DURATION — Calculate time between two field values
   actionConfig: { fromField: string, toField: string, fromValue?: string, toValue?: string }

10. CALCULATE_MULTI_EVENT_DURATION — Calculate time across event chain
    actionConfig: { weightConfig?: { eventWeights: object } }

11. MULTI_ACTION — Execute multiple actions sequentially (max 10)
    actionConfig: { actions: [{ type: "SEND_NOTIFICATION"|"CREATE_TASK"|etc, config: {...} }] }
    IMPORTANT: Nested MULTI_ACTION is NOT allowed.

=== VALIDATION RULES ===
- tableId MUST be a real table ID from AVAILABLE TABLES above
- columnId MUST be a real field ID (fld_xxx) from the table's field list
- recipientId and assigneeId MUST be real user IDs from AVAILABLE USERS
- listId for ADD_TO_NURTURE_LIST MUST be a real slug from NURTURE LISTS
- For MULTI_ACTION: max 10 nested actions, no nested MULTI_ACTION
- All IDs must be numbers (not strings) except columnId which is "fld_xxx"

${mode === "create" ? `=== MODE: CREATE ===
USER REQUEST: "${prompt}"

Generate a single automation rule based on the user's request.

OUTPUT FORMAT (single JSON object):
{
  "automation": {
    "name": "string (Hebrew)",
    "description": "string (Hebrew, short explanation)",
    "triggerType": "string",
    "triggerConfig": { ... },
    "actionType": "string",
    "actionConfig": { ... }
  }
}` : `=== MODE: SUGGEST ===
Analyze the organization's tables, data, workflows, and existing automations.
Suggest 3-5 valuable automations that would help this business.
${prompt ? `User hint: "${prompt}"` : ""}
Avoid duplicating existing automations.
Each suggestion should use a different combination of trigger+action when possible.

OUTPUT FORMAT (JSON object with suggestions array):
{
  "suggestions": [
    {
      "name": "string (Hebrew)",
      "description": "string (Hebrew, 1-2 sentences explaining the value)",
      "category": "string (one of: 'notifications', 'tasks', 'data', 'communication', 'workflow', 'monitoring')",
      "triggerType": "string",
      "triggerConfig": { ... },
      "actionType": "string",
      "actionConfig": { ... }
    }
  ]
}`}`;

  if (currentSchema) {
    basePrompt += `

=== CURRENT AUTOMATION (modify based on user request) ===
${JSON.stringify(currentSchema)}

Preserve all existing configuration unless the user explicitly asks to change it.
Return the complete updated automation JSON.`;
  }

  return basePrompt;
}

// Shared constant: system model field definitions used by both prompt builder and parser
const SYSTEM_MODEL_FIELDS: Record<string, { label: string; fields: Record<string, { type: string; label: string; values?: string[] }> }> = {
  Task: {
    label: "משימות",
    fields: {
      status: { type: "enum", label: "סטטוס", values: ["todo", "in_progress", "waiting_client", "on_hold", "completed_month", "done"] },
      priority: { type: "enum", label: "עדיפות", values: ["low", "medium", "high"] },
      assignee: { type: "relation", label: "אחראי (שם)" },
      tags: { type: "array", label: "תגיות" },
      dueDate: { type: "date", label: "תאריך יעד" },
      createdAt: { type: "date", label: "תאריך יצירה" },
      updatedAt: { type: "date", label: "תאריך עדכון" },
    },
  },
  Retainer: {
    label: "ריטיינרים",
    fields: {
      status: { type: "enum", label: "סטטוס", values: ["active", "paused", "cancelled"] },
      frequency: { type: "enum", label: "תדירות", values: ["monthly", "quarterly", "annually"] },
      amount: { type: "number", label: "סכום" },
      startDate: { type: "date", label: "תאריך התחלה" },
      clientName: { type: "relation", label: "שם לקוח" },
      createdAt: { type: "date", label: "תאריך יצירה" },
      updatedAt: { type: "date", label: "תאריך עדכון" },
    },
  },
  OneTimePayment: {
    label: "תשלומים חד-פעמיים",
    fields: {
      status: { type: "enum", label: "סטטוס", values: ["pending", "paid", "overdue", "cancelled"] },
      amount: { type: "number", label: "סכום" },
      dueDate: { type: "date", label: "תאריך תשלום" },
      paidDate: { type: "date", label: "תאריך תשלום בפועל" },
      clientName: { type: "relation", label: "שם לקוח" },
      createdAt: { type: "date", label: "תאריך יצירה" },
      updatedAt: { type: "date", label: "תאריך עדכון" },
    },
  },
  Transaction: {
    label: "תנועות כספיות",
    fields: {
      status: { type: "enum", label: "סטטוס", values: ["pending", "paid", "overdue", "cancelled"] },
      amount: { type: "number", label: "סכום" },
      relatedType: { type: "enum", label: "סוג קשור", values: ["retainer", "one_time"] },
      clientName: { type: "relation", label: "שם לקוח" },
      createdAt: { type: "date", label: "תאריך יצירה" },
      updatedAt: { type: "date", label: "תאריך עדכון" },
    },
  },
  CalendarEvent: {
    label: "אירועי יומן",
    fields: {
      title: { type: "text", label: "כותרת" },
      description: { type: "text", label: "תיאור" },
      startTime: { type: "date", label: "זמן התחלה" },
      endTime: { type: "date", label: "זמן סיום" },
      createdAt: { type: "date", label: "תאריך יצירה" },
    },
  },
};

function buildAnalyticsSystemPrompt(prompt: string, context: Record<string, any>): string {
  const orgInfo = context.orgInfo || {};
  const companyName = orgInfo.companyName || "העסק";
  const businessType = orgInfo.businessType || "";
  const clientCount = context.clientCount || 0;
  const teamMembers: string[] = context.teamMembers || [];

  // System models block
  let systemModelsBlock = "";
  const systemModels = context.systemModels || {};
  for (const [modelName, modelDef] of Object.entries(SYSTEM_MODEL_FIELDS)) {
    const count = (systemModels as any)[modelName]?.count || 0;
    systemModelsBlock += `\n### ${modelName} — ${modelDef.label} (${count} רשומות)\nשדות:\n`;
    for (const [fieldName, fieldInfo] of Object.entries(modelDef.fields)) {
      let line = `  - ${fieldName} (${fieldInfo.type}) — ${fieldInfo.label}`;
      if (fieldInfo.values) line += ` [${fieldInfo.values.join(", ")}]`;
      systemModelsBlock += line + "\n";
    }
  }

  // Custom tables block
  let customTablesBlock = "אין טבלאות מותאמות אישית";
  if (Array.isArray(context.formattedTables) && context.formattedTables.length > 0) {
    customTablesBlock = context.formattedTables.map((t: any) => {
      let s = `\n### "${t.name}" (ID: ${t.id}, ${t.recordCount ?? 0} רשומות)`;
      if (Array.isArray(t.columns) && t.columns.length > 0) {
        s += "\nשדות:";
        for (const col of t.columns) {
          let line = `  - ${col.systemName} (${col.type}) — ${col.label}`;
          if (Array.isArray(col.options) && col.options.length > 0) line += ` [${col.options.join(", ")}]`;
          s += "\n" + line;
        }
      }
      if (Array.isArray(t.sampleData) && t.sampleData.length > 0) {
        s += "\nדוגמאות נתונים:";
        for (const sample of t.sampleData) {
          s += "\n  " + JSON.stringify(sample);
        }
      }
      return s;
    }).join("\n");
  }

  // Existing views block
  let existingViewsBlock = "אין תצוגות קיימות";
  if (Array.isArray(context.existingViews) && context.existingViews.length > 0) {
    existingViewsBlock = context.existingViews
      .map((v: any) => `- "${v.title}" (${v.type})`)
      .join("\n");
  }

  return `You are an analytics configuration expert for a Hebrew CRM system.
The user wants to create an analytics view/chart for "${companyName}".
You must understand Hebrew and return Hebrew titles and descriptions.

IMPORTANT: Return a valid JSON object. No markdown formatting, no \`\`\`json blocks.

=== ORGANIZATION CONTEXT ===
Company: ${companyName}
${businessType ? `Business Type: ${businessType}` : ""}
Total Clients: ${clientCount}
${teamMembers.length > 0 ? `Team Members: ${teamMembers.join(", ")}` : ""}

=== SYSTEM MODELS (built-in data) ===
${systemModelsBlock}
=== CUSTOM TABLES (user-created) ===
${customTablesBlock}

=== EXISTING ANALYTICS VIEWS (avoid duplicates!) ===
${existingViewsBlock}

=== VIEW TYPES ===

1. COUNT — Simple count or breakdown
   Use for: "כמה...", "פילוח...", "חלוקה לפי...", simple counts
   Config: { model OR tableId, groupByField?, dateRangeType, filter? }

2. CONVERSION — Conversion rate between two filters
   Use for: "אחוז המרה...", "יחס בין...", "כמה מתוך..."
   Config: { model OR tableId, totalFilter, successFilter, groupByField?, dateRangeType }
   - totalFilter: matches the total population (e.g. {"status": "active,won,lost"})
   - successFilter: matches the successful subset (e.g. {"status": "won"})

3. GRAPH — Chart visualization
   Use for: "גרף...", "תרשים...", "גרף עמודות/קו/עוגה/שטח..."
   Config: { model OR tableId, groupByField (REQUIRED), chartType, yAxisMeasure, yAxisField?, dateRangeType, filter? }
   - chartType: "bar" | "line" | "pie" | "area"
   - yAxisMeasure: "count" | "sum" | "avg"
   - yAxisField: REQUIRED when yAxisMeasure is "sum" or "avg" (must be a numeric field)

=== OUTPUT JSON FORMAT ===
{
  "title": "string (descriptive title in Hebrew, max 200 chars)",
  "type": "COUNT" | "CONVERSION" | "GRAPH",
  "description": "string (short explanation in Hebrew)",
  "config": {
    "model": "Task" | "Retainer" | "OneTimePayment" | "Transaction" | "CalendarEvent",
    "tableId": number,
    "groupByField": "string (exact field systemName)",
    "dateRangeType": "all" | "this_week" | "last_30_days" | "last_year",
    "filter": { "fieldSystemName": "value" },
    "totalFilter": { "fieldSystemName": "value" },
    "successFilter": { "fieldSystemName": "value" },
    "chartType": "bar" | "line" | "pie" | "area",
    "yAxisMeasure": "count" | "sum" | "avg",
    "yAxisField": "string (numeric field systemName)"
  }
}

=== STRICT RULES ===
1. Use EXACTLY ONE data source: either "model" OR "tableId", never both, **never neither. This is the most important rule — every view MUST have a data source.**
2. Use ONLY exact field systemNames from the model/table definitions above. NEVER invent field names.
3. For GRAPH type: groupByField and chartType are REQUIRED.
4. For CONVERSION type: both totalFilter and successFilter are REQUIRED.
5. For system models, "clientName" is a valid field for Retainer, OneTimePayment, and Transaction.
6. Title and description MUST be in Hebrew.
7. Do NOT suggest analytics that duplicate existing views listed above.
8. Default dateRangeType to "all" if the user doesn't specify a time range.
9. For pie chart requests, use GRAPH type with chartType:"pie" and yAxisMeasure:"count".
10. Return ONLY the JSON object. No explanations, no markdown.
11. The title MUST NOT contain the table name literally (e.g. don't write 'טבלת לידים'). Use a descriptive Hebrew title that describes the insight.

USER REQUEST:
"${prompt}"`;
}

function buildAnalyticsSingleRefinePrompt(prompt: string, context: Record<string, any>): string {
  const basePrompt = buildAnalyticsSystemPrompt("", context);

  const currentView = context.currentView;
  const currentViewStr = currentView ? JSON.stringify(currentView, null, 2) : "{}";

  return `${basePrompt}

=== CURRENT VIEW STATE ===
The user already has a generated analytics view. They want to MODIFY it based on their request.
Here is the current view:
${currentViewStr}

=== MODIFICATION REQUEST ===
"${prompt}"

=== INSTRUCTIONS ===
Apply the user's modification request to the current view.
Return the FULL updated view in the same JSON format (title, type, description, config).
Only change what the user asks for. Keep everything else the same.
Return ONLY the JSON object.`;
}

function buildAnalyticsSuggestionsPrompt(prompt: string, context: Record<string, any>): string {
  const basePrompt = buildAnalyticsSystemPrompt("", context);

  return `${basePrompt}

=== MODE: SUGGESTIONS ===
Analyze the organization's tables, data, existing views, and system models.
Suggest 3-5 diverse and valuable analytics views that would help this business gain insights.
${prompt ? `User hint: "${prompt}"` : ""}
Each suggestion should use a DIFFERENT data source and/or view type when possible.
Avoid duplicating existing analytics views listed above.
Prioritize actionable business insights.

OUTPUT FORMAT (JSON object with suggestions array):
{
  "suggestions": [
    {
      "title": "string (descriptive title in Hebrew, max 200 chars)",
      "type": "COUNT" | "CONVERSION" | "GRAPH",
      "description": "string (short explanation in Hebrew, 1-2 sentences)",
      "config": {
        "model": "Task" | "Retainer" | "OneTimePayment" | "Transaction" | "CalendarEvent",
        "tableId": number,
        "groupByField": "string (exact field systemName)",
        "dateRangeType": "all" | "this_week" | "last_30_days" | "last_year",
        "filter": { "fieldSystemName": "value" },
        "totalFilter": { "fieldSystemName": "value" },
        "successFilter": { "fieldSystemName": "value" },
        "chartType": "bar" | "line" | "pie" | "area",
        "yAxisMeasure": "count" | "sum" | "avg",
        "yAxisField": "string (numeric field systemName)"
      }
    }
  ]
}

Return ONLY the JSON object. No explanations, no markdown.`;
}

function parseAnalyticsSuggestionsResult(cleanedText: string, formattedTables: any[]) {
  let parsed = JSON.parse(cleanedText);

  // Unwrap if nested
  if (parsed.result && typeof parsed.result === "object") parsed = parsed.result;

  let rawSuggestions: any[] = [];
  if (Array.isArray(parsed.suggestions)) {
    rawSuggestions = parsed.suggestions;
  } else if (Array.isArray(parsed)) {
    rawSuggestions = parsed;
  }

  // Validate each suggestion through the existing parseAnalyticsResult
  const suggestions: any[] = [];
  for (const rawSugg of rawSuggestions.slice(0, 5)) {
    try {
      const viewJson = JSON.stringify(rawSugg);
      const { view } = parseAnalyticsResult(viewJson, formattedTables);
      if (view && view.type && view.config) {
        suggestions.push(view);
      }
    } catch {
      // Skip invalid suggestions
    }
  }

  if (suggestions.length === 0) {
    throw new Error("No valid suggestions in AI response");
  }

  return { suggestions };
}

function buildAnalyticsReportSystemPrompt(prompt: string, context: Record<string, any>): string {
  // Reuse the same context blocks as buildAnalyticsSystemPrompt
  const orgInfo = context.orgInfo || {};
  const companyName = orgInfo.companyName || "העסק";
  const businessType = orgInfo.businessType || "";
  const clientCount = context.clientCount || 0;
  const teamMembers: string[] = context.teamMembers || [];

  let systemModelsBlock = "";
  const systemModels = context.systemModels || {};
  for (const [modelName, modelDef] of Object.entries(SYSTEM_MODEL_FIELDS)) {
    const count = (systemModels as any)[modelName]?.count || 0;
    systemModelsBlock += `\n### ${modelName} — ${modelDef.label} (${count} רשומות)\nשדות:\n`;
    for (const [fieldName, fieldInfo] of Object.entries(modelDef.fields)) {
      let line = `  - ${fieldName} (${fieldInfo.type}) — ${fieldInfo.label}`;
      if (fieldInfo.values) line += ` [${fieldInfo.values.join(", ")}]`;
      systemModelsBlock += line + "\n";
    }
  }

  let customTablesBlock = "אין טבלאות מותאמות אישית";
  if (Array.isArray(context.formattedTables) && context.formattedTables.length > 0) {
    customTablesBlock = context.formattedTables.map((t: any) => {
      let s = `\n### "${t.name}" (ID: ${t.id}, ${t.recordCount ?? 0} רשומות)`;
      if (Array.isArray(t.columns) && t.columns.length > 0) {
        s += "\nשדות:";
        for (const col of t.columns) {
          let line = `  - ${col.systemName} (${col.type}) — ${col.label}`;
          if (Array.isArray(col.options) && col.options.length > 0) line += ` [${col.options.join(", ")}]`;
          s += "\n" + line;
        }
      }
      if (Array.isArray(t.sampleData) && t.sampleData.length > 0) {
        s += "\nדוגמאות נתונים:";
        for (const sample of t.sampleData) {
          s += "\n  " + JSON.stringify(sample);
        }
      }
      return s;
    }).join("\n");
  }

  let existingViewsBlock = "אין תצוגות קיימות";
  if (Array.isArray(context.existingViews) && context.existingViews.length > 0) {
    existingViewsBlock = context.existingViews
      .map((v: any) => `- "${v.title}" (${v.type})`)
      .join("\n");
  }

  return `You are an analytics REPORT configuration expert for a Hebrew CRM system.
The user wants to create a FULL ANALYTICS REPORT with multiple views, KPIs, insights and a summary for "${companyName}".
You must understand Hebrew and return Hebrew titles, descriptions, insights and summary.

IMPORTANT: Return a valid JSON object. No markdown formatting, no \`\`\`json blocks.

=== ORGANIZATION CONTEXT ===
Company: ${companyName}
${businessType ? `Business Type: ${businessType}` : ""}
Total Clients: ${clientCount}
${teamMembers.length > 0 ? `Team Members: ${teamMembers.join(", ")}` : ""}

=== SYSTEM MODELS (built-in data) ===
${systemModelsBlock}
=== CUSTOM TABLES (user-created) ===
${customTablesBlock}

=== EXISTING ANALYTICS VIEWS (avoid duplicates!) ===
${existingViewsBlock}

=== VIEW TYPES ===

1. COUNT — Simple count or breakdown
   Config: { model OR tableId, groupByField?, dateRangeType, filter? }

2. CONVERSION — Conversion rate between two filters
   Config: { model OR tableId, totalFilter, successFilter, groupByField?, dateRangeType }

3. GRAPH — Chart visualization
   Config: { model OR tableId, groupByField (REQUIRED), chartType, yAxisMeasure, yAxisField?, dateRangeType, filter? }
   - chartType: "bar" | "line" | "pie" | "area"
   - yAxisMeasure: "count" | "sum" | "avg"
   - yAxisField: REQUIRED when yAxisMeasure is "sum" or "avg" (must be a numeric field)

=== OUTPUT JSON FORMAT ===
{
  "reportTitle": "string (descriptive report title in Hebrew, max 200 chars)",
  "summary": "string (2-3 sentence executive summary in Hebrew, max 2000 chars)",
  "insights": ["string array of key insights in Hebrew, 2-5 items"],
  "views": [
    {
      "title": "string (Hebrew, max 200 chars)",
      "type": "COUNT" | "CONVERSION" | "GRAPH",
      "description": "string (Hebrew)",
      "config": {
        "model": "Task" | "Retainer" | "OneTimePayment" | "Transaction" | "CalendarEvent",
        "tableId": number,
        "groupByField": "string",
        "dateRangeType": "all" | "this_week" | "last_30_days" | "last_year",
        "filter": { "fieldSystemName": "value" },
        "totalFilter": { "fieldSystemName": "value" },
        "successFilter": { "fieldSystemName": "value" },
        "chartType": "bar" | "line" | "pie" | "area",
        "yAxisMeasure": "count" | "sum" | "avg",
        "yAxisField": "string"
      }
    }
  ]
}

=== STRICT RULES ===
1. Generate 2-8 views. At least 1 GRAPH and 1 COUNT view.
2. Mix chart types for variety (bar, pie, line, area).
3. Use EXACTLY ONE data source per view: either "model" OR "tableId", never both, **never neither. Every view MUST have a data source.**
4. Use ONLY exact field systemNames from the model/table definitions above.
5. For GRAPH type: groupByField and chartType are REQUIRED.
6. For CONVERSION type: both totalFilter and successFilter are REQUIRED.
7. All text MUST be in Hebrew.
8. Do NOT duplicate existing views.
9. Default dateRangeType to "all" if not relevant.
10. Return ONLY the JSON object. No explanations, no markdown.
11. Insights should be actionable business insights based on the data structure.
12. Summary should give a high-level overview of what the report covers.
13. The title of each view MUST NOT contain the table name literally (e.g. don't write 'טבלת לידים'). Use descriptive Hebrew titles that describe the insight.

USER REQUEST:
"${prompt}"`;
}

function buildAnalyticsReportRefinePrompt(prompt: string, context: Record<string, any>): string {
  const basePrompt = buildAnalyticsReportSystemPrompt("", context);

  const currentReport = context.currentReport;
  const currentReportStr = currentReport ? JSON.stringify(currentReport, null, 2) : "{}";

  return `${basePrompt}

=== CURRENT REPORT STATE ===
The user already has a generated report. They want to MODIFY it based on their request.
Here is the current report:
${currentReportStr}

=== MODIFICATION REQUEST ===
"${prompt}"

=== INSTRUCTIONS ===
Apply the user's modification request to the current report.
Return the FULL updated report in the same JSON format (reportTitle, summary, insights, views).
Only change what the user asks for. Keep everything else the same.
Return ONLY the JSON object.`;
}

function parseAnalyticsReportResult(cleanedText: string, formattedTables: any[]) {
  let parsed = JSON.parse(cleanedText);

  // Unwrap if nested
  if (parsed.report && typeof parsed.report === "object") parsed = parsed.report;
  if (parsed.result && typeof parsed.result === "object") parsed = parsed.result;

  // Validate reportTitle
  let reportTitle = parsed.reportTitle;
  if (!reportTitle || typeof reportTitle !== "string") reportTitle = "דוח אנליטי";
  reportTitle = reportTitle.slice(0, 200);

  // Validate summary
  let summary = parsed.summary;
  if (!summary || typeof summary !== "string") summary = "";
  summary = summary.slice(0, 2000);

  // Validate insights
  let insights: string[] = [];
  if (Array.isArray(parsed.insights)) {
    insights = parsed.insights
      .filter((i: any) => typeof i === "string" && i.trim())
      .slice(0, 10)
      .map((i: string) => i.slice(0, 500));
  }

  // Validate views using existing parseAnalyticsResult per view
  let views: any[] = [];
  if (Array.isArray(parsed.views)) {
    for (const rawView of parsed.views) {
      try {
        const viewJson = JSON.stringify(rawView);
        const { view } = parseAnalyticsResult(viewJson, formattedTables);
        if (view && view.type && view.config) {
          views.push(view);
        }
      } catch {
        // Skip invalid views
      }
    }
  }

  if (views.length === 0) {
    throw new Error("No valid views in report");
  }

  return { report: { reportTitle, summary, insights, views } };
}

async function callOpenRouter(systemPrompt: string, maxTokens: number): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new NonRetriableError("OPENROUTER_API_KEY is not configured");

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...(process.env.NEXT_PUBLIC_APP_URL
        ? { "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL }
        : {}),
      "X-Title": "CRM AI Generator",
    },
    body: JSON.stringify({
      model: "google/gemini-2.0-flash-001",
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: systemPrompt }],
    }),
    signal: AbortSignal.timeout(15000), // 15s timeout to avoid hanging Inngest slots
  });

  if (!response.ok) {
    const errorData = await response.text();
    // SECURITY: Truncate error to avoid leaking full external API response into logs/Redis
    const truncated = errorData.length > 200 ? errorData.slice(0, 200) + "..." : errorData;
    throw new Error(`AI API responded with ${response.status}: ${truncated}`);
  }

  const data = await response.json();
  const textResponse = data.choices?.[0]?.message?.content;
  if (!textResponse) throw new Error("Invalid response format from AI");

  return textResponse.replace(/```json/g, "").replace(/```/g, "").trim();
}

const VALID_FIELD_TYPES = new Set([
  "text", "textarea", "number", "date", "boolean", "phone", "url",
  "select", "multi-select", "tags", "radio", "score",
  "relation", "lookup", "record_owner", "automation",
]);

const TYPE_ALIASES: Record<string, string> = {
  email: "text",
  currency: "number",
  string: "text",
  checkbox: "boolean",
  dropdown: "select",
  multiselect: "multi-select",
  "multi_select": "multi-select",
  richtext: "textarea",
  rich_text: "textarea",
  longtext: "textarea",
  long_text: "textarea",
  link: "url",
  toggle: "boolean",
  rating: "score",
  file: "text",
  image: "text",
};

const SELECT_LIKE_TYPES = new Set(["select", "multi-select", "radio", "tags", "record_owner"]);

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function parseSchemaResult(cleanedText: string, existingTableIds: Set<number>) {
  const parsed = JSON.parse(cleanedText);
  let schema: any;
  if (parsed.schema) schema = parsed.schema;
  else if (parsed.table) schema = parsed.table;
  else schema = parsed;

  // --- Table name & slug ---
  if (!schema.tableName || typeof schema.tableName !== "string") schema.tableName = "Table Name";
  if (!schema.slug || typeof schema.slug !== "string") {
    schema.slug = schema.tableName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }
  // Force slug to valid format
  schema.slug = schema.slug
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "table";

  // --- categoryId ---
  if (schema.categoryId != null) {
    schema.categoryId = Number(schema.categoryId) || null;
  } else {
    schema.categoryId = null;
  }

  // --- Fields ---
  if (!Array.isArray(schema.fields)) schema.fields = [];

  const usedNames = new Set<string>();

  schema.fields = schema.fields.map((f: any) => {
    if (!f || typeof f !== "object") return null;

    // --- Name deduplication ---
    let name = typeof f.name === "string" ? f.name.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase() : "field";
    if (!name) name = "field";
    if (usedNames.has(name)) {
      let suffix = 2;
      while (usedNames.has(`${name}_${suffix}`)) suffix++;
      name = `${name}_${suffix}`;
    }
    usedNames.add(name);

    // --- Type normalization ---
    let type = typeof f.type === "string" ? f.type.toLowerCase().trim() : "text";
    if (TYPE_ALIASES[type]) type = TYPE_ALIASES[type];
    if (!VALID_FIELD_TYPES.has(type)) type = "text";

    const label = typeof f.label === "string" ? f.label : name;
    const result: any = { name, type, label };

    // --- Default value ---
    if (f.defaultValue != null && f.defaultValue !== "") {
      result.defaultValue = String(f.defaultValue);
    }

    // --- Select-like: options & optionColors ---
    if (SELECT_LIKE_TYPES.has(type)) {
      let options: string[] = [];
      if (Array.isArray(f.options)) {
        options = f.options.map((o: any) => String(o).trim()).filter(Boolean);
      } else if (typeof f.options === "string" && f.options.trim()) {
        options = f.options.split(",").map((o: string) => o.trim()).filter(Boolean);
      }
      // Deduplicate
      options = [...new Set(options)];

      if (options.length === 0 && type !== "record_owner") {
        // Degrade to text if no options and not record_owner
        result.type = "text";
      } else {
        result.options = options;

        // optionColors: keep only valid hex colors for existing options
        if (f.optionColors && typeof f.optionColors === "object" && !Array.isArray(f.optionColors)) {
          const validColors: Record<string, string> = {};
          const optionSet = new Set(options);
          for (const [key, val] of Object.entries(f.optionColors)) {
            if (optionSet.has(key) && typeof val === "string" && HEX_COLOR_RE.test(val)) {
              validColors[key] = val;
            }
          }
          if (Object.keys(validColors).length > 0) {
            result.optionColors = validColors;
          }
        }
      }
    }

    // --- Score: min/max ---
    if (type === "score") {
      let min = typeof f.min === "number" ? f.min : Number(f.min);
      let max = typeof f.max === "number" ? f.max : Number(f.max);
      if (isNaN(min)) min = 0;
      if (isNaN(max)) max = 10;
      if (min >= max) { min = 0; max = 10; }
      result.min = min;
      result.max = max;
    }

    // --- Relation: validate relationTableId ---
    if (type === "relation") {
      const relId = Number(f.relationTableId);
      if (!relId || !existingTableIds.has(relId)) {
        // Degrade to text — invalid relation
        result.type = "text";
      } else {
        result.relationTableId = relId;
        if (typeof f.displayField === "string" && f.displayField) {
          result.displayField = f.displayField;
        }
        if (f.allowMultiple === true) {
          result.allowMultiple = true;
        }
      }
    }

    // --- Lookup: validate relationField ---
    if (type === "lookup") {
      if (typeof f.relationField === "string" && typeof f.lookupField === "string" && f.relationField && f.lookupField) {
        result.relationField = f.relationField;
        result.lookupField = f.lookupField;
      } else {
        // Degrade to text — missing required fields
        result.type = "text";
      }
    }

    // --- Tab assignment ---
    if (typeof f.tab === "string" && f.tab) {
      result.tab = f.tab;
    }

    return result;
  }).filter(Boolean);

  // --- Post-pass: validate lookup relationField references ---
  const relationFieldNames = new Set(
    schema.fields.filter((f: any) => f.type === "relation").map((f: any) => f.name)
  );
  for (const field of schema.fields) {
    if (field.type === "lookup" && field.relationField && !relationFieldNames.has(field.relationField)) {
      field.type = "text";
      delete field.relationField;
      delete field.lookupField;
    }
  }

  // --- tabsConfig validation ---
  if (schema.tabsConfig && typeof schema.tabsConfig === "object" && schema.tabsConfig.enabled) {
    if (Array.isArray(schema.tabsConfig.tabs) && schema.tabsConfig.tabs.length > 0) {
      const validTabIds = new Set<string>();
      const seenIds = new Set<string>();
      schema.tabsConfig.tabs = schema.tabsConfig.tabs
        .filter((t: any) => t && typeof t.id === "string" && typeof t.label === "string")
        .map((t: any, i: number) => {
          let id = t.id;
          if (seenIds.has(id)) id = `${id}_${i}`;
          seenIds.add(id);
          validTabIds.add(id);
          return { id, label: t.label, order: typeof t.order === "number" ? t.order : i };
        })
        .sort((a: any, b: any) => a.order - b.order)
        .slice(0, 20); // MAX_TABS

      // Remove orphaned tab references from fields
      for (const field of schema.fields) {
        if (field.tab && !validTabIds.has(field.tab)) {
          delete field.tab;
        }
      }
    } else {
      schema.tabsConfig = null;
    }
  } else {
    schema.tabsConfig = null;
  }

  // --- displayConfig validation ---
  const allFieldNames = new Set(schema.fields.map((f: any) => f.name));
  if (schema.displayConfig && typeof schema.displayConfig === "object") {
    let visible = Array.isArray(schema.displayConfig.visibleColumns)
      ? schema.displayConfig.visibleColumns.filter((n: any) => typeof n === "string" && allFieldNames.has(n))
      : [];
    let order = Array.isArray(schema.displayConfig.columnOrder)
      ? schema.displayConfig.columnOrder.filter((n: any) => typeof n === "string" && allFieldNames.has(n))
      : [];

    // Deduplicate
    visible = [...new Set(visible)].slice(0, 12);
    order = [...new Set(order)].slice(0, 12);

    if (visible.length > 0) {
      schema.displayConfig = { visibleColumns: visible, columnOrder: order.length > 0 ? order : visible };
    } else {
      schema.displayConfig = null;
    }
  } else {
    schema.displayConfig = null;
  }

  // --- Auto-generate displayConfig if AI didn't provide one ---
  if (!schema.displayConfig && schema.fields.length > 0) {
    const autoVisible = schema.fields.slice(0, Math.min(schema.fields.length, 12)).map((f: any) => f.name);
    schema.displayConfig = { visibleColumns: autoVisible, columnOrder: autoVisible };
  }

  return { schema };
}

function parseAutomationResult(cleanedText: string, rawContext?: AutomationRawContext) {
  const parsed = JSON.parse(cleanedText);

  // Detect mode: single automation or suggestions array
  let isSuggestMode = false;
  let automationObjects: any[] = [];

  if (parsed.suggestions && Array.isArray(parsed.suggestions)) {
    isSuggestMode = true;
    automationObjects = parsed.suggestions;
  } else if (parsed.automation && typeof parsed.automation === "object") {
    automationObjects = [parsed.automation];
  } else if (parsed.triggerType && parsed.actionType) {
    automationObjects = [parsed];
  } else {
    // Deep search for valid automation object
    const found = findAutomationObject(parsed);
    if (found) automationObjects = [found];
  }

  if (automationObjects.length === 0) {
    throw new Error("No valid automation object found in AI response");
  }

  const validated = automationObjects
    .map((a) => validateAutomationObject(a, rawContext))
    .filter(Boolean);

  if (validated.length === 0) {
    throw new Error("All automation objects failed validation");
  }

  if (isSuggestMode) {
    return { suggestions: validated };
  }
  return { automation: validated[0] };
}

function findAutomationObject(obj: any, depth = 0): any {
  if (depth > 10 || !obj || typeof obj !== "object") return null;
  if (obj.triggerType && obj.actionType) return obj;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findAutomationObject(item, depth + 1);
      if (found) return found;
    }
  } else {
    for (const key in obj) {
      const found = findAutomationObject(obj[key], depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function validateAutomationObject(a: any, raw?: AutomationRawContext): any | null {
  if (!a || typeof a !== "object") return null;

  // Validate trigger/action types
  if (!a.triggerType || !VALID_AUTOMATION_TRIGGERS.has(a.triggerType)) return null;
  if (!a.actionType || !VALID_AUTOMATION_ACTIONS.has(a.actionType)) return null;

  if (!a.name || typeof a.name !== "string") a.name = "אוטומציה חדשה";
  if (!a.triggerConfig || typeof a.triggerConfig !== "object") a.triggerConfig = {};
  if (!a.actionConfig || typeof a.actionConfig !== "object") a.actionConfig = {};

  // ── Coerce numeric IDs ──
  if (a.triggerConfig.tableId != null) {
    a.triggerConfig.tableId = Number(a.triggerConfig.tableId);
  }
  if (a.triggerConfig.viewId != null) {
    a.triggerConfig.viewId = Number(a.triggerConfig.viewId);
  }
  if (a.triggerConfig.threshold != null) {
    a.triggerConfig.threshold = Number(a.triggerConfig.threshold);
  }
  if (a.triggerConfig.duration != null) {
    a.triggerConfig.duration = Number(a.triggerConfig.duration);
  }
  if (a.actionConfig.recipientId != null) {
    a.actionConfig.recipientId = Number(a.actionConfig.recipientId);
  }
  if (a.actionConfig.assigneeId != null) {
    a.actionConfig.assigneeId = Number(a.actionConfig.assigneeId);
  }
  if (a.actionConfig.tableId != null) {
    a.actionConfig.tableId = Number(a.actionConfig.tableId);
  }
  if (a.actionConfig.dueDays != null) {
    a.actionConfig.dueDays = Number(a.actionConfig.dueDays);
  }

  // ── Validate IDs against raw context ──
  if (raw) {
    const tc = a.triggerConfig;
    const ac = a.actionConfig;

    // Validate tableId in triggerConfig
    if (tc.tableId && !raw.tableIds.has(tc.tableId)) {
      // Try to keep going, but clear invalid tableId
      log.warn("Invalid tableId in triggerConfig", { tableId: tc.tableId });
      delete tc.tableId;
    }

    // Validate columnId — auto-map from field name if needed
    if (tc.tableId && tc.columnId) {
      const validFields = raw.fieldIdsByTable.get(tc.tableId);
      if (validFields && !validFields.has(tc.columnId)) {
        // Try name-to-ID fallback
        const nameMap = raw.fieldNameToId.get(tc.tableId);
        const mapped = nameMap?.get(tc.columnId.toLowerCase());
        if (mapped) {
          tc.columnId = mapped;
        } else {
          log.warn("Invalid columnId, could not map", { columnId: tc.columnId, tableId: tc.tableId });
        }
      }
    }

    // Validate recipientId
    if (ac.recipientId && !raw.userIds.has(ac.recipientId)) {
      log.warn("Invalid recipientId", { recipientId: ac.recipientId });
      // Pick first available user as fallback
      const firstUser = [...raw.userIds][0];
      if (firstUser) ac.recipientId = firstUser;
    }

    // Validate assigneeId
    if (ac.assigneeId && !raw.userIds.has(Number(ac.assigneeId))) {
      log.warn("Invalid assigneeId", { assigneeId: ac.assigneeId });
      const firstUser = [...raw.userIds][0];
      if (firstUser) ac.assigneeId = firstUser;
    }

    // Validate ADD_TO_NURTURE_LIST listId
    if (a.actionType === "ADD_TO_NURTURE_LIST" && ac.listId) {
      if (!raw.nurtureListSlugs.has(ac.listId)) {
        log.warn("Invalid nurture list slug", { listId: ac.listId });
      }
    }

    // Validate CREATE_RECORD tableId
    if (a.actionType === "CREATE_RECORD" && ac.tableId) {
      if (!raw.tableIds.has(ac.tableId)) {
        log.warn("Invalid tableId in CREATE_RECORD actionConfig", { tableId: ac.tableId });
      }
    }

    // Validate MULTI_ACTION nested actions
    if (a.actionType === "MULTI_ACTION" && Array.isArray(ac.actions)) {
      ac.actions = ac.actions.slice(0, 10).filter((nested: any) => {
        if (!nested || typeof nested !== "object") return false;
        if (nested.type === "MULTI_ACTION") return false; // No nested MULTI_ACTION
        return VALID_AUTOMATION_ACTIONS.has(nested.type);
      });
    }
  }

  // ── Patch MULTI_EVENT_DURATION ──
  if (a.triggerType === "MULTI_EVENT_DURATION") {
    if (a.triggerConfig.events && !a.triggerConfig.eventChain) {
      a.triggerConfig.eventChain = a.triggerConfig.events;
      delete a.triggerConfig.events;
    }
    if (!a.triggerConfig.tableId && Array.isArray(a.triggerConfig.eventChain) && a.triggerConfig.eventChain.length > 0) {
      const firstEventTable = a.triggerConfig.eventChain[0].tableId;
      if (firstEventTable) a.triggerConfig.tableId = Number(firstEventTable);
    }
    // Coerce eventChain tableIds
    if (Array.isArray(a.triggerConfig.eventChain)) {
      for (const ev of a.triggerConfig.eventChain) {
        if (ev.tableId != null) ev.tableId = Number(ev.tableId);
        if (ev.order != null) ev.order = Number(ev.order);
      }
    }
  }

  return a;
}

function parseAnalyticsResult(cleanedText: string, formattedTables: any[]) {
  let parsed = JSON.parse(cleanedText);

  // Unwrap nested responses (AI sometimes wraps in {view:...}, {analytics:...}, {result:...})
  if (parsed.view && typeof parsed.view === "object" && (parsed.view.config || parsed.view.type)) parsed = parsed.view;
  else if (parsed.analytics && typeof parsed.analytics === "object") parsed = parsed.analytics;
  else if (parsed.result && typeof parsed.result === "object" && (parsed.result.config || parsed.result.type)) parsed = parsed.result;

  const result = parsed;

  // Title/description sanitization
  if (!result.title || typeof result.title !== "string") result.title = "תצוגה חדשה";
  result.title = result.title.slice(0, 200);
  if (result.description) {
    result.description = String(result.description).slice(0, 2000);
  }

  // Type validation — infer from config if missing or invalid
  const VALID_ANALYTICS_TYPES = new Set(["COUNT", "CONVERSION", "GRAPH"]);
  if (!result.type || !VALID_ANALYTICS_TYPES.has(result.type)) {
    if (result.config?.chartType || result.config?.yAxisMeasure) {
      result.type = "GRAPH";
    } else if (result.config?.totalFilter || result.config?.successFilter) {
      result.type = "CONVERSION";
    } else {
      result.type = "COUNT";
    }
  }

  if (!result.config || typeof result.config !== "object") {
    result.config = {};
  }

  // tableId normalization
  if (result.config.tableId) {
    result.config.tableId = Number(result.config.tableId);
  }

  // Ensure exactly one data source (model XOR tableId)
  const validModelNames = new Set(Object.keys(SYSTEM_MODEL_FIELDS));
  if (result.config.model && result.config.tableId) {
    if (validModelNames.has(result.config.model)) {
      delete result.config.tableId;
    } else {
      delete result.config.model;
    }
  }
  // Validate model name
  if (result.config.model && !validModelNames.has(result.config.model)) {
    delete result.config.model;
  }

  // If neither model nor tableId — try to infer from title/description
  if (!result.config.model && !result.config.tableId) {
    const searchText = `${result.title || ""} ${result.description || ""}`.toLowerCase();
    const matchedTable = formattedTables.find((t: any) =>
      t.name && searchText.includes(t.name.toLowerCase())
    );
    if (matchedTable) {
      result.config.tableId = matchedTable.id;
    } else {
      throw new Error("AI response missing data source (model or tableId)");
    }
  }

  // dateRangeType validation
  const VALID_DATE_RANGES = new Set(["all", "this_week", "last_30_days", "last_year"]);
  if (!result.config.dateRangeType || !VALID_DATE_RANGES.has(result.config.dateRangeType)) {
    result.config.dateRangeType = "all";
  }

  // Build allowed fields list from the shared SYSTEM_MODEL_FIELDS constant
  let allowedFields: string[] = [];
  if (result.config.tableId) {
    const table = formattedTables.find((t: any) => t.id === result.config.tableId);
    if (table && Array.isArray(table.columns)) {
      allowedFields = table.columns.map((c: any) => c.systemName || c.name);
    }
  } else if (result.config.model && validModelNames.has(result.config.model)) {
    allowedFields = Object.keys(SYSTEM_MODEL_FIELDS[result.config.model].fields);
  }

  // Validate groupByField
  if (result.config.groupByField && allowedFields.length > 0 && !allowedFields.includes(result.config.groupByField)) {
    delete result.config.groupByField;
  }

  // Filter validation helper — strips invalid field keys, returns undefined if empty
  const validateFilter = (obj: any): Record<string, any> | undefined => {
    if (!obj || typeof obj !== "object") return undefined;
    if (allowedFields.length === 0) return obj;
    const cleaned: Record<string, any> = {};
    for (const [key, val] of Object.entries(obj)) {
      if (allowedFields.includes(key)) cleaned[key] = val;
    }
    return Object.keys(cleaned).length > 0 ? cleaned : undefined;
  };

  // Type-specific validation with smart degradation
  if (result.type === "GRAPH") {
    // chartType validation
    const VALID_CHART_TYPES = new Set(["bar", "line", "pie", "area"]);
    if (!result.config.chartType || !VALID_CHART_TYPES.has(result.config.chartType)) {
      result.config.chartType = "bar";
    }

    // yAxisMeasure validation
    const VALID_Y_MEASURES = new Set(["count", "sum", "avg"]);
    if (!result.config.yAxisMeasure || !VALID_Y_MEASURES.has(result.config.yAxisMeasure)) {
      result.config.yAxisMeasure = "count";
    }

    // yAxisField: required for sum/avg, must be valid
    if (result.config.yAxisMeasure !== "count") {
      if (!result.config.yAxisField || (allowedFields.length > 0 && !allowedFields.includes(result.config.yAxisField))) {
        result.config.yAxisMeasure = "count";
        delete result.config.yAxisField;
      }
    } else {
      delete result.config.yAxisField;
    }

    // GRAPH requires groupByField — degrade to COUNT if missing
    if (!result.config.groupByField) {
      result.type = "COUNT";
      delete result.config.chartType;
      delete result.config.yAxisMeasure;
      delete result.config.yAxisField;
    }

    result.config.filter = validateFilter(result.config.filter);
    delete result.config.totalFilter;
    delete result.config.successFilter;
  }

  if (result.type === "CONVERSION") {
    result.config.totalFilter = validateFilter(result.config.totalFilter);
    result.config.successFilter = validateFilter(result.config.successFilter);

    // CONVERSION requires both filters — degrade to COUNT if missing
    if (!result.config.totalFilter || !result.config.successFilter) {
      result.type = "COUNT";
      delete result.config.totalFilter;
      delete result.config.successFilter;
    }

    delete result.config.filter;
    delete result.config.chartType;
    delete result.config.yAxisMeasure;
    delete result.config.yAxisField;
  }

  if (result.type === "COUNT") {
    result.config.filter = validateFilter(result.config.filter);
    delete result.config.totalFilter;
    delete result.config.successFilter;
    delete result.config.chartType;
    delete result.config.yAxisMeasure;
    delete result.config.yAxisField;
  }

  // Strip unexpected config keys
  const ALLOWED_CONFIG_KEYS = new Set([
    "model", "tableId", "groupByField", "dateRangeType",
    "filter", "totalFilter", "successFilter",
    "chartType", "yAxisMeasure", "yAxisField",
  ]);
  for (const key of Object.keys(result.config)) {
    if (!ALLOWED_CONFIG_KEYS.has(key) || result.config[key] === undefined) {
      delete result.config[key];
    }
  }

  return { view: result };
}

function redisKey(jobId: string) {
  return `ai-job:${jobId}`;
}

export const processAIGeneration = inngest.createFunction(
  {
    id: "process-ai-generation",
    concurrency: [
      { limit: 5 },
      { limit: 2, key: "event.data.companyId" },
    ],
    retries: 2,
    timeouts: { finish: "30s" },
    onFailure: async ({ event }) => {
      // Called only after ALL retries are exhausted — safe to mark as failed
      try {
        const { jobId, companyId } = event.data.event.data as AIJobPayload;
        const key = redisKey(jobId);
        await redis.set(
          key,
          JSON.stringify({ status: "failed", error: "AI generation failed", companyId }),
          "EX",
          AI_JOB_TTL
        );
      } catch (err) {
        log.error("onFailure: failed to write status to Redis", { error: String(err) });
      }
    },
  },
  { event: "ai/generation.requested" },
  async ({ event, step }) => {
    const { jobId, type, prompt, context, companyId, mode } = event.data as AIJobPayload;
    const key = redisKey(jobId);

    // Atomic check + set processing to prevent race conditions
    const cached = await step.run("check-status", async () => {
      const processingValue = JSON.stringify({ status: "processing", companyId });
      // SET NX — only succeeds if key doesn't exist (atomic claim)
      const acquired = await redis.set(key, processingValue, "EX", AI_JOB_TTL, "NX");
      if (acquired) return null; // We claimed it — no prior value

      // Key exists — check if already completed
      const existing = await redis.get(key);
      if (existing) {
        try {
          const parsed = JSON.parse(existing);
          if (parsed.status === "completed") return parsed.result;
        } catch {
          // Corrupted — overwrite and re-process
        }
      }
      // Exists but not completed — overwrite to claim
      await redis.set(key, processingValue, "EX", AI_JOB_TTL);
      return null;
    });

    // If already completed, return cached result
    if (cached) return cached;

    const result = await step.run("call-openrouter", async () => {
      let systemPrompt: string;
      let maxTokens: number;

      // BB16: Truncate context to avoid oversized prompts
      const safeContext = { ...context };
      if (Array.isArray(safeContext.formattedTables) && safeContext.formattedTables.length > 50) {
        log.warn("Truncating formattedTables", { from: safeContext.formattedTables.length, to: 50 });
        safeContext.formattedTables = safeContext.formattedTables.slice(0, 50);
      }
      if (Array.isArray(safeContext.existingTables) && safeContext.existingTables.length > 50) {
        log.warn("Truncating existingTables", { from: safeContext.existingTables.length, to: 50 });
        safeContext.existingTables = safeContext.existingTables.slice(0, 50);
      } else if (typeof safeContext.existingTables === "string" && safeContext.existingTables.length > 30000) {
        log.warn("Truncating existingTables context string", { maxChars: 30000 });
        safeContext.existingTables = safeContext.existingTables.slice(0, 30000);
      }

      switch (type) {
        case "schema":
          systemPrompt = buildSchemaSystemPrompt(prompt, safeContext);
          maxTokens = 6000;
          break;
        case "automation": {
          const autoMode = (mode === "suggest") ? "suggest" : "create";
          const existingSchema = safeContext.currentSchema;
          systemPrompt = buildAutomationSystemPrompt(prompt || "", safeContext, autoMode, existingSchema);
          maxTokens = autoMode === "suggest" ? 6000 : 4000;
          break;
        }
        case "analytics":
          systemPrompt = buildAnalyticsSystemPrompt(prompt, safeContext);
          maxTokens = 3000;
          break;
        case "analytics-single-refine":
          systemPrompt = buildAnalyticsSingleRefinePrompt(prompt, safeContext);
          maxTokens = 3000;
          break;
        case "analytics-suggestions":
          systemPrompt = buildAnalyticsSuggestionsPrompt(prompt || "", safeContext);
          maxTokens = 6000;
          break;
        case "analytics-report":
          systemPrompt = buildAnalyticsReportSystemPrompt(prompt, safeContext);
          maxTokens = 8000;
          break;
        case "analytics-report-refine":
          systemPrompt = buildAnalyticsReportRefinePrompt(prompt, safeContext);
          maxTokens = 8000;
          break;
        default:
          throw new Error(`Unknown AI job type: ${type}`);
      }

      const cleanedText = await callOpenRouter(systemPrompt, maxTokens);

      switch (type) {
        case "schema": {
          const existingTableIds = new Set<number>(
            Array.isArray(safeContext.existingTables)
              ? safeContext.existingTables.map((t: any) => Number(t.id)).filter((id: number) => !isNaN(id))
              : []
          );
          return parseSchemaResult(cleanedText, existingTableIds);
        }
        case "automation": {
          let rawCtx: AutomationRawContext | undefined;
          if (safeContext.rawContext) {
            try {
              rawCtx = deserializeRawContext(safeContext.rawContext as SerializedRawContext);
            } catch {
              log.warn("Failed to deserialize rawContext for automation validation");
            }
          }
          return parseAutomationResult(cleanedText, rawCtx);
        }
        case "analytics":
        case "analytics-single-refine":
          return parseAnalyticsResult(cleanedText, context.formattedTables || []);
        case "analytics-suggestions":
          return parseAnalyticsSuggestionsResult(cleanedText, context.formattedTables || []);
        case "analytics-report":
        case "analytics-report-refine":
          return parseAnalyticsReportResult(cleanedText, context.formattedTables || []);
        default:
          throw new Error(`Unknown AI job type: ${type}`);
      }
    });

    // Issue 30: Wrap final Redis write in step.run so it replays correctly after infrastructure restarts
    await step.run("store-result", async () => {
      await redis.set(key, JSON.stringify({ status: "completed", result, companyId }), "EX", AI_JOB_TTL);
    });

    return result;
  }
);

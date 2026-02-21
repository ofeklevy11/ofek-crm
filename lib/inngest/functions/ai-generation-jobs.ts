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
  "TASK_STATUS_CHANGE", "NEW_RECORD", "RECORD_FIELD_CHANGE",
  "TIME_SINCE_CREATION", "DIRECT_DIAL",
]);

const VALID_AUTOMATION_ACTIONS = new Set([
  "SEND_NOTIFICATION", "CALCULATE_DURATION", "UPDATE_RECORD_FIELD",
  "SEND_WHATSAPP", "WEBHOOK", "CREATE_TASK", "MULTI_ACTION",
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

=== ALL TRIGGER TYPES (5 total) ===

1. NEW_RECORD — When a new record is created in a table
   triggerConfig: { tableId: number, conditionColumnId?: "<REAL_FIELD_ID>", conditionValue?: string, operator?: "equals"|"not_equals"|"contains"|"greater_than"|"less_than" }

   FILTER DETECTION — If the user's request or automation name mentions ANY specific value to match, you MUST include conditionColumnId + conditionValue + operator.
   Hebrew equality patterns: "ממקור X", "מסטטוס X", "עם סטטוס X", "של סוג X", "שהגיע מ-X", "כאשר X הוא Y", "ששדה X שווה ל-Y"
   English equality patterns: "from X", "with status X", "of type X", "where X is Y"
   Hebrew numeric patterns: "נמוך מ-X", "גבוה מ-X", "פחות מ-X", "יותר מ-X", "מעל X", "מתחת ל-X", "עד X", "מינימום X", "מקסימום X", "תקציב נמוך", "סכום גבוה"
   English numeric patterns: "less than X", "greater than X", "above X", "below X", "at least X", "at most X"
   For numeric conditions use operator "less_than" or "greater_than" with a number string as conditionValue. The conditionColumnId must be a number-type field.

   EXAMPLE 1 (equality) — User says "התראה על ליד חדש ממקור פייסבוק" for table (ID: 5) with field source (ID: fld_abc123):
   "triggerConfig": { "tableId": 5, "conditionColumnId": "fld_abc123", "conditionValue": "פייסבוק", "operator": "equals" }

   EXAMPLE 2 (numeric) — User says "התראה על ליד חדש עם תקציב נמוך מ-1000" for table (ID: 5) with field budget (ID: fld_budget, Type: number):
   "triggerConfig": { "tableId": 5, "conditionColumnId": "fld_budget", "conditionValue": "1000", "operator": "less_than" }

   If NO filtering is mentioned at all, do NOT include conditionColumnId/conditionValue.

2. RECORD_FIELD_CHANGE — When a specific field value changes
   triggerConfig: { tableId: number, columnId: "<REAL_FIELD_ID_FROM_TABLE>", fromValue?: string, toValue?: string, operator?: "equals"|"not_equals"|"contains"|"greater_than"|"less_than" }

3. TASK_STATUS_CHANGE — When a built-in Task status changes
   triggerConfig: { fromStatus?: string, toStatus?: string }
   Status values: "todo", "in_progress", "waiting_client", "on_hold", "completed_month", "done"

4. TIME_SINCE_CREATION — Time-based trigger after record creation
   triggerConfig: { tableId: number, timeValue: number, timeUnit: "minutes"|"hours"|"days" }
   IMPORTANT: Use "timeValue" and "timeUnit" (NOT "duration" or "unit"). Minimum 5 minutes for minutes unit.

5. DIRECT_DIAL — When a phone field is dialed
   triggerConfig: { tableId: number }

=== ALL ACTION TYPES (6 total + MULTI_ACTION wrapper) ===

1. SEND_NOTIFICATION — Send notification to a user
   actionConfig: { recipientId: number, messageTemplate: string, titleTemplate?: string }
   IMPORTANT: Use "messageTemplate" (NOT "message") and "titleTemplate" (NOT "title").
   Template vars: {tableName}, {recordData}, {taskTitle}, {fromStatus}, {toStatus}, {fieldName}, {fromValue}, {toValue}

2. CREATE_TASK — Create a new task
   actionConfig: { title: string, description?: string, assigneeId: number, priority?: "low"|"medium"|"high", status: "todo"|"in_progress"|"waiting_client"|"on_hold"|"completed_month"|"done", dueDays?: number, tags?: string[] }
   IMPORTANT: "status" is REQUIRED. Default to "todo" if no specific status is requested. Valid values: "todo", "in_progress", "waiting_client", "on_hold", "completed_month", "done".

3. UPDATE_RECORD_FIELD — Update a field in the triggering record
   actionConfig: { tableId: number, columnId: "<REAL_FIELD_ID_FROM_TABLE>", value: string|number|boolean, recordId?: string }

4. SEND_WHATSAPP — Send a WhatsApp message
   actionConfig: { phoneColumnId: "<REAL_FIELD_ID_FROM_TABLE>", content: string, messageType?: "text"|"media", delay?: number, mediaFileId?: string }

5. WEBHOOK — Send HTTP webhook
   actionConfig: { webhookUrl: string }
   IMPORTANT: Use "webhookUrl" (NOT "url").

6. CALCULATE_DURATION — Calculate time between two field values
   actionConfig: {} (no config needed)

7. MULTI_ACTION — Execute multiple actions sequentially (max 10)
   actionConfig: { actions: [{ type: "SEND_NOTIFICATION"|"CREATE_TASK"|"UPDATE_RECORD_FIELD"|"SEND_WHATSAPP"|"WEBHOOK"|"CALCULATE_DURATION", config: {...} }] }
   IMPORTANT: Nested MULTI_ACTION is NOT allowed. Each nested action uses the same config format as above.

=== VALIDATION RULES ===
- tableId MUST be a real table ID from AVAILABLE TABLES above
- columnId MUST be a real field ID from the table's field list above. NEVER use placeholder values like "fld_xxx".
- recipientId and assigneeId MUST be real user IDs from AVAILABLE USERS
- For MULTI_ACTION: max 10 nested actions, no nested MULTI_ACTION
- All IDs must be numbers (not strings) except columnId which is a string like "fld_abc123"
- CRITICAL: Every columnId, phoneColumnId, and field reference MUST be an actual field ID (starting with "fld_") copied from the AVAILABLE TABLES section. NEVER invent or guess field IDs.

${mode === "create" ? `=== MODE: CREATE ===
USER REQUEST: "${prompt}"

Generate a single automation rule based on the user's request.

=== MANDATORY STEP-BY-STEP THINKING ===
You MUST fill the "_thinking" field FIRST before writing any other automation fields.
The "_thinking" field must contain your answers to ALL of these steps in order:

STEP 1 — WHAT: What does the user want? (1 sentence)

STEP 2 — TRIGGER: What event triggers this? Which table? Write: "TRIGGER: [type] on table [name] (ID: [id])"

STEP 3 — CONDITION CHECK: Does the request mention ANY filter, qualifier, or threshold?
   Scan for these patterns:
   - Equality filters: "ממקור X", "מסטטוס X", "מסוג X", "עם סטטוס X", "שהגיע מ-X", "מגוגל", "מפייסבוק"
   - Numeric filters: "נמוך מ X", "גבוה מ X", "פחות מ X", "יותר מ X", "מעל X", "מתחת ל X", "תקציב נמוך", "סכום גבוה"
   - English: "from X", "with status X", "less than X", "greater than X", "above X", "below X"
   If YES → write: "CONDITION REQUIRED: field=[name], id=[fld_xxx], value=[X], operator=[equals/less_than/greater_than]"
     - For select/radio fields: conditionValue must be EXACT string from [Options: ...]
     - For number fields: conditionValue is a number string, operator is "less_than" or "greater_than"
     - Common Hebrew→English: גוגל=Google, פייסבוק=Facebook, אינסטגרם=Instagram, לינקדאין=LinkedIn, אתר=Website, המלצה=Referral
   If NO → write: "NO CONDITION NEEDED — automation applies to all records"

STEP 4 — ACTION: What happens when the trigger fires? Write: "ACTION: [type] — [details]"

STEP 5 — VERIFY: Re-read the name and description you are about to generate.
   - Does the name/description mention a filter or threshold? If yes, is conditionColumnId + conditionValue + operator set in triggerConfig? If NOT → STOP and add the condition NOW.
   - Is every field ID a real fld_ from AVAILABLE TABLES? If NOT → FIX IT.
   - Are all required action fields present (messageTemplate not message, status in CREATE_TASK, webhookUrl not url, timeValue not duration)? If NOT → FIX IT.

=== COMMON MISTAKES TO AVOID ===
- Name says "מגוגל" or "תקציב נמוך" but triggerConfig has no condition → MUST add condition
- conditionValue in Hebrew when options are in English (or vice versa) → Copy EXACT string from [Options: ...]
- Using "message" instead of "messageTemplate", "title" instead of "titleTemplate", "url" instead of "webhookUrl", "duration" instead of "timeValue"
- Omitting "status" from CREATE_TASK → Always include "status": "todo" as default
- Inventing field IDs → Copy real fld_ IDs from AVAILABLE TABLES

OUTPUT FORMAT (single JSON object):
{
  "automation": {
    "_thinking": "STEP 1: [answer] STEP 2: [answer] STEP 3: [CONDITION REQUIRED: field=budget, id=fld_budget, value=1000, operator=less_than] STEP 4: [answer] STEP 5: [verification result]",
    "name": "string (Hebrew)",
    "description": "string (Hebrew, short explanation)",
    "triggerType": "string",
    "triggerConfig": { ... },
    "actionType": "string",
    "actionConfig": { ... }
  }
}

=== FINAL CHECK ===
Before outputting, confirm in _thinking:
1. Does the name/description promise a filter? If yes, is conditionColumnId + conditionValue + operator set? If not → FIX IT.
2. Is every conditionValue an EXACT match from [Options: ...] or a valid number? If not → FIX IT.
3. Is every field ID a real fld_ from AVAILABLE TABLES? If not → FIX IT.` : `=== MODE: SUGGEST ===
Analyze the organization's tables, data, workflows, and existing automations.
Suggest 6-8 valuable automations that would help this business.
${prompt ? `User hint: "${prompt}"` : ""}
Avoid duplicating existing automations.
Each suggestion should use a different combination of trigger+action when possible.
At least 2-3 suggestions MUST use simple action types that don't require field references: SEND_NOTIFICATION, CREATE_TASK.
When using UPDATE_RECORD_FIELD or SEND_WHATSAPP — double-check that every columnId, phoneColumnId, and field reference is a real ID (starting with "fld_") copied exactly from the AVAILABLE TABLES section above.

=== CONDITION GUIDANCE FOR SUGGESTIONS ===
When suggesting automations with NEW_RECORD or RECORD_FIELD_CHANGE triggers, you MUST evaluate whether adding a condition makes the automation MORE VALUABLE and TARGETED:

RULE 1 — SCAN FOR FILTERABLE FIELDS: Look at each table's select/radio/tags fields and their [Options: ...]. If a table has a field like "source", "status", "type", "category", or "priority" with meaningful options, consider creating TARGETED automations that filter by specific option values.

RULE 2 — TARGETED > GENERIC: An automation "notify when a NEW lead arrives from Google" is MORE VALUABLE than "notify on any new lead", because it enables differentiated workflows per source/type/status. Prefer suggesting targeted automations with conditions over generic ones.

RULE 3 — HOW TO ADD CONDITIONS: For NEW_RECORD triggers, add conditionColumnId (the real fld_ ID of the select/radio field), conditionValue (EXACT string from the field's [Options: ...] list), and operator "equals".

RULE 4 — AT LEAST 2 SUGGESTIONS WITH CONDITIONS: If the org has tables with select/radio fields that have meaningful options, at least 2 of your 6-8 suggestions MUST include conditions. Pick the most business-relevant field+value combinations.

RULE 5 — VALUE MATCHING: conditionValue MUST be an EXACT string copied from the field's [Options: ...] list. Never invent values. If options are in English (e.g., "Google", "Facebook"), use English. If in Hebrew, use Hebrew.

EXAMPLES OF GOOD SUGGESTIONS WITH CONDITIONS:
Example 1 — Table "leads" (ID: 5) has field source (ID: fld_abc, Options: Google, Facebook, Instagram):
{
  "name": "התראה על ליד חדש מגוגל",
  "description": "קבלת התראה מיידית כשנכנס ליד חדש שמקורו גוגל, לטיפול מהיר",
  "category": "notifications",
  "triggerType": "NEW_RECORD",
  "triggerConfig": { "tableId": 5, "conditionColumnId": "fld_abc", "conditionValue": "Google", "operator": "equals" },
  "actionType": "SEND_NOTIFICATION",
  "actionConfig": { "recipientId": 1, "messageTemplate": "ליד חדש מגוגל: {recordData}" }
}

Example 2 — Table "leads" (ID: 5) has field lead_type (ID: fld_xyz, Options: חם, קר, ממתין):
{
  "name": "משימה לטיפול בליד חם",
  "description": "יצירת משימה אוטומטית לטיפול מיידי בלידים חמים",
  "category": "tasks",
  "triggerType": "NEW_RECORD",
  "triggerConfig": { "tableId": 5, "conditionColumnId": "fld_xyz", "conditionValue": "חם", "operator": "equals" },
  "actionType": "CREATE_TASK",
  "actionConfig": { "title": "טיפול בליד חם חדש", "assigneeId": 1, "status": "todo", "priority": "high" }
}

Example 3 — Suggestion WITHOUT condition (generic, still valuable):
{
  "name": "התראה על שינוי סטטוס משימה",
  "description": "התראה כשמשימה עוברת לסטטוס הושלם",
  "category": "notifications",
  "triggerType": "TASK_STATUS_CHANGE",
  "triggerConfig": { "toStatus": "done" },
  "actionType": "SEND_NOTIFICATION",
  "actionConfig": { "recipientId": 1, "messageTemplate": "המשימה {taskTitle} הושלמה" }
}

IMPORTANT — For EACH suggestion, fill "_thinking" FIRST:
- If the suggestion name/description mentions ANY filter or threshold (source, status, type, budget amount, etc.), you MUST verify a matching condition (conditionColumnId + conditionValue + operator) exists in triggerConfig.
- If no filter is mentioned, write "NO CONDITION NEEDED".

OUTPUT FORMAT (JSON object with suggestions array):
{
  "suggestions": [
    {
      "_thinking": "Table 'leads' has field source (fld_abc, Options: Google, Facebook). Suggesting filter by Google. Verified: conditionColumnId=fld_abc, conditionValue=Google, operator=equals — MATCHES name.",
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

async function callOpenRouter(
  systemPrompt: string,
  maxTokens: number,
  model = "google/gemini-2.0-flash-001"
): Promise<string> {
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
      model,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: "Generate the JSON output." },
      ],
    }),
    signal: AbortSignal.timeout(55000), // 55s timeout — must stay under Vercel's 60s maxDuration
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
  let parsed: any;
  try {
    parsed = JSON.parse(cleanedText);
  } catch (e) {
    throw new Error(`Schema JSON parse failed: ${(e as Error).message}. Raw start: ${cleanedText.slice(0, 200)}`);
  }
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

function parseAutomationResult(cleanedText: string, rawContext?: AutomationRawContext, userPrompt?: string) {
  let parsed: any;
  try {
    parsed = JSON.parse(cleanedText);
  } catch (e) {
    throw new Error(`Automation JSON parse failed: ${(e as Error).message}. Raw start: ${cleanedText.slice(0, 200)}`);
  }

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
    .map((a) => validateAutomationObject(a, rawContext, userPrompt))
    .filter(Boolean);

  if (validated.length === 0) {
    throw new Error("All automation objects failed validation");
  }

  if (isSuggestMode) {
    return { suggestions: validated.slice(0, 8) };
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

function validateFieldId(
  fieldId: string | undefined,
  tableId: number | undefined,
  raw: AutomationRawContext
): string | undefined {
  if (!fieldId || typeof fieldId !== "string" || !tableId) return undefined;
  const validFields = raw.fieldIdsByTable.get(tableId);
  if (!validFields) return undefined;
  if (validFields.has(fieldId)) return fieldId;
  const nameMap = raw.fieldNameToId.get(tableId);
  const mapped = nameMap?.get(fieldId.toLowerCase());
  if (mapped) return mapped;
  log.warn("Invalid field ID, could not map", { fieldId, tableId });
  return undefined;
}

// Hebrew single-letter prefixes: מ(from), ב(in), ל(to), ש(that), ה(the), ו(and), כ(as)
const HEBREW_PREFIXES = "מבלשהוכ";

// Common CRM option values: Hebrew ↔ English transliteration
const HEBREW_ENGLISH_MAP: Record<string, string> = {
  "גוגל": "google", "פייסבוק": "facebook", "אינסטגרם": "instagram",
  "לינקדאין": "linkedin", "טוויטר": "twitter", "טיקטוק": "tiktok",
  "אתר": "website", "המלצה": "referral", "טלפון": "phone",
  "אימייל": "email", "אורגני": "organic", "ווטסאפ": "whatsapp",
  "יוטיוב": "youtube", "חם": "hot", "קר": "cold", "חדש": "new",
  "פעיל": "active", "סגור": "closed", "ממתין": "pending",
};
const ENGLISH_HEBREW_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(HEBREW_ENGLISH_MAP).map(([h, e]) => [e, h])
);

/**
 * Strip common Hebrew single-letter prefixes from a word.
 * E.g., "מגוגל" → "גוגל", "מפייסבוק" → "פייסבוק", "בטלפון" → "טלפון"
 */
function stripHebrewPrefix(word: string): string {
  if (word.length <= 2) return word; // Don't strip from very short words
  if (HEBREW_PREFIXES.includes(word[0])) return word.slice(1);
  return word;
}

/**
 * Strip up to `maxChars` Hebrew prefix characters from a word.
 * E.g., maxChars=2: "שמגוגל" → "גוגל", "ומפייסבוק" → "פייסבוק"
 */
function stripHebrewPrefixes(word: string, maxChars: number): string {
  let result = word;
  for (let i = 0; i < maxChars; i++) {
    if (result.length <= 2) break;
    if (HEBREW_PREFIXES.includes(result[0])) result = result.slice(1);
    else break;
  }
  return result;
}

/**
 * Check if a word matches an option using transliteration maps.
 * Handles cross-language matching: Hebrew word → English option or English word → Hebrew option.
 */
function transliterationMatch(word: string, optionLower: string): boolean {
  // Hebrew word → English translation → compare to option
  const engTranslation = HEBREW_ENGLISH_MAP[word];
  if (engTranslation && engTranslation === optionLower) return true;
  // English word → Hebrew translation → compare to option
  const hebTranslation = ENGLISH_HEBREW_MAP[word];
  if (hebTranslation && hebTranslation === optionLower) return true;
  return false;
}

function inferConditionFromName(
  a: any,
  raw: AutomationRawContext,
  userPrompt?: string,
  aiConditionHint?: string
): void {
  const tc = a.triggerConfig;
  // Only for NEW_RECORD triggers
  if (a.triggerType !== "NEW_RECORD" || !tc.tableId) return;
  // Skip only if BOTH conditionColumnId AND conditionValue are already set
  if (tc.conditionColumnId && tc.conditionValue) return;

  const optionsMap = raw.fieldOptionsByTable.get(tc.tableId);

  // ── Numeric condition recovery ──
  // Detect patterns like "תקציב גבוה מ-1000", "budget > 500", "נמוך מ-200"
  const allText = `${a.name || ""} ${a.description || ""} ${userPrompt || ""} ${aiConditionHint || ""}`;
  const numericPatterns: { pattern: RegExp; operator: "greater_than" | "less_than" }[] = [
    // Hebrew: גבוה מ-X, יותר מ-X, מעל X, מעל ל-X
    { pattern: /(?:גבוה|גדול|יותר)\s*מ-?\s*(\d+(?:\.\d+)?)/,  operator: "greater_than" },
    { pattern: /מעל\s*(?:ל-?)?\s*(\d+(?:\.\d+)?)/,              operator: "greater_than" },
    // Hebrew: נמוך מ-X, פחות מ-X, מתחת ל-X
    { pattern: /(?:נמוך|קטן|פחות)\s*מ-?\s*(\d+(?:\.\d+)?)/,    operator: "less_than" },
    { pattern: /מתחת\s*(?:ל-?)?\s*(\d+(?:\.\d+)?)/,             operator: "less_than" },
    // English: greater than X, above X, more than X, over X
    { pattern: /(?:greater|more|above|over)\s+(?:than\s+)?(\d+(?:\.\d+)?)/i, operator: "greater_than" },
    // English: less than X, below X, under X
    { pattern: /(?:less|below|under)\s+(?:than\s+)?(\d+(?:\.\d+)?)/i,        operator: "less_than" },
    // Symbols: > X, < X
    { pattern: />\s*(\d+(?:\.\d+)?)/,  operator: "greater_than" },
    { pattern: /<\s*(\d+(?:\.\d+)?)/,  operator: "less_than" },
  ];

  for (const { pattern, operator } of numericPatterns) {
    const match = allText.match(pattern);
    if (match) {
      const numValue = match[1];
      // Find the best number field: prefer one whose label appears in the text
      const fieldTypes = raw.fieldTypesByTable?.get(tc.tableId);
      const nameMap = raw.fieldNameToId.get(tc.tableId);
      if (fieldTypes) {
        const allTextLower = allText.toLowerCase();
        let bestNumField: string | null = null;

        // Try to find a number field whose label appears in the text
        if (nameMap) {
          for (const [labelLower, fieldId] of nameMap) {
            if (labelLower.length < 2) continue;
            const ft = fieldTypes.get(fieldId);
            if ((ft === "number" || ft === "score") && allTextLower.includes(labelLower)) {
              bestNumField = fieldId;
              break;
            }
          }
        }

        // Fallback: if only one number field exists, use it
        if (!bestNumField) {
          const numFields: string[] = [];
          for (const [fieldId, ft] of fieldTypes) {
            if (ft === "number" || ft === "score") numFields.push(fieldId);
          }
          if (numFields.length === 1) bestNumField = numFields[0];
        }

        if (bestNumField) {
          tc.conditionColumnId = bestNumField;
          tc.conditionValue = numValue;
          tc.operator = operator;
          log.info("Inferred numeric condition from text", {
            name: a.name, fieldId: bestNumField, value: numValue, operator,
          });
          return;
        }
      }
    }
  }

  if (!optionsMap || optionsMap.size === 0) return;

  // Combine all text sources for searching
  const searchText = allText;
  if (!searchText.trim()) return;

  const searchTextLower = searchText.toLowerCase();
  const words = searchText.split(/\s+/).filter(Boolean);
  // Single prefix strip (1 char)
  const stripped1Lower = words.map((w) => stripHebrewPrefixes(w, 1).toLowerCase());
  // Double prefix strip (up to 2 chars) for combos like "שמ", "ומ", "שה"
  const stripped2Lower = words.map((w) => stripHebrewPrefixes(w, 2).toLowerCase());

  let bestMatch: { fieldId: string; value: string; length: number } | null = null;

  const tryMatch = (fieldId: string, option: string, optionLower: string) => {
    // Strategy 1: Direct substring (case-insensitive)
    if (searchTextLower.includes(optionLower)) {
      if (!bestMatch || option.length > bestMatch.length) {
        bestMatch = { fieldId, value: option, length: option.length };
      }
      return true;
    }

    // Strategy 2: Word-level exact after single Hebrew prefix strip
    if (stripped1Lower.some((sw) => sw === optionLower)) {
      if (!bestMatch || option.length > bestMatch.length) {
        bestMatch = { fieldId, value: option, length: option.length };
      }
      return true;
    }

    // Strategy 3: Double prefix strip (handles "שמ", "ומ" combos)
    if (stripped2Lower.some((sw) => sw === optionLower)) {
      if (!bestMatch || option.length > bestMatch.length) {
        bestMatch = { fieldId, value: option, length: option.length };
      }
      return true;
    }

    // Strategy 4: Transliteration matching (Hebrew↔English)
    for (let i = 0; i < stripped2Lower.length; i++) {
      if (transliterationMatch(stripped2Lower[i], optionLower)) {
        if (!bestMatch || option.length > bestMatch.length) {
          bestMatch = { fieldId, value: option, length: option.length };
        }
        return true;
      }
    }

    return false;
  };

  // ── Strategy 0 (highest priority): Field-label-aware matching ──
  // Cross-reference field LABELS in the search text with their option values.
  // When both a field's label AND one of its options appear in the text,
  // this is a high-confidence match that disambiguates between fields
  // sharing the same option values (e.g. "גבוהה" in both "רמת סיכון" and "עדיפות").
  const nameMap = raw.fieldNameToId.get(tc.tableId);
  if (nameMap && optionsMap) {
    let labelMatch: { fieldId: string; value: string; score: number } | null = null;

    for (const [labelLower, fieldId] of nameMap) {
      if (labelLower.length < 3) continue;
      if (!searchTextLower.includes(labelLower)) continue;

      // Field label found — check if any of its options also appear
      const fieldOptions = optionsMap.get(fieldId);
      if (!fieldOptions || fieldOptions.length === 0) continue;

      for (const option of fieldOptions) {
        if (option.length < 2) continue;
        const optionLower = option.toLowerCase();

        let optionFound = searchTextLower.includes(optionLower);
        if (!optionFound) optionFound = stripped1Lower.some((sw) => sw === optionLower);
        if (!optionFound) optionFound = stripped2Lower.some((sw) => sw === optionLower);

        if (optionFound) {
          const score = labelLower.length + option.length;
          if (!labelMatch || score > labelMatch.score) {
            labelMatch = { fieldId, value: option, score };
          }
        }
      }
    }

    if (labelMatch) {
      tc.conditionColumnId = labelMatch.fieldId;
      tc.conditionValue = labelMatch.value;
      tc.operator = "equals";
      log.info("Inferred condition via field-label-aware match (Strategy 0)", {
        name: a.name,
        fieldId: labelMatch.fieldId,
        value: labelMatch.value,
      });
      return; // High-confidence match — skip weaker strategies
    }
  }

  // Strategies 1-4: Generic option-value matching across all fields
  for (const [fieldId, options] of optionsMap) {
    for (const option of options) {
      if (option.length < 2) continue;
      const optionLower = option.toLowerCase();
      tryMatch(fieldId, option, optionLower);
    }
  }

  // Strategy 5: AI hint matching — if aiConditionHint is provided but no match yet,
  // try matching the hint directly against options using strategies 1-4
  if (!bestMatch && aiConditionHint) {
    const hintLower = aiConditionHint.toLowerCase();
    const hintStripped1 = stripHebrewPrefixes(aiConditionHint, 1).toLowerCase();
    const hintStripped2 = stripHebrewPrefixes(aiConditionHint, 2).toLowerCase();

    for (const [fieldId, options] of optionsMap) {
      for (const option of options) {
        if (option.length < 2) continue;
        const optionLower = option.toLowerCase();

        // Direct match of hint against option
        if (hintLower === optionLower || optionLower.includes(hintLower) || hintLower.includes(optionLower)) {
          if (!bestMatch || option.length > bestMatch.length) {
            bestMatch = { fieldId, value: option, length: option.length };
          }
          continue;
        }
        // Stripped hint match
        if (hintStripped1 === optionLower || hintStripped2 === optionLower) {
          if (!bestMatch || option.length > bestMatch.length) {
            bestMatch = { fieldId, value: option, length: option.length };
          }
          continue;
        }
        // Transliteration of hint
        if (transliterationMatch(hintLower, optionLower) ||
            transliterationMatch(hintStripped1, optionLower) ||
            transliterationMatch(hintStripped2, optionLower)) {
          if (!bestMatch || option.length > bestMatch.length) {
            bestMatch = { fieldId, value: option, length: option.length };
          }
        }
      }
    }
  }

  if (bestMatch) {
    tc.conditionColumnId = bestMatch.fieldId;
    tc.conditionValue = bestMatch.value;
    tc.operator = "equals";
    log.info("Inferred condition from automation name/prompt", {
      name: a.name,
      fieldId: bestMatch.fieldId,
      value: bestMatch.value,
    });
  } else if (a.triggerType === "NEW_RECORD") {
    // Debug logging: help diagnose why no match was found
    const fieldSummary: Record<string, number> = {};
    for (const [fieldId, options] of optionsMap) {
      fieldSummary[fieldId] = options.length;
    }
    log.warn("inferConditionFromName: no match found for NEW_RECORD trigger", {
      tableId: tc.tableId,
      fieldsWithOptions: fieldSummary,
      searchTextSnippet: searchText.slice(0, 200),
      strippedWords: stripped2Lower.slice(0, 15),
      aiConditionHint: aiConditionHint || "none",
    });
  }
}

// Hebrew filter phrase patterns used to detect implied conditions in titles
const FILTER_PATTERNS = [
  /ממקור\s+(\S+)/,         // "ממקור פייסבוק" → "פייסבוק"
  /מסטטוס\s+(\S+)/,        // "מסטטוס חדש" → "חדש"
  /מסוג\s+(\S+)/,           // "מסוג חם" → "חם"
  /מקטגוריה\s+(\S+)/,      // "מקטגוריה X" → "X"
  /עם\s+סטטוס\s+(\S+)/,    // "עם סטטוס X" → "X"
  /של\s+סוג\s+(\S+)/,      // "של סוג X" → "X"
  /ברמת\s+\S+\s+(\S+)/,    // "ברמת סיכון גבוהה" → "גבוהה"
  /ברמה\s+(\S+)/,           // "ברמה גבוהה" → "גבוהה"
  /בעדיפות\s+(\S+)/,       // "בעדיפות גבוהה" → "גבוהה"
  /בסטטוס\s+(\S+)/,        // "בסטטוס פעיל" → "פעיל"
  /בדרגת\s+\S+\s+(\S+)/,   // "בדרגת דחיפות גבוהה" → "גבוהה"
  /בדרגה\s+(\S+)/,          // "בדרגה גבוהה" → "גבוהה"
  /בשלב\s+(\S+)/,           // "בשלב ביניים" → "ביניים"
  /במצב\s+(\S+)/,           // "במצב פעיל" → "פעיל"
];

// Direct single-word filter patterns: "מגוגל", "מפייסבוק", etc.
const DIRECT_FILTER_WORDS = Object.keys(HEBREW_ENGLISH_MAP);

/**
 * Final audit: if the automation name implies a filter (e.g. "ממקור פייסבוק")
 * but no condition exists, attempt one last match or clean the title.
 */
function auditTitleConditionMatch(a: any, raw: AutomationRawContext): void {
  const tc = a.triggerConfig;
  if (a.triggerType !== "NEW_RECORD" || !tc.tableId) return;
  // If condition is already complete, nothing to audit
  if (tc.conditionColumnId && tc.conditionValue) return;

  const name = a.name || "";
  if (!name) return;

  // Step 1: Detect filter phrases in the title
  let detectedFilterValue: string | null = null;
  let matchedPattern: RegExp | null = null;

  // Check multi-word patterns first
  for (const pattern of FILTER_PATTERNS) {
    const match = name.match(pattern);
    if (match) {
      detectedFilterValue = match[1];
      matchedPattern = pattern;
      break;
    }
  }

  // Check single-word patterns: "מגוגל", "מפייסבוק", etc.
  if (!detectedFilterValue) {
    const words = name.split(/\s+/);
    for (const word of words) {
      if (word.length <= 2) continue;
      // Strip "מ" prefix and check if remainder is a known filter word
      if (HEBREW_PREFIXES.includes(word[0])) {
        const stripped = word.slice(1);
        if (DIRECT_FILTER_WORDS.includes(stripped)) {
          detectedFilterValue = stripped;
          break;
        }
      }
    }
  }

  if (!detectedFilterValue) return; // No filter pattern in title

  // Step 2a: Label-aware match — prefer field whose label appears in the title
  const optionsMap = raw.fieldOptionsByTable.get(tc.tableId);
  const nameMap = raw.fieldNameToId.get(tc.tableId);
  if (nameMap && optionsMap) {
    const titleLower = name.toLowerCase();
    const filterLower2a = detectedFilterValue.toLowerCase();
    const filterStripped2a = stripHebrewPrefixes(detectedFilterValue, 2).toLowerCase();
    for (const [labelLower, fieldId] of nameMap) {
      if (labelLower.length < 3) continue;
      if (!titleLower.includes(labelLower)) continue;
      const labelOptions = optionsMap.get(fieldId);
      if (!labelOptions) continue;
      for (const option of labelOptions) {
        const optionLower = option.toLowerCase();
        if (filterLower2a === optionLower || filterStripped2a === optionLower) {
          tc.conditionColumnId = fieldId;
          tc.conditionValue = option;
          tc.operator = "equals";
          log.info("auditTitleConditionMatch: recovered via label-aware match", {
            name, label: labelLower, fieldId, value: option,
          });
          return;
        }
      }
    }
  }

  // Step 2b: Generic match against all field options
  if (optionsMap && optionsMap.size > 0) {
    const filterLower = detectedFilterValue.toLowerCase();
    const filterStripped = stripHebrewPrefixes(detectedFilterValue, 2).toLowerCase();

    for (const [fieldId, options] of optionsMap) {
      for (const option of options) {
        if (option.length < 2) continue;
        const optionLower = option.toLowerCase();
        // Direct match
        if (filterLower === optionLower || filterStripped === optionLower) {
          tc.conditionColumnId = fieldId;
          tc.conditionValue = option;
          tc.operator = "equals";
          log.info("auditTitleConditionMatch: recovered condition from title", {
            name, fieldId, value: option,
          });
          return;
        }
        // Transliteration match
        if (transliterationMatch(filterLower, optionLower) ||
            transliterationMatch(filterStripped, optionLower)) {
          tc.conditionColumnId = fieldId;
          tc.conditionValue = option;
          tc.operator = "equals";
          log.info("auditTitleConditionMatch: recovered condition via transliteration", {
            name, fieldId, value: option,
          });
          return;
        }
      }
    }
  }

  // Step 2c: Numeric condition recovery from title
  const numericTitlePatterns: { pattern: RegExp; operator: "greater_than" | "less_than" }[] = [
    { pattern: /(?:גבוה|גדול|יותר)\s*מ-?\s*(\d+(?:\.\d+)?)/,  operator: "greater_than" },
    { pattern: /מעל\s*(?:ל-?)?\s*(\d+(?:\.\d+)?)/,              operator: "greater_than" },
    { pattern: /(?:נמוך|קטן|פחות)\s*מ-?\s*(\d+(?:\.\d+)?)/,    operator: "less_than" },
    { pattern: /מתחת\s*(?:ל-?)?\s*(\d+(?:\.\d+)?)/,             operator: "less_than" },
    { pattern: /(?:greater|more|above|over)\s+(?:than\s+)?(\d+(?:\.\d+)?)/i, operator: "greater_than" },
    { pattern: /(?:less|below|under)\s+(?:than\s+)?(\d+(?:\.\d+)?)/i,        operator: "less_than" },
    { pattern: />\s*(\d+(?:\.\d+)?)/,  operator: "greater_than" },
    { pattern: /<\s*(\d+(?:\.\d+)?)/,  operator: "less_than" },
  ];

  for (const { pattern, operator } of numericTitlePatterns) {
    const numMatch = name.match(pattern);
    if (numMatch) {
      const fieldTypes = raw.fieldTypesByTable?.get(tc.tableId);
      if (fieldTypes) {
        const nameLower = name.toLowerCase();
        const nameMapLocal = raw.fieldNameToId.get(tc.tableId);
        let bestNumField: string | null = null;

        if (nameMapLocal) {
          for (const [labelLower, fieldId] of nameMapLocal) {
            if (labelLower.length < 2) continue;
            const ft = fieldTypes.get(fieldId);
            if ((ft === "number" || ft === "score") && nameLower.includes(labelLower)) {
              bestNumField = fieldId;
              break;
            }
          }
        }
        if (!bestNumField) {
          const numFields: string[] = [];
          for (const [fieldId, ft] of fieldTypes) {
            if (ft === "number" || ft === "score") numFields.push(fieldId);
          }
          if (numFields.length === 1) bestNumField = numFields[0];
        }

        if (bestNumField) {
          tc.conditionColumnId = bestNumField;
          tc.conditionValue = numMatch[1];
          tc.operator = operator;
          log.info("auditTitleConditionMatch: recovered numeric condition from title", {
            name, fieldId: bestNumField, value: numMatch[1], operator,
          });
          return;
        }
      }
    }
  }

  // Step 3: Could not add condition — clean the title to remove misleading filter
  const originalName = a.name;
  if (matchedPattern) {
    a.name = a.name.replace(matchedPattern, "").replace(/\s{2,}/g, " ").trim();
  } else if (detectedFilterValue) {
    // Remove the "מ+word" pattern
    const escaped = detectedFilterValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    a.name = a.name.replace(new RegExp(`מ${escaped}`, "g"), "").replace(/\s{2,}/g, " ").trim();
  }
  if (a.name !== originalName) {
    log.info("auditTitleConditionMatch: cleaned misleading filter from title", {
      original: originalName, cleaned: a.name,
    });
  }
}

function validateAutomationObject(a: any, raw?: AutomationRawContext, userPrompt?: string): any | null {
  if (!a || typeof a !== "object") return null;

  // Validate trigger/action types
  if (!a.triggerType || !VALID_AUTOMATION_TRIGGERS.has(a.triggerType)) return null;
  if (!a.actionType || !VALID_AUTOMATION_ACTIONS.has(a.actionType)) return null;

  if (!a.name || typeof a.name !== "string") a.name = "אוטומציה חדשה";
  if (!a.triggerConfig || typeof a.triggerConfig !== "object") a.triggerConfig = {};
  if (!a.actionConfig || typeof a.actionConfig !== "object") a.actionConfig = {};

  // Strip internal reasoning fields so they don't leak to the frontend
  delete a._reasoning;
  delete a._verification;
  delete a._thinking;

  // ── Coerce numeric IDs ──
  if (a.triggerConfig.tableId != null) {
    a.triggerConfig.tableId = Number(a.triggerConfig.tableId);
  }
  if (a.triggerConfig.duration != null) {
    a.triggerConfig.duration = Number(a.triggerConfig.duration);
  }
  if (a.triggerConfig.timeValue != null) {
    a.triggerConfig.timeValue = Number(a.triggerConfig.timeValue);
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

  // ── Normalize field names (safety net for AI using old names) ──
  const tc = a.triggerConfig;
  const ac = a.actionConfig;

  // TIME_SINCE_CREATION: duration → timeValue, unit → timeUnit
  if (a.triggerType === "TIME_SINCE_CREATION") {
    if (tc.duration != null && tc.timeValue == null) {
      tc.timeValue = Number(tc.duration);
      delete tc.duration;
    }
    if (tc.unit && !tc.timeUnit) {
      tc.timeUnit = tc.unit;
      delete tc.unit;
    }
  }

  // SEND_NOTIFICATION: message → messageTemplate, title → titleTemplate
  if (a.actionType === "SEND_NOTIFICATION") {
    if (ac.message && !ac.messageTemplate) {
      ac.messageTemplate = ac.message;
      delete ac.message;
    }
    if (ac.title && !ac.titleTemplate) {
      ac.titleTemplate = ac.title;
      delete ac.title;
    }
  }

  // WEBHOOK: url → webhookUrl
  if (a.actionType === "WEBHOOK") {
    if (ac.url && !ac.webhookUrl) {
      ac.webhookUrl = ac.url;
      delete ac.url;
    }
  }

  // Normalize nested MULTI_ACTION actions
  if (a.actionType === "MULTI_ACTION" && Array.isArray(ac.actions)) {
    for (const nested of ac.actions) {
      if (!nested?.config) continue;
      const nc = nested.config;
      if (nested.type === "SEND_NOTIFICATION") {
        if (nc.message && !nc.messageTemplate) { nc.messageTemplate = nc.message; delete nc.message; }
        if (nc.title && !nc.titleTemplate) { nc.titleTemplate = nc.title; delete nc.title; }
      }
      if (nested.type === "WEBHOOK") {
        if (nc.url && !nc.webhookUrl) { nc.webhookUrl = nc.url; delete nc.url; }
      }
    }
  }

  // ── Validate IDs against raw context ──
  if (raw) {
    // Validate tableId in triggerConfig
    if (tc.tableId && !raw.tableIds.has(tc.tableId)) {
      log.warn("Invalid tableId in triggerConfig", { tableId: tc.tableId });
      delete tc.tableId;
    }

    // Validate triggerConfig.columnId — auto-map from field name or delete
    if (tc.columnId) {
      const validated = validateFieldId(tc.columnId, tc.tableId, raw);
      if (validated) tc.columnId = validated;
      else delete tc.columnId;
    }

    // Validate triggerConfig.conditionColumnId — preserve AI's value hint before cleanup
    let aiConditionHint: string | undefined;
    if (tc.conditionColumnId) {
      const validated = validateFieldId(tc.conditionColumnId, tc.tableId, raw);
      if (validated) {
        tc.conditionColumnId = validated;
        // Validate conditionValue against field type and options
        if (tc.tableId) {
          const fieldOptions = raw.fieldOptionsByTable.get(tc.tableId);
          const options = fieldOptions?.get(tc.conditionColumnId);
          const fieldTypes = raw.fieldTypesByTable?.get(tc.tableId);
          const fieldType = fieldTypes?.get(tc.conditionColumnId);
          const isNumericField = fieldType === "number" || fieldType === "score";
          const isNumericOperator = tc.operator === "greater_than" || tc.operator === "less_than";

          if (options && options.length > 0) {
            // Select/radio field — try multiple matching strategies before deleting
            const condVal = String(tc.conditionValue || "").toLowerCase();
            let matchedOption: string | null = null;

            // Strategy 1: Direct case-insensitive match
            for (const o of options) {
              if (o.toLowerCase() === condVal) { matchedOption = o; break; }
            }
            // Strategy 2: Transliteration match (Hebrew↔English)
            if (!matchedOption) {
              for (const o of options) {
                if (transliterationMatch(condVal, o.toLowerCase())) { matchedOption = o; break; }
              }
            }
            // Strategy 3: Hebrew prefix-stripped match
            if (!matchedOption) {
              const stripped1 = stripHebrewPrefixes(condVal, 1);
              const stripped2 = stripHebrewPrefixes(condVal, 2);
              for (const o of options) {
                const oLow = o.toLowerCase();
                if (stripped1 === oLow || stripped2 === oLow) { matchedOption = o; break; }
                if (transliterationMatch(stripped1, oLow) || transliterationMatch(stripped2, oLow)) { matchedOption = o; break; }
              }
            }

            if (matchedOption) {
              tc.conditionValue = matchedOption; // normalize to canonical option
            } else {
              aiConditionHint = tc.conditionValue || undefined;
              delete tc.conditionColumnId;
              delete tc.conditionValue;
            }
          } else if (isNumericField || isNumericOperator) {
            // Number/score field — allow through if conditionValue is a valid number
            const numVal = Number(tc.conditionValue);
            if (!isNaN(numVal) && tc.conditionValue != null && String(tc.conditionValue).trim() !== "") {
              tc.conditionValue = String(numVal);
              if (!tc.operator) tc.operator = "greater_than";
            } else {
              aiConditionHint = tc.conditionValue || undefined;
              delete tc.conditionColumnId;
              delete tc.conditionValue;
            }
          } else {
            // Text/other field with no options and no numeric operator — condition can't work
            aiConditionHint = tc.conditionValue || undefined;
            delete tc.conditionColumnId;
            delete tc.conditionValue;
          }
        }
      } else {
        aiConditionHint = tc.conditionValue; // preserve before deletion
        delete tc.conditionColumnId;
        delete tc.conditionValue;
      }
    }
    // Clean up orphaned conditionValue without a column
    if (tc.conditionValue && !tc.conditionColumnId) {
      if (!aiConditionHint) aiConditionHint = tc.conditionValue;
      delete tc.conditionValue;
    }

    // Safety net: infer condition from automation name/description/user prompt if AI omitted it
    inferConditionFromName(a, raw, userPrompt, aiConditionHint);

    // Final audit: if title implies a filter but no condition exists, clean the title
    auditTitleConditionMatch(a, raw);

    // Validate actionConfig.columnId (e.g. UPDATE_RECORD_FIELD)
    if (ac.columnId) {
      const acTableId = ac.tableId || tc.tableId;
      const validated = validateFieldId(ac.columnId, acTableId, raw);
      if (validated) ac.columnId = validated;
      else delete ac.columnId;
    }

    // Validate actionConfig.phoneColumnId (SEND_WHATSAPP)
    if (ac.phoneColumnId) {
      const validated = validateFieldId(ac.phoneColumnId, tc.tableId, raw);
      if (validated) ac.phoneColumnId = validated;
      else delete ac.phoneColumnId;
    }

    // Validate recipientId
    if (ac.recipientId && !raw.userIds.has(ac.recipientId)) {
      log.warn("Invalid recipientId", { recipientId: ac.recipientId });
      const firstUser = [...raw.userIds][0];
      if (firstUser) ac.recipientId = firstUser;
    }

    // Validate assigneeId
    if (ac.assigneeId && !raw.userIds.has(Number(ac.assigneeId))) {
      log.warn("Invalid assigneeId", { assigneeId: ac.assigneeId });
      const firstUser = [...raw.userIds][0];
      if (firstUser) ac.assigneeId = firstUser;
    }

    // Validate MULTI_ACTION nested actions
    if (a.actionType === "MULTI_ACTION" && Array.isArray(ac.actions)) {
      ac.actions = ac.actions.slice(0, 10).filter((nested: any) => {
        if (!nested || typeof nested !== "object") return false;
        if (nested.type === "MULTI_ACTION") return false; // No nested MULTI_ACTION
        if (!VALID_AUTOMATION_ACTIONS.has(nested.type)) return false;

        // Validate field references inside nested action config
        const nc = nested.config;
        if (nc && typeof nc === "object") {
          if (nc.columnId) {
            const ncTableId = nc.tableId || tc.tableId;
            const validated = validateFieldId(nc.columnId, ncTableId, raw);
            if (validated) nc.columnId = validated;
            else delete nc.columnId;
          }
          if (nc.phoneColumnId) {
            const validated = validateFieldId(nc.phoneColumnId, tc.tableId, raw);
            if (validated) nc.phoneColumnId = validated;
            else delete nc.phoneColumnId;
          }
        }

        return true;
      });
    }
  }

  // ── Final completeness check: reject if required fields were cleaned out ──
  if (raw) {
    const tt = a.triggerType;
    const at = a.actionType;

    if (tt === "RECORD_FIELD_CHANGE" && !tc.columnId) {
      log.warn("Automation rejected: missing required triggerConfig.columnId", { triggerType: tt, name: a.name });
      return null;
    }

    if (at === "UPDATE_RECORD_FIELD" && !ac.columnId) {
      log.warn("Automation rejected: missing required actionConfig.columnId", { actionType: at, name: a.name });
      return null;
    }

    if (at === "SEND_WHATSAPP" && !ac.phoneColumnId) {
      log.warn("Automation rejected: missing required actionConfig.phoneColumnId", { actionType: at, name: a.name });
      return null;
    }
  }

  return a;
}

function parseAnalyticsResult(cleanedText: string, formattedTables: any[]) {
  let parsed: any;
  try {
    parsed = JSON.parse(cleanedText);
  } catch (e) {
    throw new Error(`Analytics JSON parse failed: ${(e as Error).message}. Raw start: ${cleanedText.slice(0, 200)}`);
  }

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
    timeouts: { finish: "120s" },
    onFailure: async ({ event }) => {
      // Called only after ALL retries are exhausted — safe to mark as failed
      try {
        const { jobId, companyId } = event.data.event.data as AIJobPayload;
        const rawError = (event.data as any).error?.message || (event.data as any).error || "AI generation failed";
        const errorMsg = String(rawError).slice(0, 300);
        const key = redisKey(jobId);
        await redis.set(
          key,
          JSON.stringify({ status: "failed", error: errorMsg, companyId }),
          "EX",
          AI_JOB_TTL
        );
        log.error("AI generation failed after all retries", { jobId, error: errorMsg });
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

      let modelOverride: string | undefined;

      switch (type) {
        case "schema":
          systemPrompt = buildSchemaSystemPrompt(prompt, safeContext);
          maxTokens = 6000;
          break;
        case "automation": {
          const autoMode = (mode === "suggest") ? "suggest" : "create";
          const existingSchema = safeContext.currentSchema;
          systemPrompt = buildAutomationSystemPrompt(prompt || "", safeContext, autoMode, existingSchema);
          maxTokens = autoMode === "suggest" ? 8000 : 4000;
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

      const cleanedText = await callOpenRouter(systemPrompt, maxTokens, modelOverride);

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
          return parseAutomationResult(cleanedText, rawCtx, prompt);
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

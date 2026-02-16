import { inngest } from "../client";
import { NonRetriableError } from "inngest";
import { redis } from "@/lib/redis";
import { createLogger } from "@/lib/logger";

const log = createLogger("AiGenerationJobs");

const AI_JOB_TTL = 600; // 10 minutes TTL for results in Redis

type AIJobType = "schema" | "automation" | "analytics";

interface AIJobPayload {
  jobId: string;
  type: AIJobType;
  prompt: string;
  context: Record<string, any>;
  companyId: number;
}

function buildSchemaSystemPrompt(prompt: string, context: Record<string, any>): string {
  let systemPrompt = `
    You are a database expert helper. The user wants to create or modify a table schema.
    The user might ask in Hebrew. You must understand Hebrew but return variable names/system names in English (camelCase or snake_case). Label fields in Hebrew if the user asks in Hebrew.

    IMPORTANT: You must return a valid JSON object. Do not include markdown formatting like \`\`\`json.
    `;

  if (context.currentSchema) {
    systemPrompt += `
      CURRENT SCHEMA:
      ${JSON.stringify(context.currentSchema, null, 2)}

      USER REQUEST (Modification):
      "${prompt}"

      INSTRUCTIONS:
      Update the CURRENT SCHEMA based on the USER REQUEST. Return the fully updated JSON schema.
      `;
  } else {
    systemPrompt += `
      USER REQUEST:
      "${prompt}"

      CONTEXT (Existing tables):
      ${context.existingTables || "None"}

      INSTRUCTIONS:
      Generate a new JSON schema for the table requested.
      `;
  }

  systemPrompt += `
    The JSON must strictly follow this format:
    {
      "tableName": "string (Human readable name, in Hebrew if request is Hebrew)",
      "slug": "string (lowercase, dashes only, english)",
      "description": "string (short description)",
      "fields": [
        {
          "name": "string (camelCase or snake_case system name, unique, ENGLISH only)",
          "label": "string (Human readable label, matches user language)",
          "type": "string (Allowed types ONLY: text, number, date, boolean, select, email, phone, url, currency)",
          "options": "string (comma separated list of options, ONLY for 'select' type. Otherwise empty string. IMPORTANT: Generate these options in HEBREW (or the user's request language).)",
          "defaultValue": "string (optional default value)",
          "relationTableId": "number (optional, internal use only)"
        }
      ]
    }

    Rules:
    1. Always include a 'title' or 'name' field as the first field if appropriate (e.g. 'Customer Name', 'Project Title').
    2. 'type' must be EXACTLY one of: text, number, date, boolean, select, email, phone, url, currency.
    3. Do NOT use types like 'textarea', 'multi-select', 'radio', 'lookup'. Use 'text' or 'select' instead.
    4. Provide at least 5-6 relevant fields for "Create a table..." requests to make it useful.
    5. Return ONLY the JSON object.
    `;

  return systemPrompt;
}

function buildAutomationSystemPrompt(prompt: string, context: Record<string, any>): string {
  return `
    You are an automation expert helper. The user wants to create an automation rule for their CRM system.
    The user might ask in Hebrew. You must understand Hebrew.

    USER REQUEST:
    "${prompt}"

    CONTEXT:
    Available Tables: ${context.tables || "None"}
    Available Users: ${context.users || "None"}
    Existing Automations: ${context.existingAutomations || "None"}

    INSTRUCTIONS:
    Generate an automation rule JSON based on the USER REQUEST.

    The JSON must strictly follow this format:
    {
      "name": "string (descriptive name for the automation, ALWAYS in Hebrew)",
      "triggerType": "string (one of: 'NEW_RECORD', 'RECORD_FIELD_CHANGE', 'TASK_STATUS_CHANGE', 'MULTI_EVENT_DURATION')",
      "triggerConfig": {
        "tableId": "number (The ID of the main table involved. For MULTI_EVENT, use the ID of the first table)",
        "columnId": "string (The ID of the field from the table schema, NOT the name. e.g. 'fld_12345')",
        "fromValue": "string (optional - trigger only if changing from this value)",
        "toValue": "string (optional - trigger only if changing to this value)",
        "fromStatus": "string (optional - starting status)",
        "toStatus": "string (optional - ending status)",
        "eventChain": [
          {
            "tableId": "number (optional - table to watch for this specific event)",
            "eventName": "string (event name/label)",
            "columnId": "string (The ID of the field from the table schema, NOT the name)",
            "value": "string (value that triggers this event)",
            "order": "number (sequence order, starting from 1)"
          }
        ],
        "isMultiTable": "boolean (true if events span multiple tables)",
        "relationField": "string (optional - field that relates different tables)"
      },
      "actionType": "string (one of: 'SEND_NOTIFICATION', 'CREATE_TASK', 'CALCULATE_DURATION', 'CALCULATE_MULTI_EVENT_DURATION')",
      "actionConfig": {
        "recipientId": "number (user ID to receive notification)",
        "title": "string (notification title)",
        "message": "string (notification message)",
        "description": "string (task description)",
        "assigneeId": "number (user ID to assign task to)",
        "priority": "string (one of: 'low', 'medium', 'high')",
        "fromField": "string (starting field name)",
        "toField": "string (ending field name)",
        "fromValue": "string (optional - starting value)",
        "toValue": "string (optional - ending value)",
        "weightConfig": {
          "eventWeights": "object (optional - weights for each event)"
        }
      }
    }

    Rules:
    1. Determine if this should be a regular automation (NEW_RECORD, TASK_STATUS_CHANGE) or a multi-event automation (MULTI_EVENT_DURATION).
    2. For multi-event automations, always use MULTI_EVENT_DURATION as triggerType and CALCULATE_MULTI_EVENT_DURATION as actionType.
    3. For regular automations triggered by record creation/update, use NEW_RECORD as triggerType if it's about "new" or "created". Use RECORD_FIELD_CHANGE if it's about "changed" or "updated" specific field.
    4. For task-related automations (built-in Task model), use TASK_STATUS_CHANGE as triggerType.
    5. Choose the most appropriate actionType based on what the user wants to happen.
    6. Return ONLY the JSON object. No markdown or explanations.
    7. ALWAYS find the most relevant table ID from the Context and put it in triggerConfig.tableId.
    8. Look CAREFULLY at the 'Columns' list for each table in CONTEXT to find the correct columnId. Do NOT guess column IDs or names. Use the exact ID provided in the column list (e.g. 'fld_xxxxx'). IF you cannot find the column ID, try to find the closest match by name but prefer ID.
    9. All text content (names, titles, messages) MUST be in Hebrew.
    `;
}

function buildAnalyticsSystemPrompt(prompt: string, context: Record<string, any>): string {
  return `
    You are an analytics configuration expert. The user wants to create an analytics view/chart for their CRM system.
    The user might ask in Hebrew. You must understand Hebrew.

    USER REQUEST:
    "${prompt}"

    CONTEXT:
    Available Custom Tables: ${JSON.stringify(context.formattedTables)}
    System Models: Task (status, priority, assignee, tags), Retainer (status, frequency, amount), OneTimePayment (status, amount), Transaction (status, amount, relatedType), CalendarEvent (title, description, startTime)

    INSTRUCTIONS:
    Generate a JSON configuration for the analytics view.

    The JSON must strictly follow this format:
    {
      "title": "string (descriptive title for the view, in Hebrew if request is Hebrew)",
      "type": "string (one of: 'COUNT', 'CONVERSION')",
      "description": "string (short explanation)",
      "config": {
        "model": "string (Task, Retainer, OneTimePayment, Transaction, CalendarEvent) OR leave empty if using a custom table",
        "tableId": "number (if using a custom table, provide the ID from CONTEXT)",
        "groupByField": "string (field system name to group by, e.g., 'status', 'priority', or a custom field ID/systemName)",
        "dateRangeType": "string (one of: 'all', 'this_week', 'last_30_days', 'last_year')",
        "filter": {
           "field_system_name": "value_to_match"
        },
        "totalFilter": {
           "field_system_name": "value_to_match"
        },
        "successFilter": {
           "field_system_name": "value_to_match"
        }
      }
    }

    Rules:
    1. Determine if this is a simple count/breakdown (COUNT) or a conversion rate (CONVERSION).
    2. Conversion usually implies comparing a subset to a total (e.g. "won leads vs all leads").
    3. Breakdown/Pie chart requests usually mean COUNT with groupByField.
    4. If the user mentions a specific table, find its ID in the CONTEXT.
    5. CRITICAL: Use EXACT field system names from columns or system models. Do NOT invent new field names. Check the 'columns' array in CONTEXT for custom tables.
    6. If grouping by a field (groupByField), prefer filtering by that same field if the user request implies narrowing down that specific breakdown.
    7. Return ONLY the JSON object.
    `;
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

function parseSchemaResult(cleanedText: string) {
  const parsed = JSON.parse(cleanedText);
  let schema;
  if (parsed.schema) schema = parsed.schema;
  else if (parsed.table) schema = parsed.table;
  else schema = parsed;

  if (!schema.tableName) schema.tableName = "Table Name";
  if (!Array.isArray(schema.fields)) schema.fields = [];

  return { schema };
}

function parseAutomationResult(cleanedText: string) {
  const parsed = JSON.parse(cleanedText);

  const findValidObject = (obj: any, depth = 0): any => {
    if (depth > 10 || !obj || typeof obj !== "object") return null;
    if (obj.triggerType && obj.actionType) return obj;
    if (Array.isArray(obj)) {
      for (const item of obj) {
        const found = findValidObject(item, depth + 1);
        if (found) return found;
      }
    } else {
      for (const key in obj) {
        const found = findValidObject(obj[key], depth + 1);
        if (found) return found;
      }
    }
    return null;
  };

  let automation = findValidObject(parsed) || parsed;
  if (!automation.name) automation.name = "אוטומציה חדשה";

  // Patch MULTI_EVENT_DURATION
  if (automation.triggerType === "MULTI_EVENT_DURATION") {
    if (automation.triggerConfig?.events && !automation.triggerConfig?.eventChain) {
      automation.triggerConfig.eventChain = automation.triggerConfig.events;
    }
    if (!automation.triggerConfig?.tableId && automation.triggerConfig?.eventChain?.length > 0) {
      const firstEventTable = automation.triggerConfig.eventChain[0].tableId;
      if (firstEventTable) automation.triggerConfig.tableId = Number(firstEventTable);
    }
  }

  if (automation.triggerConfig?.tableId) {
    automation.triggerConfig.tableId = Number(automation.triggerConfig.tableId);
  }

  return { automation };
}

function parseAnalyticsResult(cleanedText: string, formattedTables: any[]) {
  const result = JSON.parse(cleanedText);

  if (result.config?.tableId) {
    result.config.tableId = Number(result.config.tableId);
  }

  if (result.config) {
    const { model, tableId, groupByField, filter, totalFilter, successFilter } = result.config;
    let allowedFields: string[] = [];

    if (tableId) {
      const table = formattedTables.find((t: any) => t.id === tableId);
      if (table) {
        allowedFields = table.columns.map((c: any) => c.systemName || c.name);
      }
    } else if (model) {
      if (model === "Task") allowedFields = ["status", "priority", "assignee", "tags"];
      else if (model === "Retainer") allowedFields = ["status", "frequency", "amount"];
      else if (model === "OneTimePayment") allowedFields = ["status", "amount"];
      else if (model === "Transaction") allowedFields = ["status", "amount", "relatedType"];
      else if (model === "CalendarEvent") allowedFields = ["title", "description", "startTime"];
    }

    const validateAndClean = (obj: any) => {
      if (!obj) return;
      Object.keys(obj).forEach((key) => {
        if (allowedFields.length > 0 && !allowedFields.includes(key)) {
          delete obj[key];
        }
      });
    };

    if (groupByField && allowedFields.length > 0 && !allowedFields.includes(groupByField)) {
      result.config.groupByField = undefined;
    }

    validateAndClean(filter);
    validateAndClean(totalFilter);
    validateAndClean(successFilter);
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
    const { jobId, type, prompt, context, companyId } = event.data as AIJobPayload;
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
      if (typeof safeContext.existingTables === "string" && safeContext.existingTables.length > 30000) {
        log.warn("Truncating existingTables context", { maxChars: 30000 });
        safeContext.existingTables = safeContext.existingTables.slice(0, 30000);
      }

      switch (type) {
        case "schema":
          systemPrompt = buildSchemaSystemPrompt(prompt, safeContext);
          maxTokens = 4000;
          break;
        case "automation":
          systemPrompt = buildAutomationSystemPrompt(prompt, safeContext);
          maxTokens = 4000;
          break;
        case "analytics":
          systemPrompt = buildAnalyticsSystemPrompt(prompt, safeContext);
          maxTokens = 2000;
          break;
        default:
          throw new Error(`Unknown AI job type: ${type}`);
      }

      const cleanedText = await callOpenRouter(systemPrompt, maxTokens);

      switch (type) {
        case "schema":
          return parseSchemaResult(cleanedText);
        case "automation":
          return parseAutomationResult(cleanedText);
        case "analytics":
          return parseAnalyticsResult(cleanedText, context.formattedTables || []);
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

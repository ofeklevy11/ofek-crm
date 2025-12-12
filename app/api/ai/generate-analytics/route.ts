import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { prompt, tables } = await req.json();

    if (!prompt) {
      return NextResponse.json(
        { error: "Prompt is required" },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENROUTER_API_KEY is not configured" },
        { status: 500 }
      );
    }

    const formattedTables = tables.map((t: any) => {
      let columns: any[] = [];
      if (t.schemaJson) {
        let schema = t.schemaJson;
        if (typeof schema === "string") {
          try {
            schema = JSON.parse(schema);
          } catch (e) {}
        }

        if (Array.isArray(schema)) {
          columns = schema;
        } else if (schema.columns && Array.isArray(schema.columns)) {
          columns = schema.columns;
        }
      }
      return { id: t.id, name: t.name, columns };
    });

    const systemPrompt = `
    You are an analytics configuration expert. The user wants to create an analytics view/chart for their CRM system.
    The user might ask in Hebrew. You must understand Hebrew.
    
    USER REQUEST:
    "${prompt}"
    
    CONTEXT:
    Available Custom Tables: ${JSON.stringify(formattedTables)}
    System Models: Task (status, priority, assignee, tags), Retainer (status, frequency, amount), OneTimePayment (status, amount), Transaction (status, amount, relatedType), CalendarEvent (title, description, startTime)
    
    INSTRUCTIONS:
    Generate a JSON configuration for the analytics view.
    
    The JSON must strictly follow this format:
    {
      "title": "string (descriptive title for the view, in Hebrew if request is Hebrew)",
      "type": "string (one of: 'COUNT', 'CONVERSION')",
      "description": "string (short explanation)",
      "config": {
        // Data Source
        "model": "string (Task, Retainer, OneTimePayment, Transaction, CalendarEvent) OR leave empty if using a custom table",
        "tableId": "number (if using a custom table, provide the ID from CONTEXT)",
        
        // Grouping
        "groupByField": "string (field system name to group by, e.g., 'status', 'priority', or a custom field ID/systemName)",
        
        // Date Range
        "dateRangeType": "string (one of: 'all', 'this_week', 'last_30_days', 'last_year')",
        
        // Filters
        // If type is COUNT:
        "filter": {
           "field_system_name": "value_to_match"
        },
        
        // If type is CONVERSION (requires two filters: total/denominator and success/numerator):
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

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "http://localhost:3000",
          "X-Title": "Analytics Creator App",
        },
        body: JSON.stringify({
          model: "google/gemini-2.0-flash-001",
          max_tokens: 2000,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "user",
              content: systemPrompt,
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.text();
      console.error("AI API Error:", errorData);
      throw new Error(`AI API responded with ${response.status}: ${errorData}`);
    }

    const data = await response.json();
    const textResponse = data.choices?.[0]?.message?.content;

    if (!textResponse) {
      throw new Error("Invalid response format from AI");
    }

    // Clean up the response
    const cleanedText = textResponse
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    let result: any = {};
    try {
      result = JSON.parse(cleanedText);
    } catch (e) {
      console.error("Failed to parse JSON:", cleanedText);
      throw new Error("AI returned invalid JSON");
    }

    // Ensure numeric tableId if present
    if (result.config?.tableId) {
      result.config.tableId = Number(result.config.tableId);
    }

    // VALIDATION: Check if fields actually exist in the target table/model
    if (result.config) {
      const {
        model,
        tableId,
        groupByField,
        filter,
        totalFilter,
        successFilter,
      } = result.config;

      // Define allowable fields based on selection
      let allowedFields: string[] = [];

      if (tableId) {
        const table = formattedTables.find((t: any) => t.id === tableId);
        if (table) {
          allowedFields = table.columns.map((c: any) => c.systemName || c.name); // Support both if systemName isn't strictly used in some legacy tables
        }
      } else if (model) {
        // System models mapping (should match what we gave in context)
        if (model === "Task")
          allowedFields = ["status", "priority", "assignee", "tags"];
        else if (model === "Retainer")
          allowedFields = ["status", "frequency", "amount"];
        else if (model === "OneTimePayment")
          allowedFields = ["status", "amount"];
        else if (model === "Transaction")
          allowedFields = ["status", "amount", "relatedType"];
        else if (model === "CalendarEvent")
          allowedFields = ["title", "description", "startTime"];
      }

      const validateAndClean = (obj: any) => {
        if (!obj) return;
        Object.keys(obj).forEach((key) => {
          if (allowedFields.length > 0 && !allowedFields.includes(key)) {
            console.warn(
              `AI hallucinated field ${key} for ${model || tableId}. Removing.`
            );
            delete obj[key];
          }
        });
      };

      // If we are grouping by a field, filters should typically align with that field OR be valid global filters.
      // The user specifically asked: "If grouping by field, filtering should appear by that field".
      // This likely means: Don't filter by a field that doesn't exist, AND if we are grouping, ensure the filter key makes sense.
      // For now, strict schema validation covers the "doesn't exist" part.

      if (
        groupByField &&
        allowedFields.length > 0 &&
        !allowedFields.includes(groupByField)
      ) {
        // If group field is invalid, we can't really group.
        console.warn(
          `AI selected invalid group field ${groupByField}. resetting.`
        );
        result.config.groupByField = undefined;
      }

      validateAndClean(filter);
      validateAndClean(totalFilter);
      validateAndClean(successFilter);
    }

    return NextResponse.json({ view: result });
  } catch (error: any) {
    console.error("Error generating analytics:", error);
    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { prompt, existingAutomations, tables, users } = await req.json();

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

    const systemPrompt = `
    You are an automation expert helper. The user wants to create an automation rule for their CRM system.
    
    USER REQUEST:
    "${prompt}"
    
    CONTEXT:
    Available Tables: ${tables || "None"}
    Available Users: ${users || "None"}
    Existing Automations: ${existingAutomations || "None"}
    
    INSTRUCTIONS:
    Generate an automation rule JSON based on the USER REQUEST.
    
    The JSON must strictly follow this format:
    {
      "name": "string (descriptive name for the automation)",
      "triggerType": "string (one of: 'NEW_RECORD', 'RECORD_FIELD_CHANGE', 'TASK_STATUS_CHANGE', 'MULTI_EVENT_DURATION')",
      "triggerConfig": {
        // REQUIRED for ALL types (except TASK_STATUS_CHANGE):
        "tableId": "number (The ID of the main table involved. For MULTI_EVENT, use the ID of the first table)",

        // For NEW_RECORD (Creation only):
        // No extra fields usually needed, maybe strict conditions if implemented.

        // For RECORD_FIELD_CHANGE (General table updates):
        "columnId": "string (The ID of the field from the table schema, NOT the name)",
        "fromValue": "string (optional - trigger only if changing from this value)",
        "toValue": "string (optional - trigger only if changing to this value)",
        
        // For TASK_STATUS_CHANGE (Specific to Task model):
        "fromStatus": "string (optional - starting status)",
        "toStatus": "string (optional - ending status)",
        
        // For MULTI_EVENT_DURATION:
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
        // For SEND_NOTIFICATION:
        "recipientId": "number (user ID to receive notification)",
        "title": "string (notification title)",
        "message": "string (notification message)",
        
        // For CREATE_TASK:
        "title": "string (task title)",
        "description": "string (task description)",
        "assigneeId": "number (user ID to assign task to)",
        "priority": "string (one of: 'low', 'medium', 'high')",
        
        // For CALCULATE_DURATION:
        "fromField": "string (starting field name)",
        "toField": "string (ending field name)",
        "fromValue": "string (optional - starting value)",
        "toValue": "string (optional - ending value)",
        
        // For CALCULATE_MULTI_EVENT_DURATION:
        "weightConfig": {
          "eventWeights": "object (optional - weights for each event)"
        }
      }
    }
    
    Rules:
    1. Determine if this should be a regular automation (NEW_RECORD, TASK_STATUS_CHANGE) or a multi-event automation (MULTI_EVENT_DURATION).
    2. For multi-event automations, always use MULTI_EVENT_DURATION as triggerType and CALCULATE_MULTI_EVENT_DURATION as actionType.
    3. For regular automations triggered by record creation/update, use NEW_RECORD as triggerType.
    4. For task-related automations, use TASK_STATUS_CHANGE as triggerType.
    5. Choose the most appropriate actionType based on what the user wants to happen.
    6. Make sure all required fields for the chosen trigger/action types are included.
    7. Return ONLY the JSON object. No markdown or explanations.
    8. If creating a multi-event automation, include at least 2 events in the eventChain array.
    9. ALWAYS find the most relevant table ID from the Context and put it in triggerConfig.tableId. If the automation monitors a specific table, use that ID. If it monitors multiple, use the primary one.
    10. Ensure all keys are in English.
    11. Look CAREFULLY at the 'Columns' list for each table in CONTEXT to find the correct columnId. Do NOT guess column IDs or names. Use the exact ID provided in the column list (e.g. 'fld_xxxxx').
    `;

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "http://localhost:3000",
          "X-Title": "Automation Creator App",
        },
        body: JSON.stringify({
          model: "google/gemini-2.0-flash-001",
          max_tokens: 4000,
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

    let automation: any = {};
    try {
      console.log("[AIGen] Raw Cleaned Text:", cleanedText);
      const parsed = JSON.parse(cleanedText);

      // Recursive search for a valid automation object
      const findValidObject = (obj: any): any => {
        if (!obj || typeof obj !== "object") return null;
        if (obj.triggerType && obj.actionType) return obj;

        if (Array.isArray(obj)) {
          for (const item of obj) {
            const found = findValidObject(item);
            if (found) return found;
          }
        } else {
          for (const key in obj) {
            const found = findValidObject(obj[key]);
            if (found) return found;
          }
        }
        return null;
      };

      const found = findValidObject(parsed);
      if (found) {
        automation = found;
        console.log("[AIGen] Found valid inner automation object");
      } else {
        console.warn(
          "[AIGen] No valid automation object found in response, using root parsed object"
        );
        automation = parsed;
      }

      // Default name if missing
      if (!automation.name) {
        automation.name = "אוטומציה חדשה";
      }

      console.log("[AIGen] Final Automation Object:", automation);
    } catch (e) {
      console.error("Failed to parse JSON:", cleanedText);
      throw new Error("AI returned invalid JSON");
    }

    // --- Validation & Patching Logic ---
    if (automation.triggerType === "MULTI_EVENT_DURATION") {
      // Ensure eventChain exists as alias for events if AI messed up
      if (
        automation.triggerConfig?.events &&
        !automation.triggerConfig?.eventChain
      ) {
        automation.triggerConfig.eventChain = automation.triggerConfig.events;
      }

      if (!automation.triggerConfig?.tableId) {
        console.warn(
          "[AIGen] Missing tableId in triggerConfig, attempting to patch from eventChain..."
        );
        if (automation.triggerConfig?.eventChain?.length > 0) {
          const firstEventTable =
            automation.triggerConfig.eventChain[0].tableId;
          if (firstEventTable) {
            automation.triggerConfig.tableId = Number(firstEventTable);
          }
        }
      }
    }

    // Ensure tableId is a number if present
    if (automation.triggerConfig?.tableId) {
      automation.triggerConfig.tableId = Number(
        automation.triggerConfig.tableId
      );
    }

    return NextResponse.json({ automation });
  } catch (error: any) {
    console.error("Error generating automation:", error);
    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}

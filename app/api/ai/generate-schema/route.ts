import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { prompt, existingTables, currentSchema } = await req.json();

    if (!prompt) {
      return NextResponse.json(
        { error: "Prompt is required" },
        { status: 400 },
      );
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENROUTER_API_KEY is not configured" },
        { status: 500 },
      );
    }

    let systemPrompt = `
    You are a database expert helper. The user wants to create or modify a table schema.
    The user might ask in Hebrew. You must understand Hebrew but return variable names/system names in English (camelCase or snake_case). Label fields in Hebrew if the user asks in Hebrew.
    
    IMPORTANT: You must return a valid JSON object. Do not include markdown formatting like \`\`\`json.
    `;

    if (currentSchema) {
      systemPrompt += `
        CURRENT SCHEMA:
        ${JSON.stringify(currentSchema, null, 2)}
        
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
        ${existingTables || "None"}
        
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

    // specific implementation for OpenRouter API
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "http://localhost:3000",
          "X-Title": "Table Creator App",
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
      },
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

    // Clean up the response (remove markdown code blocks if any)
    const cleanedText = textResponse
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    console.log("AI Raw Response:", cleanedText); // Debugging

    let schema;
    try {
      const parsed = JSON.parse(cleanedText);
      // Handle case where AI wraps it in { schema: ... } or { table: ... }
      if (parsed.schema) {
        schema = parsed.schema;
      } else if (parsed.table) {
        schema = parsed.table;
      } else {
        schema = parsed;
      }

      // Validation basics
      if (!schema.tableName) schema.tableName = "Table Name";
      if (!Array.isArray(schema.fields)) schema.fields = [];
    } catch (e) {
      console.error("Failed to parse JSON:", cleanedText);
      throw new Error("AI returned invalid JSON");
    }

    return NextResponse.json({ schema });
  } catch (error: any) {
    console.error("Error generating table schema:", error);
    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 },
    );
  }
}

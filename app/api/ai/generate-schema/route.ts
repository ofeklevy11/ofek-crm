import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { prompt, existingTables, currentSchema } = await req.json();

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

    let systemPrompt = `
    You are a database expert helper. The user wants to create or modify a table schema.
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
      "tableName": "string (Human readable)",
      "slug": "string (lowercase, dashes only)",
      "description": "string (short description)",
      "fields": [
        {
          "name": "string (camelCase or snake_case system name, unique)",
          "label": "string (Human readable label)",
          "type": "string (one of: text, textarea, number, date, boolean, url, select, multi-select, tags, radio, relation, lookup, automation)",
          "options": "string (comma separated list of options, ONLY for select, multi-select, radio, tags. Otherwise empty string)",
          "defaultValue": "string (optional default value)",
          "relationTableId": "number (optional, if type is relation)",
           "displayField": "string (optional, if type is relation)"
        }
      ]
    }

    Rules:
    1. Always include a 'title' or 'name' field as the first field if appropriate.
    2. 'type' must be one of the allowed values.
    3. Return ONLY the JSON object. No markdown.
    `;

    // specific implementation for OpenRouter API
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "http://localhost:3000", // Optional, for OpenRouter rankings
          "X-Title": "Table Creator App", // Optional
        },
        body: JSON.stringify({
          model: "google/gemini-2.0-flash-001", // Reliable and fast model
          max_tokens: 4000,
          response_format: { type: "json_object" }, // Enforce JSON
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

    // Clean up the response (remove markdown code blocks if any)
    const cleanedText = textResponse
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    let schema;
    try {
      schema = JSON.parse(cleanedText);
    } catch (e) {
      console.error("Failed to parse JSON:", cleanedText);
      throw new Error("AI returned invalid JSON");
    }

    return NextResponse.json({ schema });
  } catch (error: any) {
    console.error("Error generating table schema:", error);
    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}

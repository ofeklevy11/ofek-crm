"use client";

import { useState, useEffect } from "react";
import { getTables } from "@/app/actions/tables";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Copy, Check, ArrowLeft, Loader2, Database } from "lucide-react"; // ArrowLeft instead of ArrowRight for RTL back button
import Link from "next/link";

import { Alert, AlertDescription } from "@/components/ui/alert";

interface SchemaField {
  name: string;
  type: string;
  label: string;
  // include other props if needed
}

export default function MakeRequestGenerator() {
  const [tables, setTables] = useState<any[]>([]);
  const [selectedTableSlug, setSelectedTableSlug] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const [mode, setMode] = useState<"TABLE" | "TASK">("TABLE");

  useEffect(() => {
    async function loadTables() {
      try {
        const result = await getTables();
        if (result.success && result.data) {
          setTables(result.data);
        }
      } catch (e) {
        console.error("Failed to load tables", e);
      } finally {
        setLoading(false);
      }
    }
    loadTables();
  }, []);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const generateJson = () => {
    if (mode === "TASK") {
      return JSON.stringify(
        {
          title: "משימה חדשה מאוטומציה",
          email: "{{1.email}}", // Required to identify user
          description: "{{1.description}}",
          status: "OPEN",
          priority: "MEDIUM",
          due_date: "YYYY-MM-DD",
        },
        null,
        2
      );
    }

    if (!selectedTableSlug) return "";

    const table = tables.find((t) => t.slug === selectedTableSlug);
    if (!table) return "";

    let schema: SchemaField[] = [];
    try {
      schema =
        typeof table.schemaJson === "string"
          ? JSON.parse(table.schemaJson)
          : table.schemaJson;
    } catch (e) {
      console.error("Error parsing schema", e);
      return JSON.stringify({ error: "Invalid Schema" }, null, 2);
    }

    const jsonObj: Record<string, any> = {
      table_slug: table.slug,
    };

    schema.forEach((field) => {
      // Logic to suggest reasonable placeholders based on field name/type
      let placeholder = `{{change_me}}`;

      const name = field.name.toLowerCase();
      if (name.includes("name")) placeholder = "{{1.full_name}}";
      else if (name.includes("email")) placeholder = "{{1.email}}";
      else if (name.includes("phone")) placeholder = "{{1.phone_number}}";
      else if (name.includes("date")) placeholder = "YYYY-MM-DD";
      else if (field.type === "number") placeholder = "123";

      jsonObj[field.name] = placeholder;
    });

    return JSON.stringify(jsonObj, null, 2);
  };

  const jsonOutput = generateJson();

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex items-center gap-2 mb-6 text-slate-500 hover:text-slate-800 transition-colors w-fit">
          <ArrowLeft className="w-4 h-4" />{" "}
          {/* Should point right in RTL? No, left is 'back' usually, but in RTL typically arrow pointing to start of flow (right) is forward. standard back icons usually point 'backwards'. In RTL 'back' is Right. Let's start with ArrowRight for 'Back' in RTL if we strictly follow direction or just 'ArrowRight' logic. Actually, lucide-react ArrowRight points -> . In RTL layout, back is usually ->. Let's check typical usage. 
           Wait, system instruction says dir="rtl".
           Most RTL interfaces use right arrow for back.
           */}
          <Link
            href="/guides/make-integration"
            className="flex items-center gap-2"
          >
            חזרה למדריך
          </Link>
        </div>

        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            מחולל בקשות POST
          </h1>
          <p className="text-slate-600">
            בחר את סוג הפעולה וקבל את הגדרות ה-API המדויקות לשימוש ב-Make.
          </p>
        </div>

        <div className="flex justify-center mb-8">
          <div className="bg-slate-100 p-1 rounded-lg inline-flex">
            <button
              onClick={() => setMode("TABLE")}
              className={`px-6 py-2 rounded-md text-sm font-medium transition-all ${
                mode === "TABLE"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              יצירת רשומה בטבלה
            </button>
            <button
              onClick={() => setMode("TASK")}
              className={`px-6 py-2 rounded-md text-sm font-medium transition-all ${
                mode === "TASK"
                  ? "bg-white text-purple-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              יצירת משימת מערכת
            </button>
          </div>
        </div>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {mode === "TABLE" ? (
                <Database className="w-5 h-5 text-blue-600" />
              ) : (
                <Check className="w-5 h-5 text-purple-600" />
              )}
              {mode === "TABLE" ? "בחר טבלה" : "הגדרות משימה"}
            </CardTitle>
            <CardDescription>
              {mode === "TABLE"
                ? "בחר את הטבלה אליה תרצה להכניס נתונים. המערכת תזהה אוטומטית את העמודות."
                : "מבנה קבוע ליצירת משימות במערכת המשימות הראשית."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {mode === "TABLE" && loading ? (
              <div className="flex justify-center py-8 text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
            ) : (
              <div className="space-y-6">
                {mode === "TABLE" && (
                  <Select
                    onValueChange={setSelectedTableSlug}
                    value={selectedTableSlug}
                  >
                    <SelectTrigger
                      className="w-full h-12 text-lg text-right"
                      dir="rtl"
                    >
                      <SelectValue placeholder="בחר טבלה מהרשימה..." />
                    </SelectTrigger>
                    <SelectContent dir="rtl">
                      {tables.map((table) => (
                        <SelectItem key={table.id} value={table.slug}>
                          {table.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {(selectedTableSlug || mode === "TASK") && (
                  <div className="animate-in fade-in slide-in-from-top-4 duration-300 space-y-6">
                    {/* URL Section */}
                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                      <h3 className="text-sm font-semibold text-slate-700 mb-2">
                        כתובת ה-API (URL):
                      </h3>
                      <div
                        className="flex items-center gap-2 bg-white border border-slate-300 rounded px-3 py-2 font-mono text-sm text-slate-600 break-all"
                        dir="ltr"
                      >
                        <span className="flex-1">
                          https://your-domain.com/api/make/
                          {mode === "TABLE" ? "leads" : "tasks"}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() =>
                            handleCopy(
                              `https://your-domain.com/api/make/${mode === "TABLE" ? "leads" : "tasks"}`
                            )
                          }
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>

                    {/* JSON Section */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-slate-700">
                          JSON להעתקה:
                        </h3>
                        <Button
                          variant={copied ? "default" : "outline"}
                          size="sm"
                          className={
                            copied ? "bg-green-600 hover:bg-green-700" : ""
                          }
                          onClick={() => handleCopy(jsonOutput)}
                        >
                          {copied ? (
                            <Check className="w-4 h-4 mr-1" />
                          ) : (
                            <Copy className="w-4 h-4 mr-1" />
                          )}
                          {copied ? "הועתק!" : "העתק JSON"}
                        </Button>
                      </div>
                      <div className="bg-slate-900 rounded-lg p-6 overflow-x-auto relative group">
                        <pre
                          className="text-slate-50 font-mono text-sm leading-relaxed"
                          dir="ltr"
                        >
                          <code>{jsonOutput}</code>
                        </pre>
                      </div>
                    </div>

                    <Alert className="bg-blue-50 border-blue-200 text-blue-800">
                      <AlertDescription>
                        {mode === "TABLE" ? (
                          <>
                            טיפ: השתמשנו במשתנים נפוצים של Make (כמו{" "}
                            <code>{"{{1.email}}"}</code>). וודא שהם תואמים
                            לטריגר שלך ב-Scenario.
                          </>
                        ) : (
                          <>
                            שים לב: השדה <code>email</code> הוא <b>חובה</b> כדי
                            לזהות את המשתמש וליצור את המשימה תחתיו.
                          </>
                        )}
                      </AlertDescription>
                    </Alert>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

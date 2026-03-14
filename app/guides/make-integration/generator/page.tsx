"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { getTables } from "@/app/actions/tables";
import { getCurrentAuthUser } from "@/app/actions/auth";
import {
  Card,
  CardContent,
  CardHeader,
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
import {
  Copy,
  Check,
  ArrowLeft,
  Loader2,
  Database,
  Info,
  Calendar,
} from "lucide-react";
import Link from "next/link";

import { Alert, AlertDescription } from "@/components/ui/alert";

interface SchemaField {
  name: string;
  type: string;
  label: string;
}

function GeneratorContent() {
  const searchParams = useSearchParams();
  const initialModeParam = searchParams.get("mode")?.toUpperCase();
  const initialMode =
    initialModeParam === "TASK" || initialModeParam === "CALENDAR"
      ? (initialModeParam as "TASK" | "CALENDAR")
      : "TABLE";

  const [tables, setTables] = useState<any[]>([]);
  const [selectedTableSlug, setSelectedTableSlug] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState<string>("");
  const [currentUserCompanyId, setCurrentUserCompanyId] = useState<
    number | null
  >(null);

  const [mode, setMode] = useState<"TABLE" | "TASK" | "CALENDAR">(initialMode);

  useEffect(() => {
    async function loadData() {
      try {
        const [tablesResult, userResult] = await Promise.all([
          getTables(),
          getCurrentAuthUser(),
        ]);

        if (tablesResult.success && tablesResult.data) {
          setTables(tablesResult.data);
        }

        if (userResult.success && userResult.data) {
          setCurrentUserEmail(userResult.data.email);
          setCurrentUserCompanyId(userResult.data.companyId);
        }
      } catch (e) {
        console.error("Failed to load data", e);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const generateJson = () => {
    const companyId = currentUserCompanyId || 1;

    if (mode === "TASK") {
      return JSON.stringify(
        {
          company_id: companyId,
          title: "משימה חדשה מאוטומציה",
          email: "{{1.email}}",
          description: "{{1.description}}",
          status: "todo",
          priority: "medium",
          due_date: "YYYY-MM-DD",
        },
        null,
        2
      );
    }

    if (mode === "CALENDAR") {
      return JSON.stringify(
        {
          company_id: companyId,
          title: "כותרת חופשית לבחירתכם",
          description: "תיאור חופשי לבחירתכם",
          email: currentUserEmail || "admin@example.com",
          start_time: "2026-01-01T12:00:00",
          end_time: "2026-01-01T13:00:00",
          color: "blue",
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
      company_id: companyId,
    };

    schema.forEach((field) => {
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

  const getApiUrl = () => {
    switch (mode) {
      case "TABLE":
        return "https://your-domain.com/api/make/leads";
      case "TASK":
        return "https://your-domain.com/api/make/tasks";
      case "CALENDAR":
        return "https://your-domain.com/api/make/calendar";
      default:
        return "";
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <nav aria-label="ניווט" className="mb-6">
          <div className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors w-fit">
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <Link href="/guides" className="flex items-center gap-2">
              חזרה למדריכים
            </Link>
          </div>
        </nav>

        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            מחולל בקשות POST
          </h1>
          <p className="text-slate-600">
            בחר את סוג הפעולה וקבל את הגדרות ה-API המדויקות לשימוש ב-Make.
          </p>
        </div>

        <div className="flex justify-center mb-8">
          <div className="bg-slate-100 p-1 rounded-lg inline-flex" role="group" aria-label="בחירת סוג פעולה">
            <button
              onClick={() => setMode("TABLE")}
              aria-pressed={mode === "TABLE"}
              className={`px-6 py-2 rounded-md text-sm font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                mode === "TABLE"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              יצירת רשומה בטבלה
            </button>
            <button
              onClick={() => setMode("TASK")}
              aria-pressed={mode === "TASK"}
              className={`px-6 py-2 rounded-md text-sm font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                mode === "TASK"
                  ? "bg-white text-purple-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              יצירת משימת מערכת
            </button>
            <button
              onClick={() => setMode("CALENDAR")}
              aria-pressed={mode === "CALENDAR"}
              className={`px-6 py-2 rounded-md text-sm font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                mode === "CALENDAR"
                  ? "bg-white text-orange-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              יצירת אירוע יומן
            </button>
          </div>
        </div>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <h2 className="text-2xl font-semibold leading-none tracking-tight flex items-center gap-2">
              {mode === "TABLE" && (
                <Database className="w-5 h-5 text-blue-600" aria-hidden="true" />
              )}
              {mode === "TASK" && <Check className="w-5 h-5 text-purple-600" aria-hidden="true" />}
              {mode === "CALENDAR" && (
                <Calendar className="w-5 h-5 text-orange-600" aria-hidden="true" />
              )}
              {mode === "TABLE"
                ? "בחר טבלה"
                : mode === "TASK"
                  ? "הגדרות משימה"
                  : "הגדרות יומן"}
            </h2>
            <CardDescription>
              {mode === "TABLE"
                ? "בחר את הטבלה אליה תרצה להכניס נתונים. המערכת תזהה אוטומטית את העמודות."
                : mode === "TASK"
                  ? "מבנה קבוע ליצירת משימות במערכת המשימות הראשית."
                  : "מבנה קבוע ליצירת אירועים ביומן הפגישות."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {mode === "TABLE" && loading ? (
              <div className="flex justify-center py-8 text-slate-400" role="status" aria-label="טוען">
                <Loader2 className="w-8 h-8 animate-spin" aria-hidden="true" />
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
                      aria-label="בחר טבלה"
                    >
                      <SelectValue placeholder="בחר טבלה מהרשימה..." />
                    </SelectTrigger>
                    <SelectContent>
                      {tables.map((table) => (
                        <SelectItem key={table.id} value={table.slug}>
                          {table.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {(selectedTableSlug ||
                  mode === "TASK" ||
                  mode === "CALENDAR") && (
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
                        <span className="flex-1">{getApiUrl()}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleCopy(getApiUrl())}
                          aria-label="העתק כתובת API"
                        >
                          <Copy className="w-3 h-3" aria-hidden="true" />
                        </Button>
                      </div>
                    </div>

                    {mode === "TASK" && (
                      <Alert className="bg-red-50 border-red-200 text-red-900 mb-4" role="note">
                        <Info className="h-4 w-4 text-red-600" aria-hidden="true" />
                        <AlertDescription className="font-bold">
                          שים לב: ערכי status ו-priority חייבים להיות באותיות
                          קטנות בלבד (lowercase)! שימוש באותיות גדולות יגרום
                          לשגיאה או להתעלמות מהערך.
                        </AlertDescription>
                      </Alert>
                    )}

                    {mode === "CALENDAR" && (
                      <div className="space-y-4 mb-4">
                        <Alert className="bg-amber-100 border-amber-200 text-amber-900" role="note">
                          <Info className="h-4 w-4 text-amber-700" aria-hidden="true" />
                          <AlertDescription className="font-bold">
                            שימו לב: פורמט התאריך הוא ISO-8601 (שנה-חודש-יום).
                            <br />
                            לדוגמה: 2026-01-01T12:00:00 מייצג את ה-1 בינואר 2026
                            בשעה 12:00 בצהריים.
                          </AlertDescription>
                        </Alert>

                        <Alert className="bg-red-50 border-red-200 text-red-900" role="note">
                          <Info className="h-4 w-4 text-red-600" aria-hidden="true" />
                          <AlertDescription className="font-bold">
                            שדה email הוא קריטי! בלי אימייל תקין של משתמש קיים
                            במערכת, הבקשה תיכשל.
                          </AlertDescription>
                        </Alert>
                      </div>
                    )}

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
                            <Check className="w-4 h-4 mr-1" aria-hidden="true" />
                          ) : (
                            <Copy className="w-4 h-4 mr-1" aria-hidden="true" />
                          )}
                          {copied ? "הועתק!" : "העתק JSON"}
                        </Button>
                      </div>
                      <div className="bg-slate-900 rounded-lg p-6 overflow-x-auto relative group">
                        <pre
                          className="text-slate-50 font-mono text-sm leading-relaxed"
                          dir="ltr"
                          role="group"
                          aria-label="קוד JSON שנוצר"
                        >
                          <code>{jsonOutput}</code>
                        </pre>
                      </div>
                    </div>

                    <Alert className="bg-blue-50 border-blue-200 text-blue-800" role="note">
                      <AlertDescription>
                        {mode === "TABLE" ? (
                          <>
                            טיפ: השתמשנו במשתנים נפוצים של Make (כמו{" "}
                            <code>{"{{1.email}}"}</code>). וודא שהם תואמים
                            לטריגר שלך ב-Scenario.
                          </>
                        ) : mode === "TASK" ? (
                          <>
                            שים לב: השדה <code>email</code> הוא <b>חובה</b> כדי
                            לזהות את המשתמש וליצור את המשימה תחתיו.
                          </>
                        ) : (
                          <>
                            שים לב: השדה <code>email</code> נשאב אוטומטית
                            מהמשתמש המחובר, אך ניתן לעריכה ידנית אם תרצו לשייך
                            למשתמש אחר.
                          </>
                        )}
                      </AlertDescription>
                    </Alert>

                    {mode === "TASK" && (
                      <div
                        className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4"
                        dir="ltr"
                      >
                        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 text-sm">
                          <span className="font-bold block mb-2 text-slate-700">
                            Status Options:
                          </span>
                          <ul className="space-y-1 text-slate-600 font-mono">
                            <li>
                              <span className="text-blue-600 font-bold">
                                todo
                              </span>{" "}
                              - Default
                            </li>
                            <li>in_progress</li>
                            <li>waiting_client</li>
                            <li>completed_month</li>
                          </ul>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 text-sm">
                          <span className="font-bold block mb-2 text-slate-700">
                            Priority Options:
                          </span>
                          <ul className="space-y-1 text-slate-600 font-mono">
                            <li>low</li>
                            <li>
                              <span className="text-purple-600 font-bold">
                                medium
                              </span>{" "}
                              - Default
                            </li>
                            <li>high</li>
                          </ul>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {copied ? "הטקסט הועתק ללוח" : ""}
        </span>
      </main>
    </div>
  );
}

export default function MakeRequestGenerator() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen" role="status" aria-label="טוען">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" aria-hidden="true" />
        </div>
      }
    >
      <GeneratorContent />
    </Suspense>
  );
}

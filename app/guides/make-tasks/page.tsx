"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Copy, Info, Sparkles, ChevronRight } from "lucide-react";
import { useState } from "react";
import Link from "next/link";

export default function MakeTaskGuide() {
  const [copied, setCopied] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const jsonExample = `{
  "title": "פנייה חדשה מאתר - {{1.name}}",
  "description": "טלפון: {{1.phone}}\\nנושא: {{1.subject}}",
  "email": "your-email@example.com",
  "status": "todo",
  "priority": "medium",
  "due_date": "YYYY-MM-DD"
}`;

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Breadcrumbs */}
        <nav aria-label="ניווט פירורי לחם" className="mb-6">
          <ol className="flex items-center text-sm text-slate-500">
            <li><Link href="/guides" className="hover:text-blue-600">מדריכים</Link></li>
            <li aria-hidden="true"><ChevronRight className="w-4 h-4 mx-2" /></li>
            <li aria-current="page"><span className="text-slate-900 font-medium">יצירת משימות אוטומטית</span></li>
          </ol>
        </nav>

        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-4">
            יצירת משימות מערכת דרך Make
          </h1>
          <p className="text-lg text-slate-600">
            מדריך זה יסביר כיצד ליצור משימות בלוח המשימות שלך באופן אוטומטי מכל
            מקור חיצוני (כמו טפסים באתר, אימיילים, או ווטסאפ).
          </p>

          <div className="mt-6">
            <Link href="/guides/make-integration/generator?mode=TASK">
              <Button className="w-full sm:w-auto h-12 text-lg px-8 gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white shadow-md transition-all hover:scale-[1.02]">
                <div className="bg-white/20 p-1 rounded">
                  <Sparkles className="w-5 h-5 text-white" aria-hidden="true" />
                </div>
                לממשק יצירת קריאת POST למשימות
              </Button>
            </Link>
          </div>
        </div>

        <div className="space-y-8">
          {/* Step 1: Preparation */}
          <section className="space-y-4">
            <h2 className="text-2xl font-bold flex items-center text-slate-900">
              <Badge className="ml-3 h-8 w-8 rounded-full flex items-center justify-center text-lg">
                1
              </Badge>
              דרישות חובה
            </h2>
            <Card>
              <CardContent className="pt-6">
                <ul className="list-disc list-inside space-y-2 text-slate-700">
                  <li>חשבון Make פעיל.</li>
                  <li>
                    <strong>מפתח חברה (Company API Key):</strong> מפתח ייחודי
                    לזיהוי החברה שלך. יש להוסיפו ב-Header.
                  </li>
                  <li>
                    <strong>כתובת אימייל משתמש:</strong> חובה לספק את האימייל של
                    המשתמש שלך במערכת, כדי שהמשימה תשויך לחברה ולחשבון הנכון.
                  </li>
                </ul>
              </CardContent>
            </Card>
          </section>

          {/* Step 2: Make Configuration */}
          <section className="space-y-4">
            <h2 className="text-2xl font-bold flex items-center text-slate-900">
              <Badge className="ml-3 h-8 w-8 rounded-full flex items-center justify-center text-lg">
                2
              </Badge>
              הגדרות ב-Make
            </h2>
            <Card>
              <CardContent className="pt-6 space-y-6">
                <p>
                  הוסף מודול <strong>HTTP</strong> ובחר{" "}
                  <strong>Make a request</strong>.
                </p>

                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-4">
                    <h3 className="font-semibold text-lg">פרטי הבקשה:</h3>
                    <dl className="space-y-4 text-sm">
                      <div className="grid grid-cols-3 gap-2 border-b pb-2">
                        <dt className="font-medium text-slate-500">URL</dt>
                        <dd className="col-span-2 font-mono bg-slate-100 px-2 py-1 rounded select-all break-all">
                          https://your-domain.com/api/make/tasks
                        </dd>
                      </div>
                      <div className="grid grid-cols-3 gap-2 border-b pb-2">
                        <dt className="font-medium text-slate-500">
                          Method
                        </dt>
                        <dd className="col-span-2 font-mono">POST</dd>
                      </div>
                      <div className="grid grid-cols-3 gap-2 border-b pb-2">
                        <dt className="font-medium text-slate-500">
                          Body type
                        </dt>
                        <dd className="col-span-2 font-mono">Raw</dd>
                      </div>
                      <div className="grid grid-cols-3 gap-2 border-b pb-2">
                        <dt className="font-medium text-slate-500">
                          Content type
                        </dt>
                        <dd className="col-span-2 font-mono">
                          JSON (application/json)
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-semibold text-lg">אבטחה (Headers):</h3>
                    <div className="bg-slate-900 text-slate-50 p-4 rounded-lg font-mono text-sm">
                      <div className="flex justify-between mb-2 text-slate-400">
                        <span>Name</span>
                        <span>Value</span>
                      </div>
                      <div className="flex justify-between border-t border-slate-700 pt-2">
                        <span className="text-cyan-400">x-company-api-key</span>
                        <span className="text-green-400">
                          your-company-api-key
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Step 3: JSON Body */}
          <section className="space-y-4">
            <h2 className="text-2xl font-bold flex items-center text-slate-900">
              <Badge className="ml-3 h-8 w-8 rounded-full flex items-center justify-center text-lg">
                3
              </Badge>
              מבנה ה-JSON למשימה
            </h2>
            <Card>
              <CardContent className="pt-6 space-y-4">
                <Alert className="bg-red-50 border-red-200 text-red-900" role="note">
                  <Info className="h-4 w-4 text-red-600" aria-hidden="true" />
                  <AlertDescription className="font-bold">
                    שים לב: ערכי status ו-priority חייבים להיות באותיות קטנות
                    בלבד (lowercase)! שימוש באותיות גדולות יגרום לשגיאה או
                    להתעלמות מהערך.
                  </AlertDescription>
                </Alert>

                <Alert className="bg-amber-50 border-amber-200 text-amber-900 mb-4" role="note">
                  <Info className="h-4 w-4 text-amber-600" aria-hidden="true" />
                  <AlertDescription>
                    שדה <strong>email</strong> הוא קריטי! בלי אימייל תקין של
                    משתמש קיים במערכת, הבקשה תיכשל.
                  </AlertDescription>
                </Alert>

                <div className="relative">
                  <div className="absolute top-2 left-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-slate-400 hover:text-white hover:bg-slate-700"
                      onClick={() => copyToClipboard(jsonExample, "json")}
                    >
                      {copied === "json" ? (
                        <Check className="w-4 h-4 ml-2 text-green-500" aria-hidden="true" />
                      ) : (
                        <Copy className="w-4 h-4 ml-2" aria-hidden="true" />
                      )}
                      {copied === "json" ? "הועתק!" : "העתק קוד"}
                    </Button>
                  </div>
                  <pre
                    className="bg-slate-900 text-slate-50 p-6 rounded-lg overflow-x-auto font-mono text-sm leading-relaxed"
                    dir="ltr"
                    role="group"
                    aria-label="דוגמת JSON ליצירת משימה"
                  >
                    <code>{jsonExample}</code>
                  </pre>
                </div>

                <div className="mt-4">
                  <h3 className="font-semibold mb-2 text-slate-700">
                    הסבר על השדות:
                  </h3>
                  <ul className="list-disc list-inside text-sm text-slate-600 space-y-1">
                    <li>
                      <strong>title:</strong> כותרת המשימה (חובה).
                    </li>
                    <li>
                      <strong>description:</strong> תיאור מפורט. ניתן להשתמש ב-
                      <code>\n</code> לירידת שורה.
                    </li>
                    <li>
                      <strong>email:</strong> האימייל של המשתמש שאליו תשויך
                      המשימה (חובה).
                    </li>
                    <li>
                      <strong>status:</strong> סטטוס המשימה. ערכים אפשריים:
                      <ul className="list-circle list-inside mt-1 mr-4 space-y-0.5 text-xs font-mono bg-slate-100 p-2 rounded">
                        <li>todo (לביצוע - ברירת מחדל)</li>
                        <li>in_progress (בטיפול)</li>
                        <li>waiting_client (ממתין ללקוח)</li>
                        <li>completed_month (בוצע החודש)</li>
                      </ul>
                    </li>
                    <li>
                      <strong>priority:</strong> עדיפות. ערכים אפשריים:
                      <ul className="list-circle list-inside mt-1 mr-4 space-y-0.5 text-xs font-mono bg-slate-100 p-2 rounded">
                        <li>low (נמוך)</li>
                        <li>medium (בינוני - ברירת מחדל)</li>
                        <li>high (גבוה)</li>
                      </ul>
                    </li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </section>
        </div>

        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {copied ? "הטקסט הועתק ללוח" : ""}
        </span>
      </main>
    </div>
  );
}

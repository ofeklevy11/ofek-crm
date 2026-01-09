"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Copy, Info, Terminal, Calendar } from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

export default function MakeCalendarGuide() {
  const [copied, setCopied] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const jsonExample = `{
  "title": "פגישה עם לקוח - {{1.name}}",
  "description": "טלפון: {{1.phone}}\\nנושא הפגישה: {{1.subject}}",
  "email": "your-email@example.com", 
  "start_time": "2024-02-25T14:00:00",
  "end_time": "2024-02-25T15:00:00",
  "color": "blue"
}`;

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Breadcrumbs */}
        <div className="flex items-center text-sm text-slate-500 mb-6">
          <Link href="/guides" className="hover:text-blue-600">
            מדריכים
          </Link>
          <ChevronRight className="w-4 h-4 mx-2" />
          <span className="text-slate-900 font-medium">
            יצירת אירועים ביומן
          </span>
        </div>

        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-4">
            יצירת אירועי יומן דרך Make
          </h1>
          <p className="text-lg text-slate-600">
            מדריך זה יסביר כיצד ליצור אירועים בלוח השנה שלך באופן אוטומטי מכל
            מקור חיצוני (כמו טפסי קביעת פגישות, קישורי Calendly, ווטסאפ וכו').
          </p>

          <div className="mt-6">
            <Link href="/guides/make-integration/generator?mode=CALENDAR">
              <Button className="w-full sm:w-auto h-12 text-lg px-8 gap-2 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white shadow-md transition-all hover:scale-[1.02]">
                <div className="bg-white/20 p-1 rounded">
                  <Calendar className="w-5 h-5 text-white" />
                </div>
                לממשק יצירת קריאת POST לאירועים
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
                    <strong>סיסמת API (Secret Key):</strong> אותה סיסמה שהגדרת
                    עבור המערכת (
                    <code className="mx-1 bg-slate-100 px-1 py-0.5 rounded text-sm font-mono text-pink-600">
                      MAKE_WEBHOOK_SECRET
                    </code>
                    ).
                  </li>
                  <li>
                    <strong>כתובת אימייל משתמש:</strong> חובה לספק את האימייל של
                    המשתמש שלך במערכת, כדי שהאירוע ישויך לחברה וללוח השנה הנכון.
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
                    <div className="space-y-4 text-sm">
                      <div className="grid grid-cols-3 gap-2 border-b pb-2">
                        <span className="font-medium text-slate-500">URL</span>
                        <div className="col-span-2 font-mono bg-slate-100 px-2 py-1 rounded select-all break-all">
                          https://your-domain.com/api/make/calendar
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 border-b pb-2">
                        <span className="font-medium text-slate-500">
                          Method
                        </span>
                        <div className="col-span-2 font-mono">POST</div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 border-b pb-2">
                        <span className="font-medium text-slate-500">
                          Body type
                        </span>
                        <div className="col-span-2 font-mono">Raw</div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 border-b pb-2">
                        <span className="font-medium text-slate-500">
                          Content type
                        </span>
                        <div className="col-span-2 font-mono">
                          JSON (application/json)
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-semibold text-lg">אבטחה (Headers):</h3>
                    <div className="bg-slate-900 text-slate-50 p-4 rounded-lg font-mono text-sm">
                      <div className="flex justify-between mb-2 text-slate-400">
                        <span>Name</span>
                        <span>Value</span>
                      </div>
                      <div className="flex justify-between border-t border-slate-700 pt-2">
                        <span className="text-cyan-400">x-api-secret</span>
                        <span className="text-green-400">
                          Your-Secret-Password
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
              מבנה ה-JSON לאירוע
            </h2>
            <Card>
              <CardContent className="pt-6 space-y-4">
                <Alert className="bg-blue-50 border-blue-200 text-blue-900">
                  <Info className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="font-bold">
                    פורמט תאריכים: יש להקפיד על פורמט ISO-8601 מלא. לדוגמה:
                    2024-02-25T14:30:00 (תאריך ושעה מופרדים ב-T)
                  </AlertDescription>
                </Alert>

                <Alert className="bg-amber-50 border-amber-200 text-amber-900 mb-4">
                  <Info className="h-4 w-4 text-amber-600" />
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
                        <Check className="w-4 h-4 ml-2 text-green-500" />
                      ) : (
                        <Copy className="w-4 h-4 ml-2" />
                      )}
                      {copied === "json" ? "הועתק!" : "העתק קוד"}
                    </Button>
                  </div>
                  <pre
                    className="bg-slate-900 text-slate-50 p-6 rounded-lg overflow-x-auto font-mono text-sm leading-relaxed"
                    dir="ltr"
                  >
                    <code>{jsonExample}</code>
                  </pre>
                </div>

                <div className="mt-4">
                  <h4 className="font-semibold mb-2 text-slate-700">
                    הסבר על השדות:
                  </h4>
                  <ul className="list-disc list-inside text-sm text-slate-600 space-y-1">
                    <li>
                      <strong>title:</strong> כותרת האירוע (חובה).
                    </li>
                    <li>
                      <strong>description:</strong> תיאור חופשי.
                    </li>
                    <li>
                      <strong>email:</strong> האימייל של המשתמש בעל היומן.
                    </li>
                    <li>
                      <strong>start_time:</strong> מועד התחלה (ISO-8601).
                    </li>
                    <li>
                      <strong>end_time:</strong> מועד סיום (ISO-8601). חייב
                      להיות מאוחר ממועד ההתחלה.
                    </li>
                    <li>
                      <strong>color:</strong> צבע האירוע בלוח. ערכים נפוצים:
                      <ul className="list-circle list-inside mt-1 mr-4 space-y-0.5 text-xs font-mono bg-slate-100 p-2 rounded">
                        <li>blue (כחול - ברירת מחדל)</li>
                        <li>red (אדום)</li>
                        <li>green (ירוק)</li>
                        <li>purple (סגול)</li>
                        <li>orange (כתום)</li>
                      </ul>
                    </li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </section>
        </div>
      </main>
    </div>
  );
}

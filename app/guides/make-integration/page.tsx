"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Copy, Info, Terminal } from "lucide-react";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

export default function MakeIntegrationGuide() {
  const [copied, setCopied] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const jsonExample = `{
  "table_slug": "leads-2024",
  "company_id": 1,
  "name": "{{1.full_name}}",
  "phone": "{{1.phone_number}}",
  "email": "{{1.email}}",
  "source": "facebook",
  "status": "חדש"
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
          <span className="text-slate-900 font-medium">חיבור Make לטבלאות</span>
        </div>

        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-4">
            חיבור אוטומציות Make ל-CRM
          </h1>
          <p className="text-lg text-slate-600">
            מדריך זה יסביר כיצד להגדיר חיבור מאובטח בין Make (לשעבר Integromat)
            למערכת ה-CRM שלך, כדי להכניס לידים ורשומות באופן אוטומטי לטבלאות.
          </p>

          <div className="mt-6">
            <Link href="/guides/make-integration/generator">
              <Button className="w-full sm:w-auto h-12 text-lg px-8 gap-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-md transition-all hover:scale-[1.02]">
                <div className="bg-white/20 p-1 rounded">
                  <Terminal className="w-5 h-5 text-white" />
                </div>
                לממשק יצירת קריאת POST
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
              הכנות מקדימות
            </h2>
            <Card>
              <CardContent className="pt-6">
                <p className="mb-4">
                  לפני שמתחילים, עליך לוודא שיש לך את הפרטים הבאים:
                </p>
                <ul className="list-disc list-inside space-y-2 text-slate-700">
                  <li>חשבון Make פעיל עם Scenario שאתה רוצה לחבר.</li>
                  <li>
                    <strong>מפתח חברה (Company API Key):</strong> מפתח ייחודי
                    לזיהוי החברה שלך. יש להוסיפו ב-Header.
                  </li>
                  <li>
                    <strong>מזהה חברה (Company ID):</strong> מספר מזהה של החברה
                    שלך במערכת (חובה בכל בקשה).
                  </li>
                  <li>
                    <strong>מזהה הטבלה (Table Slug):</strong> השם הייחודי של
                    הטבלה אליה תרצה להכניס נתונים.
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
              הגדרת המודול ב-Make
            </h2>
            <Card>
              <CardContent className="pt-6 space-y-6">
                <p>
                  הוסף ל-Scenario שלך מודול מסוג <strong>HTTP</strong> ובחר
                  בפעולה <strong>Make a request</strong>.
                </p>

                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-4">
                    <h3 className="font-semibold text-lg">הגדרות הבקשה:</h3>
                    <div className="space-y-4 text-sm">
                      <div className="grid grid-cols-3 gap-2 border-b pb-2">
                        <span className="font-medium text-slate-500">URL</span>
                        <div className="col-span-2 font-mono bg-slate-100 px-2 py-1 rounded select-all">
                          https://your-domain.com/api/make/leads
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
                    <Alert className="bg-amber-50 border-amber-200 text-amber-900">
                      <Info className="h-4 w-4 text-amber-600" />
                      <AlertTitle>חובה להוסיף!</AlertTitle>
                      <AlertDescription>
                        בלי ה-Header הזה הבקשה תיחסם (שגיאה 401).
                      </AlertDescription>
                    </Alert>
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
              מבנה הנתונים (JSON)
            </h2>
            <Card>
              <CardContent className="pt-6 space-y-4">
                <p>
                  בשדה <strong>Request content</strong>, עליך להדביק את מבנה
                  ה-JSON הבא.
                  <br />
                  הקפד להחליף את ה-<code>table_slug</code> ואת ה-
                  <code>company_id</code> בערכים האמיתיים שלך.
                </p>

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
                  <h4 className="font-semibold mb-2">דגשים חשובים:</h4>
                  <ul className="list-disc list-inside text-sm text-slate-600 space-y-1">
                    <li>
                      המפתחות <code>table_slug</code> ו-<code>company_id</code>{" "}
                      הם <b>חובה</b>.
                    </li>
                    <li>
                      שאר המפתחות (כמו <code>name</code>, <code>email</code>)
                      חייבים להיות תואמים לשמות המערכת של העמודות ב-CRM.
                    </li>
                    <li>
                      נתונים שלא תואמים עמודות קיימות יישמרו אך לא יוצגו בטבלה.
                    </li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Troubleshooting */}
          <section className="space-y-4">
            <h2 className="text-2xl font-bold flex items-center text-slate-900">
              <Badge
                variant="outline"
                className="ml-3 h-8 w-8 rounded-full flex items-center justify-center text-lg border-slate-400 text-slate-600"
              >
                ?
              </Badge>
              פתרון תקלות נפוצות
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg text-red-600 flex items-center">
                    <Terminal className="w-5 h-5 ml-2" />
                    שגיאה 401 Unauthorized
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-slate-600">
                  מפתח ה-API חסר או שגוי. וודא שה-Header{" "}
                  <code>x-company-api-key</code> מוגדר עם מפתח תקין ופעיל.
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg text-amber-600 flex items-center">
                    <Terminal className="w-5 h-5 ml-2" />
                    שגיאה 404 Not Found
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-slate-600">
                  ה-<code>table_slug</code> ששלחת לא קיים במערכת. בדוק שוב את
                  השם המדויק ב-Prisma Studio או בהגדרות.
                </CardContent>
              </Card>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

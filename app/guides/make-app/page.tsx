"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Key,
  MousePointerClick,
  Table2,
  ArrowLeftRight,
  PlayCircle,
  CheckCircle2,
  Info,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

export default function MakeAppGuide() {
  return (
    <div className="min-h-screen bg-slate-50">
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Breadcrumbs */}
        <nav aria-label="ניווט פירורי לחם" className="mb-6">
          <ol className="flex items-center text-sm text-slate-500">
            <li><Link href="/guides" className="hover:text-blue-600">מדריכים</Link></li>
            <li aria-hidden="true"><ChevronRight className="w-4 h-4 mx-2" /></li>
            <li aria-current="page"><span className="text-slate-900 font-medium">הוספת רשומות לטבלאות דרך אפליקציית Make</span></li>
          </ol>
        </nav>

        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-4">
            הוספת רשומות לטבלאות דרך האפליקציה המותאמת שלנו
          </h1>
          <p className="text-lg text-slate-600">
            מדריך זה יסביר כיצד להוסיף רשומות לטבלאות ה-CRM באמצעות האפליקציה המותאמת
            שלנו — ממשק ויזואלי פשוט ללא צורך ב-HTTP ידני, כתובות URL, או JSON.
          </p>
        </div>

        {/* Advantage alert */}
        <Alert className="mb-8 bg-green-50 border-green-200 text-green-900" role="note">
          <Sparkles className="h-4 w-4 text-green-600" aria-hidden="true" />
          <AlertTitle>יתרון האפליקציה המותאמת</AlertTitle>
          <AlertDescription>
            בניגוד למדריכים האחרים שמשתמשים ב-HTTP Request ידני, כאן תעבוד עם
            ממשק ויזואלי — פשוט בוחרים טבלה מהרשימה, ממפים שדות בגרירה, וזהו.
            פחות מועד לשגיאות ומתאים גם למי שלא מכיר JSON או API.
          </AlertDescription>
        </Alert>

        <div className="space-y-8">
          {/* Step 1: Prerequisites */}
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
                    <strong>מפתח API (Company API Key):</strong> מפתח ייחודי
                    לזיהוי החברה שלך. תזדקק לו בשלב יצירת החיבור.
                  </li>
                </ul>
                <Alert className="mt-4 bg-blue-50 border-blue-200 text-blue-900" role="note">
                  <Info className="h-4 w-4 text-blue-600" aria-hidden="true" />
                  <AlertDescription>
                    בניגוד לחיבור HTTP ידני, כאן <strong>אין צורך</strong>{" "}
                    לדעת את ה-company_id, table_slug, או מבנה JSON — האפליקציה
                    מטפלת בכל זה בשבילך.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </section>

          {/* Step 2: Finding the app */}
          <section className="space-y-4">
            <h2 className="text-2xl font-bold flex items-center text-slate-900">
              <Badge className="ml-3 h-8 w-8 rounded-full flex items-center justify-center text-lg">
                2
              </Badge>
              מציאת האפליקציה ב-Make
            </h2>
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-start gap-3">
                  <Search className="w-5 h-5 text-slate-500 mt-1 flex-shrink-0" aria-hidden="true" />
                  <div>
                    <p className="mb-2">
                      ב-Scenario שלך, לחץ על כפתור <strong>&quot;+&quot;</strong>{" "}
                      כדי להוסיף מודול חדש. בחלון החיפוש, חפש:
                    </p>
                    <div className="bg-slate-100 border border-slate-200 rounded-lg px-4 py-3 font-medium text-lg text-center">
                      ------------- (השם ישתנה בקרוב)
                    </div>
                  </div>
                </div>
                <Alert className="bg-amber-50 border-amber-200 text-amber-900" role="note">
                  <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
                  <AlertTitle>שימו לב</AlertTitle>
                  <AlertDescription>
                    שם האפליקציה עשוי להשתנות בקרוב. אם לא מוצאים אותה, פנו
                    למנהל המערכת לקבלת השם העדכני.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </section>

          {/* Step 3: Creating a connection */}
          <section className="space-y-4">
            <h2 className="text-2xl font-bold flex items-center text-slate-900">
              <Badge className="ml-3 h-8 w-8 rounded-full flex items-center justify-center text-lg">
                3
              </Badge>
              יצירת חיבור (Connection)
            </h2>
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-start gap-3">
                  <Key className="w-5 h-5 text-slate-500 mt-1 flex-shrink-0" aria-hidden="true" />
                  <div>
                    <p className="mb-2">
                      בפעם הראשונה שתשתמש באפליקציה, Make יבקש ממך ליצור חיבור
                      (Connection). הזן את <strong>מפתח ה-API</strong> שקיבלת
                      ולחץ <strong>Save</strong>.
                    </p>
                    <p className="text-sm text-slate-600">
                      Make יאמת את המפתח מול המערכת שלנו. אם המפתח תקין, החיבור
                      יישמר ותוכל להשתמש בו בכל ה-Scenarios שלך.
                    </p>
                  </div>
                </div>
                <Alert className="bg-red-50 border-red-200 text-red-900" role="note">
                  <AlertTriangle className="h-4 w-4 text-red-600" aria-hidden="true" />
                  <AlertTitle>החיבור נכשל?</AlertTitle>
                  <AlertDescription>
                    וודא שמפתח ה-API שהזנת מדויק ופעיל. ניתן לקבל מפתח חדש
                    מאופק מנהל המערכת בכתובת{" "}
                    <a
                      href="mailto:ofekconnect4@gmail.com"
                      className="text-red-700 hover:text-red-800 underline"
                    >
                      ofekconnect4@gmail.com
                    </a>
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </section>

          {/* Step 4: Choosing an action */}
          <section className="space-y-4">
            <h2 className="text-2xl font-bold flex items-center text-slate-900">
              <Badge className="ml-3 h-8 w-8 rounded-full flex items-center justify-center text-lg">
                4
              </Badge>
              בחירת הפעולה (Action)
            </h2>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <MousePointerClick className="w-5 h-5 text-slate-500 mt-1 flex-shrink-0" aria-hidden="true" />
                  <div>
                    <p>
                      לאחר שהחיבור נוצר, בחר את הפעולה{" "}
                      <strong>&quot;יצירת רשומה בטבלה&quot;</strong> (Create a
                      Record). פעולה זו תאפשר לך להכניס נתונים לכל טבלה במערכת
                      ה-CRM.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Step 5: Choosing a table */}
          <section className="space-y-4">
            <h2 className="text-2xl font-bold flex items-center text-slate-900">
              <Badge className="ml-3 h-8 w-8 rounded-full flex items-center justify-center text-lg">
                5
              </Badge>
              בחירת טבלה
            </h2>
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-start gap-3">
                  <Table2 className="w-5 h-5 text-slate-500 mt-1 flex-shrink-0" aria-hidden="true" />
                  <div>
                    <p className="mb-2">
                      תראה רשימה נפתחת (Dropdown) עם כל הטבלאות שקיימות בחשבון
                      ה-CRM שלך. פשוט בחר את הטבלה אליה תרצה להכניס את הנתונים.
                    </p>
                    <p className="text-sm text-slate-600">
                      הרשימה נטענת אוטומטית מהמערכת — אין צורך להקליד שמות
                      טבלאות ידנית.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Step 6: Mapping fields */}
          <section className="space-y-4">
            <h2 className="text-2xl font-bold flex items-center text-slate-900">
              <Badge className="ml-3 h-8 w-8 rounded-full flex items-center justify-center text-lg">
                6
              </Badge>
              מיפוי שדות
            </h2>
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-start gap-3">
                  <ArrowLeftRight className="w-5 h-5 text-slate-500 mt-1 flex-shrink-0" aria-hidden="true" />
                  <div>
                    <p className="mb-2">
                      לאחר בחירת הטבלה, השדות שלה ייטענו אוטומטית. כל שנותר הוא
                      למפות את הנתונים מהמודול הקודם (למשל טריגר פייסבוק, Google
                      Sheets, וכד&apos;) לשדות המתאימים.
                    </p>
                    <p className="text-sm text-slate-600">
                      פשוט גרור או בחר את הערך המתאים מהמודול הקודם לכל שדה.
                    </p>
                  </div>
                </div>

                <div className="bg-slate-50 rounded-lg p-4 space-y-2">
                  <h3 className="font-semibold text-sm">דגשים לסוגי שדות:</h3>
                  <ul className="list-disc list-inside text-sm text-slate-600 space-y-1">
                    <li>
                      <strong>שדות בחירה (Select):</strong> הזן את הערך המדויק
                      כפי שהוא מוגדר במערכת.
                    </li>
                    <li>
                      <strong>תאריך (Date):</strong> השתמש בפורמט תאריך תקין
                      (למשל YYYY-MM-DD).
                    </li>
                    <li>
                      <strong>מספר (Number):</strong> שלח ערך מספרי בלבד, ללא
                      תווים נוספים.
                    </li>
                  </ul>
                </div>

                <Alert className="bg-blue-50 border-blue-200 text-blue-900" role="note">
                  <Info className="h-4 w-4 text-blue-600" aria-hidden="true" />
                  <AlertDescription>
                    שדות מסוג קישור (Relation), נוסחה (Lookup), ואוטומציה לא
                    יופיעו ברשימת השדות — הם מנוהלים אוטומטית על ידי המערכת.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </section>

          {/* Step 7: Test and run */}
          <section className="space-y-4">
            <h2 className="text-2xl font-bold flex items-center text-slate-900">
              <Badge className="ml-3 h-8 w-8 rounded-full flex items-center justify-center text-lg">
                7
              </Badge>
              בדיקה והרצה
            </h2>
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-start gap-3">
                  <PlayCircle className="w-5 h-5 text-slate-500 mt-1 flex-shrink-0" aria-hidden="true" />
                  <div>
                    <p className="mb-2">
                      לחץ על <strong>&quot;Run once&quot;</strong> בתחתית המסך של
                      Make כדי להריץ את ה-Scenario פעם אחת לבדיקה.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-500 mt-1 flex-shrink-0" aria-hidden="true" />
                  <div>
                    <p className="mb-2">
                      אם הכל הוגדר נכון, תראה <strong>בועה ירוקה</strong> על
                      המודול, שמסמנת שהנתון נשלח בהצלחה.
                    </p>
                    <p className="text-sm text-slate-600">
                      כנס למערכת ה-CRM ובדוק שהרשומה החדשה נוצרה בטבלה
                      שבחרת.
                    </p>
                  </div>
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
                    <Key className="w-5 h-5 ml-2" aria-hidden="true" />
                    שגיאת חיבור (Connection Error)
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-slate-600">
                  מפתח ה-API שגוי או פג תוקף. וודא שהזנת את המפתח הנכון. אם
                  הבעיה נמשכת, צור חיבור חדש עם מפתח עדכני.
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg text-amber-600 flex items-center">
                    <Table2 className="w-5 h-5 ml-2" aria-hidden="true" />
                    רשימת הטבלאות ריקה
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-slate-600">
                  וודא שהחיבור (Connection) נוצר בהצלחה. אם החיבור תקין אך
                  הרשימה ריקה, ייתכן שאין טבלאות מוגדרות בחשבון. פנה למנהל
                  המערכת.
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg text-blue-600 flex items-center">
                    <ArrowLeftRight className="w-5 h-5 ml-2" aria-hidden="true" />
                    השדות לא נטענים
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-slate-600">
                  נסה לבחור מחדש את הטבלה מהרשימה. אם השדות עדיין לא מופיעים,
                  רענן את הדף ונסה שוב. וודא שהטבלה מכילה עמודות מוגדרות.
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg text-purple-600 flex items-center">
                    <AlertTriangle className="w-5 h-5 ml-2" aria-hidden="true" />
                    ה-Scenario נכשל בהרצה
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-slate-600">
                  בדוק את הודעת השגיאה בבועה האדומה על המודול. סיבות נפוצות:
                  שדה חובה חסר, פורמט תאריך לא תקין, או ערך לא תואם לסוג השדה.
                </CardContent>
              </Card>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Key,
  MousePointerClick,
  CalendarPlus,
  PlayCircle,
  CheckCircle2,
  Info,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

export default function MakeAppCalendarGuide() {
  return (
    <div className="min-h-screen bg-slate-50">
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Breadcrumbs */}
        <nav aria-label="ניווט פירורי לחם" className="mb-6">
          <ol className="flex items-center text-sm text-slate-500">
            <li><Link href="/guides" className="hover:text-blue-600">מדריכים</Link></li>
            <li aria-hidden="true"><ChevronRight className="w-4 h-4 mx-2" /></li>
            <li aria-current="page"><span className="text-slate-900 font-medium">יצירת אירועים ביומן דרך אפליקציית Make</span></li>
          </ol>
        </nav>

        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-4">
            יצירת אירועים ביומן דרך האפליקציה המותאמת שלנו
          </h1>
          <p className="text-lg text-slate-600">
            מדריך זה יסביר כיצד ליצור אירועים ביומן באמצעות האפליקציה
            המותאמת שלנו ב-Make — ממשק ויזואלי פשוט ללא צורך ב-HTTP ידני.
          </p>
        </div>

        {/* Advantage alert */}
        <Alert className="mb-8 bg-green-50 border-green-200 text-green-900" role="note">
          <Sparkles className="h-4 w-4 text-green-600" aria-hidden="true" />
          <AlertTitle>יתרון האפליקציה המותאמת</AlertTitle>
          <AlertDescription>
            בניגוד למדריך HTTP לאירועי יומן, כאן אין צורך לכתוב JSON או להגדיר
            Headers — פשוט ממלאים את השדות בממשק הויזואלי.
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
                  <li>
                    <strong>כתובת אימייל של בעל היומן:</strong> האימייל של
                    המשתמש שביומן שלו ייווצר האירוע. חייב להיות משתמש קיים במערכת.
                  </li>
                </ul>
                <Alert className="mt-4 bg-blue-50 border-blue-200 text-blue-900" role="note">
                  <Info className="h-4 w-4 text-blue-600" aria-hidden="true" />
                  <AlertDescription>
                    בניגוד לחיבור HTTP ידני, כאן <strong>אין צורך</strong> לדעת
                    כתובות URL, Headers, או מבנה JSON — האפליקציה מטפלת בכל זה
                    בשבילך.
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
                    <p className="mb-2">
                      לאחר שהחיבור נוצר, בחר את הפעולה{" "}
                      <strong>&quot;יצירת אירוע ביומן&quot;</strong> (Create a
                      Calendar Event). פעולה זו תאפשר לך ליצור אירועים ישירות
                      ביומן של המערכת.
                    </p>
                    <Alert className="mt-3 bg-amber-50 border-amber-200 text-amber-900" role="note">
                      <Info className="h-4 w-4 text-amber-600" aria-hidden="true" />
                      <AlertDescription>
                        שימו לב: פעולה זו שונה מ-&quot;יצירת רשומה
                        בטבלה&quot; ומ-&quot;יצירת משימה&quot;. האירועים נוצרים
                        ביומן הייעודי, לא בטבלאות או בלוח המשימות.
                      </AlertDescription>
                    </Alert>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Step 5: Filling calendar event fields */}
          <section className="space-y-4">
            <h2 className="text-2xl font-bold flex items-center text-slate-900">
              <Badge className="ml-3 h-8 w-8 rounded-full flex items-center justify-center text-lg">
                5
              </Badge>
              מילוי פרטי האירוע
            </h2>
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-start gap-3">
                  <CalendarPlus className="w-5 h-5 text-slate-500 mt-1 flex-shrink-0" aria-hidden="true" />
                  <div>
                    <p className="mb-2">
                      לאחר בחירת הפעולה, יופיעו השדות הבאים בממשק הויזואלי. מפה
                      את הערכים מהמודול הקודם (טריגר) לשדות המתאימים.
                    </p>
                  </div>
                </div>

                <div className="bg-slate-50 rounded-lg p-4 space-y-3">
                  <h3 className="font-semibold text-sm mb-3">שדות האירוע:</h3>
                  <div className="space-y-3 text-sm">
                    <div className="flex items-start gap-2 border-b border-slate-200 pb-2">
                      <Badge
                        variant="outline"
                        className="text-red-600 border-red-300 mt-0.5"
                      >
                        חובה
                      </Badge>
                      <div>
                        <strong>title</strong> — כותרת האירוע. טקסט חופשי.
                      </div>
                    </div>
                    <div className="flex items-start gap-2 border-b border-slate-200 pb-2">
                      <Badge
                        variant="outline"
                        className="text-slate-500 border-slate-300 mt-0.5"
                      >
                        רשות
                      </Badge>
                      <div>
                        <strong>description</strong> — תיאור מפורט של האירוע.
                        טקסט חופשי.
                      </div>
                    </div>
                    <div className="flex items-start gap-2 border-b border-slate-200 pb-2">
                      <Badge
                        variant="outline"
                        className="text-red-600 border-red-300 mt-0.5"
                      >
                        חובה
                      </Badge>
                      <div>
                        <strong>email</strong> — כתובת האימייל של בעל היומן.
                        חייב להיות משתמש קיים במערכת.
                      </div>
                    </div>
                    <div className="flex items-start gap-2 border-b border-slate-200 pb-2">
                      <Badge
                        variant="outline"
                        className="text-red-600 border-red-300 mt-0.5"
                      >
                        חובה
                      </Badge>
                      <div>
                        <strong>start_time</strong> — מועד התחלת האירוע. בפורמט
                        ISO-8601: <code className="bg-white px-1 py-0.5 rounded border border-slate-200 text-xs font-mono">YYYY-MM-DDTHH:MM:SS</code>
                        <br />
                        <span className="text-xs text-slate-500">לדוגמה: 2026-01-01T12:00:00</span>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 border-b border-slate-200 pb-2">
                      <Badge
                        variant="outline"
                        className="text-red-600 border-red-300 mt-0.5"
                      >
                        חובה
                      </Badge>
                      <div>
                        <strong>end_time</strong> — מועד סיום האירוע. בפורמט
                        ISO-8601. חייב להיות מאוחר מ-start_time.
                        <br />
                        <span className="text-xs text-slate-500">לדוגמה: 2026-01-01T13:00:00</span>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Badge
                        variant="outline"
                        className="text-slate-500 border-slate-300 mt-0.5"
                      >
                        רשות
                      </Badge>
                      <div>
                        <strong>color</strong> — צבע האירוע ביומן. ערכים אפשריים:
                        <ul className="list-inside mt-1 mr-4 space-y-0.5 text-xs font-mono bg-white p-2 rounded border border-slate-200">
                          <li>blue (כחול — ברירת מחדל)</li>
                          <li>red (אדום)</li>
                          <li>green (ירוק)</li>
                          <li>purple (סגול)</li>
                          <li>orange (כתום)</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>

                <Alert className="bg-amber-50 border-amber-200 text-amber-900" role="note">
                  <Info className="h-4 w-4 text-amber-600" aria-hidden="true" />
                  <AlertTitle>פורמט תאריך ושעה — ISO-8601</AlertTitle>
                  <AlertDescription>
                    שדות start_time ו-end_time חייבים להיות בפורמט ISO-8601 מלא:
                    <code className="bg-white px-1 py-0.5 rounded border border-amber-300 text-xs font-mono mx-1">YYYY-MM-DDTHH:MM:SS</code>
                    (תאריך ושעה מופרדים ב-T). ניתן להשתמש ב-Date Picker של Make
                    כדי להבטיח פורמט תקין.
                  </AlertDescription>
                </Alert>

                <Alert className="bg-red-50 border-red-200 text-red-900" role="note">
                  <AlertTriangle className="h-4 w-4 text-red-600" aria-hidden="true" />
                  <AlertTitle>שדה email קריטי</AlertTitle>
                  <AlertDescription>
                    שדה email חייב להכיל כתובת אימייל של משתמש קיים במערכת. אם
                    האימייל לא נמצא, יצירת האירוע תיכשל.
                  </AlertDescription>
                </Alert>

                <Alert className="bg-blue-50 border-blue-200 text-blue-900" role="note">
                  <Info className="h-4 w-4 text-blue-600" aria-hidden="true" />
                  <AlertDescription>
                    מועד הסיום (end_time) חייב להיות מאוחר ממועד ההתחלה
                    (start_time). אם לא תמלא צבע, ייקבע אוטומטית כחול (blue).
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </section>

          {/* Step 6: Test and run */}
          <section className="space-y-4">
            <h2 className="text-2xl font-bold flex items-center text-slate-900">
              <Badge className="ml-3 h-8 w-8 rounded-full flex items-center justify-center text-lg">
                6
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
                      המודול, שמסמנת שהאירוע נוצר בהצלחה.
                    </p>
                    <p className="text-sm text-slate-600">
                      כנס למערכת ה-CRM ובדוק שהאירוע החדש מופיע ביומן.
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
                    <CalendarPlus className="w-5 h-5 ml-2" aria-hidden="true" />
                    האירוע לא מופיע ביומן
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-slate-600">
                  וודא שהבועה ב-Make ירוקה (הצלחה). אם כן, רענן את עמוד היומן
                  ב-CRM. בדוק גם שאתה צופה בתאריך הנכון — האירוע יופיע בטווח
                  התאריכים שהגדרת ב-start_time ו-end_time.
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg text-blue-600 flex items-center">
                    <AlertTriangle className="w-5 h-5 ml-2" aria-hidden="true" />
                    שגיאת אימייל לא נמצא
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-slate-600">
                  שדה email חייב להכיל כתובת של משתמש רשום במערכת. וודא שהאימייל
                  מאוית נכון ושהמשתמש קיים בחשבון ה-CRM שלך.
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
                  שדה title חסר, אימייל לא תקין, פורמט תאריך לא תקין (חייב
                  להיות ISO-8601), או ש-end_time מוקדם מ-start_time.
                </CardContent>
              </Card>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

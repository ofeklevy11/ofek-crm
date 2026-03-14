import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "מדיניות פרטיות",
  description: "מדיניות הפרטיות של BizlyCRM - מערכת ניהול לעסקים",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="bg-background rounded-2xl shadow-lg border border-border/40 overflow-hidden">
          <div className="bg-gradient-to-r from-primary to-secondary p-6">
            <h1 className="text-3xl font-extrabold text-white text-center">מדיניות פרטיות</h1>
            <p className="text-white/80 text-center text-base mt-1">עדכון אחרון: מרץ 2026</p>
          </div>

          <div className="p-6 md:p-8 space-y-8 text-base leading-relaxed text-foreground/90">
            <Section title="1. כללי">
              <p>
                מדיניות פרטיות זו מתארת כיצד BizlyCRM (להלן: &quot;החברה&quot;, &quot;אנחנו&quot;)
                אוספת, משתמשת ומגנה על המידע האישי שלך בהתאם לחוק הגנת הפרטיות, התשמ&quot;א-1981
                ותקנות הגנת הפרטיות (אבטחת מידע), התשע&quot;ז-2017.
              </p>
              <p>
                השימוש בשירות מהווה הסכמה לאיסוף ולעיבוד המידע כמתואר במדיניות זו.
              </p>
            </Section>

            <Section title="2. המידע שאנו אוספים">
              <h3 className="font-semibold text-foreground mt-2">2.1 מידע שהמשתמש מספק:</h3>
              <ul className="list-disc pr-5 space-y-1">
                <li>פרטים אישיים: שם מלא, כתובת אימייל, מספר טלפון.</li>
                <li>פרטי ארגון: שם החברה/ארגון.</li>
                <li>פרטי לקוחות: שמות, טלפונים, כתובות אימייל, פרטי עסקאות ונתונים פיננסיים.</li>
                <li>הודעות: תוכן הודעות WhatsApp עסקיות.</li>
                <li>אירועים: נתוני יומן Google Calendar (ראה סעיף 5 למידע מפורט).</li>
                <li>קבצים: מסמכים וקבצים שהועלו למערכת.</li>
              </ul>

              <h3 className="font-semibold text-foreground mt-4">2.2 מידע שנאסף אוטומטית:</h3>
              <ul className="list-disc pr-5 space-y-1">
                <li>כתובת IP ומזהה בקשה (Request ID) לצורכי אבטחה ותיעוד.</li>
                <li>לוגים של פעולות במערכת (Audit Logs) לצורכי ביקורת.</li>
                <li>נתוני ביצועי אוטומציות.</li>
              </ul>
            </Section>

            <Section title="3. כיצד אנו משתמשים במידע">
              <ul className="list-disc pr-5 space-y-1">
                <li>מתן השירות, לרבות ניהול לקוחות, עסקאות, פגישות ותקשורת.</li>
                <li>אימות זהות ואבטחת החשבון.</li>
                <li>שיפור השירות וחוויית המשתמש.</li>
                <li>תקשורת עם המשתמש בנוגע לשירות (עדכונים, התראות).</li>
                <li>עמידה בדרישות חוקיות ורגולטוריות.</li>
              </ul>
            </Section>

            <Section title="4. שיתוף מידע עם צדדים שלישיים">
              <p>אנו משתפים מידע עם צדדים שלישיים אך ורק לצורך מתן השירות:</p>
              <ul className="list-disc pr-5 space-y-2">
                <li>
                  <strong>Google</strong> — סנכרון אירועי יומן (ראה סעיף 5 למידע מפורט).
                </li>
                <li>
                  <strong>Meta / WhatsApp</strong> — שליחה וקבלה של הודעות עסקיות.
                  המידע המשותף כולל מספרי טלפון ותוכן הודעות.
                </li>
                <li>
                  <strong>UploadThing</strong> — אחסון קבצים. הקבצים שהמשתמש מעלה נשמרים בשרתי UploadThing.
                </li>
                <li>
                  <strong>Make.com</strong> — ביצוע אוטומציות. נתונים רלוונטיים מועברים לפי הגדרות האוטומציה.
                </li>
                <li>
                  <strong>Inngest</strong> — ניהול תהליכים אסינכרוניים ומשימות רקע. נתונים מעובדים בתוך התשתית.
                </li>
              </ul>
              <p>
                לא נמכור, נשכיר או נעביר את המידע האישי שלך לצדדים שלישיים לצרכי שיווק.
              </p>
            </Section>

            <Section title="5. Google API Services — שימוש בנתוני משתמש">
              <p>
                BizlyCRM משתמשת ב-Google API Services לצורך אינטגרציה עם Google Calendar.
                סעיף זה מתאר באופן מפורט כיצד אנו ניגשים, משתמשים, מאחסנים ומשתפים נתוני משתמש שמתקבלים מ-Google APIs.
              </p>

              <h3 className="font-semibold text-foreground mt-4">5.1 הנתונים שאנו ניגשים אליהם מ-Google:</h3>
              <p>כאשר המשתמש מחבר את חשבון Google שלו ל-BizlyCRM, אנו מבקשים גישה להרשאות (scopes) הבאות:</p>
              <ul className="list-disc pr-5 space-y-1">
                <li>
                  <strong>Google Calendar</strong> (<code className="bg-muted px-1.5 py-0.5 rounded text-xs">https://www.googleapis.com/auth/calendar</code>) —
                  קריאה ויצירה של אירועים ביומן Google Calendar של המשתמש.
                </li>
                <li>
                  <strong>כתובת אימייל</strong> (<code className="bg-muted px-1.5 py-0.5 rounded text-xs">https://www.googleapis.com/auth/userinfo.email</code>) —
                  קריאת כתובת האימייל של חשבון Google לצורך זיהוי החיבור.
                </li>
              </ul>

              <h3 className="font-semibold text-foreground mt-4">5.2 הנתונים הספציפיים שנאספים מ-Google:</h3>
              <ul className="list-disc pr-5 space-y-1">
                <li>כתובת האימייל של חשבון Google המחובר.</li>
                <li>אירועי יומן: כותרת האירוע, תיאור, זמני התחלה וסיום, וקישור לאירוע ב-Google Calendar.</li>
              </ul>

              <h3 className="font-semibold text-foreground mt-4">5.3 כיצד אנו משתמשים בנתונים מ-Google:</h3>
              <ul className="list-disc pr-5 space-y-1">
                <li>הצגת אירועי יומן Google Calendar בממשק היומן של BizlyCRM כדי שהמשתמש יוכל לראות את לוח הזמנים שלו.</li>
                <li>יצירת אירועים חדשים ביומן Google Calendar כאשר המשתמש קובע פגישות דרך המערכת.</li>
                <li>בדיקת זמינות לצורך מערכת קביעת פגישות.</li>
                <li>כתובת האימייל משמשת אך ורק לזיהוי חשבון Google המחובר בממשק המשתמש.</li>
              </ul>
              <p>
                אנו <strong>לא</strong> משתמשים בנתוני Google לפרסום, שיווק, מעקב אחרי משתמשים, או לכל מטרה שאינה קשורה ישירות לפונקציונליות שתוארה לעיל.
              </p>

              <h3 className="font-semibold text-foreground mt-4">5.4 כיצד אנו מאחסנים נתוני Google:</h3>
              <ul className="list-disc pr-5 space-y-1">
                <li>
                  <strong>טוקני OAuth</strong> (Access Token ו-Refresh Token) — מוצפנים בהצפנת AES-256-GCM ומאוחסנים במסד הנתונים שלנו.
                  הטוקנים אינם נשמרים בטקסט גלוי בשום שלב.
                </li>
                <li>
                  <strong>כתובת אימייל</strong> — נשמרת במסד הנתונים לצורך זיהוי החיבור.
                </li>
                <li>
                  <strong>אירועי יומן</strong> — נטענים בזמן אמת מ-Google Calendar API בעת הצגתם למשתמש ואינם נשמרים באופן קבוע במסד הנתונים שלנו.
                </li>
              </ul>

              <h3 className="font-semibold text-foreground mt-4">5.5 שיתוף נתוני Google עם צדדים שלישיים:</h3>
              <p>
                אנו <strong>לא</strong> משתפים, מעבירים או חושפים נתוני משתמש שמתקבלים מ-Google APIs לכל צד שלישי, למעט:
              </p>
              <ul className="list-disc pr-5 space-y-1">
                <li>כאשר הדבר נדרש על פי חוק, צו בית משפט, או הליך משפטי.</li>
                <li>כאשר המשתמש נתן הסכמה מפורשת לכך.</li>
              </ul>

              <h3 className="font-semibold text-foreground mt-4">5.6 ביטול גישה:</h3>
              <p>
                המשתמש יכול לנתק את חיבור Google Calendar בכל עת מתוך הגדרות המערכת. בעת ניתוק:
              </p>
              <ul className="list-disc pr-5 space-y-1">
                <li>טוקני הגישה יבוטלו (revoked) מול Google.</li>
                <li>כל נתוני החיבור (טוקנים מוצפנים וכתובת אימייל) יימחקו ממסד הנתונים שלנו.</li>
                <li>ניתן גם לבטל את הגישה ישירות דרך הגדרות האבטחה של חשבון Google שלך בכתובת{" "}
                  <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                    https://myaccount.google.com/permissions
                  </a>.
                </li>
              </ul>

              <h3 className="font-semibold text-foreground mt-4">5.7 עמידה במדיניות Google API Services User Data Policy:</h3>
              <div className="bg-muted/50 border border-border/40 rounded-lg p-4 mt-2">
                <p>
                  השימוש וההעברה של מידע שמתקבל מ-Google APIs על ידי BizlyCRM עומדים בדרישות{" "}
                  <a
                    href="https://developers.google.com/terms/api-services-user-data-policy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline"
                  >
                    Google API Services User Data Policy
                  </a>
                  , לרבות דרישות השימוש המוגבל (Limited Use).
                </p>
              </div>
            </Section>

            <Section title="6. אבטחת מידע">
              <p>אנו נוקטים באמצעי אבטחה מתקדמים להגנה על המידע שלך:</p>
              <ul className="list-disc pr-5 space-y-1">
                <li>סיסמאות מאוחסנות בצורה מגובבת (hashed) ואינן נשמרות כטקסט גלוי.</li>
                <li>טוקני גישה לשירותים חיצוניים (כולל Google OAuth tokens) מוצפנים בהצפנת AES-256-GCM.</li>
                <li>הגנת CSRF (Cross-Site Request Forgery) על כל הבקשות.</li>
                <li>מדיניות CSP (Content Security Policy) מוגדרת.</li>
                <li>עוגיות HTTP-only בלבד — אינן נגישות מצד הלקוח (JavaScript).</li>
                <li>בידוד דיירים (Tenant Isolation) — כל ארגון רואה רק את המידע שלו.</li>
                <li>הגבלת קצב בקשות (Rate Limiting) למניעת ניצול לרעה.</li>
              </ul>
            </Section>

            <Section title="7. שמירת מידע">
              <p>אנו שומרים מידע למשך הזמן הדרוש לספק את השירות:</p>
              <ul className="list-disc pr-5 space-y-1">
                <li>נתוני חשבון ולקוחות — כל עוד החשבון פעיל.</li>
                <li>נתוני חיבור Google — כל עוד החיבור פעיל. בעת ניתוק, הנתונים נמחקים מיידית.</li>
                <li>לוגי ביקורת (Audit Logs) — 90 יום.</li>
                <li>לוגי אוטומציות — 180 יום.</li>
                <li>לוגי הגבלת קצב — 7 ימים.</li>
              </ul>
              <p>
                בעת מחיקת חשבון, הנתונים יימחקו תוך פרק זמן סביר, לרבות כל נתוני החיבור ל-Google,
                למעט מידע שנדרש לשמור על פי חוק.
              </p>
            </Section>

            <Section title="8. עוגיות (Cookies)">
              <p>
                המערכת משתמשת בעוגייה אחת בלבד: <code className="bg-muted px-1.5 py-0.5 rounded text-xs">auth_token</code> —
                עוגיית אימות HTTP-only לצורך ניהול ההתחברות.
              </p>
              <p>
                איננו משתמשים בעוגיות מעקב, עוגיות פרסום, או עוגיות צד שלישי.
              </p>
            </Section>

            <Section title="9. זכויות המשתמש">
              <p>
                בהתאם לסעיפים 13-14 לחוק הגנת הפרטיות, התשמ&quot;א-1981, עומדות לך הזכויות הבאות:
              </p>
              <ul className="list-disc pr-5 space-y-1">
                <li><strong>זכות עיון</strong> — הזכות לעיין במידע האישי שנשמר עליך במערכת.</li>
                <li><strong>זכות תיקון</strong> — הזכות לבקש תיקון מידע שגוי או לא מדויק.</li>
                <li><strong>זכות מחיקה</strong> — הזכות לבקש מחיקת המידע האישי שלך מהמערכת.</li>
                <li><strong>ביטול גישת Google</strong> — הזכות לנתק את חיבור Google Calendar בכל עת (ראה סעיף 5.6).</li>
              </ul>
              <p>
                לצורך מימוש זכויות אלה, ניתן לפנות אלינו בכתובת המופיעה בסעיף 12.
              </p>
            </Section>

            <Section title="10. העברת מידע בינלאומית">
              <p>
                חלק משירותי הצד השלישי שבהם אנו משתמשים (כמפורט בסעיף 4) עשויים לאחסן
                או לעבד מידע מחוץ לישראל. אנו מוודאים כי ספקים אלה עומדים בסטנדרטים
                מקובלים של אבטחת מידע.
              </p>
            </Section>

            <Section title="11. שינויים במדיניות">
              <p>
                אנו עשויים לעדכן מדיניות זו מעת לעת. שינויים מהותיים, לרבות שינויים באופן
                השימוש בנתוני Google, יפורסמו באתר ו/או יישלחו בהודעה למשתמשים.
                המשך השימוש בשירות לאחר פרסום השינויים מהווה הסכמה למדיניות המעודכנת.
              </p>
            </Section>

            <Section title="12. יצירת קשר">
              <p>
                לשאלות, בירורים או בקשות בנוגע לפרטיות ולמידע האישי שלך, לרבות בקשות הנוגעות
                לנתוני Google שלך, ניתן לפנות אלינו:
              </p>
              <p className="font-medium text-foreground">ofekconnect4@gmail.com</p>
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-bold text-foreground">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

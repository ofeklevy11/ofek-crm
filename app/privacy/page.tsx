import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "מדיניות פרטיות | BizlyCRM",
  description: "מדיניות הפרטיות של BizlyCRM - מערכת ניהול לעסקים",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="bg-background rounded-2xl shadow-lg border border-border/40 overflow-hidden">
          <div className="bg-gradient-to-r from-primary to-secondary p-6">
            <h1 className="text-2xl font-bold text-white text-center">מדיניות פרטיות</h1>
            <p className="text-white/70 text-center text-sm mt-1">עדכון אחרון: מרץ 2026</p>
          </div>

          <div className="p-6 md:p-8 space-y-8 text-sm leading-relaxed text-foreground/80">
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
                <li>אירועים: נתוני יומן Google Calendar.</li>
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
                  <strong>Google</strong> — סנכרון אירועי יומן. המידע המשותף כולל פרטי פגישות ואירועים.
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

            <Section title="5. אבטחת מידע">
              <p>אנו נוקטים באמצעי אבטחה מתקדמים להגנה על המידע שלך:</p>
              <ul className="list-disc pr-5 space-y-1">
                <li>סיסמאות מאוחסנות בצורה מגובבת (hashed) ואינן נשמרות כטקסט גלוי.</li>
                <li>טוקני גישה לשירותים חיצוניים מוצפנים בהצפנת AES-256-GCM.</li>
                <li>הגנת CSRF (Cross-Site Request Forgery) על כל הבקשות.</li>
                <li>מדיניות CSP (Content Security Policy) מוגדרת.</li>
                <li>עוגיות HTTP-only בלבד — אינן נגישות מצד הלקוח (JavaScript).</li>
                <li>בידוד דיירים (Tenant Isolation) — כל ארגון רואה רק את המידע שלו.</li>
                <li>הגבלת קצב בקשות (Rate Limiting) למניעת ניצול לרעה.</li>
              </ul>
            </Section>

            <Section title="6. שמירת מידע">
              <p>אנו שומרים מידע למשך הזמן הדרוש לספק את השירות:</p>
              <ul className="list-disc pr-5 space-y-1">
                <li>נתוני חשבון ולקוחות — כל עוד החשבון פעיל.</li>
                <li>לוגי ביקורת (Audit Logs) — 90 יום.</li>
                <li>לוגי אוטומציות — 180 יום.</li>
                <li>לוגי הגבלת קצב — 7 ימים.</li>
              </ul>
              <p>
                בעת מחיקת חשבון, הנתונים יימחקו תוך פרק זמן סביר, למעט מידע שנדרש לשמור על פי חוק.
              </p>
            </Section>

            <Section title="7. עוגיות (Cookies)">
              <p>
                המערכת משתמשת בעוגייה אחת בלבד: <code className="bg-muted px-1.5 py-0.5 rounded text-xs">auth_token</code> —
                עוגיית אימות HTTP-only לצורך ניהול ההתחברות.
              </p>
              <p>
                איננו משתמשים בעוגיות מעקב, עוגיות פרסום, או עוגיות צד שלישי.
              </p>
            </Section>

            <Section title="8. זכויות המשתמש">
              <p>
                בהתאם לסעיפים 13-14 לחוק הגנת הפרטיות, התשמ&quot;א-1981, עומדות לך הזכויות הבאות:
              </p>
              <ul className="list-disc pr-5 space-y-1">
                <li><strong>זכות עיון</strong> — הזכות לעיין במידע האישי שנשמר עליך במערכת.</li>
                <li><strong>זכות תיקון</strong> — הזכות לבקש תיקון מידע שגוי או לא מדויק.</li>
                <li><strong>זכות מחיקה</strong> — הזכות לבקש מחיקת המידע האישי שלך מהמערכת.</li>
              </ul>
              <p>
                לצורך מימוש זכויות אלה, ניתן לפנות אלינו בכתובת המופיעה בסעיף 11.
              </p>
            </Section>

            <Section title="9. העברת מידע בינלאומית">
              <p>
                חלק משירותי הצד השלישי שבהם אנו משתמשים (כמפורט בסעיף 4) עשויים לאחסן
                או לעבד מידע מחוץ לישראל. אנו מוודאים כי ספקים אלה עומדים בסטנדרטים
                מקובלים של אבטחת מידע.
              </p>
            </Section>

            <Section title="10. שינויים במדיניות">
              <p>
                אנו עשויים לעדכן מדיניות זו מעת לעת. שינויים מהותיים יפורסמו באתר
                ו/או יישלחו בהודעה למשתמשים. המשך השימוש בשירות לאחר פרסום השינויים מהווה
                הסכמה למדיניות המעודכנת.
              </p>
            </Section>

            <Section title="11. יצירת קשר">
              <p>
                לשאלות, בירורים או בקשות בנוגע לפרטיות ולמידע האישי שלך, ניתן לפנות אלינו:
              </p>
              <p className="font-medium text-foreground">support@bizlycrm.com</p>
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
      <h2 className="text-base font-bold text-foreground">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

# 🔒 דוח בדיקת אבטחה מקיף - CRM Application

**תאריך ביצוע:** 08/01/2026  
**מבצע הבדיקה:** AI Security Audit  
**סה"כ קבצים שנבדקו:** 50+ קבצי TypeScript/TSX

---

## 📋 סיכום מנהלים

| קריטיות         | כמות פרצות | סטטוס            |
| --------------- | ---------- | ---------------- |
| 🔴 קריטי (8-10) | 3          | דורש תיקון מיידי |
| 🟠 בינוני (5-7) | 6          | דורש תיקון בקרוב |
| 🟡 נמוך (1-4)   | 5          | לשיפור עתידי     |

---

## 🔴 פרצות קריטיות (8-10)

### 1. CRON Endpoint ללא אימות

**קובץ:** `app/api/cron/check-sla/route.ts`  
**קריטיות:** 9/10 ⚠️

**תיאור הבעיה:**
הקוד לאימות של CRON endpoint מושבת (מסומן כהערה):

```typescript
// Uncomment and set your secret in production:
// const CRON_SECRET = process.env.CRON_SECRET;
// if (CRON_SECRET && key !== CRON_SECRET) {
//   return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
// }
```

**סיכון:**

- כל אחד יכול לגרום ל-SLA check לרוץ
- יכול לגרום לעומס על השרת (DoS)
- יכול לשלוח התראות מזויפות למשתמשים

**תיקון מומלץ:**

```typescript
const CRON_SECRET = process.env.CRON_SECRET;
if (!CRON_SECRET || key !== CRON_SECRET) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

---

### 2. Debug API Endpoint חשוף

**קובץ:** `app/api/debug/sla-status/route.ts`  
**קריטיות:** 8/10 ⚠️

**תיאור הבעיה:**
Debug endpoint מחזיר מידע רגיש על כל הטיקטים ללא אימות משתמש וללא סינון לפי companyId.

**סיכון:**

- חשיפת מידע עסקי רגיש
- דליפת נתונים בין ארגונים
- פלט Debug בסביבת Production

**תיקון מומלץ:**

```typescript
// Option 1: הסרה מ-Production
if (process.env.NODE_ENV === "production") {
  return NextResponse.json(
    { error: "Not available in production" },
    { status: 404 }
  );
}

// Option 2: הוספת אימות Admin
const user = await getCurrentUser();
if (!user || user.role !== "admin") {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
// + סינון לפי companyId
```

---

### 3. AI Endpoints ללא אימות

**קבצים:**

- `app/api/ai/generate-analytics/route.ts`
- `app/api/ai/generate-automation/route.ts`  
  **קריטיות:** 8/10 ⚠️

**תיאור הבעיה:**
ה-AI endpoints לא בודקים אם המשתמש מחובר או שיש לו הרשאה:

```typescript
export async function POST(req: Request) {
  try {
    const { prompt, tables } = await req.json();
    // אין בדיקת getCurrentUser()!
```

**סיכון:**

- שימוש חופשי ב-API של OpenRouter (עלויות)
- זליגת מידע על מבנה הטבלאות
- אפשרות ל-Prompt Injection

**תיקון מומלץ:**

```typescript
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // וודא שה-tables המועברים שייכים ל-companyId של המשתמש
```

---

## 🟠 פרצות בינוניות (5-7)

### 4. חוסר בדיקת companyId ב-getTaskById

**קובץ:** `app/actions/tasks.ts`  
**קריטיות:** 7/10 🔶

**תיאור הבעיה:**

```typescript
export async function getTaskById(id: string) {
  const task = await prisma.task.findUnique({
    where: { id },
    // חסר סינון לפי companyId!
  });
```

**סיכון:**
משתמש יכול לגשת למשימות של ארגון אחר אם הוא יודע את ה-ID.

**תיקון מומלץ:**

```typescript
export async function getTaskById(id: string) {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Unauthorized" };

  const task = await prisma.task.findFirst({
    where: { id, companyId: user.companyId },
  });
```

---

### 5. חוסר בדיקת companyId ב-deleteTask

**קובץ:** `app/actions/tasks.ts` (שורות 248-283)  
**קריטיות:** 7/10 🔶

**תיאור הבעיה:**

```typescript
await prisma.task.delete({
  where: { id },
  // חסר סינון לפי companyId
});
```

**סיכון:**
משתמש עם הרשאה למחוק יכול למחוק משימות של ארגונים אחרים.

**תיקון מומלץ:**

```typescript
await prisma.task.delete({
  where: { id, companyId: user.companyId },
});
```

---

### 6. חוסר בדיקת companyId ב-updateTask

**קובץ:** `app/actions/tasks.ts` (שורות 135-245)  
**קריטיות:** 7/10 🔶

**תיאור הבעיה:**
ה-updateTask לא מוודא ש-existingTask שייך ל-companyId של המשתמש.

**תיקון מומלץ:**

```typescript
const existingTask = await prisma.task.findFirst({
  where: { id, companyId: user.companyId },
  // ...
});
```

---

### 7. Bulk Delete ללא סינון companyId

**קובץ:** `app/api/records/bulk/route.ts`  
**קריטיות:** 6/10 🔶

**תיאור הבעיה:**

```typescript
const count = await prisma.record.deleteMany({
  where: {
    id: { in: recordIds.map((id: any) => Number(id)) },
    // חסר סינון לפי companyId!
  },
});
```

**סיכון:**
משתמש יכול למחוק רשומות של ארגון אחר.

**תיקון מומלץ:**

```typescript
const count = await prisma.record.deleteMany({
  where: {
    id: { in: recordIds.map((id: any) => Number(id)) },
    companyId: currentUser.companyId,
  },
});
```

---

### 8. Default Session Secret

**קובץ:** `lib/auth.ts`  
**קריטיות:** 6/10 🔶

**תיאור הבעיה:**

```typescript
const SECRET = process.env.SESSION_SECRET || "default-dev-secret-change-me";
```

**סיכון:**
אם SESSION_SECRET לא מוגדר ב-production, נעשה שימוש בערך ברירת מחדל חלש.

**תיקון מומלץ:**

```typescript
const SECRET = process.env.SESSION_SECRET;
if (!SECRET) {
  throw new Error("SESSION_SECRET environment variable must be set");
}
```

---

### 9. UploadThing בסביבת Dev

**קובץ:** `app/api/uploadthing/route.ts`  
**קריטיות:** 5/10 🔶

**תיאור הבעיה:**

```typescript
export const { GET, POST } = createRouteHandler({
  router: ourFileRouter,
  config: { isDev: true }, // ⚠️ hardcoded כ-dev
});
```

**סיכון:**
עלול לגרום לבעיות אבטחה או ביצועים ב-production.

**תיקון מומלץ:**

```typescript
config: { isDev: process.env.NODE_ENV === "development" },
```

---

## 🟡 פרצות נמוכות (1-4)

### 10. חוסר Rate Limiting

**קובץ:** `middleware.ts`  
**קריטיות:** 4/10 🟡

**תיאור הבעיה:**
אין מנגנון Rate Limiting למניעת התקפות Brute Force על login.

**תיקון מומלץ:**

- הוספת upstash/ratelimit או פתרון דומה
- הגבלת ניסיונות התחברות ל-5 ב-15 דקות

---

### 11. חוסר Security Headers

**קובץ:** `next.config.ts`  
**קריטיות:** 4/10 🟡

**תיאור הבעיה:**
חסרים headers של אבטחה:

- Content-Security-Policy
- X-Frame-Options
- X-Content-Type-Options
- Strict-Transport-Security

**תיקון מומלץ:**

```typescript
const nextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
        ],
      },
    ];
  },
};
```

---

### 12. dangerouslySetInnerHTML (סיכון נמוך)

**קבצים:**

- `components/ui/chart.tsx` (שורה 83)
- `app/quotes/[id]/pdf/page.tsx` (שורה 58)  
  **קריטיות:** 2/10 🟡

**תיאור הבעיה:**
שימוש ב-`dangerouslySetInnerHTML` - אבל במקרים אלו:

- chart.tsx - משמש רק לצבעים מערכתיים (לא קלט משתמש)
- pdf/page.tsx - CSS קבוע ב-code (לא קלט משתמש)

**סיכון:** נמוך - הקלט לא מגיע ממשתמש

**המלצה:** לתעד ולהיות מודעים לשימוש

---

### 13. חוסר Input Validation מקיף

**קריטיות:** 3/10 🟡

**תיאור הבעיה:**
חלק מה-endpoints לא מבצעים validation מקיף על הקלט (כמו אורך מרבי, פורמט, וכו').

**המלצה:**

- שימוש ב-Zod לvalidation
- הגבלת אורך שדות טקסט
- ניקוי תווים מיוחדים

---

### 14. חוסר Audit Log מקיף

**קריטיות:** 3/10 🟡

**תיאור הבעיה:**
לא כל הפעולות הרגישות מתועדות ב-Audit Log (למשל: שינוי הרשאות, מחיקת משתמשים).

**המלצה:**
הוספת Audit Log לפעולות קריטיות נוספות.

---

## ✅ נקודות חיוביות באבטחה

### 1. SQL Injection Protection ✅

**סטטוס:** מוגן

הקוד משתמש ב-Prisma `$queryRaw` עם Template Literals שמספקות הגנה מובנית:

```typescript
const rawRecords = await prisma.$queryRaw<{ id: number }[]>`
  SELECT id FROM "Record"
  WHERE "tableId" = ${tableId}
  AND "companyId" = ${user.companyId}
  AND "data"::text ILIKE ${`%${q}%`}
`;
```

**Prisma מבצע parameterization אוטומטי על Template Literals** - מה שמונע SQL Injection.

### 2. Multi-Tenancy Implementation ✅

**סטטוס:** טוב מאוד (עם חריגים)

רוב הקוד מיישם סינון לפי `companyId` בצורה נכונה:

- Records, Tables, Views - ✅
- Tickets, Notifications - ✅
- Finance (Retainers, Payments) - ✅
- Users API - ✅

### 3. Password Hashing ✅

**סטטוס:** מאובטח

שימוש נכון ב-bcrypt עם salt factor של 10.

### 4. HTTP-Only Cookies ✅

**סטטוס:** מאובטח

```typescript
cookieStore.set("auth_token", token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
});
```

### 5. File Upload Protection ✅

**סטטוס:** טוב

UploadThing מבצע אימות משתמש ב-middleware ומגביל גודל קבצים.

---

## 📝 סדר עדיפויות לתיקון

| עדיפות | פעולה                          | זמן משוער |
| ------ | ------------------------------ | --------- |
| 1      | הפעלת CRON_SECRET              | 10 דקות   |
| 2      | אבטחת Debug endpoint           | 15 דקות   |
| 3      | הוספת auth ל-AI endpoints      | 30 דקות   |
| 4      | תיקון Task actions (companyId) | 45 דקות   |
| 5      | תיקון Bulk Delete              | 20 דקות   |
| 6      | הסרת default secret            | 10 דקות   |
| 7      | הוספת Security Headers         | 20 דקות   |
| 8      | הוספת Rate Limiting            | 1 שעה     |

---

## 🔧 סקריפט תיקונים מומלץ

להלן סיכום הפקודות והשינויים הנדרשים:

### 1. הוספת משתני סביבה ל-.env:

```bash
SESSION_SECRET=<generate-secure-32-char-secret>
CRON_SECRET=<generate-secure-32-char-secret>
```

### 2. עדכון next.config.ts עם Security Headers (ראה למעלה)

### 3. תיקון הקבצים שצוינו לפי התיקונים המומלצים

---

## 📊 מסקנות

האפליקציה מיישמת **Multi-Tenancy טוב** ו**הגנה מפני SQL Injection**, אבל יש מספר פרצות שדורשות תשומת לב:

1. **Debug ו-CRON endpoints** צריכים אבטחה מיידית
2. **AI endpoints** חייבים אימות משתמש
3. **Task actions** חסרות סינון companyId במקומות מסוימים
4. **Security Headers** חסרים לחלוטין

**ציון כללי: 7/10** - עם תיקון הפרצות הקריטיות, הציון יעלה ל-9/10.

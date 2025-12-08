# Multi-Tenancy Implementation Guide

## סקירה כללית

המערכת עודכנה לתמוך ב-multi-tenancy - כל ארגון (Company) הוא מבודד עם הנתונים שלו.

## שינויים שבוצעו

### 1. Database Schema

- נוספה טבלת `Company` חדשה עם שדות: `id`, `name`, `slug`
- נוסף שדה `companyId` לכל הטבלאות הרלוונטיות:
  - User, Message, Group, AutomationRule, Notification
  - TableMeta, TableCategory, Record, Task
  - CalendarEvent, Client, AnalyticsView, ViewFolder

### 2. Authentication

- נוצר עמוד הרשמה חדש: `/register`
- API route חדש: `/api/auth/register`
- משתמש חדש שיוצר ארגון חדש מקבל אוטומטית תפקיד `admin`
- ה-User interface עודכן להכיל `companyId`

### 3. Helper Functions

- `getCurrentCompanyId()` - מחזירה את ה-company ID של המשתמש המחובר
- `requireCompanyId()` - מחזירה את ה-company ID או זורקת שגיאה אם המשתמש לא מחובר

## כיצד לעדכן קוד קיים

### בעדכונים של Server Actions

לפני כל שאילתת Prisma, הוסף סינון לפי companyId:

**לפני:**
\`\`\`typescript
const tables = await prisma.tableMeta.findMany({
where: { createdBy: user.id },
});
\`\`\`

**אחרי:**
\`\`\`typescript
import { requireCompanyId } from "@/lib/company";

const companyId = await requireCompanyId();
const tables = await prisma.tableMeta.findMany({
where: {
companyId,
createdBy: user.id
},
});
\`\`\`

### ביצירת רשומות חדשות

הוסף את ה-companyId בעת יצירה:

**לפני:**
\`\`\`typescript
const table = await prisma.tableMeta.create({
data: {
name: "New Table",
slug: "new-table",
createdBy: user.id,
schemaJson: {},
},
});
\`\`\`

**אחרי:**
\`\`\`typescript
import { requireCompanyId } from "@/lib/company";

const companyId = await requireCompanyId();
const table = await prisma.tableMeta.create({
data: {
companyId,
name: "New Table",
slug: "new-table",
createdBy: user.id,
schemaJson: {},
},
});
\`\`\`

### ב-API Routes

אותו עיקרון:

\`\`\`typescript
import { requireCompanyId } from "@/lib/company";

export async function GET(req: Request) {
const companyId = await requireCompanyId();

const records = await prisma.record.findMany({
where: { companyId },
});

return NextResponse.json(records);
}
\`\`\`

## קבצים שצריך לעדכן

### עדיפות גבוהה (קריטי):

1. `app/actions/*.ts` - כל ה-server actions
2. `app/api/**/route.ts` - כל ה-API routes
3. קבצים שמבצעים שאילתות ישירות ל-Prisma

### דוגמאות לקבצים שצריך לעדכן:

- `app/actions/tables.ts`
- `app/actions/records.ts`
- `app/actions/tasks.ts`
- `app/actions/automations.ts`
- `app/actions/analytics.ts`
- `app/actions/calendar.ts`
- `app/actions/users.ts`
- כל ה-API routes תחת `app/api/`

## בדיקת תקינות

לאחר העדכונים:

1. וודא שכל הקריאות ל-Prisma מסננות לפי `companyId`
2. וודא שכל היצירות של רשומות חדשות כוללות `companyId`
3. בדוק שמשתמשים לא רואים נתונים של חברות אחרות
4. בדוק שהרשמה חדשה יוצרת ארגון חדש מבודד

## Migration צעדים

1. הרץ את ה-migration:
   \`\`\`bash
   npx prisma migrate deploy
   \`\`\`

2. צור Prisma client מחדש:
   \`\`\`bash
   npx prisma generate
   \`\`\`

3. אתחל מחדש את ה-dev server:
   \`\`\`bash
   npm run dev
   \`\`\`

## Migration Script

ה-migration script (`prisma/migrations/add_company_multitenancy/migration.sql`) מבצע:

1. יוצר את טבלת Company
2. מוסיף companyId לכל הטבלאות
3. יוצר ארגון ברירת מחדל בשם "Default Organization"
4. מקשר את כל הנתונים הקיימים לארגון ברירת המחדל
5. מוסיף אינדקסים לביצועים טובים יותר

## הערות חשובות

- הארגון הקיים נשמר ולא נמחק
- כל הנתונים הקיימים יקושרו לארגון ברירת המחדל
- משתמשים חדשים יכולים ליצור ארגונים חדשים בלתי תלויים
- אין אפשרות כרגע להצטרף לארגון קיים (ניתן להוסיף בעתיד)

# Dynamic Views System - Implementation Guide

## מהו המערכת החדשה?

המערכת החדשה מאפשרת ליצור, לנהל ולהציג **views דינמיים** עבור טבלאות בצד הלקוח, כאשר כל ה-configuration נשמר במסד הנתונים במקום להיות קוד מוטמע (hardcoded).

## מה השתנה?

### לפני

- Views היו מוגדרים בקוד ב-`RecordTable.tsx`
- התצוגה נשלטה ב-localStorage
- כל שינוי בview דרש עריכת קוד
- Views היו ספציפיים לטבלאות `leads` ו-`digital-marketing`

### אחרי

- Views נשמרים במסד הנתונים (טבלת `View`)
- ניתן ליצור views חדשים דרך UI
- Views דינמיים שעובדים לכל טבלה
- כל התצורה נשלטת דרך JSON config
- מצב ON/OFF נשמר ב-DB

## ארכיטקטורה

```
┌─────────────────────────────────────────────┐
│  Database (PostgreSQL)                      │
│  ┌────────────┐                              │
│  │ View Table │                              │
│  │------------│                              │
│  │ - id                                      │
│  │ - tableId                                 │
│  │ - name                                    │
│  │ - slug                                    │
│  │ - config (JSON)                           │
│  │ - isEnabled                               │
│  └────────────┘                              │
└─────────────────────────────────────────────┘
           ↑
           │ Server Actions
           ↓
┌─────────────────────────────────────────────┐
│  app/actions/views.ts                       │
│  - createView()                             │
│  - updateView()                             │
│  - toggleView()                             │
│  - deleteView()                             │
│  - getViewsForTable()                       │
└─────────────────────────────────────────────┘
           ↑
           │
           ↓
┌─────────────────────────────────────────────┐
│  Server Component: app/tables/[id]/page.tsx│
│  - טוען views ל-table מה-DB                │
│  - מעביר ל-RecordTable                      │
└─────────────────────────────────────────────┘
           ↑
           │ Props
           ↓
┌─────────────────────────────────────────────┐
│  Client Component: ViewsPanel.tsx           │
│  ┌──────────────────────────────────┐       │
│  │ AddViewModal (Create new views)  │       │
│  └──────────────────────────────────┘       │
│  ┌──────────────────────────────────┐       │
│  │ DynamicViewCard (Display & toggle)│      │
│  │  ┌─────────────────────────────┐ │       │
│  │  │ DynamicViewRenderer         │ │       │
│  │  │  - Renders based on config  │ │       │
│  │  └─────────────────────────────┘ │       │
│  └──────────────────────────────────┘       │
└─────────────────────────────────────────────┘
```

## סוגי Views הנתמכים

### 1. **Stats View**

מציג סטטיסטיקות מבוססות זמן (שבוע/חודש/כל הזמן).

```json
{
  "type": "stats",
  "title": "New Leads",
  "timeRange": "week" // "week" | "month" | "all"
}
```

### 2. **Aggregation View**

מבצע חישובים על הנתונים (sum, count, avg, group-by).

```json
{
  "type": "aggregation",
  "title": "Revenue Stats",
  "aggregationType": "sum", // "sum" | "count" | "avg" | "group"
  "targetField": "amount",
  "groupByField": "status" // רק ב-group
}
```

### 3. **Legend View**

מציג מקרא צבעים להסבר.

```json
{
  "type": "legend",
  "title": "Status Legend",
  "legendItems": [
    {
      "color": "#dcfce7",
      "label": "Active",
      "description": "Optional description"
    }
  ]
}
```

### 4. **Chart View**

מציג נתונים בצורה ויזואלית (נתמך עתידית).

## פקודות ה-CLI להרצה

### שלב 1: הרצת Migration

```powershell
cd "c:\Users\Ofek\Desktop\אופק תכנות\gemini3pro-test\my-app"
npx prisma migrate dev --name add_view_model
```

### שלב 2: יצירת Prisma Client החדש

```powershell
npx prisma generate
```

### שלב 3 (אופציונלי): Seed Views קיימים

אם יש לך כבר טבלאות `leads` או `digital-marketing`, הרץ:

```powershell
npx tsx scripts/seed-views.ts
```

זה ייצור אוטומטית את ה-views המקוריים במסד הנתונים.

### שלב 4: אתחול מחדש של השרת

```powershell
# עצור את pnpm run dev (Ctrl+C)
pnpm run dev
```

## שימוש במערכת

### יצירת View חדש

1. היכנס לטבלה
2. לחץ על כפתור "**+ Add View**" בפאנל הצד
3. מלא את הפרטים:
   - **View Name**: שם תצוגה
   - **Slug**: מזהה ייחודי (יווצר אוטומטית)
   - **View Type**: בחר סוג (Stats/Aggregation/Legend/Chart)
   - הגדר את התצורה בהתאם לסוג שנבחר
4. לחץ "**Create View**"

### ניהול Views

#### Toggle ON/OFF

לחץ על כפתור ה-**ON/OFF** בראש כל view card כדי להפעיל/לכבות.

#### מחיקת View

לחץ על 🗑️ ליד כפתור ה-toggle.

### דוגמאות קוד

#### יצירת View דרך Server Action

```typescript
import { createView } from "@/app/actions/views";

const result = await createView({
  tableId: 1,
  name: "Weekly Stats",
  slug: "my-table_weekly_stats",
  config: {
    type: "stats",
    title: "Weekly Stats",
    timeRange: "week",
  },
  isEnabled: true,
});
```

#### עדכון View

```typescript
import { updateView } from "@/app/actions/views";

await updateView(viewId, {
  isEnabled: false,
});
```

## קבצים שנוצרו/עודכנו

### קבצים חדשים

- ✨ `prisma/schema.prisma` - מודל View
- ✨ `app/actions/views.ts` - Server Actions
- ✨ `lib/viewProcessor.ts` - עיבוד views דינמי
- ✨ `components/DynamicViewRenderer.tsx` - רינדור views
- ✨ `components/DynamicViewCard.tsx` - Card component
- ✨ `components/AddViewModal.tsx` - Modal ליצירת views
- ✨ `components/ViewsPanel.tsx` - פאנל ניהול views
- ✨ `scripts/seed-views.ts` - Migration script

### קבצים שעודכנו

- 📝 `components/RecordTable.tsx` - הוסרו views מוטמעים
- 📝 `app/tables/[id]/page.tsx` - טעינת views מDB

## תכונות מתקדמות

### Filters ב-Views

ניתן להוסיף פילטרים ל-aggregation views:

```json
{
  "type": "aggregation",
  "title": "Active Retainers",
  "aggregationType": "sum",
  "targetField": "amount",
  "filters": [
    {
      "field": "status",
      "operator": "equals",
      "value": "active"
    }
  ]
}
```

### Color Mapping

הגדרת צבעים מותאמים אישית ל-group-by aggregations:

```json
{
  "type": "aggregation",
  "aggregationType": "group",
  "groupByField": "status",
  "colorMapping": {
    "active": "bg-green-500",
    "pending": "bg-yellow-500",
    "inactive": "bg-red-500"
  }
}
```

## Troubleshooting

### Problem: Views לא מוצגים

**פתרון**: ודא ש:

1. ה-migration רץ בהצלחה
2. `npx prisma generate` בוצע
3. השרת אותחל מחדש
4. יש לפחות view אחד ב-DB לטבלה

### Problem: שגיאת "Property 'view' does not exist"

**פתרון**: הרץ `npx prisma generate` כדי לעדכן את ה-Prisma Client.

### Problem: Views נעלמים אחרי רענון

**פתרון**: זו בעיה ישנה שנפתרה! Views עכשיו נשמרים ב-DB.

## תכנון עתידי

- ✅ CRUD מלא ל-views
- ✅ Toggle דינמי
- ✅ עיבוד views דינמי
- ⏳ Charts ויזואליים (Chart.js/Recharts)
- ⏳ ייצוא views כשכת BI
- ⏳ Permissions per-view
- ⏳ Shared views בין users

## סיכום

המערכת החדשה מאפשרת:

- ✨ יצירת views ללא קוד
- 🗄️ נתונים נשמרים ב-DB
- 🔄 ניהול דינמי מלא
- 🎨 התאמה אישית רחבה
- 📊 תמיכה בסוגי views שונים
- 🚀 הרחבה קלה

**תהנה מהמערכת החדשה!** 🎉

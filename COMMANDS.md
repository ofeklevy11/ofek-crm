# פקודות להרצה - Server Actions Migration

## 1. בדיקת קומפילציה 📋

בדוק שהקוד מתקמפל ללא שגיאות:

```powershell
npx tsc --noEmit
```

---

## 2. הרצת האפליקציה 🚀

הרץ את האפליקציה במצב פיתוח:

```powershell
npm run dev
```

או אם אתה משתמש ב-pnpm:

```powershell
pnpm dev
```

---

## 3. בדיקת Build (אופציונלי) 🏗️

בדוק שה-build עובר בהצלחה:

```powershell
npm run build
```

---

## 4. בדיקת Linting (אופציונלי) 🔍

הרץ ESLint לבדיקת איכות קוד:

```powershell
npm run lint
```

---

## 5. סנכרון Prisma (אם צריך) 🗄️

אם יש שינויים ב-schema:

```powershell
npx prisma generate
npx prisma db push
```

---

## 6. פתיחת הדפדפן 🌐

פתח את הדפדפן על:

```
http://localhost:3000
```

---

## תרחישי בדיקה 🧪

### A. בדיקת Categories

1. עבור ל-`/tables`
2. לחץ על "+ New Category"
3. הזן שם קטגוריה
4. לחץ "Create Category"
5. **ודא:** הקטגוריה החדשה מופיעה ברשימה **ללא רענון ידני**

### B. בדיקת Tables

1. עבור ל-`/tables/new`
2. מלא את פרטי הטבלה
3. לחץ "Create Table"
4. **ודא:** הטבלה החדשה מופיעה בדשבורד

### C. בדיקת Tasks

1. עבור ל-`/tasks`
2. לחץ "+ משימה חדשה"
3. מלא פרטים
4. לחץ "שמור משימה"
5. **ודא:** המשימה מופיעה ב-Kanban

### D. בדיקת Calendar

1. עבור ל-`/calendar`
2. לחץ על הכפתור הכחול (Create Event)
3. מלא פרטי אירוע
4. לחץ "Save"
5. **ודא:** האירוע מופיע ביומן

### E. בדיקת Finance

1. עבור ל-`/finance/retainers`
2. לחץ "Create New Retainer"
3. בחר לקוח ומלא פרטים
4. לחץ "צור ריטיינר"
5. **ודא:** הריטיינר מופיע ברשימה

---

## פתרון בעיות נפוצות 🔧

### שגיאת קומפילציה:

```powershell
# נקה את .next ו-node_modules אם צריך
Remove-Item -Recurse -Force .next
npm install
```

### שגיאות TypeScript:

```powershell
# רענן את הטייפים של Prisma
npx prisma generate
```

### הממשק לא מתעדכן אוטומטית:

- וודא שיש `router.refresh()` אחרי ה-action
- בדוק שה-action משתמש ב-`revalidatePath()`
- רענן את הדפדפן ידנית (Ctrl+Shift+R)

### שגיאת חיבור ל-DB:

```powershell
# ודא שה-PostgreSQL רץ
# בדוק את .env שה-DATABASE_URL תקין
```

---

## סדר הבדיקות המומלץ 📝

```powershell
# 1. בדוק קומפילציה
npx tsc --noEmit

# 2. אם עבר - הרץ dev
npm run dev

# 3. פתח דפדפן על http://localhost:3000

# 4. בדוק כל תכונה:
#    - Categories ✅
#    - Tables ✅
#    - Tasks ✅
#    - Calendar ✅
#    - Finance (Retainers) ✅

# 5. אם הכל עובד - הרץ build
npm run build
```

---

## הערות חשובות ⚠️

1. **API Routes הישנים עדיין קיימים** - אל תמחק אותם עד שכל הקומפוננטות עודכנו
2. **רענון אוטומטי** - כל Server Action צריך לרענן את הממשק אוטומטית
3. **טיפול בשגיאות** - כל action מחזיר `{ success, data, error }`
4. **TypeScript** - וודא שאין שגיאות TypeScript לפני הרצה

---

## מעקב אחר עדכונים 📊

### ✅ הושלם:

- Server Actions נוצרו
- TablesDashboard עודכן
- CreateTableForm עודכן
- TaskKanbanBoard עודכן
- TaskModal עודכן
- Calendar עודכן
- CreateRetainerForm עודכן

### ⏳ בתהליך:

- RecordTable
- EditRecordModal
- AddRecordForm
- EditTableModal
- שאר קומפוננטות Finance

---

## פקודות נוספות (לפי צורך) 🛠️

### רענון הכל:

```powershell
Remove-Item -Recurse -Force .next
Remove-Item -Recurse -Force node_modules
npm install
npx prisma generate
npm run dev
```

### בדיקת Package Versions:

```powershell
npm list next
npm list @prisma/client
```

### עדכון Dependencies:

```powershell
npm update
```

---

**בהצלחה! 🚀**

אם יש בעיות - בדוק את `SERVER_ACTIONS.md` ו-`MIGRATION_SUMMARY.md` למידע נוסף.

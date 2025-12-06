# 🔥 טריגר חישוב ביצועים - אירועים מרובים (Multi Event Duration Trigger)

## 📋 סיכום הפיצ'ר

הפיצ'ר החדש מאפשר למדוד זמנים בין **סדרת אירועים שלמה**, לא רק בין שני events.

### דוגמה לשימוש:

```
ליד נוצר → בטיפול → לקוח משלם
```

המערכת תחשב:

- ⏱️ זמן מ"ליד נוצר" ל"בטיפול"
- ⏱️ זמן מ"בטיפול" ל"לקוח משלם"
- 📊 זמן כולל של כל התהליך
- 📈 מדד משוקלל (ממוצע)

---

## 🚀 פקודות להרצה (לפי סדר!)

```powershell
# שלב 1: שחזור קובץ automations.ts המקולקל
git checkout HEAD -- app/actions/automations.ts

# שלב 2: הרצת מיגרציה של הדאטהבייס
npx prisma migrate dev --name add_multi_event_duration

# שלב 3: יצירת Prisma Client מחדש
npx prisma generate
```

---

## ✏️ שינויים ידניים נדרשים

### 1️⃣ עריכת `app/actions/automations.ts`

#### א. הוסף import בשורה 6:

```typescript
import { processMultiEventDurationTrigger } from "./multi-event-automations";
```

#### ב. הוסף קריאה לפונקציה בסוף `processRecordUpdate`:

חפש את הפונקציה `processRecordUpdate` (בסביבות שורה 493).
גלול לסוף הפונקציה, ממש לפני:

```typescript
  } catch (error) {
    console.error("Error processing record update automations:", error);
  }
}
```

הוסף לפני ה-`} catch`:

```typescript
// 🔥 טריגר חדש: חישוב ביצועים בין אירועים מרובים
await processMultiEventDurationTrigger(tableId, recordId, oldData, newData);
```

---

## ✅ קבצים שכבר נוצרו

1. ✅ **prisma/schema.prisma** - טבלה חדשה `MultiEventDuration`
2. ✅ **app/actions/multi-event-automations.ts** - לוגיקת חישוב אירועים מרובים
3. ✅ **app/actions/analytics.ts** - תצוגת נתוני multi-event
4. ✅ **components/MultiEventAutomationModal.tsx** - ממשק ליצירת אוטומציה
5. ✅ **components/AutomationsList.tsx** - כפתור וממשק לאוטומציות

---

## 🎯 איך להשתמש בפיצ'ר

### יצירת אוטומציה חדשה:

1. **עבור לעמוד אוטומציות** (`/automations`)
2. **לחץ על "🔥 אירועים מרובים"**
3. **בחר טבלה** (לדוגמה: "לידים")
4. **הגדר שרשרת אירועים**, לדוגמה:
   - **אירוע 1:** שם="ליד נוצר", עמודה=`status`, ערך=`new`
   - **אירוע 2:** שם="בטיפול", עמודה=`status`, ערך=`in_progress`
   - **אירוע 3:** שם="לקוח משלם", עמודה=`status`, ערך=`customer`
5. **שמור את האוטומציה**

### מה קורה אחרי כן:

- ✅ כשרשומה מגיעה לאירוע האחרון (לדוגמה: `customer`), המערכת:
  1. מחפשת בהיסטוריה את כל האירועים
  2. מחשבת את הזמן בין כל שני אירועים עוקבים
  3. שומרת את הנתונים ב-`MultiEventDuration` table
  4. מציגה את התוצאות בעמוד **Analytics**

### צפייה בתוצאות:

1. **עבור לעמוד Analytics** (`/analytics`)
2. **תראה כרטיס עבור האוטומציה החדשה**
3. **לחץ על הכרטיס לפירוט מלא** - תראה:
   - שרשרת האירועים
   - זמן בין כל שני אירועים
   - זמן כולל
   - סטטיסטיקות (ממוצע, מינימום, מקסימום)

---

## 🏗️ מבנה הטבלה `MultiEventDuration`

```prisma
model MultiEventDuration {
  id                   Int            @id @default(autoincrement())
  automationRuleId     Int
  recordId             Int?
  taskId               String?

  eventChain           Json  // [{ eventName, timestamp, value }, ...]
  eventDeltas          Json  // [{ from, to, durationSeconds, durationString }, ...]

  totalDurationSeconds Int
  totalDurationString  String
  weightedScore        Float?

  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt
}
```

---

## 🔧 Troubleshooting

### שגיאה: "Cannot find module 'multi-event-automations'"

- ✅ **פתרון:** ודא שהקובץ `app/actions/multi-event-automations.ts` קיים
- ✅ הרץ: `npx prisma generate`

### שגיאה: "Property 'multiEventDuration' does not exist"

- ✅ **פתרון:** הרץ: `npx prisma generate`
- ✅ אם לא עובד, הרץ: `npx prisma migrate reset` (**זהירות: מוחק נתונים!**)

### האוטומציה לא מתפעלת

- ✅ **בדוק:** האם האוטומציה פעילה? (כפתור ירוק)
- ✅ **בדוק:** האם השרשרת מוגדרת נכון? (שמות עמודות ערכים)
- ✅ **בדוק logs:** פתח את ה-console בשרת ותראה `[Multi-Event]` logs

---

## 📊 דוגמה מלאה

### הגדרת אוטומציה:

- **שם:** "זמן המרה מליד ללקוח"
- **טבלה:** "Leads"
- **שרשרת אירועים:**
  1. ליד נוצר (`status` = `new`)
  2. בטיפול (`status` = `in_progress`)
  3. לקוח משלם (`status` = `customer`)

### תוצאה ב-Analytics:

```
📊 זמן המרה מליד ללקוח
────────────────────────────────
שרשרת: ליד נוצר → בטיפול → לקוח משלם

📈 סטטיסטיקות:
- ממוצע: 5 ימים, 3 שעות
- מינימום: 2 ימים
- מקסימום: 10 ימים

📋 פירוט רשומות (לחץ לצפייה):
- רשומה #123: 4 ימים, 2 שעות
  • ליד נוצר → בטיפול: 1 יום
  • בטיפול → לקוח משלם: 3 ימים, 2 שעות
```

---

## 🎉 סיום!

אחרי ביצוע כל השלבים, הפיצ'ר יהיה מלא ופעיל!

**זכור:** זה פיצ'ר מתקדם שבונה **KPIs אמיתיים של CRM** 🚀

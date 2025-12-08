# 🚀 Quick Start - Multi-Tenancy

## הרצה מהירה (5 דקות)

### 1️⃣ הרץ את הפקודות הבאות ברצף:

```bash
# Migration
npx prisma migrate deploy

# Generate Prisma Client
npx prisma generate

# Restart server
npm run dev
```

### 2️⃣ כעת נווט לדפדפן:

1. **צור משתמש חדש:**

   - לך ל-http://localhost:3000/register
   - צור משתמש עם ארגון חדש

2. **בדוק בידוד:**
   - צור כמה נתונים
   - התנתק
   - התחבר עם משתמש ישן
   - ודא שלא רואה את הנתונים החדשים

✅ **אם זה עובד - מזל טוב! Multi-tenancy פועל!**

---

## ⚠️ לפני שממשיכים

**חשוב להשלים:**

1. **עדכן את כל קובצי ה-actions:**

   ```bash
   # הרץ את הסקריפט לזיהוי קבצים:
   node scripts/check-multitenancy.js
   ```

2. **ראה את המדריך המפורט:**
   - `MULTI_TENANCY_GUIDE.md` - איך לעדכן קוד
   - `FILES_CHANGED.md` - רשימת כל השינויים

---

## 🆘 אם משהו לא עובד

### בעיה: שגיאות TypeScript

**פתרון:**

```bash
npx prisma generate
# סגור ופתח מחדש את VS Code
```

### בעיה: Migration נכשל

**פתרון:**

```bash
# בדוק חיבור DB ב-.env
# נסה:
npx prisma migrate dev
```

### בעיה: הנתונים הישנים נעלמו

**פתרון:**

- הם לא נעלמו! פשוט קשורים ל-company אחר
- פתח Prisma Studio: `npx prisma studio`
- בדוק שכל הנתונים הישנים עם companyId = 1

---

## 📚 קריאה נוספת

- `MULTI_TENANCY_SUMMARY.md` - מה נעשה ומה נשאר
- `MULTI_TENANCY_GUIDE.md` - מדריך מלא ליישום
- `COMMANDS_TO_RUN.md` - כל הפקודות + troubleshooting
- `FILES_CHANGED.md` - רשימה מלאה של שינויים

---

## ✨ Features חדשים

### עבור משתמשים:

- 🔐 הרשמה עצמאית
- 🏢 יצירת ארגון חדש
- 👥 בידוד מלא בין ארגונים

### עבור מפתחים:

- 📦 Helper functions: `requireCompanyId()`
- 🔍 Check script: `check-multitenancy.js`
- 📖 Documentation מקיפה

---

## הפקודה היחידה שאתה באמת צריך עכשיו:

```bash
npx prisma migrate deploy && npx prisma generate && npm run dev
```

**זהו! המערכת מוכנה. 🎉**

---

_לפרטים נוספים, ראה את המדריכים המלאים._

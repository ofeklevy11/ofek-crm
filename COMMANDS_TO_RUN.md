# פקודות להרצה - Multi-Tenancy Implementation

## שלב 1: גיבוי מסד הנתונים (מומלץ מאוד!)

### אם יש לך pg_dump מותקן:

```bash
# Unix/Mac
pg_dump -U postgres -d your_database_name > backup_$(date +%Y%m%d_%H%M%S).sql

# Windows (PowerShell)
pg_dump -U postgres -d your_database_name > backup_$(Get-Date -Format 'yyyyMMdd_HHmmss').sql
```

### אם אתה משתמש ב-Docker:

```bash
docker exec -t your-postgres-container pg_dump -U postgres your_database_name > backup_$(date +%Y%m%d_%H%M%S).sql
```

---

## שלב 2: הרצת Migration

```bash
# הרץ את ה-migration
npx prisma migrate deploy
```

**הערה:** אם מקבל שגיאה, נסה:

```bash
npx prisma migrate dev
```

---

## שלב 3: יצירת Prisma Client מחדש

```bash
npx prisma generate
```

**זה יתקן את כל שגיאות ה-TypeScript הקשורות ל-companyId!**

---

## שלב 4: אתחול מחדש של השרת

```bash
# עצור את השרת הנוכחי (Ctrl+C) ואז:
npm run dev
```

---

## שלב 5: בדיקת קבצים שצריכים עדכון

```bash
node scripts/check-multitenancy.js
```

זה יציג רשימה של קבצים שעשויים לדרוש עדכון.

---

## שלב 6: בדיקת תקינות

### בדוק את הפונקציונליות הבאה:

1. **הרשמה:**

   - נווט ל-http://localhost:3000/register
   - צור משתמש חדש עם ארגון חדש
   - וודא שההרשמה עובדת

2. **התחברות:**

   - נווט ל-http://localhost:3000/login
   - התחבר עם המשתמש החדש
   - וודא שאתה רואה רק נתונים ריקים (ארגון חדש)

3. **בידוד נתונים:**

   - צור כמה רשומות בארגון החדש
   - התנתק והתחבר עם המשתמש הישן (Default Organization)
   - וודא שאתה רואה את הנתונים הישנים ולא את החדשים

4. **בדוק שהארגון הישן שמור:**
   - ודא שכל הנתונים מהארגון המקורי עדיין קיימים
   - ודא שהמשתמשים הישנים יכולים להתחבר

---

## פקודות נוספות (במקרה הצורך)

### איפוס ה-migration (רק אם משהו השתבש):

```bash
npx prisma migrate reset
```

**⚠️ זה ימחק את כל הנתונים! השתמש רק בפיתוח**

### xבדיקת סטטוס migration:

```bash
npx prisma migrate status
```

### פתיחת Prisma Studio (UI למסד הנתונים):

```bash
npx prisma studio
```

---

## סדר מומלץ להרצה:

```bash
# 1. גיבוי (אם יש pg_dump)
pg_dump -U postgres -d your_db > backup.sql

# 2. Migration
npx prisma migrate deploy

# 3. Generate Prisma Client
npx prisma generate

# 4. רענון Dev Server
npm run dev

# 5. בדיקת קבצים
node scripts/check-multitenancy.js
```

---

## אם נתקלת בבעיות:

### שגיאה: "Migration failed"

- בדוק את חיבור ה-DB ב-.env
- ודא ש-PostgreSQL רץ
- נסה להריץ `npx prisma migrate dev` במקום `deploy`

### שגיאה: "companyId does not exist"

- ודא שהרצת `npx prisma generate` אחרי ה-migration
- נסה לסגור ולפתוח מחדש את ה-IDE

### הנתונים הישנים לא מופיעים:

- בדוק ב-Prisma Studio שהם קיימים וקשורים ל-companyId = 1
- ודא שהמשתמש שמחובר שייך ל-companyId = 1

---

## קבלת עזרה:

אם יש בעיות, בדוק:

1. את קובץ `MULTI_TENANCY_SUMMARY.md` - סיכום כל השינויים
2. את קובץ `MULTI_TENANCY_GUIDE.md` - הדרכה מפורטת ליישום
3. את ה-migration file: `prisma/migrations/add_company_multitenancy/migration.sql`

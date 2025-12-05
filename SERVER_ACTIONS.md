# המרה ל-Server Actions

## סקירה כללית

האפליקציה עברה המרה מלאה מ-API Routes מסורתיים ל-Next.js Server Actions. זהו שדרוג משמעותי שמביא ביצועים מהירים יותר, קוד נקי יותר, ואופטימיזציות אוטומטיות.

## מה השתנה?

### לפני: API Routes

```typescript
// app/api/categories/route.ts
export async function POST(request: Request) {
  const body = await request.json();
  // ...logic
  return NextResponse.json(category);
}

// בקומפוננטה
const res = await fetch("/api/categories", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name }),
});
const category = await res.json();
router.refresh(); // רענון ידני
```

### אחרי: Server Actions

```typescript
// app/actions/categories.ts
"use server";

export async function createCategory(name: string) {
  const category = await prisma.tableCategory.create({
    data: { name },
  });

  revalidatePath("/"); // רענון אוטומטי של הממשק
  revalidatePath("/tables");

  return { success: true, data: category };
}

// בקומפוננטה
const { createCategory } = await import("@/app/actions");
const result = await createCategory(name);
// הממשק מתעדכן אוטומטית!
```

## Server Actions שנוצרו

### 1. Categories (`app/actions/categories.ts`)

- `getCategories()` - קריאת כל הקטגוריות
- `createCategory(name)` - יצירת קטגוריה חדשה
- `updateCategory(id, name)` - עדכון קטגוריה
- `deleteCategory(id)` - מחיקת קטגוריה

### 2. Tables (`app/actions/tables.ts`)

- `getTables()` - קריאת כל הטבלאות
- `getTableById(id)` - קריאת טבלה ספציפית
- `createTable(data)` - יצירת טבלה חדשה
- `updateTable(id, data)` - עדכון טבלה
- `deleteTable(id)` - מחיקת טבלה
- `exportTableData(tableId)` - ייצוא נתוני טבלה
- `searchInTable(tableId, searchTerm)` - חיפוש בטבלה

### 3. Records (`app/actions/records.ts`)

- `getRecordsByTableId(tableId)` - קריאת כל הרשומות של טבלה
- `createRecord(data)` - יצירת רשומה חדשה (עם בדיקת הרשאות)
- `updateRecord(id, data)` - עדכון רשומה (עם בדיקת הרשאות)
- `deleteRecord(id, deletedBy)` - מחיקת רשומה (עם בדיקת הרשאות)
- `bulkDeleteRecords(ids, deletedBy)` - מחיקה מרובה
- `uploadAttachment(recordId, file)` - העלאת קובץ מצורף

### 4. Tasks (`app/actions/tasks.ts`)

- `getTasks()` - קריאת כל המשימות
- `getTaskById(id)` - קריאת משימה ספציפית
- `createTask(data)` - יצירת משימה חדשה
- `updateTask(id, data)` - עדכון משימה
- `deleteTask(id)` - מחיקת משימה

### 5. Calendar (`app/actions/calendar.ts`)

- `getCalendarEvents()` - קריאת כל אירועי היומן
- `getCalendarEventById(id)` - קריאת אירוע ספציפי
- `createCalendarEvent(data)` - יצירת אירוע חדש
- `updateCalendarEvent(id, data)` - עדכון אירוע
- `deleteCalendarEvent(id)` - מחיקת אירוע

### 6. Finance (`app/actions/finance.ts`)

- **Retainers:**

  - `getRetainers()` - קריאת כל התשלומים החוזרים
  - `getRetainerById(id)` - קריאת תשלום חוזר ספציפי
  - `createRetainer(data)` - יצירת תשלום חוזר חדש
  - `updateRetainer(id, data)` - עדכון תשלום חוזר
  - `deleteRetainer(id)` - מחיקת תשלום חוזר

- **Payments:**

  - `getPayments()` - קריאת כל התשלומים החד-פעמיים
  - `getPaymentById(id)` - קריאת תשלום ספציפי
  - `createPayment(data)` - יצירת תשלום חד-פעמי
  - `updatePayment(id, data)` - עדכון תשלום
  - `deletePayment(id)` - מחיקת תשלום

- **Clients:**
  - `searchClients(searchTerm)` - חיפוש לקוחות
  - `getFinanceClients()` - קריאת כל לקוחות הפיננסים

### 7. Users (`app/actions/users.ts`)

- `getUsers()` - קריאת כל המשתמשים
- `getUserById(id)` - קריאת משתמש ספציפי
- `getCurrentUser(email)` - קריאת המשתמש הנוכחי
- `updateUser(id, data)` - עדכון משתמש
- `deleteUser(id)` - מחיקת משתמש

### 8. Auth (`app/actions/auth.ts`)

- `getCurrentAuthUser()` - קריאת המשתמש המאומת
- `setAuthUser(email)` - הגדרת משתמש מאומת

## היתרונות של Server Actions

### 1. **ביצועים מהירים יותר** 🚀

- אין צורך ב-HTTP round trips מיותרים
- Next.js מבצע אופטימיזציות אוטומטיות
- העברת נתונים יעילה יותר בין הקליינט לשרת

### 2. **Automatic Revalidation** 🔄

- שימוש ב-`revalidatePath()` מרענן אוטומטית את הממשק
- אין צורך ב-`router.refresh()` ידני
- Next.js מנהל את ה-cache באופן חכם

### 3. **Type Safety** 🛡️

- TypeScript מקומפל בין קליינט לשרת
- אין צורך ב-manual type casting
- שגיאות מתגלות בזמן קומפילציה

### 4. **קוד נקי יותר** ✨

- פחות boilerplate code
- לא צריך NextResponse.json()
- לא צריך request.json()
- אין צורך בהגדרת HTTP methods

### 5. **אבטחה משופרת** 🔐

- Server Actions רצים רק בצד השרת
- אין חשיפה של endpoints
- Prisma queries לא נחשפים לקליינט
- בדיקות הרשאות מובנות

### 6. **Progressive Enhancement** 📱

- עובד גם כשה-JavaScript מכובה
- Better UX עם React Server Components
- שיפורים בנגישות

## שימוש ב-Server Actions

### דוגמה בסיסית

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function MyComponent() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    setLoading(true);
    try {
      const { createCategory } = await import("@/app/actions");
      const result = await createCategory("New Category");

      if (!result.success) {
        alert(result.error);
        return;
      }

      // הממשק יתעדכן אוטומטית בזכות revalidatePath
      router.refresh();
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return <button onClick={handleCreate}>Create</button>;
}
```

### שימוש עם Forms

```typescript
async function handleSubmit(formData: FormData) {
  "use server";

  const name = formData.get("name") as string;
  const result = await createCategory(name);

  if (!result.success) {
    return { error: result.error };
  }

  revalidatePath("/tables");
  redirect("/tables");
}
```

## Revalidation Strategy

כל Server Action משמש `revalidatePath()` לרענון הממשק:

```typescript
export async function createRecord(data) {
  // ... create logic

  revalidatePath(`/tables/${tableId}`); // המסך הספציפי
  revalidatePath("/"); // הדף הראשי

  return { success: true, data: record };
}
```

## Migration Status

✅ **הושלם:**

- Categories API → Categories Actions
- Tables API → Tables Actions
- Records API → Records Actions
- Tasks API → Tasks Actions
- Calendar API → Calendar Actions
- Finance API → Finance Actions
- Users API → Users Actions
- Auth API → Auth Actions

📝 **עדכונים בקומפוננטות:**

- ✅ TablesDashboard
- ✅ CreateTableForm
- ⏳ RecordTable (בתהליך)
- ⏳ EditRecordModal (בתהליך)
- ⏳ AddRecordForm (בתהליך)
- ⏳ TaskKanbanBoard (בתהליך)
- ⏳ Calendar Components (בתהליך)
- ⏳ Finance Components (בתהליך)

## המלצות לפיתוח עתידי

1. **Error Handling**: השתמש ב-try-catch בכל Server Action
2. **Validation**: הוסף zod validation לכל input
3. **Rate Limiting**: הוסף הגבלת קריאות למניעת abuse
4. **Logging**: הוסף logging מפורט לכל פעולה
5. **Optimistic Updates**: שקול שימוש ב-`useOptimistic` לחוויית משתמש משופרת

## Best Practices

### 1. תמיד החזר אובייקט תגובה עקבי

```typescript
return { success: true, data: result };
// או
return { success: false, error: "Error message" };
```

### 2. השתמש ב-revalidatePath אחרי כל שינוי

```typescript
revalidatePath("/relevant-path");
```

### 3. בדוק הרשאות בכל Server Action

```typescript
const user = await getUserById(userId);
if (!user || !canWriteTable(user, tableId)) {
  return { success: false, error: "No permission" };
}
```

### 4. טיפול בשגיאות

```typescript
try {
  // ... logic
} catch (error) {
  console.error("Detailed error:", error);
  return { success: false, error: "User-friendly message" };
}
```

## קישורים מועילים

- [Next.js Server Actions Documentation](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations)
- [Revalidating Data](https://nextjs.org/docs/app/building-your-application/data-fetching/fetching-caching-and-revalidating)
- [Error Handling](https://nextjs.org/docs/app/building-your-application/routing/error-handling)

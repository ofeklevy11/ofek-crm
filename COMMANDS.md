# פקודות להרצה - טריגר אירועים מרובים 🔥

## הרץ את הפקודות הבאות לפי הסדר:

```powershell
# 1. שחזור קובץ מקולקל
git checkout HEAD -- app/actions/automations.ts

# 2. מיגרציה
npx prisma migrate dev --name add_multi_event_duration

# 3. יצירת Prisma Client
npx prisma generate
```

## אחרי כן - ערוך ידנית:

### קובץ: `app/actions/automations.ts`

**א. הוסף import בשורה 6:**

```typescript
import { processMultiEventDurationTrigger } from "./multi-event-automations";
```

**ב. הוסף בסוף פונקציית `processRecordUpdate` (לפני `} catch`):**

```typescript
// 🔥 טריגר חדש: חישוב ביצועים בין אירועים מרובים
await processMultiEventDurationTrigger(tableId, recordId, oldData, newData);
```

---

## קבצים שנוצרו:

✅ prisma/schema.prisma - עודכן
✅ app/actions/multi-event-automations.ts - חדש
✅ app/actions/analytics.ts - עודכן
✅ components/MultiEventAutomationModal.tsx - חדש
✅ components/AutomationsList.tsx - עודכן

---

📖 **למדריך מלא:** קרא `README_MULTI_EVENT.md`

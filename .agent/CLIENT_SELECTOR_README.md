# Client Selector - חיפוש לקוחות מטבלאות דינמיות

## מה נוצר? 🎯

מערכת חיפוש לקוחות מתקדמת עבור מודול Finance, שמאפשרת לבחור לקוחות מהטבלאות הדינמיות הקיימות במערכת (work-dm, work-web-design).

## תכונות מרכזיות ✨

### 1. **ClientSelector Component**

קומפוננט חיפוש מתקדם עם:

- ✅ **2 טאבים**: שיווק דיגיטלי (work-dm) ובניית אתרים (work-web-design)
- ✅ **חיפוש בזמן אמת** עם debounce של 300ms
- ✅ **תצוגה מפורטת** של כל לקוח (שם, חברה, טלפון)
- ✅ **אינדיקטור טעינה** ומשוב ויזואלי
- ✅ **סגירה בלחיצה מחוץ לתיבה**
- ✅ **כפתור X** לניקוי בחירה

### 2. **API Endpoint: `/api/finance/search-clients`**

- חיפוש בכל השדות הטקסטואליים של רשומת הלקוח
- תמיכה ב-query parameters: `table` (work-dm/work-web-design) ו-`search`
- מחזיר רשימה מסוננת של לקוחות

### 3. **אינטגרציה בטפסים**

עודכנו 2 טפסים:

- **CreatePaymentForm** - תשלום חד פעמי
- **CreateRetainerForm** - ריטיינר

שניהם:

- משתמשים ב-ClientSelector במקום dropdown סטטי
- יוצרים אוטומטית לקוח ב-Finance.Client כשנבחר לקוח מטבלה דינמית
- שומרים הפניה למקור הנתונים (tableSlug + recordId)

## איך זה עובד? 🔄

1. **בחירת טאב** → המשתמש בוחר בין "שיווק דיגיטלי" ו"בניית אתרים"
2. **חיפוש** → מקליד שם, חברה, או טלפון בשדה החיפוש
3. **Debounce** → לאחר 300ms מופעלת שאילתה ל-API
4. **תצוגת תוצאות** → רשימת לקוחות מסוננת מופיעה
5. **בחירה** → לחיצה על לקוח מסמנת אותו
6. **שמירה** → בשליחת הטופס, הלקוח נוסף ל-Finance.Client (אם לא קיים)

## קבצים שנוצרו/עודכנו 📁

```
app/
├── api/finance/search-clients/route.ts  ← API חדש לחיפוש לקוחות
└── finance/
    └── ... (ללא שינוי)

components/finance/
├── ClientSelector.tsx                   ← NEW! קומפוננט החיפוש
├── CreatePaymentForm.tsx                ← עודכן להשתמש ב-ClientSelector
└── CreateRetainerForm.tsx               ← עודכן להשתמש ב-ClientSelector
```

## דוגמת שימוש 💡

```tsx
import ClientSelector from "@/components/finance/ClientSelector";

const [selectedClient, setSelectedClient] = useState<Client | null>(null);

<ClientSelector selectedClient={selectedClient} onSelect={setSelectedClient} />;
```

## אופטימיזציות 🚀

1. **Debounce** - מפחית מספר קריאות API
2. **חיפוש בצד שרת** - לא טוען את כל הלקוחות מראש
3. **Lazy Loading** - נתונים נטענים רק כשפותחים את ה-dropdown
4. **Optimistic UI** - תצוגה מהירה ללא המתנה מיותרת

## שימו לב ⚠️

- הלקוח נוצר ב-Finance.Client **רק בשליחת הטופס**, לא בבחירה
- שדה `notes` מכיל מידע על מקור הנתונים (table + record ID)
- ניתן לבחור אותו לקוח פעמים רבות (לא נוצר duplicate)

---

**תאריך יצירה**: 03/12/2025  
**גרסה**: 1.0

## הוראות לתיקון   automations.ts

### שלב 1: שחזר את הקובץ המקורי

```powershell
git checkout HEAD -- app/actions/automations.ts
```

### שלב 2: הוסף import בשורה 6 (ישירות אחרי import sendNotification)

הוסף את השורה הזו:

```typescript
import { processMultiEventDurationTrigger } from "./multi-event-automations";
```

כך שזה ייראה:

```typescript
"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { sendNotification } from "./notifications";
import { processMultiEventDurationTrigger } from "./multi-event-automations";
```

### שלב 3: הוסף קריאה לפונקציה בסוף processRecordUpdate

חפש את הפונקציה `processRecordUpdate` (בסביבות שורה 493).
גלול לסוף הפונקציה, ממש לפני:

```typescript
  } catch (error) {
    console.error("Error processing record update automations", error);
  }
}
```

הוסף לפני ה-} catch את השורות הבאות:

```typescript
// 🔥 טריגר חדש: חישוב ביצועים בין אירועים מרובים
await processMultiEventDurationTrigger(tableId, recordId, oldData, newData);
```

כך שזה ייראה בסוף:

```typescript
        }
      }
    }

    // 🔥 טריגר חדש: חישוב ביצועים בין אירועים מרובים
    await processMultiEventDurationTrigger(tableId, recordId, oldData, newData);

  } catch (error) {
    console.error("Error processing record update automations:", error);
  }
}
```

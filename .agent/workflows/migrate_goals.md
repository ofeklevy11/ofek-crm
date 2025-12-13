---
description: Run database migrations for the Goals module (including new filters)
---

Run the following command to apply the database changes:

```bash
npx prisma migrate dev --name add_goal_filters
```

This will:

1. Create the `Goal` table (if not exists).
2. Add `filters` (JSON) and `targetType` columns to support advanced filtering.

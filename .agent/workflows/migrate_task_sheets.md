---
description: Run database migrations for the Task Sheets module (including automations)
---

## Steps to run the migration

1. Open a terminal and navigate to the project directory:

   ```
   cd c:\Users\Ofek\Desktop\אופק תכנות\gemini3pro-test\my-app
   ```

2. Run the Prisma migration (or push for development):

   ```
   npx prisma db push
   ```

3. Generate the Prisma client:

   ```
   npx prisma generate
   ```

4. Restart the development server if running:
   ```
   pnpm run dev
   ```

## New Features Added

### Models

- **TaskSheet** - Daily/Weekly task sheets for employees
- **TaskSheetItem** - Individual checklist items with automation support

### Task Sheet Item Automations (`onCompleteActions`)

When an item is marked as complete, automations can run. Supported action types:

1. **SEND_NOTIFICATION** - Send notification to a user

   ```json
   {
     "actionType": "SEND_NOTIFICATION",
     "config": {
       "recipientId": 1,
       "title": "משימה הושלמה",
       "message": "הפריט {itemTitle} הושלם ע\"י {userName}"
     }
   }
   ```

2. **CREATE_TASK** - Create a new task

   ```json
   {
     "actionType": "CREATE_TASK",
     "config": {
       "title": "Follow-up task",
       "description": "...",
       "status": "todo",
       "priority": "high",
       "assigneeId": 1
     }
   }
   ```

3. **UPDATE_TASK** - Update an existing task

   ```json
   {
     "actionType": "UPDATE_TASK",
     "config": {
       "taskId": "cxxx...",
       "updates": { "status": "completed_month" }
     }
   }
   ```

4. **CREATE_FINANCE** - Create a finance record

   ```json
   {
     "actionType": "CREATE_FINANCE",
     "config": {
       "title": "Commission",
       "amount": 500,
       "type": "INCOME",
       "category": "Sales"
     }
   }
   ```

5. **UPDATE_RECORD** - Update a table record
   ```json
   {
     "actionType": "UPDATE_RECORD",
     "config": {
       "tableId": 1,
       "recordId": 42,
       "updates": { "status": "done" }
     }
   }
   ```

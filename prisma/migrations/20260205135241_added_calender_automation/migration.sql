/*
  Warnings:

  - A unique constraint covering the columns `[automationRuleId,calendarEventId]` on the table `AutomationLog` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "AutomationLog" ADD COLUMN     "calendarEventId" TEXT,
ALTER COLUMN "recordId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "AutomationRule" ADD COLUMN     "calendarEventId" TEXT;

-- CreateIndex
CREATE INDEX "AutomationLog_calendarEventId_idx" ON "AutomationLog"("calendarEventId");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationLog_automationRuleId_calendarEventId_key" ON "AutomationLog"("automationRuleId", "calendarEventId");

-- CreateIndex
CREATE INDEX "AutomationRule_calendarEventId_idx" ON "AutomationRule"("calendarEventId");

-- AddForeignKey
ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_calendarEventId_fkey" FOREIGN KEY ("calendarEventId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationLog" ADD CONSTRAINT "AutomationLog_calendarEventId_fkey" FOREIGN KEY ("calendarEventId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

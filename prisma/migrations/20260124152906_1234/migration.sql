-- CreateTable
CREATE TABLE "AutomationLog" (
    "id" SERIAL NOT NULL,
    "automationRuleId" INTEGER NOT NULL,
    "recordId" INTEGER NOT NULL,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutomationLog_automationRuleId_idx" ON "AutomationLog"("automationRuleId");

-- CreateIndex
CREATE INDEX "AutomationLog_recordId_idx" ON "AutomationLog"("recordId");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationLog_automationRuleId_recordId_key" ON "AutomationLog"("automationRuleId", "recordId");

-- AddForeignKey
ALTER TABLE "AutomationLog" ADD CONSTRAINT "AutomationLog_automationRuleId_fkey" FOREIGN KEY ("automationRuleId") REFERENCES "AutomationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationLog" ADD CONSTRAINT "AutomationLog_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "Record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

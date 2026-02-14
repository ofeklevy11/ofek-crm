/*
  Warnings:

  - You are about to drop the `TestCiCdPipeline2` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[keyHash]` on the table `ApiKey` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[automationRuleId,recordId]` on the table `MultiEventDuration` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[ticketId,breachType,slaDueDate]` on the table `SlaBreach` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `keyHash` to the `ApiKey` table without a default value. This is not possible if the table is not empty.
  - Added the required column `companyId` to the `AuditLog` table without a default value. This is not possible if the table is not empty.
  - Added the required column `companyId` to the `DashboardWidget` table without a default value. This is not possible if the table is not empty.
  - Added the required column `companyId` to the `MultiEventDuration` table without a default value. This is not possible if the table is not empty.
  - Added the required column `companyId` to the `OnboardingStep` table without a default value. This is not possible if the table is not empty.
  - Added the required column `companyId` to the `StatusDuration` table without a default value. This is not possible if the table is not empty.
  - Added the required column `companyId` to the `View` table without a default value. This is not possible if the table is not empty.
  - Added the required column `companyId` to the `WorkerOnboarding` table without a default value. This is not possible if the table is not empty.
  - Added the required column `companyId` to the `WorkerOnboardingStep` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Attachment" DROP CONSTRAINT "Attachment_recordId_fkey";

-- DropIndex
DROP INDEX "ApiKey_key_idx";

-- DropIndex
DROP INDEX "ApiKey_key_key";

-- AlterTable
ALTER TABLE "ApiKey" ADD COLUMN     "keyHash" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "companyId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "DashboardWidget" ADD COLUMN     "companyId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "MultiEventDuration" ADD COLUMN     "companyId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "OnboardingStep" ADD COLUMN     "companyId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "StatusDuration" ADD COLUMN     "companyId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "View" ADD COLUMN     "companyId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "WorkerOnboarding" ADD COLUMN     "companyId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "WorkerOnboardingStep" ADD COLUMN     "companyId" INTEGER NOT NULL;

-- DropTable
DROP TABLE "TestCiCdPipeline2";

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_keyHash_idx" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "AuditLog_companyId_idx" ON "AuditLog"("companyId");

-- CreateIndex
CREATE INDEX "AuditLog_taskId_action_timestamp_idx" ON "AuditLog"("taskId", "action", "timestamp");

-- CreateIndex
CREATE INDEX "DashboardWidget_companyId_idx" ON "DashboardWidget"("companyId");

-- CreateIndex
CREATE INDEX "MultiEventDuration_companyId_idx" ON "MultiEventDuration"("companyId");

-- CreateIndex
CREATE INDEX "MultiEventDuration_automationRuleId_recordId_createdAt_idx" ON "MultiEventDuration"("automationRuleId", "recordId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "MultiEventDuration_automationRuleId_recordId_key" ON "MultiEventDuration"("automationRuleId", "recordId");

-- CreateIndex
CREATE INDEX "Notification_userId_companyId_createdAt_idx" ON "Notification"("userId", "companyId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Notification_read_createdAt_idx" ON "Notification"("read", "createdAt");

-- CreateIndex
CREATE INDEX "OnboardingStep_companyId_idx" ON "OnboardingStep"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "SlaBreach_ticketId_breachType_slaDueDate_key" ON "SlaBreach"("ticketId", "breachType", "slaDueDate");

-- CreateIndex
CREATE INDEX "StatusDuration_companyId_idx" ON "StatusDuration"("companyId");

-- CreateIndex
CREATE INDEX "Task_companyId_assigneeId_createdAt_idx" ON "Task"("companyId", "assigneeId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Ticket_status_slaResponseDueDate_idx" ON "Ticket"("status", "slaResponseDueDate");

-- CreateIndex
CREATE INDEX "Ticket_status_slaDueDate_idx" ON "Ticket"("status", "slaDueDate");

-- CreateIndex
CREATE INDEX "View_companyId_idx" ON "View"("companyId");

-- CreateIndex
CREATE INDEX "WorkerOnboarding_companyId_idx" ON "WorkerOnboarding"("companyId");

-- CreateIndex
CREATE INDEX "WorkerOnboardingStep_companyId_idx" ON "WorkerOnboardingStep"("companyId");

-- AddForeignKey
ALTER TABLE "View" ADD CONSTRAINT "View_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "Record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusDuration" ADD CONSTRAINT "StatusDuration_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MultiEventDuration" ADD CONSTRAINT "MultiEventDuration_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingStep" ADD CONSTRAINT "OnboardingStep_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerOnboarding" ADD CONSTRAINT "WorkerOnboarding_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerOnboardingStep" ADD CONSTRAINT "WorkerOnboardingStep_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardWidget" ADD CONSTRAINT "DashboardWidget_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

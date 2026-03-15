-- AlterEnum
ALTER TYPE "DashboardWidgetType" ADD VALUE 'MINI_GOOGLE_MEET';

-- CreateIndex
CREATE INDEX "AutomationRule_triggerType_isActive_idx" ON "AutomationRule"("triggerType", "isActive");

-- CreateIndex
CREATE INDEX "Meeting_companyId_clientId_idx" ON "Meeting"("companyId", "clientId");

-- CreateIndex
CREATE INDEX "NurtureSendLog_nurtureListId_status_subscriberId_idx" ON "NurtureSendLog"("nurtureListId", "status", "subscriberId");

-- CreateIndex
CREATE INDEX "NurtureSendLog_nurtureListId_status_sentAt_idx" ON "NurtureSendLog"("nurtureListId", "status", "sentAt");

-- CreateIndex
CREATE INDEX "NurtureSubscriber_nurtureListId_createdAt_idx" ON "NurtureSubscriber"("nurtureListId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "User_companyId_role_idx" ON "User"("companyId", "role");

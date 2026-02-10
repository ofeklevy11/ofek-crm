-- CreateTable
CREATE TABLE "FinanceSyncJob" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "syncRuleId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "summary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceSyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinanceSyncJob_companyId_syncRuleId_idx" ON "FinanceSyncJob"("companyId", "syncRuleId");

-- CreateIndex
CREATE INDEX "FinanceSyncJob_status_idx" ON "FinanceSyncJob"("status");

-- AddForeignKey
ALTER TABLE "FinanceSyncJob" ADD CONSTRAINT "FinanceSyncJob_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceSyncJob" ADD CONSTRAINT "FinanceSyncJob_syncRuleId_fkey" FOREIGN KEY ("syncRuleId") REFERENCES "FinanceSyncRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

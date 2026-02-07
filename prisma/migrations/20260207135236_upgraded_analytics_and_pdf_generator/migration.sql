-- DropForeignKey
ALTER TABLE "AutomationRule" DROP CONSTRAINT "AutomationRule_createdBy_fkey";

-- AlterTable
ALTER TABLE "AnalyticsView" ADD COLUMN     "cachedStats" JSONB,
ADD COLUMN     "lastCachedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "AutomationRule" ADD COLUMN     "cachedStats" JSONB,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "lastCachedAt" TIMESTAMP(3),
ADD COLUMN     "lastRunAt" TIMESTAMP(3),
ALTER COLUMN "createdBy" DROP NOT NULL,
ALTER COLUMN "analyticsOrder" DROP DEFAULT,
ALTER COLUMN "analyticsColor" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Quote" ADD COLUMN     "isPriceWithVat" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pdfUrl" TEXT;

-- CreateTable
CREATE TABLE "AnalyticsRefreshLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsRefreshLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnalyticsRefreshLog_userId_idx" ON "AnalyticsRefreshLog"("userId");

-- CreateIndex
CREATE INDEX "AnalyticsRefreshLog_timestamp_idx" ON "AnalyticsRefreshLog"("timestamp");

-- AddForeignKey
ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsRefreshLog" ADD CONSTRAINT "AnalyticsRefreshLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

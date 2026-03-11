-- AlterTable
ALTER TABLE "NurtureList" ADD COLUMN     "configJson" JSONB,
ADD COLUMN     "isEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "NurtureSubscriber" ADD COLUMN     "triggerDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "NurtureSendLog" (
    "id" SERIAL NOT NULL,
    "subscriberId" INTEGER NOT NULL,
    "nurtureListId" INTEGER NOT NULL,
    "triggerKey" TEXT NOT NULL,
    "channel" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NurtureSendLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NurtureSendLog_nurtureListId_triggerKey_idx" ON "NurtureSendLog"("nurtureListId", "triggerKey");

-- CreateIndex
CREATE INDEX "NurtureSendLog_sentAt_idx" ON "NurtureSendLog"("sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "NurtureSendLog_subscriberId_nurtureListId_triggerKey_key" ON "NurtureSendLog"("subscriberId", "nurtureListId", "triggerKey");

-- CreateIndex
CREATE INDEX "NurtureSubscriber_triggerDate_idx" ON "NurtureSubscriber"("triggerDate");

-- AddForeignKey
ALTER TABLE "NurtureSendLog" ADD CONSTRAINT "NurtureSendLog_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "NurtureSubscriber"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NurtureSendLog" ADD CONSTRAINT "NurtureSendLog_nurtureListId_fkey" FOREIGN KEY ("nurtureListId") REFERENCES "NurtureList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

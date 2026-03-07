-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "notificationSettings" JSONB DEFAULT '{}';

-- CreateIndex
CREATE INDEX "File_key_companyId_idx" ON "File"("key", "companyId");

-- AlterTable
ALTER TABLE "File" ADD COLUMN     "recordId" INTEGER;

-- CreateIndex
CREATE INDEX "File_recordId_idx" ON "File"("recordId");

-- AddForeignKey
ALTER TABLE "Record" ADD CONSTRAINT "Record_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "Record"("id") ON DELETE SET NULL ON UPDATE CASCADE;

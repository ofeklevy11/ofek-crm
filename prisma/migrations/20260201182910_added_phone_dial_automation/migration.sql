-- AlterTable
ALTER TABLE "Record" ADD COLUMN     "dialedAt" TIMESTAMP(3),
ADD COLUMN     "dialedById" INTEGER;

-- AddForeignKey
ALTER TABLE "Record" ADD CONSTRAINT "Record_dialedById_fkey" FOREIGN KEY ("dialedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

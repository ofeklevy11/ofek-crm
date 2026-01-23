-- AlterTable
ALTER TABLE "DashboardWidget" ADD COLUMN     "settings" JSONB,
ALTER COLUMN "referenceId" DROP NOT NULL;

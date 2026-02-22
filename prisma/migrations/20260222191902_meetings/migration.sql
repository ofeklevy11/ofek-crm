-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AutomationTriggerType" ADD VALUE 'MEETING_BOOKED';
ALTER TYPE "AutomationTriggerType" ADD VALUE 'MEETING_CANCELLED';
ALTER TYPE "AutomationTriggerType" ADD VALUE 'MEETING_REMINDER';

-- AlterEnum
ALTER TYPE "DashboardWidgetType" ADD VALUE 'MINI_MEETINGS';

-- AlterTable
ALTER TABLE "AutomationRule" ADD COLUMN     "meetingId" TEXT,
ADD COLUMN     "meetingTypeId" INTEGER;

-- CreateTable
CREATE TABLE "MeetingType" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "duration" INTEGER NOT NULL,
    "color" TEXT,
    "bufferBefore" INTEGER NOT NULL DEFAULT 0,
    "bufferAfter" INTEGER NOT NULL DEFAULT 0,
    "dailyLimit" INTEGER,
    "minAdvanceHours" INTEGER NOT NULL DEFAULT 24,
    "maxAdvanceDays" INTEGER NOT NULL DEFAULT 30,
    "customFields" JSONB NOT NULL DEFAULT '[]',
    "availabilityOverride" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "shareToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "meetingTypeId" INTEGER NOT NULL,
    "participantName" TEXT NOT NULL,
    "participantEmail" TEXT,
    "participantPhone" TEXT,
    "customFieldData" JSONB,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Jerusalem',
    "status" "MeetingStatus" NOT NULL DEFAULT 'PENDING',
    "notesBefore" TEXT,
    "notesAfter" TEXT,
    "tags" TEXT[],
    "clientId" INTEGER,
    "calendarEventId" TEXT,
    "manageToken" TEXT NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" TEXT,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilityBlock" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "title" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvailabilityBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyAvailability" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "weeklySchedule" JSONB NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Jerusalem',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MeetingType_shareToken_key" ON "MeetingType"("shareToken");

-- CreateIndex
CREATE INDEX "MeetingType_companyId_isActive_idx" ON "MeetingType"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingType_companyId_slug_key" ON "MeetingType"("companyId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Meeting_calendarEventId_key" ON "Meeting"("calendarEventId");

-- CreateIndex
CREATE UNIQUE INDEX "Meeting_manageToken_key" ON "Meeting"("manageToken");

-- CreateIndex
CREATE INDEX "Meeting_companyId_status_startTime_idx" ON "Meeting"("companyId", "status", "startTime" DESC);

-- CreateIndex
CREATE INDEX "Meeting_companyId_meetingTypeId_startTime_idx" ON "Meeting"("companyId", "meetingTypeId", "startTime");

-- CreateIndex
CREATE INDEX "Meeting_companyId_startTime_endTime_idx" ON "Meeting"("companyId", "startTime", "endTime");

-- CreateIndex
CREATE INDEX "AvailabilityBlock_companyId_startDate_endDate_idx" ON "AvailabilityBlock"("companyId", "startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyAvailability_companyId_key" ON "CompanyAvailability"("companyId");

-- CreateIndex
CREATE INDEX "AutomationRule_meetingTypeId_idx" ON "AutomationRule"("meetingTypeId");

-- CreateIndex
CREATE INDEX "AutomationRule_meetingId_idx" ON "AutomationRule"("meetingId");

-- AddForeignKey
ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_meetingTypeId_fkey" FOREIGN KEY ("meetingTypeId") REFERENCES "MeetingType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingType" ADD CONSTRAINT "MeetingType_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_meetingTypeId_fkey" FOREIGN KEY ("meetingTypeId") REFERENCES "MeetingType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_calendarEventId_fkey" FOREIGN KEY ("calendarEventId") REFERENCES "CalendarEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilityBlock" ADD CONSTRAINT "AvailabilityBlock_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyAvailability" ADD CONSTRAINT "CompanyAvailability_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

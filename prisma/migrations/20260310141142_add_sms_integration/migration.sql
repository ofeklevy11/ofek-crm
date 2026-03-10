-- CreateEnum
CREATE TYPE "SmsIntegrationStatus" AS ENUM ('DISCONNECTED', 'CREDENTIALS_INVALID', 'CONNECTED', 'NO_SMS_NUMBER', 'READY');

-- AlterEnum
ALTER TYPE "AutomationActionType" ADD VALUE 'SEND_SMS';

-- CreateTable
CREATE TABLE "SmsIntegration" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "accountSid" TEXT NOT NULL,
    "authTokenEnc" TEXT NOT NULL,
    "authTokenIv" TEXT NOT NULL,
    "authTokenTag" TEXT NOT NULL,
    "fromNumber" TEXT,
    "friendlyName" TEXT,
    "status" "SmsIntegrationStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "connectedBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmsIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsMessage" (
    "id" BIGSERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "twilioSid" TEXT,
    "direction" TEXT NOT NULL DEFAULT 'OUTBOUND',
    "fromNumber" TEXT NOT NULL,
    "toNumber" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "sentByUserId" INTEGER,
    "automationRuleId" INTEGER,
    "integrationId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmsMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SmsIntegration_companyId_key" ON "SmsIntegration"("companyId");

-- CreateIndex
CREATE INDEX "SmsIntegration_companyId_idx" ON "SmsIntegration"("companyId");

-- CreateIndex
CREATE INDEX "SmsIntegration_accountSid_idx" ON "SmsIntegration"("accountSid");

-- CreateIndex
CREATE UNIQUE INDEX "SmsMessage_twilioSid_key" ON "SmsMessage"("twilioSid");

-- CreateIndex
CREATE INDEX "SmsMessage_companyId_createdAt_idx" ON "SmsMessage"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "SmsMessage_twilioSid_idx" ON "SmsMessage"("twilioSid");

-- CreateIndex
CREATE INDEX "SmsMessage_companyId_status_idx" ON "SmsMessage"("companyId", "status");

-- AddForeignKey
ALTER TABLE "SmsIntegration" ADD CONSTRAINT "SmsIntegration_connectedBy_fkey" FOREIGN KEY ("connectedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsIntegration" ADD CONSTRAINT "SmsIntegration_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "SmsIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

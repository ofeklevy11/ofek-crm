-- CreateTable
CREATE TABLE "GoogleDriveConnection" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "googleEmail" TEXT NOT NULL,
    "accessTokenEnc" TEXT NOT NULL,
    "accessTokenIv" TEXT NOT NULL,
    "accessTokenTag" TEXT NOT NULL,
    "refreshTokenEnc" TEXT NOT NULL,
    "refreshTokenIv" TEXT NOT NULL,
    "refreshTokenTag" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "scope" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleDriveConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleDriveSelectedFolder" (
    "id" SERIAL NOT NULL,
    "connectionId" INTEGER NOT NULL,
    "driveFolderId" TEXT NOT NULL,
    "folderName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoogleDriveSelectedFolder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GoogleDriveConnection_companyId_idx" ON "GoogleDriveConnection"("companyId");

-- CreateIndex
CREATE INDEX "GoogleDriveConnection_userId_idx" ON "GoogleDriveConnection"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleDriveConnection_companyId_userId_key" ON "GoogleDriveConnection"("companyId", "userId");

-- CreateIndex
CREATE INDEX "GoogleDriveSelectedFolder_connectionId_idx" ON "GoogleDriveSelectedFolder"("connectionId");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleDriveSelectedFolder_connectionId_driveFolderId_key" ON "GoogleDriveSelectedFolder"("connectionId", "driveFolderId");

-- AddForeignKey
ALTER TABLE "GoogleDriveConnection" ADD CONSTRAINT "GoogleDriveConnection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleDriveConnection" ADD CONSTRAINT "GoogleDriveConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleDriveSelectedFolder" ADD CONSTRAINT "GoogleDriveSelectedFolder_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "GoogleDriveConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

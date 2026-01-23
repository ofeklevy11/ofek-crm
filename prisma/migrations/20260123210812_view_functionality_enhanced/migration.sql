-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isPremium" TEXT NOT NULL DEFAULT 'basic';

-- CreateTable
CREATE TABLE "cached_metrics" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cached_metrics_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ViewRefreshLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "viewId" INTEGER,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ViewRefreshLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ViewRefreshLog_userId_viewId_timestamp_idx" ON "ViewRefreshLog"("userId", "viewId", "timestamp");

-- AddForeignKey
ALTER TABLE "ViewRefreshLog" ADD CONSTRAINT "ViewRefreshLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViewRefreshLog" ADD CONSTRAINT "ViewRefreshLog_viewId_fkey" FOREIGN KEY ("viewId") REFERENCES "View"("id") ON DELETE SET NULL ON UPDATE CASCADE;

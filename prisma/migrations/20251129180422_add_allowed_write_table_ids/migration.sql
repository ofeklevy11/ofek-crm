-- AlterTable
ALTER TABLE "User" ADD COLUMN     "allowedWriteTableIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ALTER COLUMN "role" SET DEFAULT 'basic';

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL,
    "assignee" TEXT,
    "priority" TEXT,
    "dueDate" TIMESTAMP(3),
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

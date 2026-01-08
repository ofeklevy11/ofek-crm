/*
  Warnings:

  - You are about to drop the `TestCiCdPipieline` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "TestCiCdPipieline";

-- CreateTable
CREATE TABLE "TestCiCdPipeline2" (
    "id" SERIAL NOT NULL,

    CONSTRAINT "TestCiCdPipeline2_pkey" PRIMARY KEY ("id")
);

/*
  Warnings:

  - You are about to drop the `temporary_files` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "temporary_files" DROP CONSTRAINT "temporary_files_studentId_fkey";

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "fileId" UUID;

-- DropTable
DROP TABLE "temporary_files";

-- CreateTable
CREATE TABLE "files" (
    "fileId" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "studentId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "files_pkey" PRIMARY KEY ("fileId")
);

-- CreateIndex
CREATE INDEX "files_studentId_idx" ON "files"("studentId");

-- CreateIndex
CREATE INDEX "messages_fileId_idx" ON "messages"("fileId");

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "files"("fileId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("studentId") ON DELETE CASCADE ON UPDATE CASCADE;

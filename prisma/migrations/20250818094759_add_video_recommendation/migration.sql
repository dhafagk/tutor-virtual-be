-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "externalReferences" JSONB,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "model" TEXT,
ADD COLUMN     "usage" JSONB,

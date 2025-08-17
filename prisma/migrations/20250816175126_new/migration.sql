-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateTable
CREATE TABLE "users" (
    "userId" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'student',
    "loginStatus" BOOLEAN NOT NULL DEFAULT false,
    "loginDate" TIMESTAMP(3),
    "updateProfileData" JSONB,
    "validateCredentials" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "admin" (
    "adminId" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "userId" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "permissions" JSONB,
    "lastAccess" TIMESTAMP(3),

    CONSTRAINT "admin_pkey" PRIMARY KEY ("adminId")
);

-- CreateTable
CREATE TABLE "students" (
    "studentId" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "program" TEXT NOT NULL,
    "semester" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("studentId")
);

-- CreateTable
CREATE TABLE "courses" (
    "courseId" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "courseCode" TEXT NOT NULL,
    "courseName" TEXT NOT NULL,
    "description" TEXT,
    "objectives" TEXT,
    "competencies" TEXT,
    "prerequisites" TEXT,
    "topics" JSONB,
    "semester" INTEGER,
    "faculty" TEXT,
    "department" TEXT,
    "instructor" TEXT,
    "credits" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("courseId")
);

-- CreateTable
CREATE TABLE "contents" (
    "contentId" SERIAL NOT NULL,
    "courseId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "documentUrl" TEXT,
    "documentType" TEXT,
    "fileSize" INTEGER,
    "pageCount" INTEGER,
    "isProcessed" BOOLEAN NOT NULL DEFAULT false,
    "processingError" TEXT,
    "isGenerated" BOOLEAN NOT NULL DEFAULT false,
    "embeddings" vector(1536),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contents_pkey" PRIMARY KEY ("contentId")
);

-- CreateTable
CREATE TABLE "document_chunks" (
    "chunkId" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "contentId" INTEGER NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "tokenCount" INTEGER NOT NULL,
    "pageNumber" INTEGER,
    "embeddings" vector(1536),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_chunks_pkey" PRIMARY KEY ("chunkId")
);

-- CreateTable
CREATE TABLE "chat_sessions" (
    "sessionId" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "studentId" TEXT NOT NULL,
    "courseId" UUID NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "title" TEXT,
    "lastMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("sessionId")
);

-- CreateTable
CREATE TABLE "messages" (
    "messageId" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "sessionId" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "messageType" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isFromUser" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("messageId")
);

-- CreateTable
CREATE TABLE "references" (
    "referenceId" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "messageId" UUID NOT NULL,
    "chunkId" UUID,
    "title" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "url" TEXT,
    "type" TEXT,
    "similarity" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "references_pkey" PRIMARY KEY ("referenceId")
);

-- CreateTable
CREATE TABLE "temporary_files" (
    "fileId" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "studentId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "temporary_files_pkey" PRIMARY KEY ("fileId")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "admin_userId_key" ON "admin"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "students_userId_key" ON "students"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "courses_courseCode_key" ON "courses"("courseCode");

-- CreateIndex
CREATE INDEX "contents_courseId_idx" ON "contents"("courseId");

-- CreateIndex
CREATE INDEX "contents_isProcessed_idx" ON "contents"("isProcessed");

-- CreateIndex
CREATE INDEX "contents_isGenerated_idx" ON "contents"("isGenerated");

-- CreateIndex
CREATE INDEX "document_chunks_contentId_idx" ON "document_chunks"("contentId");

-- CreateIndex
CREATE INDEX "document_chunks_contentId_chunkIndex_idx" ON "document_chunks"("contentId", "chunkIndex");

-- CreateIndex
CREATE INDEX "chat_sessions_studentId_idx" ON "chat_sessions"("studentId");

-- CreateIndex
CREATE INDEX "chat_sessions_courseId_idx" ON "chat_sessions"("courseId");

-- CreateIndex
CREATE INDEX "messages_sessionId_idx" ON "messages"("sessionId");

-- CreateIndex
CREATE INDEX "messages_timestamp_idx" ON "messages"("timestamp");

-- CreateIndex
CREATE INDEX "references_messageId_idx" ON "references"("messageId");

-- CreateIndex
CREATE INDEX "references_chunkId_idx" ON "references"("chunkId");

-- CreateIndex
CREATE INDEX "temporary_files_studentId_idx" ON "temporary_files"("studentId");

-- CreateIndex
CREATE INDEX "temporary_files_expiresAt_idx" ON "temporary_files"("expiresAt");

-- AddForeignKey
ALTER TABLE "admin" ADD CONSTRAINT "admin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contents" ADD CONSTRAINT "contents_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("courseId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "contents"("contentId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("studentId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("courseId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "chat_sessions"("sessionId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "references" ADD CONSTRAINT "references_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("messageId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "references" ADD CONSTRAINT "references_chunkId_fkey" FOREIGN KEY ("chunkId") REFERENCES "document_chunks"("chunkId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "temporary_files" ADD CONSTRAINT "temporary_files_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("studentId") ON DELETE CASCADE ON UPDATE CASCADE;

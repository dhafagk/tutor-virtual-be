import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import {
  processDocument,
  processAllCourseDocuments,
} from "../services/ragService.js";
import {
  successResponse,
  errorResponse,
  validationErrorResponse,
  paginatedResponse,
  HTTP_STATUS,
  SUCCESS_MESSAGES,
  ERROR_MESSAGES,
} from "../utils/apiResponse.js";

// Dashboard Stats
export const getDashboardStats = asyncHandler(async (req, res) => {
  const [
    totalUsers,
    totalStudents,
    totalCourses,
    totalSessions,
    activeSessions,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.student.count(),
    prisma.course.count({ where: { isActive: true } }),
    prisma.chatSession.count(),
  ]);

  const recentSessions = await prisma.chatSession.findMany({
    take: 5,
    orderBy: { startTime: "desc" },
    include: {
      student: true,
      course: true,
      _count: { select: { messages: true } },
    },
  });

  return successResponse(res, HTTP_STATUS.OK, SUCCESS_MESSAGES.RETRIEVED, {
    stats: {
      totalUsers,
      totalStudents,
      totalCourses,
      totalSessions,
      activeSessions,
    },
    recentSessions,
  });
});

// Course Management
export const getCourses = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, search } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const where = search
    ? {
        OR: [
          { courseCode: { contains: search, mode: "insensitive" } },
          { courseName: { contains: search, mode: "insensitive" } },
        ],
      }
    : {};

  const [courses, totalCount] = await Promise.all([
    prisma.course.findMany({
      where,
      include: {
        _count: {
          select: {
            contents: true,
            chatSessions: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: parseInt(limit),
    }),
    prisma.course.count({ where }),
  ]);

  return paginatedResponse(res, courses, {
    page: parseInt(page),
    limit: parseInt(limit),
    total: totalCount,
  });
});

export const createCourse = asyncHandler(async (req, res) => {
  const { courseCode, courseName, description, credits, instructor } = req.body;

  const course = await prisma.course.create({
    data: {
      courseCode,
      courseName,
      description,
      credits,
      instructor,
    },
  });

  return successResponse(
    res,
    HTTP_STATUS.CREATED,
    SUCCESS_MESSAGES.CREATED,
    course
  );
});

export const updateCourse = asyncHandler(async (req, res) => {
  const { courseId } = req.params;
  const { courseName, description, credits, isActive, instructor } = req.body;

  const course = await prisma.course.update({
    where: { courseId },
    data: {
      ...(courseName && { courseName }),
      ...(description !== undefined && { description }),
      ...(credits && { credits }),
      ...(instructor !== undefined && { instructor }),
      ...(isActive !== undefined && { isActive }),
    },
  });

  return successResponse(res, HTTP_STATUS.OK, SUCCESS_MESSAGES.UPDATED, course);
});

export const deleteCourse = asyncHandler(async (req, res) => {
  const { courseId } = req.params;

  await prisma.course.delete({
    where: { courseId },
  });

  return successResponse(res, HTTP_STATUS.OK, SUCCESS_MESSAGES.DELETED);
});

// Content Management
export const getCourseContent = asyncHandler(async (req, res) => {
  const { courseId } = req.params;
  const { page = 1, limit = 20 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [contents, totalCount] = await Promise.all([
    prisma.content.findMany({
      where: { courseId },
      orderBy: { createdAt: "desc" },
      skip,
      take: parseInt(limit),
    }),
    prisma.content.count({ where: { courseId } }),
  ]);

  return paginatedResponse(res, contents, {
    page: parseInt(page),
    limit: parseInt(limit),
    total: totalCount,
  });
});

export const addContent = asyncHandler(async (req, res) => {
  const { courseId, title, description, documentUrl } = req.body;

  const content = await prisma.content.create({
    data: {
      courseId,
      title,
      description,
      documentUrl,
    },
  });

  return successResponse(res, HTTP_STATUS.CREATED, SUCCESS_MESSAGES.CREATED, {
    contentId: content.contentId,
    courseId: content.courseId,
    title: content.title,
    description: content.description,
    documentUrl: content.documentUrl,
    createdAt: content.createdAt,
  });
});

export const updateContent = asyncHandler(async (req, res) => {
  const { contentId } = req.params;
  const { title, description, documentUrl } = req.body;

  const content = await prisma.content.update({
    where: { contentId: parseInt(contentId) },
    data: { title, description, documentUrl },
  });

  return successResponse(
    res,
    HTTP_STATUS.OK,
    SUCCESS_MESSAGES.UPDATED,
    content
  );
});

export const deleteContent = asyncHandler(async (req, res) => {
  const { contentId } = req.params;

  await prisma.content.delete({
    where: { contentId: parseInt(contentId) },
  });

  return successResponse(res, HTTP_STATUS.OK, SUCCESS_MESSAGES.DELETED);
});

// Upload document and create content
export const uploadDocument = asyncHandler(async (req, res) => {
  const { courseId } = req.params;
  const { title, description } = req.body;

  if (!req.file) {
    return errorResponse(res, HTTP_STATUS.BAD_REQUEST, "No file uploaded");
  }

  // Verify course exists
  const course = await prisma.course.findUnique({
    where: { courseId },
  });

  if (!course) {
    return errorResponse(res, HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND);
  }

  // Create content with uploaded document
  const content = await prisma.content.create({
    data: {
      courseId,
      title: title || req.file.originalname,
      description: description || `Uploaded document: ${req.file.originalname}`,
      documentUrl: `/uploads/documents/${req.file.filename}`,
    },
  });

  return successResponse(
    res,
    HTTP_STATUS.CREATED,
    "Document uploaded and content created successfully",
    {
      content: {
        contentId: content.contentId,
        courseId: content.courseId,
        title: content.title,
        description: content.description,
        documentUrl: content.documentUrl,
        createdAt: content.createdAt,
      },
      file: {
        originalName: req.file.originalname,
        filename: req.file.filename,
        size: req.file.size,
        mimetype: req.file.mimetype,
      },
    }
  );
});

// User Management
export const getUsers = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, search } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const where = search
    ? {
        OR: [
          { username: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
        ],
      }
    : {};

  const [users, totalCount] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        userId: true,
        username: true,
        email: true,
        loginStatus: true,
        loginDate: true,
        createdAt: true,
        admin: {
          select: {
            adminId: true,
            role: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: parseInt(limit),
    }),
    prisma.user.count({ where }),
  ]);

  return paginatedResponse(res, users, {
    page: parseInt(page),
    limit: parseInt(limit),
    total: totalCount,
  });
});

// Student Management
export const getStudents = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, search } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const where = search
    ? {
        OR: [
          { studentId: { contains: search, mode: "insensitive" } },
          { name: { contains: search, mode: "insensitive" } },
          { program: { contains: search, mode: "insensitive" } },
        ],
      }
    : {};

  const [students, totalCount] = await Promise.all([
    prisma.student.findMany({
      where,
      include: {
        _count: {
          select: { chatSessions: true },
        },
      },
      orderBy: { name: "asc" },
      skip,
      take: parseInt(limit),
    }),
    prisma.student.count({ where }),
  ]);

  return paginatedResponse(res, students, {
    page: parseInt(page),
    limit: parseInt(limit),
    total: totalCount,
  });
});

export const createStudent = asyncHandler(async (req, res) => {
  const { studentId, name, program, semester } = req.body;

  const student = await prisma.student.create({
    data: {
      studentId,
      name,
      program,
      semester,
    },
  });

  return successResponse(
    res,
    HTTP_STATUS.CREATED,
    SUCCESS_MESSAGES.CREATED,
    student
  );
});

export const updateStudent = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  const { name, program, semester } = req.body;

  const student = await prisma.student.update({
    where: { studentId },
    data: {
      ...(name && { name }),
      ...(program && { program }),
      ...(semester && { semester }),
    },
  });

  return successResponse(
    res,
    HTTP_STATUS.OK,
    SUCCESS_MESSAGES.UPDATED,
    student
  );
});

export const deleteStudent = asyncHandler(async (req, res) => {
  const { studentId } = req.params;

  await prisma.student.delete({
    where: { studentId },
  });

  return successResponse(res, HTTP_STATUS.OK, SUCCESS_MESSAGES.DELETED);
});

// Analytics
export const getSessionAnalytics = asyncHandler(async (req, res) => {
  const { startDate, endDate, courseId } = req.query;

  const where = {
    ...(startDate && { startTime: { gte: new Date(startDate) } }),
    ...(endDate && { startTime: { lte: new Date(endDate) } }),
    ...(courseId && { courseId }),
  };

  const sessions = await prisma.chatSession.findMany({
    where,
    include: {
      student: true,
      courses: true,
      _count: {
        select: { messages: true },
      },
    },
    orderBy: { startTime: "desc" },
  });

  // Calculate analytics
  const analytics = {
    totalSessions: sessions.length,
    averageMessagesPerSession:
      sessions.reduce((acc, s) => acc + s._count.messages, 0) /
        sessions.length || 0,
    sessionsByStudent: sessions.reduce((acc, s) => {
      acc[s.student.name] = (acc[s.student.name] || 0) + 1;
      return acc;
    }, {}),
    sessionsByCourse: sessions.reduce((acc, s) => {
      acc[s.course.courseName] = (acc[s.course.courseName] || 0) + 1;
      return acc;
    }, {}),
  };

  return successResponse(res, HTTP_STATUS.OK, SUCCESS_MESSAGES.RETRIEVED, {
    analytics,
    sessions: sessions.slice(0, 20), // Return first 20 sessions
  });
});

// Document Processing Functions

// Process a single document
export const processDocumentContent = asyncHandler(async (req, res) => {
  const { contentId } = req.params;

  try {
    const result = await processDocument(parseInt(contentId));
    return successResponse(
      res,
      HTTP_STATUS.OK,
      "Document processed successfully",
      result
    );
  } catch (error) {
    return errorResponse(
      res,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      "Error processing document",
      "PROCESSING_ERROR",
      error.message
    );
  }
});

// Process all documents for a course
export const processCourseDocuments = asyncHandler(async (req, res) => {
  const { courseId } = req.params;

  try {
    const results = await processAllCourseDocuments(courseId);

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return successResponse(
      res,
      HTTP_STATUS.OK,
      `Processing completed: ${successful} successful, ${failed} failed`,
      results
    );
  } catch (error) {
    return errorResponse(
      res,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      "Error processing course documents",
      "PROCESSING_ERROR",
      error.message
    );
  }
});

// Get document processing status
export const getDocumentStatus = asyncHandler(async (req, res) => {
  const { courseId } = req.params;

  const documents = await prisma.content.findMany({
    where: {
      courseId,
      documentUrl: { not: null },
    },
    include: {
      chunks: {
        select: {
          chunkId: true,
          tokenCount: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const status = documents.map((doc) => ({
    contentId: doc.contentId,
    title: doc.title,
    documentType: doc.documentType,
    fileSize: doc.fileSize,
    pageCount: doc.pageCount,
    isProcessed: doc.isProcessed,
    processingError: doc.processingError,
    chunksCount: doc.chunks.length,
    totalTokens: doc.chunks.reduce(
      (sum, chunk) => sum + (chunk.tokenCount || 0),
      0
    ),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }));

  const summary = {
    totalDocuments: documents.length,
    processedDocuments: documents.filter((d) => d.isProcessed).length,
    failedDocuments: documents.filter((d) => d.processingError).length,
    totalChunks: documents.reduce((sum, doc) => sum + doc.chunks.length, 0),
  };

  return successResponse(res, HTTP_STATUS.OK, SUCCESS_MESSAGES.RETRIEVED, {
    summary,
    documents: status,
  });
});

// Reprocess failed documents
export const reprocessFailedDocuments = asyncHandler(async (req, res) => {
  const { courseId } = req.params;

  const failedDocuments = await prisma.content.findMany({
    where: {
      courseId,
      documentUrl: { not: null },
      OR: [{ processingError: { not: null } }, { isProcessed: false }],
    },
  });

  const results = [];
  for (const doc of failedDocuments) {
    try {
      // Clear previous error
      await prisma.content.update({
        where: { contentId: doc.contentId },
        data: { processingError: null },
      });

      const result = await processDocument(doc.contentId);
      results.push({ contentId: doc.contentId, ...result });
    } catch (error) {
      results.push({
        contentId: doc.contentId,
        success: false,
        error: error.message,
      });
    }
  }

  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  return successResponse(
    res,
    HTTP_STATUS.OK,
    `Reprocessing completed: ${successful} successful, ${failed} failed`,
    results
  );
});

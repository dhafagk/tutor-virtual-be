import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import {
  processDocument,
  processAllCourseDocuments,
} from "../services/ragService.js";
import {
  generateCourseFields,
  generateCourseContent,
} from "../services/courseGenerationService.js";
import {
  successResponse,
  errorResponse,
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

export const getCourseById = asyncHandler(async (req, res) => {
  const { courseId } = req.params;

  const course = await prisma.course.findUnique({
    where: { courseId },
    include: {
      _count: {
        select: {
          contents: true,
          chatSessions: true,
        },
      },
    },
  });

  if (!course) {
    return errorResponse(res, HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND);
  }

  return successResponse(
    res,
    HTTP_STATUS.OK,
    SUCCESS_MESSAGES.RETRIEVED,
    course
  );
});

export const generateCourseFieldsOnly = asyncHandler(async (req, res) => {
  const { courseName, courseId } = req.body;

  if (!courseName) {
    return errorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "Course name is required"
    );
  }

  if (!courseId) {
    return errorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "Course ID is required for auto-save"
    );
  }

  try {
    // Verify course exists
    const existingCourse = await prisma.course.findUnique({
      where: { courseId },
    });

    if (!existingCourse) {
      return errorResponse(res, HTTP_STATUS.NOT_FOUND, "Course not found");
    }

    const result = await generateCourseFields(courseName);

    if (!result.success) {
      return errorResponse(
        res,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        result.error || "Failed to generate course fields"
      );
    }

    // Update existing course with generated fields
    const updatedCourse = await prisma.course.update({
      where: { courseId },
      data: {
        description: result.data.description,
        objectives: result.data.objectives,
        competencies: result.data.competencies,
        prerequisites: result.data.prerequisites,
        topics: result.data.topics, // Already JSON stringified
      },
    });

    return successResponse(
      res,
      HTTP_STATUS.OK,
      "Course fields generated and updated successfully",
      {
        course: updatedCourse,
        generation: {
          ...result.data,
          generatedAt: new Date(),
        },
      }
    );
  } catch (error) {
    console.error("Course fields generation error:", error);
    return errorResponse(
      res,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      "Failed to generate and update course fields",
      "GENERATION_ERROR",
      error.message
    );
  }
});

export const generateCourseContentOnly = asyncHandler(async (req, res) => {
  const { courseName, courseId } = req.body;

  if (!courseName) {
    return errorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "Course name is required"
    );
  }

  if (!courseId) {
    return errorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "Course ID is required for auto-save"
    );
  }

  try {
    // Verify course exists
    const course = await prisma.course.findUnique({
      where: { courseId },
    });

    if (!course) {
      return errorResponse(res, HTTP_STATUS.NOT_FOUND, "Course not found");
    }

    const result = await generateCourseContent(courseName);

    if (!result.success) {
      return errorResponse(
        res,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        result.error || "Failed to generate course content"
      );
    }

    // Auto-save generated content to database
    const savedContents = await prisma.$transaction(async (tx) => {
      const createdContents = [];

      for (const contentData of result.data.contentList) {
        const content = await tx.content.create({
          data: {
            courseId,
            title: contentData.title,
            description: contentData.description,
            documentUrl: contentData.documentUrl || null,
            documentType: contentData.documentType || null,
            isGenerated: true,
          },
        });
        createdContents.push(content);
      }

      return createdContents;
    });

    const summary = {
      totalContentSuggestions: result.data.contentList.length,
      totalSaved: savedContents.length,
      contentTypes: result.data.contentList.reduce((acc, content) => {
        const type = content.documentType || "unknown";
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {}),
    };

    return successResponse(
      res,
      HTTP_STATUS.CREATED,
      "Course content generated and saved successfully",
      {
        course: {
          courseId: course.courseId,
          courseName: course.courseName,
        },
        savedContents,
        generation: {
          ...result.data,
          generatedAt: new Date(),
        },
        summary,
      }
    );
  } catch (error) {
    console.error("Course content generation error:", error);
    return errorResponse(
      res,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      "Failed to generate and save course content",
      "GENERATION_ERROR",
      error.message
    );
  }
});

export const createCourse = asyncHandler(async (req, res) => {
  const {
    courseCode,
    courseName,
    description,
    credits,
    instructor,
    objectives,
    competencies,
    prerequisites,
    topics,
    semester,
    faculty,
    department,
  } = req.body;

  const course = await prisma.course.create({
    data: {
      courseCode,
      courseName,
      description,
      credits,
      instructor,
      objectives,
      competencies,
      prerequisites,
      topics,
      semester,
      faculty,
      department,
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

// Bulk content operations
export const bulkCreateContent = asyncHandler(async (req, res) => {
  const { contents } = req.body;

  if (!Array.isArray(contents) || contents.length === 0) {
    return errorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "Contents array is required and must not be empty"
    );
  }

  // Validate each content item
  for (const [index, content] of contents.entries()) {
    if (!content.courseId || !content.title) {
      return errorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        `Content item at index ${index} is missing required fields: courseId and title`
      );
    }
  }

  try {
    // Verify all courses exist
    const courseIds = [...new Set(contents.map((c) => c.courseId))];
    const existingCourses = await prisma.course.findMany({
      where: { courseId: { in: courseIds } },
      select: { courseId: true },
    });

    const existingCourseIds = new Set(existingCourses.map((c) => c.courseId));
    const missingCourseIds = courseIds.filter(
      (id) => !existingCourseIds.has(id)
    );

    if (missingCourseIds.length > 0) {
      return errorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        `Courses not found: ${missingCourseIds.join(", ")}`
      );
    }

    // Create all content in a transaction
    const createdContents = await prisma.$transaction(async (tx) => {
      const results = [];

      for (const contentData of contents) {
        const content = await tx.content.create({
          data: {
            courseId: contentData.courseId,
            title: contentData.title,
            description: contentData.description || null,
            documentUrl: contentData.documentUrl || null,
            documentType: contentData.documentType || null,
            isGenerated: contentData.isGenerated || false,
          },
        });
        results.push(content);
      }

      return results;
    });

    return successResponse(
      res,
      HTTP_STATUS.CREATED,
      "Bulk content created successfully",
      {
        createdContents,
        summary: {
          totalCreated: createdContents.length,
          courseDistribution: createdContents.reduce((acc, content) => {
            acc[content.courseId] = (acc[content.courseId] || 0) + 1;
            return acc;
          }, {}),
          contentTypes: createdContents.reduce((acc, content) => {
            const type = content.documentType || "unknown";
            acc[type] = (acc[type] || 0) + 1;
            return acc;
          }, {}),
        },
      }
    );
  } catch (error) {
    console.error("Bulk content creation error:", error);
    return errorResponse(
      res,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      "Failed to create content in bulk",
      "BULK_CREATE_ERROR",
      error.message
    );
  }
});

export const bulkUpdateContent = asyncHandler(async (req, res) => {
  const { updates } = req.body;

  if (!Array.isArray(updates) || updates.length === 0) {
    return errorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "Updates array is required and must not be empty"
    );
  }

  // Validate each update item
  for (const [index, update] of updates.entries()) {
    if (!update.contentId) {
      return errorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        `Update item at index ${index} is missing required field: contentId`
      );
    }
  }

  try {
    // Verify all content items exist
    const contentIds = updates.map((u) => u.contentId);
    const existingContents = await prisma.content.findMany({
      where: { contentId: { in: contentIds } },
      select: { contentId: true },
    });

    const existingContentIds = new Set(
      existingContents.map((c) => c.contentId)
    );
    const missingContentIds = contentIds.filter(
      (id) => !existingContentIds.has(id)
    );

    if (missingContentIds.length > 0) {
      return errorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        `Content items not found: ${missingContentIds.join(", ")}`
      );
    }

    // Update all content in a transaction
    const updatedContents = await prisma.$transaction(async (tx) => {
      const results = [];

      for (const updateData of updates) {
        const { contentId, ...updateFields } = updateData;

        // Only include fields that are provided and not undefined
        const dataToUpdate = {};
        if (updateFields.title !== undefined)
          dataToUpdate.title = updateFields.title;
        if (updateFields.description !== undefined)
          dataToUpdate.description = updateFields.description;
        if (updateFields.documentUrl !== undefined)
          dataToUpdate.documentUrl = updateFields.documentUrl;
        if (updateFields.documentType !== undefined)
          dataToUpdate.documentType = updateFields.documentType;
        if (updateFields.isGenerated !== undefined)
          dataToUpdate.isGenerated = updateFields.isGenerated;

        const content = await tx.content.update({
          where: { contentId: parseInt(contentId) },
          data: dataToUpdate,
        });
        results.push(content);
      }

      return results;
    });

    return successResponse(
      res,
      HTTP_STATUS.OK,
      "Bulk content updated successfully",
      {
        updatedContents,
        summary: {
          totalUpdated: updatedContents.length,
          courseDistribution: updatedContents.reduce((acc, content) => {
            acc[content.courseId] = (acc[content.courseId] || 0) + 1;
            return acc;
          }, {}),
        },
      }
    );
  } catch (error) {
    console.error("Bulk content update error:", error);
    return errorResponse(
      res,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      "Failed to update content in bulk",
      "BULK_UPDATE_ERROR",
      error.message
    );
  }
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
      course: true,
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

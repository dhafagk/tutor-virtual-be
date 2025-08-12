import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import {
  successResponse,
  errorResponse,
  validationErrorResponse,
  paginatedResponse,
  HTTP_STATUS,
  SUCCESS_MESSAGES,
  ERROR_MESSAGES,
} from "../utils/apiResponse.js";

// Get student's own profile
export const getStudentProfile = asyncHandler(async (req, res) => {
  const student = await prisma.student.findUnique({
    where: { userId: req.user.userId },
    include: {
      user: {
        select: {
          userId: true,
          username: true,
          email: true,
          loginDate: true,
          createdAt: true,
        },
      },
      _count: {
        select: { chatSessions: true },
      },
    },
  });

  if (!student) {
    return errorResponse(res, HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND);
  }

  return successResponse(res, HTTP_STATUS.OK, SUCCESS_MESSAGES.RETRIEVED, {
    student,
  });
});

// Update student's own profile
export const updateStudentProfile = asyncHandler(async (req, res) => {
  const { name, program, semester } = req.body;

  const student = await prisma.student.update({
    where: { userId: req.user.userId },
    data: {
      ...(name && { name }),
      ...(program && { program }),
      ...(semester && { semester }),
    },
    include: {
      user: {
        select: {
          username: true,
          email: true,
        },
      },
    },
  });

  return successResponse(res, HTTP_STATUS.OK, SUCCESS_MESSAGES.UPDATED, {
    student,
  });
});

// Get available courses for student
export const getAvailableCourses = asyncHandler(async (req, res) => {
  const courses = await prisma.course.findMany({
    where: { isActive: true },
    select: {
      courseId: true,
      courseCode: true,
      courseName: true,
      description: true,
      credits: true,
      semester: true,
      faculty: true,
      department: true,
      instructor: true,
      _count: {
        select: {
          contents: true,
          chatSessions: true,
        },
      },
    },
    orderBy: { courseName: "asc" },
  });

  return successResponse(res, HTTP_STATUS.OK, SUCCESS_MESSAGES.RETRIEVED, {
    courses,
  });
});

// Get detailed course information
export const getCourseDetail = asyncHandler(async (req, res) => {
  const { courseId } = req.params;

  const course = await prisma.course.findUnique({
    where: {
      courseId,
      isActive: true,
    },
    include: {
      contents: {
        select: {
          contentId: true,
          title: true,
          description: true,
          documentUrl: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      },
      _count: {
        select: {
          contents: true,
          chatSessions: true,
        },
      },
    },
  });

  if (!course) {
    return errorResponse(res, HTTP_STATUS.NOT_FOUND, "Course not found");
  }

  // Format the response with comprehensive course details
  const courseDetail = {
    courseId: course.courseId,
    courseCode: course.courseCode,
    courseName: course.courseName,
    description: course.description,

    // Course Information
    info: {
      credits: course.credits,
      semester: course.semester,
      faculty: course.faculty,
      department: course.department,
      instructor: course.instructor,
    },

    // Academic Details
    academic: {
      objectives: course.objectives,
      competencies: course.competencies,
      prerequisites: course.prerequisites,
      teachingMethods: course.teachingMethods,
      evaluation: course.evaluation,
      references: course.references,
      topics: course.topics,
    },

    // Content and Activity
    content: {
      materials: course.contents,
      totalContent: course._count.contents,
      totalSessions: course._count.chatSessions,
    },

    createdAt: course.createdAt,
    updatedAt: course.updatedAt,
  };

  return successResponse(res, HTTP_STATUS.OK, SUCCESS_MESSAGES.RETRIEVED, {
    course: courseDetail,
  });
});

// Get student's chat sessions
export const getStudentSessions = asyncHandler(async (req, res) => {
  const { courseId, page = 1, limit = 20 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const where = {
    studentId: req.student.studentId,
    ...(courseId && { courseId }),
  };

  const [sessions, totalCount] = await Promise.all([
    prisma.chatSession.findMany({
      where,
      include: {
        course: {
          select: {
            courseId: true,
            courseCode: true,
            courseName: true,
          },
        },
        _count: {
          select: { messages: true },
        },
      },
      orderBy: { startTime: "desc" },
      skip,
      take: parseInt(limit),
    }),
    prisma.chatSession.count({ where }),
  ]);

  return paginatedResponse(
    res,
    { sessions },
    {
      page: parseInt(page),
      limit: parseInt(limit),
      total: totalCount,
    },
    SUCCESS_MESSAGES.RETRIEVED
  );
});

// Get specific session details for student
export const getStudentSession = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;

  const session = await prisma.chatSession.findFirst({
    where: {
      sessionId,
      studentId: req.student.studentId, // Ensure student can only access their own sessions
    },
    include: {
      course: {
        select: {
          courseId: true,
          courseCode: true,
          courseName: true,
          description: true,
        },
      },
      messages: {
        include: {
          references: true,
        },
        orderBy: { timestamp: "asc" },
      },
    },
  });

  if (!session) {
    return errorResponse(res, HTTP_STATUS.NOT_FOUND, "Session not found");
  }

  return successResponse(res, HTTP_STATUS.OK, SUCCESS_MESSAGES.RETRIEVED, {
    session,
  });
});

// Get course materials/documents for a course
export const getCourseDocuments = asyncHandler(async (req, res) => {
  const { courseId } = req.params;
  const { page = 1, limit = 10, search } = req.query;

  const skip = (parseInt(page) - 1) * parseInt(limit);

  // Build search filter
  const where = {
    courseId,
    ...(search && {
      body: {
        contains: search,
        mode: "insensitive",
      },
    }),
  };

  const [documents, totalCount] = await Promise.all([
    prisma.content.findMany({
      where,
      select: {
        contentId: true,
        title: true,
        description: true,
        documentUrl: true,
        fileSize: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "asc" },
      skip,
      take: parseInt(limit),
    }),
    prisma.content.count({ where }),
  ]);

  // Format documents with preview
  const formattedDocuments = documents.map((doc) => ({
    contentId: doc.contentId,
    title: doc.title,
    description: doc.description,
    documentType: doc.documentType,
    documentUrl: doc.documentUrl,
    fileSize: doc.fileSize,
    preview: doc.description
      ? doc.description.substring(0, 200) +
        (doc.description.length > 200 ? "..." : "")
      : "No description available",
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }));

  return paginatedResponse(
    res,
    { documents: formattedDocuments },
    {
      page: parseInt(page),
      limit: parseInt(limit),
      total: totalCount,
    },
    SUCCESS_MESSAGES.RETRIEVED
  );
});

// Search for specific documents based on query
export const searchCourseDocuments = asyncHandler(async (req, res) => {
  const { courseId } = req.params;
  const { query, limit = 5 } = req.query;

  if (!query) {
    return errorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "Search query is required"
    );
  }

  // Simple search through content titles and descriptions
  const searchTerms = query.toLowerCase().split(" ");

  const documents = await prisma.content.findMany({
    where: {
      courseId,
      OR: [
        {
          title: {
            contains: query,
            mode: "insensitive",
          },
        },
        {
          description: {
            contains: query,
            mode: "insensitive",
          },
        },
      ],
    },
    select: {
      contentId: true,
      title: true,
      description: true,
      documentUrl: true,
      createdAt: true,
    },
    take: parseInt(limit),
    orderBy: { createdAt: "desc" },
  });

  // Calculate simple relevance score based on term matches
  const formattedResults = documents.map((doc) => {
    let relevanceScore = 0;
    const titleLower = (doc.title || "").toLowerCase();
    const descLower = (doc.description || "").toLowerCase();

    searchTerms.forEach((term) => {
      if (titleLower.includes(term)) relevanceScore += 2;
      if (descLower.includes(term)) relevanceScore += 1;
    });

    return {
      contentId: doc.contentId,
      title: doc.title,
      description: doc.description,
      documentUrl: doc.documentUrl,
      preview: doc.description
        ? doc.description.substring(0, 200) +
          (doc.description.length > 200 ? "..." : "")
        : "No description available",
      relevanceScore,
      createdAt: doc.createdAt,
    };
  });

  // Sort by relevance score
  formattedResults.sort((a, b) => b.relevanceScore - a.relevanceScore);

  return successResponse(res, HTTP_STATUS.OK, SUCCESS_MESSAGES.RETRIEVED, {
    query,
    results: formattedResults,
    totalFound: formattedResults.length,
  });
});

// Delete student's chat session with all related messages and references
export const deleteStudentSession = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;

  // First, verify the session exists and belongs to the authenticated student
  const session = await prisma.chatSession.findFirst({
    where: {
      sessionId,
      studentId: req.student.studentId,
    },
    include: {
      _count: {
        select: {
          messages: true,
        },
      },
    },
  });

  if (!session) {
    return errorResponse(res, HTTP_STATUS.NOT_FOUND, "Session not found");
  }

  // Delete the session and all related data (cascade deletes will handle messages and references)
  await prisma.chatSession.delete({
    where: { sessionId },
  });

  return successResponse(res, HTTP_STATUS.OK, SUCCESS_MESSAGES.DELETED, {
    deletedSession: {
      sessionId: session.sessionId,
      messageCount: session._count.messages,
      deletedAt: new Date(),
    },
  });
});

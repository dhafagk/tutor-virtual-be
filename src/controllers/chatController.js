import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import {
  getChatResponseWithContext,
  processAllCourseDocuments,
} from "../services/ragService.js";
import { getTemporaryFile } from "../services/supabaseStorageService.js";
import { generateSessionTitle } from "../services/titleGenerationService.js";
import {
  successResponse,
  errorResponse,
  validationErrorResponse,
  paginatedResponse,
  HTTP_STATUS,
  SUCCESS_MESSAGES,
  ERROR_MESSAGES,
} from "../utils/apiResponse.js";

// Helper function to ensure course documents are processed for RAG
const ensureCourseDocumentsProcessed = async (
  courseId,
  waitForCompletion = false
) => {
  try {
    // Check if there are unprocessed documents for this course
    const unprocessedDocuments = await prisma.content.findMany({
      where: {
        courseId,
        documentUrl: { not: null },
        isProcessed: false,
      },
      select: {
        contentId: true,
        title: true,
        documentUrl: true,
      },
    });

    if (unprocessedDocuments.length > 0) {
      console.log(
        `Found ${unprocessedDocuments.length} unprocessed documents for course ${courseId}`
      );

      if (waitForCompletion) {
        // Process documents synchronously and wait for completion
        console.log(
          `Processing documents synchronously for course ${courseId}...`
        );
        const results = await processAllCourseDocuments(courseId);
        console.log(
          `Completed processing ${results.length} documents for course ${courseId}`
        );
        return results;
      } else {
        // Process all unprocessed documents in the background
        // Note: In production, you might want to use a job queue for this
        processAllCourseDocuments(courseId).catch((error) => {
          console.error(
            `Error processing course documents for ${courseId}:`,
            error
          );
        });

        console.log(
          `Started processing documents for course ${courseId} in background`
        );
      }
    } else {
      console.log(`All documents already processed for course ${courseId}`);
    }
  } catch (error) {
    console.error(`Error checking course documents for ${courseId}:`, error);
  }
};

// Helper function to create or get chat session
const getOrCreateSession = async (studentId, courseId, sessionId = null) => {
  if (sessionId) {
    const session = await prisma.chatSession.findFirst({
      where: {
        sessionId,
        studentId: studentId,
        courseId: courseId, // Ensure session belongs to the specified course
      },
    });
    if (session) return session;
  }

  // Create new session for the specific course
  return await prisma.chatSession.create({
    data: {
      studentId: studentId,
      courseId: courseId,
    },
  });
};

/**
 * Update an existing session with title and last message
 * This function should be called after a successful message exchange
 * @param {string} sessionId - The session ID to update
 * @param {string} title - The generated title (optional, only for first message)
 * @param {string} lastMessage - The last message sent by the student
 * @returns {Promise<object>} - Updated session object
 */
const updateSessionInfo = async (sessionId, title = null, lastMessage) => {
  try {
    const updateData = {
      lastMessage,
      updatedAt: new Date(),
    };

    // Only update title if provided (typically for first message)
    if (title) {
      updateData.title = title;
    }

    // Import prisma here to avoid circular imports
    const updatedSession = await prisma.chatSession.update({
      where: { sessionId },
      data: updateData,
    });

    return updatedSession;
  } catch (error) {
    console.error("Error updating session info:", error);
    throw error;
  }
};

// Start a new chat session for a specific course
export const startCourseChat = asyncHandler(async (req, res) => {
  const { courseId } = req.body;

  // Get student info from authenticated user
  if (!req.student) {
    return errorResponse(res, HTTP_STATUS.FORBIDDEN, "Student access required");
  }

  const studentId = req.student.studentId;

  // Verify course exists and is active
  const course = await prisma.course.findUnique({
    where: {
      courseId,
      isActive: true,
    },
    select: {
      courseId: true,
      courseCode: true,
      courseName: true,
      description: true,
    },
  });

  if (!course) {
    return errorResponse(
      res,
      HTTP_STATUS.NOT_FOUND,
      "Course not found or inactive"
    );
  }

  // Ensure course documents are processed for RAG before starting session
  await ensureCourseDocumentsProcessed(courseId);

  // Create new session for this course
  const session = await prisma.chatSession.create({
    data: {
      studentId: studentId,
      courseId: courseId,
    },
  });

  return successResponse(
    res,
    HTTP_STATUS.CREATED,
    "Chat session started successfully",
    {
      sessionId: session.sessionId,
      course: course,
      title: session.title,
      lastMessage: session.lastMessage,
      startTime: session.startTime,
    }
  );
});

export const sendMessage = asyncHandler(async (req, res) => {
  const { message, sessionId, courseId, fileIds } = req.body;

  // Get student info from authenticated user
  if (!req.student) {
    return errorResponse(res, HTTP_STATUS.FORBIDDEN, "Student access required");
  }

  const studentId = req.student.studentId;

  // Handle staged file IDs
  let fileContext = null;
  if (fileIds && Array.isArray(fileIds) && fileIds.length > 0) {
    // Support only one file per message
    const fileId = fileIds[0];

    try {
      const fileData = await getTemporaryFile(fileId, studentId);
      fileContext = {
        buffer: fileData.buffer,
        mimeType: fileData.mimeType,
        originalName: fileData.originalName,
        size: fileData.fileSize,
      };

      const isImage = fileData.mimeType.startsWith("image/");
      const fileType = isImage ? "Image" : "Document";
      const icon = isImage ? "🖼️" : "📄";

      console.log(
        `${icon} ${fileType} from staging: ${fileData.originalName} (${
          fileData.mimeType
        }, ${(fileData.fileSize / 1024 / 1024).toFixed(2)} MB)`
      );
    } catch (error) {
      console.error("Error retrieving staged file:", error);
      return errorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        "Failed to retrieve uploaded file. File may have expired or been removed.",
        "FILE_RETRIEVAL_ERROR",
        { fileId }
      );
    }
  }

  // Verify course exists and is active
  const course = await prisma.course.findUnique({
    where: {
      courseId,
      isActive: true,
    },
  });

  if (!course) {
    return errorResponse(
      res,
      HTTP_STATUS.NOT_FOUND,
      "Course not found or inactive"
    );
  }

  // Get or create session for this specific course
  const session = await getOrCreateSession(studentId, courseId, sessionId);

  // Check if this is the first message in the session
  const messageCount = await prisma.message.count({
    where: { sessionId: session.sessionId },
  });

  const isFirstMessage = messageCount === 0;

  // Ensure course documents are processed for RAG before processing message
  // Wait for completion on first message to ensure RAG context is available
  await ensureCourseDocumentsProcessed(courseId, isFirstMessage);

  let userMessage;
  let assistantMessage;

  try {
    // Get AI response using RAG (Retrieval-Augmented Generation) with optional file context
    const aiResponse = await getChatResponseWithContext(
      message,
      courseId,
      course.courseName,
      session.sessionId,
      fileContext
    );

    const assistantResponse = aiResponse.content;

    // Only save messages to database if AI response is successful
    userMessage = await prisma.message.create({
      data: {
        sessionId: session.sessionId,
        content: message,
        messageType: "text",
        isFromUser: true,
      },
    });

    // Save assistant message
    assistantMessage = await prisma.message.create({
      data: {
        sessionId: session.sessionId,
        content: assistantResponse,
        messageType: "text",
        isFromUser: false,
      },
    });

    // Save references to database if any exist
    if (
      aiResponse.referencedDocuments &&
      aiResponse.referencedDocuments.length > 0
    ) {
      const referencePromises = aiResponse.referencedDocuments.map((doc) =>
        prisma.reference.create({
          data: {
            messageId: assistantMessage.messageId,
            chunkId: doc.chunkId || null,
            title: doc.title,
            source: doc.title,
            url: doc.url || null,
            type: "document",
            similarity: doc.similarity || null,
          },
        })
      );

      await Promise.all(referencePromises);
    }

    // Generate title and update session info
    let sessionTitle = null;
    try {
      // Generate title for first message only
      if (isFirstMessage) {
        sessionTitle = await generateSessionTitle(message, course.courseName);
        console.log(`Generated session title: "${sessionTitle}"`);
      }

      // Update session with title (for first message) and last message
      await updateSessionInfo(session.sessionId, sessionTitle, message);
    } catch (titleError) {
      console.error("Error updating session info:", titleError);
      // Don't fail the entire request if title generation fails
    }

    return successResponse(res, HTTP_STATUS.OK, "Message sent successfully", {
      userMessage: {
        messageId: userMessage.messageId,
        content: userMessage.content,
        timestamp: userMessage.timestamp,
        isFromUser: true,
      },
      aiResponse: {
        messageId: assistantMessage.messageId,
        content: assistantResponse,
        timestamp: assistantMessage.timestamp,
        isFromUser: false,
      },
      referencedDocuments: aiResponse.referencedDocuments || [],
      usage: aiResponse.usage,
      model: aiResponse.model,
      fileUploaded: !!fileContext, // Boolean flag indicating if file was used
      fileType: fileContext
        ? fileContext.mimeType.startsWith("image/")
          ? "image"
          : "document"
        : null,
      fileFromStaging: !!(
        fileIds &&
        Array.isArray(fileIds) &&
        fileIds.length > 0
      ), // Indicates if staged file was used
      session: {
        sessionId: session.sessionId,
        title: sessionTitle, // Include generated title in response
        isFirstMessage,
      },
    });
  } catch (error) {
    // If OpenAI API fails, don't save any messages to database
    console.error("OpenAI API Error:", error);

    // Return appropriate error based on the error type
    if (
      error.status === 400 &&
      error.message?.includes("content_policy_violation")
    ) {
      return errorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        "Your message contains content that violates our content policy. Please rephrase your question.",
        "CONTENT_POLICY_VIOLATION"
      );
    } else if (
      error.status === 400 &&
      error.message?.includes("context_length_exceeded")
    ) {
      return errorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        "Your message is too long. Please try with a shorter message.",
        "CONTEXT_LENGTH_EXCEEDED"
      );
    } else if (error.status === 401) {
      return errorResponse(
        res,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        "AI service authentication failed. Please try again later.",
        "AI_AUTH_ERROR"
      );
    } else if (error.status === 429) {
      return errorResponse(
        res,
        HTTP_STATUS.TOO_MANY_REQUESTS,
        "AI service rate limit exceeded. Please try again later.",
        "AI_RATE_LIMIT"
      );
    } else if (error.status >= 500) {
      return errorResponse(
        res,
        502,
        "AI service is temporarily unavailable. Please try again later.",
        "AI_SERVICE_UNAVAILABLE"
      );
    } else if (error.code === "ENOTFOUND" || error.code === "ECONNREFUSED") {
      return errorResponse(
        res,
        502,
        "Network error: Unable to connect to AI service. Please check your internet connection and try again.",
        "NETWORK_ERROR"
      );
    } else {
      return errorResponse(
        res,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        "Failed to get AI response. Please try again later.",
        "AI_RESPONSE_ERROR",
        process.env.NODE_ENV === "development" ? error.message : undefined
      );
    }
  }
});

export const getSession = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;

  const session = await prisma.chatSession.findUnique({
    where: { sessionId },
    include: {
      student: true,
      course: true,
      messages: {
        include: {
          references: true,
        },
        orderBy: { timestamp: "asc" },
      },
    },
  });

  if (!session) {
    return errorResponse(res, HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND);
  }

  return successResponse(res, HTTP_STATUS.OK, SUCCESS_MESSAGES.RETRIEVED, {
    session,
  });
});

export const getStudentSessions = asyncHandler(async (req, res) => {
  const { courseId, page = 1, limit = 20 } = req.query;

  // Use authenticated student's ID
  const studentId = req.student ? req.student.studentId : req.params.studentId;

  // If not authenticated as student, check if admin is accessing specific student data
  if (!req.student && req.userRole !== "admin") {
    return errorResponse(res, HTTP_STATUS.FORBIDDEN, ERROR_MESSAGES.FORBIDDEN);
  }

  const where = {
    studentId: studentId,
    ...(courseId && { courseId }),
  };

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [sessions, totalCount] = await Promise.all([
    prisma.chatSession.findMany({
      where,
      include: {
        course: true,
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
    "Student sessions retrieved successfully"
  );
});

export const getCourses = asyncHandler(async (req, res) => {
  const courses = await prisma.course.findMany({
    where: { isActive: true },
    select: {
      courseId: true,
      courseCode: true,
      courseName: true,
      description: true,
      credits: true,
    },
    orderBy: { courseName: "asc" },
  });

  return successResponse(res, HTTP_STATUS.OK, SUCCESS_MESSAGES.RETRIEVED, {
    courses,
  });
});

import express from "express";
import { authenticateToken, authorizeStudent } from "../middleware/auth.js";
import {
  validateMessage,
  validateUUIDParam,
  validatePagination,
  validateStartChat,
} from "../middleware/validation.js";
import {
  getStudentProfile,
  updateStudentProfile,
  getAvailableCourses,
  getCourseDetail,
  getCourseDocuments,
  searchCourseDocuments,
  getStudentSessions,
  getStudentSession,
  deleteStudentSession,
} from "../controllers/studentController.js";
import { startCourseChat, sendMessage } from "../controllers/chatController.js";

const router = express.Router();

// All routes require student authentication
router.use(authenticateToken, authorizeStudent);

/**
 * @swagger
 * /api/student/profile:
 *   get:
 *     tags: [Student]
 *     summary: Get student profile
 *     description: Retrieve current student's profile information
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Student profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 student:
 *                   $ref: '#/components/schemas/Student'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get("/profile", getStudentProfile);

/**
 * @swagger
 * /api/student/profile:
 *   put:
 *     tags: [Student]
 *     summary: Update student profile
 *     description: Update current student's profile information
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: "John Doe Updated"
 *               program:
 *                 type: string
 *                 example: "Computer Science"
 *               semester:
 *                 type: integer
 *                 example: 6
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Profile updated successfully"
 *                 student:
 *                   $ref: '#/components/schemas/Student'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.put("/profile", updateStudentProfile);

/**
 * @swagger
 * /api/student/courses:
 *   get:
 *     tags: [Student - Courses]
 *     summary: Get available courses
 *     description: Retrieve list of all active courses available to students
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Courses retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 courses:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Course'
 */
router.get("/courses", getAvailableCourses);

/**
 * @swagger
 * /api/student/courses/{courseId}:
 *   get:
 *     tags: [Student - Courses]
 *     summary: Get course details
 *     description: Retrieve detailed information about a specific course
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Course ID
 *     responses:
 *       200:
 *         description: Course details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 course:
 *                   allOf:
 *                     - $ref: '#/components/schemas/Course'
 *                     - type: object
 *                       properties:
 *                         objectives:
 *                           type: string
 *                         competencies:
 *                           type: string
 *                         prerequisites:
 *                           type: string
 *                         teachingMethods:
 *                           type: string
 *                         evaluation:
 *                           type: string
 *                         references:
 *                           type: string
 *                         topics:
 *                           type: string
 *       404:
 *         description: Course not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get(
  "/courses/:courseId",
  validateUUIDParam("courseId"),
  getCourseDetail
);

/**
 * @swagger
 * /api/student/courses/{courseId}/documents:
 *   get:
 *     tags: [Student - Course Documents]
 *     summary: Get course documents
 *     description: Retrieve paginated list of documents for a specific course
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Course ID
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Items per page
 *     responses:
 *       200:
 *         description: Documents retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 documents:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Content'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 */
router.get(
  "/courses/:courseId/documents",
  validateUUIDParam("courseId"),
  validatePagination,
  getCourseDocuments
);

/**
 * @swagger
 * /api/student/courses/{courseId}/search:
 *   get:
 *     tags: [Student - Course Documents]
 *     summary: Search course documents
 *     description: Search for documents within a specific course using keywords
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Course ID
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query
 *         example: "variables programming"
 *     responses:
 *       200:
 *         description: Search results retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 documents:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Content'
 *                 searchQuery:
 *                   type: string
 */
router.get(
  "/courses/:courseId/search",
  validateUUIDParam("courseId"),
  searchCourseDocuments
);

/**
 * @swagger
 * /api/student/sessions:
 *   get:
 *     tags: [Student - Chat Sessions]
 *     summary: Get student's chat sessions
 *     description: Retrieve paginated list of chat sessions for the current student
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Items per page
 *     responses:
 *       200:
 *         description: Sessions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sessions:
 *                   type: array
 *                   items:
 *                     allOf:
 *                       - $ref: '#/components/schemas/ChatSession'
 *                       - type: object
 *                         properties:
 *                           courses:
 *                             $ref: '#/components/schemas/Course'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 */
router.get("/sessions", validatePagination, getStudentSessions);

/**
 * @swagger
 * /api/student/sessions/{sessionId}:
 *   get:
 *     tags: [Student - Chat Sessions]
 *     summary: Get specific chat session
 *     description: Retrieve details of a specific chat session including messages
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Session ID
 *     responses:
 *       200:
 *         description: Session retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 session:
 *                   allOf:
 *                     - $ref: '#/components/schemas/ChatSession'
 *                     - type: object
 *                       properties:
 *                         courses:
 *                           $ref: '#/components/schemas/Course'
 *                         messages:
 *                           type: array
 *                           items:
 *                             $ref: '#/components/schemas/Message'
 *       404:
 *         description: Session not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get(
  "/sessions/:sessionId",
  validateUUIDParam("sessionId"),
  getStudentSession
);

/**
 * @swagger
 * /api/student/sessions/{sessionId}:
 *   delete:
 *     tags: [Student - Sessions]
 *     summary: Delete chat session
 *     description: Delete a chat session and all its messages and references
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Session ID to delete
 *         example: "123e4567-e89b-12d3-a456-426614174000"
 *     responses:
 *       200:
 *         description: Session deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Session deleted successfully"
 *                 deletedSession:
 *                   type: object
 *                   properties:
 *                     sessionId:
 *                       type: string
 *                       format: uuid
 *                       example: "123e4567-e89b-12d3-a456-426614174000"
 *                     messageCount:
 *                       type: integer
 *                       example: 5
 *                     deletedAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-01-15T10:30:00.000Z"
 *       404:
 *         description: Session not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Not authorized to delete this session
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.delete(
  "/sessions/:sessionId",
  validateUUIDParam("sessionId"),
  deleteStudentSession
);

/**
 * @swagger
 * /api/student/start-chat:
 *   post:
 *     tags: [Student - Chat]
 *     summary: Start new chat session
 *     description: Start a new chat session for a specific course
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - courseId
 *             properties:
 *               courseId:
 *                 type: string
 *                 format: uuid
 *                 description: Course ID to start chat for
 *                 example: "123e4567-e89b-12d3-a456-426614174000"
 *     responses:
 *       201:
 *         description: Chat session started successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Chat session started successfully"
 *                 session:
 *                   $ref: '#/components/schemas/ChatSession'
 *       400:
 *         description: Validation error or course not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post("/start-chat", validateStartChat, startCourseChat);

/**
 * @swagger
 * /api/student/chat:
 *   post:
 *     tags: [Student - Chat]
 *     summary: Send message in chat (with optional staged files)
 *     description: Send a message in an active chat session and get AI response. Use fileIds to reference files uploaded via /api/files/upload endpoint.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sessionId
 *               - message
 *               - courseId
 *             properties:
 *               sessionId:
 *                 type: string
 *                 format: uuid
 *                 description: Active chat session ID
 *                 example: "123e4567-e89b-12d3-a456-426614174000"
 *               message:
 *                 type: string
 *                 description: User message content
 *                 example: "What are variables in programming?"
 *               courseId:
 *                 type: string
 *                 format: uuid
 *                 description: Course ID for the chat session
 *                 example: "123e4567-e89b-12d3-a456-426614174000"
 *               fileIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *                 description: Optional array of staged file IDs (use /api/files/upload to stage files first)
 *                 example: ["123e4567-e89b-12d3-a456-426614174000"]
 *     responses:
 *       200:
 *         description: Message sent and AI response received
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 userMessage:
 *                   $ref: '#/components/schemas/Message'
 *                 aiResponse:
 *                   $ref: '#/components/schemas/Message'
 *                 referencedDocuments:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Content'
 *                   description: Documents used by AI for context
 *                 usage:
 *                   type: object
 *                   properties:
 *                     promptTokens:
 *                       type: integer
 *                     completionTokens:
 *                       type: integer
 *                     totalTokens:
 *                       type: integer
 *                 fileUploaded:
 *                   type: boolean
 *                   description: Whether a file was uploaded and processed
 *                 fileType:
 *                   type: string
 *                   enum: [image, document]
 *                   description: Type of file that was used
 *                 fileFromStaging:
 *                   type: boolean
 *                   description: Whether the file came from staging area
 *       400:
 *         description: Validation error, session not found, or file processing error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post("/chat", validateMessage, sendMessage);

export default router;

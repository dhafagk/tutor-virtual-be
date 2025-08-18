import express from "express";
import multer from "multer";
import { authenticateToken, authorizeAdmin } from "../middleware/auth.js";
import {
  validateCourse,
  validateContent,
  validateStudent,
  validateUUIDParam,
  validateIntParam,
  validatePagination,
  validateDateRange,
} from "../middleware/validation.js";
import {
  getDashboardStats,
  getCourses,
  getCourseById,
  generateCourseFieldsOnly,
  generateCourseContentOnly,
  createCourse,
  updateCourse,
  deleteCourse,
  getCourseContent,
  addContent,
  updateContent,
  deleteContent,
  bulkCreateContent,
  bulkUpdateContent,
  uploadDocument,
  getUsers,
  getStudents,
  createStudent,
  updateStudent,
  deleteStudent,
  getSessionAnalytics,
  processDocumentContent,
  processCourseDocuments,
  getDocumentStatus,
  reprocessFailedDocuments,
  getCacheStats,
  clearCache,
} from "../controllers/adminController.js";

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (_, __, cb) => {
    cb(null, "uploads/documents/");
  },
  filename: (_, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname +
        "-" +
        uniqueSuffix +
        "." +
        file.originalname.split(".").pop()
    );
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (_, file, cb) => {
    // Allow common document formats
    const allowedTypes = [
      "application/pdf",
      "text/plain",
      "text/html",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Invalid file type. Only PDF, DOC, DOCX, TXT, and HTML files are allowed."
        )
      );
    }
  },
});

/**
 * @swagger
 * /api/admin/stats:
 *   get:
 *     tags: [Admin - Dashboard]
 *     summary: Get dashboard statistics
 *     description: Retrieve system statistics for admin dashboard
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalStudents:
 *                   type: integer
 *                   example: 150
 *                 totalCourses:
 *                   type: integer
 *                   example: 25
 *                 totalSessions:
 *                   type: integer
 *                   example: 500
 *                 totalMessages:
 *                   type: integer
 *                   example: 2500
 *                 activeSessionsToday:
 *                   type: integer
 *                   example: 15
 *       403:
 *         description: Access denied - Admin role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get("/stats", authenticateToken, authorizeAdmin, getDashboardStats);

/**
 * @swagger
 * /api/admin/courses:
 *   get:
 *     tags: [Admin - Course Management]
 *     summary: Get all courses
 *     description: Retrieve paginated list of all courses for admin management
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
  "/courses",
  authenticateToken,
  authorizeAdmin,
  validatePagination,
  getCourses
);

/**
 * @swagger
 * /api/admin/courses/{courseId}:
 *   get:
 *     tags: [Admin - Course Management]
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
 *                   $ref: '#/components/schemas/Course'
 *       404:
 *         description: Course not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get(
  "/courses/:courseId",
  authenticateToken,
  authorizeAdmin,
  validateUUIDParam("courseId"),
  getCourseById
);

/**
 * @swagger
 * /api/admin/courses/generate-fields:
 *   post:
 *     tags: [Admin - Course Management]
 *     summary: Generate course fields using AI
 *     description: Generate course fields (description, objectives, competencies, etc.) using OpenAI in Bahasa Indonesia. Returns suggestions for admin review before saving.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - courseName
 *             properties:
 *               courseName:
 *                 type: string
 *                 example: "Struktur Data dan Algoritma"
 *                 description: Course name to generate fields for
 *     responses:
 *       200:
 *         description: Course fields generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Course fields generated successfully"
 *                 description:
 *                   type: string
 *                 objectives:
 *                   type: string
 *                 competencies:
 *                   type: string
 *                 prerequisites:
 *                   type: string
 *                 topics:
 *                   type: string
 *                 usage:
 *                   type: object
 *                   properties:
 *                     prompt_tokens:
 *                       type: integer
 *                     completion_tokens:
 *                       type: integer
 *                     total_tokens:
 *                       type: integer
 *                 generatedAt:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Bad request - Course name required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Failed to generate course fields
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post(
  "/courses/generate-fields",
  authenticateToken,
  authorizeAdmin,
  generateCourseFieldsOnly
);

/**
 * @swagger
 * /api/admin/courses/generate-content:
 *   post:
 *     tags: [Admin - Course Management]
 *     summary: Generate course content recommendations using AI
 *     description: Generate content recommendations (books, journals, websites, etc.) using OpenAI in Bahasa Indonesia. Returns suggestions for admin review before saving.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - courseName
 *             properties:
 *               courseName:
 *                 type: string
 *                 example: "Struktur Data dan Algoritma"
 *                 description: Course name to generate content recommendations for
 *     responses:
 *       200:
 *         description: Course content recommendations generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Course content recommendations generated successfully"
 *                 contentList:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       title:
 *                         type: string
 *                       description:
 *                         type: string
 *                       documentUrl:
 *                         type: string
 *                         nullable: true
 *                       documentType:
 *                         type: string
 *                         enum: [book, journal, article, website, pdf, video, presentation]
 *                 usage:
 *                   type: object
 *                   properties:
 *                     prompt_tokens:
 *                       type: integer
 *                     completion_tokens:
 *                       type: integer
 *                     total_tokens:
 *                       type: integer
 *                 summary:
 *                   type: object
 *                   properties:
 *                     totalContentSuggestions:
 *                       type: integer
 *                     contentTypes:
 *                       type: object
 *                 generatedAt:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Bad request - Course name required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Failed to generate course content recommendations
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post(
  "/courses/generate-content",
  authenticateToken,
  authorizeAdmin,
  generateCourseContentOnly
);

/**
 * @swagger
 * /api/admin/courses:
 *   post:
 *     tags: [Admin - Course Management]
 *     summary: Create new course
 *     description: Create a new course with detailed information
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - courseCode
 *               - courseName
 *               - credits
 *             properties:
 *               courseCode:
 *                 type: string
 *                 example: "CS102"
 *               courseName:
 *                 type: string
 *                 example: "Data Structures and Algorithms"
 *               description:
 *                 type: string
 *                 example: "Introduction to fundamental data structures and algorithms"
 *               credits:
 *                 type: integer
 *                 example: 3
 *               objectives:
 *                 type: string
 *               competencies:
 *                 type: string
 *               prerequisites:
 *                 type: string
 *               topics:
 *                 type: string
 *     responses:
 *       201:
 *         description: Course created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Course created successfully"
 *                 course:
 *                   $ref: '#/components/schemas/Course'
 *       400:
 *         description: Validation error or course code already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post(
  "/courses",
  authenticateToken,
  authorizeAdmin,
  validateCourse,
  createCourse
);
router.put(
  "/courses/:courseId",
  authenticateToken,
  authorizeAdmin,
  validateUUIDParam("courseId"),
  updateCourse
);
router.delete(
  "/courses/:courseId",
  authenticateToken,
  authorizeAdmin,
  validateUUIDParam("courseId"),
  deleteCourse
);

// Content Management routes
router.get(
  "/courses/:courseId/content",
  authenticateToken,
  authorizeAdmin,
  validateUUIDParam("courseId"),
  validatePagination,
  getCourseContent
);
router.post(
  "/content",
  authenticateToken,
  authorizeAdmin,
  validateContent,
  addContent
);
router.post(
  "/courses/:courseId/upload-document",
  authenticateToken,
  authorizeAdmin,
  validateUUIDParam("courseId"),
  upload.single("document"),
  uploadDocument
);
router.put(
  "/content/:contentId",
  authenticateToken,
  authorizeAdmin,
  validateIntParam("contentId"),
  updateContent
);
router.delete(
  "/content/:contentId",
  authenticateToken,
  authorizeAdmin,
  validateIntParam("contentId"),
  deleteContent
);

/**
 * @swagger
 * /api/admin/content/bulk:
 *   post:
 *     tags: [Admin - Content Management]
 *     summary: Create multiple content items in bulk
 *     description: Create multiple content items for courses in a single transaction
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - contents
 *             properties:
 *               contents:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required:
 *                     - courseId
 *                     - title
 *                   properties:
 *                     courseId:
 *                       type: string
 *                       format: uuid
 *                       description: Course ID to associate content with
 *                     title:
 *                       type: string
 *                       description: Content title
 *                     description:
 *                       type: string
 *                       description: Content description
 *                     documentUrl:
 *                       type: string
 *                       description: Document URL
 *                     documentType:
 *                       type: string
 *                       description: Document type
 *                     isGenerated:
 *                       type: boolean
 *                       default: false
 *                       description: Whether content was AI-generated
 *     responses:
 *       201:
 *         description: Bulk content created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Bulk content created successfully"
 *                 createdContents:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Content'
 *                 summary:
 *                   type: object
 *                   properties:
 *                     totalCreated:
 *                       type: integer
 *                     courseDistribution:
 *                       type: object
 *                     contentTypes:
 *                       type: object
 *       400:
 *         description: Bad request - validation error
 *       500:
 *         description: Failed to create content in bulk
 */
router.post(
  "/content/bulk",
  authenticateToken,
  authorizeAdmin,
  bulkCreateContent
);

/**
 * @swagger
 * /api/admin/content/bulk:
 *   put:
 *     tags: [Admin - Content Management]
 *     summary: Update multiple content items in bulk
 *     description: Update multiple content items in a single transaction
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - updates
 *             properties:
 *               updates:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required:
 *                     - contentId
 *                   properties:
 *                     contentId:
 *                       type: integer
 *                       description: Content ID to update
 *                     title:
 *                       type: string
 *                       description: New title (optional)
 *                     description:
 *                       type: string
 *                       description: New description (optional)
 *                     documentUrl:
 *                       type: string
 *                       description: New document URL (optional)
 *                     documentType:
 *                       type: string
 *                       description: New document type (optional)
 *                     isGenerated:
 *                       type: boolean
 *                       description: Update generated status (optional)
 *     responses:
 *       200:
 *         description: Bulk content updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Bulk content updated successfully"
 *                 updatedContents:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Content'
 *                 summary:
 *                   type: object
 *                   properties:
 *                     totalUpdated:
 *                       type: integer
 *                     courseDistribution:
 *                       type: object
 *       400:
 *         description: Bad request - validation error
 *       500:
 *         description: Failed to update content in bulk
 */
router.put(
  "/content/bulk",
  authenticateToken,
  authorizeAdmin,
  bulkUpdateContent
);

// User Management routes
router.get(
  "/users",
  authenticateToken,
  authorizeAdmin,
  validatePagination,
  getUsers
);

// Student Management routes
router.get(
  "/students",
  authenticateToken,
  authorizeAdmin,
  validatePagination,
  getStudents
);
router.post(
  "/students",
  authenticateToken,
  authorizeAdmin,
  validateStudent,
  createStudent
);
router.put(
  "/students/:studentId",
  authenticateToken,
  authorizeAdmin,
  updateStudent
);
router.delete(
  "/students/:studentId",
  authenticateToken,
  authorizeAdmin,
  deleteStudent
);

// Analytics routes
router.get(
  "/analytics/sessions",
  authenticateToken,
  authorizeAdmin,
  validateDateRange,
  getSessionAnalytics
);

// Document Processing routes
router.post(
  "/content/:contentId/process",
  authenticateToken,
  authorizeAdmin,
  validateIntParam("contentId"),
  processDocumentContent
);

router.post(
  "/courses/:courseId/process-documents",
  authenticateToken,
  authorizeAdmin,
  validateUUIDParam("courseId"),
  processCourseDocuments
);

router.get(
  "/courses/:courseId/document-status",
  authenticateToken,
  authorizeAdmin,
  validateUUIDParam("courseId"),
  getDocumentStatus
);

router.post(
  "/courses/:courseId/reprocess-failed",
  authenticateToken,
  authorizeAdmin,
  validateUUIDParam("courseId"),
  reprocessFailedDocuments
);

// Cache Management routes
/**
 * @swagger
 * /api/admin/cache/stats:
 *   get:
 *     tags: [Admin - Performance Management]
 *     summary: Get embedding cache statistics
 *     description: Retrieve performance statistics for the embedding cache including hit rate, size, and recommendations
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cache statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Cache statistics retrieved"
 *                 cache:
 *                   type: object
 *                   properties:
 *                     size:
 *                       type: integer
 *                       description: Current number of cached items
 *                     maxSize:
 *                       type: integer
 *                       description: Maximum cache capacity
 *                     hitCount:
 *                       type: integer
 *                       description: Number of cache hits
 *                     missCount:
 *                       type: integer
 *                       description: Number of cache misses
 *                     hitRate:
 *                       type: integer
 *                       description: Hit rate percentage
 *                     ttl:
 *                       type: integer
 *                       description: Time to live in milliseconds
 *                 performance:
 *                   type: object
 *                   properties:
 *                     description:
 *                       type: string
 *                     recommendations:
 *                       type: object
 */
router.get(
  "/cache/stats",
  authenticateToken,
  authorizeAdmin,
  getCacheStats
);

/**
 * @swagger
 * /api/admin/cache/clear:
 *   delete:
 *     tags: [Admin - Performance Management]
 *     summary: Clear embedding cache
 *     description: Clear all cached embeddings to free memory and reset cache statistics
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cache cleared successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Embedding cache cleared successfully"
 *                 clearedEntries:
 *                   type: integer
 *                   description: Number of entries that were cleared
 *                 previousHitRate:
 *                   type: integer
 *                   description: Hit rate before clearing
 */
router.delete(
  "/cache/clear",
  authenticateToken,
  authorizeAdmin,
  clearCache
);

export default router;

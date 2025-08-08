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
  createCourse,
  updateCourse,
  deleteCourse,
  getCourseContent,
  addContent,
  updateContent,
  deleteContent,
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
 *               teachingMethodsAjar:
 *                 type: string
 *               evaluation:
 *                 type: string
 *               references:
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

export default router;

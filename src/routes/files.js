import express from "express";
import { authenticateToken, authorizeStudent, authorizeStudentOrAdmin } from "../middleware/auth.js";
import { validateUUIDParam } from "../middleware/validation.js";
import {
  uploadFile,
  listFiles,
  removeFile,
  getFilePreviewUrl,
  getStorageStats,
  uploadFileMiddleware,
} from "../controllers/fileController.js";

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

/**
 * @swagger
 * /api/files/upload:
 *   post:
 *     tags: [File Management]
 *     summary: Upload file permanently
 *     description: Upload a file (image or document) for permanent storage. Files remain available for use in chat sessions.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: File to upload (Images - JPG/PNG/WebP/GIF max 50MB, Documents - PDF/DOCX/PPTX/TXT/HTML max 50MB)
 *     responses:
 *       201:
 *         description: File uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "File uploaded successfully"
 *                 file:
 *                   type: object
 *                   properties:
 *                     fileId:
 *                       type: string
 *                       format: uuid
 *                       example: "123e4567-e89b-12d3-a456-426614174000"
 *                     originalName:
 *                       type: string
 *                       example: "research_paper.pdf"
 *                     mimeType:
 *                       type: string
 *                       example: "application/pdf"
 *                     fileSize:
 *                       type: integer
 *                       example: 2048576
 *                     fileType:
 *                       type: string
 *                       enum: [image, document]
 *                       example: "document"
 *                     uploadedAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Bad request (no file, unsupported type, size limit exceeded, max files reached)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "No file uploaded. Please select a file to upload."
 *       403:
 *         description: Student or Admin access required
 *       500:
 *         description: Upload failed
 */
router.post("/upload", authorizeStudentOrAdmin, uploadFileMiddleware, uploadFile);

/**
 * @swagger
 * /api/files:
 *   get:
 *     tags: [File Management]
 *     summary: List uploaded files
 *     description: Get list of user's uploaded files that are available for use in chat
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Files retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 files:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       fileId:
 *                         type: string
 *                         format: uuid
 *                       originalName:
 *                         type: string
 *                       mimeType:
 *                         type: string
 *                       fileSize:
 *                         type: integer
 *                       fileType:
 *                         type: string
 *                         enum: [image, document]
 *                       uploadedAt:
 *                         type: string
 *                         format: date-time
 *                 totalFiles:
 *                   type: integer
 *                   example: 3
 *                 maxFiles:
 *                   type: integer
 *                   example: 100
 *       403:
 *         description: Student or Admin access required
 *       500:
 *         description: Failed to retrieve files
 */
router.get("/", authorizeStudentOrAdmin, listFiles);

/**
 * @swagger
 * /api/files/{fileId}:
 *   delete:
 *     tags: [File Management]
 *     summary: Remove uploaded file
 *     description: Remove a file from permanent storage
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: File ID to remove
 *     responses:
 *       200:
 *         description: File removed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "File removed successfully"
 *                 fileId:
 *                   type: string
 *                   format: uuid
 *       404:
 *         description: File not found
 *       403:
 *         description: Student or Admin access required
 *       500:
 *         description: Failed to remove file
 */
router.delete("/:fileId", authorizeStudentOrAdmin, validateUUIDParam("fileId"), removeFile);

/**
 * @swagger
 * /api/files/{fileId}/preview:
 *   get:
 *     tags: [File Management]
 *     summary: Get file preview URL
 *     description: Get a signed URL for previewing the file (useful for images)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: File ID to get preview URL for
 *     responses:
 *       200:
 *         description: Preview URL generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 fileId:
 *                   type: string
 *                   format: uuid
 *                 previewUrl:
 *                   type: string
 *                   format: url
 *                   example: "https://example.supabase.co/storage/v1/object/sign/temp-uploads/..."
 *                 expiresAt:
 *                   type: string
 *                   format: date-time
 *       404:
 *         description: File not found
 *       403:
 *         description: Student or Admin access required
 *       500:
 *         description: Failed to generate preview URL
 */
router.get("/:fileId/preview", authorizeStudentOrAdmin, validateUUIDParam("fileId"), getFilePreviewUrl);

/**
 * @swagger
 * /api/files/stats:
 *   get:
 *     tags: [File Management]
 *     summary: Get storage statistics (Admin only)
 *     description: Get file storage statistics for monitoring
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Storage statistics retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 stats:
 *                   type: object
 *                   properties:
 *                     totalFiles:
 *                       type: integer
 *                     totalSizeBytes:
 *                       type: integer
 *                     totalSizeMB:
 *                       type: number
 *       403:
 *         description: Admin access required
 */
router.get("/stats", getStorageStats);

export default router;
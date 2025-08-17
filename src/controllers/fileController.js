import { asyncHandler } from "../middleware/errorHandler.js";
import {
  storeFile,
  listUserFiles,
  removeFile as removeStorageFile,
  getFilePreviewUrl as getStorageFilePreviewUrl,
  getFileStats,
} from "../services/supabaseStorageService.js";
import multer from "multer";
import {
  successResponse,
  errorResponse,
  HTTP_STATUS,
  SUCCESS_MESSAGES,
  ERROR_MESSAGES,
} from "../utils/apiResponse.js";

// Configure multer for file uploads
const fileUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      // Images
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "image/gif",
      // Documents
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
      "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
      "text/plain",
      "text/html",
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Unsupported file type. Allowed: images, PDF, Word documents, PowerPoint, text files"
        ),
        false
      );
    }
  },
});

// Export the upload middleware
export const uploadFileMiddleware = fileUpload.single("file");

/**
 * Upload file permanently
 */
export const uploadFile = asyncHandler(async (req, res) => {
  if (!req.file) {
    return errorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "No file uploaded. Please select a file to upload."
    );
  }

  // Get student info from authenticated user
  if (!req.student) {
    return errorResponse(res, HTTP_STATUS.FORBIDDEN, ERROR_MESSAGES.FORBIDDEN);
  }

  const studentId = req.student.studentId;

  try {
    const fileInfo = await storeFile(
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname,
      studentId
    );

    const fileType = req.file.mimetype.startsWith("image/")
      ? "Image"
      : "Document";
    const icon = req.file.mimetype.startsWith("image/") ? "📷" : "📄";

    console.log(
      `${icon} ${fileType} uploaded permanently: ${req.file.originalname} (${
        req.file.mimetype
      }, ${(req.file.size / 1024 / 1024).toFixed(2)} MB)`
    );

    return successResponse(
      res,
      HTTP_STATUS.CREATED,
      "File uploaded successfully",
      { file: fileInfo }
    );
  } catch (error) {
    console.error("Error uploading file:", error);

    if (
      error.message.includes("Maximum") ||
      error.message.includes("Unsupported")
    ) {
      return errorResponse(res, HTTP_STATUS.BAD_REQUEST, error.message);
    }

    return errorResponse(
      res,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      "Failed to upload file",
      "FILE_UPLOAD_ERROR",
      process.env.NODE_ENV === "development" ? error.message : undefined
    );
  }
});

/**
 * List user's uploaded files (for preview)
 */
export const listFiles = asyncHandler(async (req, res) => {
  // Get student info from authenticated user
  if (!req.student) {
    return errorResponse(res, HTTP_STATUS.FORBIDDEN, ERROR_MESSAGES.FORBIDDEN);
  }

  const studentId = req.student.studentId;

  try {
    const files = await listUserFiles(studentId);

    return successResponse(res, HTTP_STATUS.OK, SUCCESS_MESSAGES.RETRIEVED, {
      files,
      totalFiles: files.length,
      maxFiles: 100, // From configuration
    });
  } catch (error) {
    console.error("Error listing files:", error);
    return errorResponse(
      res,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      "Failed to retrieve files",
      "FILE_LIST_ERROR",
      process.env.NODE_ENV === "development" ? error.message : undefined
    );
  }
});

/**
 * Remove uploaded file
 */
export const removeFile = asyncHandler(async (req, res) => {
  const { fileId } = req.params;

  // Get student info from authenticated user
  if (!req.student) {
    return errorResponse(res, HTTP_STATUS.FORBIDDEN, ERROR_MESSAGES.FORBIDDEN);
  }

  const studentId = req.student.studentId;

  try {
    await removeStorageFile(fileId, studentId);

    return successResponse(res, HTTP_STATUS.OK, SUCCESS_MESSAGES.DELETED, {
      fileId,
    });
  } catch (error) {
    console.error("Error removing file:", error);

    if (error.message === "File not found") {
      return errorResponse(
        res,
        HTTP_STATUS.NOT_FOUND,
        ERROR_MESSAGES.NOT_FOUND
      );
    }

    return errorResponse(
      res,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      "Failed to remove file",
      "FILE_REMOVE_ERROR",
      process.env.NODE_ENV === "development" ? error.message : undefined
    );
  }
});

/**
 * Get file preview URL (optional - for displaying images)
 */
export const getFilePreviewUrl = asyncHandler(async (req, res) => {
  const { fileId } = req.params;

  // Get student info from authenticated user
  if (!req.student) {
    return errorResponse(res, HTTP_STATUS.FORBIDDEN, ERROR_MESSAGES.FORBIDDEN);
  }

  const studentId = req.student.studentId;

  try {
    const previewData = await getStorageFilePreviewUrl(fileId, studentId, 3600); // 1 hour expiry

    return successResponse(res, HTTP_STATUS.OK, SUCCESS_MESSAGES.RETRIEVED, {
      fileId,
      previewUrl: previewData.url,
      expiresAt: previewData.expiresAt,
    });
  } catch (error) {
    console.error("Error getting preview URL:", error);

    if (error.message.includes("not found")) {
      return errorResponse(res, HTTP_STATUS.NOT_FOUND, "File not found");
    }

    return errorResponse(
      res,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      "Failed to get preview URL",
      "FILE_PREVIEW_ERROR",
      process.env.NODE_ENV === "development" ? error.message : undefined
    );
  }
});

/**
 * Get file storage statistics (admin only)
 */
export const getStorageStats = asyncHandler(async (req, res) => {
  // Check if user is admin
  if (req.userRole !== "admin") {
    return errorResponse(res, HTTP_STATUS.FORBIDDEN, "Admin access required");
  }

  try {
    const stats = await getFileStats();

    return successResponse(
      res,
      HTTP_STATUS.OK,
      "Storage statistics retrieved successfully",
      { stats }
    );
  } catch (error) {
    console.error("Error getting storage stats:", error);
    return errorResponse(
      res,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      "Failed to get storage statistics",
      "STORAGE_STATS_ERROR",
      process.env.NODE_ENV === "development" ? error.message : undefined
    );
  }
});

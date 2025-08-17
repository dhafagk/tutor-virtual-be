import { createClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "../lib/prisma.js";

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error(
    "Missing Supabase configuration. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file"
  );
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Configuration
const STORAGE_BUCKET = "uploads";
const MAX_FILES_PER_USER = 100; // Maximum files per user
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// Supported file types
const ALLOWED_MIME_TYPES = [
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

/**
 * Ensure storage bucket exists
 */
const ensureBucketExists = async () => {
  try {
    const { data: buckets, error: listError } =
      await supabase.storage.listBuckets();

    if (listError) {
      console.error("Error listing buckets:", listError);
      return false;
    }

    const bucketExists = buckets.some(
      (bucket) => bucket.name === STORAGE_BUCKET
    );

    if (!bucketExists) {
      const { error: createError } = await supabase.storage.createBucket(
        STORAGE_BUCKET,
        {
          public: false, // Private bucket for temporary files
          fileSizeLimit: MAX_FILE_SIZE,
          allowedMimeTypes: ALLOWED_MIME_TYPES,
        }
      );

      if (createError) {
        console.error("Error creating bucket:", createError);
        return false;
      }

      console.log(`✅ Created storage bucket: ${STORAGE_BUCKET}`);
    }

    return true;
  } catch (error) {
    console.error("Error ensuring bucket exists:", error);
    return false;
  }
};

/**
 * Upload file to Supabase Storage and store metadata in database permanently
 */
export const storeFile = async (buffer, mimeType, originalName, studentId) => {
  try {
    // Validate file type
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      throw new Error(
        `Unsupported file type: ${mimeType}. Allowed types: ${ALLOWED_MIME_TYPES.join(
          ", "
        )}`
      );
    }

    // Validate file size
    if (buffer.length > MAX_FILE_SIZE) {
      throw new Error(
        `File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`
      );
    }

    // Check user's current file count
    const currentFileCount = await prisma.file.count({
      where: {
        studentId,
      },
    });

    if (currentFileCount >= MAX_FILES_PER_USER) {
      throw new Error(`Maximum ${MAX_FILES_PER_USER} files allowed per user`);
    }

    // Ensure bucket exists
    const bucketReady = await ensureBucketExists();
    if (!bucketReady) {
      throw new Error("Storage bucket is not available");
    }

    // Generate unique file path
    const fileId = uuidv4();
    const fileExtension = originalName.split(".").pop() || "tmp";
    const storagePath = `${studentId}/${fileId}.${fileExtension}`;

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, buffer, {
        contentType: mimeType,
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      console.error("Supabase upload error:", uploadError);
      throw new Error(`Failed to upload file: ${uploadError.message}`);
    }

    // Store metadata in database
    const file = await prisma.file.create({
      data: {
        fileId,
        studentId,
        originalName,
        storagePath: uploadData.path,
        mimeType,
        fileSize: buffer.length,
      },
    });

    console.log(
      `📁 File stored permanently: ${originalName} (${fileId}) at ${storagePath}`
    );

    return {
      fileId: file.fileId,
      originalName: file.originalName,
      mimeType: file.mimeType,
      fileSize: file.fileSize,
      uploadedAt: file.createdAt,
      fileType: mimeType.startsWith("image/") ? "image" : "document",
    };
  } catch (error) {
    console.error("Error storing file:", error);
    throw error;
  }
};

/**
 * Get file buffer and metadata
 */
export const getFile = async (fileId, studentId) => {
  try {
    const file = await prisma.file.findFirst({
      where: {
        fileId,
        studentId,
      },
    });

    if (!file) {
      throw new Error("File not found");
    }

    // Download from Supabase Storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .download(file.storagePath);

    if (downloadError) {
      console.error("Supabase download error:", downloadError);
      throw new Error("File not found or corrupted");
    }

    // Convert blob to buffer
    const buffer = Buffer.from(await fileData.arrayBuffer());

    return {
      buffer,
      mimeType: file.mimeType,
      originalName: file.originalName,
      fileSize: file.fileSize,
    };
  } catch (error) {
    console.error(`Failed to retrieve file ${fileId}:`, error);
    throw error;
  }
};

/**
 * List user's files
 */
export const listUserFiles = async (studentId) => {
  try {
    const files = await prisma.file.findMany({
      where: {
        studentId,
      },
      orderBy: { createdAt: "desc" },
      select: {
        fileId: true,
        originalName: true,
        mimeType: true,
        fileSize: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return files.map((file) => ({
      fileId: file.fileId,
      originalName: file.originalName,
      mimeType: file.mimeType,
      fileSize: file.fileSize,
      uploadedAt: file.createdAt,
      fileType: file.mimeType.startsWith("image/") ? "image" : "document",
    }));
  } catch (error) {
    console.error("Error listing user files:", error);
    throw error;
  }
};

/**
 * Remove file from storage and database
 */
export const removeFile = async (fileId, studentId) => {
  try {
    const file = await prisma.file.findFirst({
      where: {
        fileId,
        studentId,
      },
    });

    if (!file) {
      throw new Error("File not found");
    }

    // Remove from Supabase Storage
    const { error: deleteError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove([file.storagePath]);

    if (deleteError) {
      console.error(
        `Failed to remove file from storage: ${deleteError.message}`
      );
      // Continue with database cleanup even if storage cleanup fails
    } else {
      console.log(`🗑️ File removed from storage: ${file.originalName}`);
    }

    // Remove from database
    await prisma.file.delete({
      where: { fileId },
    });

    console.log(`🗑️ File removed: ${file.originalName} (${fileId})`);
    return true;
  } catch (error) {
    console.error("Error removing file:", error);
    throw error;
  }
};

/**
 * Get file statistics
 */
export const getFileStats = async () => {
  try {
    const [totalFiles, totalSize] = await Promise.all([
      prisma.file.count(),
      prisma.file.aggregate({
        _sum: { fileSize: true },
      }),
    ]);

    return {
      totalFiles,
      totalSizeBytes: totalSize._sum.fileSize || 0,
      totalSizeMB:
        Math.round(((totalSize._sum.fileSize || 0) / 1024 / 1024) * 100) / 100,
    };
  } catch (error) {
    console.error("Error getting file stats:", error);
    throw error;
  }
};

/**
 * Get signed URL for file preview (optional feature)
 */
export const getFilePreviewUrl = async (
  fileId,
  studentId,
  expiresIn = 3600
) => {
  try {
    const file = await prisma.file.findFirst({
      where: {
        fileId,
        studentId,
      },
    });

    if (!file) {
      throw new Error("File not found");
    }

    const { data: signedUrlData, error: urlError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(file.storagePath, expiresIn);

    if (urlError) {
      throw new Error(`Failed to create signed URL: ${urlError.message}`);
    }

    return {
      url: signedUrlData.signedUrl,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
    };
  } catch (error) {
    console.error("Error creating preview URL:", error);
    throw error;
  }
};

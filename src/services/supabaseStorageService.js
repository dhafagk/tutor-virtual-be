import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../lib/prisma.js';

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase configuration. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Configuration
const STORAGE_BUCKET = 'temp-uploads';
const FILE_EXPIRY_HOURS = 24; // Files expire after 24 hours
const MAX_FILES_PER_USER = 10; // Maximum files per user
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// Supported file types
const ALLOWED_MIME_TYPES = [
  // Images
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif',
  // Documents  
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
  'text/plain',
  'text/html'
];

/**
 * Ensure storage bucket exists
 */
const ensureBucketExists = async () => {
  try {
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    
    if (listError) {
      console.error('Error listing buckets:', listError);
      return false;
    }

    const bucketExists = buckets.some(bucket => bucket.name === STORAGE_BUCKET);
    
    if (!bucketExists) {
      const { error: createError } = await supabase.storage.createBucket(STORAGE_BUCKET, {
        public: false, // Private bucket for temporary files
        fileSizeLimit: MAX_FILE_SIZE,
        allowedMimeTypes: ALLOWED_MIME_TYPES
      });
      
      if (createError) {
        console.error('Error creating bucket:', createError);
        return false;
      }
      
      console.log(`✅ Created storage bucket: ${STORAGE_BUCKET}`);
    }
    
    return true;
  } catch (error) {
    console.error('Error ensuring bucket exists:', error);
    return false;
  }
};

/**
 * Upload file to Supabase Storage and store metadata in database
 */
export const storeTemporaryFile = async (buffer, mimeType, originalName, studentId) => {
  try {
    // Validate file type
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      throw new Error(`Unsupported file type: ${mimeType}. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`);
    }

    // Validate file size
    if (buffer.length > MAX_FILE_SIZE) {
      throw new Error(`File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`);
    }

    // Check user's current file count
    const currentFileCount = await prisma.temporaryFile.count({
      where: {
        studentId,
        expiresAt: { gt: new Date() } // Only count non-expired files
      }
    });

    if (currentFileCount >= MAX_FILES_PER_USER) {
      throw new Error(`Maximum ${MAX_FILES_PER_USER} files allowed per user`);
    }

    // Ensure bucket exists
    const bucketReady = await ensureBucketExists();
    if (!bucketReady) {
      throw new Error('Storage bucket is not available');
    }

    // Generate unique file path
    const fileId = uuidv4();
    const fileExtension = originalName.split('.').pop() || 'tmp';
    const storagePath = `${studentId}/${fileId}.${fileExtension}`;
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + FILE_EXPIRY_HOURS);

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, buffer, {
        contentType: mimeType,
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      console.error('Supabase upload error:', uploadError);
      throw new Error(`Failed to upload file: ${uploadError.message}`);
    }

    // Store metadata in database
    const tempFile = await prisma.temporaryFile.create({
      data: {
        fileId,
        studentId,
        originalName,
        storagePath: uploadData.path,
        mimeType,
        fileSize: buffer.length,
        expiresAt
      }
    });

    console.log(`📁 Temporary file stored: ${originalName} (${fileId}) at ${storagePath}`);

    return {
      fileId: tempFile.fileId,
      originalName: tempFile.originalName,
      mimeType: tempFile.mimeType,
      fileSize: tempFile.fileSize,
      uploadedAt: tempFile.createdAt,
      expiresAt: tempFile.expiresAt,
      fileType: mimeType.startsWith('image/') ? 'image' : 'document'
    };
  } catch (error) {
    console.error('Error storing temporary file:', error);
    throw error;
  }
};

/**
 * Get temporary file buffer and metadata
 */
export const getTemporaryFile = async (fileId, studentId) => {
  try {
    const tempFile = await prisma.temporaryFile.findFirst({
      where: {
        fileId,
        studentId,
        expiresAt: { gt: new Date() } // Only get non-expired files
      }
    });

    if (!tempFile) {
      throw new Error('File not found or expired');
    }

    // Download from Supabase Storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .download(tempFile.storagePath);

    if (downloadError) {
      console.error('Supabase download error:', downloadError);
      // File might be missing from storage, clean up database record
      await prisma.temporaryFile.delete({
        where: { fileId }
      });
      throw new Error('File not found or corrupted');
    }

    // Convert blob to buffer
    const buffer = Buffer.from(await fileData.arrayBuffer());

    return {
      buffer,
      mimeType: tempFile.mimeType,
      originalName: tempFile.originalName,
      fileSize: tempFile.fileSize
    };
  } catch (error) {
    console.error(`Failed to retrieve temporary file ${fileId}:`, error);
    throw error;
  }
};

/**
 * List user's temporary files
 */
export const listUserTemporaryFiles = async (studentId) => {
  try {
    const tempFiles = await prisma.temporaryFile.findMany({
      where: {
        studentId,
        expiresAt: { gt: new Date() } // Only get non-expired files
      },
      orderBy: { createdAt: 'desc' },
      select: {
        fileId: true,
        originalName: true,
        mimeType: true,
        fileSize: true,
        createdAt: true,
        expiresAt: true
      }
    });

    return tempFiles.map(file => ({
      fileId: file.fileId,
      originalName: file.originalName,
      mimeType: file.mimeType,
      fileSize: file.fileSize,
      uploadedAt: file.createdAt,
      expiresAt: file.expiresAt,
      fileType: file.mimeType.startsWith('image/') ? 'image' : 'document'
    }));
  } catch (error) {
    console.error('Error listing user temporary files:', error);
    throw error;
  }
};

/**
 * Remove temporary file from storage and database
 */
export const removeTemporaryFile = async (fileId, studentId) => {
  try {
    const tempFile = await prisma.temporaryFile.findFirst({
      where: {
        fileId,
        studentId
      }
    });

    if (!tempFile) {
      throw new Error('File not found');
    }

    // Remove from Supabase Storage
    const { error: deleteError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove([tempFile.storagePath]);

    if (deleteError) {
      console.error(`Failed to remove file from storage: ${deleteError.message}`);
      // Continue with database cleanup even if storage cleanup fails
    } else {
      console.log(`🗑️ Temporary file removed from storage: ${tempFile.originalName}`);
    }

    // Remove from database
    await prisma.temporaryFile.delete({
      where: { fileId }
    });

    console.log(`🗑️ Temporary file removed: ${tempFile.originalName} (${fileId})`);
    return true;
  } catch (error) {
    console.error('Error removing temporary file:', error);
    throw error;
  }
};

/**
 * Clean up expired temporary files (run periodically)
 */
export const cleanupExpiredFiles = async () => {
  try {
    const expiredFiles = await prisma.temporaryFile.findMany({
      where: {
        expiresAt: { lt: new Date() }
      }
    });

    let storageCleanedCount = 0;
    const storagePaths = [];

    // Collect storage paths and attempt to remove from storage
    for (const file of expiredFiles) {
      storagePaths.push(file.storagePath);
    }

    if (storagePaths.length > 0) {
      const { error: deleteError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .remove(storagePaths);

      if (deleteError) {
        console.error('Error during bulk storage cleanup:', deleteError);
      } else {
        storageCleanedCount = storagePaths.length;
      }
    }

    // Remove expired records from database
    const { count } = await prisma.temporaryFile.deleteMany({
      where: {
        expiresAt: { lt: new Date() }
      }
    });

    if (count > 0) {
      console.log(`🧹 Cleaned up ${count} expired temporary files (${storageCleanedCount} removed from storage)`);
    }

    return { databaseRecords: count, storageFiles: storageCleanedCount };
  } catch (error) {
    console.error('Error during cleanup:', error);
    throw error;
  }
};

/**
 * Get temporary file statistics
 */
export const getTemporaryFileStats = async () => {
  try {
    const [totalFiles, expiredFiles, totalSize] = await Promise.all([
      prisma.temporaryFile.count(),
      prisma.temporaryFile.count({
        where: { expiresAt: { lt: new Date() } }
      }),
      prisma.temporaryFile.aggregate({
        _sum: { fileSize: true }
      })
    ]);

    return {
      totalFiles,
      activeFiles: totalFiles - expiredFiles,
      expiredFiles,
      totalSizeBytes: totalSize._sum.fileSize || 0,
      totalSizeMB: Math.round((totalSize._sum.fileSize || 0) / 1024 / 1024 * 100) / 100
    };
  } catch (error) {
    console.error('Error getting temporary file stats:', error);
    throw error;
  }
};

/**
 * Get signed URL for temporary file preview (optional feature)
 */
export const getTemporaryFilePreviewUrl = async (fileId, studentId, expiresIn = 3600) => {
  try {
    const tempFile = await prisma.temporaryFile.findFirst({
      where: {
        fileId,
        studentId,
        expiresAt: { gt: new Date() }
      }
    });

    if (!tempFile) {
      throw new Error('File not found or expired');
    }

    const { data: signedUrlData, error: urlError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(tempFile.storagePath, expiresIn);

    if (urlError) {
      throw new Error(`Failed to create signed URL: ${urlError.message}`);
    }

    return {
      url: signedUrlData.signedUrl,
      expiresAt: new Date(Date.now() + expiresIn * 1000)
    };
  } catch (error) {
    console.error('Error creating preview URL:', error);
    throw error;
  }
};
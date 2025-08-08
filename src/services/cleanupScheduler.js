import { cleanupExpiredFiles } from './supabaseStorageService.js';

// Configuration
const CLEANUP_INTERVAL_HOURS = 6; // Run cleanup every 6 hours
const CLEANUP_INTERVAL_MS = CLEANUP_INTERVAL_HOURS * 60 * 60 * 1000;

let cleanupInterval = null;
let isCleanupRunning = false;

/**
 * Run cleanup with error handling and logging
 */
const runCleanup = async () => {
  if (isCleanupRunning) {
    console.log('🧹 Cleanup already running, skipping this cycle');
    return;
  }

  isCleanupRunning = true;
  const startTime = Date.now();

  try {
    console.log(`🧹 Starting automatic cleanup of expired temporary files...`);
    
    const results = await cleanupExpiredFiles();
    const duration = Date.now() - startTime;
    
    if (results.databaseRecords > 0 || results.storageFiles > 0) {
      console.log(`✅ Cleanup completed in ${duration}ms: ${results.databaseRecords} database records, ${results.storageFiles} storage files removed`);
    } else {
      console.log(`✅ Cleanup completed in ${duration}ms: No expired files found`);
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ Cleanup failed after ${duration}ms:`, error.message);
    
    // Don't throw error to prevent scheduler from stopping
  } finally {
    isCleanupRunning = false;
  }
};

/**
 * Start the automatic cleanup scheduler
 */
export const startCleanupScheduler = () => {
  if (cleanupInterval) {
    console.log('🧹 Cleanup scheduler is already running');
    return;
  }

  console.log(`🧹 Starting cleanup scheduler (every ${CLEANUP_INTERVAL_HOURS} hours)`);
  
  // Run cleanup immediately on startup
  setTimeout(runCleanup, 5000); // Wait 5 seconds after startup
  
  // Schedule recurring cleanup
  cleanupInterval = setInterval(runCleanup, CLEANUP_INTERVAL_MS);
  
  console.log(`✅ Cleanup scheduler started`);
};

/**
 * Stop the automatic cleanup scheduler
 */
export const stopCleanupScheduler = () => {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    console.log('✅ Cleanup scheduler stopped');
  } else {
    console.log('🧹 Cleanup scheduler is not running');
  }
};

/**
 * Get scheduler status
 */
export const getCleanupSchedulerStatus = () => {
  return {
    isRunning: !!cleanupInterval,
    intervalHours: CLEANUP_INTERVAL_HOURS,
    isCleanupCurrentlyRunning: isCleanupRunning
  };
};

/**
 * Run cleanup manually (for admin endpoint)
 */
export const runManualCleanup = async () => {
  if (isCleanupRunning) {
    throw new Error('Cleanup is already running. Please wait for it to complete.');
  }

  console.log('🧹 Manual cleanup requested');
  await runCleanup();
  return { success: true, message: 'Manual cleanup completed' };
};

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('📡 SIGTERM received, stopping cleanup scheduler...');
  stopCleanupScheduler();
});

process.on('SIGINT', () => {
  console.log('📡 SIGINT received, stopping cleanup scheduler...');
  stopCleanupScheduler();
});
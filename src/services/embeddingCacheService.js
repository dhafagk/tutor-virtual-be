/**
 * In-memory caching service for OpenAI embeddings
 * Provides fast lookup for frequently used queries to reduce API calls
 */

import crypto from 'crypto';

class EmbeddingCache {
  constructor() {
    this.cache = new Map();
    this.maxSize = parseInt(process.env.EMBEDDING_CACHE_SIZE) || 1000; // Max cached items
    this.ttl = parseInt(process.env.EMBEDDING_CACHE_TTL) || 3600000; // 1 hour in ms
    this.hitCount = 0;
    this.missCount = 0;
    
    // Cleanup expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
    
    console.log(`🗄️ Embedding cache initialized: max ${this.maxSize} items, TTL ${this.ttl/1000}s`);
  }

  /**
   * Generate cache key from text (normalized and hashed)
   */
  generateKey(text) {
    // Normalize text: lowercase, trim whitespace, remove extra spaces
    const normalized = text.toLowerCase().trim().replace(/\s+/g, ' ');
    
    // Generate hash for consistent key
    return crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 16);
  }

  /**
   * Get embeddings from cache
   */
  get(text) {
    const key = this.generateKey(text);
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.missCount++;
      return null;
    }
    
    // Check if entry has expired
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      this.missCount++;
      return null;
    }
    
    this.hitCount++;
    
    // Update access time for LRU-like behavior
    entry.lastAccessed = Date.now();
    
    console.log(`🎯 Cache HIT for embedding (${this.getHitRate()}% hit rate)`);
    return entry.embeddings;
  }

  /**
   * Store embeddings in cache
   */
  set(text, embeddings) {
    const key = this.generateKey(text);
    
    // If cache is full, remove oldest entries
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }
    
    this.cache.set(key, {
      embeddings: embeddings,
      timestamp: Date.now(),
      lastAccessed: Date.now(),
      textLength: text.length
    });
    
    console.log(`💾 Cached embedding for text (${text.length} chars) - Cache size: ${this.cache.size}/${this.maxSize}`);
  }

  /**
   * Remove oldest entries when cache is full
   */
  evictOldest() {
    if (this.cache.size === 0) return;
    
    let oldestKey = null;
    let oldestTime = Date.now();
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.cache.delete(oldestKey);
      console.log(`🗑️ Evicted oldest cache entry - Cache size: ${this.cache.size}/${this.maxSize}`);
    }
  }

  /**
   * Clean up expired entries
   */
  cleanup() {
    const now = Date.now();
    let removedCount = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttl) {
        this.cache.delete(key);
        removedCount++;
      }
    }
    
    if (removedCount > 0) {
      console.log(`🧹 Cleaned up ${removedCount} expired cache entries - Cache size: ${this.cache.size}/${this.maxSize}`);
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitCount: this.hitCount,
      missCount: this.missCount,
      hitRate: this.getHitRate(),
      ttl: this.ttl
    };
  }

  /**
   * Get hit rate percentage
   */
  getHitRate() {
    const total = this.hitCount + this.missCount;
    return total > 0 ? Math.round((this.hitCount / total) * 100) : 0;
  }

  /**
   * Clear all cache entries
   */
  clear() {
    this.cache.clear();
    this.hitCount = 0;
    this.missCount = 0;
    console.log('🗑️ Cache cleared');
  }

  /**
   * Get cache entries for similar text (fuzzy matching)
   * This can help find cached embeddings for slightly different queries
   */
  findSimilarCached(text, threshold = 0.8) {
    const queryKey = this.generateKey(text);
    const queryLength = text.length;
    
    for (const [key, entry] of this.cache.entries()) {
      // Skip expired entries
      if (Date.now() - entry.timestamp > this.ttl) {
        continue;
      }
      
      // Simple similarity check based on length and key similarity
      const lengthSimilarity = Math.min(queryLength, entry.textLength) / Math.max(queryLength, entry.textLength);
      
      if (lengthSimilarity >= threshold && queryKey.substring(0, 8) === key.substring(0, 8)) {
        console.log(`🔍 Found similar cached embedding (${Math.round(lengthSimilarity * 100)}% similarity)`);
        entry.lastAccessed = Date.now();
        this.hitCount++;
        return entry.embeddings;
      }
    }
    
    return null;
  }

  /**
   * Cleanup when service shuts down
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.clear();
    console.log('🗄️ Embedding cache destroyed');
  }
}

// Create singleton instance
const embeddingCache = new EmbeddingCache();

// Graceful shutdown
process.on('SIGINT', () => {
  embeddingCache.destroy();
});

process.on('SIGTERM', () => {
  embeddingCache.destroy();
});

export default embeddingCache;
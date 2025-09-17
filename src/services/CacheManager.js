const { LRUCache } = require('lru-cache');
const redis = require('redis');
const logger = require('../utils/logger');
const appConfig = require('../config/app');
const redisConfig = require('../config/redis');

class CacheManager {
  constructor() {
    this.l1Cache = null;
    this.l2Client = null;
    this.isRedisConnected = false;
    this.initializeL1Cache();
    this.initializeL2Cache();
  }

  /**
   * Initialize L1 (in-memory LRU) cache
   */
  initializeL1Cache() {
    this.l1Cache = new LRUCache({
      max: appConfig.cache.l1.maxSize,
      ttl: appConfig.cache.l1.ttl,
      allowStale: false,
      updateAgeOnGet: true,
      updateAgeOnHas: false,
      
      // Size calculation
      sizeCalculation: (value) => {
        return JSON.stringify(value).length;
      },
      
      // Max size in bytes (100MB)
      maxSize: 100 * 1024 * 1024,
      
      // Disposal method when items are evicted
      dispose: (key, value) => {
        logger.debug(`L1 Cache: Evicted key ${key}`);
      }
    });
    
    logger.info('L1 Cache initialized', {
      maxItems: appConfig.cache.l1.maxSize,
      ttl: appConfig.cache.l1.ttl
    });
  }

  /**
   * Initialize L2 (Redis) cache
   */
  async initializeL2Cache() {
    try {
      this.l2Client = redis.createClient({
        socket: {
          host: redisConfig.host,
          port: redisConfig.port,
          connectTimeout: redisConfig.options.connectTimeout,
          keepAlive: redisConfig.options.keepAlive
        },
        password: redisConfig.password,
        database: redisConfig.db,
        
        // Retry strategy
        socket: {
          reconnectStrategy: (retries) => {
            if (retries > 10) {
              logger.error('Redis: Max reconnection attempts reached');
              return new Error('Max reconnection attempts reached');
            }
            const delay = Math.min(retries * 50, 2000);
            logger.info(`Redis: Reconnecting in ${delay}ms (attempt ${retries})`);
            return delay;
          }
        }
      });

      // Event handlers
      this.l2Client.on('connect', () => {
        logger.info('Redis: Connected successfully');
        this.isRedisConnected = true;
      });

      this.l2Client.on('error', (err) => {
        logger.error('Redis error:', err);
        this.isRedisConnected = false;
      });

      this.l2Client.on('end', () => {
        logger.info('Redis: Connection closed');
        this.isRedisConnected = false;
      });

      this.l2Client.on('reconnecting', () => {
        logger.info('Redis: Attempting to reconnect...');
      });

      // Connect to Redis
      await this.l2Client.connect();
      
    } catch (error) {
      logger.error('Failed to initialize Redis client:', error);
      this.isRedisConnected = false;
      // Don't throw - allow graceful degradation
    }
  }

  /**
   * Generate cache key for tenant models
   * @param {string} tenantId 
   * @returns {string}
   */
  generateKey(tenantId) {
    return `${redisConfig.keyPrefix.models}${tenantId}`;
  }

  /**
   * Get value from cache (checks L1 first, then L2)
   * @param {string} tenantId 
   * @returns {Promise<Object|null>}
   */
  async get(tenantId) {
    const key = this.generateKey(tenantId);
    
    // Check L1 cache first
    const l1Value = this.l1Cache.get(key);
    if (l1Value) {
      logger.debug(`L1 Cache hit for tenant: ${tenantId}`);
      return l1Value;
    }
    
    // Check L2 cache if Redis is connected
    if (this.isRedisConnected && this.l2Client) {
      try {
        const l2Value = await this.l2Client.get(key);
        if (l2Value) {
          logger.debug(`L2 Cache hit for tenant: ${tenantId}`);
          const parsedValue = JSON.parse(l2Value);
          
          // Populate L1 cache
          this.l1Cache.set(key, parsedValue);
          
          return parsedValue;
        }
      } catch (error) {
        logger.error(`L2 Cache get error for tenant ${tenantId}:`, error);
        // Continue without L2 cache
      }
    }
    
    logger.debug(`Cache miss for tenant: ${tenantId}`);
    return null;
  }

  /**
   * Set value in both cache layers
   * @param {string} tenantId 
   * @param {Object} value 
   * @param {number} ttl - Optional TTL in milliseconds
   * @returns {Promise<void>}
   */
  async set(tenantId, value, ttl = null) {
    const key = this.generateKey(tenantId);
    
    // Set in L1 cache
    this.l1Cache.set(key, value);
    logger.debug(`L1 Cache set for tenant: ${tenantId}`);
    
    // Set in L2 cache if Redis is connected
    if (this.isRedisConnected && this.l2Client) {
      try {
        const serialized = JSON.stringify(value);
        const redisTTL = ttl || appConfig.cache.l2.ttl;
        
        await this.l2Client.setEx(
          key, 
          Math.floor(redisTTL / 1000), // Convert to seconds
          serialized
        );
        
        logger.debug(`L2 Cache set for tenant: ${tenantId}`);
      } catch (error) {
        logger.error(`L2 Cache set error for tenant ${tenantId}:`, error);
        // Continue - L1 cache is still set
      }
    }
  }

  /**
   * Delete value from both cache layers
   * @param {string} tenantId 
   * @returns {Promise<void>}
   */
  async delete(tenantId) {
    const key = this.generateKey(tenantId);
    
    // Delete from L1 cache
    this.l1Cache.delete(key);
    logger.debug(`L1 Cache deleted for tenant: ${tenantId}`);
    
    // Delete from L2 cache if Redis is connected
    if (this.isRedisConnected && this.l2Client) {
      try {
        await this.l2Client.del(key);
        logger.debug(`L2 Cache deleted for tenant: ${tenantId}`);
      } catch (error) {
        logger.error(`L2 Cache delete error for tenant ${tenantId}:`, error);
      }
    }
  }

  /**
   * Clear all cache entries
   * @returns {Promise<void>}
   */
  async clear() {
    // Clear L1 cache
    this.l1Cache.clear();
    logger.info('L1 Cache cleared');
    
    // Clear L2 cache if Redis is connected
    if (this.isRedisConnected && this.l2Client) {
      try {
        const keys = await this.l2Client.keys(`${redisConfig.keyPrefix.models}*`);
        if (keys.length > 0) {
          await this.l2Client.del(keys);
          logger.info(`L2 Cache cleared: ${keys.length} keys deleted`);
        }
      } catch (error) {
        logger.error('L2 Cache clear error:', error);
      }
    }
  }

  /**
   * Get cache statistics
   * @returns {Promise<Object>}
   */
  async getStats() {
    const stats = {
      l1: {
        size: this.l1Cache.size,
        maxSize: this.l1Cache.max,
        calculatedSize: this.l1Cache.calculatedSize
      },
      l2: {
        connected: this.isRedisConnected,
        keyCount: 0
      }
    };
    
    if (this.isRedisConnected && this.l2Client) {
      try {
        const keys = await this.l2Client.keys(`${redisConfig.keyPrefix.models}*`);
        stats.l2.keyCount = keys.length;
      } catch (error) {
        logger.error('Error getting L2 cache stats:', error);
      }
    }
    
    return stats;
  }

  /**
   * Check if Redis is available
   * @returns {boolean}
   */
  isL2Available() {
    return this.isRedisConnected;
  }

  /**
   * Gracefully close cache connections
   * @returns {Promise<void>}
   */
  async close() {
    // Clear L1 cache
    this.l1Cache.clear();
    
    // Close Redis connection
    if (this.l2Client) {
      try {
        await this.l2Client.quit();
        logger.info('Redis connection closed gracefully');
      } catch (error) {
        logger.error('Error closing Redis connection:', error);
      }
    }
  }
}

module.exports = CacheManager;
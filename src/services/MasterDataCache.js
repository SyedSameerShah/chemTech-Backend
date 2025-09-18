const redis = require('redis');
const logger = require('../utils/logger');
const redisConfig = require('../config/redis');

class MasterDataCache {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.ttl = parseInt(process.env.MASTER_DATA_CACHE_TTL) || 3600000; // 1 hour default
    this.initialize();
  }

  /**
   * Initialize Redis connection
   */
  async initialize() {
    try {
      this.client = redis.createClient({
        socket: {
          host: redisConfig.host,
          port: redisConfig.port,
          connectTimeout: redisConfig.options.connectTimeout,
          keepAlive: redisConfig.options.keepAlive
        },
        password: redisConfig.password,
        database: redisConfig.db
      });

      // Event handlers
      this.client.on('connect', () => {
        logger.info('MasterDataCache: Redis connected');
        this.isConnected = true;
      });

      this.client.on('error', (err) => {
        logger.error('MasterDataCache: Redis error:', err);
        this.isConnected = false;
      });

      this.client.on('end', () => {
        logger.info('MasterDataCache: Redis connection closed');
        this.isConnected = false;
      });

      // Connect to Redis
      await this.client.connect();
      
    } catch (error) {
      logger.error('MasterDataCache: Failed to initialize Redis:', error);
      this.isConnected = false;
    }
  }

  /**
   * Generate cache key for master data
   * @param {string} tenantId 
   * @param {string} collection 
   * @param {string} identifier - Optional specific item identifier
   * @returns {string}
   */
  generateKey(tenantId, collection, identifier = null) {
    const base = `master:${tenantId}:${collection}`;
    return identifier ? `${base}:${identifier}` : base;
  }

  /**
   * Get master data from cache
   * @param {string} tenantId 
   * @param {string} collection 
   * @param {string} identifier 
   * @returns {Promise<any|null>}
   */
  async get(tenantId, collection, identifier = null) {
    if (!this.isConnected) return null;

    try {
      const key = this.generateKey(tenantId, collection, identifier);
      const value = await this.client.get(key);
      
      if (value) {
        logger.debug(`MasterDataCache hit: ${key}`);
        return JSON.parse(value);
      }
      
      return null;
    } catch (error) {
      logger.error('MasterDataCache get error:', error);
      return null;
    }
  }

  /**
   * Set master data in cache
   * @param {string} tenantId 
   * @param {string} collection 
   * @param {any} data 
   * @param {string} identifier 
   * @param {number} customTTL - Optional custom TTL in seconds
   * @returns {Promise<boolean>}
   */
  async set(tenantId, collection, data, identifier = null, customTTL = null) {
    if (!this.isConnected) return false;

    try {
      const key = this.generateKey(tenantId, collection, identifier);
      const ttlSeconds = customTTL || Math.floor(this.ttl / 1000);
      
      await this.client.setEx(key, ttlSeconds, JSON.stringify(data));
      logger.debug(`MasterDataCache set: ${key}`);
      
      return true;
    } catch (error) {
      logger.error('MasterDataCache set error:', error);
      return false;
    }
  }

  /**
   * Delete master data from cache
   * @param {string} tenantId 
   * @param {string} collection 
   * @param {string} identifier 
   * @returns {Promise<boolean>}
   */
  async delete(tenantId, collection, identifier = null) {
    if (!this.isConnected) return false;

    try {
      const key = this.generateKey(tenantId, collection, identifier);
      await this.client.del(key);
      logger.debug(`MasterDataCache deleted: ${key}`);
      
      return true;
    } catch (error) {
      logger.error('MasterDataCache delete error:', error);
      return false;
    }
  }

  /**
   * Invalidate all cache for a collection
   * @param {string} tenantId 
   * @param {string} collection 
   * @returns {Promise<number>}
   */
  async invalidateCollection(tenantId, collection) {
    if (!this.isConnected) return 0;

    try {
      const pattern = this.generateKey(tenantId, collection, '*');
      const keys = await this.client.keys(pattern);
      
      if (keys.length > 0) {
        const deleted = await this.client.del(keys);
        logger.info(`MasterDataCache invalidated ${deleted} keys for ${collection}`);
        return deleted;
      }
      
      return 0;
    } catch (error) {
      logger.error('MasterDataCache invalidate error:', error);
      return 0;
    }
  }

  /**
   * Get cache statistics for master data
   * @param {string} tenantId 
   * @returns {Promise<Object>}
   */
  async getStats(tenantId = '*') {
    if (!this.isConnected) {
      return { connected: false, collections: {} };
    }

    try {
      const pattern = `master:${tenantId}:*`;
      const keys = await this.client.keys(pattern);
      
      const stats = {
        connected: true,
        totalKeys: keys.length,
        collections: {}
      };

      // Group keys by collection
      keys.forEach(key => {
        const parts = key.split(':');
        if (parts.length >= 3) {
          const collection = parts[2];
          stats.collections[collection] = (stats.collections[collection] || 0) + 1;
        }
      });

      return stats;
    } catch (error) {
      logger.error('MasterDataCache getStats error:', error);
      return { connected: false, error: error.message };
    }
  }

  /**
   * Check if cache is available
   * @returns {boolean}
   */
  isAvailable() {
    return this.isConnected;
  }

  /**
   * Close Redis connection
   * @returns {Promise<void>}
   */
  async close() {
    if (this.client) {
      try {
        await this.client.quit();
        logger.info('MasterDataCache: Redis connection closed');
      } catch (error) {
        logger.error('MasterDataCache: Error closing Redis:', error);
      }
    }
  }
}

// Export singleton instance
module.exports = new MasterDataCache();
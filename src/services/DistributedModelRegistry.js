const { Mutex } = require("async-mutex");
const mongoose = require("mongoose");
const logger = require("../utils/logger");
const CacheManager = require("./CacheManager");
const TenantConnectionManager = require("./TenantConnectionManager");
const { MasterDataSchema } = require("../models/MasterData");

class DistributedModelRegistry {
  constructor() {
    this.cacheManager = new CacheManager();
    this.connectionManager = new TenantConnectionManager();
    this.registeredSchemas = new Map(); // modelName -> Schema
    this.modelCreationLocks = new Map(); // tenantId -> Mutex
    this.stats = {
      cacheHits: { l1: 0, l2: 0 },
      cacheMisses: 0,
      modelCreations: 0,
      errors: 0,
    };
  }

  /**
   * Register a model schema that will be available for all tenants
   * @param {string} modelName
   * @param {mongoose.Schema} schema
   */
  registerSchema(modelName, schema) {
    if (!modelName || !schema) {
      throw new Error("Model name and schema are required");
    }

    if (!(schema instanceof mongoose.Schema)) {
      throw new Error("Schema must be an instance of mongoose.Schema");
    }

    this.registeredSchemas.set(modelName, schema);
    logger.info(`Schema registered: ${modelName}`);
  }

  /**
   * Register multiple schemas at once
   * @param {Object} schemas - Object with modelName as key and schema as value
   */
  registerSchemas(schemas) {
    for (const [modelName, schema] of Object.entries(schemas)) {
      this.registerSchema(modelName, schema);
    }
  }

  /**
   * Get or create a mutex for a tenant
   * @param {string} tenantId
   * @returns {Mutex}
   */
  getMutex(tenantId) {
    if (!this.modelCreationLocks.has(tenantId)) {
      this.modelCreationLocks.set(tenantId, new Mutex());
    }
    return this.modelCreationLocks.get(tenantId);
  }

  /**
   * Get models for a specific tenant
   * @param {string} tenantId
   * @returns {Promise<Object>} Object with modelName as key and Model as value
   */
  async getModels(tenantId) {
    if (!tenantId) {
      throw new Error("Tenant ID is required");
    }

    try {
      // Check cache first
      const cachedModels = await this.getCachedModels(tenantId);
      if (cachedModels) {
        console.log("cachedModels", cachedModels);
        return cachedModels;
      }

      // Cache miss - need to create models
      // Use mutex to prevent cache stampede
      const mutex = this.getMutex(tenantId);

      return await mutex.runExclusive(async () => {
        // Double-check cache inside mutex
        const cachedModelsInMutex = await this.getCachedModels(tenantId);
        if (cachedModelsInMutex) {
          console.log("cachedModelsInMutex", cachedModelsInMutex);
          return cachedModelsInMutex;
        }

        // Create models
        logger.info(`Creating models for tenant: ${tenantId}`);
        const models = await this.createTenantModels(tenantId);

        // Cache the models metadata (not the actual Mongoose models)
        await this.cacheModels(tenantId, models);

        this.stats.modelCreations++;
        console.log("models in mutex", models);
        return models;
      });
    } catch (error) {
      this.stats.errors++;
      logger.error(`Error getting models for tenant ${tenantId}:`, error);
      throw error;
    }
  }

  /**
   * Get cached models for a tenant
   * @param {string} tenantId
   * @returns {Promise<Object|null>}
   */
  async getCachedModels(tenantId) {
    const cachedData = await this.cacheManager.get(tenantId);

    if (!cachedData) {
      this.stats.cacheMisses++;
      return null;
    }

    // Cache hit - reconstruct models from cached data
    try {
      const connection = await this.connectionManager.getConnection(tenantId);
      const models = {};

      for (const [modelName, modelInfo] of Object.entries(cachedData.models)) {
        const schema = this.registeredSchemas.get(modelName);
        if (schema) {
          const tenantModelName = `${modelName}`;

          // Check if model already exists on connection
          if (connection.models[tenantModelName]) {
            models[modelName] = connection.models[tenantModelName];
          } else {
            models[modelName] = connection.model(tenantModelName, schema);
          }
        }
      }

      // Update stats based on cache level
      if (cachedData.cacheLevel === "L1") {
        this.stats.cacheHits.l1++;
      } else {
        this.stats.cacheHits.l2++;
      }

      return models;
    } catch (error) {
      logger.error(
        `Error reconstructing models from cache for tenant ${tenantId}:`,
        error
      );
      return null;
    }
  }

  /**
   * Create models for a specific tenant
   * @param {string} tenantId
   * @returns {Promise<Object>}
   */
  async createTenantModels(tenantId) {
    const connection = await this.connectionManager.getConnection(tenantId);
    const models = {};

    for (const [modelName, schema] of this.registeredSchemas.entries()) {
      const tenantModelName = `${modelName}`;

      // Check if model already exists on connection
      if (connection.models[tenantModelName]) {
        models[modelName] = connection.models[tenantModelName];
      } else {
        // Create new model with tenant-specific name
        models[modelName] = connection.model(tenantModelName, schema);

        // Ensure indexes are created
        await models[modelName].createIndexes();
      }

      logger.debug(`Model created: ${tenantModelName}`);
    }

    return models;
  }

  /**
   * Cache models metadata for a tenant
   * @param {string} tenantId
   * @param {Object} models
   * @returns {Promise<void>}
   */
  async cacheModels(tenantId, models) {
    const cacheData = {
      tenantId,
      timestamp: Date.now(),
      models: {},
    };

    // Store model metadata (not the actual Mongoose models)
    for (const [modelName, model] of Object.entries(models)) {
      cacheData.models[modelName] = {
        name: modelName,
        collectionName: model.collection.name,
        schemaRegistered: this.registeredSchemas.has(modelName),
      };
    }

    await this.cacheManager.set(tenantId, cacheData);
  }

  /**
   * Get a specific model for a tenant
   * @param {string} tenantId
   * @param {string} modelName
   * @returns {Promise<mongoose.Model>}
   */
  async getModel(tenantId, modelName) {
    if (!this.isSchemaRegistered(modelName)) {
      this.registerSchema(modelName, MasterDataSchema);
    }
    const models = await this.getModels(tenantId);
    console.log("models", models);
    if (!models[modelName]) {
      throw new Error(`Model ${modelName} not found for tenant ${tenantId}`);
    }

    return models[modelName];
  }

  /**
   * Invalidate cache for a specific tenant
   * @param {string} tenantId
   * @returns {Promise<void>}
   */
  async invalidateCache(tenantId) {
    await this.cacheManager.delete(tenantId);
    logger.info(`Cache invalidated for tenant: ${tenantId}`);
  }

  /**
   * Invalidate all cache entries
   * @returns {Promise<void>}
   */
  async invalidateAllCache() {
    await this.cacheManager.clear();
    logger.info("All cache entries invalidated");
  }

  /**
   * Close connection for a specific tenant
   * @param {string} tenantId
   * @returns {Promise<void>}
   */
  async closeTenantConnection(tenantId) {
    await this.connectionManager.closeConnection(tenantId);
    await this.invalidateCache(tenantId);
  }

  /**
   * Get registry statistics
   * @returns {Promise<Object>}
   */
  async getStats() {
    const cacheStats = await this.cacheManager.getStats();
    const connectionStats = this.connectionManager.getStats();

    return {
      registry: {
        registeredSchemas: this.registeredSchemas.size,
        schemas: Array.from(this.registeredSchemas.keys()),
        activeLocks: this.modelCreationLocks.size,
        ...this.stats,
      },
      cache: cacheStats,
      connections: connectionStats,
    };
  }

  /**
   * Get list of registered schemas
   * @returns {Array<string>}
   */
  getRegisteredSchemas() {
    return Array.from(this.registeredSchemas.keys());
  }

  /**
   * Check if a schema is registered
   * @param {string} modelName
   * @returns {boolean}
   */
  isSchemaRegistered(modelName) {
    return this.registeredSchemas.has(modelName);
  }

  /**
   * Unregister a schema
   * @param {string} modelName
   */
  unregisterSchema(modelName) {
    if (this.registeredSchemas.delete(modelName)) {
      logger.info(`Schema unregistered: ${modelName}`);
      // Invalidate all cache as models structure has changed
      this.invalidateAllCache();
    }
  }

  /**
   * Perform health check
   * @returns {Promise<Object>}
   */
  async healthCheck() {
    const health = {
      status: "healthy",
      checks: {
        cache: {
          l1: true,
          l2: false,
        },
        connections: true,
      },
    };

    try {
      // Check L2 cache (Redis)
      health.checks.cache.l2 = this.cacheManager.isL2Available();

      // Check if we can create connections
      const connectionStats = this.connectionManager.getStats();
      health.checks.connections = connectionStats.totalConnections >= 0;

      // Determine overall health
      if (!health.checks.cache.l1 || !health.checks.connections) {
        health.status = "unhealthy";
      } else if (!health.checks.cache.l2) {
        health.status = "degraded";
      }
    } catch (error) {
      logger.error("Health check error:", error);
      health.status = "unhealthy";
      health.error = error.message;
    }

    return health;
  }

  /**
   * Gracefully shutdown the registry
   * @returns {Promise<void>}
   */
  async shutdown() {
    logger.info("Shutting down DistributedModelRegistry...");

    try {
      // Clear all locks
      this.modelCreationLocks.clear();

      // Close all connections
      await this.connectionManager.closeAll();

      // Close cache connections
      await this.cacheManager.close();

      logger.info("DistributedModelRegistry shutdown complete");
    } catch (error) {
      logger.error("Error during registry shutdown:", error);
      throw error;
    }
  }
}

// Export singleton instance
module.exports = new DistributedModelRegistry();

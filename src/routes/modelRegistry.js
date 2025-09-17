const express = require('express');
const router = express.Router();
const modelRegistry = require('../services/DistributedModelRegistry');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

/**
 * GET /api/models/health
 * Health check endpoint
 */
router.get('/health', asyncHandler(async (req, res) => {
  const health = await modelRegistry.healthCheck();
  const statusCode = health.status === 'healthy' ? 200 : 
                     health.status === 'degraded' ? 200 : 503;
  res.status(statusCode).json(health);
}));

/**
 * GET /api/models/stats
 * Get registry statistics
 */
router.get('/stats', asyncHandler(async (req, res) => {
  const stats = await modelRegistry.getStats();
  res.json(stats);
}));

/**
 * GET /api/models/schemas
 * Get list of registered schemas
 */
router.get('/schemas', asyncHandler(async (req, res) => {
  const schemas = modelRegistry.getRegisteredSchemas();
  res.json({
    count: schemas.length,
    schemas
  });
}));

/**
 * GET /api/models/:tenantId
 * Get all models for a specific tenant
 */
router.get('/:tenantId', asyncHandler(async (req, res) => {
  const { tenantId } = req.params;
  
  if (!tenantId) {
    return res.status(400).json({
      error: 'Tenant ID is required'
    });
  }
  
  const startTime = Date.now();
  const models = await modelRegistry.getModels(tenantId);
  const duration = Date.now() - startTime;
  
  // Get model names
  const modelNames = Object.keys(models);
  
  logger.info(`Models retrieved for tenant ${tenantId}`, {
    tenantId,
    modelCount: modelNames.length,
    duration: `${duration}ms`
  });
  
  res.json({
    tenantId,
    models: modelNames,
    count: modelNames.length,
    retrievalTime: `${duration}ms`
  });
}));

/**
 * GET /api/models/:tenantId/:modelName
 * Get a specific model for a tenant
 */
router.get('/:tenantId/:modelName', asyncHandler(async (req, res) => {
  const { tenantId, modelName } = req.params;
  
  if (!tenantId || !modelName) {
    return res.status(400).json({
      error: 'Tenant ID and model name are required'
    });
  }
  
  const model = await modelRegistry.getModel(tenantId, modelName);
  
  res.json({
    tenantId,
    modelName,
    exists: true,
    collectionName: model.collection.name
  });
}));

/**
 * POST /api/models/:tenantId/test
 * Test model operations for a tenant
 */
router.post('/:tenantId/test', asyncHandler(async (req, res) => {
  const { tenantId } = req.params;
  const { modelName = 'User', operation = 'count' } = req.body;
  
  // Get the model
  const model = await modelRegistry.getModel(tenantId, modelName);
  
  let result;
  switch (operation) {
    case 'count':
      result = await model.countDocuments();
      break;
    case 'findOne':
      result = await model.findOne();
      break;
    case 'find':
      result = await model.find().limit(10);
      break;
    default:
      return res.status(400).json({
        error: `Unknown operation: ${operation}`
      });
  }
  
  res.json({
    tenantId,
    modelName,
    operation,
    result
  });
}));

/**
 * DELETE /api/models/cache/:tenantId
 * Invalidate cache for a specific tenant
 */
router.delete('/cache/:tenantId', asyncHandler(async (req, res) => {
  const { tenantId } = req.params;
  
  if (!tenantId) {
    return res.status(400).json({
      error: 'Tenant ID is required'
    });
  }
  
  await modelRegistry.invalidateCache(tenantId);
  
  logger.info(`Cache invalidated for tenant: ${tenantId}`);
  
  res.json({
    message: 'Cache invalidated successfully',
    tenantId
  });
}));

/**
 * DELETE /api/models/cache
 * Invalidate all cache entries
 */
router.delete('/cache', asyncHandler(async (req, res) => {
  await modelRegistry.invalidateAllCache();
  
  logger.info('All cache entries invalidated');
  
  res.json({
    message: 'All cache entries invalidated successfully'
  });
}));

/**
 * DELETE /api/models/connection/:tenantId
 * Close connection for a specific tenant
 */
router.delete('/connection/:tenantId', asyncHandler(async (req, res) => {
  const { tenantId } = req.params;
  
  if (!tenantId) {
    return res.status(400).json({
      error: 'Tenant ID is required'
    });
  }
  
  await modelRegistry.closeTenantConnection(tenantId);
  
  logger.info(`Connection closed for tenant: ${tenantId}`);
  
  res.json({
    message: 'Connection closed successfully',
    tenantId
  });
}));

module.exports = router;
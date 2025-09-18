const TenantConnectionManager = require('../services/TenantConnectionManager');
const logger = require('../utils/logger');

// Create a singleton instance
const connectionManager = new TenantConnectionManager();

/**
 * Middleware to attach tenant database connection to request
 */
const attachTenantConnection = async (req, res, next) => {
  try {
    // Tenant ID should already be set by resolveTenant middleware
    const tenantId = req.tenantId;
    
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NO_TENANT',
          message: 'Tenant ID is required'
        }
      });
    }
    
    // Get or create tenant connection
    const connection = await connectionManager.getConnection(tenantId);
    
    // Attach to request
    req.tenantConnection = connection;
    
    // Log connection usage
    logger.debug('Tenant connection attached', {
      tenantId,
      requestId: req.requestId,
      connectionState: connection.readyState
    });
    
    next();
  } catch (error) {
    logger.error('Failed to attach tenant connection:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'CONNECTION_ERROR',
        message: 'Failed to establish database connection'
      }
    });
  }
};

/**
 * Get connection manager stats (admin endpoint)
 */
const getConnectionStats = (req, res) => {
  const stats = connectionManager.getStats();
  
  res.json({
    success: true,
    data: stats,
    meta: {
      timestamp: new Date().toISOString(),
      requestId: req.requestId
    }
  });
};

/**
 * Close a specific tenant connection (admin endpoint)
 */
const closeTenantConnection = async (req, res) => {
  try {
    const { tenantId } = req.params;
    
    await connectionManager.closeConnection(tenantId);
    
    res.json({
      success: true,
      message: `Connection closed for tenant: ${tenantId}`,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.requestId
      }
    });
  } catch (error) {
    logger.error('Failed to close tenant connection:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'CLOSE_ERROR',
        message: 'Failed to close connection'
      }
    });
  }
};

/**
 * Close all inactive connections (admin endpoint)
 */
const closeInactiveConnections = async (req, res) => {
  try {
    await connectionManager.closeInactiveConnections();
    
    res.json({
      success: true,
      message: 'Inactive connections closed',
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.requestId
      }
    });
  } catch (error) {
    logger.error('Failed to close inactive connections:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'CLEANUP_ERROR',
        message: 'Failed to close inactive connections'
      }
    });
  }
};

// Export middleware and utility functions
module.exports = {
  attachTenantConnection,
  getConnectionStats,
  closeTenantConnection,
  closeInactiveConnections,
  connectionManager
};
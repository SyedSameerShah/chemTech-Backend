const mongoose = require('mongoose');
const logger = require('../utils/logger');
const dbConfig = require('../config/database');

class TenantConnectionManager {
  constructor() {
    this.connections = new Map(); // tenantId -> connection
    this.connectionTimestamps = new Map(); // tenantId -> lastUsed timestamp
    this.cleanupInterval = null;
    this.startCleanupTask();
  }

  /**
   * Get or create a connection for a tenant
   * @param {string} tenantId 
   * @returns {Promise<mongoose.Connection>}
   */
  async getConnection(tenantId) {
    // Check if connection exists and is ready
    if (this.connections.has(tenantId)) {
      const connection = this.connections.get(tenantId);
      
      // Check connection state
      if (connection.readyState === 1) { // Connected
        this.updateTimestamp(tenantId);
        logger.debug(`Reusing existing connection for tenant: ${tenantId}`);
        return connection;
      } else if (connection.readyState === 2) { // Connecting
        // Wait for connection to be ready
        await new Promise((resolve) => {
          connection.once('connected', resolve);
        });
        this.updateTimestamp(tenantId);
        return connection;
      } else {
        // Connection is disconnected or error state
        logger.warn(`Connection in bad state for tenant ${tenantId}, creating new one`);
        await this.closeConnection(tenantId);
      }
    }
    
    // Create new connection
    return await this.createConnection(tenantId);
  }

  /**
   * Create a new connection for a tenant
   * @param {string} tenantId 
   * @returns {Promise<mongoose.Connection>}
   */
  async createConnection(tenantId) {
    try {
      const dbName = `${dbConfig.tenant.dbPrefix}${tenantId}`;
      const uri = this.buildConnectionUri(tenantId);
      
      logger.info(`Creating new connection for tenant: ${tenantId}, database: ${dbName}`);
      
      // Create connection with tenant-specific database
      const connection = mongoose.createConnection(uri, {
        ...dbConfig.mongodb.defaultOptions,
        dbName: dbName,
        autoIndex: true,
        autoCreate: true
      });
      
      // Add event listeners
      this.attachConnectionListeners(connection, tenantId);
      
      // Wait for connection to be established
      await new Promise((resolve, reject) => {
        connection.once('connected', () => {
          logger.info(`Connection established for tenant: ${tenantId}`);
          resolve();
        });
        
        connection.once('error', (err) => {
          logger.error(`Connection error for tenant ${tenantId}:`, err);
          reject(err);
        });
        
        // Timeout after 10 seconds
        setTimeout(() => {
          reject(new Error(`Connection timeout for tenant ${tenantId}`));
        }, 10000);
      });
      
      // Store connection
      this.connections.set(tenantId, connection);
      this.updateTimestamp(tenantId);
      
      return connection;
      
    } catch (error) {
      logger.error(`Failed to create connection for tenant ${tenantId}:`, error);
      throw new Error(`Failed to establish database connection for tenant ${tenantId}`);
    }
  }

  /**
   * Build connection URI for a tenant
   * @param {string} tenantId 
   * @returns {string}
   */
  buildConnectionUri(tenantId) {
    const { uri, username, password } = dbConfig.mongodb;
    const dbName = `${dbConfig.tenant.dbPrefix}${tenantId}`;
    
    // Parse the base URI
    let connectionUri = uri;
    
    // Add authentication if provided
    if (username && password) {
      const uriParts = uri.split('://');
      if (uriParts.length === 2) {
        connectionUri = `${uriParts[0]}://${username}:${password}@${uriParts[1]}`;
      }
    }
    
    // Ensure the URI ends with the database name
    if (!connectionUri.endsWith('/')) {
      connectionUri += '/';
    }
    connectionUri += dbName;
    
    return connectionUri;
  }

  /**
   * Attach event listeners to a connection
   * @param {mongoose.Connection} connection 
   * @param {string} tenantId 
   */
  attachConnectionListeners(connection, tenantId) {
    connection.on('connected', () => {
      logger.debug(`MongoDB connected for tenant: ${tenantId}`);
    });
    
    connection.on('disconnected', () => {
      logger.warn(`MongoDB disconnected for tenant: ${tenantId}`);
    });
    
    connection.on('error', (err) => {
      logger.error(`MongoDB error for tenant ${tenantId}:`, err);
    });
    
    connection.on('reconnected', () => {
      logger.info(`MongoDB reconnected for tenant: ${tenantId}`);
    });
  }

  /**
   * Update the last used timestamp for a connection
   * @param {string} tenantId 
   */
  updateTimestamp(tenantId) {
    this.connectionTimestamps.set(tenantId, Date.now());
  }

  /**
   * Close a specific tenant connection
   * @param {string} tenantId 
   * @returns {Promise<void>}
   */
  async closeConnection(tenantId) {
    if (this.connections.has(tenantId)) {
      const connection = this.connections.get(tenantId);
      
      try {
        await connection.close();
        logger.info(`Connection closed for tenant: ${tenantId}`);
      } catch (error) {
        logger.error(`Error closing connection for tenant ${tenantId}:`, error);
      }
      
      this.connections.delete(tenantId);
      this.connectionTimestamps.delete(tenantId);
    }
  }

  /**
   * Close all inactive connections
   * @returns {Promise<void>}
   */
  async closeInactiveConnections() {
    const now = Date.now();
    const timeout = dbConfig.tenant.connectionTimeout;
    const tenantsToClose = [];
    
    for (const [tenantId, timestamp] of this.connectionTimestamps.entries()) {
      if (now - timestamp > timeout) {
        tenantsToClose.push(tenantId);
      }
    }
    
    if (tenantsToClose.length > 0) {
      logger.info(`Closing ${tenantsToClose.length} inactive connections`);
      
      for (const tenantId of tenantsToClose) {
        await this.closeConnection(tenantId);
      }
    }
  }

  /**
   * Start the cleanup task for inactive connections
   */
  startCleanupTask() {
    this.cleanupInterval = setInterval(() => {
      this.closeInactiveConnections().catch((error) => {
        logger.error('Error during connection cleanup:', error);
      });
    }, dbConfig.tenant.cleanupInterval);
    
    logger.info('Connection cleanup task started', {
      interval: dbConfig.tenant.cleanupInterval
    });
  }

  /**
   * Stop the cleanup task
   */
  stopCleanupTask() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.info('Connection cleanup task stopped');
    }
  }

  /**
   * Get connection statistics
   * @returns {Object}
   */
  getStats() {
    const stats = {
      totalConnections: this.connections.size,
      connections: []
    };
    
    for (const [tenantId, connection] of this.connections.entries()) {
      const timestamp = this.connectionTimestamps.get(tenantId);
      stats.connections.push({
        tenantId,
        readyState: connection.readyState,
        readyStateString: this.getReadyStateString(connection.readyState),
        lastUsed: timestamp ? new Date(timestamp).toISOString() : null,
        idleTime: timestamp ? Date.now() - timestamp : null
      });
    }
    
    return stats;
  }

  /**
   * Get human-readable ready state string
   * @param {number} readyState 
   * @returns {string}
   */
  getReadyStateString(readyState) {
    const states = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };
    return states[readyState] || 'unknown';
  }

  /**
   * Gracefully close all connections
   * @returns {Promise<void>}
   */
  async closeAll() {
    this.stopCleanupTask();
    
    logger.info(`Closing ${this.connections.size} connections...`);
    
    const closePromises = [];
    for (const tenantId of this.connections.keys()) {
      closePromises.push(this.closeConnection(tenantId));
    }
    
    await Promise.all(closePromises);
    logger.info('All connections closed');
  }
}

module.exports = TenantConnectionManager;
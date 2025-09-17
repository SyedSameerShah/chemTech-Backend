module.exports = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT, 10) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB, 10) || 0,
  
  // Connection options
  options: {
    retryStrategy: (times) => {
      // Reconnect after
      return Math.min(times * 50, 2000);
    },
    enableReadyCheck: true,
    maxRetriesPerRequest: 3,
    connectTimeout: 10000,
    disconnectTimeout: 2000,
    commandTimeout: 5000,
    keepAlive: 30000,
    lazyConnect: false,
    
    // Connection pool settings
    pool: {
      min: 2,
      max: 10
    }
  },
  
  // Key prefixes
  keyPrefix: {
    models: 'models:',
    schemas: 'schemas:',
    metadata: 'metadata:'
  }
};
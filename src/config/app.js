require('dotenv').config();

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  pm2Instances: process.env.PM2_INSTANCES || 1,
  
  // Cache configuration
  cache: {
    l1: {
      maxSize: parseInt(process.env.L1_CACHE_MAX_SIZE, 10) || 500,
      ttl: parseInt(process.env.L1_CACHE_TTL, 10) || 300000 // 5 minutes
    },
    l2: {
      ttl: parseInt(process.env.L2_CACHE_TTL, 10) || 1800000 // 30 minutes
    }
  },
  
  // Rate limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000, // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100
  },
  
  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    dir: process.env.LOG_DIR || 'logs'
  }
};
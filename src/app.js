const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const config = require('./config/app');
const logger = require('./utils/logger');
const requestLogger = require('./middleware/requestLogger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const modelRegistryRoutes = require('./routes/modelRegistry');
const modelRegistry = require('./services/DistributedModelRegistry');
const schemas = require('./models');

// Create Express app
const app = express();

// Trust proxy (for proper IP detection behind load balancers)
app.set('trust proxy', true);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable for API
  crossOriginEmbedderPolicy: false
}));

// CORS middleware
app.use(cors({
  origin: '*', // Configure based on your requirements
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID'],
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting middleware
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      url: req.url
    });
    res.status(429).json({
      error: 'Too many requests, please try again later.'
    });
  }
});

// Apply rate limiting to API routes
app.use('/api/', limiter);

// Request logging middleware
app.use(requestLogger);

// Health check endpoint (outside of /api to avoid rate limiting)
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.env,
    pid: process.pid
  });
});

// API routes
app.use('/api/models', modelRegistryRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Distributed Model Registry',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/health',
      api: {
        models: '/api/models/:tenantId',
        stats: '/api/models/stats',
        schemas: '/api/models/schemas',
        cache: '/api/models/cache/:tenantId'
      }
    }
  });
});

// 404 handler
app.use(notFoundHandler);

// Error handling middleware (must be last)
app.use(errorHandler);

// Initialize model registry with schemas
const initializeRegistry = async () => {
  try {
    logger.info('Initializing model registry...');
    
    // Register all schemas
    modelRegistry.registerSchemas(schemas);
    
    logger.info(`Model registry initialized with ${Object.keys(schemas).length} schemas`);
    
    // Perform initial health check
    const health = await modelRegistry.healthCheck();
    logger.info('Initial health check:', health);
    
  } catch (error) {
    logger.error('Failed to initialize model registry:', error);
    throw error;
  }
};

// Graceful shutdown handler
const gracefulShutdown = async (signal) => {
  logger.info(`Received ${signal}, starting graceful shutdown...`);
  
  try {
    // Stop accepting new requests
    if (global.server) {
      global.server.close(() => {
        logger.info('HTTP server closed');
      });
    }
    
    // Shutdown registry (closes connections and cache)
    await modelRegistry.shutdown();
    
    logger.info('Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
};

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

module.exports = { app, initializeRegistry };
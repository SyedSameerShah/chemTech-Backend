const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const config = require("./config/app");
const logger = require("./utils/logger");
const requestLogger = require("./middleware/requestLogger");
const { errorHandler, notFoundHandler } = require("./middleware/errorHandler");
const { attachTenantConnection } = require("./middleware/tenant");
const masterDataCache = require("./services/MasterDataCache");

// Import routes
const authRoutes = require("./routes/auth");
const masterRoutes = require("./routes/masters");
const projectRoutes = require("./routes/projects");
const inputRoutes = require("./routes/inputs");

// Create Express app
const app = express();

// Trust proxy (for proper IP detection behind load balancers)
app.set("trust proxy", true);

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: false, // Disable for API
    crossOriginEmbedderPolicy: false,
  })
);

// CORS middleware
app.use(
  cors({
    origin: "*", // Configure based on your requirements
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Tenant-ID"],
    credentials: true,
  })
);

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Rate limiting middleware
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn("Rate limit exceeded", {
      ip: req.ip,
      url: req.url,
    });
    res.status(429).json({
      error: "Too many requests, please try again later.",
    });
  },
});

// Apply rate limiting to API routes
app.use("/api/", limiter);

// Request logging middleware
app.use(requestLogger);

// Health check endpoint (outside of /api to avoid rate limiting)
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.env,
    pid: process.pid,
  });
});

// API routes

// Auth routes (no tenant required)
app.use("/api/v1/auth", authRoutes);

// Protected routes that require tenant connection
app.use("/api/v1/masters", masterRoutes);
app.use("/api/v1/projects", attachTenantConnection, projectRoutes);
app.use("/api/v1/inputs", attachTenantConnection, inputRoutes);

// Admin routes
app.get(
  "/api/v1/admin/connections",
  require("./middleware/auth").authenticate,
  require("./middleware/auth").authorize(["admin"]),
  require("./middleware/tenant").getConnectionStats
);
app.delete(
  "/api/v1/admin/connections/:tenantId",
  require("./middleware/auth").authenticate,
  require("./middleware/auth").authorize(["admin"]),
  require("./middleware/tenant").closeTenantConnection
);
app.post(
  "/api/v1/admin/connections/cleanup",
  require("./middleware/auth").authenticate,
  require("./middleware/auth").authorize(["admin"]),
  require("./middleware/tenant").closeInactiveConnections
);

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    name: "Financial Reporting Platform API",
    version: "1.1.0",
    status: "running",
    endpoints: {
      health: "/health",
      api: {
        auth: {
          login: "POST /api/v1/auth/login",
          refresh: "POST /api/v1/auth/refresh",
        },
        masters: {
          collections: "GET /api/v1/masters/collections",
          list: "GET /api/v1/masters/:collection",
          get: "GET /api/v1/masters/:collection/:id",
          create: "POST /api/v1/masters/:collection",
          update: "PUT /api/v1/masters/:collection/:id",
          delete: "DELETE /api/v1/masters/:collection/:id",
        },
        projects: {
          list: "GET /api/v1/projects",
          create: "POST /api/v1/projects",
          get: "GET /api/v1/projects/:projectId",
          update: "PUT /api/v1/projects/:projectId",
          stats: "GET /api/v1/projects/:projectId/stats",
          createVersion: "POST /api/v1/projects/:projectId/versions",
          updateVersion:
            "PATCH /api/v1/projects/:projectId/versions/:versionId/status",
        },
        inputs: {
          equipment: {
            list: "GET /api/v1/inputs/equipmentCost",
            get: "GET /api/v1/inputs/equipmentCost/:recordId",
            create: "POST /api/v1/inputs/equipmentCost",
            bulk: "POST /api/v1/inputs/equipmentCost/bulk",
            update: "PUT /api/v1/inputs/equipmentCost/:recordId",
            delete: "DELETE /api/v1/inputs/equipmentCost/:recordId",
            status: "POST /api/v1/inputs/equipmentCost/status",
          },
        },
      },
    },
  });
});

// 404 handler
app.use(notFoundHandler);

// Error handling middleware (must be last)
app.use(errorHandler);

// Initialize application
const initializeApp = async () => {
  try {
    logger.info("Initializing Financial Reporting Platform...");

    // Initialize master data cache
    logger.info("Master data cache initialized");

    // Log available collections
    const { masterCollections } = require("./models");
    logger.info(`Available master collections: ${masterCollections.length}`, {
      collections: masterCollections,
    });

    logger.info("Application initialized successfully");
  } catch (error) {
    logger.error("Failed to initialize application:", error);
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
        logger.info("HTTP server closed");
      });
    }

    // Close all tenant connections
    const { connectionManager } = require("./middleware/tenant");
    await connectionManager.closeAll();

    // Close Redis connections
    await masterDataCache.close();

    logger.info("Graceful shutdown complete");
    process.exit(0);
  } catch (error) {
    logger.error("Error during graceful shutdown:", error);
    process.exit(1);
  }
};

// Register shutdown handlers
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception:", error);
  gracefulShutdown("uncaughtException");
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection at:", promise, "reason:", reason);
  gracefulShutdown("unhandledRejection");
});

module.exports = { app, initializeApp };

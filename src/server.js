const { app, initializeRegistry } = require('./app');
const config = require('./config/app');
const logger = require('./utils/logger');

const PORT = config.port;

/**
 * Start the server
 */
const startServer = async () => {
  try {
    // Initialize the model registry
    await initializeRegistry();
    
    // Start the server
    global.server = app.listen(PORT, '0.0.0.0', () => {
      logger.info(`Server started successfully`, {
        port: PORT,
        env: config.env,
        pid: process.pid,
        node_version: process.version
      });
      
      console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║        Distributed Model Registry Server Started            ║
║                                                              ║
╠══════════════════════════════════════════════════════════════╣
║  Port:        ${PORT.toString().padEnd(45)} ║
║  Environment: ${config.env.padEnd(45)} ║
║  PID:         ${process.pid.toString().padEnd(45)} ║
║  Node:        ${process.version.padEnd(45)} ║
╠══════════════════════════════════════════════════════════════╣
║  API Endpoints:                                              ║
║  - GET  /health                                              ║
║  - GET  /api/models/stats                                    ║
║  - GET  /api/models/schemas                                  ║
║  - GET  /api/models/:tenantId                                ║
║  - GET  /api/models/:tenantId/:modelName                     ║
║  - POST /api/models/:tenantId/test                           ║
║  - DEL  /api/models/cache/:tenantId                          ║
║  - DEL  /api/models/connection/:tenantId                     ║
╚══════════════════════════════════════════════════════════════╝
      `);
    });
    
    // Handle server errors
    global.server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`Port ${PORT} is already in use`);
      } else {
        logger.error('Server error:', error);
      }
      process.exit(1);
    });
    
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer();
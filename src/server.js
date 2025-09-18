const { app, initializeApp } = require('./app');
const config = require('./config/app');
const logger = require('./utils/logger');

const PORT = config.port;

/**
 * Start the server
 */
const startServer = async () => {
  try {
    // Initialize the application
    await initializeApp();
    
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
║        Financial Reporting Platform API Started              ║
║                                                              ║
╠══════════════════════════════════════════════════════════════╣
║  Port:        ${PORT.toString().padEnd(45)} ║
║  Environment: ${config.env.padEnd(45)} ║
║  PID:         ${process.pid.toString().padEnd(45)} ║
║  Node:        ${process.version.padEnd(45)} ║
╠══════════════════════════════════════════════════════════════╣
║  API Version: v1                                             ║
║  Base URL:    http://localhost:${PORT}/api/v1                     ║
║                                                              ║
║  Key Endpoints:                                              ║
║  - POST /api/v1/auth/login                                   ║
║  - GET  /api/v1/masters/:collection                          ║
║  - POST /api/v1/projects                                     ║
║  - POST /api/v1/inputs/equipmentCost                         ║
║                                                              ║
║  Documentation: /                                             ║
║  Health Check:  /health                                       ║
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
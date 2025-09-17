const logger = require('../utils/logger');

/**
 * Request logging middleware
 */
const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  // Log request
  logger.info('Incoming request', {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    tenantId: req.params.tenantId || req.query.tenantId
  });
  
  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - start;
    
    logger.info('Request completed', {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      tenantId: req.params.tenantId || req.query.tenantId
    });
  });
  
  next();
};

module.exports = requestLogger;
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

/**
 * Error handling middleware
 */
const errorHandler = (err, req, res, next) => {
  // Default to 500 server error
  let statusCode = err.statusCode || err.status || 500;
  let errorCode = err.code || 'INTERNAL_ERROR';
  let message = err.message || 'An unexpected error occurred';
  
  // Handle specific error types
  if (err.name === 'ValidationError') {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    message = 'Validation failed';
  } else if (err.name === 'CastError') {
    statusCode = 400;
    errorCode = 'INVALID_ID';
    message = 'Invalid ID format';
  } else if (err.name === 'MongoServerError' && err.code === 11000) {
    statusCode = 409;
    errorCode = 'DUPLICATE_KEY';
    message = 'Duplicate entry found';
  } else if (err.name === 'UnauthorizedError') {
    statusCode = 401;
    errorCode = 'UNAUTHORIZED';
    message = 'Authentication required';
  }
  
  // Log error
  const errorId = uuidv4();
  logger.error('Request error:', {
    errorId,
    error: err.message,
    stack: err.stack,
    statusCode,
    errorCode,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    tenantId: req.tenantId,
    userId: req.user?.userId,
    requestId: req.requestId
  });
  
  // Prepare error response in standard format
  const errorResponse = {
    success: false,
    error: {
      code: errorCode,
      message: message,
      errorId: errorId
    },
    meta: {
      timestamp: new Date().toISOString(),
      requestId: req.requestId || uuidv4()
    }
  };
  
  // Add additional error details in development
  if (process.env.NODE_ENV === 'development') {
    errorResponse.error.stack = err.stack;
    errorResponse.error.details = err;
  }
  
  // Add validation errors if present
  if (err.errors) {
    errorResponse.error.validationErrors = err.errors;
  }
  
  // Send error response
  res.status(statusCode).json(errorResponse);
};

/**
 * 404 Not Found handler
 */
const notFoundHandler = (req, res, next) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Resource not found: ${req.originalUrl}`
    },
    meta: {
      timestamp: new Date().toISOString(),
      requestId: req.requestId || uuidv4()
    }
  });
};

/**
 * Async error wrapper
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler
};
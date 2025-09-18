const { ZodError } = require('zod');
const logger = require('../utils/logger');

/**
 * Validation middleware factory
 * @param {ZodSchema} schema - Zod schema to validate against
 * @param {string} property - Request property to validate (body, query, params)
 * @returns {Function} Express middleware
 */
const validate = (schema, property = 'body') => {
  return async (req, res, next) => {
    try {
      // Validate the request property
      const validated = await schema.parseAsync(req[property]);
      
      // Replace the original property with validated/transformed data
      req[property] = validated;
      
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        // Format Zod errors
        const formattedErrors = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code
        }));
        
        logger.warn('Validation failed', {
          property,
          errors: formattedErrors,
          requestId: req.requestId
        });
        
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed',
            details: formattedErrors
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId: req.requestId
          }
        });
      }
      
      // Handle unexpected errors
      logger.error('Unexpected validation error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'An unexpected error occurred during validation'
        }
      });
    }
  };
};

/**
 * Validate request body
 * @param {ZodSchema} schema - Zod schema to validate against
 */
const validateBody = (schema) => validate(schema, 'body');

/**
 * Validate query parameters
 * @param {ZodSchema} schema - Zod schema to validate against
 */
const validateQuery = (schema) => validate(schema, 'query');

/**
 * Validate route parameters
 * @param {ZodSchema} schema - Zod schema to validate against
 */
const validateParams = (schema) => validate(schema, 'params');

/**
 * Composite validation middleware
 * Validates multiple request properties
 * @param {Object} schemas - Object with schemas for different properties
 */
const validateRequest = (schemas) => {
  return async (req, res, next) => {
    try {
      // Validate each property
      for (const [property, schema] of Object.entries(schemas)) {
        if (schema && req[property]) {
          req[property] = await schema.parseAsync(req[property]);
        }
      }
      
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const formattedErrors = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code
        }));
        
        logger.warn('Validation failed', {
          errors: formattedErrors,
          requestId: req.requestId
        });
        
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed',
            details: formattedErrors
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId: req.requestId
          }
        });
      }
      
      logger.error('Unexpected validation error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'An unexpected error occurred during validation'
        }
      });
    }
  };
};

/**
 * Sanitize user input to prevent XSS
 * @param {any} input - Input to sanitize
 * @returns {any} Sanitized input
 */
const sanitizeInput = (input) => {
  if (typeof input === 'string') {
    // Basic XSS prevention - remove script tags and encode HTML entities
    return input
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }
  
  if (Array.isArray(input)) {
    return input.map(sanitizeInput);
  }
  
  if (input && typeof input === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(input)) {
      sanitized[key] = sanitizeInput(value);
    }
    return sanitized;
  }
  
  return input;
};

/**
 * Sanitization middleware
 * Sanitizes request body to prevent XSS attacks
 */
const sanitizeBody = (req, res, next) => {
  if (req.body) {
    req.body = sanitizeInput(req.body);
  }
  next();
};

module.exports = {
  validate,
  validateBody,
  validateQuery,
  validateParams,
  validateRequest,
  sanitizeInput,
  sanitizeBody
};
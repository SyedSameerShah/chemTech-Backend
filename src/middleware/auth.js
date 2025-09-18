const jwt = require("jsonwebtoken");
const logger = require("../utils/logger");
const { v4: uuidv4 } = require("uuid");

// Mock JWT secrets - in production these should be from environment variables
const JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || "your-super-secret-access-key";
const JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "your-super-secret-refresh-key";
const JWT_ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY || "15m";
const JWT_REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || "7d";

/**
 * Generate JWT tokens
 * @param {Object} payload - User data to encode
 * @returns {Object} Access and refresh tokens
 */
const generateTokens = (payload) => {
  const tokenId = uuidv4();

  const accessToken = jwt.sign(
    {
      ...payload,
      tokenId,
      type: "access",
    },
    JWT_ACCESS_SECRET,
    {
      expiresIn: JWT_ACCESS_EXPIRY,
      algorithm: "HS256",
    }
  );

  const refreshToken = jwt.sign(
    {
      userId: payload.userId,
      tenantId: payload.tenantId,
      tokenId,
      type: "refresh",
    },
    JWT_REFRESH_SECRET,
    {
      expiresIn: JWT_REFRESH_EXPIRY,
      algorithm: "HS256",
    }
  );

  return { accessToken, refreshToken, tokenId };
};

/**
 * Verify JWT token
 * @param {string} token - JWT token to verify
 * @param {string} type - Token type ('access' or 'refresh')
 * @returns {Object} Decoded token payload
 */
const verifyToken = (token, type = "access") => {
  const secret = type === "access" ? JWT_ACCESS_SECRET : JWT_REFRESH_SECRET;

  try {
    const decoded = jwt.verify(token, secret, {
      algorithms: ["HS256"],
    });

    if (decoded.type !== type) {
      throw new Error(
        `Invalid token type. Expected ${type}, got ${decoded.type}`
      );
    }

    return decoded;
  } catch (error) {
    throw error;
  }
};

/**
 * Authentication middleware
 * Validates JWT and attaches user info to request
 */
const authenticate = async (req, res, next) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: {
          code: "NO_AUTH_HEADER",
          message: "Authorization header is required",
        },
      });
    }

    // Check for Bearer token format
    const [bearer, token] = authHeader.split(" ");
    if (bearer !== "Bearer" || !token) {
      return res.status(401).json({
        success: false,
        error: {
          code: "INVALID_AUTH_FORMAT",
          message: "Authorization header must be in format: Bearer <token>",
        },
      });
    }

    // Verify token
    let decoded;
    try {
      decoded = verifyToken(token, "access");
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        return res.status(401).json({
          success: false,
          error: {
            code: "TOKEN_EXPIRED",
            message: "Access token has expired",
          },
        });
      }

      if (error.name === "JsonWebTokenError") {
        return res.status(401).json({
          success: false,
          error: {
            code: "INVALID_TOKEN",
            message: "Invalid access token",
          },
        });
      }

      throw error;
    }

    // Attach user info to request
    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      tenantId: decoded.tenantId,
      role: decoded.role,
      permissions: decoded.permissions || [],
      tokenId: decoded.tokenId,
    };
    req.tenantId = decoded.tenantId;
    // Add request metadata
    req.requestId = req.headers["x-request-id"] || uuidv4();
    req.sessionId = decoded.sessionId;

    logger.info("User authenticated", {
      userId: req.user.userId,
      tenantId: req.user.tenantId,
      requestId: req.requestId,
    });

    next();
  } catch (error) {
    logger.error("Authentication error:", error);
    res.status(500).json({
      success: false,
      error: {
        code: "AUTH_ERROR",
        message: "Authentication failed",
      },
    });
  }
};

/**
 * Tenant resolution middleware
 * Ensures tenant context is available
 */
const resolveTenant = async (req, res, next) => {
  try {
    // Tenant can come from JWT or header
    let tenantId = req.user?.tenantId;

    // Allow override from header for admin users
    const headerTenantId = req.headers["x-tenant-id"];
    if (headerTenantId && req.user?.role === "admin") {
      tenantId = headerTenantId;
      logger.info("Admin override tenant", {
        originalTenant: req.user.tenantId,
        overrideTenant: tenantId,
      });
    }

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: {
          code: "NO_TENANT",
          message: "Tenant ID is required",
        },
      });
    }

    // Validate tenant ID format
    if (!/^[a-zA-Z0-9_-]+$/.test(tenantId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_TENANT_ID",
          message: "Tenant ID contains invalid characters",
        },
      });
    }

    // Attach tenant to request
    req.tenantId = tenantId;

    next();
  } catch (error) {
    logger.error("Tenant resolution error:", error);
    res.status(500).json({
      success: false,
      error: {
        code: "TENANT_ERROR",
        message: "Failed to resolve tenant",
      },
    });
  }
};

/**
 * Role-based access control middleware
 * @param {string[]} allowedRoles - Array of allowed roles
 */
const authorize = (allowedRoles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required",
        },
      });
    }

    // Check if user has one of the allowed roles
    const userRole = req.user.role;
    if (allowedRoles.length > 0 && !allowedRoles.includes(userRole)) {
      logger.warn("Authorization failed", {
        userId: req.user.userId,
        userRole,
        requiredRoles: allowedRoles,
      });

      return res.status(403).json({
        success: false,
        error: {
          code: "FORBIDDEN",
          message: "Insufficient permissions",
        },
      });
    }

    next();
  };
};

/**
 * Permission-based access control middleware
 * @param {string[]} requiredPermissions - Array of required permissions
 */
const requirePermissions = (requiredPermissions = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required",
        },
      });
    }

    const userPermissions = req.user.permissions || [];
    const hasAllPermissions = requiredPermissions.every((perm) =>
      userPermissions.includes(perm)
    );

    if (!hasAllPermissions) {
      logger.warn("Permission check failed", {
        userId: req.user.userId,
        userPermissions,
        requiredPermissions,
      });

      return res.status(403).json({
        success: false,
        error: {
          code: "INSUFFICIENT_PERMISSIONS",
          message: "Missing required permissions",
          details: {
            required: requiredPermissions,
            missing: requiredPermissions.filter(
              (perm) => !userPermissions.includes(perm)
            ),
          },
        },
      });
    }

    next();
  };
};

/**
 * Refresh token endpoint handler
 */
const refreshTokenHandler = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: {
          code: "NO_REFRESH_TOKEN",
          message: "Refresh token is required",
        },
      });
    }

    // Verify refresh token
    let decoded;
    try {
      decoded = verifyToken(refreshToken, "refresh");
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        return res.status(401).json({
          success: false,
          error: {
            code: "REFRESH_TOKEN_EXPIRED",
            message: "Refresh token has expired",
          },
        });
      }

      return res.status(401).json({
        success: false,
        error: {
          code: "INVALID_REFRESH_TOKEN",
          message: "Invalid refresh token",
        },
      });
    }

    // TODO: Fetch full user details from database
    // For now, using minimal payload from refresh token
    const userPayload = {
      userId: decoded.userId,
      tenantId: decoded.tenantId,
      email: `user_${decoded.userId}@tenant_${decoded.tenantId}.com`, // Mock email
      role: "user", // Default role
      permissions: [],
      sessionId: decoded.sessionId || uuidv4(),
    };

    // Generate new token pair
    const tokens = generateTokens(userPayload);

    logger.info("Tokens refreshed", {
      userId: userPayload.userId,
      tenantId: userPayload.tenantId,
      tokenId: tokens.tokenId,
    });

    res.json({
      success: true,
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: JWT_ACCESS_EXPIRY,
      },
    });
  } catch (error) {
    logger.error("Token refresh error:", error);
    res.status(500).json({
      success: false,
      error: {
        code: "REFRESH_ERROR",
        message: "Failed to refresh tokens",
      },
    });
  }
};

module.exports = {
  generateTokens,
  verifyToken,
  authenticate,
  resolveTenant,
  authorize,
  requirePermissions,
  refreshTokenHandler,
};

const express = require('express');
const router = express.Router();
const { refreshTokenHandler } = require('../middleware/auth');
const { validateBody } = require('../middleware/validation');
const { z } = require('zod');

// Validation schemas
const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1)
});

// Routes
router.post('/refresh', validateBody(refreshTokenSchema), refreshTokenHandler);

// Mock login endpoint for testing
router.post('/login', async (req, res) => {
  const { email, password, tenantId } = req.body;
  
  // TODO: Implement actual authentication logic
  // For now, return mock tokens
  const { generateTokens } = require('../middleware/auth');
  
  const userPayload = {
    userId: 'user_' + Date.now(),
    email,
    tenantId,
    role: 'admin',
    permissions: ['create:master', 'update:master', 'approve:input', 'generate:report'],
    sessionId: require('uuid').v4()
  };
  
  const tokens = generateTokens(userPayload);
  
  res.json({
    success: true,
    data: {
      user: userPayload,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m'
    }
  });
});

module.exports = router;
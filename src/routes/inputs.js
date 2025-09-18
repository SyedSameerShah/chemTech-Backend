const express = require('express');
const router = express.Router();
const equipmentCostController = require('../controllers/equipmentCostController');
const { authenticate, resolveTenant, authorize, requirePermissions } = require('../middleware/auth');
const { validateBody, validateQuery, validateParams } = require('../middleware/validation');
const {
  createEquipmentCostSchema,
  updateEquipmentCostSchema,
  bulkCreateEquipmentCostSchema,
  equipmentCostQuerySchema
} = require('../validators');
const { z } = require('zod');

// Apply authentication and tenant resolution to all routes
router.use(authenticate);
router.use(resolveTenant);

// Equipment Cost Routes

// Get equipment costs
router.get(
  '/equipmentCost',
  validateQuery(equipmentCostQuerySchema),
  equipmentCostController.getEquipmentCosts
);

// Get a single equipment cost record
router.get(
  '/equipmentCost/:recordId',
  validateParams(z.object({
    recordId: z.string().min(1)
  })),
  equipmentCostController.getEquipmentCost
);

// Create a new equipment cost record
router.post(
  '/equipmentCost',
  requirePermissions(['create:input']),
  validateBody(createEquipmentCostSchema),
  equipmentCostController.createEquipmentCost
);

// Bulk create equipment cost records
router.post(
  '/equipmentCost/bulk',
  requirePermissions(['create:input']),
  validateBody(bulkCreateEquipmentCostSchema),
  equipmentCostController.bulkCreateEquipmentCosts
);

// Update an equipment cost record
router.put(
  '/equipmentCost/:recordId',
  requirePermissions(['update:input']),
  validateParams(z.object({
    recordId: z.string().min(1)
  })),
  validateBody(updateEquipmentCostSchema),
  equipmentCostController.updateEquipmentCost
);

// Delete an equipment cost record
router.delete(
  '/equipmentCost/:recordId',
  requirePermissions(['delete:input']),
  validateParams(z.object({
    recordId: z.string().min(1)
  })),
  equipmentCostController.deleteEquipmentCost
);

// Update equipment cost status (approve/reject)
router.post(
  '/equipmentCost/status',
  authorize(['admin', 'manager', 'approver']),
  requirePermissions(['approve:input']),
  validateBody(z.object({
    recordIds: z.array(z.string()).min(1),
    status: z.enum(['Submitted', 'Approved', 'Rejected']),
    reason: z.string().optional()
  })),
  equipmentCostController.updateEquipmentCostStatus
);

// TODO: Add routes for other input types (plantCost, utilityConsumption, etc.)

module.exports = router;
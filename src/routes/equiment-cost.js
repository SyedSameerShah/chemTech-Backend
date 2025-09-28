const express = require("express");
const router = express.Router();
const equipmentCostController = require("../controllers/equipmentCostController");
const {
  authenticate,
  resolveTenant,
  authorize,
  requirePermissions,
} = require("../middleware/auth");
const {
  validateBody,
  validateQuery,
  validateParams,
} = require("../middleware/validation");
const { attachTenantConnection } = require("../middleware/tenant");
const {
  createEquipmentCostSchema,
  updateEquipmentCostSchema,
  bulkCreateEquipmentCostSchema,
  equipmentCostQuerySchema,
} = require("../validators");
const { z } = require("zod");

// Apply authentication and tenant resolution to all routes
router.use(authenticate);
router.use(resolveTenant);
router.use(attachTenantConnection);

// Status update schema (not in validators file)
const statusUpdateSchema = z.object({
  recordIds: z.array(z.string()).min(1),
  status: z.enum(["Draft", "Submitted", "Approved", "Rejected"]),
  reason: z.string().optional(),
});

// Get all equipment costs
router.get(
  "/",
  validateQuery(equipmentCostQuerySchema),
  equipmentCostController.getEquipmentCosts
);

// Get a single equipment cost record
router.get(
  "/:recordId",
  validateParams(
    z.object({
      recordId: z.string().min(1),
    })
  ),
  equipmentCostController.getEquipmentCost
);

// Create a new equipment cost record
router.post(
  "/",
  requirePermissions(["approve:input"]),
  validateBody(createEquipmentCostSchema),
  equipmentCostController.createEquipmentCost
);

// Bulk create equipment cost records
router.post(
  "/bulk",
  requirePermissions(["approve:input"]),
  validateBody(bulkCreateEquipmentCostSchema),
  equipmentCostController.bulkCreateEquipmentCosts
);

// Update equipment cost status (approve/reject)
router.post(
  "/status",
  authorize(["admin", "manager", "approver"]),
  requirePermissions(["approve:input"]),
  validateBody(statusUpdateSchema),
  equipmentCostController.updateEquipmentCostStatus
);

// Update an equipment cost record
router.put(
  "/:recordId",
  requirePermissions(["update:input"]),
  validateParams(
    z.object({
      recordId: z.string().min(1),
    })
  ),
  validateBody(updateEquipmentCostSchema),
  equipmentCostController.updateEquipmentCost
);

// Delete an equipment cost record
router.delete(
  "/:recordId",
  requirePermissions(["delete:input"]),
  validateParams(
    z.object({
      recordId: z.string().min(1),
    })
  ),
  equipmentCostController.deleteEquipmentCost
);

module.exports = router;
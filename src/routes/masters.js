const express = require("express");
const router = express.Router();
const masterDataController = require("../controllers/masterDataController");
const {
  authenticate,
  resolveTenant,
  authorize,
  requirePermissions,
} = require("../middleware/auth");
const { attachTenantConnection } = require("../middleware/tenant");
const {
  validateBody,
  validateQuery,
  validateParams,
} = require("../middleware/validation");
const {
  masterDataCreateSchema,
  masterDataUpdateSchema,
  masterDataQuerySchema,
} = require("../validators");
const { z } = require("zod");

// Validation schema for collection name
const collectionNameSchema = z.object({
  collectionName: z
    .string()
    .regex(/^[a-z_]+$/, "Collection name must be lowercase with underscores"),
});

// Apply authentication and tenant resolution to all routes
router.use(authenticate);
router.use(resolveTenant);
router.use(attachTenantConnection);
// Get all master collections
router.get("/collections", masterDataController.getCollections);

// Get all items from a master collection
router.get(
  "/:collectionName",
  validateParams(collectionNameSchema),
  validateQuery(masterDataQuerySchema),
  masterDataController.getAll
);

// Get a single item from a master collection
router.get(
  "/:collectionName/:id",
  validateParams(
    collectionNameSchema.extend({
      id: z.string().min(1),
    })
  ),
  masterDataController.getOne
);

// Create a new item in a master collection
router.post(
  "/:collectionName",
  authorize(["admin", "manager"]),
  requirePermissions(["create:master"]),
  validateParams(collectionNameSchema),
  validateBody(masterDataCreateSchema),
  masterDataController.create
);

// Update an item in a master collection
router.put(
  "/:collectionName/:id",
  authorize(["admin", "manager"]),
  requirePermissions(["update:master"]),
  validateParams(
    collectionNameSchema.extend({
      id: z.string().min(1),
    })
  ),
  validateBody(masterDataUpdateSchema),
  masterDataController.update
);

// Delete (soft) an item in a master collection
router.delete(
  "/:collectionName/:id",
  authorize(["admin"]),
  requirePermissions(["update:master"]),
  validateParams(
    collectionNameSchema.extend({
      id: z.string().min(1),
    })
  ),
  masterDataController.remove
);

module.exports = router;

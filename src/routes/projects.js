const express = require("express");
const router = express.Router();
const projectController = require("../controllers/projectController");
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
  createProjectSchema,
  updateProjectSchema,
  projectQuerySchema,
  createVersionSchema,
  updateVersionStatusSchema,
} = require("../validators");
const { z } = require("zod");

// Apply authentication and tenant resolution to all routes
router.use(authenticate);
router.use(resolveTenant);
router.use(attachTenantConnection);

// Get all projects
router.get(
  "/",
  validateQuery(projectQuerySchema),
  projectController.getAllProjects
);

// Create a new project
router.post(
  "/",
  // requirePermissions(["create:project"]),
  validateBody(createProjectSchema),
  projectController.createProject
);

// Get a single project
router.get(
  "/:projectId",
  validateParams(
    z.object({
      projectId: z.string().min(1),
    })
  ),
  projectController.getProject
);

// Update a project
router.put(
  "/:projectId",
  requirePermissions(["update:project"]),
  validateParams(
    z.object({
      projectId: z.string().min(1),
    })
  ),
  validateBody(updateProjectSchema),
  projectController.updateProject
);

// Get project statistics
router.get(
  "/:projectId/stats",
  validateParams(
    z.object({
      projectId: z.string().min(1),
    })
  ),
  validateQuery(
    z.object({
      versionId: z.string().optional(),
    })
  ),
  projectController.getProjectStats
);

// Create a new version
router.post(
  "/:projectId/versions",
  requirePermissions(["create:version"]),
  validateParams(
    z.object({
      projectId: z.string().min(1),
    })
  ),
  validateBody(createVersionSchema),
  projectController.createVersion
);

// Update version status
router.patch(
  "/:projectId/versions/:versionId/status",
  requirePermissions(["update:version"]),
  validateParams(
    z.object({
      projectId: z.string().min(1),
      versionId: z.string().min(1),
    })
  ),
  validateBody(updateVersionStatusSchema),
  projectController.updateVersionStatus
);

module.exports = router;

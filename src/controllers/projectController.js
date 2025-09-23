const logger = require("../utils/logger");
const Project = require("../models/Project");
const EquipmentCost = require("../models/EquipmentCost");
const AuditLog = require("../models/AuditLog");
const { v4: uuidv4 } = require("uuid");
const distributedModelRegistry = require("../services/DistributedModelRegistry");

/**
 * Get all projects
 */
const getAllProjects = async (req, res) => {
  try {
    const {
      search,
      industryType,
      plantType,
      isActive,
      startDate,
      endDate,
      page = 1,
      limit = 20,
      sortBy = "createdOn",
      sortOrder = "desc",
    } = req.query;

    // Get tenant connection
    const tenantConnection = req.tenantConnection;
    const ProjectModel = await distributedModelRegistry.getModel(
      tenantConnection.tenantId,
      "Project",
      Project
    );

    // Build query
    const query = {};

    if (search) {
      query.$or = [
        { projectId: { $regex: search, $options: "i" } },
        { projectName: { $regex: search, $options: "i" } },
        { caseNumber: { $regex: search, $options: "i" } },
        { clientName: { $regex: search, $options: "i" } },
      ];
    }

    if (industryType) {
      query.industryType = industryType;
    }

    if (plantType) {
      query.plantType = plantType;
    }

    if (isActive !== undefined) {
      query.isActive = isActive;
    }

    if (startDate || endDate) {
      query.createdOn = {};
      if (startDate) query.createdOn.$gte = new Date(startDate);
      if (endDate) query.createdOn.$lte = new Date(endDate);
    }

    // Execute query with pagination
    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === "asc" ? 1 : -1 };

    const [projects, total] = await Promise.all([
      ProjectModel.find(query)
        .select("-versions")
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      ProjectModel.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: {
        projects,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      },
    });
  } catch (error) {
    logger.error("Error fetching projects:", error);
    res.status(500).json({
      success: false,
      error: {
        code: "FETCH_ERROR",
        message: "Failed to fetch projects",
      },
    });
  }
};

/**
 * Get a single project with versions
 */
const getProject = async (req, res) => {
  try {
    const { projectId } = req.params;

    // Get tenant connection
    const tenantConnection = req.tenantConnection;
    const ProjectModel = await distributedModelRegistry.getModel(
      tenantConnection.tenantId,
      "Project",
      Project
    );

    const project = await ProjectModel.findOne({ projectId }).lean();

    if (!project) {
      return res.status(404).json({
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Project not found",
        },
      });
    }

    res.json({
      success: true,
      data: project,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      },
    });
  } catch (error) {
    logger.error("Error fetching project:", error);
    res.status(500).json({
      success: false,
      error: {
        code: "FETCH_ERROR",
        message: "Failed to fetch project",
      },
    });
  }
};

/**
 * Create a new project
 */
const createProject = async (req, res) => {
  try {
    const data = req.body;

    // Get tenant connection
    const ProjectModel = await distributedModelRegistry.getModel(
      req.tenantId,
      "Project",
      Project
    );
    const AuditLogModel = await distributedModelRegistry.getModel(
      req.tenantId,
      "AuditLog",
      AuditLog
    );
    // Generate project ID and name
    const projectId = ProjectModel.generateProjectId(
      data.industryType,
      data.plantType
    );
    const projectName =
      data.projectName ||
      ProjectModel.generateProjectName(data.industryType, data.plantType);

    // const projectId = data.projectId;

    // Create initial version
    const initialVersion = {
      versionId: `V1_${uuidv4()}`,
      versionNumber: 1,
      status: "In Progress",
      createdOn: new Date(),
      inputStatus: {
        equipmentCost: { isEntered: false, isCompleted: false },
        plantCost: { isEntered: false, isCompleted: false },
        utilityConsumption: { isEntered: false, isCompleted: false },
        rawMaterial: { isEntered: false, isCompleted: false },
        manpower: { isEntered: false, isCompleted: false },
        overhead: { isEntered: false, isCompleted: false },
      },
    };

    // Create project
    const project = new ProjectModel({
      ...data,
      projectId,
      projectName,
      versions: [initialVersion],
      createdBy: req.user.userId,
      updatedBy: req.user.userId,
      createdOn: new Date(),
      updatedOn: new Date(),
    });

    await project.save();

    // // Log audit
    await AuditLogModel.logAction({
      userId: req.user.userId,
      userEmail: req.user.email,
      tenantId: req.tenantId,
      action: "CREATE",
      resource: "project",
      resourceId: project.projectId,
      resourceName: project.projectName,
      after: project.toObject(),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      requestId: req.requestId,
      sessionId: req.sessionId,
    });

    res.status(201).json({
      success: true,
      data: project,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      },
    });
  } catch (error) {
    logger.error("Error creating project:", error);
    res.status(500).json({
      success: false,
      error: {
        code: "CREATE_ERROR",
        message: "Failed to create project",
      },
    });
  }
};

/**
 * Update a project
 */
const updateProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    const updates = req.body;

    // Get tenant connection
    const tenantConnection = req.tenantConnection;
    const ProjectModel = await distributedModelRegistry.getModel(
      req.tenantId,
      "Project",
      Project
    );
    const AuditLogModel = await distributedModelRegistry.getModel(
      req.tenantId,
      "AuditLog",
      AuditLog
    );
    const project = await ProjectModel.findOne({ projectId });

    if (!project) {
      return res.status(404).json({
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Project not found",
        },
      });
    }

    // Store original state for audit
    const before = project.toObject();

    // Apply updates (excluding versions)
    const { versions, ...allowedUpdates } = updates;
    Object.assign(project, allowedUpdates, {
      updatedBy: req.user.userId,
      updatedOn: new Date(),
    });

    await project.save();

    // Log audit
    await AuditLogModel.logAction({
      userId: req.user.userId,
      userEmail: req.user.email,
      tenantId: req.tenantId,
      action: "UPDATE",
      resource: "project",
      resourceId: project.projectId,
      resourceName: project.projectName,
      before,
      after: project.toObject(),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      requestId: req.requestId,
      sessionId: req.sessionId,
    });

    res.json({
      success: true,
      data: project,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      },
    });
  } catch (error) {
    logger.error("Error updating project:", error);
    res.status(500).json({
      success: false,
      error: {
        code: "UPDATE_ERROR",
        message: "Failed to update project",
      },
    });
  }
};

/**
 * Create a new version of a project
 */
const createVersion = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { sourceVersionId, notes } = req.body;

    // Get tenant connection
    const tenantConnection = req.tenantConnection;
    const ProjectModel = await distributedModelRegistry.getModel(
      tenantConnection.tenantId,
      "Project",
      Project
    );
    const EquipmentCostModel = await distributedModelRegistry.getModel(
      tenantConnection.tenantId,
      "EquipmentCost",
      EquipmentCost
    );
    const AuditLogModel = await distributedModelRegistry.getModel(
      tenantConnection.tenantId,
      "AuditLog",
      AuditLog
    );

    // Find project
    const project = await ProjectModel.findOne({ projectId });

    if (!project) {
      return res.status(404).json({
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Project not found",
        },
      });
    }

    // Find source version
    const sourceVersion = project.versions.find(
      (v) => v.versionId === sourceVersionId
    );

    if (!sourceVersion) {
      return res.status(404).json({
        success: false,
        error: {
          code: "VERSION_NOT_FOUND",
          message: "Source version not found",
        },
      });
    }

    // Create new version
    const newVersion = project.createNewVersion(req.user.userId);
    if (notes) {
      newVersion.notes = notes;
    }

    await project.save();

    // Copy all records from source version
    const sourceRecords = await EquipmentCostModel.find({
      projectId,
      versionId: sourceVersionId,
      isActive: true,
    }).lean();

    if (sourceRecords.length > 0) {
      // Create new records for new version
      const newRecords = sourceRecords.map((record) => ({
        ...record,
        _id: undefined,
        recordId: `REC_${uuidv4()}`,
        versionId: newVersion.versionId,
        status: "Draft",
        createdBy: req.user.userId,
        createdOn: new Date(),
        updatedBy: req.user.userId,
        updatedOn: new Date(),
        approvedBy: null,
        approvedOn: null,
      }));

      await EquipmentCostModel.insertMany(newRecords);

      // Update input status
      project.versions[project.versions.length - 1].inputStatus.equipmentCost =
        {
          isEntered: true,
          isCompleted: false,
        };
      await project.save();
    }

    // Log audit
    await AuditLogModel.logAction({
      userId: req.user.userId,
      userEmail: req.user.email,
      tenantId: req.tenantId,
      action: "CREATE",
      resource: "project_version",
      resourceId: newVersion.versionId,
      resourceName: `${project.projectName} - Version ${newVersion.versionNumber}`,
      metadata: {
        projectId,
        sourceVersionId,
        recordsCopied: sourceRecords.length,
      },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      requestId: req.requestId,
      sessionId: req.sessionId,
    });

    res.status(201).json({
      success: true,
      data: {
        project,
        newVersion,
        recordsCopied: sourceRecords.length,
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      },
    });
  } catch (error) {
    logger.error("Error creating version:", error);
    res.status(500).json({
      success: false,
      error: {
        code: "VERSION_ERROR",
        message: "Failed to create version",
      },
    });
  }
};

/**
 * Update version status
 */
const updateVersionStatus = async (req, res) => {
  try {
    const { projectId, versionId } = req.params;
    const { status, notes } = req.body;

    // Get tenant connection
    const tenantConnection = req.tenantConnection;
    const ProjectModel = await distributedModelRegistry.getModel(
      tenantConnection.tenantId,
      "Project",
      Project
    );
    const AuditLogModel = await distributedModelRegistry.getModel(
      tenantConnection.tenantId,
      "AuditLog",
      AuditLog
    );
    const project = await ProjectModel.findOne({ projectId });

    if (!project) {
      return res.status(404).json({
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Project not found",
        },
      });
    }

    // Find version
    const versionIndex = project.versions.findIndex(
      (v) => v.versionId === versionId
    );

    if (versionIndex === -1) {
      return res.status(404).json({
        success: false,
        error: {
          code: "VERSION_NOT_FOUND",
          message: "Version not found",
        },
      });
    }

    // Store original state for audit
    const before = project.toObject();

    // Update version status
    project.versions[versionIndex].status = status;
    if (notes) {
      project.versions[versionIndex].notes = notes;
    }

    // If approving or rejecting, update approval fields
    if (status === "Approved" || status === "Rejected") {
      project.versions[versionIndex].approvedBy = req.user.userId;
      project.versions[versionIndex].approvedOn = new Date();
    }

    project.updatedBy = req.user.userId;
    project.updatedOn = new Date();

    await project.save();

    // Log audit
    await AuditLogModel.logAction({
      userId: req.user.userId,
      userEmail: req.user.email,
      tenantId: req.tenantId,
      action:
        status === "Approved"
          ? "APPROVE"
          : status === "Rejected"
          ? "REJECT"
          : "UPDATE",
      resource: "project_version",
      resourceId: versionId,
      resourceName: `${project.projectName} - Version ${project.versions[versionIndex].versionNumber}`,
      before: before.versions[versionIndex],
      after: project.versions[versionIndex],
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      requestId: req.requestId,
      sessionId: req.sessionId,
    });

    res.json({
      success: true,
      data: {
        project,
        updatedVersion: project.versions[versionIndex],
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      },
    });
  } catch (error) {
    logger.error("Error updating version status:", error);
    res.status(500).json({
      success: false,
      error: {
        code: "UPDATE_ERROR",
        message: "Failed to update version status",
      },
    });
  }
};

/**
 * Get project summary statistics
 */
const getProjectStats = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { versionId } = req.query;

    // Get tenant connection
    const tenantConnection = req.tenantConnection;
    const ProjectModel = await distributedModelRegistry.getModel(
      tenantConnection.tenantId,
      "Project",
      Project
    );
    const EquipmentCostModel = await distributedModelRegistry.getModel(
      tenantConnection.tenantId,
      "EquipmentCost",
      EquipmentCost.schema
    );
    const AuditLogModel = await distributedModelRegistry.getModel(
      tenantConnection.tenantId,
      "AuditLog",
      AuditLog
    );

    const project = await ProjectModel.findOne({ projectId }).lean();

    if (!project) {
      return res.status(404).json({
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Project not found",
        },
      });
    }

    // Build query for equipment costs
    const query = { projectId, isActive: true };
    if (versionId) {
      query.versionId = versionId;
    }

    // Get aggregated statistics
    const stats = await EquipmentCostModel.aggregate([
      { $match: query },
      {
        $group: {
          _id: "$versionId",
          totalItems: { $sum: 1 },
          totalQuantity: { $sum: "$numberQuantity" },
          totalCostBeforeTax: { $sum: "$baseCostBeforeTax" },
          totalTax: { $sum: "$applicableTax" },
          totalCostWithTax: { $sum: "$totalCostWithTax" },
          byCategory: {
            $push: {
              category: "$equipmentCategory",
              cost: "$totalCostWithTax",
            },
          },
          byStatus: {
            $push: "$status",
          },
        },
      },
      {
        $project: {
          versionId: "$_id",
          totalItems: 1,
          totalQuantity: 1,
          totalCostBeforeTax: 1,
          totalTax: 1,
          totalCostWithTax: 1,
          categoryBreakdown: {
            $reduce: {
              input: "$byCategory",
              initialValue: {},
              in: {
                $mergeObjects: [
                  "$$value",
                  {
                    $arrayToObject: [
                      [
                        {
                          k: "$$this.category",
                          v: {
                            $add: [
                              {
                                $ifNull: [
                                  {
                                    $getField: {
                                      field: "$$this.category",
                                      input: "$$value",
                                    },
                                  },
                                  0,
                                ],
                              },
                              "$$this.cost",
                            ],
                          },
                        },
                      ],
                    ],
                  },
                ],
              },
            },
          },
          statusCounts: {
            $reduce: {
              input: "$byStatus",
              initialValue: {
                Draft: 0,
                Submitted: 0,
                Approved: 0,
                Rejected: 0,
              },
              in: {
                Draft: {
                  $cond: [
                    { $eq: ["$$this", "Draft"] },
                    { $add: ["$$value.Draft", 1] },
                    "$$value.Draft",
                  ],
                },
                Submitted: {
                  $cond: [
                    { $eq: ["$$this", "Submitted"] },
                    { $add: ["$$value.Submitted", 1] },
                    "$$value.Submitted",
                  ],
                },
                Approved: {
                  $cond: [
                    { $eq: ["$$this", "Approved"] },
                    { $add: ["$$value.Approved", 1] },
                    "$$value.Approved",
                  ],
                },
                Rejected: {
                  $cond: [
                    { $eq: ["$$this", "Rejected"] },
                    { $add: ["$$value.Rejected", 1] },
                    "$$value.Rejected",
                  ],
                },
              },
            },
          },
        },
      },
    ]);

    res.json({
      success: true,
      data: {
        project: {
          projectId: project.projectId,
          projectName: project.projectName,
          baseCurrency: project.baseCurrency,
          displayUnit: project.displayUnit,
          versions: project.versions.length,
        },
        statistics: stats,
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      },
    });
  } catch (error) {
    logger.error("Error fetching project stats:", error);
    res.status(500).json({
      success: false,
      error: {
        code: "STATS_ERROR",
        message: "Failed to fetch project statistics",
      },
    });
  }
};

module.exports = {
  getAllProjects,
  getProject,
  createProject,
  updateProject,
  createVersion,
  updateVersionStatus,
  getProjectStats,
};

const logger = require("../utils/logger");
const { createMasterModel, MasterDataSchema } = require("../models/MasterData");
const DistributedModelRegistry = require("../services/DistributedModelRegistry");
const { masterCollections } = require("../models");
const AuditLog = require("../models/AuditLog");
const masterDataCache = require("../services/MasterDataCache");
const distributedModelRegistry = require("../services/DistributedModelRegistry");

/**
 * Get all items from a master collection
 */
const getAll = async (req, res) => {
  try {
    const { collectionName } = req.params;
    const {
      search,
      category,
      isActive,
      validOn,
      page = 1,
      limit = 20,
      sortBy = "sortOrder",
      sortOrder = "asc",
    } = req.query;

    // Validate collection name
    if (!masterCollections.includes(collectionName)) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_COLLECTION",
          message: `Invalid collection name: ${collectionName}`,
          details: {
            validCollections: masterCollections,
          },
        },
      });
    }

    // Get tenant connection
    // const tenantConnection = req.tenantConnection;
    const collectionModel = await DistributedModelRegistry.getModel(
      req.tenantId,
      collectionName,
      MasterDataSchema
    );
    console.log("collectionModel", collectionModel);
    // const MasterModel = createMasterModel(collectionName);
    // const Model = tenantConnection.model(
    //   collectionName,
    //   MasterModel.schema,
    //   collectionName
    // );

    // Build query
    const query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { code: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    if (category) {
      query.category = category;
    }

    if (isActive !== undefined) {
      query.isActive = isActive;
    }

    if (validOn) {
      const date = new Date(validOn);
      query.$and = [
        {
          $or: [
            { validFrom: { $exists: false } },
            { validFrom: { $lte: date } },
          ],
        },
        {
          $or: [{ validTo: { $exists: false } }, { validTo: { $gte: date } }],
        },
      ];
    }

    // Check cache first if no filters applied
    let items, total;
    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === "asc" ? 1 : -1 };
    const cacheKey = JSON.stringify({ query, sort, skip, limit });

    // if (Object.keys(query).length === 0 && !search) {
    //   // Try to get from cache
    //   const cachedData = await masterDataCache.get(
    //     req.tenantId,
    //     collectionName,
    //     cacheKey
    //   );
    //   if (cachedData) {
    //     logger.info("Found cached data for master data", {
    //       cachedData,
    //     });
    //     items = cachedData.items;
    //     total = cachedData.total;
    //   }
    // }

    // If not in cache, query database
    if (!items) {
      logger.info("Querying database for master data", {
        query,
        skip,
        limit,
      });
      [items, total] = await Promise.all([
        collectionModel.find(query).skip(skip).limit(limit).lean(),
        collectionModel.countDocuments(query),
      ]);

      // Cache the results if no filters
      if (Object.keys(query).length === 0 && !search) {
        await masterDataCache.set(
          req.tenantId,
          collectionName,
          { items, total },
          cacheKey
        );
      }
    }

    res.json({
      success: true,
      data: {
        items,
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
    logger.error("Error fetching master data:", error);
    res.status(500).json({
      success: false,
      error: {
        code: "FETCH_ERROR",
        message: "Failed to fetch master data",
      },
    });
  }
};

/**
 * Get a single item from a master collection
 */
const getOne = async (req, res) => {
  try {
    const { collectionName, id } = req.params;

    // Validate collection name
    if (!masterCollections.includes(collectionName)) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_COLLECTION",
          message: `Invalid collection name: ${collectionName}`,
        },
      });
    }

    // Get tenant connection
    const tenantConnection = req.tenantConnection;
    const MasterModel = createMasterModel(collectionName);
    const Model = tenantConnection.model(collectionName, MasterModel.schema);

    // Find by ID or code
    const item = await Model.findOne({
      $or: [{ _id: id }, { code: id.toUpperCase() }],
    }).lean();

    if (!item) {
      return res.status(404).json({
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Master data item not found",
        },
      });
    }

    res.json({
      success: true,
      data: item,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      },
    });
  } catch (error) {
    logger.error("Error fetching master data item:", error);
    res.status(500).json({
      success: false,
      error: {
        code: "FETCH_ERROR",
        message: "Failed to fetch master data item",
      },
    });
  }
};

/**
 * Create a new item in a master collection
 */
const create = async (req, res) => {
  try {
    const { collectionName } = req.params;
    const data = req.body;

    // Validate collection name
    if (!masterCollections.includes(collectionName)) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_COLLECTION",
          message: `Invalid collection name: ${collectionName}`,
        },
      });
    }

    // Get tenant connection
    const tenantConnection = req.tenantConnection;
    const MasterModel = createMasterModel(collectionName);
    const Model = tenantConnection.model(collectionName, MasterModel.schema);

    // Check for duplicate code
    const existing = await Model.findOne({
      code: data.code.toUpperCase(),
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        error: {
          code: "DUPLICATE_CODE",
          message: `Item with code ${data.code} already exists`,
        },
      });
    }

    // Create new item
    const item = new Model({
      ...data,
      createdBy: req.user.userId,
      createdOn: new Date(),
    });

    await item.save();

    // Log audit
    await AuditLog.logAction({
      userId: req.user.userId,
      userEmail: req.user.email,
      tenantId: req.tenantId,
      action: "CREATE",
      resource: `master_${collectionName}`,
      resourceId: item._id.toString(),
      resourceName: item.displayName,
      after: item.toObject(),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      requestId: req.requestId,
      sessionId: req.sessionId,
    });

    // Invalidate Redis cache for this collection
    await masterDataCache.invalidateCollection(req.tenantId, collectionName);

    res.status(201).json({
      success: true,
      data: item,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      },
    });
  } catch (error) {
    logger.error("Error creating master data:", error);
    res.status(500).json({
      success: false,
      error: {
        code: "CREATE_ERROR",
        message: "Failed to create master data item",
      },
    });
  }
};

/**
 * Update an item in a master collection
 */
const update = async (req, res) => {
  try {
    const { collectionName, id } = req.params;
    const updates = req.body;

    // Validate collection name
    if (!masterCollections.includes(collectionName)) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_COLLECTION",
          message: `Invalid collection name: ${collectionName}`,
        },
      });
    }

    // Get tenant connection
    // const tenantConnection = req.tenantConnection;
    // const MasterModel = createMasterModel(collectionName);
    // const Model = tenantConnection.model(collectionName, MasterModel.schema);
    const Model = await distributedModelRegistry.getModel(
      req.tenantId,
      collectionName,
      MasterDataSchema
    );

    // Find existing item
    const item = await Model.findById(id);

    if (!item) {
      return res.status(404).json({
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Master data item not found",
        },
      });
    }

    // Store original state for audit
    // const before = item.toObject();

    // Check for duplicate code if updating
    if (updates.code && updates.code !== item.code) {
      const existing = await Model.findOne({
        code: updates.code.toUpperCase(),
        _id: { $ne: id },
      });

      if (existing) {
        return res.status(409).json({
          success: false,
          error: {
            code: "DUPLICATE_CODE",
            message: `Item with code ${updates.code} already exists`,
          },
        });
      }
    }

    // Apply updates
    Object.assign(item, updates, {
      updatedBy: req.user.userId,
      updatedOn: new Date(),
    });

    await item.save();

    // Log audit
    // await AuditLog.logAction({
    //   userId: req.user.userId,
    //   userEmail: req.user.email,
    //   tenantId: req.tenantId,
    //   action: "UPDATE",
    //   resource: `master_${collectionName}`,
    //   resourceId: item._id.toString(),
    //   resourceName: item.displayName,
    //   before,
    //   after: item.toObject(),
    //   ipAddress: req.ip,
    //   userAgent: req.headers["user-agent"],
    //   requestId: req.requestId,
    //   sessionId: req.sessionId,
    // });

    // Invalidate Redis cache for this collection
    await masterDataCache.invalidateCollection(req.tenantId, collectionName);

    res.json({
      success: true,
      data: item,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      },
    });
  } catch (error) {
    logger.error("Error updating master data:", error);
    res.status(500).json({
      success: false,
      error: {
        code: "UPDATE_ERROR",
        message: "Failed to update master data item",
      },
    });
  }
};

/**
 * Soft delete an item in a master collection
 */
const remove = async (req, res) => {
  try {
    const { collectionName, id } = req.params;

    // Validate collection name
    if (!masterCollections.includes(collectionName)) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_COLLECTION",
          message: `Invalid collection name: ${collectionName}`,
        },
      });
    }

    // Get tenant connection
    const tenantConnection = req.tenantConnection;
    const MasterModel = createMasterModel(collectionName);
    const Model = tenantConnection.model(collectionName, MasterModel.schema);

    // Find existing item
    const item = await Model.findById(id);

    if (!item) {
      return res.status(404).json({
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Master data item not found",
        },
      });
    }

    // Check for references before deactivating
    // TODO: Implement reference checking

    // Store original state for audit
    const before = item.toObject();

    // Soft delete
    item.deactivate(req.user.userId);
    await item.save();

    // Log audit
    await AuditLog.logAction({
      userId: req.user.userId,
      userEmail: req.user.email,
      tenantId: req.tenantId,
      action: "DELETE",
      resource: `master_${collectionName}`,
      resourceId: item._id.toString(),
      resourceName: item.displayName,
      before,
      after: item.toObject(),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      requestId: req.requestId,
      sessionId: req.sessionId,
    });

    // Invalidate Redis cache for this collection
    await masterDataCache.invalidateCollection(req.tenantId, collectionName);

    res.json({
      success: true,
      message: "Master data item deactivated successfully",
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      },
    });
  } catch (error) {
    logger.error("Error deleting master data:", error);
    res.status(500).json({
      success: false,
      error: {
        code: "DELETE_ERROR",
        message: "Failed to delete master data item",
      },
    });
  }
};

/**
 * Get all master collections metadata
 */
const getCollections = async (req, res) => {
  try {
    const collections = masterCollections.map((name) => ({
      name,
      displayName: name
        .split("_")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" "),
      // endpoint: `/api/v1/masters/${name}`,
    }));

    res.json({
      success: true,
      data: collections,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      },
    });
  } catch (error) {
    logger.error("Error fetching collections:", error);
    res.status(500).json({
      success: false,
      error: {
        code: "FETCH_ERROR",
        message: "Failed to fetch collections",
      },
    });
  }
};

module.exports = {
  getAll,
  getOne,
  create,
  update,
  remove,
  getCollections,
};

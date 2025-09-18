const logger = require('../utils/logger');
const Project = require('../models/Project');
const EquipmentCost = require('../models/EquipmentCost');
const { createMasterModel } = require('../models/MasterData');
const AuditLog = require('../models/AuditLog');
const { v4: uuidv4 } = require('uuid');

/**
 * Get equipment costs
 */
const getEquipmentCosts = async (req, res) => {
  try {
    const {
      projectId,
      versionId,
      equipmentCategory,
      status,
      vendor,
      startDate,
      endDate,
      page = 1,
      limit = 20,
      sortBy = 'createdOn',
      sortOrder = 'desc'
    } = req.query;
    
    // Get tenant connection
    const tenantConnection = req.tenantConnection;
    const EquipmentCostModel = tenantConnection.model('EquipmentCost', EquipmentCost.schema);
    
    // Build query
    const query = { isActive: true };
    
    if (projectId) query.projectId = projectId;
    if (versionId) query.versionId = versionId;
    if (equipmentCategory) query.equipmentCategory = equipmentCategory;
    if (status) query.status = status;
    if (vendor) query.vendor = { $regex: vendor, $options: 'i' };
    
    if (startDate || endDate) {
      query.createdOn = {};
      if (startDate) query.createdOn.$gte = new Date(startDate);
      if (endDate) query.createdOn.$lte = new Date(endDate);
    }
    
    // Execute query with pagination
    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };
    
    const [items, total] = await Promise.all([
      EquipmentCostModel.find(query)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      EquipmentCostModel.countDocuments(query)
    ]);
    
    res.json({
      success: true,
      data: {
        items,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.requestId
      }
    });
    
  } catch (error) {
    logger.error('Error fetching equipment costs:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch equipment costs'
      }
    });
  }
};

/**
 * Get a single equipment cost record
 */
const getEquipmentCost = async (req, res) => {
  try {
    const { recordId } = req.params;
    
    // Get tenant connection
    const tenantConnection = req.tenantConnection;
    const EquipmentCostModel = tenantConnection.model('EquipmentCost', EquipmentCost.schema);
    
    const record = await EquipmentCostModel.findOne({ 
      recordId,
      isActive: true 
    }).lean();
    
    if (!record) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Equipment cost record not found'
        }
      });
    }
    
    res.json({
      success: true,
      data: record,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.requestId
      }
    });
    
  } catch (error) {
    logger.error('Error fetching equipment cost:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch equipment cost'
      }
    });
  }
};

/**
 * Create a new equipment cost record
 */
const createEquipmentCost = async (req, res) => {
  try {
    const data = req.body;
    
    // Get tenant connection
    const tenantConnection = req.tenantConnection;
    const ProjectModel = tenantConnection.model('Project', Project.schema);
    const EquipmentCostModel = tenantConnection.model('EquipmentCost', EquipmentCost.schema);
    const MasterModel = createMasterModel('equipment_categories');
    const EquipmentCategoryModel = tenantConnection.model('equipment_categories', MasterModel.schema);
    
    // Validate project and version exist
    const project = await ProjectModel.findOne({ 
      projectId: data.projectId 
    });
    
    if (!project) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PROJECT_NOT_FOUND',
          message: 'Project not found'
        }
      });
    }
    
    const version = project.versions.find(v => v.versionId === data.versionId);
    if (!version) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'VERSION_NOT_FOUND',
          message: 'Version not found'
        }
      });
    }
    
    // Get equipment category for default tax
    const equipmentCategory = await EquipmentCategoryModel.findOne({
      name: data.equipmentCategory,
      isActive: true
    });
    
    if (!equipmentCategory) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_CATEGORY',
          message: 'Invalid equipment category'
        }
      });
    }
    
    // Calculate costs
    const calculations = EquipmentCostModel.calculateCosts(
      {
        numberQuantity: data.numberQuantity,
        rate: data.rate
      },
      equipmentCategory.defaultTax,
      project.currencyConversions
    );
    
    // Create record
    const record = new EquipmentCostModel({
      ...data,
      ...calculations,
      recordId: `REC_${uuidv4()}`,
      createdBy: req.user.userId,
      updatedBy: req.user.userId,
      createdOn: new Date(),
      updatedOn: new Date()
    });
    
    await record.save();
    
    // Update project version input status
    const versionIndex = project.versions.findIndex(v => v.versionId === data.versionId);
    project.versions[versionIndex].inputStatus.equipmentCost.isEntered = true;
    project.updatedBy = req.user.userId;
    project.updatedOn = new Date();
    await project.save();
    
    // Log audit
    await AuditLog.logAction({
      userId: req.user.userId,
      userEmail: req.user.email,
      tenantId: req.tenantId,
      action: 'CREATE',
      resource: 'equipment_cost',
      resourceId: record.recordId,
      resourceName: record.equipmentName,
      after: record.toObject(),
      metadata: {
        projectId: data.projectId,
        versionId: data.versionId
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      requestId: req.requestId,
      sessionId: req.sessionId
    });
    
    res.status(201).json({
      success: true,
      data: record,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.requestId
      }
    });
    
  } catch (error) {
    logger.error('Error creating equipment cost:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'CREATE_ERROR',
        message: 'Failed to create equipment cost'
      }
    });
  }
};

/**
 * Update an equipment cost record
 */
const updateEquipmentCost = async (req, res) => {
  try {
    const { recordId } = req.params;
    const updates = req.body;
    
    // Get tenant connection
    const tenantConnection = req.tenantConnection;
    const ProjectModel = tenantConnection.model('Project', Project.schema);
    const EquipmentCostModel = tenantConnection.model('EquipmentCost', EquipmentCost.schema);
    const MasterModel = createMasterModel('equipment_categories');
    const EquipmentCategoryModel = tenantConnection.model('equipment_categories', MasterModel.schema);
    
    // Find existing record
    const record = await EquipmentCostModel.findOne({ 
      recordId,
      isActive: true 
    });
    
    if (!record) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Equipment cost record not found'
        }
      });
    }
    
    // Store original state for audit
    const before = record.toObject();
    
    // If updating calculation fields, recalculate
    if (updates.numberQuantity || updates.rate || updates.equipmentCategory) {
      const project = await ProjectModel.findOne({ 
        projectId: record.projectId 
      });
      
      // Get equipment category for tax rate
      const categoryName = updates.equipmentCategory || record.equipmentCategory;
      const equipmentCategory = await EquipmentCategoryModel.findOne({
        name: categoryName,
        isActive: true
      });
      
      if (!equipmentCategory) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_CATEGORY',
            message: 'Invalid equipment category'
          }
        });
      }
      
      // Recalculate costs
      const calculations = EquipmentCostModel.calculateCosts(
        {
          numberQuantity: updates.numberQuantity || record.numberQuantity,
          rate: updates.rate || record.rate
        },
        equipmentCategory.defaultTax,
        project.currencyConversions
      );
      
      Object.assign(updates, calculations);
    }
    
    // Apply updates
    Object.assign(record, updates, {
      updatedBy: req.user.userId,
      updatedOn: new Date()
    });
    
    await record.save();
    
    // Log audit
    await AuditLog.logAction({
      userId: req.user.userId,
      userEmail: req.user.email,
      tenantId: req.tenantId,
      action: 'UPDATE',
      resource: 'equipment_cost',
      resourceId: record.recordId,
      resourceName: record.equipmentName,
      before,
      after: record.toObject(),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      requestId: req.requestId,
      sessionId: req.sessionId
    });
    
    res.json({
      success: true,
      data: record,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.requestId
      }
    });
    
  } catch (error) {
    logger.error('Error updating equipment cost:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'UPDATE_ERROR',
        message: 'Failed to update equipment cost'
      }
    });
  }
};

/**
 * Delete (soft) an equipment cost record
 */
const deleteEquipmentCost = async (req, res) => {
  try {
    const { recordId } = req.params;
    
    // Get tenant connection
    const tenantConnection = req.tenantConnection;
    const EquipmentCostModel = tenantConnection.model('EquipmentCost', EquipmentCost.schema);
    
    const record = await EquipmentCostModel.findOne({ 
      recordId,
      isActive: true 
    });
    
    if (!record) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Equipment cost record not found'
        }
      });
    }
    
    // Store original state for audit
    const before = record.toObject();
    
    // Soft delete
    record.isActive = false;
    record.updatedBy = req.user.userId;
    record.updatedOn = new Date();
    
    await record.save();
    
    // Log audit
    await AuditLog.logAction({
      userId: req.user.userId,
      userEmail: req.user.email,
      tenantId: req.tenantId,
      action: 'DELETE',
      resource: 'equipment_cost',
      resourceId: record.recordId,
      resourceName: record.equipmentName,
      before,
      after: record.toObject(),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      requestId: req.requestId,
      sessionId: req.sessionId
    });
    
    res.json({
      success: true,
      message: 'Equipment cost record deleted successfully',
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.requestId
      }
    });
    
  } catch (error) {
    logger.error('Error deleting equipment cost:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DELETE_ERROR',
        message: 'Failed to delete equipment cost'
      }
    });
  }
};

/**
 * Bulk create equipment cost records
 */
const bulkCreateEquipmentCosts = async (req, res) => {
  try {
    const { projectId, versionId, items } = req.body;
    
    // Get tenant connection
    const tenantConnection = req.tenantConnection;
    const ProjectModel = tenantConnection.model('Project', Project.schema);
    const EquipmentCostModel = tenantConnection.model('EquipmentCost', EquipmentCost.schema);
    const MasterModel = createMasterModel('equipment_categories');
    const EquipmentCategoryModel = tenantConnection.model('equipment_categories', MasterModel.schema);
    
    // Validate project and version
    const project = await ProjectModel.findOne({ projectId });
    
    if (!project) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PROJECT_NOT_FOUND',
          message: 'Project not found'
        }
      });
    }
    
    const version = project.versions.find(v => v.versionId === versionId);
    if (!version) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'VERSION_NOT_FOUND',
          message: 'Version not found'
        }
      });
    }
    
    // Get all unique categories and their tax rates
    const uniqueCategories = [...new Set(items.map(item => item.equipmentCategory))];
    const categories = await EquipmentCategoryModel.find({
      name: { $in: uniqueCategories },
      isActive: true
    }).lean();
    
    const categoryTaxMap = categories.reduce((map, cat) => {
      map[cat.name] = cat.defaultTax;
      return map;
    }, {});
    
    // Validate all categories exist
    const missingCategories = uniqueCategories.filter(cat => !categoryTaxMap[cat]);
    if (missingCategories.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_CATEGORIES',
          message: 'Invalid equipment categories',
          details: { missingCategories }
        }
      });
    }
    
    // Process and calculate costs for each item
    const records = items.map(item => {
      const calculations = EquipmentCostModel.calculateCosts(
        {
          numberQuantity: item.numberQuantity,
          rate: item.rate
        },
        categoryTaxMap[item.equipmentCategory],
        project.currencyConversions
      );
      
      return {
        ...item,
        ...calculations,
        projectId,
        versionId,
        recordId: `REC_${uuidv4()}`,
        status: 'Draft',
        isActive: true,
        createdBy: req.user.userId,
        updatedBy: req.user.userId,
        createdOn: new Date(),
        updatedOn: new Date()
      };
    });
    
    // Bulk insert
    const insertedRecords = await EquipmentCostModel.insertMany(records);
    
    // Update project version input status
    const versionIndex = project.versions.findIndex(v => v.versionId === versionId);
    project.versions[versionIndex].inputStatus.equipmentCost.isEntered = true;
    project.updatedBy = req.user.userId;
    project.updatedOn = new Date();
    await project.save();
    
    // Log audit
    await AuditLog.logAction({
      userId: req.user.userId,
      userEmail: req.user.email,
      tenantId: req.tenantId,
      action: 'CREATE',
      resource: 'equipment_cost_bulk',
      resourceId: `BULK_${uuidv4()}`,
      resourceName: `Bulk create ${insertedRecords.length} records`,
      metadata: {
        projectId,
        versionId,
        recordCount: insertedRecords.length,
        recordIds: insertedRecords.map(r => r.recordId)
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      requestId: req.requestId,
      sessionId: req.sessionId
    });
    
    res.status(201).json({
      success: true,
      data: {
        created: insertedRecords.length,
        records: insertedRecords
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.requestId
      }
    });
    
  } catch (error) {
    logger.error('Error bulk creating equipment costs:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'BULK_CREATE_ERROR',
        message: 'Failed to bulk create equipment costs'
      }
    });
  }
};

/**
 * Approve/reject equipment cost records
 */
const updateEquipmentCostStatus = async (req, res) => {
  try {
    const { recordIds, status, reason } = req.body;
    
    // Get tenant connection
    const tenantConnection = req.tenantConnection;
    const EquipmentCostModel = tenantConnection.model('EquipmentCost', EquipmentCost.schema);
    
    // Find all records
    const records = await EquipmentCostModel.find({
      recordId: { $in: recordIds },
      isActive: true
    });
    
    if (records.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'No records found'
        }
      });
    }
    
    // Update records based on status
    const updatePromises = records.map(record => {
      if (status === 'Approved') {
        record.approve(req.user.userId);
      } else if (status === 'Rejected') {
        record.reject(req.user.userId, reason);
      } else {
        record.status = status;
        record.updatedBy = req.user.userId;
        record.updatedOn = new Date();
      }
      return record.save();
    });
    
    await Promise.all(updatePromises);
    
    // Log audit for each record
    const auditPromises = records.map(record => 
      AuditLog.logAction({
        userId: req.user.userId,
        userEmail: req.user.email,
        tenantId: req.tenantId,
        action: status === 'Approved' ? 'APPROVE' : status === 'Rejected' ? 'REJECT' : 'UPDATE',
        resource: 'equipment_cost',
        resourceId: record.recordId,
        resourceName: record.equipmentName,
        metadata: { status, reason },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        requestId: req.requestId,
        sessionId: req.sessionId
      })
    );
    
    await Promise.all(auditPromises);
    
    res.json({
      success: true,
      data: {
        updated: records.length,
        status
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.requestId
      }
    });
    
  } catch (error) {
    logger.error('Error updating equipment cost status:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'STATUS_UPDATE_ERROR',
        message: 'Failed to update equipment cost status'
      }
    });
  }
};

module.exports = {
  getEquipmentCosts,
  getEquipmentCost,
  createEquipmentCost,
  updateEquipmentCost,
  deleteEquipmentCost,
  bulkCreateEquipmentCosts,
  updateEquipmentCostStatus
};
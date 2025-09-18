const mongoose = require('mongoose');

// Common schema for all master data collections
const masterDataSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    maxlength: 200,
    index: true
  },
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    maxlength: 50,
    index: true
  },
  defaultTax: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
    default: 18
  },
  description: {
    type: String,
    maxlength: 500
  },
  category: {
    type: String,
    maxlength: 100,
    index: true
  },
  subCategory: {
    type: String,
    maxlength: 100
  },
  specifications: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  unitOfMeasure: {
    type: String,
    maxlength: 20,
    default: 'Nos'
  },
  minimumQuantity: {
    type: Number,
    min: 0,
    default: 1
  },
  maximumQuantity: {
    type: Number,
    min: 0
  },
  defaultRate: {
    type: Number,
    min: 0,
    default: 0
  },
  rateRange: {
    min: { type: Number, min: 0 },
    max: { type: Number, min: 0 }
  },
  validFrom: {
    type: Date,
    default: Date.now
  },
  validTo: {
    type: Date
  },
  tags: [{
    type: String,
    maxlength: 50
  }],
  sortOrder: {
    type: Number,
    default: 100,
    index: true
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  createdBy: {
    type: String,
    required: true
  },
  createdOn: {
    type: Date,
    default: Date.now
  },
  updatedBy: {
    type: String
  },
  updatedOn: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: false,
  strict: false // Allow additional fields for different master types
});

// Indexes
masterDataSchema.index({ isActive: 1, sortOrder: 1 });
masterDataSchema.index({ isActive: 1, name: 1 });
masterDataSchema.index({ validFrom: 1, validTo: 1 });

// Pre-save middleware
masterDataSchema.pre('save', function(next) {
  if (!this.isNew) {
    this.updatedOn = new Date();
  }
  // Ensure validTo is after validFrom
  if (this.validTo && this.validTo <= this.validFrom) {
    next(new Error('validTo must be after validFrom'));
  }
  next();
});

// Instance methods
masterDataSchema.methods.isValid = function(date = new Date()) {
  if (!this.isActive) return false;
  if (this.validFrom && date < this.validFrom) return false;
  if (this.validTo && date > this.validTo) return false;
  return true;
};

masterDataSchema.methods.deactivate = function(userId) {
  this.isActive = false;
  this.updatedBy = userId;
  this.updatedOn = new Date();
};

// Static methods
masterDataSchema.statics.findActive = function(filter = {}) {
  return this.find({ ...filter, isActive: true }).sort({ sortOrder: 1, name: 1 });
};

masterDataSchema.statics.findValid = function(date = new Date(), filter = {}) {
  return this.find({
    ...filter,
    isActive: true,
    $or: [
      { validFrom: { $exists: false } },
      { validFrom: { $lte: date } }
    ],
    $and: [
      {
        $or: [
          { validTo: { $exists: false } },
          { validTo: { $gte: date } }
        ]
      }
    ]
  }).sort({ sortOrder: 1, name: 1 });
};

// Virtual for display
masterDataSchema.virtual('displayName').get(function() {
  return `${this.name} (${this.code})`;
});

// Factory function to create models for different master collections
const createMasterModel = (collectionName) => {
  const modelName = collectionName
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
  
  // Clone the schema for each collection
  const schema = masterDataSchema.clone();
  
  // Add collection-specific customizations if needed
  switch(collectionName) {
    case 'equipment_categories':
      schema.add({
        equipmentType: { type: String, maxlength: 100 },
        capacityRange: {
          min: { type: Number },
          max: { type: Number },
          unit: { type: String }
        }
      });
      break;
    case 'industry_types':
      schema.add({
        sector: { type: String, maxlength: 100 },
        regulatoryRequirements: [{ type: String }]
      });
      break;
    case 'plant_types':
      schema.add({
        industryType: { type: String, maxlength: 100 },
        typicalCapacity: { type: String },
        processType: { type: String }
      });
      break;
  }
  
  return mongoose.model(modelName, schema, collectionName);
};

module.exports = {
  MasterDataSchema: masterDataSchema,
  createMasterModel
};
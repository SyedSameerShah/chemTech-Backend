const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const equipmentCostSchema = new mongoose.Schema({
  recordId: {
    type: String,
    required: true,
    unique: true,
    default: () => `REC_${uuidv4()}`,
    index: true
  },
  projectId: {
    type: String,
    required: true,
    index: true
  },
  versionId: {
    type: String,
    required: true,
    index: true
  },
  equipmentCategory: {
    type: String,
    required: true,
    maxlength: 100
  },
  equipmentName: {
    type: String,
    required: true,
    maxlength: 200
  },
  numberQuantity: {
    type: Number,
    required: true,
    min: 0,
    validate: {
      validator: Number.isInteger,
      message: 'Quantity must be a whole number'
    }
  },
  rate: {
    type: Number,
    required: true,
    min: 0
  },
  baseCostBeforeTax: {
    type: Number,
    required: true,
    min: 0
  },
  applicableTaxPercent: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
    default: 18
  },
  applicableTax: {
    type: Number,
    required: true,
    min: 0
  },
  totalCostWithTax: {
    type: Number,
    required: true,
    min: 0
  },
  // Dynamic currency fields will be added based on project currency conversions
  totalCostInUSD: {
    type: Number,
    min: 0
  },
  totalCostInEUR: {
    type: Number,
    min: 0
  },
  totalCostInGBP: {
    type: Number,
    min: 0
  },
  // Additional fields for enhanced functionality
  specifications: {
    type: String,
    maxlength: 500
  },
  vendor: {
    type: String,
    maxlength: 200
  },
  leadTime: {
    type: Number,
    min: 0,
    comment: 'Lead time in days'
  },
  warrantyPeriod: {
    type: Number,
    min: 0,
    comment: 'Warranty period in months'
  },
  notes: {
    type: String,
    maxlength: 1000
  },
  attachments: [{
    fileName: String,
    fileUrl: String,
    uploadedOn: { type: Date, default: Date.now }
  }],
  status: {
    type: String,
    enum: ['Draft', 'Submitted', 'Approved', 'Rejected'],
    default: 'Draft',
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
    default: Date.now,
    index: true
  },
  updatedBy: {
    type: String
  },
  updatedOn: {
    type: Date,
    default: Date.now
  },
  approvedBy: {
    type: String
  },
  approvedOn: {
    type: Date
  }
}, {
  timestamps: false,
  collection: 'equipment_cost'
});

// Compound indexes for performance
equipmentCostSchema.index({ projectId: 1, versionId: 1, status: 1 });
equipmentCostSchema.index({ projectId: 1, versionId: 1, equipmentCategory: 1 });
equipmentCostSchema.index({ createdOn: -1 });
equipmentCostSchema.index({ isActive: 1, status: 1 });

// Static method to calculate costs
equipmentCostSchema.statics.calculateCosts = function(input, taxPercent, currencyConversions) {
  const baseCostBeforeTax = input.numberQuantity * input.rate;
  const applicableTax = (baseCostBeforeTax * taxPercent) / 100;
  const totalCostWithTax = baseCostBeforeTax + applicableTax;
  
  // Calculate currency conversions
  const currencyCosts = {};
  currencyConversions.forEach(conv => {
    const fieldName = `totalCostIn${conv.currencyCode}`;
    currencyCosts[fieldName] = totalCostWithTax / conv.conversionFactor;
  });
  
  return {
    baseCostBeforeTax: Math.round(baseCostBeforeTax * 100) / 100,
    applicableTaxPercent: taxPercent,
    applicableTax: Math.round(applicableTax * 100) / 100,
    totalCostWithTax: Math.round(totalCostWithTax * 100) / 100,
    ...currencyCosts
  };
};

// Pre-save middleware
equipmentCostSchema.pre('save', function(next) {
  if (!this.isNew) {
    this.updatedOn = new Date();
  }
  next();
});

// Instance method to approve record
equipmentCostSchema.methods.approve = function(userId) {
  this.status = 'Approved';
  this.approvedBy = userId;
  this.approvedOn = new Date();
  this.updatedBy = userId;
  this.updatedOn = new Date();
};

// Instance method to reject record
equipmentCostSchema.methods.reject = function(userId, reason) {
  this.status = 'Rejected';
  this.updatedBy = userId;
  this.updatedOn = new Date();
  if (reason) {
    this.notes = `Rejected: ${reason}. ${this.notes || ''}`.substring(0, 1000);
  }
};

// Virtual for display formatting
equipmentCostSchema.virtual('displayCost').get(function() {
  return {
    baseCost: this.baseCostBeforeTax.toLocaleString('en-IN'),
    tax: this.applicableTax.toLocaleString('en-IN'),
    total: this.totalCostWithTax.toLocaleString('en-IN')
  };
});

module.exports = equipmentCostSchema;
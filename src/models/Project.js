const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

// Input status schema
const inputStatusSchema = new mongoose.Schema(
  {
    isEntered: { type: Boolean, default: false },
    isCompleted: { type: Boolean, default: false },
  },
  { _id: false }
);

// Currency conversion schema
const currencyConversionSchema = new mongoose.Schema(
  {
    currencyCode: {
      type: String,
      required: true,
      uppercase: true,
      minlength: 3,
      maxlength: 3,
    },
    conversionFactor: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

// Version schema
const versionSchema = new mongoose.Schema(
  {
    versionId: {
      type: String,
      required: true,
      unique: true,
      default: () => `V1_${uuidv4()}`,
    },
    versionNumber: {
      type: Number,
      required: true,
      min: 1,
    },
    status: {
      type: String,
      enum: [
        "Draft",
        "In Progress",
        "Pending Approval",
        "Approved",
        "Rejected",
      ],
      default: "In Progress",
    },
    createdOn: {
      type: Date,
      default: Date.now,
    },
    inputStatus: {
      equipmentCost: { type: inputStatusSchema, default: () => ({}) },
      plantCost: { type: inputStatusSchema, default: () => ({}) },
      utilityConsumption: { type: inputStatusSchema, default: () => ({}) },
      rawMaterial: { type: inputStatusSchema, default: () => ({}) },
      manpower: { type: inputStatusSchema, default: () => ({}) },
      overhead: { type: inputStatusSchema, default: () => ({}) },
    },
    approvedBy: {
      type: String,
      default: null,
    },
    approvedOn: {
      type: Date,
      default: null,
    },
    notes: {
      type: String,
      maxlength: 1000,
    },
  },
  { _id: false }
);

// Main project schema
const projectSchema = new mongoose.Schema(
  {
    projectId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    projectName: {
      type: String,
      required: true,
      maxlength: 200,
    },
    caseNumber: {
      type: String,
      required: true,
      maxlength: 50,
    },
    industryType: {
      type: String,
      required: true,
      maxlength: 100,
    },
    plantType: {
      type: String,
      required: true,
      maxlength: 100,
    },
    baseCurrency: {
      type: String,
      required: true,
      uppercase: true,
      default: "INR",
      enum: ["INR", "USD", "EUR", "GBP", "JPY", "CNY", "AED", "SGD"],
    },
    displayUnit: {
      type: String,
      required: true,
      enum: ["Cr", "Lac", "Million", "Billion", "K"],
      default: "Cr",
    },
    currencyConversions: [currencyConversionSchema],
    versions: {
      type: [versionSchema],
      validate: {
        validator: function (versions) {
          return versions && versions.length > 0;
        },
        message: "Project must have at least one version",
      },
    },
    tags: [
      {
        type: String,
        maxlength: 50,
      },
    ],
    description: {
      type: String,
      maxlength: 1000,
    },
    location: {
      type: String,
      maxlength: 200,
    },
    clientName: {
      type: String,
      maxlength: 200,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    createdBy: {
      type: String,
      required: true,
    },
    createdOn: {
      type: Date,
      default: Date.now,
      index: true,
    },
    updatedBy: {
      type: String,
      required: true,
    },
    updatedOn: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false,
    collection: "projects",
  }
);

// Indexes for performance
projectSchema.index({ projectId: 1, "versions.versionId": 1 });
projectSchema.index({ industryType: 1, plantType: 1 });
projectSchema.index({ createdOn: -1 });
projectSchema.index({ isActive: 1, createdOn: -1 });

// Generate unique project ID
projectSchema.statics.generateProjectId = function (industryType, plantType) {
  const industry = industryType
    .replace(/[^A-Z]/g, "")
    .substring(0, 4)
    .toUpperCase();
  const plant = plantType
    .replace(/[^A-Z]/g, "")
    .substring(0, 4)
    .toUpperCase();
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .substring(0, 14);
  return `${industry}-${plant}-${timestamp}`;
};

// Generate project name
projectSchema.statics.generateProjectName = function (industryType, plantType) {
  return `${industryType} ${plantType} Project`;
};

// Pre-save middleware to update timestamps
projectSchema.pre("save", function (next) {
  if (!this.isNew) {
    this.updatedOn = new Date();
  }
  next();
});

// Method to create new version
projectSchema.methods.createNewVersion = function (userId) {
  const lastVersion = this.versions[this.versions.length - 1];
  const newVersionNumber = lastVersion.versionNumber + 1;

  const newVersion = {
    versionId: `V${newVersionNumber}_${uuidv4()}`,
    versionNumber: newVersionNumber,
    status: "Draft",
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

  this.versions.push(newVersion);
  this.updatedBy = userId;
  this.updatedOn = new Date();

  return newVersion;
};

// Method to get active version
projectSchema.methods.getActiveVersion = function () {
  // Return the latest approved version or the latest version if none approved
  const approvedVersions = this.versions.filter((v) => v.status === "Approved");
  if (approvedVersions.length > 0) {
    return approvedVersions[approvedVersions.length - 1];
  }
  return this.versions[this.versions.length - 1];
};

module.exports = projectSchema;

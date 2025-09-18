const { z } = require("zod");

// Common schemas
const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid ObjectId format");

const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

const dateRangeSchema = z
  .object({
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
  })
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return data.startDate <= data.endDate;
      }
      return true;
    },
    {
      message: "Start date must be before or equal to end date",
    }
  );

// Currency schemas
const currencyCodeSchema = z
  .string()
  .length(3)
  .regex(/^[A-Z]{3}$/, "Currency code must be 3 uppercase letters");

const currencyConversionSchema = z.object({
  currencyCode: currencyCodeSchema,
  conversionFactor: z.number().positive(),
});

// Master data schemas
const masterDataCreateSchema = z
  .object({
    name: z.string().min(1).max(200).trim(),
    code: z.string().min(1).max(50).trim().toUpperCase(),
    defaultTax: z.number().min(0).max(100).default(18),
    description: z.string().max(500).optional(),
    category: z.string().max(100).optional(),
    subCategory: z.string().max(100).optional(),
    specifications: z.record(z.any()).optional(),
    unitOfMeasure: z.string().max(20).default("Nos"),
    minimumQuantity: z.number().min(0).default(1),
    maximumQuantity: z.number().min(0).optional(),
    defaultRate: z.number().min(0).default(0),
    rateRange: z
      .object({
        min: z.number().min(0),
        max: z.number().min(0),
      })
      .optional(),
    validFrom: z.coerce.date().optional(),
    validTo: z.coerce.date().optional(),
    tags: z.array(z.string().max(50)).optional(),
    sortOrder: z.number().default(100),
    isActive: z.boolean().default(true),
  })
  .refine(
    (data) => {
      if (data.validFrom && data.validTo) {
        return data.validFrom <= data.validTo;
      }
      return true;
    },
    {
      message: "validFrom must be before or equal to validTo",
    }
  )
  .refine(
    (data) => {
      if (data.rateRange) {
        return data.rateRange.min <= data.rateRange.max;
      }
      return true;
    },
    {
      message: "Rate range min must be less than or equal to max",
    }
  );

// const masterDataUpdateSchema = masterDataCreateSchema.partial();
const masterDataUpdateSchema = masterDataCreateSchema;

// Project schemas
const createProjectSchema = z.object({
  caseNumber: z.string().min(1).max(50),
  industryType: z.string().min(1).max(100),
  plantType: z.string().min(1).max(100),
  baseCurrency: z
    .enum(["INR", "USD", "EUR", "GBP", "JPY", "CNY", "AED", "SGD"])
    .default("INR"),
  displayUnit: z.enum(["Cr", "Lac", "Million", "Billion", "K"]).default("Cr"),
  currencyConversions: z.array(currencyConversionSchema).optional(),
  tags: z.array(z.string().max(50)).optional(),
  description: z.string().max(1000).optional(),
  location: z.string().max(200).optional(),
  clientName: z.string().max(200).optional(),
});

const updateProjectSchema = createProjectSchema.partial().extend({
  projectName: z.string().min(1).max(200).optional(),
  isActive: z.boolean().optional(),
});

// Equipment cost schemas
const createEquipmentCostSchema = z.object({
  projectId: z.string().min(1),
  versionId: z.string().min(1),
  equipmentCategory: z.string().min(1).max(100),
  equipmentName: z.string().min(1).max(200),
  numberQuantity: z.number().int().min(0),
  rate: z.number().min(0),
  specifications: z.string().max(500).optional(),
  vendor: z.string().max(200).optional(),
  leadTime: z.number().int().min(0).optional(),
  warrantyPeriod: z.number().int().min(0).optional(),
  notes: z.string().max(1000).optional(),
});

const updateEquipmentCostSchema = createEquipmentCostSchema.partial().extend({
  status: z.enum(["Draft", "Submitted", "Approved", "Rejected"]).optional(),
});

const bulkCreateEquipmentCostSchema = z.object({
  projectId: z.string().min(1),
  versionId: z.string().min(1),
  items: z
    .array(createEquipmentCostSchema.omit({ projectId: true, versionId: true }))
    .min(1)
    .max(100),
});

// Version management schemas
const createVersionSchema = z.object({
  sourceVersionId: z.string().min(1),
  notes: z.string().max(1000).optional(),
});

const updateVersionStatusSchema = z.object({
  status: z.enum([
    "Draft",
    "In Progress",
    "Pending Approval",
    "Approved",
    "Rejected",
  ]),
  notes: z.string().max(1000).optional(),
});

// Query parameter schemas
const masterDataQuerySchema = paginationSchema.extend({
  search: z.string().optional(),
  category: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
  validOn: z.coerce.date().optional(),
});

const projectQuerySchema = paginationSchema.extend({
  search: z.string().optional(),
  industryType: z.string().optional(),
  plantType: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
  ...dateRangeSchema.shape,
});

const equipmentCostQuerySchema = paginationSchema.extend({
  projectId: z.string().optional(),
  versionId: z.string().optional(),
  equipmentCategory: z.string().optional(),
  status: z.enum(["Draft", "Submitted", "Approved", "Rejected"]).optional(),
  vendor: z.string().optional(),
  ...dateRangeSchema.shape,
});

// Export all schemas
module.exports = {
  // Common
  objectIdSchema,
  paginationSchema,
  dateRangeSchema,
  currencyCodeSchema,
  currencyConversionSchema,

  // Master data
  masterDataCreateSchema,
  masterDataUpdateSchema,
  masterDataQuerySchema,

  // Projects
  createProjectSchema,
  updateProjectSchema,
  projectQuerySchema,

  // Equipment costs
  createEquipmentCostSchema,
  updateEquipmentCostSchema,
  bulkCreateEquipmentCostSchema,
  equipmentCostQuerySchema,

  // Versions
  createVersionSchema,
  updateVersionStatusSchema,
};

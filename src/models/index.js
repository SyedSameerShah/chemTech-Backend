const Project = require("./Project");
const EquipmentCost = require("./EquipmentCost");
const MasterData = require("./MasterData");
const AuditLog = require("./AuditLog");

// Master data schema collections
const masterCollections = [
  "equipment_categories",
  "industry_types",
  "plant_types",
  "currency_types",
  "bag_house_filters",
  "belt_conveyors",
  "boiler_types",
  "chimneys",
  "cooling_towers",
  "cranes",
  "electrical_systems",
  "instrumentation_types",
  "material_handling",
  "piping_systems",
  "process_equipment",
  "storage_tanks",
  "utilities",
  "water_treatment",
];

// Export models and collections
module.exports = {
  Project,
  EquipmentCost,
  MasterData,
  AuditLog,
  masterCollections,
};

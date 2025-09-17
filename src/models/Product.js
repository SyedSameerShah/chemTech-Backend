const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
  sku: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    index: 'text'
  },
  description: {
    type: String,
    required: true
  },
  category: {
    type: String,
    required: true,
    index: true
  },
  price: {
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    currency: {
      type: String,
      default: 'USD',
      uppercase: true
    }
  },
  inventory: {
    quantity: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    },
    reserved: {
      type: Number,
      default: 0,
      min: 0
    },
    warehouse: {
      type: String,
      default: 'main'
    }
  },
  attributes: [{
    name: String,
    value: mongoose.Schema.Types.Mixed
  }],
  tags: [{
    type: String,
    lowercase: true,
    trim: true
  }],
  images: [{
    url: String,
    alt: String,
    isPrimary: Boolean
  }],
  status: {
    type: String,
    enum: ['active', 'inactive', 'discontinued', 'draft'],
    default: 'draft',
    index: true
  },
  publishedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true,
  collection: 'products'
});

// Compound indexes
ProductSchema.index({ category: 1, status: 1 });
ProductSchema.index({ 'price.amount': 1, status: 1 });
ProductSchema.index({ tags: 1 });

// Virtual for available quantity
ProductSchema.virtual('availableQuantity').get(function() {
  return this.inventory.quantity - this.inventory.reserved;
});

// Methods
ProductSchema.methods.isAvailable = function() {
  return this.status === 'active' && this.availableQuantity > 0;
};

ProductSchema.methods.reserve = function(quantity) {
  if (this.availableQuantity < quantity) {
    throw new Error('Insufficient inventory');
  }
  this.inventory.reserved += quantity;
  return this.save();
};

// Statics
ProductSchema.statics.findByCategory = function(category) {
  return this.find({ category, status: 'active' });
};

ProductSchema.statics.search = function(query) {
  return this.find(
    { $text: { $search: query }, status: 'active' },
    { score: { $meta: 'textScore' } }
  ).sort({ score: { $meta: 'textScore' } });
};

module.exports = ProductSchema;
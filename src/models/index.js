const UserSchema = require('./User');
const ProductSchema = require('./Product');
const OrderSchema = require('./Order');

// Export all schemas for registration
module.exports = {
  User: UserSchema,
  Product: ProductSchema,
  Order: OrderSchema
};
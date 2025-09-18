module.exports = {
  mongodb: {
    uri: process.env.MONGODB_URI || "mongodb://localhost:27017/",
    poolSize: parseInt(process.env.MONGODB_POOL_SIZE, 10) || 10,
    username: process.env.MONGODB_USERNAME,
    password: process.env.MONGODB_PASSWORD,

    // Default connection options
    defaultOptions: {
      maxPoolSize: parseInt(process.env.MONGODB_POOL_SIZE, 10) || 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      bufferCommands: false,
      // bufferMaxEntries: 0,
      family: 4, // Use IPv4
      retryWrites: true,
      w: "majority",
    },
  },

  // Tenant database configuration
  tenant: {
    dbPrefix: "tenant_",
    connectionTimeout: 30 * 60 * 1000, // 30 minutes
    cleanupInterval: 5 * 60 * 1000, // 5 minutes
  },
};

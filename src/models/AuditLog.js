const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  userEmail: {
    type: String,
    required: true
  },
  tenantId: {
    type: String,
    required: true,
    index: true
  },
  action: {
    type: String,
    required: true,
    enum: ['CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT', 'LOGIN', 'LOGOUT', 'EXPORT', 'IMPORT'],
    index: true
  },
  resource: {
    type: String,
    required: true,
    index: true
  },
  resourceId: {
    type: String,
    required: true,
    index: true
  },
  resourceName: {
    type: String,
    maxlength: 200
  },
  before: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  after: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  changes: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  ipAddress: {
    type: String,
    required: true
  },
  userAgent: {
    type: String,
    maxlength: 500
  },
  requestId: {
    type: String,
    index: true
  },
  sessionId: {
    type: String,
    index: true
  },
  status: {
    type: String,
    enum: ['SUCCESS', 'FAILED', 'UNAUTHORIZED'],
    default: 'SUCCESS',
    index: true
  },
  errorMessage: {
    type: String,
    maxlength: 1000
  },
  duration: {
    type: Number,
    comment: 'Operation duration in milliseconds'
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: false,
  collection: 'audit_logs'
});

// Indexes for efficient querying
auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ userId: 1, timestamp: -1 });
auditLogSchema.index({ resource: 1, resourceId: 1, timestamp: -1 });
auditLogSchema.index({ tenantId: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, status: 1, timestamp: -1 });

// TTL index to automatically delete old audit logs after 2 years
auditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 63072000 }); // 2 years

// Static methods
auditLogSchema.statics.logAction = async function(params) {
  const {
    userId,
    userEmail,
    tenantId,
    action,
    resource,
    resourceId,
    resourceName,
    before,
    after,
    ipAddress,
    userAgent,
    requestId,
    sessionId,
    status = 'SUCCESS',
    errorMessage,
    duration,
    metadata
  } = params;
  
  // Calculate changes if before and after are provided
  let changes = {};
  if (before && after && typeof before === 'object' && typeof after === 'object') {
    changes = calculateChanges(before, after);
  }
  
  const auditLog = new this({
    userId,
    userEmail,
    tenantId,
    action,
    resource,
    resourceId,
    resourceName,
    before,
    after,
    changes,
    ipAddress,
    userAgent,
    requestId,
    sessionId,
    status,
    errorMessage,
    duration,
    metadata,
    timestamp: new Date()
  });
  
  return await auditLog.save();
};

// Helper function to calculate changes
function calculateChanges(before, after) {
  const changes = {};
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  
  for (const key of allKeys) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      changes[key] = {
        from: before[key],
        to: after[key]
      };
    }
  }
  
  return changes;
}

// Instance methods
auditLogSchema.methods.getFormattedLog = function() {
  const actionDescriptions = {
    CREATE: 'created',
    UPDATE: 'updated',
    DELETE: 'deleted',
    APPROVE: 'approved',
    REJECT: 'rejected',
    LOGIN: 'logged in',
    LOGOUT: 'logged out',
    EXPORT: 'exported',
    IMPORT: 'imported'
  };
  
  const description = `${this.userEmail} ${actionDescriptions[this.action]} ${this.resource} ${this.resourceName || this.resourceId}`;
  
  return {
    description,
    timestamp: this.timestamp,
    status: this.status,
    duration: this.duration,
    ipAddress: this.ipAddress
  };
};

// Query helpers
auditLogSchema.statics.findByUser = function(userId, options = {}) {
  const { startDate, endDate, limit = 100, skip = 0 } = options;
  const query = { userId };
  
  if (startDate || endDate) {
    query.timestamp = {};
    if (startDate) query.timestamp.$gte = startDate;
    if (endDate) query.timestamp.$lte = endDate;
  }
  
  return this.find(query)
    .sort({ timestamp: -1 })
    .limit(limit)
    .skip(skip);
};

auditLogSchema.statics.findByResource = function(resource, resourceId, options = {}) {
  const { limit = 100, skip = 0 } = options;
  
  return this.find({ resource, resourceId })
    .sort({ timestamp: -1 })
    .limit(limit)
    .skip(skip);
};

auditLogSchema.statics.getActivitySummary = async function(tenantId, startDate, endDate) {
  const pipeline = [
    {
      $match: {
        tenantId,
        timestamp: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: {
          action: '$action',
          resource: '$resource',
          status: '$status'
        },
        count: { $sum: 1 },
        avgDuration: { $avg: '$duration' }
      }
    },
    {
      $sort: { count: -1 }
    }
  ];
  
  return await this.aggregate(pipeline);
};

module.exports = mongoose.model('AuditLog', auditLogSchema);
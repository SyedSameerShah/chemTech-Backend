# Distributed Model Registry

A high-performance, multi-tenant Mongoose model registry with distributed caching built on Node.js, Express.js, MongoDB, and Redis.

## Features

- **Multi-Tenant Architecture**: Isolated MongoDB databases for each tenant
- **Multi-Layer Caching**: L1 (in-memory LRU) and L2 (Redis) cache layers
- **Connection Pooling**: Efficient MongoDB connection management
- **Cache Stampede Protection**: Mutex-based locking to prevent duplicate model creation
- **Graceful Degradation**: Continues operating even if Redis is unavailable
- **Production Ready**: PM2 cluster mode support for horizontal scaling
- **Health Monitoring**: Built-in health checks and statistics endpoints
- **Auto Cleanup**: Automatic cleanup of inactive connections

## Architecture

```
┌─────────────────┐
│  Express API    │
└────────┬────────┘
         │
┌────────▼────────┐
│ Model Registry  │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
┌───▼───┐ ┌──▼───┐
│  L1   │ │  L2  │
│ Cache │ │Redis │
└───────┘ └──────┘
         │
    ┌────▼────┐
    │ MongoDB │
    └─────────┘
```

## Prerequisites

- Node.js v18+ LTS
- MongoDB v6.0+
- Redis v7.0+ (optional but recommended)
- PM2 (for production deployment)

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd distributed-model-registry
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

## Configuration

### Environment Variables

```env
# Node.js Application
NODE_ENV=development
PORT=3000
PM2_INSTANCES=max

# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017
MONGODB_POOL_SIZE=10

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# Cache Configuration
L1_CACHE_MAX_SIZE=500
L1_CACHE_TTL=300000      # 5 minutes
L2_CACHE_TTL=1800000     # 30 minutes
```

## Usage

### Development

```bash
# Start with nodemon (auto-reload)
npm run dev
```

### Production

```bash
# Start with PM2 cluster mode
npm run pm2:start

# View logs
npm run pm2:logs

# Restart all instances
npm run pm2:restart

# Stop all instances
npm run pm2:stop
```

### Direct Node.js

```bash
# Start single instance
npm start
```

## API Endpoints

### Health & Monitoring

- `GET /health` - Basic health check
- `GET /api/models/health` - Detailed health status
- `GET /api/models/stats` - Registry statistics

### Model Management

- `GET /api/models/schemas` - List registered schemas
- `GET /api/models/:tenantId` - Get all models for a tenant
- `GET /api/models/:tenantId/:modelName` - Get specific model
- `POST /api/models/:tenantId/test` - Test model operations

### Cache Management

- `DELETE /api/models/cache/:tenantId` - Invalidate tenant cache
- `DELETE /api/models/cache` - Clear all cache
- `DELETE /api/models/connection/:tenantId` - Close tenant connection

## Adding Custom Models

Create a new schema file in `src/models/`:

```javascript
// src/models/YourModel.js
const mongoose = require('mongoose');

const YourSchema = new mongoose.Schema({
  // Your schema definition
}, {
  timestamps: true,
  collection: 'your_collection'
});

module.exports = YourSchema;
```

Register it in `src/models/index.js`:

```javascript
const YourSchema = require('./YourModel');

module.exports = {
  // ... existing schemas
  YourModel: YourSchema
};
```

## Performance Metrics

- **L1 Cache Hit**: < 1ms response time
- **L2 Cache Hit**: < 10ms response time  
- **Cache Miss**: Depends on MongoDB query + model compilation
- **Throughput**: 1000+ requests/second per Node.js process

## Monitoring

### Using PM2

```bash
# Monitor processes
pm2 monit

# View detailed metrics
pm2 describe model-registry
```

### Application Metrics

Access the stats endpoint for real-time metrics:

```bash
curl http://localhost:3000/api/models/stats
```

Response includes:
- Cache hit rates (L1/L2)
- Active connections
- Model creation count
- Error rates

## Testing

### Test Model Retrieval

```bash
# Get models for tenant
curl http://localhost:3000/api/models/tenant123

# Test model operations
curl -X POST http://localhost:3000/api/models/tenant123/test \
  -H "Content-Type: application/json" \
  -d '{"modelName": "User", "operation": "count"}'
```

## Troubleshooting

### Redis Connection Issues

The system will continue operating with L1 cache only if Redis is unavailable. Check logs for Redis connection errors:

```bash
tail -f logs/error.log
```

### MongoDB Connection Issues

Ensure MongoDB is running and accessible:

```bash
# Check MongoDB status
mongosh --eval "db.adminCommand('ping')"
```

### Memory Issues

Adjust L1 cache size in `.env`:

```env
L1_CACHE_MAX_SIZE=200  # Reduce if memory constrained
```

## Production Deployment

### PM2 Cluster Mode

```bash
# Start with all CPU cores
pm2 start ecosystem.config.js --env production

# Save PM2 configuration
pm2 save

# Setup startup script
pm2 startup
```

### Docker Deployment

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

### Health Checks

Configure your load balancer to use:
- Health endpoint: `/health`
- Interval: 30 seconds
- Timeout: 5 seconds
- Unhealthy threshold: 3

## Security Considerations

1. **MongoDB Authentication**: Always use authentication in production
2. **Redis Password**: Set a strong Redis password
3. **Rate Limiting**: Configured at 100 requests per 15 minutes by default
4. **Helmet.js**: Security headers enabled
5. **CORS**: Configure allowed origins for your environment

## License

ISC

## Support

For issues, questions, or contributions, please open an issue on GitHub.
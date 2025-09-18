# Financial Reporting Platform Backend

A multi-tenant SaaS backend application for financial reporting with advanced project cost management capabilities.

## Features

- **Multi-tenant Architecture**: Database-per-tenant isolation for maximum security
- **JWT Authentication**: Secure token-based authentication with refresh tokens
- **Master Data Management**: Configurable master data with caching
- **Project Management**: Multi-version project support with approval workflows
- **Cost Calculations**: Automated cost calculations with tax and currency conversions
- **Redis Caching**: Two-tier caching for optimal performance
- **Audit Logging**: Comprehensive audit trail for all operations

## Technology Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose ODM
- **Cache**: Redis
- **Authentication**: JWT (jsonwebtoken)
- **Validation**: Zod
- **Logging**: Winston

## Getting Started

### Prerequisites

- Node.js 18 or higher
- MongoDB 5.0 or higher
- Redis 6.0 or higher

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd chemTech-Backend
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file based on `.env.example`:
```bash
cp .env.example .env
```

4. Configure your environment variables in `.env`

5. Start the server:
```bash
# Development
npm run dev

# Production
npm start
```

## API Documentation

### Authentication

#### Login
```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password",
  "tenantId": "tenant_123"
}
```

#### Refresh Token
```http
POST /api/v1/auth/refresh
Content-Type: application/json

{
  "refreshToken": "your-refresh-token"
}
```

### Master Data

#### Get Master Collections
```http
GET /api/v1/masters/collections
Authorization: Bearer <token>
```

#### Get Master Data Items
```http
GET /api/v1/masters/{collection}?page=1&limit=20
Authorization: Bearer <token>
```

#### Create Master Data Item
```http
POST /api/v1/masters/{collection}
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Heat Exchanger Type A",
  "code": "HEX-A",
  "defaultTax": 18,
  "description": "Standard heat exchanger"
}
```

### Projects

#### Create Project
```http
POST /api/v1/projects
Authorization: Bearer <token>
Content-Type: application/json

{
  "caseNumber": "CASE-001",
  "industryType": "Chemical Processing",
  "plantType": "Thermal Plant",
  "baseCurrency": "INR",
  "displayUnit": "Cr",
  "currencyConversions": [
    { "currencyCode": "USD", "conversionFactor": 83.5 },
    { "currencyCode": "EUR", "conversionFactor": 90.2 }
  ]
}
```

#### Get Project Details
```http
GET /api/v1/projects/{projectId}
Authorization: Bearer <token>
```

#### Create New Version
```http
POST /api/v1/projects/{projectId}/versions
Authorization: Bearer <token>
Content-Type: application/json

{
  "sourceVersionId": "V1_uuid",
  "notes": "Updated equipment costs"
}
```

### Equipment Costs

#### Add Equipment Cost
```http
POST /api/v1/inputs/equipmentCost
Authorization: Bearer <token>
Content-Type: application/json

{
  "projectId": "CHEM-THER-20250101000000",
  "versionId": "V1_uuid",
  "equipmentCategory": "Heat Exchangers",
  "equipmentName": "Shell & Tube HX-100",
  "numberQuantity": 2,
  "rate": 500000,
  "specifications": "100 sqm surface area",
  "vendor": "ABC Equipment Ltd"
}
```

#### Bulk Import Equipment Costs
```http
POST /api/v1/inputs/equipmentCost/bulk
Authorization: Bearer <token>
Content-Type: application/json

{
  "projectId": "CHEM-THER-20250101000000",
  "versionId": "V1_uuid",
  "items": [
    {
      "equipmentCategory": "Pumps",
      "equipmentName": "Centrifugal Pump P-101",
      "numberQuantity": 3,
      "rate": 150000
    },
    {
      "equipmentCategory": "Vessels",
      "equipmentName": "Storage Tank T-201",
      "numberQuantity": 1,
      "rate": 2000000
    }
  ]
}
```

## Project Structure

```
src/
├── config/          # Configuration files
├── controllers/     # Request handlers
├── middleware/      # Express middleware
├── models/          # MongoDB schemas
├── routes/          # API routes
├── services/        # Business logic services
├── utils/           # Utility functions
└── validators/      # Zod validation schemas
```

## Security Features

- JWT-based authentication with short-lived access tokens
- Refresh token rotation
- Database-per-tenant isolation
- Input validation and sanitization
- Rate limiting
- Helmet.js security headers
- Audit logging for all CUD operations

## Performance Optimizations

- Two-tier caching (LRU + Redis)
- Connection pooling for MongoDB
- Cursor-based pagination
- Compound indexes on frequently queried fields
- Lazy loading of tenant connections

## Environment Variables

Key environment variables (see `.env.example` for full list):

- `NODE_ENV`: Environment (development/production)
- `PORT`: Server port
- `MONGODB_URI`: MongoDB connection string
- `REDIS_HOST`: Redis host
- `JWT_ACCESS_SECRET`: Secret for access tokens
- `JWT_REFRESH_SECRET`: Secret for refresh tokens

## Error Handling

All API responses follow a consistent format:

Success:
```json
{
  "success": true,
  "data": {},
  "meta": {
    "timestamp": "2025-01-01T00:00:00.000Z",
    "requestId": "uuid"
  }
}
```

Error:
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": {}
  },
  "meta": {
    "timestamp": "2025-01-01T00:00:00.000Z",
    "requestId": "uuid"
  }
}
```

## Testing

```bash
# Run tests (to be implemented)
npm test

# Run linting
npm run lint
```

## Production Deployment

1. Set appropriate environment variables
2. Use PM2 for process management:
```bash
npm run pm2:start
```

3. Configure MongoDB replica set for high availability
4. Set up Redis sentinel for failover
5. Use a reverse proxy (Nginx) for SSL termination
6. Enable MongoDB authentication and use SSL connections

## License

Proprietary - All rights reserved
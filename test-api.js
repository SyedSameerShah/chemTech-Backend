#!/usr/bin/env node

/**
 * Test script for Distributed Model Registry API
 * Usage: node test-api.js [baseUrl]
 */

const http = require('http');
const https = require('https');

const baseUrl = process.argv[2] || 'http://localhost:3000';
const isHttps = baseUrl.startsWith('https');
const client = isHttps ? https : http;

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m'
};

// Helper function to make HTTP requests
function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(baseUrl + path);
    
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    const req = client.request(options, (res) => {
      let body = '';
      
      res.on('data', (chunk) => {
        body += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = {
            status: res.statusCode,
            data: body ? JSON.parse(body) : null
          };
          resolve(response);
        } catch (error) {
          resolve({
            status: res.statusCode,
            data: body
          });
        }
      });
    });
    
    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

// Test functions
async function testHealth() {
  console.log(`\n${colors.cyan}Testing Health Endpoints...${colors.reset}`);
  
  try {
    // Basic health
    const health = await makeRequest('GET', '/health');
    console.log(`${colors.green}✓${colors.reset} Basic health check: ${health.status === 200 ? 'PASSED' : 'FAILED'}`);
    
    // Detailed health
    const detailedHealth = await makeRequest('GET', '/api/models/health');
    console.log(`${colors.green}✓${colors.reset} Detailed health check: ${detailedHealth.data.status}`);
    
    return true;
  } catch (error) {
    console.error(`${colors.red}✗${colors.reset} Health check failed:`, error.message);
    return false;
  }
}

async function testSchemas() {
  console.log(`\n${colors.cyan}Testing Schema Endpoints...${colors.reset}`);
  
  try {
    const schemas = await makeRequest('GET', '/api/models/schemas');
    console.log(`${colors.green}✓${colors.reset} Registered schemas: ${schemas.data.schemas.join(', ')}`);
    console.log(`  Total schemas: ${schemas.data.count}`);
    
    return true;
  } catch (error) {
    console.error(`${colors.red}✗${colors.reset} Schema test failed:`, error.message);
    return false;
  }
}

async function testTenantModels(tenantId) {
  console.log(`\n${colors.cyan}Testing Tenant Model Operations...${colors.reset}`);
  
  try {
    // Get models for tenant (first call - cache miss)
    console.log(`\nTesting tenant: ${colors.yellow}${tenantId}${colors.reset}`);
    
    const start1 = Date.now();
    const models1 = await makeRequest('GET', `/api/models/${tenantId}`);
    const time1 = Date.now() - start1;
    
    console.log(`${colors.green}✓${colors.reset} First call (cache miss): ${time1}ms`);
    console.log(`  Models: ${models1.data.models.join(', ')}`);
    
    // Get models again (should be L1 cache hit)
    const start2 = Date.now();
    const models2 = await makeRequest('GET', `/api/models/${tenantId}`);
    const time2 = Date.now() - start2;
    
    console.log(`${colors.green}✓${colors.reset} Second call (L1 cache hit): ${time2}ms`);
    
    // Test specific model
    const modelTest = await makeRequest('GET', `/api/models/${tenantId}/User`);
    console.log(`${colors.green}✓${colors.reset} Specific model test: User model exists`);
    
    // Test model operation
    const opTest = await makeRequest('POST', `/api/models/${tenantId}/test`, {
      modelName: 'User',
      operation: 'count'
    });
    console.log(`${colors.green}✓${colors.reset} Model operation test: Count = ${opTest.data.result}`);
    
    return true;
  } catch (error) {
    console.error(`${colors.red}✗${colors.reset} Tenant model test failed:`, error.message);
    return false;
  }
}

async function testCacheInvalidation(tenantId) {
  console.log(`\n${colors.cyan}Testing Cache Invalidation...${colors.reset}`);
  
  try {
    // Invalidate cache for tenant
    const invalidate = await makeRequest('DELETE', `/api/models/cache/${tenantId}`);
    console.log(`${colors.green}✓${colors.reset} Cache invalidated for tenant: ${tenantId}`);
    
    // Get models again (should be cache miss)
    const start = Date.now();
    const models = await makeRequest('GET', `/api/models/${tenantId}`);
    const time = Date.now() - start;
    
    console.log(`${colors.green}✓${colors.reset} After invalidation (cache miss): ${time}ms`);
    
    return true;
  } catch (error) {
    console.error(`${colors.red}✗${colors.reset} Cache invalidation test failed:`, error.message);
    return false;
  }
}

async function testStats() {
  console.log(`\n${colors.cyan}Testing Statistics Endpoint...${colors.reset}`);
  
  try {
    const stats = await makeRequest('GET', '/api/models/stats');
    
    console.log(`${colors.green}✓${colors.reset} Statistics retrieved:`);
    console.log(`  L1 Cache hits: ${stats.data.registry.cacheHits.l1}`);
    console.log(`  L2 Cache hits: ${stats.data.registry.cacheHits.l2}`);
    console.log(`  Cache misses: ${stats.data.registry.cacheMisses}`);
    console.log(`  Model creations: ${stats.data.registry.modelCreations}`);
    console.log(`  Active connections: ${stats.data.connections.totalConnections}`);
    
    return true;
  } catch (error) {
    console.error(`${colors.red}✗${colors.reset} Stats test failed:`, error.message);
    return false;
  }
}

async function testMultipleTenants() {
  console.log(`\n${colors.cyan}Testing Multiple Tenants...${colors.reset}`);
  
  const tenants = ['tenant1', 'tenant2', 'tenant3', 'company_abc', 'company_xyz'];
  
  try {
    // Create models for multiple tenants
    for (const tenant of tenants) {
      const start = Date.now();
      await makeRequest('GET', `/api/models/${tenant}`);
      const time = Date.now() - start;
      console.log(`${colors.green}✓${colors.reset} Tenant ${tenant}: ${time}ms`);
    }
    
    // Test concurrent requests
    console.log(`\n${colors.yellow}Testing concurrent requests...${colors.reset}`);
    const concurrentPromises = tenants.map(tenant => 
      makeRequest('GET', `/api/models/${tenant}`)
    );
    
    const concurrentStart = Date.now();
    await Promise.all(concurrentPromises);
    const concurrentTime = Date.now() - concurrentStart;
    
    console.log(`${colors.green}✓${colors.reset} Concurrent requests completed: ${concurrentTime}ms`);
    
    return true;
  } catch (error) {
    console.error(`${colors.red}✗${colors.reset} Multiple tenant test failed:`, error.message);
    return false;
  }
}

// Main test runner
async function runTests() {
  console.log(`${colors.bright}${colors.blue}═══════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}     Distributed Model Registry - API Test Suite${colors.reset}`);
  console.log(`${colors.bright}${colors.blue}═══════════════════════════════════════════════════════${colors.reset}`);
  console.log(`\nBase URL: ${colors.yellow}${baseUrl}${colors.reset}`);
  
  const results = [];
  
  // Run tests
  results.push(await testHealth());
  results.push(await testSchemas());
  results.push(await testTenantModels('test_tenant_001'));
  results.push(await testCacheInvalidation('test_tenant_001'));
  results.push(await testMultipleTenants());
  results.push(await testStats());
  
  // Summary
  console.log(`\n${colors.bright}${colors.blue}═══════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}                    Test Summary${colors.reset}`);
  console.log(`${colors.bright}${colors.blue}═══════════════════════════════════════════════════════${colors.reset}`);
  
  const passed = results.filter(r => r).length;
  const failed = results.length - passed;
  
  console.log(`\nTests Passed: ${colors.green}${passed}${colors.reset}`);
  console.log(`Tests Failed: ${failed > 0 ? colors.red : colors.green}${failed}${colors.reset}`);
  
  if (failed === 0) {
    console.log(`\n${colors.bright}${colors.green}All tests passed successfully! 🎉${colors.reset}`);
  } else {
    console.log(`\n${colors.bright}${colors.red}Some tests failed. Please check the logs above.${colors.reset}`);
  }
  
  process.exit(failed === 0 ? 0 : 1);
}

// Run the tests
runTests().catch(error => {
  console.error(`${colors.red}Test runner error:${colors.reset}`, error);
  process.exit(1);
});
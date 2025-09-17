#!/bin/bash

# Distributed Model Registry - Startup Script

echo "════════════════════════════════════════════════════════"
echo "     Distributed Model Registry - Starting Services"
echo "════════════════════════════════════════════════════════"

# Check if running in Docker
if [ -f /.dockerenv ]; then
    echo "Running in Docker container..."
    npm start
else
    # Check for required services
    echo "Checking required services..."
    
    # Check MongoDB
    if ! command -v mongosh &> /dev/null; then
        echo "⚠️  MongoDB client not found. Please ensure MongoDB is installed and running."
    else
        echo "✓ MongoDB client found"
    fi
    
    # Check Redis
    if ! command -v redis-cli &> /dev/null; then
        echo "⚠️  Redis client not found. Redis is optional but recommended for L2 cache."
    else
        echo "✓ Redis client found"
        # Test Redis connection
        redis-cli ping > /dev/null 2>&1
        if [ $? -eq 0 ]; then
            echo "✓ Redis is running"
        else
            echo "⚠️  Redis is not running. L2 cache will be disabled."
        fi
    fi
    
    echo ""
    echo "Starting application..."
    echo "════════════════════════════════════════════════════════"
    
    # Check if PM2 is available
    if command -v pm2 &> /dev/null; then
        echo "Starting with PM2 in cluster mode..."
        pm2 start ecosystem.config.js
        pm2 logs
    else
        echo "PM2 not found. Starting with Node.js..."
        npm start
    fi
fi
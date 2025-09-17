module.exports = {
  apps: [{
    name: 'model-registry',
    script: './src/server.js',
    instances: process.env.PM2_INSTANCES || 'max',
    exec_mode: 'cluster',
    
    // Environment variables
    env: {
      NODE_ENV: 'development',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    
    // Logging
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_file: './logs/pm2-combined.log',
    time: true,
    
    // Advanced features
    watch: false,
    ignore_watch: ['node_modules', 'logs', '.git'],
    max_memory_restart: '1G',
    
    // Graceful start/reload
    wait_ready: true,
    listen_timeout: 3000,
    kill_timeout: 5000,
    
    // Auto restart
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    
    // Monitoring
    instance_var: 'INSTANCE_ID',
    merge_logs: true,
    
    // Node.js arguments
    node_args: '--max-old-space-size=1024',
    
    // Cluster settings
    instances_per_cpu: 1,
    
    // Health check
    health_check: {
      interval: 30000,
      timeout: 5000,
      max_consecutive_failures: 3
    }
  }],
  
  // Deploy configuration (optional)
  deploy: {
    production: {
      user: 'node',
      host: 'your-server.com',
      ref: 'origin/main',
      repo: 'git@github.com:your-repo/distributed-model-registry.git',
      path: '/var/www/model-registry',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production',
      env: {
        NODE_ENV: 'production'
      }
    }
  }
};
const os = require('os');
const fs = require('fs');
const axios = require('axios');
const logger = require('../utils/logger');

class ProductionMonitor {
  constructor() {
    this.metrics = {
      system: {},
      application: {},
      alerts: []
    };
    this.thresholds = {
      cpu: 80,
      memory: 85,
      disk: 90,
      responseTime: 5000
    };
    this.io = null;
  }

  start(io) {
    this.io = io;
    logger.info('Starting production monitor...');
    
    // Monitor system metrics every 30 seconds
    setInterval(() => {
      this.collectSystemMetrics();
    }, 30000);

    // Monitor application metrics every 60 seconds
    setInterval(() => {
      this.collectApplicationMetrics();
    }, 60000);

    // Initial collection
    this.collectSystemMetrics();
    this.collectApplicationMetrics();
  }

  async collectSystemMetrics() {
    try {
      const metrics = {
        timestamp: new Date().toISOString(),
        cpu: {
          usage: this.getCPUUsage(),
          loadAvg: os.loadavg()
        },
        memory: {
          total: os.totalmem(),
          free: os.freemem(),
          usage: ((os.totalmem() - os.freemem()) / os.totalmem()) * 100
        },
        disk: await this.getDiskUsage(),
        network: os.networkInterfaces(),
        uptime: os.uptime()
      };

      this.metrics.system = metrics;
      this.checkThresholds(metrics);
      
      if (this.io) {
        this.io.emit('system_metrics', metrics);
      }
      
      logger.debug('System metrics collected', { 
        cpu: metrics.cpu.usage, 
        memory: metrics.memory.usage 
      });
    } catch (error) {
      logger.error('Failed to collect system metrics:', error);
    }
  }

  async collectApplicationMetrics() {
    try {
      const metrics = {
        timestamp: new Date().toISOString(),
        nodejs: {
          version: process.version,
          memoryUsage: process.memoryUsage(),
          uptime: process.uptime()
        },
        health: await this.checkHealthEndpoints()
      };

      this.metrics.application = metrics;
      
      if (this.io) {
        this.io.emit('app_metrics', metrics);
      }
      
      logger.debug('Application metrics collected');
    } catch (error) {
      logger.error('Failed to collect application metrics:', error);
    }
  }

  getCPUUsage() {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    cpus.forEach(cpu => {
      for (let type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    });

    return 100 - (totalIdle / totalTick * 100);
  }

  async getDiskUsage() {
    try {
      const stats = fs.statSync('/');
      // This is a simplified version - in production, use a proper disk usage library
      return {
        total: 'N/A',
        used: 'N/A',
        available: 'N/A',
        usage: 0
      };
    } catch (error) {
      logger.error('Failed to get disk usage:', error);
      return { error: error.message };
    }
  }

  async checkHealthEndpoints() {
    const endpoints = [
      { name: 'self', url: `http://localhost:${process.env.PORT || 3000}/api/status` }
      // Add more endpoints as needed
    ];

    const results = await Promise.allSettled(
      endpoints.map(async endpoint => {
        try {
          const start = Date.now();
          const response = await axios.get(endpoint.url, { timeout: 5000 });
          const responseTime = Date.now() - start;
          
          return {
            name: endpoint.name,
            status: 'healthy',
            responseTime,
            statusCode: response.status
          };
        } catch (error) {
          return {
            name: endpoint.name,
            status: 'unhealthy',
            error: error.message
          };
        }
      })
    );

    return results.map(result => result.value || result.reason);
  }

  checkThresholds(metrics) {
    const alerts = [];

    // CPU threshold
    if (metrics.cpu.usage > this.thresholds.cpu) {
      alerts.push({
        type: 'cpu',
        severity: 'warning',
        message: `High CPU usage: ${metrics.cpu.usage.toFixed(2)}%`,
        timestamp: new Date().toISOString()
      });
    }

    // Memory threshold
    if (metrics.memory.usage > this.thresholds.memory) {
      alerts.push({
        type: 'memory',
        severity: 'warning',
        message: `High memory usage: ${metrics.memory.usage.toFixed(2)}%`,
        timestamp: new Date().toISOString()
      });
    }

    if (alerts.length > 0) {
      this.metrics.alerts.push(...alerts);
      this.sendAlerts(alerts);
      
      if (this.io) {
        this.io.emit('alerts', alerts);
      }
    }
  }

  async sendAlerts(alerts) {
    for (const alert of alerts) {
      logger.warn('Production Alert:', alert);
      
      // Send to Slack if configured
      if (process.env.SLACK_WEBHOOK_URL) {
        try {
          await axios.post(process.env.SLACK_WEBHOOK_URL, {
            text: `🚨 Production Alert: ${alert.message}`,
            attachments: [{
              color: alert.severity === 'critical' ? 'danger' : 'warning',
              fields: [{
                title: 'Type',
                value: alert.type,
                short: true
              }, {
                title: 'Timestamp',
                value: alert.timestamp,
                short: true
              }]
            }]
          });
        } catch (error) {
          logger.error('Failed to send Slack alert:', error);
        }
      }
    }
  }

  getSystemStatus() {
    return {
      status: 'operational',
      timestamp: new Date().toISOString(),
      metrics: this.metrics,
      uptime: process.uptime(),
      version: require('../../package.json').version
    };
  }

  getRecentAlerts(limit = 10) {
    return this.metrics.alerts.slice(-limit);
  }
}

module.exports = new ProductionMonitor();
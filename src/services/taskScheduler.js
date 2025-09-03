const cron = require('node-cron');
const logger = require('../utils/logger');
const aiService = require('./aiService');
const productionMonitor = require('./productionMonitor');

class TaskScheduler {
  constructor() {
    this.tasks = new Map();
    this.isStarted = false;
  }

  start() {
    if (this.isStarted) {
      logger.warn('Task scheduler already started');
      return;
    }

    logger.info('Starting task scheduler...');
    this.isStarted = true;

    // Daily health check at 9 AM
    this.scheduleTask('daily-health-check', '0 9 * * *', async () => {
      await this.performDailyHealthCheck();
    });

    // Hourly system analysis
    this.scheduleTask('hourly-analysis', '0 * * * *', async () => {
      await this.performSystemAnalysis();
    });

    // Weekly cleanup at midnight Sunday
    this.scheduleTask('weekly-cleanup', '0 0 * * 0', async () => {
      await this.performWeeklyCleanup();
    });

    // Alert cleanup every 6 hours
    this.scheduleTask('alert-cleanup', '0 */6 * * *', async () => {
      await this.cleanupOldAlerts();
    });
  }

  scheduleTask(name, cronExpression, taskFunction) {
    if (this.tasks.has(name)) {
      logger.warn(`Task ${name} already scheduled`);
      return;
    }

    const task = cron.schedule(cronExpression, async () => {
      logger.info(`Executing scheduled task: ${name}`);
      try {
        await taskFunction();
        logger.info(`Completed scheduled task: ${name}`);
      } catch (error) {
        logger.error(`Error in scheduled task ${name}:`, error);
      }
    }, {
      scheduled: false
    });

    this.tasks.set(name, {
      task,
      cronExpression,
      taskFunction,
      createdAt: new Date().toISOString()
    });

    task.start();
    logger.info(`Scheduled task: ${name} (${cronExpression})`);
  }

  async performDailyHealthCheck() {
    logger.info('Performing daily health check...');
    
    try {
      // Check AI service health
      const aiHealth = await aiService.healthCheck();
      logger.info('AI Service Health:', aiHealth);

      // Get system status
      const systemStatus = productionMonitor.getSystemStatus();
      
      // Analyze system trends
      const analysisData = {
        systemMetrics: systemStatus.metrics.system,
        applicationMetrics: systemStatus.metrics.application,
        recentAlerts: productionMonitor.getRecentAlerts(50),
        uptime: systemStatus.uptime
      };

      const analysis = await aiService.analyze(
        JSON.stringify(analysisData, null, 2),
        'metrics'
      );

      logger.info('Daily health check analysis:', {
        confidence: analysis.confidence,
        summary: analysis.analysis.substring(0, 200) + '...'
      });

      // Store or send the analysis
      this.storeHealthReport({
        timestamp: new Date().toISOString(),
        aiHealth,
        systemStatus,
        analysis
      });

    } catch (error) {
      logger.error('Daily health check failed:', error);
    }
  }

  async performSystemAnalysis() {
    logger.info('Performing hourly system analysis...');
    
    try {
      const systemStatus = productionMonitor.getSystemStatus();
      const recentAlerts = productionMonitor.getRecentAlerts(10);

      if (recentAlerts.length > 0) {
        const alertAnalysis = await aiService.analyze(
          JSON.stringify(recentAlerts, null, 2),
          'logs'
        );

        logger.info('Recent alerts analysis:', {
          alertCount: recentAlerts.length,
          confidence: alertAnalysis.confidence
        });
      }

      // Check for anomalies in system metrics
      if (systemStatus.metrics.system.cpu) {
        const cpuUsage = systemStatus.metrics.system.cpu.usage;
        const memoryUsage = systemStatus.metrics.system.memory.usage;

        if (cpuUsage > 70 || memoryUsage > 80) {
          logger.warn('High resource usage detected', { cpuUsage, memoryUsage });
          
          const suggestion = await aiService.generateSuggestion(
            `CPU: ${cpuUsage}%, Memory: ${memoryUsage}%`,
            'Optimize system resource usage'
          );

          logger.info('Resource optimization suggestion:', suggestion.suggestion);
        }
      }

    } catch (error) {
      logger.error('System analysis failed:', error);
    }
  }

  async performWeeklyCleanup() {
    logger.info('Performing weekly cleanup...');
    
    try {
      // Clean old alerts (keep only last 100)
      const alerts = productionMonitor.getRecentAlerts(1000);
      if (alerts.length > 100) {
        logger.info(`Cleaning up ${alerts.length - 100} old alerts`);
        // In a real implementation, you'd clean up the actual storage
      }

      // Generate weekly report
      const weeklyReport = await this.generateWeeklyReport();
      logger.info('Weekly report generated:', {
        period: weeklyReport.period,
        totalAlerts: weeklyReport.totalAlerts
      });

    } catch (error) {
      logger.error('Weekly cleanup failed:', error);
    }
  }

  async cleanupOldAlerts() {
    logger.info('Cleaning up old alerts...');
    
    try {
      // This would typically interact with a database
      // For now, just log the cleanup action
      const alertCount = productionMonitor.getRecentAlerts().length;
      logger.info(`Current alert count: ${alertCount}`);
      
    } catch (error) {
      logger.error('Alert cleanup failed:', error);
    }
  }

  async generateWeeklyReport() {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const report = {
      period: {
        start: weekAgo.toISOString(),
        end: now.toISOString()
      },
      totalAlerts: productionMonitor.getRecentAlerts().length,
      systemHealth: 'stable', // This would be calculated based on metrics
      aiServiceUsage: 'active',
      recommendations: []
    };

    return report;
  }

  storeHealthReport(report) {
    // In a real implementation, this would store to a database
    logger.info('Health report stored:', {
      timestamp: report.timestamp,
      aiHealthy: report.aiHealth.status === 'healthy',
      systemUptime: report.systemStatus.uptime
    });
  }

  stopTask(name) {
    const taskData = this.tasks.get(name);
    if (taskData) {
      taskData.task.stop();
      this.tasks.delete(name);
      logger.info(`Stopped task: ${name}`);
    }
  }

  listTasks() {
    const taskList = [];
    for (const [name, data] of this.tasks) {
      taskList.push({
        name,
        cronExpression: data.cronExpression,
        createdAt: data.createdAt,
        running: data.task.running || false
      });
    }
    return taskList;
  }

  stop() {
    logger.info('Stopping task scheduler...');
    for (const [name] of this.tasks) {
      this.stopTask(name);
    }
    this.isStarted = false;
  }
}

module.exports = new TaskScheduler();
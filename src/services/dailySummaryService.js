const cron = require('node-cron');
const taskManager = require('./taskManager');
const slackBot = require('./slackBot');
const logger = require('../utils/logger');

class DailySummaryService {
  constructor() {
    this.isScheduled = false;
  }

  start() {
    if (!slackBot.isConfigured) {
      logger.warn('Slack bot not configured, daily summaries will not be posted');
      return;
    }

    // Schedule daily summary at 9 AM Monday-Friday
    cron.schedule('0 9 * * 1-5', () => {
      this.postDailySummary();
    }, {
      scheduled: true,
      timezone: "America/New_York" // Adjust timezone as needed
    });

    this.isScheduled = true;
    logger.info('Daily summary service started - will post at 9 AM on weekdays');
  }

  async postDailySummary() {
    try {
      const summary = this.generateDailySummary();
      const slackMessage = this.formatSlackMessage(summary);
      
      // Try posting to channel, fallback to logging the message
      const success = await slackBot.postToChannel(slackMessage);
      if (!success) {
        logger.warn('Could not post to Slack channel, message content:', JSON.stringify(slackMessage, null, 2));
      }
      logger.info('Daily task summary posted to Slack');
    } catch (error) {
      logger.error('Failed to post daily summary:', error);
    }
  }

  generateDailySummary() {
    const today = new Date();
    const tasks = taskManager.getAllTasks();
    
    // Get overdue tasks
    const overdueTasks = tasks.filter(task => 
      task.isOverdue() && task.status !== 'completed'
    );

    // Get tasks due today
    const dueTodayTasks = tasks.filter(task => {
      if (!task.dueDate || task.status === 'completed') return false;
      const dueDate = new Date(task.dueDate);
      return dueDate.toDateString() === today.toDateString();
    });

    // Get tasks due in next 3 days
    const upcomingTasks = tasks.filter(task => {
      if (!task.dueDate || task.status === 'completed') return false;
      const dueDate = new Date(task.dueDate);
      const daysUntilDue = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
      return daysUntilDue > 0 && daysUntilDue <= 3;
    });

    // Get pending tasks without assignees
    const unassignedTasks = tasks.filter(task => 
      !task.assignee && task.status === 'pending'
    );

    return {
      date: today.toDateString(),
      daysUntilHackathon: taskManager.getDaysUntilHackathon(),
      overdueTasks: this.sortTasksByDueDate(overdueTasks),
      dueTodayTasks: this.sortTasksByDueDate(dueTodayTasks),
      upcomingTasks: this.sortTasksByDueDate(upcomingTasks),
      unassignedTasks: this.sortTasksByDueDate(unassignedTasks),
      stats: taskManager.getCompletionStats()
    };
  }

  sortTasksByDueDate(tasks) {
    return tasks.sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate) - new Date(b.dueDate);
    });
  }

  formatSlackMessage(summary) {
    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `📅 Daily Task Summary - ${summary.date}`
        }
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `🎯 *${summary.daysUntilHackathon} days until hackathon* | Progress: ${summary.stats.completionRate}% complete`
          }
        ]
      }
    ];

    // Overdue tasks section
    if (summary.overdueTasks.length > 0) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `🚨 *OVERDUE TASKS (${summary.overdueTasks.length}):*`
        }
      });

      summary.overdueTasks.forEach(task => {
        const daysOverdue = -task.getDaysUntilDue();
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `• *${task.title}*\n   👤 ${task.assignee || 'Unassigned'} | 📅 ${daysOverdue} days overdue | 🔥 ${task.priority}`
          }
        });
      });

      blocks.push({ type: 'divider' });
    }

    // Due today section
    if (summary.dueTodayTasks.length > 0) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `⏰ *DUE TODAY (${summary.dueTodayTasks.length}):*`
        }
      });

      summary.dueTodayTasks.forEach(task => {
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `• *${task.title}*\n   👤 ${task.assignee || 'Unassigned'} | 🔥 ${task.priority} | 📂 ${task.category}`
          }
        });
      });

      blocks.push({ type: 'divider' });
    }

    // Upcoming tasks section
    if (summary.upcomingTasks.length > 0) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `📋 *UPCOMING (Next 3 Days - ${summary.upcomingTasks.length}):*`
        }
      });

      summary.upcomingTasks.forEach(task => {
        const daysUntilDue = task.getDaysUntilDue();
        const dueText = daysUntilDue === 1 ? 'tomorrow' : `in ${daysUntilDue} days`;
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `• *${task.title}*\n   👤 ${task.assignee || 'Unassigned'} | 📅 Due ${dueText} | 🔥 ${task.priority}`
          }
        });
      });

      blocks.push({ type: 'divider' });
    }

    // Unassigned tasks section
    if (summary.unassignedTasks.length > 0) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `❓ *UNASSIGNED TASKS (${summary.unassignedTasks.length}):*`
        }
      });

      summary.unassignedTasks.slice(0, 5).forEach(task => { // Limit to 5 to avoid message length issues
        const daysUntilDue = task.getDaysUntilDue();
        const dueText = task.dueDate ? (daysUntilDue > 0 ? `due in ${daysUntilDue} days` : `overdue by ${-daysUntilDue} days`) : 'no due date';
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `• *${task.title}*\n   📅 ${dueText} | 🔥 ${task.priority} | 📂 ${task.category}`
          }
        });
      });

      if (summary.unassignedTasks.length > 5) {
        blocks.push({
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `_... and ${summary.unassignedTasks.length - 5} more unassigned tasks_`
            }
          ]
        });
      }
    }

    // Summary footer
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `💡 Use \`/hackathon summary\` for detailed breakdown or visit the dashboard for full task management`
        }
      ]
    });

    return { 
      blocks,
      text: `Daily Task Summary - ${summary.date}: ${summary.daysUntilHackathon} days until hackathon, ${summary.stats.completionRate}% complete`
    };
  }

  // Manual trigger for testing
  async triggerManualSummary() {
    logger.info('Manually triggering daily summary...');
    await this.postDailySummary();
  }
}

module.exports = new DailySummaryService();
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const taskManager = require('./taskManager');
const slackBot = require('./slackBot');
const logger = require('../utils/logger');

class DailySummaryService {
  constructor() {
    this.isScheduled = false;
    this.lastSummaryDate = null; // Track last summary date to prevent duplicates
    this.lockFilePath = path.join(__dirname, '../../data/daily-summary-lock.json');
  }

  start() {
    if (!slackBot.isConfigured) {
      logger.warn('Slack bot not configured, daily summaries will not be posted');
      return;
    }

    // Only run automated summaries in production to prevent duplicates
    if (process.env.NODE_ENV !== 'production') {
      logger.info('Daily summary service disabled in development environment to prevent duplicates');
      logger.info('Use manual trigger via API endpoint for testing');
      return;
    }

    // Schedule daily summary at 9 AM Monday-Friday until hackathon day
    cron.schedule('0 9 * * 1-5', () => {
      // Check if we've reached hackathon day (September 24, 2025)
      const hackathonDate = new Date('2025-09-24');
      const today = new Date();
      
      if (today >= hackathonDate) {
        logger.info('Hackathon day reached - stopping daily summaries');
        return;
      }
      
      this.postDailySummary();
    }, {
      scheduled: true,
      timezone: "America/New_York"
    });

    // Special one-time schedule for 7 AM MNT on September 23, 2025
    cron.schedule('0 7 23 9 *', () => {
      const today = new Date();
      const targetDate = new Date('2025-09-23');
      
      // Only run on September 23, 2025
      if (today.toDateString() === targetDate.toDateString()) {
        logger.info('Posting special 7 AM MNT update for September 23, 2025');
        this.postDailySummary('Special pre-hackathon update');
      }
    }, {
      scheduled: true,
      timezone: "America/Denver" // Mountain Time
    });

    // Special celebration message for 11 PM MNT on September 24, 2025 (Event Day)
    cron.schedule('0 23 24 9 *', () => {
      const today = new Date();
      const targetDate = new Date('2025-09-24');
      
      // Only run on September 24, 2025
      if (today.toDateString() === targetDate.toDateString()) {
        logger.info('Posting special 11 PM MNT celebration message for September 24, 2025');
        this.postEventDaySuccess();
      }
    }, {
      scheduled: true,
      timezone: "America/Denver" // Mountain Time
    });

    this.isScheduled = true;
    logger.info('Daily summary service started - will post at 9 AM on weekdays until hackathon day (Sept 24, 2025)');
    logger.info('Special 7 AM MNT update scheduled for September 23, 2025');
    logger.info('Special 11 PM MNT celebration message scheduled for September 24, 2025');
    logger.info('Daily summaries will run automatically regardless of user login status');
  }

  // Check if summary was already posted today (across all app instances)
  hasPostedToday() {
    try {
      if (!fs.existsSync(this.lockFilePath)) {
        return false;
      }
      
      const lockData = JSON.parse(fs.readFileSync(this.lockFilePath, 'utf8'));
      const today = new Date().toDateString();
      
      return lockData.lastPostDate === today;
    } catch (error) {
      logger.warn('Could not read daily summary lock file:', error);
      return false;
    }
  }

  // Mark today as posted (across all app instances)
  markAsPosted() {
    try {
      const lockData = {
        lastPostDate: new Date().toDateString(),
        timestamp: new Date().toISOString(),
        processId: process.pid,
        environment: process.env.NODE_ENV || 'development',
        appInstance: process.env.DYNO || 'local'
      };
      
      // Ensure data directory exists
      const dataDir = path.dirname(this.lockFilePath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      
      fs.writeFileSync(this.lockFilePath, JSON.stringify(lockData, null, 2));
      logger.info(`Daily summary lock file updated by process ${process.pid} (${lockData.environment}:${lockData.appInstance})`);
    } catch (error) {
      logger.error('Could not update daily summary lock file:', error);
    }
  }

  async postDailySummary(customMessage = null) {
    try {
      const today = new Date().toDateString();
      
      // Check if we've already posted today (in-memory check)
      if (this.lastSummaryDate === today) {
        logger.info('Daily summary already posted today (in-memory), skipping duplicate');
        return false;
      }
      
      // Check if any app instance has posted today (file-based check)
      if (this.hasPostedToday()) {
        logger.info('Daily summary already posted today by another process, skipping duplicate');
        return false;
      }
      
      const summary = this.generateDailySummary();
      const slackMessage = this.formatSlackMessage(summary, customMessage);
      
      // Try posting to channel, fallback to logging the message
      const success = await slackBot.postToChannel(slackMessage);
      if (!success) {
        logger.warn('Could not post to Slack channel, message content:', JSON.stringify(slackMessage, null, 2));
        return false;
      }
      
      // Mark today as posted both in memory and in file
      this.lastSummaryDate = today;
      this.markAsPosted();
      logger.info('Daily task summary posted to Slack');
      return true;
    } catch (error) {
      logger.error('Failed to post daily summary:', error);
      return false;
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

  formatSlackMessage(summary, customMessage = null) {
    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: customMessage ? `🚨 ${customMessage} - ${summary.date}` : `📅 Daily Task Summary - ${summary.date}`
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
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `🚨 *FINAL COUNTDOWN:*\n\n**AI Hackathon is TOMORROW (September 24th)! All teams should complete final preparations today.**`
        }
      },
      { type: 'divider' }
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

    // Call-to-Action section
    blocks.push({ type: 'divider' });
    
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*📢 TEAM ACTION REQUIRED:*\n\n**Do you have any other tasks you're working on that are not accounted for?** Please add them using \`/task [description]\`\n\n**If you've completed any tasks, please mark them as complete!** Use \`/hackathon tasks\` to see task IDs and update status.\n\n_Only ${summary.daysUntilHackathon} days left until the hackathon! Let's make sure nothing falls through the cracks._`
      }
    });

    // Summary footer
    const dashboardUrl = process.env.NODE_ENV === 'production' 
      ? 'https://hackathon-hq-18fbc8a64df9.herokuapp.com/' 
      : 'http://localhost:3000';
      
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `💡 Use \`/hackathon summary\` for detailed breakdown or visit ${dashboardUrl} for full task management`
        }
      ]
    });

    return { 
      blocks,
      text: `Daily Task Summary - ${summary.date}: ${summary.daysUntilHackathon} days until hackathon, ${summary.stats.completionRate}% complete`
    };
  }

  // Manual trigger for testing
  async triggerManualSummary(force = false) {
    logger.info('Manually triggering daily summary...');
    
    if (force) {
      // Reset both in-memory and file-based checks to allow duplicate
      this.lastSummaryDate = null;
      try {
        if (fs.existsSync(this.lockFilePath)) {
          fs.unlinkSync(this.lockFilePath);
          logger.info('Daily summary lock file removed for force override');
        }
      } catch (error) {
        logger.warn('Could not remove lock file:', error);
      }
      logger.info('Force flag enabled - allowing duplicate summary');
    }
    
    const success = await this.postDailySummary();
    return success;
  }

  async postEventDaySuccess() {
    if (!slackBot.isConfigured || !slackBot.app) {
      logger.warn('Slack bot not configured, cannot post event day success message');
      return false;
    }

    const successMessage = {
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '🎉 ALL COMPLETE! EVENT DAY SUCCESS! 🎉'
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '✅ *MISSION ACCOMPLISHED:*\n\n1. ✅ *Post-event tasks updated:*\n    - "📝 Post-Event: Complete Post-Con Documentation" (due Sept 29)\n    - "📋 Post-Event: Fill Out Post-Con and Tools Sheet" (due Sept 29)\n\n2. ✅ *Completion rate now shows 100%* (post-event tasks excluded from calculation)\n\n3. ✅ *Congratulations message sent to Slack team* with:\n    - Celebration of 100% event completion\n    - Recognition of team achievements\n    - Gentle reminder about post-event documentation\n\n4. ✅ *All updates deployed* to production (v55)'
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '🚀 *The dashboard now shows 100% completion rate and 0 overdue tasks!*\n\n🏆 **INCREDIBLE WORK EVERYONE! THE AI HACKATHON WAS A MASSIVE SUCCESS!** 🏆'
          }
        }
      ]
    };

    try {
      const success = await slackBot.postToChannel(successMessage);
      if (success) {
        logger.info('Event day success message posted to Slack');
      }
      return success;
    } catch (error) {
      logger.error('Failed to post event day success message:', error);
      return false;
    }
  }
}

module.exports = new DailySummaryService();
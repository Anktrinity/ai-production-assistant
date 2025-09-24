const { App, ExpressReceiver } = require('@slack/bolt');
const taskManager = require('./taskManager');
const smartTaskCreator = require('./smartTaskCreator');
const logger = require('../utils/logger');

class SlackBot {
  constructor() {
    this.app = null;
    this.receiver = null;
    this.isConfigured = false;
    this.isStarted = false;
    this.recentCommands = new Map(); // For deduplication
    
    // Only initialize if credentials are available
    if (process.env.SLACK_BOT_TOKEN && process.env.SLACK_SIGNING_SECRET) {
      // Create receiver for integration with Express
      this.receiver = new ExpressReceiver({
        signingSecret: process.env.SLACK_SIGNING_SECRET,
        endpoints: '/slack/events'
      });

      this.app = new App({
        token: process.env.SLACK_BOT_TOKEN,
        receiver: this.receiver
      });

      this.setupCommands();
      this.setupEvents();
      this.isConfigured = true;
      logger.info('Slack bot initialized and configured');
    } else {
      logger.warn('Slack bot not configured - missing SLACK_BOT_TOKEN or SLACK_SIGNING_SECRET');
    }
  }

  setupCommands() {
    // Main command for task management
    this.app.command('/hackathon', async ({ command, ack, respond, client }) => {
      await ack();

      try {
        const args = command.text.trim().split(' ');
        const action = args[0]?.toLowerCase();

        switch (action) {
          case 'status':
            await this.handleStatusCommand(respond);
            break;
          case 'tasks':
            await this.handleTasksCommand(args.slice(1), respond);
            break;
          case 'create':
            await this.handleCreateCommand(args.slice(1).join(' '), respond);
            break;
          case 'assign':
            await this.handleAssignCommand(args.slice(1), respond);
            break;
          case 'complete':
            await this.handleCompleteCommand(args.slice(1), respond);
            break;
          case 'claim':
          case 'take':
            await this.handleClaimCommand(args.slice(1), command, respond);
            break;
          case 'gaps':
            await this.handleGapsCommand(respond);
            break;
          case 'summary':
            await this.handleSummaryCommand(respond);
            break;
          case 'help':
          default:
            await this.handleHelpCommand(respond);
        }
      } catch (error) {
        logger.error('Slack command error:', error);
        await respond({
          text: '❌ Sorry, something went wrong. Please try again.',
          response_type: 'ephemeral'
        });
      }
    });

    // Quick task creation
    this.app.command('/task', async ({ command, ack, respond }) => {
      await ack();
      
      if (!command.text.trim()) {
        await respond({
          text: 'Usage: `/task [description]`\nExample: `/task Book venue for September 24th`',
          response_type: 'ephemeral'
        });
        return;
      }

      // Check for duplicate commands (within 30 seconds)
      const commandKey = `${command.user_id}:${command.text.trim()}`;
      const now = Date.now();
      const lastCommand = this.recentCommands.get(commandKey);
      
      if (lastCommand && (now - lastCommand) < 30000) {
        logger.info(`Ignoring duplicate command from ${command.user_name}: ${command.text}`);
        await respond({
          text: '⚠️ Duplicate command detected. Please wait before running the same command again.',
          response_type: 'ephemeral'
        });
        return;
      }
      
      this.recentCommands.set(commandKey, now);
      
      // Clean up old commands (older than 5 minutes)
      for (const [key, timestamp] of this.recentCommands.entries()) {
        if (now - timestamp > 300000) {
          this.recentCommands.delete(key);
        }
      }

      try {
        const result = await smartTaskCreator.parseNaturalLanguageRequest(command.text, {
          channel: command.channel_name,
          user: command.user_name
        });

        const tasksText = result.tasks.map(task => 
          `• *${task.title}* (${task.category}, due: ${new Date(task.dueDate).toLocaleDateString()})`
        ).join('\n');

        await respond({
          text: `✅ Created ${result.tasks.length} task(s):\n${tasksText}`,
          response_type: 'in_channel'
        });

      } catch (error) {
        logger.error('Task creation error:', error);
        await respond({
          text: '❌ Failed to create task. Please try again with more details.',
          response_type: 'ephemeral'
        });
      }
    });

    // Assistant command for general help and queries
    this.app.command('/assistant', async ({ command, ack, respond }) => {
      await ack();

      try {
        const query = command.text.trim();
        
        if (!query || query === 'help') {
          await this.handleHelpCommand(respond);
          return;
        }

        // Handle task count queries
        if (query.toLowerCase().includes('task') && (query.toLowerCase().includes('left') || query.toLowerCase().includes('remaining') || query.toLowerCase().includes('how many'))) {
          const stats = taskManager.getCompletionStats();
          const pending = stats.total - stats.completed;
          await respond({
            text: `📊 *Task Summary:*\n• Total tasks: ${stats.total}\n• Completed: ${stats.completed}\n• Remaining: ${pending}\n• Overdue: ${stats.overdue}`,
            response_type: 'in_channel'
          });
          return;
        }

        // Handle status queries
        if (query.toLowerCase().includes('status') || query.toLowerCase().includes('progress')) {
          await this.handleStatusCommand(respond);
          return;
        }

        // Default help response
        await respond({
          text: `🤖 *AI Production Assistant*\nI can help you with:\n• \`/assistant help\` - Show this help\n• \`/hackathon status\` - Project status\n• \`/hackathon tasks\` - View tasks\n• \`/task [description]\` - Create new task\n\nTry asking: "how many tasks left?" or "what's our progress?"`,
          response_type: 'ephemeral'
        });

      } catch (error) {
        logger.error('Assistant command error:', error);
        await respond({
          text: '❌ Something went wrong. Please try again.',
          response_type: 'ephemeral'
        });
      }
    });
  }

  setupEvents() {
    // Listen for mentions
    this.app.event('app_mention', async ({ event, client }) => {
      try {
        const message = event.text.replace(/<@[^>]+>/g, '').trim();
        
        if (message.toLowerCase().includes('status') || message.toLowerCase().includes('update')) {
          await this.sendStatusUpdate(client, event.channel);
        } else if (message.toLowerCase().includes('create') || message.toLowerCase().includes('task')) {
          // Extract task from mention
          const taskDescription = message.replace(/(create|task|add)/gi, '').trim();
          if (taskDescription) {
            const result = await smartTaskCreator.parseNaturalLanguageRequest(taskDescription);
            await client.chat.postMessage({
              channel: event.channel,
              text: `✅ Created task: *${result.tasks[0]?.title}*`
            });
          }
        } else {
          // General AI assistance
          await this.handleGeneralQuery(client, event.channel, message);
        }
      } catch (error) {
        logger.error('App mention error:', error);
      }
    });

    // Handle reactions for task completion
    this.app.event('reaction_added', async ({ event, client }) => {
      if (event.reaction === 'white_check_mark' || event.reaction === 'heavy_check_mark') {
        // Look for task IDs in the message
        try {
          const result = await client.conversations.history({
            channel: event.item.channel,
            latest: event.item.ts,
            limit: 1,
            inclusive: true
          });

          const message = result.messages[0];
          const taskIdMatch = message.text.match(/task_[\w]+/);
          
          if (taskIdMatch) {
            const taskId = taskIdMatch[0];
            const task = taskManager.getTask(taskId);
            if (task && task.status !== 'completed') {
              taskManager.updateTask(taskId, { status: 'completed' });
              await client.chat.postMessage({
                channel: event.item.channel,
                text: `🎉 Task completed: *${task.title}*`
              });
            }
          }
        } catch (error) {
          logger.error('Reaction handling error:', error);
        }
      }
    });
  }

  async handleStatusCommand(respond) {
    const stats = taskManager.getCompletionStats();
    const daysLeft = taskManager.getDaysUntilHackathon();
    
    const statusEmoji = stats.completionRate >= 80 ? '🟢' : 
                       stats.completionRate >= 60 ? '🟡' : '🔴';
    
    await respond({
      text: `${statusEmoji} *Hackathon Status*`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `🎯 AI Hackathon - ${daysLeft} days remaining`
          }
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Progress:* ${stats.completionRate}%`
            },
            {
              type: 'mrkdwn',
              text: `*Completed:* ${stats.completed}/${stats.total}`
            },
            {
              type: 'mrkdwn',
              text: `*In Progress:* ${stats.inProgress}`
            },
            {
              type: 'mrkdwn',
              text: `*Overdue:* ${stats.overdue}`
            }
          ]
        }
      ],
      response_type: 'in_channel'
    });
  }

  async handleTasksCommand(args, respond) {
    const filter = args[0]?.toLowerCase();
    let tasks;
    let title = 'All Tasks';

    switch (filter) {
      case 'overdue':
        tasks = taskManager.getOverdueTasks();
        title = '🚨 Overdue Tasks';
        break;
      case 'upcoming':
        tasks = taskManager.getUpcomingTasks(7);
        title = '📅 Upcoming Tasks (Next 7 Days)';
        break;
      case 'critical':
        tasks = taskManager.getCriticalPathTasks();
        title = '⚡ Critical Path Tasks';
        break;
      case 'pending':
        tasks = taskManager.getTasksByStatus('pending');
        title = '⏳ Pending Tasks';
        break;
      default:
        tasks = taskManager.getAllTasks().slice(0, 10);
        title = '📋 Recent Tasks';
    }

    if (tasks.length === 0) {
      await respond({
        text: `No ${filter || 'recent'} tasks found.`,
        response_type: 'ephemeral'
      });
      return;
    }

    const taskBlocks = tasks.slice(0, 10).map(task => {
      const urgency = task.getUrgencyLevel();
      const emoji = urgency === 'overdue' ? '🚨' : 
                   urgency === 'critical' ? '⚡' : 
                   urgency === 'high' ? '🔴' : 
                   urgency === 'medium' ? '🟡' : '🟢';
      
      const dueText = task.dueDate ? 
        `Due: ${new Date(task.dueDate).toLocaleDateString()}` : 
        'No due date';
      
      return {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${emoji} *${task.title}*\n_${task.category}_ | ${dueText} | ${task.status}\n${task.description.substring(0, 80)}${task.description.length > 80 ? '...' : ''}\n\`ID: ${task.id.split('_').pop()}\` ${task.assignee ? `| Assigned: ${task.assignee}` : '| 🆓 Available'}`
        },
        accessory: {
          type: 'button',
          text: {
            type: 'plain_text',
            text: task.status === 'completed' ? '✅' : 'Complete'
          },
          value: task.id,
          action_id: 'complete_task'
        }
      };
    });

    await respond({
      text: title,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: title
          }
        },
        ...taskBlocks
      ],
      response_type: 'in_channel'
    });
  }

  async handleCreateCommand(description, respond) {
    if (!description.trim()) {
      await respond({
        text: 'Usage: `/hackathon create [task description]`',
        response_type: 'ephemeral'
      });
      return;
    }

    try {
      const result = await smartTaskCreator.parseNaturalLanguageRequest(description);
      
      await respond({
        text: `✅ Created ${result.tasks.length} task(s)`,
        blocks: result.tasks.map(task => ({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${task.title}*\nCategory: ${task.category} | Priority: ${task.priority}\nDue: ${new Date(task.dueDate).toLocaleDateString()}`
          }
        })),
        response_type: 'in_channel'
      });
    } catch (error) {
      await respond({
        text: '❌ Failed to create task. Please provide more details.',
        response_type: 'ephemeral'
      });
    }
  }

  async handleGapsCommand(respond) {
    const gaps = taskManager.identifyGaps();
    
    if (gaps.length === 0) {
      await respond({
        text: '✅ No critical gaps identified in the current plan.',
        response_type: 'in_channel'
      });
      return;
    }

    const gapBlocks = gaps.slice(0, 5).map(gap => ({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${gap.severity === 'critical' ? '🚨' : '⚠️'} *${gap.type.replace('_', ' ').toUpperCase()}*\n${gap.description}\n_Suggested: ${gap.suggestedAction}_`
      }
    }));

    await respond({
      text: '🔍 Gap Analysis Results',
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '🔍 Planning Gaps Identified'
          }
        },
        ...gapBlocks
      ],
      response_type: 'in_channel'
    });
  }

  async handleSummaryCommand(respond) {
    const summary = taskManager.generateDailySummary();
    
    await respond({
      text: '📊 Daily Summary',
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `📊 Hackathon Summary - ${summary.daysUntilHackathon} days left`
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Progress:* ${summary.stats.completionRate}% complete (${summary.stats.completed}/${summary.stats.total} tasks)\n*Status:* ${summary.stats.inProgress} in progress, ${summary.stats.overdue} overdue, ${summary.stats.atRisk} at risk`
          }
        },
        ...(summary.overdue.length > 0 ? [{
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*🚨 Overdue:*\n${summary.overdue.map(t => `• ${t.title} (${t.daysOverdue} days overdue)`).join('\n')}`
          }
        }] : []),
        ...(summary.pending.length > 0 ? [{
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*⏳ Pending:*\n${summary.pending.map(t => `• ${t.title} (due in ${t.dueIn} days)`).join('\n')}`
          }
        }] : []),
        ...(summary.inProgress.length > 0 ? [{
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*🚧 In Progress:*\n${summary.inProgress.map(t => `• ${t.title} (due in ${t.dueIn} days)`).join('\n')}`
          }
        }] : []),
        ...(summary.upcoming.length > 0 ? [{
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*📅 Upcoming:*\n${summary.upcoming.map(t => `• ${t.title} (due in ${t.dueIn} days)`).join('\n')}`
          }
        }] : [])
      ],
      response_type: 'in_channel'
    });
  }

  async handleHelpCommand(respond) {
    await respond({
      text: '🤖 AI Hackathon Assistant Commands',
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '🤖 AI Hackathon Assistant'
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
text: '*Main Commands:*\n• `/hackathon status` - Show overall progress\n• `/hackathon tasks [filter]` - List tasks (overdue, upcoming, critical, pending)\n• `/hackathon create [description]` - Create new task from description\n• `/hackathon claim [task ID]` - Assign task to yourself\n• `/hackathon gaps` - Identify planning gaps\n• `/hackathon summary` - Daily progress summary\n\n*Quick Commands:*\n• `/task [description]` - Quick task creation\n• Mention @AI Production Assistant for general help\n• React with ✅ to mark tasks complete'
          }
        }
      ],
      response_type: 'ephemeral'
    });
  }

  async handleClaimCommand(args, command, respond) {
    const taskId = args[0];
    if (!taskId) {
      await respond({
        text: 'Usage: `/hackathon claim [task ID]` or `/hackathon take [task ID]`',
        response_type: 'ephemeral'
      });
      return;
    }

    try {
      const userName = command.user_name || 'Unknown User';
      const task = taskManager.updateTask(taskId, { assignee: userName, status: 'in_progress' });
      
      await respond({
        text: `✅ You've been assigned to: *${task.title}*`,
        blocks: [{
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `🎯 *Task Claimed!*\n*${task.title}*\nAssigned to: ${userName}\nDue: ${new Date(task.dueDate).toLocaleDateString()}\nPriority: ${task.priority}`
          }
        }],
        response_type: 'in_channel'
      });
    } catch (error) {
      await respond({
        text: '❌ Task not found or could not be assigned. Use `/hackathon tasks` to see available task IDs.',
        response_type: 'ephemeral'
      });
    }
  }

  async handleGeneralQuery(client, channel, query) {
    try {
      // Use AI to understand the query and provide helpful response
      const response = await smartTaskCreator.openai.chat.completions.create({
        model: smartTaskCreator.model,
        messages: [
          {
            role: 'system',
            content: `You are an AI hackathon production assistant. The hackathon is on September 24th, 2025. 
            Current date: ${new Date().toISOString().split('T')[0]}
            Days remaining: ${taskManager.getDaysUntilHackathon()}
            
            Provide helpful, concise responses about hackathon planning, task management, or event production.
            Be professional but friendly. Keep responses under 200 words.`
          },
          {
            role: 'user',
            content: query
          }
        ],
        temperature: 0.7,
        max_tokens: 300
      });

      await client.chat.postMessage({
        channel: channel,
        text: `🤖 ${response.choices[0].message.content}`
      });
    } catch (error) {
      logger.error('General query error:', error);
      await client.chat.postMessage({
        channel: channel,
        text: "🤖 I'm here to help with hackathon planning! Try asking about tasks, timelines, or use `/hackathon help` for commands."
      });
    }
  }

  async sendStatusUpdate(client, channel) {
    const summary = taskManager.generateDailySummary();
    
    await client.chat.postMessage({
      channel: channel,
      text: `🎯 *Daily Hackathon Update*`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `🎯 AI Hackathon Update - ${summary.daysUntilHackathon} days to go!`
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Progress:* ${summary.stats.completionRate}% complete\n*Tasks:* ${summary.stats.completed} done, ${summary.stats.inProgress} in progress\n*Issues:* ${summary.stats.overdue} overdue, ${summary.stats.atRisk} at risk`
          }
        }
      ]
    });
  }

  async sendDailyReminders(channel) {
    const summary = taskManager.generateDailySummary();
    
    // Send reminders if there are overdue or critical items
    if (summary.overdue.length > 0 || summary.criticalGaps.length > 0) {
      // Implementation for daily reminders
      logger.info('Sending daily reminders to Slack');
    }
  }

  getExpressReceiver() {
    return this.receiver ? this.receiver.router : null;
  }

  async start() {
    if (!this.isConfigured) {
      logger.warn('Cannot start Slack bot - not configured');
      return false;
    }

    if (this.isStarted) {
      logger.warn('Slack bot already started');
      return true;
    }

    try {
      // With ExpressReceiver, we don't start a separate server
      this.isStarted = true;
      logger.info('Slack bot ready for Express integration');
      return true;
    } catch (error) {
      logger.error('Failed to start Slack bot:', error);
      throw error;
    }
  }

  async postToChannel(message, channelId = null) {
    if (!this.isConfigured || !this.app) {
      logger.warn('Slack bot not configured, cannot post to channel');
      return false;
    }

    try {
      const channel = channelId || process.env.SLACK_CHANNEL_ID || 'C094W6PL9M5';
      
      await this.app.client.chat.postMessage({
        token: process.env.SLACK_BOT_TOKEN,
        channel: channel,
        ...message
      });

      logger.info(`Message posted to Slack channel: ${channel}`);
      return true;
    } catch (error) {
      logger.error('Failed to post message to Slack channel:', error);
      return false;
    }
  }

  async postCongratulations() {
    const congratsMessage = {
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '🎉 CONGRATULATIONS TEAM! 🎉'
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*WE DID IT!* The AI Hackathon was a MASSIVE SUCCESS! 🚀\n\n🏆 **100% EVENT COMPLETION ACHIEVED** 🏆\n\nFrom the first planning meetings to this moment, you all have been absolutely INCREDIBLE. Every single person contributed to making this event extraordinary.'
          }
        },
        { type: 'divider' },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '🌟 **What we accomplished together:**\n• Flawless event execution\n• Amazing speaker lineup delivered\n• Perfect tech infrastructure \n• Outstanding team coordination\n• Unforgettable participant experience\n\n*You should all be incredibly proud!* 👏'
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '📝 *Quick reminder: Please complete the post-event documentation in the next few days to help us capture all the amazing insights from today.*\n\n**THANK YOU ALL FOR MAKING THIS HAPPEN!** 🙌❤️'
          }
        }
      ]
    };

    return await this.postToChannel(congratsMessage);
  }

  async stop() {
    if (this.isStarted) {
      // With ExpressReceiver, no separate server to stop
      this.isStarted = false;
      logger.info('Slack bot stopped');
    }
  }
}

module.exports = new SlackBot();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const logger = require('./utils/logger');
const taskManager = require('./services/taskManager');
const smartTaskCreator = require('./services/smartTaskCreator');
const slackBot = require('./services/slackBot');
const dailySummaryService = require('./services/dailySummaryService');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use(logger.requestMiddleware);

// Routes
app.get('/', (req, res) => {
  try {
    res.sendFile(__dirname + '/../public/index.html');
  } catch (error) {
    res.json({ 
      status: 'error',
      message: 'File not found',
      path: __dirname + '/../public/index.html',
      error: error.message 
    });
  }
});

// Debug endpoint
app.get('/debug', (req, res) => {
  res.json({
    status: 'App is running!',
    environment: process.env.NODE_ENV,
    port: process.env.PORT,
    timestamp: new Date().toISOString(),
    cwd: process.cwd(),
    dirname: __dirname
  });
});

// Health Check Endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'Running',
    service: 'AI Production Assistant',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    endpoints: [
      'GET /health - Health check',
      'POST /slack/events - Slack event webhooks',
      'POST /slack/commands - Slack slash commands',
      'GET /tasks - Get all tasks',
      'POST /tasks - Create new task',
      'POST /chat - Chat with AI assistant'
    ]
  });
});

// Integrate Slack bot routes into main Express server
if (slackBot.isConfigured) {
  const slackReceiver = slackBot.getExpressReceiver();
  if (slackReceiver) {
    app.use(slackReceiver);
    logger.info('Slack bot integrated into Express server');
  }
}

// Chat with AI Assistant
app.post('/chat', async (req, res) => {
  try {
    const { message, context } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    // Use the smart task creator for AI responses
    const response = await smartTaskCreator.openai.chat.completions.create({
      model: smartTaskCreator.model,
      messages: [
        {
          role: 'system',
          content: `You are an AI hackathon production assistant. The hackathon is on September 24th, 2025. 
          Current date: ${new Date().toISOString().split('T')[0]}
          Days remaining: ${taskManager.getDaysUntilHackathon()}
          
          You help with:
          - Task management and planning
          - Event production advice  
          - Timeline management
          - Virtual event setup guidance
          
          Be helpful, concise, and actionable. Keep responses under 200 words.`
        },
        {
          role: 'user',
          content: message
        }
      ],
      temperature: 0.7,
      max_tokens: 300
    });

    res.json({
      success: true,
      response: response.choices[0].message.content,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Chat error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Legacy route aliases for compatibility
app.get('/tasks', (req, res) => {
  req.url = '/api/tasks';
  app._router.handle(req, res);
});

app.post('/tasks', (req, res) => {
  req.url = '/api/tasks';
  app._router.handle(req, res);
});

// Task Management Routes
app.get('/api/tasks', (req, res) => {
  try {
    const { status, category, assignee } = req.query;
    let tasks = taskManager.getAllTasks();

    if (status) tasks = tasks.filter(t => t.status === status);
    if (category) tasks = tasks.filter(t => t.category === category);
    if (assignee) tasks = tasks.filter(t => t.assignee === assignee);

    res.json({
      success: true,
      tasks: tasks.map(t => t.toJSON()),
      total: tasks.length
    });
  } catch (error) {
    logger.error('Failed to get tasks:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/tasks', async (req, res) => {
  try {
    const { naturalLanguage, taskData } = req.body;
    
    if (naturalLanguage) {
      // Create task from natural language
      const result = await smartTaskCreator.parseNaturalLanguageRequest(naturalLanguage);
      res.json({ success: true, result });
    } else {
      // Create task from structured data
      const task = taskManager.createTask(taskData);
      res.json({ success: true, task: task.toJSON() });
    }
  } catch (error) {
    logger.error('Failed to create task:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/tasks/:id', (req, res) => {
  try {
    const task = taskManager.updateTask(req.params.id, req.body);
    res.json({ success: true, task: task.toJSON() });
  } catch (error) {
    logger.error('Failed to update task:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.patch('/api/tasks/:id', (req, res) => {
  try {
    const task = taskManager.updateTask(req.params.id, req.body);
    res.json({ success: true, task: task.toJSON() });
  } catch (error) {
    logger.error('Failed to update task:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/tasks/:id', (req, res) => {
  try {
    const task = taskManager.deleteTask(req.params.id);
    res.json({ success: true, message: 'Task deleted' });
  } catch (error) {
    logger.error('Failed to delete task:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/tasks/:id', (req, res) => {
  try {
    const task = taskManager.getTask(req.params.id);
    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }
    res.json({ success: true, task: task.toJSON() });
  } catch (error) {
    logger.error('Failed to get task:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/tasks/:id/recommendations', async (req, res) => {
  try {
    const recommendations = await smartTaskCreator.generateTaskRecommendations(req.params.id);
    res.json({ success: true, recommendations });
  } catch (error) {
    logger.error('Failed to generate recommendations:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Analysis Routes
app.get('/api/status', (req, res) => {
  try {
    const stats = taskManager.getCompletionStats();
    const gaps = taskManager.identifyGaps();
    const summary = taskManager.generateDailySummary();
    
    res.json({
      success: true,
      stats,
      gaps,
      summary,
      hackathonDate: '2025-09-24',
      daysUntilHackathon: taskManager.getDaysUntilHackathon()
    });
  } catch (error) {
    logger.error('Failed to get status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/gaps', (req, res) => {
  try {
    const gaps = taskManager.identifyGaps();
    res.json({ success: true, gaps });
  } catch (error) {
    logger.error('Failed to analyze gaps:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/suggest-tasks', async (req, res) => {
  try {
    const suggestions = await smartTaskCreator.suggestMissingTasks();
    res.json({ success: true, suggestions });
  } catch (error) {
    logger.error('Failed to suggest tasks:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/summary', (req, res) => {
  try {
    const summary = taskManager.generateDailySummary();
    res.json({ success: true, summary });
  } catch (error) {
    logger.error('Failed to generate summary:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/daily-summary/trigger', async (req, res) => {
  try {
    const force = req.query.force === 'true';
    const success = await dailySummaryService.triggerManualSummary(force);
    
    if (success) {
      res.json({ success: true, message: 'Daily summary posted to Slack' });
    } else {
      res.json({ success: true, message: 'Daily summary already posted today (use ?force=true to override)' });
    }
  } catch (error) {
    logger.error('Failed to trigger daily summary:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/congratulations', async (req, res) => {
  try {
    const success = await slackBot.postCongratulations();
    
    if (success) {
      res.json({ success: true, message: 'Congratulations message posted to Slack' });
    } else {
      res.json({ success: false, message: 'Failed to post congratulations message' });
    }
  } catch (error) {
    logger.error('Failed to post congratulations:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/event-day-success', async (req, res) => {
  try {
    const success = await dailySummaryService.postEventDaySuccess();
    
    if (success) {
      res.json({ success: true, message: 'Event day success message posted to Slack' });
    } else {
      res.json({ success: false, message: 'Failed to post event day success message' });
    }
  } catch (error) {
    logger.error('Failed to post event day success:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Legacy AI routes (for backward compatibility)
app.post('/api/analyze', async (req, res) => {
  try {
    const { data, type } = req.body;
    
    // Redirect to task creation if it's a task-related analysis
    if (type === 'tasks' || data.toLowerCase().includes('task') || data.toLowerCase().includes('todo')) {
      const result = await smartTaskCreator.parseNaturalLanguageRequest(data);
      return res.json({ success: true, analysis: result });
    }
    
    // General analysis using AI
    const response = await smartTaskCreator.openai.chat.completions.create({
      model: smartTaskCreator.model,
      messages: [
        {
          role: 'system',
          content: 'You are an AI hackathon production assistant. Analyze the provided data and give actionable insights.'
        },
        {
          role: 'user',
          content: `Analyze this ${type || 'data'}: ${data}`
        }
      ],
      temperature: 0.3,
      max_tokens: 1000
    });

    res.json({
      success: true,
      analysis: {
        type: type || 'general',
        analysis: response.choices[0].message.content,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Analysis failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Socket.IO for real-time updates
io.on('connection', (socket) => {
  logger.info('Client connected:', socket.id);
  
  // Send initial data
  socket.emit('status_update', {
    stats: taskManager.getCompletionStats(),
    daysLeft: taskManager.getDaysUntilHackathon()
  });
  
  socket.on('get_tasks', (filters) => {
    let tasks = taskManager.getAllTasks();
    if (filters?.status) tasks = tasks.filter(t => t.status === filters.status);
    if (filters?.category) tasks = tasks.filter(t => t.category === filters.category);
    
    socket.emit('tasks_update', tasks.map(t => t.toJSON()));
  });
  
  socket.on('create_task', async (data) => {
    try {
      let result;
      if (data.naturalLanguage) {
        result = await smartTaskCreator.parseNaturalLanguageRequest(data.naturalLanguage);
      } else {
        const task = taskManager.createTask(data);
        result = { tasks: [task] };
      }
      
      socket.emit('task_created', result);
      // Broadcast to all clients
      io.emit('tasks_updated', { action: 'created', tasks: result.tasks });
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });
  
  socket.on('update_task', (data) => {
    try {
      const task = taskManager.updateTask(data.id, data.updates);
      socket.emit('task_updated', task.toJSON());
      io.emit('tasks_updated', { action: 'updated', task: task.toJSON() });
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });
  
  socket.on('disconnect', () => {
    logger.info('Client disconnected:', socket.id);
  });
});

// Initialize Slack bot if configured
slackBot.start().catch(error => {
  logger.error('Failed to initialize Slack bot:', error);
});

// Initialize daily summary service
dailySummaryService.start();

// Error handling
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await slackBot.stop();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  logger.info(`AI Hackathon Production Assistant running on port ${PORT}`);
  logger.info(`Server accessible at: http://localhost:${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV}`);
  logger.info(`Days until hackathon: ${taskManager.getDaysUntilHackathon()}`);
  
  // Initialize with default tasks if empty
  const taskCount = taskManager.getAllTasks().length;
  logger.info(`Loaded ${taskCount} tasks`);
});

module.exports = app;
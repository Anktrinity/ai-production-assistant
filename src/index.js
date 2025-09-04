const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const logger = require('./utils/logger');
const taskManager = require('./services/taskManager');
const smartTaskCreator = require('./services/smartTaskCreator');
const slackBot = require('./services/slackBot');

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
  res.sendFile(__dirname + '/../public/index.html');
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

// Start Slack bot if configured
slackBot.start(3001).catch(error => {
  logger.error('Failed to start Slack bot:', error);
});

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

server.listen(PORT, () => {
  logger.info(`AI Hackathon Production Assistant running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV}`);
  logger.info(`Days until hackathon: ${taskManager.getDaysUntilHackathon()}`);
  
  // Initialize with default tasks if empty
  const taskCount = taskManager.getAllTasks().length;
  logger.info(`Loaded ${taskCount} tasks`);
});

module.exports = app;
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const logger = require('./utils/logger');
const aiService = require('./services/aiService');
const productionMonitor = require('./services/productionMonitor');
const taskScheduler = require('./services/taskScheduler');

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

// Routes
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/../public/index.html');
});

app.post('/api/analyze', async (req, res) => {
  try {
    const { data, type } = req.body;
    const analysis = await aiService.analyze(data, type);
    res.json({ success: true, analysis });
  } catch (error) {
    logger.error('Analysis failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/suggest', async (req, res) => {
  try {
    const { context, task } = req.body;
    const suggestion = await aiService.generateSuggestion(context, task);
    res.json({ success: true, suggestion });
  } catch (error) {
    logger.error('Suggestion generation failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/status', (req, res) => {
  const status = productionMonitor.getSystemStatus();
  res.json(status);
});

// Socket.IO for real-time updates
io.on('connection', (socket) => {
  logger.info('Client connected:', socket.id);
  
  socket.on('request_analysis', async (data) => {
    try {
      const result = await aiService.analyze(data.content, data.type);
      socket.emit('analysis_result', result);
    } catch (error) {
      socket.emit('analysis_error', { error: error.message });
    }
  });
  
  socket.on('disconnect', () => {
    logger.info('Client disconnected:', socket.id);
  });
});

// Start production monitoring
productionMonitor.start(io);

// Start task scheduler
taskScheduler.start();

// Error handling
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

server.listen(PORT, () => {
  logger.info(`AI Production Assistant running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV}`);
});

module.exports = app;
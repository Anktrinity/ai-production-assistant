const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Basic middleware
app.use(express.json());
app.use(express.static('public'));

// Simple routes that should work
app.get('/debug', (req, res) => {
  res.json({
    status: 'Node.js app is running!',
    timestamp: new Date().toISOString(),
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    openai_configured: !!process.env.OPENAI_API_KEY
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'AI Production Assistant',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

app.get('/', (req, res) => {
  res.send(`
    <h1>🎯 AI Hackathon Production Assistant</h1>
    <p>Status: <strong style="color: green;">Running</strong></p>
    <p>Environment: ${process.env.NODE_ENV || 'development'}</p>
    <p>Timestamp: ${new Date().toISOString()}</p>
    <ul>
      <li><a href="/health">Health Check</a></li>
      <li><a href="/debug">Debug Info</a></li>
    </ul>
  `);
});

// Slack webhook placeholder (for testing)
app.post('/slack/events', (req, res) => {
  if (req.body.challenge) {
    return res.send(req.body.challenge);
  }
  res.status(200).send('OK');
});

app.listen(PORT, () => {
  console.log(`✅ AI Hackathon Assistant running on port ${PORT}`);
  console.log(`🚀 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🤖 OpenAI configured: ${!!process.env.OPENAI_API_KEY}`);
});

module.exports = app;
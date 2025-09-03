# AI Production Assistant

An intelligent production assistant system powered by AI that monitors, analyzes, and optimizes production systems in real-time.

## Features

- **Real-time System Monitoring**: Track CPU, memory, disk usage, and application health
- **AI-Powered Analysis**: Analyze logs, metrics, code, and deployment configurations using GPT-4
- **Intelligent Suggestions**: Get AI-generated recommendations for optimization and issue resolution
- **Automated Scheduling**: Run periodic health checks, system analysis, and maintenance tasks
- **Alert Management**: Smart alerting system with Slack integration
- **Web Dashboard**: Beautiful, responsive web interface for monitoring and interaction
- **Real-time Updates**: WebSocket-based live updates for metrics and alerts

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd ai-production-assistant
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Start the application:
```bash
# Development
npm run dev

# Production
npm start
```

## Configuration

Create a `.env` file with the following variables:

```env
# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4

# Server Configuration
PORT=3000
NODE_ENV=development

# Logging
LOG_LEVEL=info

# External Integrations (Optional)
SLACK_WEBHOOK_URL=your_slack_webhook_url_here
JIRA_API_TOKEN=your_jira_api_token_here
GITHUB_TOKEN=your_github_token_here
```

## API Endpoints

### System Status
- `GET /api/status` - Get current system status and metrics

### AI Analysis
- `POST /api/analyze` - Analyze data with AI
  ```json
  {
    "data": "Your data to analyze",
    "type": "logs|metrics|code|deployment|general"
  }
  ```

### AI Suggestions
- `POST /api/suggest` - Get AI suggestions
  ```json
  {
    "context": "Current situation or problem",
    "task": "What you want to accomplish"
  }
  ```

## WebSocket Events

The application uses Socket.IO for real-time communication:

- `system_metrics` - Real-time system metrics
- `alerts` - System alerts and warnings
- `analysis_result` - AI analysis results
- `request_analysis` - Request real-time analysis

## Architecture

```
src/
├── index.js                 # Main application entry point
├── controllers/             # Request handlers (future expansion)
├── services/
│   ├── aiService.js        # OpenAI integration and analysis
│   ├── productionMonitor.js # System monitoring and metrics
│   └── taskScheduler.js    # Automated task scheduling
├── utils/
│   └── logger.js           # Winston logging configuration
├── models/                 # Data models (future expansion)
└── middleware/             # Express middleware (future expansion)

public/
└── index.html              # Web dashboard interface

config/                     # Configuration files (future expansion)
tests/                      # Test files
logs/                       # Application logs
```

## Usage Examples

### Analyzing Production Logs

```javascript
// Via API
const response = await fetch('/api/analyze', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    data: "ERROR: Database connection timeout...",
    type: "logs"
  })
});
```

### Getting Optimization Suggestions

```javascript
const response = await fetch('/api/suggest', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    context: "High CPU usage at 85%",
    task: "Optimize application performance"
  })
});
```

### Real-time Monitoring

```javascript
const socket = io();

socket.on('system_metrics', (metrics) => {
  console.log('CPU:', metrics.cpu.usage);
  console.log('Memory:', metrics.memory.usage);
});

socket.on('alerts', (alerts) => {
  alerts.forEach(alert => {
    console.log(`Alert: ${alert.message}`);
  });
});
```

## Scheduled Tasks

The system automatically runs several scheduled tasks:

- **Daily Health Check** (9 AM): Comprehensive system analysis
- **Hourly Analysis**: Monitor for anomalies and high resource usage  
- **Weekly Cleanup** (Sunday midnight): Clean old alerts and generate reports
- **Alert Cleanup** (Every 6 hours): Maintain alert history

## Monitoring & Alerts

### Thresholds
- CPU Usage: Warning at 80%, Critical at 90%
- Memory Usage: Warning at 85%, Critical at 95%
- Disk Usage: Warning at 90%, Critical at 95%
- Response Time: Warning at 5000ms

### Alert Channels
- Console/Logs
- Slack (if webhook configured)
- Web Dashboard
- Real-time WebSocket notifications

## Development

### Running Tests
```bash
npm test
```

### Linting
```bash
npm run lint
```

### Build Check
```bash
npm run build
```

### Development Mode
```bash
npm run dev
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/new-feature`)
3. Commit your changes (`git commit -am 'Add new feature'`)
4. Push to the branch (`git push origin feature/new-feature`)
5. Create a Pull Request

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:
- Create an issue on GitHub
- Check the logs in the `logs/` directory
- Review the console output for debugging information

## Roadmap

- [ ] Database integration for persistent storage
- [ ] User authentication and authorization
- [ ] More external service integrations (PagerDuty, Datadog, etc.)
- [ ] Advanced ML-based anomaly detection
- [ ] Mobile app for monitoring
- [ ] Kubernetes integration
- [ ] Custom dashboard widgets
- [ ] Export functionality for reports
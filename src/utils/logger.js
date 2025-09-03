const winston = require('winston');
const path = require('path');

// Create logs directory if it doesn't exist
const fs = require('fs');
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { 
    service: 'ai-production-assistant',
    version: require('../../package.json').version 
  },
  transports: [
    // Write all logs with level `error` and below to error.log
    new winston.transports.File({ 
      filename: path.join(logsDir, 'error.log'), 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // Write all logs with level `info` and below to combined.log
    new winston.transports.File({ 
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 10
    }),
    // Write all logs with level `debug` and below to debug.log
    new winston.transports.File({ 
      filename: path.join(logsDir, 'debug.log'), 
      level: 'debug',
      maxsize: 5242880, // 5MB
      maxFiles: 3
    })
  ]
});

// If we're not in production, log to the console with a simple format
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
      }),
      winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
        let metaString = '';
        if (Object.keys(meta).length > 0) {
          metaString = ' ' + JSON.stringify(meta);
        }
        return `${timestamp} [${service}] ${level}: ${message}${metaString}`;
      })
    )
  }));
}

// Custom logging methods for specific use cases
logger.production = (message, meta = {}) => {
  logger.info(message, { ...meta, category: 'production' });
};

logger.ai = (message, meta = {}) => {
  logger.info(message, { ...meta, category: 'ai' });
};

logger.monitor = (message, meta = {}) => {
  logger.info(message, { ...meta, category: 'monitor' });
};

logger.scheduler = (message, meta = {}) => {
  logger.info(message, { ...meta, category: 'scheduler' });
};

// Performance timing helper
logger.time = (label) => {
  const start = process.hrtime.bigint();
  return {
    end: () => {
      const end = process.hrtime.bigint();
      const duration = Number(end - start) / 1000000; // Convert to milliseconds
      logger.debug(`Timer ${label}: ${duration.toFixed(2)}ms`);
      return duration;
    }
  };
};

// Request logging middleware
logger.requestMiddleware = (req, res, next) => {
  const timer = logger.time(`${req.method} ${req.path}`);
  
  res.on('finish', () => {
    const duration = timer.end();
    logger.info('HTTP Request', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      userAgent: req.get('User-Agent'),
      ip: req.ip || req.connection.remoteAddress
    });
  });
  
  next();
};

module.exports = logger;
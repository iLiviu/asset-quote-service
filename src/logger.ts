import winston from 'winston';

import { CONFIG } from './config';

const logger = winston.createLogger({
  exitOnError: false,
  level: CONFIG.LOG.LEVEL,
  transports: [
    //
    // - Write to all logs with level `info` and below to `combined.log`
    // - Write all logs error (and below) to `error.log`.
    //
    new winston.transports.File({
      filename: CONFIG.LOG.FILENAME,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
      ),
      handleExceptions: true,
    }),
  ],
});

// If we're not in production then log to the `console`:
const consoleFormat = winston.format.printf((info) => {
  return `${info.timestamp} ${info.level}: ${info.message}`;
});
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      consoleFormat,
      winston.format.timestamp(),
    ),
    level: 'debug',
  }));
}

export default logger;

import winston from "winston";
import { CONFIG } from "./config";

const logger = winston.createLogger({
  level: CONFIG.LOG.LEVEL,
  exitOnError: false,
  transports: [
    //
    // - Write to all logs with level `info` and below to `combined.log` 
    // - Write all logs error (and below) to `error.log`.
    //
    new winston.transports.File({
      filename: CONFIG.LOG.FILENAME,
      handleExceptions: true,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
      ),

    }),

  ]
});

// If we're not in production then log to the `console`:
const consoleFormat = winston.format.printf(info => {
  return `${info.timestamp} ${info.level}: ${info.message}`;
});
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    level: 'debug',
    format: winston.format.combine(
      winston.format.timestamp(),
      consoleFormat,
    ),
  }));
}

export default logger;
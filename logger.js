// --- START Logging Level Configuration ---
const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Default to 'info' if LOG_LEVEL is not set or invalid
const configuredLogLevelName = (process.env.LOG_LEVEL || 'info').toLowerCase();
const currentLogLevel = LOG_LEVELS[configuredLogLevelName] !== undefined ? LOG_LEVELS[configuredLogLevelName] : LOG_LEVELS.info;

const originalConsole = {
  debug: console.debug,
  log: console.log, // Will treat console.log as 'info' level
  info: console.info,
  warn: console.warn,
  error: console.error,
};

console.debug = (...args) => {
  if (currentLogLevel <= LOG_LEVELS.debug) {
    originalConsole.debug.apply(console, args);
  }
};

console.log = (...args) => { // Route console.log to 'info'
  if (currentLogLevel <= LOG_LEVELS.info) {
    originalConsole.log.apply(console, args);
  }
};

console.info = (...args) => {
  if (currentLogLevel <= LOG_LEVELS.info) {
    originalConsole.info.apply(console, args);
  }
};

console.warn = (...args) => {
  if (currentLogLevel <= LOG_LEVELS.warn) {
    originalConsole.warn.apply(console, args);
  }
};

console.error = (...args) => {
  if (currentLogLevel <= LOG_LEVELS.error) {
    originalConsole.error.apply(console, args);
  }
};

// Initial log message to confirm level, this will use the new console.log
originalConsole.log(`Logging level set to: ${configuredLogLevelName.toUpperCase()} from logger.js`);
// --- END Logging Level Configuration --- 
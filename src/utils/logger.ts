/**
 * Logger utility for consistent logging across the application
 * Only logs in development mode (except errors which always log)
 */

const isDev = import.meta.env.DEV;

export const logger = {
  /**
   * Log informational messages (only in development)
   * @param args - Arguments to log
   */
  log: (...args: unknown[]): void => {
    if (isDev) {
      console.log(...args);
    }
  },

  /**
   * Log error messages (always logged)
   * @param args - Arguments to log
   */
  error: (...args: unknown[]): void => {
    console.error(...args);
  },

  /**
   * Log warning messages (only in development)
   * @param args - Arguments to log
   */
  warn: (...args: unknown[]): void => {
    if (isDev) {
      console.warn(...args);
    }
  },

  /**
   * Log debug messages (only in development)
   * @param args - Arguments to log
   */
  debug: (...args: unknown[]): void => {
    if (isDev) {
      console.debug(...args);
    }
  },
};

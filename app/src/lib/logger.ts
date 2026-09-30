/**
 * Structured logging system for Kaiten
 *
 * This module provides a centralized logging interface that can be
 * configured to send logs to various services (Sentry, Datadog, etc.)
 *
 * @example
 * import { logger } from '@/lib/logger';
 *
 * logger.error(new Error('Payment failed'), { userId: '123', amount: 100 });
 * logger.warn('Rate limit approaching', { current: 95, limit: 100 });
 * logger.info('User logged in', { userId: '123' });
 * logger.track('button_clicked', { buttonId: 'submit-form' });
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogContext = Record<string, unknown>;

declare global {
  interface Window {
    __KAITEN_E2E_TRACK__?: (event: string, properties?: LogContext) => void;
  }
}

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: LogContext;
  error?: Error;
}

/**
 * Check if we're in development mode
 */
const isDev = import.meta.env.DEV;

/**
 * Format a log entry for console output
 */
function formatLogEntry(entry: LogEntry): string {
  const parts = [
    `[${entry.timestamp}]`,
    `[${entry.level.toUpperCase()}]`,
    entry.message,
  ];

  if (entry.context && Object.keys(entry.context).length > 0) {
    parts.push(JSON.stringify(entry.context));
  }

  return parts.join(' ');
}

/**
 * Create a log entry
 */
function createLogEntry(
  level: LogLevel,
  message: string,
  context?: LogContext,
  error?: Error,
): LogEntry {
  return {
    level,
    message,
    timestamp: new Date().toISOString(),
    context,
    error,
  };
}

/**
 * Send log to external service (placeholder for Sentry, Datadog, etc.)
 *
 * TODO: Implement when error monitoring service is configured
 * - Sentry.captureException(error, { extra: context })
 * - Sentry.captureMessage(message, { level, extra: context })
 */
function sendToExternalService(entry: LogEntry): void {
  // Placeholder for external service integration
  // Uncomment and configure when ready:
  //
  // if (entry.error) {
  //   Sentry.captureException(entry.error, {
  //     level: entry.level as Sentry.SeverityLevel,
  //     extra: entry.context,
  //   });
  // } else {
  //   Sentry.captureMessage(entry.message, {
  //     level: entry.level as Sentry.SeverityLevel,
  //     extra: entry.context,
  //   });
  // }
  void entry; // Suppress unused variable warning
}

/**
 * Logger interface
 */
export const logger = {
  /**
   * Log debug information (development only)
   */
  debug: (message: string, context?: LogContext): void => {
    if (!isDev) return;

    const entry = createLogEntry('debug', message, context);
    console.debug(formatLogEntry(entry));
  },

  /**
   * Log informational messages
   */
  info: (message: string, context?: LogContext): void => {
    const entry = createLogEntry('info', message, context);

    if (isDev) {
      console.info(formatLogEntry(entry));
    }

    sendToExternalService(entry);
  },

  /**
   * Log warning messages
   */
  warn: (message: string, context?: LogContext): void => {
    const entry = createLogEntry('warn', message, context);

    if (isDev) {
      console.warn(formatLogEntry(entry));
    }

    sendToExternalService(entry);
  },

  /**
   * Log errors with optional context
   *
   * @example
   * logger.error(new Error('API call failed'), { endpoint: '/users', status: 500 });
   */
  error: (error: Error, context?: LogContext): void => {
    const entry = createLogEntry('error', error.message, context, error);

    if (isDev) {
      console.error(formatLogEntry(entry));
      console.error(error.stack);
    }

    sendToExternalService(entry);
  },

  /**
   * Track user actions and events for analytics
   *
   * @example
   * logger.track('feature_flag_created', { flagType: 'boolean', hasTargeting: true });
   */
  track: (event: string, properties?: LogContext): void => {
    if (isDev) {
      console.log(`[TRACK] ${event}`, properties);
      if (typeof window !== 'undefined') {
        window.__KAITEN_E2E_TRACK__?.(event, properties);
      }
    }

    // Placeholder for analytics integration
    // analytics.track(event, properties);
  },

  /**
   * Identify a user for analytics (call on login)
   *
   * @example
   * logger.identify(user.id, { email: user.email, plan: 'pro' });
   */
  identify: (userId: string, traits?: LogContext): void => {
    if (isDev) {
      console.log(`[IDENTIFY] ${userId}`, traits);
    }

    // Placeholder for analytics integration
    // analytics.identify(userId, traits);
  },

  /**
   * Mark a page view for analytics
   *
   * @example
   * logger.page('Dashboard', { customerId: '123' });
   */
  page: (name: string, properties?: LogContext): void => {
    if (isDev) {
      console.log(`[PAGE] ${name}`, properties);
    }

    // Placeholder for analytics integration
    // analytics.page(name, properties);
  },
} as const;

export type Logger = typeof logger;

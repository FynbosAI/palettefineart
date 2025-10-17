/**
 * Secure logging utility that:
 * - Only logs in development mode
 * - Redacts sensitive information
 * - Provides different log levels
 * - Can be easily disabled
 */

const runtimeEnv = (typeof import.meta !== 'undefined' && (import.meta as any)?.env)
  ? (import.meta as any).env
  : (process?.env ?? {});

const isDevelopment = typeof runtimeEnv.DEV === 'boolean'
  ? runtimeEnv.DEV
  : String(runtimeEnv.NODE_ENV || '').toLowerCase() === 'development';

const disableLoggingFlag = runtimeEnv.VITE_DISABLE_LOGGING;
const isLoggingDisabled = typeof disableLoggingFlag === 'boolean'
  ? disableLoggingFlag
  : String(disableLoggingFlag || '').toLowerCase() === 'true';

const ENABLE_LOGGING = isDevelopment && !isLoggingDisabled;

// Sensitive patterns to redact
const SENSITIVE_PATTERNS = [
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, // UUIDs
  /expires_at:\s*\d+/gi, // Expiration timestamps
  /user:\s*\{[^}]+\}/gi, // User objects
  /session[^{]*\{[^}]+\}/gi, // Session objects
];

// Organization names and other business-sensitive info
const BUSINESS_SENSITIVE = [
  'Tate Modern',
  'Christie\'s',
  // Add more as needed
];

function redactSensitiveInfo(message: string): string {
  if (!message || typeof message !== 'string') return message;
  
  let redacted = message;
  
  // Redact UUIDs and other patterns
  SENSITIVE_PATTERNS.forEach(pattern => {
    redacted = redacted.replace(pattern, '[REDACTED]');
  });
  
  // Redact business-sensitive information
  BUSINESS_SENSITIVE.forEach(sensitive => {
    redacted = redacted.replace(new RegExp(sensitive, 'gi'), '[ORG_NAME]');
  });
  
  return redacted;
}

function formatLogMessage(level: string, component: string, message: string): string {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  const emoji = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : level === 'success' ? '✅' : '🔍';
  return `${emoji} [${timestamp}] ${component}: ${message}`;
}

export const logger = {
  debug: (component: string, message: string, data?: any) => {
    if (!ENABLE_LOGGING) return;
    const safeMessage = redactSensitiveInfo(message);
    console.log(formatLogMessage('debug', component, safeMessage));
    if (data && isDevelopment) {
      console.log('📦 Data:', data);
    }
  },

  info: (component: string, message: string, data?: any) => {
    if (!ENABLE_LOGGING) return;
    const safeMessage = redactSensitiveInfo(message);
    console.info(formatLogMessage('info', component, safeMessage));
    if (data && isDevelopment) {
      console.log('📦 Data:', data);
    }
  },

  success: (component: string, message: string, data?: any) => {
    if (!ENABLE_LOGGING) return;
    const safeMessage = redactSensitiveInfo(message);
    console.log(formatLogMessage('success', component, safeMessage));
    if (data && isDevelopment) {
      console.log('📦 Data:', data);
    }
  },

  warn: (component: string, message: string, data?: any) => {
    if (!ENABLE_LOGGING) return;
    const safeMessage = redactSensitiveInfo(message);
    console.warn(formatLogMessage('warn', component, safeMessage));
    if (data && isDevelopment) {
      console.warn('📦 Data:', data);
    }
  },

  error: (component: string, message: string, error?: any) => {
    if (!ENABLE_LOGGING) return;
    const safeMessage = redactSensitiveInfo(message);
    console.error(formatLogMessage('error', component, safeMessage));
    if (error && isDevelopment) {
      console.error('💥 Error:', error);
    }
  },

  // Performance logging without sensitive data
  perf: (component: string, operation: string, duration: number) => {
    if (!ENABLE_LOGGING) return;
    console.log(`⏱️ [${component}] ${operation} completed in ${duration}ms`);
  },

  // Auth state logging (heavily redacted)
  auth: (component: string, event: string, hasSession: boolean) => {
    if (!ENABLE_LOGGING) return;
    const message = `Auth event → ${event} ${hasSession ? 'Has session' : 'No session'}`;
    console.log(formatLogMessage('info', component, message));
  },

  // Realtime status (safe)
  realtime: (component: string, status: string, subscriptionCount: number) => {
    if (!ENABLE_LOGGING) return;
    const message = `Realtime status: ${status}, ${subscriptionCount} active subscriptions`;
    console.log(formatLogMessage('info', component, message));
  }
};

// Export a function to completely disable logging (for production builds)
export const disableLogging = () => {
  Object.keys(logger).forEach(key => {
    if (typeof logger[key as keyof typeof logger] === 'function') {
      (logger as any)[key] = () => {};
    }
  });
};

export default logger; 

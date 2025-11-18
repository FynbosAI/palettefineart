export const notificationDebugEnabled = true;

export const notificationDebugLog = (...args: unknown[]) => {
  if (!notificationDebugEnabled) {
    return;
  }
  if (typeof console !== 'undefined' && typeof console.log === 'function') {
    console.log('[notifications]', ...args);
  }
};

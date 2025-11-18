const runtimeEnv = (typeof import.meta !== 'undefined' && (import.meta as any)?.env)
  ? (import.meta as any).env
  : (process?.env ?? {});

export const API_BASE_URL = runtimeEnv.VITE_API_BASE_URL || 'http://localhost:3000';

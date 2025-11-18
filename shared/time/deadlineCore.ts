export type DeadlineUrgency = 'none' | 'normal' | 'warning' | 'critical' | 'expired';

export interface DeadlineState {
  label: string;
  urgency: DeadlineUrgency;
  isExpired: boolean;
  remainingMs: number | null;
  expiresAt: Date | null;
}

export interface ComputeDeadlineOptions {
  now?: number;
  manualClose?: boolean;
  openLabel?: string;
  manualLabel?: string;
  invalidLabel?: string;
  closedLabel?: string;
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const defaultLabels = {
  open: 'Open',
  manual: 'Manual close',
  invalid: 'Invalid deadline',
  closed: 'Estimate submissions closed',
};

const formatMinutes = (minutes: number) => {
  if (minutes <= 1) return '1 minute';
  return `${minutes} minutes`;
};

export function computeDeadlineState(
  deadline: string | null | undefined,
  options: ComputeDeadlineOptions = {}
): DeadlineState {
  const nowMs = options.now ?? Date.now();
  const openLabel = options.openLabel ?? defaultLabels.open;
  const manualLabel = options.manualLabel ?? defaultLabels.manual;
  const invalidLabel = options.invalidLabel ?? defaultLabels.invalid;
  const closedLabel = options.closedLabel ?? defaultLabels.closed;

  if (options.manualClose) {
    return {
      label: manualLabel,
      urgency: 'none',
      isExpired: false,
      remainingMs: null,
      expiresAt: null,
    };
  }

  if (!deadline) {
    return {
      label: openLabel,
      urgency: 'none',
      isExpired: false,
      remainingMs: null,
      expiresAt: null,
    };
  }

  const deadlineMs = Date.parse(deadline);
  if (Number.isNaN(deadlineMs)) {
    return {
      label: invalidLabel,
      urgency: 'none',
      isExpired: false,
      remainingMs: null,
      expiresAt: null,
    };
  }

  const diffMs = deadlineMs - nowMs;

  if (diffMs <= 0) {
    return {
      label: closedLabel,
      urgency: 'expired',
      isExpired: true,
      remainingMs: 0,
      expiresAt: new Date(deadlineMs),
    };
  }

  const diffMinutes = Math.floor(diffMs / MINUTE_MS);
  const diffHours = Math.floor(diffMs / HOUR_MS);
  const diffDays = Math.floor(diffMs / DAY_MS);

  let label: string;
  if (diffDays >= 2) {
    label = `${diffDays} days left`;
  } else if (diffHours >= 24) {
    const days = Math.ceil(diffMs / DAY_MS);
    label = `${days} day${days === 1 ? '' : 's'} left`;
  } else if (diffHours >= 1) {
    label = `${diffHours} hour${diffHours === 1 ? '' : 's'} left`;
  } else {
    label = `${formatMinutes(Math.max(1, diffMinutes))} left`;
  }

  let urgency: DeadlineUrgency = 'normal';
  if (diffHours < 24) {
    urgency = 'warning';
  }
  if (diffMinutes < 60) {
    urgency = 'critical';
  }

  return {
    label,
    urgency,
    isExpired: false,
    remainingMs: diffMs,
    expiresAt: new Date(deadlineMs),
  };
}

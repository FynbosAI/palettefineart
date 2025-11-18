import { useEffect, useMemo, useState } from 'react';
import { computeDeadlineState } from './deadlineCore';
import type { ComputeDeadlineOptions, DeadlineState, DeadlineUrgency } from './deadlineCore';

export { computeDeadlineState };
export type { DeadlineState, DeadlineUrgency };

interface UseDeadlineCountdownOptions extends Omit<ComputeDeadlineOptions, 'now'> {
  intervalMs?: number;
}

export function useDeadlineCountdown(
  deadline: string | null | undefined,
  options: UseDeadlineCountdownOptions = {}
): DeadlineState {
  const { intervalMs = 30_000 } = options;
  const manualClose = options.manualClose ?? false;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!deadline || manualClose) {
      return undefined;
    }

    setNow(Date.now());

    const timerId = window.setInterval(() => {
      setNow(Date.now());
    }, Math.max(1_000, intervalMs));

    return () => {
      window.clearInterval(timerId);
    };
  }, [deadline, intervalMs, manualClose]);

  return useMemo(
    () =>
      computeDeadlineState(deadline, {
        now,
        manualClose,
        openLabel: options.openLabel,
        manualLabel: options.manualLabel,
        invalidLabel: options.invalidLabel,
        closedLabel: options.closedLabel,
      }),
    [deadline, manualClose, now, options.closedLabel, options.invalidLabel, options.manualLabel, options.openLabel]
  );
}

import { useEffect, useRef } from 'react';

export const AUTO_REFRESH_INTERVAL_MS = 30 * 1000;

/** Pause background polling after this long without user interaction. */
export const AUTO_REFRESH_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

const ACTIVITY_EVENTS = [
  'pointermove',
  'pointerdown',
  'keydown',
  'wheel',
  'touchstart',
  'scroll',
] as const;

/**
 * Runs `fn` on a fixed interval to keep visible data fresh. The callback only
 * fires while the page is visible AND the user is actively using it — polling
 * is skipped for hidden tabs and for an open-but-idle page, so background
 * tabs consume nothing. An immediate catch-up refresh fires when the tab
 * becomes visible again or when the user interacts after being idle.
 * Polling is disabled entirely while `paused` is true.
 */
export function useAutoRefresh(
  fn: () => void,
  paused: boolean,
  intervalMs: number = AUTO_REFRESH_INTERVAL_MS,
  idleTimeoutMs: number = AUTO_REFRESH_IDLE_TIMEOUT_MS
) {
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });

  useEffect(() => {
    if (paused) return undefined;

    let timer = 0;
    let lastActivity = Date.now();

    const isIdle = () => Date.now() - lastActivity >= idleTimeoutMs;

    const tick = () => {
      if (document.visibilityState === 'visible' && !isIdle()) fnRef.current();
    };

    const restartInterval = () => {
      window.clearInterval(timer);
      timer = window.setInterval(tick, intervalMs);
    };

    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      // Data may be stale after being away — refresh right away.
      tick();
      restartInterval();
    };

    const markActivity = () => {
      const wasIdle = isIdle();
      lastActivity = Date.now();
      if (wasIdle) {
        // User is back after an idle period — catch up immediately.
        tick();
        restartInterval();
      }
    };

    timer = window.setInterval(tick, intervalMs);
    document.addEventListener('visibilitychange', handleVisibility);
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, markActivity, { passive: true });
    }

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, markActivity);
      }
    };
  }, [paused, intervalMs, idleTimeoutMs]);
}

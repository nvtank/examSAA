export type SessionClock = {
  startedAt: number;
  durationSec: number;
  pausedAt?: number;
  pausedDurationMs?: number;
};

/** Time actually spent taking the exam; a paused clock uses its saved timestamp. */
export function elapsedMs(clock: SessionClock, now: number): number {
  return Math.max(0, (clock.pausedAt ?? now) - clock.startedAt - (clock.pausedDurationMs ?? 0));
}

export function remainingSeconds(clock: SessionClock, now: number): number {
  return Math.max(0, Math.ceil((clock.durationSec * 1000 - elapsedMs(clock, now)) / 1000));
}

export function pauseClock<T extends SessionClock>(clock: T, now: number): T {
  if (clock.pausedAt !== undefined || remainingSeconds(clock, now) === 0) return clock;
  return { ...clock, pausedAt: now };
}

export function resumeClock<T extends SessionClock>(clock: T, now: number): T {
  if (clock.pausedAt === undefined) return clock;
  return {
    ...clock,
    pausedDurationMs: (clock.pausedDurationMs ?? 0) + Math.max(0, now - clock.pausedAt),
    pausedAt: undefined,
  };
}

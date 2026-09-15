import { afterEach, beforeEach, vi } from 'vitest';

/** Pins the wall clock to `instant` for every test in the file that calls this, at module level.
 *
 * A command reads the clock the way production reads it — `new Date()` in the body, not a `now()`
 * collaborator handed in through the constructor — so a spec that needs a known instant controls
 * the clock rather than the command's parameter list. That keeps the object the spec exercises the
 * same object the container builds.
 *
 * Only `Date` is faked. `setTimeout` and the rest keep running for real, so a double that resolves
 * on a timer still resolves and nothing has to remember to advance anything.
 *
 * A value read back through a frozen clock is a distinct `Date` carrying the same instant, not the
 * spec's own object: assert it with `toEqual`, never `toBe`. */
export const freezeClockAt = (instant: Date): void => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(instant);
  });

  afterEach(() => {
    vi.useRealTimers();
  });
};

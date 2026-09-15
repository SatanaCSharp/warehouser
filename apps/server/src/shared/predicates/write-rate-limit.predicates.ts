/** The questions `WriteRateLimitGuard` and its counter ask (ADR 0003, spec.md §6.1). */

/** Whether the handler declared itself write-rate-limited.
 *
 * `getAllAndOverride` reports an undecorated handler as `undefined`, which is the same answer as a
 * handler that declared the limit off — neither is counted. */
export const isWriteRateLimited = (limited: boolean | undefined): boolean =>
  limited === true;

/** Whether the clock has moved into a window later than the one the counts belong to.
 *
 * `currentWindow` is `undefined` before the first recorded write, which is a rollover too: there are
 * no counts yet, and the fresh window is the one being opened. */
export const hasWindowRolledOver = (
  window: number,
  currentWindow: number | undefined,
): boolean => window !== currentWindow;

/** Whether the member has already used the window's whole allowance.
 *
 * The allowance is an argument rather than read from the module constant, so the rule stays a
 * function of its inputs and a test can state the allowance it is exercising. */
export const exceedsWindowAllowance = (
  recorded: number,
  allowance: number,
): boolean => recorded >= allowance;

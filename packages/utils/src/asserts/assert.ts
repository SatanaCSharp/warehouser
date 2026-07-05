import { AssertionError } from '@warehouser/shared-types/errors';

/** Checking invariants, condition has to be always TRUE otherwise it throws an error  */
export const assert = <TError extends Error>(
  condition: boolean,
  message: string | TError | (() => TError),
): void => {
  if (condition) {
    return;
  }

  if (typeof message === 'function') {
    throw message();
  }

  if (typeof message === 'string') {
    throw new AssertionError(message);
  }

  throw message;
};

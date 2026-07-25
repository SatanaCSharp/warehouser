import { AssertionError } from '@warehouser/shared-types/errors';

type Assert = <TError extends Error>(
  condition: boolean,
  message: string | TError | (() => TError),
) => asserts condition;

/** Checking invariants, condition has to be always TRUE otherwise it throws an error  */
export const assert: Assert = (condition, message) => {
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

import { assert } from 'asserts/assert';
import { isDefined } from 'predicates';

export const assertDefined = <T, TError extends Error>(
  value: T | null | undefined,
  message?: string | TError | (() => TError),
): asserts value is T => {
  assert(isDefined(value), message ?? 'Expected value to be defined');
};

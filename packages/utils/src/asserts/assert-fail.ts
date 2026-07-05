import { assert } from 'asserts/assert';

export const assertFail = <TError extends Error>(message?: TError): never => {
  assert(false, message ?? 'Assertion fail error');
  throw new Error('Never invocation error');
};

import { isDefined } from '@warehouser/utils/predicates';

/** `typeof` checks given names.
 *
 * These are asked where the server reads something it did not type — a redactor walking an unknown
 * error payload, a validation issue from a schema library, a `Reflect.getMetadata` result. Written
 * inline, `typeof value !== 'object'` is a rule with no name in the middle of a branch; asked as
 * `isObjectLike(value)` it narrows and reads as the question it is.
 *
 * They stay in the server rather than moving to `packages/utils/src/predicates/` because only the
 * server asks them today, and server-error-handling.md §1 says not to promote a predicate for
 * reuse that has not happened. */

/** Whether the value is a string. */
export const isString = (value: unknown): value is string =>
  typeof value === 'string';

/** Whether the value is a number. It excludes `NaN` nowhere — callers asking this are
 * discriminating a parsed shape, not validating arithmetic. */
export const isNumber = (value: unknown): value is number =>
  typeof value === 'number';

/** Whether the value is a non-null object, which is what a caller means by `typeof x === 'object'`
 * every time it writes it: `typeof null` is also `'object'`, and no caller here wants `null`. */
export const isObjectLike = (value: unknown): value is object =>
  isDefined(value) && typeof value === 'object';

/** Whether the value is callable. */
export const isCallable = (
  value: unknown,
): value is (...args: readonly never[]) => unknown =>
  typeof value === 'function';

import { isEmpty } from '@warehouser/utils/predicates';

/** The bounds an Access Name holds. Warehouse, Workspace and Workspace Role names are one value
 * object, so these are one set of rules rather than one per naming command
 * (`shared/domain/value-objects/access-name.ts`). */

/** Whether a trimmed name states anything at all. A name of only whitespace trims to nothing, which
 * is the same as naming nothing. */
export const statesAName = (value: string): boolean => !isEmpty(value);

/** Whether a name stays within its length bound.
 *
 * Counted in user-perceived characters rather than in UTF-16 code units, which is why the count is
 * an argument: the caller segments the string, and this states the bound over the result. */
export const isWithinGraphemeBound = (
  graphemeCount: number,
  maxGraphemes: number,
): boolean => graphemeCount <= maxGraphemes;

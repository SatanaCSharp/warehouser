import { describeViolations } from 'test/architectural/web-graph';
import { REQUIRED_RULES, STORE_RULES } from 'test/architectural/web-rules';
import { describe, expect, it } from 'vitest';

/**
 * Redux Toolkit ownership and direction.
 *
 * `docs/system/frontend-architecture.md` §'State' fixes one direction through a
 * feature slice — root store imports the slice, the slice imports its case
 * reducers, nothing goes back — and names `store/hooks.ts` as the only typed
 * way into the store.
 *
 * Which module owns a slice, and that `auth` is the only one that does today,
 * is `src/test/state-placement/`'s assertion and is not repeated here.
 */
describe('store dependency direction', () => {
  it('is respected by every slice and consumer', async () => {
    expect(await describeViolations({ forbidden: STORE_RULES })).toEqual([]);
  });

  /**
   * A `required` rule fails on an absent edge rather than a present one, which
   * makes it the only kind of rule here that a *deletion* can break: remove the
   * `auth.actions.ts` import from `auth.slice.ts` and inline the case reducers,
   * and this is what says no.
   */
  it('requires each slice to declare its case reducers beside it', async () => {
    expect(await describeViolations({ required: REQUIRED_RULES })).toEqual([]);
  });
});

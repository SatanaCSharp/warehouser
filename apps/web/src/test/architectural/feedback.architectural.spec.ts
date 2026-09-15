import { describeViolations } from 'test/architectural/web-graph';
import { FEEDBACK_RULES, SOLE_OWNER_RULES } from 'test/architectural/web-rules';
import { describe, expect, it } from 'vitest';

/**
 * Who owns each half of a failed request, and the mechanisms with one owner.
 *
 * `docs/system/guides/web-error-handling.md` gives every part of a failure a
 * single home: the field a refusal maps to is the endpoint's
 * `transformErrorResponse`, the toast is a registry entry raised by
 * middleware, and a component triggers the mutation and writes no feedback code
 * at all. A component doing any of it again is not a duplicate — it is a second
 * answer to a question that already had one, and the two drift apart quietly.
 *
 * The `SOLE_OWNER_RULES` beside them are the same shape at a different scale:
 * each names a file that a decision made the only reader or the only consumer
 * of something, where a second one means the decision has stopped holding.
 */
describe('action feedback ownership', () => {
  it('stays with the owner each guide named', async () => {
    expect(await describeViolations({ forbidden: FEEDBACK_RULES })).toEqual([]);
  });
});

describe('mechanisms with exactly one owner', () => {
  it('still have exactly one', async () => {
    expect(await describeViolations({ forbidden: SOLE_OWNER_RULES })).toEqual(
      [],
    );
  });
});

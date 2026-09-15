import type { DeleteResult, UpdateResult } from 'typeorm';

/** What every guarded write in `shared/domain/repositories/` asks about its own result.
 *
 * The guarded-write pattern (creating-a-server-repository.md) embeds a write's precondition in the
 * statement's own `WHERE` clause and then reads the row count back, so "did it apply?" and "which
 * refusal is owed?" are both answered from what the write itself reports rather than from a
 * preceding read. Those questions are asked in a dozen repositories, and written inline they become
 * a dozen slightly different spellings of `affected === 1` — which is why they live here. */

/** Whether a driver reported exactly one row for a statement that named exactly one.
 *
 * `affected` is `number | null | undefined` because not every driver reports a count; only an
 * explicit `1` is an applied write, so an unreported count is read as a write that did not happen
 * rather than as one that silently did. */
export const reportsExactlyOneRow = (
  affected: number | null | undefined,
): boolean => affected === 1;

/** Whether a guarded `UPDATE` or `DELETE` matched its single intended row. */
export const affectedExactlyOneRow = (
  result: DeleteResult | UpdateResult,
): boolean => reportsExactlyOneRow(result.affected);

/** Whether a disambiguating `countBy` found the single row it named.
 *
 * Asked only after a guarded write has already been refused, to decide which refusal the caller is
 * owed — never to decide whether the write happens. */
export const matchedExactlyOneRow = (count: number): boolean => count === 1;

/** Whether a guarded write reported that it applied.
 *
 * Every `*WriteOutcome` union in `shared/domain/repositories/` spells success as the literal
 * `'applied'` and its refusals as named alternatives, so the question is the same one regardless of
 * which repository's outcome is being read. */
export const isWriteApplied = (outcome: string): boolean =>
  outcome === 'applied';

/** Whether a guarded write reported that it applied, where the repository reports that as a
 * `boolean` rather than as a named outcome.
 *
 * The boolean-shaped twin of `isWriteApplied`. Repositories in this tree report a guarded write
 * both ways — some return a `*WriteOutcome` union naming each refusal, others return `true`/`false`
 * where there is only one way to fail — and this names the second convention so a caller asking
 * "did it apply?" asks it the same way regardless. It reads as a thin wrapper because it is one:
 * what it buys is that the convention has a name and one place to change, rather than being a bare
 * flag at each `assert`. A repository that grows a second refusal should return the union instead
 * and its callers move to `isWriteApplied`. */
export const appliedGuardedWrite = (applied: boolean): boolean => applied;

/** Whether a write touched anything at all, for the statements whose precondition does not name a
 * single row. Unlike `affectedExactlyOneRow`, more than one is a success here. */
export const affectedAnyRow = (result: {
  readonly affected?: number | null;
}): boolean => (result.affected ?? 0) > 0;

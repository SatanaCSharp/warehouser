import { randomUUID } from 'node:crypto';

import { beforeEach, vi } from 'vitest';

/** The mock declaration a spec must write itself, verbatim, before `pinGeneratedUuids` can pin
 * anything — `vi.mock` is hoisted above the imports of the file that writes it and cannot be
 * re-exported from here:
 *
 * ```ts
 * vi.mock('node:crypto', async (importOriginal) => {
 *   const actual = await importOriginal<typeof import('node:crypto')>();
 *   return { ...actual, randomUUID: vi.fn(actual.randomUUID) };
 * });
 * ```
 */
const PIN_REQUIRES_MODULE_MOCK =
  "pinGeneratedUuids needs the spec to vi.mock('node:crypto') with randomUUID: vi.fn(actual.randomUUID)";

/** Pins the identifiers `randomUUID()` hands out, in order, for every test in the file that calls
 * this at module level. A generator call past the end of `ids` produces a real UUID.
 *
 * A command mints its identifiers the way production mints them — `randomUUID()` in the body, not
 * an `id()` collaborator in the constructor — so a spec that needs to name the row the command
 * created pins the generator rather than the command's parameter list. The object the spec
 * exercises stays the object the container builds. */
export const pinGeneratedUuids = (...ids: readonly string[]): void => {
  beforeEach(() => {
    if (!vi.isMockFunction(randomUUID)) {
      throw new Error(PIN_REQUIRES_MODULE_MOCK);
    }

    // `mockReset` both empties the queue a previous test may have left unused — the tier's
    // `clearMocks` does not, it only forgets the calls — and restores the real generator as the
    // implementation behind the pinned ids.
    const generate = vi.mocked(randomUUID);
    generate.mockReset();

    for (const id of ids) {
      generate.mockReturnValueOnce(id as ReturnType<typeof randomUUID>);
    }
  });
};

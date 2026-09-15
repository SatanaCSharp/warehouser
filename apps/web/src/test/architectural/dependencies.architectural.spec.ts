import { describeViolations } from 'test/architectural/web-graph';
import { DEPENDENCY_RULES } from 'test/architectural/web-rules';
import { describe, expect, it } from 'vitest';

/**
 * Which packages `apps/web` may reach for, and how it must name them.
 *
 * Four Accepted ADRs each picked one technology and closed the question: Zod
 * for validation, RTK Query for server state, HeroUI for UI, public locale
 * directories for translations. A second one of any of them is not a preference
 * a reviewer argues about — it is a decision being reopened silently, in a
 * `package.json` diff nobody reads as an architecture change.
 *
 * The naming rules alongside them (`@warehouser/contracts` by subpath, Lodash
 * one function at a time) are the cases where the import *works* and costs
 * something anyway — a broken build only `vite build` sees, or a barrel in the
 * bundle.
 */
describe('sanctioned dependencies', () => {
  it('are the only ones any production file reaches for', async () => {
    expect(await describeViolations({ forbidden: DEPENDENCY_RULES })).toEqual(
      [],
    );
  });
});

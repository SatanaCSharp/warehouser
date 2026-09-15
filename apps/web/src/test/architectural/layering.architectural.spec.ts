import { describeViolations } from 'test/architectural/web-graph';
import { HYGIENE_RULES, LAYER_RULES } from 'test/architectural/web-rules';
import { describe, expect, it } from 'vitest';

/**
 * Layer direction and graph hygiene.
 *
 * `docs/system/frontend-architecture.md` §3 lays `apps/web/src` out as a
 * composition layer over feature modules over `shared/`. The direction is the
 * whole point: the composition layer is allowed to know which modules exist,
 * and a module is not allowed to know how it was composed.
 *
 * Note what is *not* asserted here. Cross-module placement and the declared
 * public surface belong to `src/test/module-boundaries/`, because
 * `docs/system/adr/18-08-2026-scope-of-exercise-placement-tiebreak.md` rejects
 * a dependency-graph tool for that job by name. These rules cover the layer
 * edges that spec does not look at.
 */
describe('layer direction', () => {
  it('holds in every production file', async () => {
    expect(await describeViolations({ forbidden: LAYER_RULES })).toEqual([]);
  });
});

describe('graph hygiene', () => {
  /**
   * `apps/web` has twelve circular chains today and every one of them is
   * type-only — `auth.slice` ↔ `auth.actions` is the shape, and it follows from
   * how a slice and its case reducers are typed rather than from a defect.
   * TypeScript erases those edges, so they cost nothing at runtime. The rule
   * therefore judges runtime edges, and this spec records why: if the exemption
   * were dropped the rule would fail on twelve chains that are not bugs, and if
   * it were widened to `import type` the rule would be unenforceable.
   */
  it('has no runtime import cycles', async () => {
    expect(await describeViolations({ forbidden: HYGIENE_RULES })).toEqual([]);
  });
});

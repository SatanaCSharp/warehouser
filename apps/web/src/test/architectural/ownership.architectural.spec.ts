import { describeViolations } from 'test/architectural/web-graph';
import { OWNERSHIP_RULES } from 'test/architectural/web-rules';
import { describe, expect, it } from 'vitest';

/**
 * Component ownership, and the context directory that does not exist yet.
 *
 * '`A component owns another component when the other component is rendered
 * only by it — no sibling, no other module reaches in and imports it
 * directly.`' (`docs/system/guides/placing-web-components.md` §1). Nesting a
 * component under its owner is how that ownership gets written down; a file
 * from elsewhere importing it is what turns the nesting into a lie, and the
 * directory tree then documents an ownership nobody holds.
 *
 * The two context rules are preventative: '`apps/web` contains no React context
 * today' (`docs/system/guides/sharing-web-state-with-context.md` §1). They are
 * here so the first one that arrives cannot become the module's orchestrator or
 * get mounted at the root, both of which that guide's §8 forbids and neither of
 * which leaves a trace anything else would catch.
 */

/**
 * No exception list.
 *
 * There were three reaches here until the components they reached for were
 * unnested. `PurchaseDraftLineDestination` had two consumers in different owner
 * trees and now sits at the module's `components/` root;
 * `LineEndingAction` had two and now owns its own directory, with the
 * `line-ending-dialog/` tree it is the exclusive consumer of moved underneath
 * it. Both are what `docs/system/guides/placing-web-components.md` §2
 * prescribes: 'do not nest a sub-page component that has more than one
 * consumer … keep it at the shared ancestor level instead — the module's
 * `components/` root.'
 *
 * The rule is enforced with nothing exempted from it, which is the state worth
 * defending. A list added here later is a reach someone chose not to fix.
 */

describe('component ownership', () => {
  it('is not reached into from anywhere', async () => {
    expect(await describeViolations({ forbidden: OWNERSHIP_RULES })).toEqual(
      [],
    );
  });
});

import { describeViolations } from 'test/architectural/web-graph';
import { ROUTING_RULES } from 'test/architectural/web-rules';
import { describe, expect, it } from 'vitest';

/**
 * The router chunk's budget.
 *
 * Everything reachable from `router.ts` without a dynamic import loads before
 * the first paint: the route declarations, the guards that decide entry, and
 * the loaders that fill a destination. A page is reached only through
 * `lazyRouteComponent(() => import('./page'))`, and every rule here is a way of
 * accidentally dragging a feature across that line — a loader importing a
 * component, a route importing an api slice, a static import of the page.
 *
 * `docs/system/frontend-architecture.md` §'Route';
 * `docs/system/guides/adding-a-web-module.md` §5–§6.
 */
describe('router chunk boundary', () => {
  it('is respected by every route, loader and guard', async () => {
    expect(await describeViolations({ forbidden: ROUTING_RULES })).toEqual([]);
  });
});

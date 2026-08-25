import assert from 'node:assert/strict';
import { globSync, readFileSync } from 'node:fs';
import test from 'node:test';

// T2 — the route-table identity gate of the `modules-level-refactor` change request
// (docs/change-requests/modules-level-refactor/sad.md §5.5, CR-AC-11, CR-RG-01). The baseline is the
// server's resolved HTTP surface captured at `baseline_revision`; every server move is proved
// against it rather than at review. The gate is kept permanently after ship: regenerating
// `route-table.baseline.json` is a deliberate, reviewable act, never a way to make this spec pass.
import { buildRouteTable, findShadowedRoutes } from './route-table.mjs';

const BASELINE_PATH = 'tests/refactor/route-table.baseline.json';

// The prefix every route that changes owning module lives under. spec.md §6 records 21 routes
// across the two `workspaces` controllers at `baseline_revision`; the count is asserted rather than
// trusted, because a handler dropped during a controller split would otherwise leave the table
// simply shorter on both sides of a regenerated baseline.
const MOVED_ROUTE_PREFIX = '/api/v1/workspace';
const MOVED_ROUTE_COUNT = 21;

const productionControllers = () =>
  globSync('apps/server/src/**/*.controller.ts')
    .filter((file) => !file.endsWith('.spec.ts'))
    .sort();

const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));

test('the resolved HTTP route table is identical to the baseline capture', () => {
  const controllerFiles = productionControllers();

  assert.ok(controllerFiles.length > 0, 'expected controller files to scan');
  assert.deepEqual(buildRouteTable(controllerFiles), baseline);
});

test('every route that changes owning module is still served', () => {
  const moved = buildRouteTable(productionControllers()).filter((route) =>
    route.path.startsWith(MOVED_ROUTE_PREFIX),
  );

  assert.equal(moved.length, MOVED_ROUTE_COUNT);
});

test('no method and path pair is served twice', () => {
  assert.deepEqual(
    findShadowedRoutes(buildRouteTable(productionControllers())),
    [],
  );
});

// Splitting one controller into several is how a path silently becomes served twice, so the
// detector above is itself asserted to have teeth rather than assumed to (CR-AC-11: "no path
// shadowed and none unreachable").
test('reports a method and path pair a second controller would shadow', () => {
  const table = buildRouteTable(productionControllers());
  const shadow = table.find(
    (route) =>
      route.path === '/api/v1/workspace/roles' && route.method === 'GET',
  );

  assert.ok(shadow, 'expected GET /api/v1/workspace/roles in the route table');
  assert.deepEqual(findShadowedRoutes([...table, { ...shadow }]), [
    'GET /api/v1/workspace/roles is declared 2 times',
  ]);
});

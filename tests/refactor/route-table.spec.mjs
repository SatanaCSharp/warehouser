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

// spec.md §6 records 21 routes across the two `workspaces` controllers at `baseline_revision`, all
// under the `/api/v1/workspace` prefix; those 21 `method path` pairs are frozen here rather than
// merely counted, because a count survives a handler being dropped during a
// controller split as long as something else is added at the same prefix in the same change — which
// is exactly what happened once `delivery-addresses` raised the total to 23 by adding two new routes
// alongside the 21. Freezing the pairs themselves, and asserting each is still present, is what
// actually proves none of the 21 silently vanished; new routes at this prefix are left to the
// baseline comparison above, which already tracks the table's current, growing contents.
//
// `delivery-addresses` T11 added two new routes here — `GET` and `PUT
// /api/v1/workspace/warehouses/{warehouseId}/delivery-address` — whose subject is the Warehouse
// record and which therefore join this Workspace-scoped prefix (AC-10, sad.md §7). They are
// deliberately absent from this list: they never moved, so this invariant has nothing to prove
// about them.
const MOVED_ROUTES = [
  'PATCH /api/v1/workspace',
  'PUT /api/v1/workspace/active-warehouse',
  'GET /api/v1/workspace/context',
  'GET /api/v1/workspace/members',
  'POST /api/v1/workspace/members',
  'DELETE /api/v1/workspace/members/:userId',
  'PUT /api/v1/workspace/members/:userId/role',
  'POST /api/v1/workspace/owner-transfer',
  'GET /api/v1/workspace/permissions',
  'GET /api/v1/workspace/roles',
  'POST /api/v1/workspace/roles',
  'DELETE /api/v1/workspace/roles/:workspaceRoleId',
  'PATCH /api/v1/workspace/roles/:workspaceRoleId',
  'GET /api/v1/workspace/users',
  'GET /api/v1/workspace/warehouses',
  'POST /api/v1/workspace/warehouses',
  'PATCH /api/v1/workspace/warehouses/:warehouseId',
  'PUT /api/v1/workspace/warehouses/:warehouseId/archival',
  'GET /api/v1/workspace/warehouses/:warehouseId/assignable-roles',
  'POST /api/v1/workspace/warehouses/:warehouseId/memberships',
  'DELETE /api/v1/workspace/warehouses/:warehouseId/memberships/:userId',
];

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
  const served = new Set(
    buildRouteTable(productionControllers()).map(
      (route) => `${route.method} ${route.path}`,
    ),
  );

  for (const movedRoute of MOVED_ROUTES) {
    assert.ok(served.has(movedRoute), `expected ${movedRoute} to still be served`);
  }
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

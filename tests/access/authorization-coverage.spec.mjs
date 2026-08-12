import assert from 'node:assert/strict';
import { globSync } from 'node:fs';
import test from 'node:test';

// T30 — extends the single-level authorization-coverage release gate to two levels
// (docs/features/workspaces/tasks/two-level-authorization-coverage-check.md, AC-30, AC-31,
// sad.md §8 "Authorization coverage", ADR 0003). `classifyControllers`,
// `findDomainFrameworkImports` and `findForbiddenImports` are the static-analysis primitives this
// spec drives; they do not exist yet (`authorization-coverage-classifier.mjs` is unwritten), so
// every assertion below fails at import time until that module is implemented.
import {
  classifyControllers,
  findDomainFrameworkImports,
  findForbiddenImports,
} from './authorization-coverage-classifier.mjs';

const FIXTURES_DIR = 'tests/access/fixtures/authorization-coverage';

// sad.md §8 class 5 — declares no Permission because requiring one to read one's own capabilities
// would be circular.
const SELF_PROJECTION_READS = new Set([
  'apps/server/src/access/rest/controllers/access.controller.ts::readCurrent',
  'apps/server/src/workspaces/rest/controllers/workspace.controller.ts::readContext',
]);

// Explicitly listed, with a reason, per the DoD's fourth class. The Warehouse selection route is
// session-only with a documented membership check (sad.md §8 class 4): selecting is not a
// capability over a Warehouse resource, so it declares no Permission at either level, and the
// command itself proves the actor holds a live, non-archived membership (sad.md §6.8).
const INFRASTRUCTURE_EXEMPT = new Map([
  [
    'apps/server/src/workspaces/rest/controllers/workspace.controller.ts::setActiveWarehouse',
    'sad.md §8 class 4 — session-only Warehouse selection; the command, not a guard, proves live membership.',
  ],
]);

// ADR 0003's admitted archived-tolerant membership-edge mutation list. In this release it has
// exactly one member, `transferWarehouseManager` (AC-11, AC-36).
const ADMITTED_ARCHIVED_TOLERANT_MUTATIONS = new Map([
  [
    'apps/server/src/access/rest/controllers/access.controller.ts::transferManager',
    'ADR 0003 — transferWarehouseManager is a membership-edge mutation, never the Warehouse record, its name, or its archived state (AC-11, AC-36).',
  ],
]);

const classificationOptions = {
  selfProjectionReads: SELF_PROJECTION_READS,
  infrastructureExempt: INFRASTRUCTURE_EXEMPT,
  admittedArchivedTolerantMutations: ADMITTED_ARCHIVED_TOLERANT_MUTATIONS,
};

test('every user-accessible production handler outside authentication classifies exactly once', () => {
  const controllerFiles = globSync('apps/server/src/**/*.controller.ts').filter(
    (file) => !file.includes('/auth/') && !file.endsWith('.spec.ts'),
  );

  assert.ok(controllerFiles.length > 0, 'expected controller files to classify');

  const { violations } = classifyControllers(controllerFiles, classificationOptions);

  assert.deepEqual(violations, []);
});

test('fails a handler that declares no classification at all', () => {
  const fixture = `${FIXTURES_DIR}/unclassified-handler.fixture.ts`;
  const { violations } = classifyControllers([fixture], classificationOptions);

  assert.ok(
    violations.some((violation) => violation.includes('readSomething')),
    `expected a violation naming the unclassified handler, got: ${JSON.stringify(violations)}`,
  );
});

test('fails a Warehouse-Permission handler whose route carries no warehouseId parameter', () => {
  const fixture = `${FIXTURES_DIR}/missing-warehouse-id.fixture.ts`;
  const { violations } = classifyControllers([fixture], classificationOptions);

  assert.ok(
    violations.some(
      (violation) => violation.includes('listItems') && violation.includes('warehouseId'),
    ),
    `expected a violation naming the missing warehouseId, got: ${JSON.stringify(violations)}`,
  );
});

test('fails a handler declaring a Workspace Permission behind the Warehouse guard', () => {
  const fixture = `${FIXTURES_DIR}/workspace-permission-with-warehouse-guard.fixture.ts`;
  const { violations } = classifyControllers([fixture], classificationOptions);

  assert.ok(
    violations.some((violation) => violation.includes('listSomething')),
    `expected a violation naming the mismatched guard pairing, got: ${JSON.stringify(violations)}`,
  );
});

test('fails a handler declaring a Warehouse Permission behind the Workspace guard', () => {
  const fixture = `${FIXTURES_DIR}/warehouse-permission-with-workspace-guard.fixture.ts`;
  const { violations } = classifyControllers([fixture], classificationOptions);

  assert.ok(
    violations.some((violation) => violation.includes('listSomething')),
    `expected a violation naming the mismatched guard pairing, got: ${JSON.stringify(violations)}`,
  );
});

test('fails a Warehouse-scoped handler whose HTTP verb resolves to no read/mutating classification', () => {
  const fixture = `${FIXTURES_DIR}/unclassified-verb.fixture.ts`;
  const { violations } = classifyControllers([fixture], classificationOptions);

  assert.ok(
    violations.some((violation) => violation.includes('handleAnything')),
    `expected a violation naming the unclassified verb, got: ${JSON.stringify(violations)}`,
  );
});

test('fails a mutating handler declaring archived tolerance off the ADR 0003 list', () => {
  const fixture = `${FIXTURES_DIR}/unadmitted-archived-tolerant-mutation.fixture.ts`;
  const { violations } = classifyControllers([fixture], classificationOptions);

  assert.ok(
    violations.some(
      (violation) => violation.includes('doSomething') && violation.includes('ADR 0003'),
    ),
    `expected a violation naming the unadmitted archived-tolerant mutation, got: ${JSON.stringify(violations)}`,
  );
});

test('the admitted archived-tolerant membership-edge mutation is not itself a violation', () => {
  const controllerFiles = [
    'apps/server/src/access/rest/controllers/access.controller.ts',
  ];
  const { violations } = classifyControllers(controllerFiles, classificationOptions);

  assert.deepEqual(
    violations.filter((violation) => violation.includes('transferManager')),
    [],
  );
});

test('workspaces/domain declares no NestJS, HTTP, or TypeORM import', () => {
  const domainFiles = globSync('apps/server/src/workspaces/domain/**/*.ts').filter(
    (file) => !file.endsWith('.spec.ts'),
  );

  assert.ok(domainFiles.length > 0, 'expected workspaces/domain files to scan');
  assert.deepEqual(findDomainFrameworkImports(domainFiles), []);
});

test('fails a workspaces/domain file that imports a framework symbol', () => {
  const fixture = `${FIXTURES_DIR}/domain-with-framework-import.fixture.ts`;

  assert.deepEqual(findDomainFrameworkImports([fixture]), [fixture]);
});

test('access imports nothing from workspaces', () => {
  const accessFiles = globSync('apps/server/src/access/**/*.ts').filter(
    (file) => !file.endsWith('.spec.ts'),
  );

  assert.ok(accessFiles.length > 0, 'expected access files to scan');
  assert.deepEqual(findForbiddenImports(accessFiles, 'workspaces'), []);
});

test('fails an access file that imports from workspaces', () => {
  const fixture = `${FIXTURES_DIR}/access-importing-workspaces.fixture.ts`;

  assert.deepEqual(findForbiddenImports([fixture], 'workspaces'), [fixture]);
});

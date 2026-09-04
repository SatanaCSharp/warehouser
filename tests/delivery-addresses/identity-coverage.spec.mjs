import assert from 'node:assert/strict';
import { globSync } from 'node:fs';
import test from 'node:test';

import {
  CONTROLLER_LAYER_GLOB,
  CUSTOMERS_DOMAIN_FRAMEWORK_GLOB,
  CUSTOMERS_IMPORTING_PURCHASE_DRAFTS_GLOB,
  MODULE_PRIVATE_GLOB,
  REPOSITORY_FEATURE_GLOB,
  findControllerLayerViolations,
  findCustomersDomainFrameworkImports,
  findCustomersImportingPurchaseDrafts,
  findModulePrivateImports,
  findRepositoryFeatureImports,
  featureModules,
  productionSourceCount,
} from './architecture-boundaries.mjs';
import {
  allHandlers,
  findObservedPermissionGaps,
  gapsInHandlerSet,
  identityBearingContractTypes,
  identityBearingHandlers,
  withoutObservedPermission,
} from './identity-coverage.mjs';
import { classifyControllers } from '../access/authorization-coverage-classifier.mjs';

// T20 — the second of the two mechanical defences `docs/features/delivery-addresses/sad.md` §11
// prescribes "rather than a review pass, because a missed surface leaks silently and forever". The
// contract shape is the first (T13, T19); this is the check that makes quality goal 1 mechanical
// rather than remembered (§10 Architecture, AC-09, AC-09a).
//
// `spec.md` §6's hard rule is that 100% of this feature's capabilities have an explicit Permission
// rule and Warehouse ownership check, **reads included**, and 100% of the pre-existing
// identity-bearing surfaces are covered. This suite is the coverage half. The task file is explicit
// that it is not the whole of the evidence — "Metadata coverage alone is not sufficient evidence —
// the per-endpoint denial tests and per-projection redaction tests are the rest" — and those live in
// the HTTP-contract integration specs and the projection specs respectively.

const controllerFiles = () =>
  globSync('apps/server/src/**/*.controller.ts').filter(
    (file) => !file.endsWith('.spec.ts') && !file.includes('/auth/'),
  );

// ---------------------------------------------------------------------------------------------
// The rule itself
// ---------------------------------------------------------------------------------------------

// The rule is deliberately one-directional: it reports a **missing** declaration and never an extra
// one. `listPurchaseDrafts` and `readConsolidatedDemand` both declare the observed Permission over
// responses that carry no identity — `PurchaseDraftSummary` states in the contract that it "carries
// no customer identity at all", and `DemandLine` is an Item-level aggregate — and both are correct
// to. sad.md §8: "An observed Permission can never widen access… Declaring one on a handler cannot
// make a denied request succeed", so a surplus declaration is inert, while a missing one is the leak
// this check exists to stop. Flagging surplus declarations would also fight the projection layer,
// which reads the resolved Permission whether or not this release's schema happens to carry a name.
test('every handler whose response can carry customer identity gates it (sad.md §10, AC-09a)', () => {
  const { types } = identityBearingContractTypes();
  const files = controllerFiles();

  assert.ok(files.length > 0, 'expected controller files to scan');

  assert.deepEqual(findObservedPermissionGaps(files, types), []);
});

// A rule whose input set is empty passes for the wrong reason. These two guard the rule above
// against silently becoming inert — if the contract layout changes such that no type is recognised
// as identity-bearing, or no handler's return type resolves, the check would report zero violations
// while proving nothing at all.
test('the identity-bearing set is derived non-empty from the contract schemas', () => {
  const { types } = identityBearingContractTypes();

  // Named individually because each is reached by a *different* derivation path, and a regression in
  // any one of them would leave the rule silently narrower:
  //   Customer                  — seeded: a record schema of the customers projections module
  //   CustomerOrderIdentified   — seeded: states `customerName` directly
  //   PurchaseDraftDetail       — propagated: detail → line → lineCustomerDestination → customerName
  //   PurchaseDraftLineListEntry— propagated through the by-line read's own line shape
  for (const expected of [
    'Customer',
    'CustomerDetail',
    'CustomerOrder',
    'CustomerOrderIdentified',
    'PurchaseDraftDetail',
    'PurchaseDraftLine',
    'PurchaseDraftLineListEntry',
  ]) {
    assert.ok(
      types.has(expected),
      `expected ${expected} to be derived as identity-bearing, got: ${[...types].sort().join(', ')}`,
    );
  }
});

// The redaction's own counter-examples. `LineWarehouseDestination` is the Warehouse's own premises
// data — the contract states it "is **never** gated on `CUSTOMERS:WATCH`" because a member who
// prepares the dock may hold no Workspace Role at all — and `PurchaseDraftLineRedacted` is the shape
// that exists to prove the withholding. If either were derived as identity-bearing the rule would
// demand a declaration on reads that must not have one, and the check would be teaching the opposite
// of AC-09a.
test('the derivation excludes the Warehouse destination and the redacted forms', () => {
  const { types } = identityBearingContractTypes();

  for (const excluded of [
    'LineWarehouseDestination',
    'PurchaseDraftLineRedacted',
    'PurchaseDraftLineLinkRedacted',
    'CustomerOrderRedacted',
    'DemandLine',
  ]) {
    assert.ok(
      !types.has(excluded),
      `expected ${excluded} not to be treated as customer identity`,
    );
  }
});

test('the rule actually reaches handlers across every identity-bearing controller', () => {
  const { types } = identityBearingContractTypes();
  const handlers = identityBearingHandlers(controllerFiles(), types);

  assert.ok(
    handlers.length >= 25,
    `expected the join to reach the identity-bearing surface, got ${handlers.length}`,
  );

  // One per controller that serves customer identity, so a controller dropping out of the join —
  // by losing its return-type annotations, say — is caught rather than silently un-checked.
  for (const controller of [
    'customers/rest/controllers/customers.controller.ts',
    'customers/rest/controllers/customer-delivery-addresses.controller.ts',
    'customer-orders/rest/controllers/customer-orders.controller.ts',
    'purchase-drafts/rest/controllers/purchase-drafts.controller.ts',
    'purchase-drafts/rest/controllers/purchase-draft-lines.controller.ts',
  ]) {
    assert.ok(
      handlers.some((handler) => handler.includes(controller)),
      `expected ${controller} to contribute identity-bearing handlers`,
    );
  }
});

// ---------------------------------------------------------------------------------------------
// The positive control the Definition of Done requires: "proven by removing one"
// ---------------------------------------------------------------------------------------------

test('the check fails when the declaration is removed from an identity-bearing read', () => {
  const { types } = identityBearingContractTypes();
  const files = controllerFiles();

  const stripped = withoutObservedPermission(files, 'readPurchaseDraft');
  const gaps = gapsInHandlerSet(stripped, types);

  assert.equal(
    gaps.length,
    1,
    `expected exactly the stripped handler to be reported, got: ${JSON.stringify(gaps)}`,
  );
  assert.match(gaps[0], /readPurchaseDraft/u);
  assert.match(gaps[0], /PurchaseDraftDetail/u);
});

// Removing it from a *different* read fails too, so the control above is not passing because of
// something particular to one handler.
test('the check fails for any identity-bearing read the declaration is removed from', () => {
  const { types } = identityBearingContractTypes();
  const files = controllerFiles();

  for (const handlerName of [
    'listPurchaseDraftLines',
    'listCustomerOrders',
    'recordPurchaseDraftLineArrival',
  ]) {
    const gaps = gapsInHandlerSet(
      withoutObservedPermission(files, handlerName),
      types,
    );

    assert.ok(
      gaps.some((gap) => gap.includes(handlerName)),
      `expected removing the declaration from ${handlerName} to be caught, got: ${JSON.stringify(gaps)}`,
    );
  }
});

// The rule's own exemption, asserted so it cannot quietly widen: a handler that already **requires**
// a `CUSTOMERS:*` Permission needs no observed declaration, because the identity is gated by the
// Permission that admits the request at all. `customers.controller.ts` states it in prose — "No read
// here declares an `@ObservedPermission`. Both already require `CUSTOMERS:WATCH`" — and this is that
// sentence made mechanical. Without the exemption the rule would demand a redundant declaration on
// every `customers` read; with it unchecked, a handler could satisfy the rule by requiring an
// unrelated Permission.
test('a handler requiring a CUSTOMERS:* Permission needs no observed declaration', () => {
  const { types } = identityBearingContractTypes();
  const customersController = [
    'apps/server/src/customers/rest/controllers/customers.controller.ts',
  ];

  assert.deepEqual(findObservedPermissionGaps(customersController, types), []);

  // …and the exemption is doing real work: those handlers genuinely carry no @ObservedPermission.
  const handlers = allHandlers(customersController);
  assert.ok(handlers.length > 0, 'expected customers handlers to parse');
  assert.ok(
    handlers.every(
      (handler) => !/@ObservedPermission/u.test(handler.decorators),
    ),
    'expected the customers controller to rely on its required Permission alone',
  );
});

test('a fabricated identity-bearing handler with neither declaration is caught', () => {
  const { types } = identityBearingContractTypes();

  const gaps = gapsInHandlerSet(
    [
      {
        file: 'fixture.controller.ts',
        methodName: 'leakCustomers',
        verb: 'Get',
        responseType: 'CustomerDetail',
        decorators: '@Get()\n@RequiredPermission(PermissionId.ITEMS_WATCH)',
      },
    ],
    types,
  );

  assert.equal(gaps.length, 1);
  assert.match(gaps[0], /leakCustomers/u);
});

// The parser's blind spot — a paginated wrapper, a union, or any return type shape past
// `Promise<Identifier>` / `Promise<Identifier[]>` — must not become the rule's blind spot too. A
// handler the parser cannot resolve is reported with its own message, never dropped from the join
// silently: whether it can carry customer identity is unknown, not "no" (sad.md §11).
test('a handler with an unresolved return type is reported rather than skipped', () => {
  const { types } = identityBearingContractTypes();

  const gaps = gapsInHandlerSet(
    [
      {
        file: 'fixture.controller.ts',
        methodName: 'readPaginatedCustomers',
        verb: 'Get',
        responseType: null,
        decorators: '@Get()',
      },
    ],
    types,
  );

  assert.equal(gaps.length, 1);
  assert.match(gaps[0], /readPaginatedCustomers/u);
  assert.match(gaps[0], /return type could not be resolved/u);
});

// The current verdict, pinned so a future change to the parser or the controller tree cannot
// silently widen or narrow what "unresolved" means without this failing: every handler this
// feature's controllers declare parses to a resolvable return type today.
test('every handler in the real controller tree resolves to a return type', () => {
  const handlers = allHandlers(controllerFiles());

  assert.equal(handlers.length, 76, `expected 76 parsed handlers, got ${handlers.length}`);
  assert.equal(
    handlers.filter((handler) => handler.responseType === null).length,
    0,
    'expected no handler with an unresolved return type',
  );
});

// ---------------------------------------------------------------------------------------------
// Every new handler is classified per sad.md §8
// ---------------------------------------------------------------------------------------------

// `tests/access/authorization-coverage.spec.mjs` already drives `classifyControllers` over every
// controller in the repository, so this feature's handlers are classified by construction. It is
// asserted again here rather than assumed: that suite belongs to the `access` feature's release
// gates, and this feature's Definition of Done names the classification as its own evidence. The
// two run the same primitive over the same set, so they cannot disagree.
test("every handler this feature adds classifies under sad.md §8's classes", () => {
  const files = controllerFiles();
  const { violations } = classifyControllers(files, {
    selfProjectionReads: new Set([
      'apps/server/src/access/rest/controllers/access.controller.ts::readCurrent',
      'apps/server/src/workspaces/rest/controllers/workspace.controller.ts::readContext',
    ]),
    infrastructureExempt: new Map([
      [
        'apps/server/src/workspaces/rest/controllers/workspace.controller.ts::setActiveWarehouse',
        'sad.md §8 class 4 — session-only Warehouse selection.',
      ],
    ]),
    admittedArchivedTolerantMutations: new Map([
      [
        'apps/server/src/access/rest/controllers/access.controller.ts::transferManager',
        'ADR 0003 — membership-edge mutation.',
      ],
    ]),
  });

  assert.deepEqual(violations, []);
});

// ---------------------------------------------------------------------------------------------
// Companion checks (sad.md §10)
// ---------------------------------------------------------------------------------------------

// The module list every companion rule below is quantified over is read from disk. The three
// hand-written lists this repository already carries have all rotted — none names `purchase-drafts`
// — so the derived list is asserted to contain the modules those lists forgot.
test('the governed module list is derived from the tree, not remembered', () => {
  const modules = featureModules();

  assert.ok(modules.includes('purchase-drafts'));
  assert.ok(modules.includes('customers'));
  assert.ok(modules.includes('customer-orders'));
  assert.ok(!modules.includes('shared'), 'shared/ is not a module');
  assert.ok(!modules.includes('test'), 'test/ is support, not a module');
});

// Each companion rule below scans a glob whose corpus is asserted non-empty here, once, before the
// rule itself is asserted to report nothing — the same discipline the controller-scan test above
// applies at line 56. Without it, a rule that scans zero files reports `[]` for the wrong reason,
// and `customers/domain/` or `customers/` disappearing under a rename would make its rule pass
// vacuously forever rather than fail loudly.
test('controllers call use cases only', () => {
  assert.ok(
    productionSourceCount(CONTROLLER_LAYER_GLOB) > 0,
    'expected controller files to scan',
  );
  assert.deepEqual(findControllerLayerViolations(), []);
});

test('no module imports another module domain/errors/, predicates or DTOs', () => {
  assert.ok(
    productionSourceCount(MODULE_PRIVATE_GLOB) > 0,
    'expected production files to scan',
  );
  assert.deepEqual(findModulePrivateImports(), []);
});

test('shared repositories import no feature module', () => {
  assert.ok(
    productionSourceCount(REPOSITORY_FEATURE_GLOB) > 0,
    'expected shared repository files to scan',
  );
  assert.deepEqual(findRepositoryFeatureImports(), []);
});

test('customers domain code imports no framework', () => {
  assert.ok(
    productionSourceCount(CUSTOMERS_DOMAIN_FRAMEWORK_GLOB) > 0,
    'expected customers/domain/ files to scan',
  );
  assert.deepEqual(findCustomersDomainFrameworkImports(), []);
});

test('customers does not import purchase-drafts', () => {
  assert.ok(
    productionSourceCount(CUSTOMERS_IMPORTING_PURCHASE_DRAFTS_GLOB) > 0,
    'expected customers/ files to scan',
  );
  assert.deepEqual(findCustomersImportingPurchaseDrafts(), []);
});

// ---------------------------------------------------------------------------------------------
// The companion rules can fail
//
// Each drives the *same* function the repository-wide test above drives, over an injected fixture
// source, so none of them can silently become a check that matches nothing. Inline fixture sources
// rather than fixture files, for the reason `access/module-boundaries.spec.ts` records: a file under
// `apps/server/src` is compiled and linted, so a fixture there would make the deliberate violation a
// real one in the shipped tree.
// ---------------------------------------------------------------------------------------------

const fixture = (file, source) => [{ file, source }];

test('rejects a controller reaching into persistence', () => {
  assert.equal(
    findControllerLayerViolations(
      fixture(
        'apps/server/src/items/rest/controllers/a.controller.ts',
        "import { ItemRepository } from 'shared/domain/repositories/item.repository';",
      ),
    ).length,
    1,
  );
});

// R18 — the same reach, spelled relatively. The rule anchored on `^` alone, so a controller that
// walked up to persistence instead of using the alias was reported by nothing. The sibling
// module-domain rule already asserted both spellings; this one did not, which is why the hole was
// invisible from the spec.
test('rejects a controller reaching into persistence through a relative specifier', () => {
  assert.equal(
    findControllerLayerViolations(
      fixture(
        'apps/server/src/items/rest/controllers/a.controller.ts',
        "import { ItemRepository } from '../../../shared/domain/repositories/item.repository';",
      ),
    ).length,
    1,
  );
});

test('rejects a controller reaching a persistence entity relatively', () => {
  assert.equal(
    findControllerLayerViolations(
      fixture(
        'apps/server/src/items/rest/controllers/a.controller.ts',
        "import { ItemEntity } from '../../../shared/domain/entities/item.entity';",
      ),
    ).length,
    1,
  );
});

test('rejects a controller importing a TypeORM subpath', () => {
  assert.equal(
    findControllerLayerViolations(
      fixture(
        'apps/server/src/items/rest/controllers/a.controller.ts',
        "import { Repository } from 'typeorm/repository/Repository';",
      ),
    ).length,
    1,
  );
});

test('rejects a controller calling into domain code', () => {
  assert.equal(
    findControllerLayerViolations(
      fixture(
        'apps/server/src/items/rest/controllers/a.controller.ts',
        "import { toEntry } from 'items/domain/mappers/x.mapper';",
      ),
    ).length,
    1,
  );
});

// A type-only import is erased at compile time: it creates no runtime edge and makes no call, so it
// is not a controller "accessing persistence" or "containing business logic". The repository already
// draws this distinction — `customers/module-boundaries.spec.ts` records that a domain mapper may
// name a shared TypeORM entity *by type*. `items.controller.ts` does exactly this today.
test('admits a controller naming a domain shape by type alone', () => {
  assert.deepEqual(
    findControllerLayerViolations(
      fixture(
        'apps/server/src/items/rest/controllers/a.controller.ts',
        "import type { ItemCatalogueEntryRead } from 'items/domain/mappers/x.mapper';",
      ),
    ),
    [],
  );
});

test('rejects a sibling error-factory, predicate and DTO import', () => {
  for (const specifier of [
    'customers/domain/errors/customer.errors',
    'purchase-drafts/domain/predicates/purchase-draft-delivery.predicates',
    'customers/rest/dtos/customer-mutation.dto',
  ]) {
    assert.equal(
      findModulePrivateImports(
        fixture(
          'apps/server/src/items/usecases/queries/a.query.ts',
          `import { X } from '${specifier}';`,
        ),
      ).length,
      1,
      `expected ${specifier} to be refused across a module boundary`,
    );
  }
});

test('admits a module reaching its own error factories', () => {
  assert.deepEqual(
    findModulePrivateImports(
      fixture(
        'apps/server/src/customers/usecases/commands/a.command.ts',
        "import { e } from 'customers/domain/errors/customer.errors';",
      ),
    ),
    [],
  );
});

test('rejects a shared repository importing a feature module', () => {
  assert.equal(
    findRepositoryFeatureImports(
      fixture(
        'apps/server/src/shared/domain/repositories/a.repository.ts',
        "import { X } from 'purchase-drafts/domain/value-objects/delivery-mode';",
      ),
    ).length,
    1,
  );
});

// The published-package carve-out, without which the segment rule forbids every module the contract
// it is required to implement.
test('admits a shared repository importing a published contracts subpath', () => {
  assert.deepEqual(
    findRepositoryFeatureImports(
      fixture(
        'apps/server/src/shared/domain/repositories/a.repository.ts',
        "import type { Customer } from '@warehouser/contracts/customers';",
      ),
    ),
    [],
  );
});

test('rejects customers domain code importing a framework symbol', () => {
  assert.equal(
    findCustomersDomainFrameworkImports(
      fixture(
        'apps/server/src/customers/domain/value-objects/a.ts',
        "import { Column } from 'typeorm';",
      ),
    ).length,
    1,
  );
});

// The one documented exception: a domain service is registered as a Nest provider, so it carries
// `@Injectable()`. TypeORM and HTTP transports stay forbidden even there.
test('admits the DI marker inside customers/domain/services/', () => {
  assert.deepEqual(
    findCustomersDomainFrameworkImports(
      fixture(
        'apps/server/src/customers/domain/services/a.service.ts',
        "import { Injectable } from '@nestjs/common';",
      ),
    ),
    [],
  );
});

test('rejects customers importing purchase-drafts, in either spelling', () => {
  for (const specifier of [
    'purchase-drafts/domain/value-objects/delivery-mode',
    '../../purchase-drafts/domain/value-objects/delivery-mode',
  ]) {
    assert.equal(
      findCustomersImportingPurchaseDrafts(
        fixture(
          'apps/server/src/customers/usecases/commands/a.command.ts',
          `import { DeliveryMode } from '${specifier}';`,
        ),
      ).length,
      1,
      `expected ${specifier} to be refused`,
    );
  }
});

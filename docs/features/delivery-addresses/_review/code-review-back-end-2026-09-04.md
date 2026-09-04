# Backend conformance review — delivery-addresses (2026-09-04)

- **Work item:** `docs/features/delivery-addresses` (feature; `.size` = L, `.route` = full)
- **Skill:** `code-review-back-end`
- **Verdict:** `CHANGES REQUESTED`
- **Companion:** [`code-review-front-end-2026-09-04.md`](./code-review-front-end-2026-09-04.md) and
  [`code-review-front-end-2026-09-04-run2.md`](./code-review-front-end-2026-09-04-run2.md) own the
  `apps/web` side of the same branch. This record owns `apps/server` and the server-side declaration
  of `packages/contracts`.

## Diff scope

```
git diff a87f190e6c884ba671156bee673830e1cb0ea67a..HEAD -- apps/server packages/contracts
198 files changed, 26475 insertions(+), 1849 deletions(-)
```

Branch `11-locations`, 34 commits from the branch point `a87f190`. The same range also changes 169
files under `apps/web`, which is out of scope here and belongs to `code-review-front-end`.

`packages/contracts` is in scope only for how `apps/server` declares each schema and adapts it in
`rest/dtos/`; the web consumption of the same files is the front-end skill's.

## Document manifest

`docs/system/server-index.md` was read in full this run, and every document below was read in full
before dispatch.

**Floor**

- `docs/system/server-architecture.md`
- `docs/system/architecture-map.md`
- `docs/system/sad.md`
- `docs/system/adr/18-08-2026-scope-of-exercise-placement-tiebreak.md` (Accepted)
- `docs/system/adr/21-07-2026-postgresql-with-typeorm.md` (Accepted)
- `docs/system/adr/24-07-2026-server-error-handling.md` (Accepted)
- `docs/system/adr/27-07-2026-structured-logging-with-pino.md` (Accepted)
- `docs/system/adr/03-08-2026-structured-logging-instead-of-telemetry.md` (Accepted)
- `docs/system/adr/12-07-2026-schema-validation-with-zod.md` (Accepted)
- `docs/system/adr/14-08-2026-domain-owned-flat-modules.md` (**Superseded** — read for reasoning only)

**Selected by changed path**

- `docs/system/guides/adding-a-server-module.md` — new `customers` module, moved use cases, barrels
- `docs/system/guides/creating-a-server-repository.md` — three new repositories, seven changed
- `docs/system/guides/server-request-authorization.md` — new guarded handlers, `@ObservedPermission`
- `docs/system/guides/server-error-handling.md` — new error factories, predicates, the global filter
- `docs/system/guides/server-use-case-boundaries.md` — 15 new commands and queries
- `docs/system/guides/adding-and-using-contracts.md` — new `customers` contracts subpath, four DTOs

**Read for context, never as the rule:** `docs/features/delivery-addresses/sad.md` §5–§6,
`data-model.md` and `migrations/`, `contracts/openapi.yaml`, `spec.md` §8, and the Accepted feature
ADRs `0001-observed-permission-redaction.md` and `0002-per-line-purchase-draft-endings.md`.

**Selector check.** `docs/system/adr/19-08-2026-declarative-permission-gates.md` is absent from
`server-index.md`. That is correct rather than a gap — the ADR governs `apps/web` gate components and
is listed in `web-index.md:118`. No disagreement between the index and
`references/server-manifest.md` was found this run.

## Method

Five clean-context `reviewer` workers, pinned to the reasoning tier at effort `xhigh` (`.size` = L),
one per dimension group in `references/server-review-dimensions.md`. Each re-read the manifest itself
rather than taking a summary. Every finding below was then re-verified against the code by the
coordinating pass before it was carried forward; two reviewer claims were strengthened by that check
(see findings 1 and C1) and none was dropped.

## Findings

### Blocking

1. **[blocking] `customers` ships without a module barrel, so it has no declared public surface** —
   `apps/server/src/customers/` has `customers.module.ts` and no `index.ts`, and
   `apps/server/src/app.module.ts`:8 reads `from 'customers/customers.module'`; rule:
   `docs/system/server-architecture.md` §"Source structure" (the `<module-name>/` tree ends in
   `└── index.ts`) and §"NestJS modules and exports" ("Its public barrel exports only modules that
   exist and are required by a runtime"), upheld by
   `docs/system/adr/18-08-2026-scope-of-exercise-placement-tiebreak.md` §Decision ("reaches other
   modules only through their declared public surface"); problem: every sibling with a barrel is
   imported by name — `'customer-orders'`, `'items'`, `'purchase-drafts'`, `'warehouses'`,
   `'workspaces'`, `'access'` — and `customer-orders/index.ts` is a single line; `customers` is the
   only module of this change whose public API is stated nowhere; suggested: add
   `apps/server/src/customers/index.ts` exporting `CustomersModule` and import it as `from 'customers'`.

2. **[blocking] `CustomerAddressBookService.resolveDeliveryAddress` has exactly one production
   caller, which discards its result** — `apps/server/src/customers/domain/services/customer-address-book.service.ts`:236;
   sole caller `apps/server/src/customers/usecases/commands/set-main-customer-delivery-address.command.ts`:54;
   rule: `docs/system/server-architecture.md` §Services ("every method has more than one caller. A
   method called by one command belongs in that command") and §"Use cases" ("a service method that
   exactly one command calls" is a tell of a pass-through); problem: the method lists the address book
   and asserts one address is the Customer's and active, and its caller awaits it purely for the
   assertion, so the indirection carries no shared rule; suggested: inline it into the command, which
   already injects `CustomerAddressBookRepository` and can call the already module-level
   `assertDeliveryAddressUsable`.

3. **[blocking] `CustomerAddressBookService.deactivateDeliveryAddress` has exactly one production
   caller and owns that command's operation** — `apps/server/src/customers/domain/services/customer-address-book.service.ts`:264;
   sole caller `apps/server/src/customers/usecases/commands/deactivate-customer-delivery-address.command.ts`:53;
   rule: `docs/system/server-architecture.md` §Services worked example ("the commands still own their
   operations. The service holds no `addLine`, no write, and no input type; it answers questions, and
   the command decides what to do with the answers") and `docs/system/guides/adding-a-server-module.md`
   §"Common failures"; problem: the method takes the lock, decides AC-07 and AC-06b and performs both
   writes (:282, :294), leaving the command a resolve and one assertion; neither extraction trigger
   holds — no second use case calls it, and the command's `execute` is 30 lines; suggested: move the
   lock, the assertions, the `nextMainDeliveryAddress` choice and both writes into the command, keeping
   the module-level helpers where they are.

4. **[blocking] `PurchaseDraftLineEndingService` is a stateless helper made into an injectable class**
   — `apps/server/src/purchase-drafts/domain/services/purchase-draft-line-ending.service.ts`:31-36;
   rule: `docs/system/server-architecture.md` §Services ("Keep a shared helper as a plain exported
   function only when it needs no collaborator at all — a pure predicate, an assertion over a value,
   or a mapping") and the worked example's fourth property ("stateless helpers stay module-level …
   putting them on the class would force commands that need only them to take the whole service");
   problem: the class has no constructor and no collaborator and its one method is an assertion over
   values the caller already read, yet both commands must inject the whole service to reach it; the
   sibling `purchase-draft-assembly.service.ts`:35 already does this correctly with `assertApplied`.
   The file's comment defends the two-caller count, which is not in dispute — the class-versus-function
   shape is; suggested: export `assertAdmitsEnding` as a module-level function, drop `@Injectable` and
   the provider registration, and import the function in both commands.

5. **[blocking] the new direct-delivery ending handler has none of the three required authorization
   assertions** — `apps/server/src/purchase-drafts/rest/controllers/purchase-drafts.controller.ts`:464;
   rule: `docs/system/guides/server-request-authorization.md` §"Verify" ("For a new protected handler,
   assert at least: the denial when the required Permission is absent, the denial over an archived
   Warehouse unless the handler declares read tolerance, and — for a handler declaring an observed
   Permission — the response on both sides of that Permission"); problem: a repo-wide grep for
   `direct-delivery` returns only the controller declaration and the metadata spec
   (`purchase-drafts.controller.spec.ts`:90), so no test drives the route without
   `PURCHASE_DRAFTS:RECEIVE`, none drives it over an archived Warehouse, and none exercises the
   `@ObservedPermission(CUSTOMERS_WATCH)` it declares on both sides. The handler is a mutation and
   declares no `@ArchivedTolerantRead()`, so all three assertions are required. Its twin `/arrival`,
   under the identical Permission and guard chain, has all of them; suggested: extend the existing
   `/arrival` cases in `purchase-drafts-http-contract.integration.spec.ts` to cover direct-delivery as
   a second `it.each` row, so the two endings ADR 0002 deliberately split are proven at the guard the
   same way.

### Advisory

6. **[advisory] the `warehouses` boundary spec was updated for this feature but its module list still
   predates the new module** — `apps/server/src/warehouses/module-boundaries.spec.ts`:34 (list)
   against :51-54 (entries this change added); rule:
   `docs/system/guides/adding-a-server-module.md` §8 and `docs/system/server-architecture.md`
   §"Dependency direction"; problem: `FEATURE_MODULES = ['access', 'auth', 'users', 'warehouses',
'workspaces']` is the sole input to `foreignModuleTarget`, so an import of `customers/domain/errors/…`
   from the two new Warehouse delivery-address files returns `undefined` and passes; the spec's own
   comment at :30-33 claims the list _is_ "exactly the directories directly under `src/`", which it is
   not — `customers`, `customer-orders`, `items` and `purchase-drafts` are all absent; suggested:
   derive the list with `readdirSync(sourceRoot)` minus `shared`/`test`.

7. **[advisory] the shared-repository boundary list was edited for this feature and still omits
   `purchase-drafts`** — `apps/server/src/shared/domain/repositories/repository-boundaries.spec.ts`:40-49
   (`customers` added at :44); rule: `docs/system/server-architecture.md` §"Dependency direction"
   ("shared repositories never depend on dedicated feature modules") and
   `docs/system/guides/creating-a-server-repository.md` §"Keep repositories isolated and
   operation-oriented"; problem: this change added three repositories and modified three more under the
   scan, but the hand-enumerated list still names 8 of the 9 modules, so a shared repository importing
   `purchase-drafts/…` would pass silently; suggested: enumerate from the filesystem, or add
   `'purchase-drafts'` while the list is already being edited.

8. **[advisory] the new `customers` boundary spec enforces the import boundary against one sibling
   only** — `apps/server/src/customers/module-boundaries.spec.ts`:23 and :157-163; rule:
   `docs/system/guides/adding-a-server-module.md` §8; problem: `FORBIDDEN_SIBLING = 'purchase-drafts'`
   makes the scan a single-sibling check, so `customers` importing `customer-orders/domain/errors/` or
   `warehouses/rest/dtos/` would not fail — and `customers` is precisely the module that projects
   Customer Orders (`customers/domain/mappers/customer-awaiting-order.mapper.ts`:2); the sibling
   `warehouses/module-boundaries.spec.ts` already implements the general form; suggested: replace the
   single-sibling regex with the general foreign-module / module-private scan. No violation exists
   today — the module's only foreign production import is `auth/auth.module`.

9. **[advisory] a new spec file under `shared/domain/repositories/` imports a feature module's query**
   — `apps/server/src/shared/domain/repositories/purchase-draft-address-drift-read.repository.integration.spec.ts`:14,
   used at :621; rule: `docs/system/guides/creating-a-server-repository.md` §"Keep repositories
   isolated and operation-oriented" ("Code under `apps/server/src/shared/domain/repositories/` must not
   import from or otherwise know about a dedicated feature module"); problem: the file constructs
   `ReadPurchaseDraftQuery` to assert the repository's list flag agrees with the query's derived drift
   signals, putting a feature-module dependency inside the shared persistence directory the rule names;
   the production repositories themselves are clean; suggested: move that assertion beside the query it
   exercises (`server-architecture.md` §Testing: colocate with the code covered).

10. **[advisory] the "Via Warehouse clears the address" rule is decided in the controller as well as
    in the command** — `apps/server/src/purchase-drafts/rest/controllers/purchase-drafts.controller.ts`:87-89;
    rule: `docs/system/guides/adding-a-server-module.md` §4 ("do not repeat that rule in a controller,
    handler, or use case") and §"Common failures" ("Putting business logic in a REST controller");
    problem: `toReviseLineInput` normalizes `customerDeliveryAddressId` to `null` for `via_warehouse`,
    which `statedDestination` in `revise-purchase-draft-line.command.ts`:50-56 already decides inside
    the command's boundary; suggested: keep the controller mapping purely structural and leave the
    clearing rule to `statedDestination`.

11. **[advisory] three feature repositories are registered in the `@Global` `DomainModule` as well as
    in every feature module that injects them** — `apps/server/src/shared/domain/domain.module.ts`:81-83;
    rule: `docs/system/server-architecture.md` §"NestJS modules and exports" ("Plain entities,
    repositories, schemas, and TypeScript types are shared through imports and do not need Nest
    registration. Global providers must not become a service locator or a way to hide feature
    dependencies."); problem: `CustomerAddressBookRepository`, `CustomerAwaitingDemandRepository` and
    `CustomerDirectoryRepository` are in the global list _and_ declared as providers in
    `customers/usecases/usecase.module.ts`:57-59, `customer-orders/usecases/usecase.module.ts`:64-65 and
    `purchase-drafts/usecases/usecase.module.ts`:59, so the global instances are never resolved. The
    `customers` module's own comment states the opposite of what the code does — "The three repositories
    are local providers rather than reached from the `@Global()` `DomainModule`" — and every
    `ordering`-era repository is deliberately absent from that list; suggested: drop the three additions
    from `domainRepositories`.

12. **[advisory] two non-boolean selectors are exported from a `*.predicates.ts` file** —
    `apps/server/src/customers/domain/predicates/customer.predicates.ts`:46 (`customerHoldingName`,
    returns `CustomerNameHolder | null`) and :94 (`remainingActiveDeliveryAddresses`, returns an array);
    rule: `docs/system/guides/server-error-handling.md` §1 "Define conditions as predicates" ("Return
    `boolean` or a TypeScript type predicate"); problem: both are pure lookups rather than conditions,
    and every pre-existing predicate module in the tree exports only boolean-returning functions;
    suggested: move the two selectors beside their only consumer,
    `customers/domain/services/customer-address-book.service.ts`, where `nextMainDeliveryAddress` — the
    same kind of selector — already lives.

13. **[advisory] `isCustomerNameAvailable` is an exported predicate with no production consumer** —
    `apps/server/src/customers/domain/predicates/customer.predicates.ts`:56; rule:
    `docs/system/guides/server-error-handling.md` §1 ("Do not promote a predicate for hypothetical
    reuse"); problem: its only references outside its own definition are in the colocated spec; the
    production path uses `customerHoldingName` directly via `assertCustomerNameAvailable`, so the
    boolean form states a rule nothing enforces. Contrast `hasExactlyOneMainActiveDeliveryAddress`
    (:84), which also has no production caller but _is_ the at-rest invariant asserted by
    `delivery-address-book.spec.ts` — the §2 "useful for checks that do not throw" case, and fine;
    suggested: delete it, or route `assertCustomerNameAvailable` through it.

14. **[advisory] the new redirection handler is not asserted over an archived Warehouse** —
    `apps/server/src/customer-orders/rest/controllers/customer-orders.controller.ts`:185-191; rule:
    `docs/system/guides/server-request-authorization.md` §"Verify" (second required assertion); problem:
    `PUT :customerOrderId/delivery-address` is a mutation declaring no `@ArchivedTolerantRead()`, and
    `customer-orders-http-contract.integration.spec.ts`:1226 asserts only the missing-Permission denial,
    while the three sibling mutations on the same controller each get an explicit archived case
    (:1006, :1375, :1486); suggested: add the `access.warehouse_archived` case beside them.

## Resolutions

| #   | Finding                                          | Resolution                                                                                                                                                                        |
| --- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `customers` module barrel                        | **Fix now** — add `customers/index.ts`, import `from 'customers'`. `auth/` and `users/` deliberately left alone; widening was offered and declined as out of scope for this diff. |
| 2   | `resolveDeliveryAddress` single caller           | **Fix now** — inline into `SetMainCustomerDeliveryAddressCommand`.                                                                                                                |
| 3   | `deactivateDeliveryAddress` single caller        | **Fix now** — move lock, assertions and both writes into `DeactivateCustomerDeliveryAddressCommand`.                                                                              |
| 4   | `PurchaseDraftLineEndingService` shape           | **Fix now** — demote to a module-level `assertAdmitsEnding` function; drop `@Injectable` and its provider registration.                                                           |
| 5   | direct-delivery authorization assertions         | **Fix now** — extend the `/arrival` cases to cover direct-delivery, closing all three required assertions.                                                                        |
| 6   | `warehouses` boundary module list                | **Fix now** — derive the list from the filesystem.                                                                                                                                |
| 7   | `repository-boundaries` omits `purchase-drafts`  | **Fix now** — derive the list from the filesystem.                                                                                                                                |
| 8   | `customers` boundary single-sibling scan         | **Fix now** — adopt the general foreign-module scan.                                                                                                                              |
| 9   | repository spec imports a feature query          | **Fix now** — relocate the assertion beside the query.                                                                                                                            |
| 10  | Via-Warehouse rule in the controller             | **Fix now** — keep the controller mapping structural.                                                                                                                             |
| 11  | duplicate global + local repository registration | **Fix now** — drop the three from `domainRepositories`.                                                                                                                           |
| 12  | non-boolean selectors in `*.predicates.ts`       | **Fix now** — move both beside their consumer.                                                                                                                                    |
| 13  | `isCustomerNameAvailable` unused                 | **Fix now** — delete it or route the assertion through it.                                                                                                                        |
| 14  | redirect handler archived case                   | **Fix now** — add the `access.warehouse_archived` case.                                                                                                                           |
| B4  | ending result types owned by a sibling command   | **Defer** — recorded in `spec.md` §8.                                                                                                                                             |
| C2  | 1+N update loop in the freeze                    | **Defer** — recorded in `spec.md` §8.                                                                                                                                             |

No blocking finding was closed by dismissal, and no finding was dropped for lack of a citation.

## Observations — pre-existing, outside this diff

Reported for context only. Shared protocol §7: untouched pre-existing violations are observations,
not findings of this review.

- **A forbidden timing wrapper exists and is dead code.** `apps/server/src/shared/logger/with-operation-timing.ts`
  is exactly the shape `docs/system/guides/server-use-case-boundaries.md` §1 prohibits ("Do not add a
  `with*` helper around a use case") and §2 forbids measuring at all ("do not add a helper that exists
  to produce one"). This diff does not touch it, and it has **zero callers anywhere in
  `apps/server/src`** — so it is both a standing violation and removable at no cost. Worth its own
  cleanup change.
- **Predicate-placement drift between the guide and the tree.** `docs/system/guides/server-error-handling.md`:33
  places a single-feature predicate at `apps/server/src/<module-name>/predicates/`, while the tree
  uniformly uses `<module-name>/domain/predicates/` (pre-existing in `customer-orders`, `access` and
  `items`; followed by this change in `customers` and `purchase-drafts`). `server-architecture.md`'s
  `<module-name>/domain/` tree lists no `predicates/` directory at all. The new files follow the
  established tree; the guide and the architecture tree are what need reconciling, via `/system-docs`.
- **`auth/` and `users/` also have no barrel**, and are imported as `'auth/auth.module'` /
  `'users/users.module'` at `app.module.ts`:6,16. Every module's `rest.module.ts`, including the new
  `customers/rest/rest.module.ts`:2, reaches `auth/auth.module` because `auth` exposes no barrel.
- **`access/module-boundaries.spec.ts`:48 carries the same 5-of-9 `FEATURE_MODULES` list** as
  `warehouses`, and is untouched by this change.

## What came back clean

Verified against a named rule, not assumed:

- **Module ownership.** `customers` is correctly a new top-level owner rather than a sub-tree of
  `customer-orders` — Customer holds its own name, active-state and address-book invariants. Customer
  Delivery Address is a grouping inside its owner, not a second module identity. The Warehouse's own
  Delivery Address stayed in `warehouses/usecases/` where the Warehouse record's invariants live, and
  no scope-split "delivery-addresses" module was created. No module nests; no empty `domain/`,
  `usecases/`, `rest/` or `handlers/` structure was added.
- **Module-private internals.** No production file imports another module's `domain/errors/`,
  `domain/*.predicates.ts`, `domain/value-objects/`, `domain/mappers/` or `rest/dtos/`. The only
  production cross-module edge is `purchase-drafts → customer-orders`' exported `DemandAllocationService`,
  wired through `CustomerOrdersUsecaseModule` — which `server-architecture.md` §Services sanctions by name.
- **Layers.** No changed use case imports `typeorm` or a `shared/domain/entities/*` module; no changed
  controller or `rest/*-response.ts` injects a repository or domain service; no service invokes a
  command, query or event use case; no new use case injects `AccessCurrentUserRepository`; no `with*`
  wrapper, interceptor, base-class template or private-delegate `execute`; every constructor parameter
  of each new command and query is used by its body; no service declares `@Transactional()`.
- **No measurement.** `purchase-drafts/usecases/queries/drift-signals.ts` is a business projection —
  value comparisons between snapshot and current — not a metric. The diff adds no timing, duration,
  counter, span or exporter, and no `console.*` anywhere in production code.
- **Persistence.** All new entities and repositories sit in `shared/domain/{entities,repositories}`
  with no repository port, `BaseRepository` or feature-owned adapter. Zero `private`/`protected`
  methods in any repository in the diff. No repository imports a feature module or carries a feature
  type in a public signature. No domain↔persistence mapping inside a repository. `@Transactional()`
  on every new command and on no service or repository; no `QueryRunner`, `createQueryRunner` or
  `DataSource.transaction(...)`. No `try`/`catch`, log or error translation in any repository. No
  TypeORM API outside `shared/domain/{repositories,entities}`. `synchronize: false` unchanged.
- **Migrations.** All three are timestamped classes under `apps/server/migrations/` whose `down()`
  genuinely reverses `up()` — including the two data repairs that keep the restored
  `chk_purchase_drafts_closure_path` satisfiable and the `customer_name` backfill before `SET NOT NULL`
  — and they match the staged copies under `docs/features/delivery-addresses/migrations/`.
- **Errors.** No production `try`/`catch`/`.catch(` anywhere in the diff — every hit is in a spec. One
  global filter only; its +84 lines are 11 entries in the existing explicit map, matching the 11 new
  codes. No error is remapped, no anonymous factory reaches `assert`, every new factory is
  `*Error`-suffixed in `<module>/domain/errors/`. Error details leak nothing — the non-enumerating
  refusals carry no details at all, and no factory echoes address text, access notes or a customer name.
- **Contracts.** Zod is the only validation technology; no `class-validator`/`class-transformer`. All
  four changed DTO files are exactly `export class X extends createZodDto(Schema) {}` and redefine
  nothing. The three `rest/*-response.ts` files are contract-typed mappers converting `Date` to ISO
  string, not server-local re-declarations. The `./customers` subpath is present at
  `packages/contracts/package.json`:24-27 and every server import uses a subpath.
- **Authorization.** Every new handler composes `SessionAuthGuard` + the correct level guard with
  exactly one required Permission. Both new Warehouse delivery-address routes are authorized at the
  **Workspace** level with `@RequiredWorkspacePermission(WAREHOUSES_ADDRESS_UPDATE)`, exactly as
  `server-request-authorization.md`'s own worked example prescribes and as `spec.md` §8 records; the
  archived-Warehouse write is proven to still succeed. No `@RequiredPermission` carries two identifiers.
- **Observed Permissions.** `warehouse-access.guard.ts`:51-89 reads the observed metadata into a local,
  passes it into the one existing grant read, attaches only the granted subset frozen with the rest, and
  **no branch tests the set** — admission is decided solely by `request.user`, the required Permission,
  the named Warehouse, `granted` and the archived check. `access-current-user.repository.ts`:56-73 widens
  an `IN` list rather than adding a read, so the query count is unchanged. The set never reaches the
  browser: `read-current-access.query.spec.ts`:80 still asserts
  `not.toHaveProperty('observedPermissionIds')`. Redaction is by not selecting — all four consuming
  queries branch to a separate repository read, each with both-sides tests plus HTTP-level proof.
- **Async work.** No `handlers/` directory anywhere, no BullMQ or Redis import, no cron or interval —
  the not-yet-installed queue infrastructure is correctly not anticipated.
- **Testing.** Every DB-touching new spec carries the `*.integration.spec.ts` suffix; the one unit-tier
  spec importing `DataSource` supplies a double. No new integration spec opens a second `QueryRunner`,
  polls `pg_stat_activity`, races two writers, or asserts latency or throughput —
  `customer-address-book.repository.integration.spec.ts`:169-173 explicitly records why the lock proof
  is asserted by statement shape instead, which is exactly what `server-architecture.md` §"What this
  tier cannot test" requires.

## Next

`CHANGES REQUESTED` → `/implement delivery-addresses` for findings 1–14 (no `/clear` — stay in
context), then re-run `/code-review-back-end delivery-addresses` over the changed surface.

After it passes, `/review delivery-addresses` runs the independent acceptance-criteria pass. The
front-end review has already run twice on this branch; re-run `/code-review-front-end delivery-addresses`
only if these fixes move `apps/web` or the web side of `packages/contracts`.

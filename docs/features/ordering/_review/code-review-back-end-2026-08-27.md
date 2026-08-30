# Back-end conformance review — ordering

- **Work item:** feature `ordering` (`docs/features/ordering`), `.size` XL, `.route` full
- **Branch:** `22-ordering`; base (branch point) `9bc822b`
- **Date:** 2026-08-27
- **Reviewer:** `reviewer` worker, clean context, `reasoning` tier at effort `xhigh`, fanned out
  across three dimension groups (A+B / C+testing / D+logging-async) and merged
- **Verdict:** `CHANGES REQUESTED`

## Diff scope

```sh
git diff 9bc822b043200c17566cc9f501e6674e50561f61..HEAD -- apps/server packages/contracts
```

182 files changed, 27 094 insertions, 2 deletions (175 added, 7 modified). 169 files under
`apps/server/`, 13 under `packages/contracts/`.

Three new server modules — `items/`, `customer-orders/`, `purchase-drafts/` — with their domain
predicates, errors, mappers and services, use cases, REST controllers and DTOs; nine ordering
persistence entities and ten specialized repositories under `shared/domain/`; the
`WriteRateLimitGuard` set under `shared/guards/`; two migrations; and modifications to
`app.module.ts`, `shared/domain/domain.module.ts`, `shared/domain/repositories/repository-boundaries.spec.ts`,
`shared/errors/global-http-exception.filter.ts`, `src/test/restore-catalogues.setup.ts` and
`packages/contracts/package.json`.

`packages/contracts` was judged **only** for how `apps/server` declares the schema and adapts it in
`rest/dtos/`; the web consumption of those files belongs to `/code-review-front-end`. `apps/web`
changed in the same branch and is **not** reviewed here.

## Document manifest

`docs/system/server-index.md` was read in full this run and is the authoritative selector. Every
document below was then read in full before dispatch.

Floor:

- `docs/system/server-architecture.md`
- `docs/system/architecture-map.md`
- `docs/system/sad.md`
- Accepted ADRs: `docs/system/adr/18-08-2026-scope-of-exercise-placement-tiebreak.md`,
  `docs/system/adr/21-07-2026-postgresql-with-typeorm.md`,
  `docs/system/adr/24-07-2026-server-error-handling.md`,
  `docs/system/adr/27-07-2026-structured-logging-with-pino.md`,
  `docs/system/adr/03-08-2026-structured-logging-instead-of-telemetry.md`,
  `docs/system/adr/12-07-2026-schema-validation-with-zod.md`

Selected by the changed paths:

- `docs/system/guides/adding-a-server-module.md`
- `docs/system/guides/creating-a-server-repository.md`
- `docs/system/guides/server-error-handling.md`
- `docs/system/guides/adding-and-using-contracts.md`
- `docs/system/adr/14-08-2026-domain-owned-flat-modules.md` — **Superseded**, read for its reasoning
  and applied as the live _server_ placement rule; see § Manifest note below.
- `AGENTS.md` (root) — the no-telemetry prohibition on coding agents.

Read for context, never as the rule: `docs/features/ordering/sad.md` §5–§6, `data-model.md` and
`docs/features/ordering/migrations/`, `contracts/openapi.yaml`, `_audit/data-model-2026-08-25.md`,
and the Accepted feature ADRs `0001-entity-owned-ordering-modules`,
`0002-arrival-confirmation-ownership`, `0003-per-member-write-rate-limit`.

### Manifest note — the selector map and the index disagree, and the index overreaches

`.claude/skills/code-review-back-end/references/server-manifest.md` cites ADR
`14-08-2026-domain-owned-flat-modules.md` as the placement rule for `apps/server`.
`docs/system/server-index.md` § Decisions marks that ADR **Superseded** and instructs "Cite this ADR
rather than its predecessor", pointing at `18-08-2026-scope-of-exercise-placement-tiebreak.md`.

The index overreaches. ADR 18-08 § Consequences states outright:

> The server side is **not** reconciled by this decision. `server-index.md` and
> [Adding a server module] still cite ADR 14-08 as the live placement decision. That is an accepted,
> recorded consequence until a later change request reconciles them, not an oversight.

So for `apps/server`, ADR 14-08's rules govern placement, reached through
`guides/adding-a-server-module.md`, and the selector map is right. This review was conducted on that
reading. The defect is in the index entry's blanket wording, which does not carry ADR 18-08's own
server carve-out. **Routed to `/system-docs`** to correct the `server-index.md` § Decisions entry.

## Findings

Nine blocking, twelve advisory. Where the fan-out reviewers rated the same defect differently, the
merged severity and the reason for it are stated.

### Blocking

- **[blocking] Composite `<Module>Module` aggregator breaks the two-runtime split** —
  `apps/server/src/items/index.ts`:1, `apps/server/src/customer-orders/index.ts`:1,
  `apps/server/src/purchase-drafts/index.ts`:1, with `items/items.module.ts`:7-11,
  `customer-orders/customer-orders.module.ts`:9-13, `purchase-drafts/purchase-drafts.module.ts`:7-11
  and `apps/server/src/app.module.ts`:29-34; rule: `docs/system/server-architecture.md`
  §"NestJS modules and exports" ("Its public barrel exports only modules that exist and are required
  by a runtime"), `docs/system/guides/adding-a-server-module.md` §5, §7 ("Import the feature REST
  module into `RestAppModule` only… Import the feature use-case module wherever its application API
  is required"); problem: each module adds an undocumented fourth NestJS module bundling
  `*UsecaseModule` + `*RestModule` behind one export, and it is the only thing the barrel exports, so
  `AppModule` can no longer import a feature's application API without also importing its HTTP
  controllers — the exact coupling §7 exists to prevent; `access/index.ts`, `warehouses/index.ts` and
  `workspaces/index.ts` each export both separately and `app.module.ts` imports only their
  `*RestModule`; suggested: delete the three aggregators, export `<X>UsecaseModule` and
  `<X>RestModule` from each `index.ts`, and import only the `*RestModule` in `app.module.ts`.
  _Severity adjudicated: one reviewer rated advisory on the strength of the `auth/auth.module.ts`
  precedent. Local precedent is not a rule (shared protocol §3), `auth`'s aggregate exists for a
  stated `@Global()` guard reason these modules do not have, and §7 is a runtime-boundary
  requirement._ **Verified against source during this review.**
  **Resolution: Fix now.**

- **[blocking] `purchase-drafts` reaches `customer-orders` past its declared public surface** —
  `apps/server/src/purchase-drafts/usecases/usecase.module.ts`:2
  (`from 'customer-orders/usecases/usecase.module'`) and
  `apps/server/src/purchase-drafts/domain/services/arrival-confirmation.service.ts`:3-4
  (`from 'customer-orders/domain/services/demand-allocation.service'`); rule:
  `docs/system/adr/14-08-2026-domain-owned-flat-modules.md` §Decision "Public surface" ("A module may
  import another module only through that module's declared public surface: … the module barrel and
  its exported NestJS modules on the server"), `docs/system/guides/adding-a-server-module.md` §8;
  problem: `customer-orders/index.ts` declares exactly one surface entry (`CustomerOrdersModule`), so
  neither `CustomerOrdersUsecaseModule` nor `DemandAllocationService`/`DemandAllocationLineInput` is
  on it — both edges are deep file-path imports into a sibling's internals, and the in-file comments
  defend the coupling without ever putting the symbol on the surface they claim to use; suggested:
  re-export `CustomerOrdersUsecaseModule` and `DemandAllocationService` (with its input type) from
  `customer-orders/index.ts` and import both from `'customer-orders'`, so the surface enumerates the
  one edge feature ADR 0002 sanctions. **Verified against source during this review.**
  **Resolution: Fix now.**

- **[blocking] Use cases depend on TypeORM persistence entities, and one leaks to the wire** —
  `apps/server/src/purchase-drafts/usecases/queries/list-packaging-types.query.ts`:2,13
  (`execute(): Promise<PackagingTypeEntity[]>`) and
  `apps/server/src/purchase-drafts/usecases/commands/create-purchase-draft.command.ts`:5,17
  (`Promise<PurchaseDraftEntity>`), consumed at
  `apps/server/src/purchase-drafts/rest/controllers/packaging-types.controller.ts`:29-31; rule:
  `docs/system/server-architecture.md` §"Use cases" ("They must not depend on REST DTO classes,
  controllers, BullMQ handler classes, TypeORM entities, QueryBuilder, or other TypeORM APIs"),
  `docs/system/guides/adding-a-server-module.md` §"Common failures" ("Exposing TypeORM entities
  outside persistence adapters"); problem: both use cases type their boundary in
  `shared/domain/entities/*.entity`, and `PackagingTypesController` maps a TypeORM entity array
  straight onto the wire, making the persistence model the application contract; suggested: declare
  persistence-oriented read/write shapes (as `purchase-draft-read.repository.ts` already does for
  `PurchaseDraftDetailRead`) or a `purchase-drafts/domain/mappers/` conversion, and return those.
  **Verified against source during this review.**
  **Resolution: Fix now.**

- **[blocking] `PurchaseDraftsController` fabricates domain state the use case never returned** —
  `apps/server/src/purchase-drafts/rest/controllers/purchase-drafts.controller.ts`:270-287; rule:
  `docs/system/server-architecture.md` §REST ("REST controllers translate HTTP input into use-case
  input and translate results into HTTP output… They contain no business rules"),
  `docs/system/guides/adding-a-server-module.md` §"Common failures" ("Putting business logic in a
  REST controller"); problem: `DiscardPurchaseDraftCommand` returns only
  `{id, state, discardedByUserId, discardedAt}`, so the handler invents the rest of the summary in
  transport — `createdByUserId: request.access!.userId` asserts the _acting_ member created the
  draft, `createdAt: discarded.discardedAt` restates the discard instant as the creation instant, and
  `expectedArrivalDate: null` / `lineCount: 0` / `hasDriftSignal: false` are asserted rather than
  read; suggested: have the command (or a summary read, as every other mutating handler already uses)
  return the discarded draft's real projection and map it, deciding no domain value in the
  controller. **Verified against source during this review.**
  **Resolution: Fix now.**

- **[blocking] `items` commands own multi-call business rules and the transaction boundary a domain
  service should own** — `apps/server/src/items/usecases/commands/correct-item.command.ts`:29-70
  (five `ItemCatalogueRepository` calls plus the SKU-correctability branch under `@Transactional()`),
  same shape at `create-item.command.ts`:44-66, `deactivate-item.command.ts`:29,
  `reactivate-item.command.ts`:19; rule: `docs/system/guides/adding-a-server-module.md` §4 ("Use a
  service when an operation requires several calls to one repository, calls to multiple
  repositories, or business logic that depends on multiple repositories"),
  `docs/system/guides/creating-a-server-repository.md` §"Transactions and errors" ("Mark the
  injectable service method that owns the complete atomic operation with `@Transactional()`"),
  `docs/system/server-architecture.md` §Services; problem: the catalogue rules (SKU uniqueness, SKU
  fixed once named, carry-forward of omitted detail fields) live in `usecases/commands/` with the
  atomic boundary declared there, while the same module's `OnHandAdjustmentService` and both sibling
  ordering modules put exactly this material in `<module>/domain/services/`; suggested: move the
  catalogue rules into an `items/domain/services/item-catalogue.service.ts` carrying
  `@Transactional()` and reduce the four commands to delegation, as `AdjustItemOnHandCommand` already
  is.
  **Resolution: Fix now.**

- **[blocking] The Drift Signal rule is written twice, and neither copy is in the owning domain** —
  `apps/server/src/shared/domain/repositories/purchase-draft-read.repository.ts`:124-148 (the
  four-condition `WHERE` at :146, including the `allocation.purchaseDraftLineLinkId IS NULL`
  suppression) and `apps/server/src/purchase-drafts/usecases/queries/read-purchase-draft.query.ts`:22-51
  (`driftSignalsOf`); rule: `docs/system/guides/creating-a-server-repository.md` §"Keep repositories
  isolated and operation-oriented" ("Move feature/domain mapping and business decisions to the owning
  feature; do not hide them behind repository helpers"), `docs/system/server-architecture.md`
  §"Layer responsibilities"; problem: the categorisation deciding what counts as drift (cancelled /
  quantity_changed / needed_by_moved / became_fulfilled-unless-this-draft-allocated) exists once as
  SQL and once as TypeScript, so the two can diverge silently — which the repository's own comment at
  :114-123 concedes it must not — and `purchase-drafts/domain/` holds neither; suggested: have the
  repository return the raw `snapshot`/`current`/`allocation` triple per link for the list read too
  (as `readDraft` already does at :40-48), move the single classification into
  `purchase-drafts/domain/`, and derive both `driftSignals` and `hasDriftSignal` from it.
  _Severity adjudicated: merged from one reviewer's advisory (wrong layer) and another's blocking
  (duplicated definition); the merged defect is blocking._
  **Resolution: Fix now.**

- **[blocking] A 714-line integration spec sits directly in `src/test/`** —
  `apps/server/src/test/ordering-load-smoke.integration.spec.ts`:1; rule:
  `docs/system/server-architecture.md` §Testing ("Colocate unit and integration test files with the
  production code they cover. Reserve `src/test/` for reusable test support: `factories/`,
  `fixtures/`, `expects/`, `mocks/`"); problem: the file is a spec, not reusable support, and is in
  none of the four sanctioned subdirectories; both existing load smokes are colocated
  (`warehouses/warehouses-load-smoke.integration.spec.ts`,
  `workspaces/workspaces-load-smoke.integration.spec.ts`); suggested: move it into the module whose
  production code it principally covers — `purchase-drafts/purchase-drafts-load-smoke.integration.spec.ts`
  — leaving only reusable seeding helpers under `src/test/factories/`.
  _Severity adjudicated: rated advisory by one reviewer and blocking by another; §Testing states the
  reservation as a requirement and two sibling precedents comply._
  **Resolution: Fix now.**

- **[blocking] Tests were written for the ordering migrations** —
  `apps/server/src/shared/domain/entities/ordering-entities.integration.spec.ts`:521-633
  (`describe('relocated T1 constraint proofs …')`, incl. :522 `uq_items_warehouse_sku`, :558
  `chk_items_on_hand_quantity_not_negative`, :602 "holds exactly the four Packaging Type
  identifiers") and
  `apps/server/src/shared/domain/repositories/packaging-type-catalogue.repository.integration.spec.ts`:11,36-53
  (imports `initialPackagingTypes` from `1786600000000-CreateOrderingSchema` and asserts the seed's
  cardinality); rule: `docs/system/guides/adding-a-server-module.md` §3 ("Do not write tests for
  migrations"); problem: these assertions target DDL and seed rows created by the migration, not
  entity mapping or repository behaviour; suggested: delete the constraint- and seed-proof blocks,
  keep the `column mapping against the promoted schema (round-trip)` describe (:230-459) and a
  repository-behaviour assertion that does not pin the seed's cardinality, and verify the migration
  by applying and reverting it as the server's `migration:*` scripts direct.
  **Verified against source during this review.**
  **Resolution: Fix now.**

- **[blocking] A file under `shared/domain/repositories/` imports a feature module, and the guard
  that should catch it excludes that module** —
  `apps/server/src/shared/domain/repositories/purchase-draft-read.repository.integration.spec.ts`:7
  (`import { ReadPurchaseDraftQuery } from 'purchase-drafts/usecases/queries/read-purchase-draft.query'`)
  and `apps/server/src/shared/domain/repositories/repository-boundaries.spec.ts`:40-48
  (`FEATURE_MODULES` gains `customer-orders` and `items`, not `purchase-drafts`); rule:
  `docs/system/guides/creating-a-server-repository.md` §"Keep repositories isolated and
  operation-oriented" ("Code under `apps/server/src/shared/domain/repositories/` must not import from
  or otherwise know about a dedicated feature module" — stated over the directory, not over
  `*.repository.ts`), `docs/system/server-architecture.md` §"Dependency direction" ("shared
  repositories never depend on dedicated feature modules"); problem: the diff adds
  `apps/server/src/purchase-drafts/` and four purchase-draft repositories, but the boundary spec's
  module list omits `purchase-drafts` while its own comment at :30-34 claims it enforces the rule for
  every shared repository — so the live crossing at `…integration.spec.ts`:7 passes silently;
  suggested: add `'purchase-drafts'` to `FEATURE_MODULES` (or derive the list from the directories
  directly under `src/` so a new module cannot be omitted), and assert the query's behaviour from
  `purchase-drafts/usecases/queries/`, keeping the repository spec on the repository's return shape.
  _Severity adjudicated: each reviewer rated one half advisory; merged, this is a real violation of a
  stated requirement plus the blind spot that permits it._
  **Resolution: Fix now.**

### Advisory

- **[advisory] Four query use cases are provided and exported with no production consumer** —
  `apps/server/src/items/usecases/usecase.module.ts`:31-32 (`ListWarehouseItemsQuery`,
  `ListActiveItemsForPickerQuery`) and `apps/server/src/customer-orders/usecases/usecase.module.ts`:34-35
  (`ListUnfulfilledCustomerOrdersForItemQuery`, `ListLinkableCustomerOrdersForItemQuery`); rule:
  `docs/system/guides/adding-a-server-module.md` §4 ("Export only the providers that a transport
  adapter or another deliberately coupled module needs"), `docs/system/server-architecture.md`
  §"Source structure" ("Create only directories and modules that contain behavior"); problem: no
  controller, use case or service injects any of the four, and the comment at
  `customer-orders/usecases/usecase.module.ts`:27-30 claims `?itemId=&state=unfulfilled` is answered
  "by the two destination-specific reads" while `CustomerOrdersController`:86 answers it with
  `ListCustomerOrdersQuery`; suggested: wire them to the endpoints that need them or delete them with
  their specs, and correct the module comment.
  **Resolution: Fix now.**

- **[advisory] `purchase-drafts/module-boundaries.spec.ts` asserts no boundary, and `items/` has
  none** — `apps/server/src/purchase-drafts/module-boundaries.spec.ts`:25-79; rule:
  `docs/system/adr/14-08-2026-domain-owned-flat-modules.md` §Alternatives ("the server keeps its
  static-source-scan specs and NestJS module exports" as the boundary mechanism) and §Decision
  "Public surface"; problem: the file named for boundaries only regex-matches provider and export
  names in its own `usecase.module.ts` — it asserts nothing about how `purchase-drafts` reaches
  `customer-orders`, the one live cross-module edge in this diff, while
  `customer-orders/module-boundaries.spec.ts`:64-83 does assert the reverse direction; `items/` has
  neither; suggested: give `purchase-drafts` the sibling's scan and add the equivalent to `items/`.
  **Resolution: Defer** → `docs/features/ordering/spec.md` §8, owner Backend Lead, due before `ship`.

- **[advisory] A shared-guard regression spec is filed under one feature's controller directory** —
  `apps/server/src/customer-orders/rest/controllers/write-rate-limit-cross-module.integration.spec.ts`:1-40;
  rule: `docs/system/server-architecture.md` §Testing ("Colocate unit and integration test files with
  the production code they cover"); problem: it covers `shared/guards/write-rate-limit.counter.ts`
  and `.guard.ts`, beside which `write-rate-limit-http-contract.integration.spec.ts` already lives;
  the in-file comment gives a historical, not architectural, reason; suggested: move it to
  `shared/guards/`.
  **Resolution: Defer** → `docs/features/ordering/spec.md` §8, owner Backend Lead, due before `ship`.

- **[advisory] `ItemCatalogueRepository` exposes column-level table-gateway methods the caller must
  coordinate** — `apps/server/src/shared/domain/repositories/item-catalogue.repository.ts`:121-153
  (`updateItemDetails`, `updateSku`, `setDeactivatedAt`), coordinated at
  `apps/server/src/items/usecases/commands/correct-item.command.ts`:58,66; rule:
  `docs/system/guides/creating-a-server-repository.md` §"Design a specialized repository" ("Prefer
  one cohesive write method over exposing a sequence of table-shaped methods that every caller must
  coordinate"); problem: one member-facing correction issues three reads and up to two separate
  `UPDATE items` statements against the same row; suggested: one
  `correctItem(itemId, { sku?, description?, unitOfMeasure? })` writing the stated columns in a
  single guarded `UPDATE`, with the SKU-availability read folded into the same purpose-built query.
  **Resolution: Fix now.**

- **[advisory] Draft creation retrieves rows one at a time in an application-memory loop** —
  `apps/server/src/purchase-drafts/domain/services/purchase-draft-assembly.service.ts`:155-196
  (per-line `itemCatalogueRepository.findById` at :158, per-link `lockOrderWithAllocatedTotal` at
  :168); rule: `docs/system/guides/creating-a-server-repository.md` §"Design a specialized
  repository" ("Prefer one purpose-built query over retrieving records separately and joining or
  filtering them in application memory"); problem: a draft with N lines and M links costs N+M+1 round
  trips inside the write transaction, all to establish one same-Warehouse predicate the composite FKs
  in `1786600000000-CreateOrderingSchema.ts` already enforce; suggested: one repository read
  resolving all named Item and Customer Order ids for the acting Warehouse in a single
  `WHERE id IN (…) AND warehouse_id = …` query, refusing on the ids missing from the result.
  **Resolution: Fix now.**

- **[advisory] `guardDraftMutable` is a private repository method relocated to module scope** —
  `apps/server/src/shared/domain/repositories/purchase-draft-assembly.repository.ts`:74-84 (called
  from :188, :221, :240, :256, :287, :309), same shape at `purchase-draft-read.repository.ts`:124;
  rule: `docs/system/guides/creating-a-server-repository.md` §"Keep repositories isolated and
  operation-oriented" ("If persistence logic is reusable, make it a meaningful public operation …
  do not hide them behind repository helpers"); problem: the class-member ban is satisfied literally,
  but a six-way-reused conditional `UPDATE purchase_drafts` remains a hidden repository helper rather
  than a named operation; suggested: expose it as a public operation (e.g. `touchDraftIfMutable`),
  which is the guide's own stated remedy.
  **Resolution: Fix now.**

- **[advisory] The ordering load smoke runs for 600 seconds under the documented integration-tier
  command** — `apps/server/src/test/ordering-load-smoke.integration.spec.ts`:76-77,712; rule:
  `docs/system/server-architecture.md` §"Running the integration tier" (the tier is documented as one
  command, `DATABASE_NAME=… RUN_INTEGRATION=1 pnpm --filter @warehouser/server exec jest
--runInBand`); problem: `RUN_INTEGRATION=1` is the spec's only gate and
  `ORDERING_LOAD_DURATION_SECONDS` defaults to 600, so the documented command now seeds 2 000 Items /
  5 000 orders / 750 drafts and then loops for ten minutes; the precedent it cites
  (`warehouses-load-smoke.integration.spec.ts`:14-15) has no duration loop; suggested: run the
  sustained loop only when `ORDERING_LOAD_DURATION_SECONDS` is explicitly set, and document the
  release-gate invocation beside it.
  **Resolution: Fix now.**

- **[advisory] `findLinks` has no production consumer** —
  `apps/server/src/shared/domain/repositories/purchase-draft-assembly.repository.ts`:327-336; rule:
  `docs/system/server-architecture.md` §"Source structure" ("Create only directories and modules that
  contain behavior"); problem: the only callers are
  `purchase-draft-assembly.repository.integration.spec.ts` (:302, :486, :551, :555, :657), whereas
  `findLines` at :321 has a production caller (`purchase-draft-freeze.service.ts`:66); suggested:
  drop `findLinks` and read the links through `PurchaseDraftReadRepository.readDraft` in the spec.
  **Resolution: Fix now.**

- **[advisory] Ten new shared repositories bypass `DomainModule`, leaving two registration
  conventions and one false assertion** — `apps/server/src/shared/domain/domain.module.ts`:69-87 (the
  ordering repositories are absent) versus
  `apps/server/src/purchase-drafts/usecases/usecase.module.ts`:43-52, with
  `apps/server/src/shared/domain/domain.module.spec.ts`:95 asserting "globally provides and exports
  every shared repository"; rule: `docs/system/server-architecture.md` §"NestJS modules and exports"
  ("Global providers must not become a service locator"); problem: per-feature provision is the more
  conformant of the two, but the repository set is now split across two mechanisms,
  `ItemCatalogueRepository` is instantiated three times, and the named assertion is false for ten of
  twenty-seven repositories; suggested: keep the per-feature registration and rename that assertion
  to the enumerated subset it actually checks, so the two conventions are recorded rather than
  contradictory.
  **Resolution: Fix now.**

- **[advisory] Read repositories compose the REST response shape in SQL instead of above the
  boundary** — `apps/server/src/shared/domain/repositories/purchase-draft-read.repository.ts`:229-264
  (`json_build_object` emitting `itemSku`, `itemDescription`, `customerName` under openapi field
  names) and `apps/server/src/shared/domain/repositories/consolidated-demand.repository.ts`:10-31,105;
  rule: `docs/system/guides/creating-a-server-repository.md` §"Keep repositories isolated and
  operation-oriented" ("Place conversions between shared persistence entities and feature-owned
  domain objects in `apps/server/src/<feature-name>/domain/mappers/`"); problem: `purchase-drafts`
  has no `domain/mappers/` directory at all, while `items` added one
  (`items/domain/mappers/item-catalogue-entry.mapper.ts`) for a strictly smaller assembly, so the same
  conversion responsibility sits on two different sides of the repository boundary within one change;
  the controllers do re-map field-by-field (`purchase-drafts.controller.ts`:62-119), which limits the
  blast radius; suggested: return persistence-oriented rows and assemble the nested `lines`/`links`
  graph in `purchase-drafts/domain/mappers/`, matching the `items` precedent set in this same diff.
  **Resolution: Fix now.**

- **[advisory] The ordering server code emits no structured log event at all, and the §6 timing gate
  measures a wrapper only the test applies** —
  `apps/server/src/test/ordering-load-smoke.integration.spec.ts`:46 is the only importer of
  `shared/logger/with-operation-timing`; no file under `apps/server/src/items`, `customer-orders` or
  `purchase-drafts` injects `PinoLogger` or calls `withOperationTiming`; rule:
  `docs/system/adr/27-07-2026-structured-logging-with-pino.md` §Decision (providers inject
  `PinoLogger` and set the class name as context),
  `docs/system/adr/03-08-2026-structured-logging-instead-of-telemetry.md` §Decision (structured logs
  are the server's one diagnostic mechanism); problem: ~30 new endpoints across four controllers
  produce zero application log lines, so the only ordering diagnostics are the global filter's
  failure log, and because the smoke test supplies the timing wrapper itself it proves the helper's
  arithmetic rather than a production log path — compare `users/usecases/commands/create-member.command.ts`:85,
  which wraps the command body; `docs/features/ordering/sad.md` §8 commits to the opposite;
  suggested: wrap the ordering commands and the consolidated-demand / draft-detail queries in
  `withOperationTiming` with an injected `PinoLogger` set to class context, and let the smoke read
  the emitted `durationMs`.
  **Resolution: Fix now.**

- **[advisory] A named error factory is declared inside a guard implementation file** —
  `apps/server/src/shared/guards/write-rate-limit.guard.ts`:17-18; rule:
  `docs/system/guides/server-error-handling.md` §3 "Use named error factories"; problem:
  `writeRateLimitedError` is a correctly named and correctly typed `ApplicationError` factory, but it
  is defined in the guard body while the file's own line 9 imports the equivalent `accessDeniedError`
  from `shared/access/access-denial.errors.ts` — the shared home this repository already uses for
  transport-tier factories; suggested: move it to `shared/access/access-denial.errors.ts` (or a
  sibling `shared/access/write-rate-limit.errors.ts`) so guard-raised codes are discoverable from one
  place.
  **Resolution: Fix now.**

## Verified conformant

Checked against the manifest and found clean — recorded so a later run need not re-derive it:

- **Errors.** Every `ApplicationError` in the diff is constructed by a named `…Error` factory under
  `<module>/domain/errors/`; no anonymous factory reaches `assert`; no `assert(false, …)`; the only
  string-form asserts (`purchase-drafts.controller.ts`:164) are genuine invariants. Error `details`
  carry only caller-submitted identifiers, own-Warehouse figures and catalogue IDs.
- **No routine `try/catch`.** The only `catch` in the entire server diff is at
  `shared/errors/global-http-exception.filter.ts`:626. No layer catches, logs and rethrows. No NestJS
  HTTP exception class is imported outside the filter and guards.
- **Global filter.** The 23 new ordering codes each receive an explicit status and the pre-existing
  exhaustiveness test at `global-http-exception.filter.spec.ts`:190 covers them mechanically. No
  route- or controller-level `@UseFilters` was added. The single log call logs only redacted error,
  method, route and `x-request-id`.
- **Contracts and validation.** Every request shape goes through `createZodDto` over a
  `@warehouser/contracts/{items,customer-orders,purchase-drafts}` subpath and every response type is
  the contract's inferred type; no inline or bare-TypeScript network shape in any controller; all
  three subpath exports were added to `packages/contracts/package.json`; no server file imports the
  package root; no `class-validator` / `class-transformer` anywhere.
- **Predicates.** Take all values as arguments, return `boolean`, mutate nothing, do no I/O, never
  log and never throw; placement matches the §1 ladder.
- **Persistence.** No `private` members on any new repository; no `try`/`catch`, logging or error
  translation inside a repository; no `DataSource.transaction`, `QueryRunner` or independent
  transaction boundary — every manager comes from `getEntityManager(this.dataSource)` and
  `@Transactional()` sits on the owning service; no `BaseRepository`, CRUD base, repository port or
  feature-owned adapter; no `typeorm` or QueryBuilder import in the three feature modules'
  production code.
- **Migrations.** Both have real `down()` implementations and are byte-identical to the staged
  `docs/features/ordering/migrations/` files apart from one lint suppression; `synchronize: false`
  unchanged in all three configurations.
- **Logging and telemetry.** No `console.*`, no `new Logger()`, no direct `pino()` instantiation in
  the diff. No telemetry SDK, tracer, span, metric, exporter or collector — `AGENTS.md`'s
  prohibition holds. `shared/guards/write-rate-limit.counter.ts`:39-53 is a fixed-window enforcement
  counter, not a metrics abstraction.
- **Async.** The diff adds no `handlers/` directory, no handler module, no queue abstraction, no
  `@nestjs/schedule` / `@Cron` / `setInterval`, and no event schema outside `src/shared/events/`.
- **Guards.** The `write-rate-limit` set lives in `shared/guards/`, carries no business rule, and no
  feature module imports another feature module to obtain it.
- **Integration tier.** Every new `*.integration.spec.ts` is `RUN_INTEGRATION`-gated;
  `src/test/expects/write-rate-limit-wiring.ts` is a genuine assertion helper in the correct
  subdirectory; `restore-catalogues.setup.ts` extends the catalogue set additively without altering
  the truncate / serial / gating contract.

## Pre-existing observations (not findings of this review)

- **BullMQ is installed and wired, contrary to two system documents.** `apps/server/src/app.module.ts`
  registers `BullModule.forRootAsync` via `shared/queue/bullmq.options.ts`, while
  `docs/system/server-architecture.md` §"Runtime applications" says "BullMQ and Redis remain planned
  and must not be treated as already installed" and `docs/system/sad.md` §"Known risks" repeats it.
  `git diff 9bc822b..HEAD -- apps/server/src/app.module.ts` shows the ordering change did not touch
  the registration. Scope is the diff, so this is an observation. **Routed to `/system-docs`.**
- **`server-index.md` § Decisions overreaches on server placement.** See § Manifest note above.
  **Routed to `/system-docs`.**

## Noted for `/review` (not adjudicated here)

Acceptance-criteria compliance is `/review`'s gate. Three observations are passed on:

- `PurchaseDraftsController.discardPurchaseDraft` (`purchase-drafts.controller.ts`:270-287) returns a
  summary whose `createdByUserId` / `createdAt` are synthesized from the discarding member and the
  discard instant — bears on AC-24 / AC-24a's observable outcome. (Also blocking above, on
  architecture grounds.)
- `ErrorCode.PURCHASE_DRAFTS_LINK_EXISTS` and `ErrorCode.ITEMS_INVALID_INPUT` are declared and
  status-mapped but raised by no code path — check whether the duplicate-link 409 and the item-input
  400 the contract documents are actually produced.
- The four unconsumed query use cases bear on whether the endpoints the contract documents exist.

## Crossover

`apps/web` changed in the same branch and is out of scope here. `/code-review-front-end ordering`
already ran on 2026-08-26 over the same branch point and returned `CHANGES REQUESTED` with nine
blocking findings resolved _Fix now_; no commit has landed since `91e1b96`, so those web fixes are
still outstanding. `/review` is therefore gated on both app-scoped passes.

## Gate

The server gate (`pnpm --filter @warehouser/server lint | test | build`) was **not** run as part of
this review; it belongs to the `implement` per-task gate that will carry the fixes.

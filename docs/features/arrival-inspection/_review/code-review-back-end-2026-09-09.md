---
work_item: 'feature:arrival-inspection'
work_item_root: 'docs/features/arrival-inspection'
skill: 'code-review-back-end'
date: '2026-09-09'
feature_size: 'L'
verdict: 'CHANGES REQUESTED'
---

# Back-end conformance review — arrival-inspection (2026-09-09)

Does the `apps/server` part of this change obey `docs/system`? Acceptance-criteria compliance is
`/review`'s gate and is not adjudicated here; the `apps/web` half was reviewed separately in
[`code-review-front-end-2026-09-08.md`](code-review-front-end-2026-09-08.md).

## Diff scope

Branch `12-arrival-inspection`, base `ccd84f70f198c3f91a5144a6afca5a02970495b4` (branch point from
`master`).

```sh
git diff ccd84f70f198c3f91a5144a6afca5a02970495b4..HEAD -- apps/server packages/contracts
# 73 files changed, 14383 insertions(+), 151 deletions(-)
```

`packages/contracts` was judged only for how `apps/server` declares the schema and adapts it in
`rest/dtos/`; its web consumption belongs to the front-end skill.

## Document manifest

`docs/system/server-index.md` was read in full this run, and every document below was read in full
before dispatch. Paths are relative to `docs/system/`.

### Architecture (the floor)

- `server-architecture.md`
- `architecture-map.md`
- `sad.md`

### Guides selected by the changed paths

- `guides/adding-a-server-module.md` — module barrels, `usecase.module.ts`, `rest.module.ts`,
  `domain.module.ts`, new cross-module dependencies, migrations, tests
- `guides/creating-a-server-repository.md` — two new repositories, two grown ones
- `guides/server-error-handling.md` — new predicates, error factories, the global filter
- `guides/server-use-case-boundaries.md` — new and changed commands and queries
- `guides/server-request-authorization.md` — `shared/decorators/observed-permission.decorator.ts`,
  the `@RequiredPermission` / `@ObservedPermission` handlers, the redacting projections
- `guides/adding-and-using-contracts.md` — `packages/contracts/src/purchase-drafts/`, `rest/dtos/`

### Accepted ADRs in the index

- `adr/18-08-2026-scope-of-exercise-placement-tiebreak.md`
- `adr/21-07-2026-postgresql-with-typeorm.md`
- `adr/24-07-2026-server-error-handling.md`
- `adr/27-07-2026-structured-logging-with-pino.md`
- `adr/03-08-2026-structured-logging-instead-of-telemetry.md`
- `adr/12-07-2026-schema-validation-with-zod.md`

`adr/14-08-2026-domain-owned-flat-modules.md` is **Superseded** by the tiebreak above and was read
for its reasoning, as the index directs. Its own § Consequences records that "The server side is
**not** reconciled by this decision" and that `server-index.md` and `guides/adding-a-server-module.md`
"still cite ADR 14-08 as the live placement decision", so server placement was judged against it.

Also read as repository instruction rather than as `docs/system` rule: root `AGENTS.md` and
`apps/server/AGENTS.md`.

Read for context, never as the rule: `docs/features/arrival-inspection/sad.md` (§5–§6),
`data-model.md` and its staged `migrations/`, `contracts/openapi.yaml`, and the Accepted
`adr/0001-payload-conditional-permission.md`.

### Selector-map defect (reported so the map can be corrected)

`.claude/skills/code-review-back-end/references/server-manifest.md` lists neither
`guides/server-request-authorization.md` nor `guides/server-use-case-boundaries.md`, although
`server-index.md` lists both and this diff touches exactly the paths their «when it applies»
descriptions cover. Per the shared protocol §2.3 the index wins; both were added to the manifest.

## Findings

Dispatched as three read-only `reviewer` passes on the `reasoning` tier (Opus), one per dimension
group bundle, and merged. Every finding below was re-verified at source by the orchestrator before
being put to the user.

### Blocking

- **[blocking] an integration spec drives the migration class itself, reverting and replaying
  `1786800100000`** — `apps/server/src/shared/domain/entities/arrival-inspection-permissions.integration.spec.ts:146-155`
  and `:181-187`; rule: `docs/system/guides/adding-a-server-module.md` §3 "Define domain and
  persistence boundaries" — "Add schema changes as timestamped migration classes under
  `apps/server/migrations/`; generate, review, apply, revert, and apply them again with the server's
  `migration:*` scripts. … Do not write tests for migrations." (restated in `apps/server/AGENTS.md`:
  "Verify migrations by applying and reverting them against the real development database.");
  problem: `beforeAll` sets `dataSource.setOptions({ migrations: [join(process.cwd(), 'migrations/1786800100000-GrantArrivalInspectionPermissions.ts')] })`
  and the AC-01a/AC-26 case then calls `undoLastMigration()`, asserts the reverted catalogue, and
  calls `runMigrations()` — executing and asserting both halves of a migration class. The spec's own
  header claims "nothing here names one", contradicted at `:185`. Verified: no other spec in the
  repository calls `undoLastMigration` or `runMigrations` (only `src/test/pglite/global-setup.ts`,
  which is tier infrastructure), so `delivery-address-permissions.integration.spec.ts` establishes no
  precedent; suggested: keep the catalogue, grant and `PermissionId`-agreement assertions, which read
  only the already-migrated template state, and delete the `setOptions({ migrations })` bootstrap and
  the revert-and-replay block.
  **Resolution: Fix now** — drop the replay; the "grant reaches a pre-existing Role" half moves to
  hand-verification with `migration:revert` / `migration:run` against the development database.

- **[blocking] a `domain/` mapper assembles the REST response shape, carrying the wire types two
  layers inward** — `apps/server/src/purchase-drafts/domain/mappers/line-condition.mapper.ts:1-5`,
  `:60`, `:86`, `:116`; rule: `docs/system/server-architecture.md` §"Layer responsibilities → Domain"
  — "Mappings between shared persistence entities and **feature-owned domain objects** belong in
  `<feature-name>/domain/mappers/`" — and §"REST", which places result-to-HTTP translation in the
  controller layer; problem: the mapper's targets are `LineCondition`, `PurchaseDraftLineRejection`
  and `PreReceiptConformance` imported from `@warehouser/contracts/purchase-drafts` — the REST
  response shapes, not feature-owned domain objects — so response assembly happens in `domain/` and
  the contract type propagates outward through `read-purchase-draft.query.ts:32` and
  `list-purchase-draft-lines.query.ts:5`. Verified as the only production file under
  `purchase-drafts/domain/` importing `@warehouser/contracts` (the two other hits are comments);
  suggested: have `withCondition` / `conditionOf` produce a feature-owned condition type
  (persistence → domain, which is what `domain/mappers/` is for) and shape the contract types in
  `purchase-drafts/rest/purchase-draft-response.ts`, which the module already owns for that
  translation.
  **Resolution: Fix now** — as suggested. The user's `to*` directive below was scoped so it does not
  reverse this: `rest/purchase-draft-response.ts` stays the home of contract-shape assembly.

- **[blocking] a repository-reaching operation is duplicated verbatim across two use cases instead of
  extracted** — `apps/server/src/purchase-drafts/usecases/queries/read-purchase-draft.query.ts:153-168`
  and `apps/server/src/purchase-drafts/usecases/queries/list-purchase-draft-lines.query.ts:101-118`;
  rule: `docs/system/server-architecture.md` §"Services" — "extract a service only when one of these
  is true: **more than one use case needs the same operation** — the rule would otherwise be
  duplicated" and "A shared operation that reaches a repository belongs in an injectable service, so
  the repository is injected once rather than threaded through every caller as an argument"; also
  `docs/system/guides/adding-a-server-module.md` §4 — "do not repeat that rule in a controller,
  handler, or use case"; problem: `rejectionReasonLabelsOf` is byte-identical in both queries (the
  second's own comment says "see `ReadPurchaseDraftQuery`'s identical method") and both inject
  `RejectionReasonCatalogueRepository` to run it — the first extraction trigger has fired and the
  operation was copied instead; suggested: move the empty-set short circuit plus
  `resolveRejectionReasons` → label-map into one injectable method under
  `purchase-drafts/domain/services/` (the module already injects that repository into
  `ArrivalInspectionService`), registered as a non-exported provider of `usecase.module.ts`, and have
  both queries call it.
  **Resolution: Fix now** — as suggested.

- **[blocking] a persisted Condition Split with no verdict has no response shape, so every read serves
  it as no condition at all** — `apps/server/src/purchase-drafts/domain/mappers/line-condition.mapper.ts:87`;
  rule: `docs/system/server-architecture.md` §"REST" — "Every REST request and response shape is
  defined as a Zod schema in `packages/contracts` and imported through a package subpath"; problem:
  `lineConditionWithCauseSchema` and `lineConditionCauseWithheldSchema`
  (`packages/contracts/src/purchase-drafts/purchase-drafts-projections.ts:349`, `:362`) declare
  `preReceiptConformance` non-nullable, so "Rejections recorded, no verdict stated" has no contract
  member — and `conditionOf` resolves that by returning `null` for the whole condition. The whole
  chain was verified reachable through the served route: `preReceiptConformance` is `.optional()` on
  the arrival mutation schema (`purchase-drafts-mutations.ts:296`), `assertPreReceiptConformance`
  returns early on a `null` verdict
  (`apps/server/src/purchase-drafts/domain/services/arrival-inspection.service.ts:348`), no other
  assertion in `assertEndingCondition` requires a verdict when Rejections are present, the migration's
  `chk_purchase_draft_lines_pre_receipt_conformance_instruction` admits `NULL`
  (`apps/server/migrations/1786800000000-CreateArrivalInspectionSchema.ts:73-82`), and
  `buildEndingConditionInput` still persists the Rejections
  (`purchase-draft-line-ending.mapper.ts:50`). A POST of `receivedQuantity: 100` with one Rejection
  and no `preReceiptConformance` therefore writes `purchase_draft_line_rejections` rows, and both
  reads serve `ending.condition: null` — the refused quantity, the accepted quantity and every
  Rejection vanish for an actor holding `REJECTIONS:WATCH`.
  `purchase-draft-response-contract-parity.spec.ts:86-94` exercises the absent case only with
  `rejectedQuantity: 0` and no `rejections`, so no test covers the combination. Noted for `/review`:
  the substance is data loss, an AC concern; the conformance angle recorded here is the unmodelled
  response state.
  **Resolution: Fix now** — refuse at the write: a Condition Split that states no verdict is refused,
  so Rejections can never be persisted without one, and no projection branch discards recorded rows.

### Advisory

- **[advisory] the module's domain-independence scan does not reach the layer this change added** —
  `apps/server/src/purchase-drafts/module-boundaries.spec.ts:151-157`; rule:
  `docs/system/server-architecture.md` §"Layer responsibilities → Domain" and §"Dependency
  direction"; problem: `PURE_DOMAIN_DIRECTORIES = ['predicates', 'value-objects', 'errors']` omits
  `mappers/`, and the block's own comment justifies only the `services/` exclusion, so both new files
  under `domain/mappers/` are unchecked; `FORBIDDEN_SPECIFIERS` (`@nestjs/`, `typeorm`,
  `shared/domain/entities/`) names no transport specifier either, so the contract import in the
  second blocking finding would pass even if the directory were scanned; suggested: add `mappers` to
  the scanned directories and `@warehouser/contracts` to the forbidden specifiers.
  **Resolution: Fix now** — this is what turns the second blocking finding into a failing gate rather
  than a review catch.

- **[advisory] a service method with no caller outside its own class** —
  `apps/server/src/purchase-drafts/domain/services/arrival-inspection.service.ts:380`; rule:
  `docs/system/server-architecture.md` §"Services", the four properties — "**every method has more
  than one caller.** A method called by one command belongs in that command"; problem:
  `assertStatedRejectionReasons` is public but its only production caller is its sibling
  `assertEndingCondition` (`:427`); every other reference is a spec; suggested: make it `private`,
  keeping the service's public surface to the one method both ending commands call.
  **Resolution: Fix now.**

- **[advisory] the payload-conditional capability condition is inlined at the assertion instead of
  being a named predicate** —
  `apps/server/src/purchase-drafts/domain/services/arrival-inspection.service.ts:262`; rule:
  `docs/system/guides/server-error-handling.md` §1 — "Give domain conditions domain names" — and
  `docs/system/adr/24-07-2026-server-error-handling.md` §Context ("Embedding conditions and anonymous
  error construction at call sites makes domain rules harder to discover"); problem:
  `actor.observedPermissionIds.includes(PermissionId.REJECTIONS_CREATE)` is written raw inside
  `assert`, while the mirror-image observed-Permission condition on the read side is a named
  predicate (`readsRejectionCause`,
  `apps/server/src/purchase-drafts/domain/predicates/rejection-cause-access.predicates.ts:18`);
  suggested: a sibling predicate in that same file, passed to `assert`, so both halves of the
  ADR-0001 rule are discoverable in one place.
  **Resolution: Fix now.**

- **[advisory] the cause-redaction selector defaults to the disclosing form** —
  `apps/server/src/shared/domain/repositories/purchase-draft-read.repository.ts:915`, `:932`, `:956`,
  `:970`; rule: `docs/system/guides/server-request-authorization.md` §"Consume the observed set in the
  projection" — "Build the redacted form by **not selecting** the withheld columns"; problem:
  `cause: RejectionCauseProjection = 'with_cause'` means a caller that omits the argument selects
  every Reason, description, Source and Disposition; all four production callers pass it today, so
  the failure mode is a future reader silently disclosing rather than silently withholding;
  suggested: make `cause` required, or default it to `'cause_withheld'` so an omission fails closed.
  **Resolution: Fix now.**

- **[advisory] the shared prose bound is restated in the server instead of imported from the
  contract** —
  `apps/server/src/purchase-drafts/domain/predicates/purchase-draft-condition.predicates.ts:34`;
  rule: `docs/system/adr/12-07-2026-schema-validation-with-zod.md` §Consequences — "One schema
  definition per shared request/response shape, reused by both apps, instead of parallel … hand-written
  … checks that can drift apart"; problem: `MAX_PROSE_LENGTH = 1000` is a second literal for the bound
  `packages/contracts/src/purchase-drafts/purchase-drafts-projections.ts:306` already exports as
  `maxProseLength`, and that export's own comment records that restating the number is what previously
  let the read and write schemas drift; the server also reports it back to the client in the
  too-long violations, so the two can disagree about what was refused. Re-evaluating the bound on the
  server stays correct (`guides/server-error-handling.md` §1); restating its value is what drifts;
  suggested: import `maxProseLength` and keep the predicate.
  **Resolution: Fix now.**

- **[advisory] a new query returns TypeORM persistence entities across the use-case boundary** —
  `apps/server/src/purchase-drafts/usecases/queries/list-rejection-reasons.query.ts:16`; rule:
  `docs/system/server-architecture.md` §"Use cases" — a use case "must not depend on REST DTO
  classes, controllers, BullMQ handler classes, TypeORM entities, QueryBuilder, or other TypeORM
  APIs"; problem: `execute(): Promise<RejectionReasonEntity[]>` hands the `@Entity`-decorated
  `RejectionReasonEntity` to `RejectionReasonsController`, which maps it in the controller body
  (`rest/controllers/rejection-reasons.controller.ts:30`). The two reviewer passes disagreed here —
  one cleared it on `guides/creating-a-server-repository.md` §"Keep repositories isolated" (a
  repository returns shared persistence entities and use cases are its callers), the other flagged it
  on the §"Use cases" sentence above. Adjudicated for the finding: the repository rule says what a
  repository may return, the use-case rule says what a use case may depend on, and both hold at once
  only if the use case projects; suggested: project to a feature-owned shape via
  `<feature>/domain/mappers/` and let the controller adapt that.
  **Resolution: Fix now.**

- **[advisory] `to*` mapping functions live in a controller rather than in `domain/mappers/`** —
  `apps/server/src/purchase-drafts/rest/controllers/purchase-drafts.controller.ts:76` and `:86`
  (`toEndingRejectionInputs`, `toEndingPreReceiptConformanceInput`), `:109` (`toReviseLineInput`), and
  the inline entity→contract mapping at
  `apps/server/src/purchase-drafts/rest/controllers/rejection-reasons.controller.ts:30`; rule:
  `docs/system/server-architecture.md` §"Layer responsibilities → Domain" — "Mappings between shared
  persistence entities and feature-owned domain objects belong in `<feature-name>/domain/mappers/`";
  raised by the user during resolution rather than by a reviewer pass; problem: mapping helpers named
  with a `to` prefix are declared in the transport layer.
  **Resolution: Fix now, scoped to this diff's controllers** — move all four into
  `purchase-drafts/domain/mappers/`. The user chose this scope over a repo-wide sweep explicitly:
  `rest/purchase-draft-response.ts`'s nine `to*` functions and `packaging-types.controller.ts:31` are
  outside the diff and stay where they are, which is also what keeps the second blocking finding's fix
  intact. Note the tension recorded rather than hidden: `server-architecture.md` §REST assigns
  HTTP-input→use-case-input translation to the controller, so moving
  `toEndingRejectionInputs` / `toEndingPreReceiptConformanceInput` / `toReviseLineInput` is the user's
  deliberate call, not a rule the architecture states.

### Advisory — acknowledged, no change

Raised, cited, put to the user, and closed without a fix. Recorded so the next reviewer does not
re-litigate them.

- **[advisory] the frozen-record write-boundary corpus was not extended to the new rule service it
  claims to cover** — `apps/server/src/purchase-drafts/usecases/commands/arrival-confirmation-write-boundary.spec.ts:62-74`;
  rule: `docs/system/adr/14-08-2026-domain-owned-flat-modules.md` §Consequences ("The mechanical
  checks … catch boundary crossings"); the list's comment reads "the two `purchase-drafts` halves
  **and the rule service they share**" but names only `purchase-draft-line-ending.service.ts`, while
  the ending's rule service is now `domain/services/arrival-inspection.service.ts` (which names two
  frozen fields at `:165-166` and `:183-185`) and `domain/mappers/purchase-draft-line-ending.mapper.ts`
  builds the persisted condition.
- **[advisory] a spec named for a repository that does not exist** —
  `apps/server/src/shared/domain/repositories/purchase-draft-condition-read.repository.integration.spec.ts:30`
  imports `PurchaseDraftReadRepository`; there is no `purchase-draft-condition-read.repository.ts`.
  The weakest of the ten: the cited rule (`docs/system/server-architecture.md` §Testing) requires
  colocation only, which the file satisfies, and the untouched
  `purchase-draft-address-drift-read.repository.integration.spec.ts` has the same shape. A naming
  consistency point, not a rule violation.
- **[advisory] the REST controller reaches past the use-case boundary for the ending payload's
  types** — `apps/server/src/purchase-drafts/rest/controllers/purchase-drafts.controller.ts:24` and
  `:66`; rule: `docs/system/server-architecture.md` §"Dependency direction" and §"Use cases";
  `ConfirmPurchaseDraftLineArrivalInput`'s members are typed with `RecordLineEndingRejectionInput`
  (declared in `shared/domain/repositories/arrival-confirmation.repository.ts`) and
  `EndingPreReceiptConformanceInput` (declared in `domain/mappers/purchase-draft-line-ending.mapper.ts`),
  so the transport layer imports a persistence module and a domain module to name the command's own
  input. Type-only today.
- **[advisory] three non-boolean exports live in a `.predicates.ts` module** —
  `apps/server/src/purchase-drafts/domain/predicates/purchase-draft-condition.predicates.ts:55`,
  `:73`, `:160`; rule: `docs/system/guides/server-error-handling.md` §1 — a predicate "Return[s]
  `boolean` or a TypeScript type predicate"; `totalRefusedQuantity` returns `number`, and
  `duplicatedRejectionReasonIds` / `instructionRefusalReasonIdsAmong` return string arrays. They are
  pure derivations the violation factories need, not conditions.

## Checked and clean

Recorded so the absence is on the record rather than assumed.

- **Placement of the new domain concepts is conformant.** Every rule over a Purchase Draft Line
  Rejection is a Purchase Draft Line invariant, so
  `docs/system/adr/14-08-2026-domain-owned-flat-modules.md` §Decision puts it in `purchase-drafts`.
  Nothing acquired module identity inside another module's tree — no `purchase-drafts/rejection-reasons/`
  directory, no second barrel, no nested NestJS module. `RejectionReasonsController`'s own top-level
  prefix is the URL/ownership disagreement `guides/adding-a-server-module.md` §1 sanctions. No empty
  `handlers/` or `usecases/events/` directory was added.
- **`ArrivalInspectionService` is a genuine extraction, not a pass-through layer.**
  `assertEndingCondition` has two production callers
  (`confirm-purchase-draft-line-arrival.command.ts:111`,
  `record-purchase-draft-line-delivery.command.ts:96`); the class carries no `@Transactional()` (both
  commands keep it); it holds no write; the stateless assertions stay module-level; and
  `usecase.module.di.spec.ts:173` proves it is not exported.
- **Persistence.** Both new repositories sit in `shared/domain/repositories/`, import only shared
  persistence entities, declare no private method, take their manager from
  `getEntityManager(this.dataSource)` with no `DataSource.transaction`, `QueryRunner` or `try`/`catch`
  of their own, and keep QueryBuilder inside the directory. Feature/persistence mapping is in
  `purchase-drafts/domain/mappers/`. Both new TypeORM entities are in `shared/domain/entities/`.
- **Migrations.** Timestamped classes under `apps/server/migrations/`, byte-identical to the staged
  `docs/features/arrival-inspection/migrations/01-*.ts` and `02-*.ts`, each with a `down` that
  reverses its `up` (grants deleted before catalogue rows); `synchronize: false` untouched in all five
  data-source configurations.
- **Errors and propagation.** No production `try/catch` was added — the only two `catch` blocks in the
  diff are test helpers in `arrival-inspection.service.spec.ts` (verified by scanning every added
  line matching `catch`). No error is mapped to another type or code upstream of the global filter.
- **Logging and telemetry.** No logging call, no `console.*`, no Pino instance, no telemetry, span,
  counter, `durationMs` or timing added anywhere in the diff (verified by scan); no credential in a
  log line. The only `Logger` in the diff is a test-only TypeORM `CapturingLogger`.
- **Validation.** No `class-validator` or `class-transformer` import was added (verified by scan);
  Zod remains the only validation technology.
- **Testing tier.** Every database-touching spec is named `*.integration.spec.ts`, nothing was added
  under `src/test/`, and none of the new or grown integration specs asserts a two-backend race, an
  "exactly one winner" property, or a latency/throughput figure — the shapes
  `server-architecture.md` §"What this tier cannot test" forbids re-adding.

## Pre-existing, untouched — observations only

Not findings of this review (shared protocol §7): scope is the diff.

- `purchase-drafts` reaches `customer-orders` by deep specifier
  (`customer-orders/domain/services/demand-allocation.service`) rather than through that module's
  barrel. Present at the base revision and explicitly sanctioned for this one provider by
  `docs/system/server-architecture.md` §Services; this change neither introduces nor widens it.
- `usecases/queries/list-packaging-types.query.ts` already returns `PackagingTypeEntity[]` the same
  way the sixth advisory describes.
- Every `packages/contracts/src/*/` module groups many schemas into `*-mutations.ts` /
  `*-projections.ts` rather than the one-schema-per-file layout
  `docs/system/guides/adding-and-using-contracts.md` §1 shows. The diff follows the established shape
  rather than introducing the divergence.
- `apps/server/src/purchase-drafts/rest/controllers/packaging-types.controller.ts:31` maps an entity
  inline in the controller, and `rest/purchase-draft-response.ts` holds nine `to*` functions outside
  `domain/mappers/`. Both are outside this diff and were deliberately left in scope-setting.

## Verdict

**CHANGES REQUESTED** — four blocking findings, all resolved as "fix now", plus eight advisory fixes
accepted and four advisories closed without change. No blocking finding is left open.

## Applied — fix-up run, 2026-09-09

Every "fix now" resolution above was implemented through the per-task TDD gate `implement` uses.
Each commit carries an `SDD-Review: code-review-back-end` trailer.

| Finding                                                     | Commit    |
| ----------------------------------------------------------- | --------- |
| blocking 1 — migration class driven by a spec               | `590c207` |
| blocking 4 — refusals without a verdict                     | `de15383` |
| — its member-facing sentence on the web                     | `6cc175f` |
| advisory — service surface + named capability predicate     | `6c376d7` |
| advisory — fail-closed cause selector + shared prose bound  | `77049b3` |
| blocking 3 — label resolution extracted to one service      | `d3c2f42` |
| blocking 2 — wire shape assembled at the REST boundary      | `db88a4b` |
| advisory — `to*` mappings moved, catalogue entity projected | `99a367b` |
| advisory — two-tier boundary scan                           | `2bf93f4` |

Final gate: unit **1825/1825** (139 suites), integration **900/900** (89 suites), `lint` clean,
`typecheck` clean; `apps/web` 1559/1559 (185 files), lint and `tsc` clean.

Three things the fixes uncovered that this review had not seen, recorded so the re-review does not
have to rediscover them:

- **The fail-closed change proved its own premise.** Making `cause` required turned seven cases in
  `purchase-draft-condition-read.repository.integration.spec.ts` red: it declared its own narrowed
  contract with `cause` optional behind an `as unknown as` cast, so it had been calling the real
  methods with two arguments — invisible to `tsc` — and the default was answering for it. Those cases
  were reading the withheld projection while asserting the cause-bearing one. The local contract now
  mirrors the repository parameter for parameter. `filters = {}` went too: behind a required
  parameter that default was unreachable.
- **One case was testing an unreachable path.** AC-07's "no description written" was stated as
  whitespace, but `assertRejectionShapes` refuses whitespace under `purchase_drafts.invalid_input`
  before the catalogue is consulted, so `description_required` could never see it in production.
- **The widened scan matched raw text, not imports.** Adding `rest/dtos/` made a _comment_ naming
  that path fail the check — which also means a comment could have been what made it pass. It reads
  module specifiers now, a tightening of the three pre-existing specifiers as well.

Two scope notes carried forward rather than closed:

- `@warehouser/contracts` is on neither tier's forbidden list, because `predicates/` legitimately
  re-exports `maxProseLength` and `mappers/` legitimately types its input mappings off the contract's
  request shapes. Blocking finding 2's regression is pinned by a named assertion on
  `line-condition.mapper.ts` instead. This is the cost the Tech Lead accepted when choosing the
  two-tier scan.
- Moving `toEndingRejectionInputs`, `toEndingPreReceiptConformanceInput` and `toReviseLineInput` out
  of the controller cuts against `docs/system/server-architecture.md` §REST, which assigns
  HTTP-input-to-use-case-input translation to the controller. It is the Tech Lead's decision, scoped
  to the controllers this change touched; `rest/purchase-draft-response.ts` and
  `packaging-types.controller.ts` are outside the diff and unchanged.

## Run next

The fixes are applied and committed (see § Applied above). Because the run also changed `apps/web`,
the next stages are `/code-review-front-end arrival-inspection`, then a re-run of
`/code-review-back-end arrival-inspection` over the changed surface, then `/review arrival-inspection`.

# Backend conformance review — dashboards

Date: 2026-09-23
Work item: feature `dashboards` (`docs/features/dashboards`), `.size` = `L`, `.route` = `full`
Reviewer: `code-review-back-end` — three clean-context `reviewer` workers (reasoning tier, effort `xhigh`), one per dimension-group cluster, merged here
Verdict: **CHANGES REQUESTED** — 2 blocking, 5 advisory. One blocking routed to a rule change, one to be fixed; two advisories to be fixed, three deferred. See § Findings and § Resolution.

## Diff scope

Branch `28-dashboards-analytics`, base `8632cf8b2dd9e0c887a702d690f27bbf86346250` (branch point off `master`), 41 commits.

`git diff 8632cf8b2dd9e0c887a702d690f27bbf86346250..HEAD -- apps/server packages/contracts` — 55 files, +10 678 / −4.

| Area                                                                 | Files |
| -------------------------------------------------------------------- | ----- |
| `apps/server/src/dashboards/`                                        | 26    |
| `apps/server/src/shared/`                                            | 16    |
| `packages/contracts/src/dashboards/` (+ manifest)                    | 7     |
| `apps/server/migrations/`                                            | 2     |
| `apps/server` root (`app.module.ts`, `.env.example`, `package.json`) | 3     |
| `apps/server/src/items/` (one boundary spec)                         | 1     |

`apps/web` also changed (83 files) and is **out of scope here** — it was reviewed by
`/code-review-front-end` on 2026-09-22. `packages/contracts` was judged only for how `apps/server`
declares the schema and adapts it; the web consumption belongs to that review.

**Crossover observations.**

- `packages/shared-types/src/enums/workspace-permission-id.ts` (+1) carries the new
  `WAREHOUSE_PERFORMANCE:WATCH` entry. It sits outside the skill's declared scope
  (`apps/server packages/contracts`) but is the boundary code location
  `guides/server-error-handling.md` §4 prescribes; checked and conformant.
- `docs/system/server-architecture.md` is edited on this branch (+6/−0), documenting the
  `@swc-node/register` dev loader that replaced `tsx watch`. The edit is accurate, scoped, and its
  mirror was resynced — `ai/skills/writing-app-code/scripts/sync-references.sh --check` reports
  "in sync with docs/system (42 files)". Not a finding.

## Document manifest

`docs/system/server-index.md` was read in full this run and is authoritative. Paths below are
relative to `docs/system/`.

**Floor (always read)**

- `server-architecture.md`
- `architecture-map.md`
- `sad.md` — read because the change crosses out of `apps/server` into `packages/contracts`
- `adr/18-08-2026-scope-of-exercise-placement-tiebreak.md` — Accepted
- `adr/21-07-2026-postgresql-with-typeorm.md` — Accepted
- `adr/24-07-2026-server-error-handling.md` — Accepted
- `adr/27-07-2026-structured-logging-with-pino.md` — Accepted
- `adr/03-08-2026-structured-logging-instead-of-telemetry.md` — Accepted
- `adr/12-07-2026-schema-validation-with-zod.md` — Accepted
- `adr/11-09-2026-oxlint-replaces-eslint.md` — Accepted
- `adr/14-08-2026-domain-owned-flat-modules.md` — **Superseded**; see § Which placement rule governs

**Selected by the changed paths**

- `guides/adding-a-server-module.md` — the new `dashboards` module, its barrel, its Nest modules
- `guides/creating-a-server-repository.md` — four new repositories in `shared/domain/repositories/`
- `guides/server-request-authorization.md` — 8 new protected handlers, `@RequiredPermission` /
  `@ObservedPermission`, `@ArchivedTolerantRead`
- `guides/server-use-case-boundaries.md` — 8 new queries
- `guides/server-error-handling.md` — predicates, the config startup check, the denial path
- `guides/adding-and-using-contracts.md` — the `@warehouser/contracts/dashboards` subpath

**Read as context, never as the rule:** `sad.md` §5–§6, `data-model.md` and its staged migrations,
`contracts/openapi.yaml`, and the two Accepted feature ADRs
(`adr/0001-conjunction-gated-panel-reads.md`, `adr/0002-charting-without-a-charting-dependency.md`).

### Selector-map disagreement (reported per shared protocol §2.3)

`.claude/skills/code-review-back-end/references/server-manifest.md` disagrees with
`server-index.md` and the index wins. The map omits three entries the index lists:

- `guides/server-request-authorization.md` — governs every protected handler; it is the document
  that decides blocking finding **B1** below, and the map would not have selected it.
- `guides/server-use-case-boundaries.md` — governs every use case.
- `adr/18-08-2026-scope-of-exercise-placement-tiebreak.md` — **Accepted**, while the map still names
  `adr/14-08-2026-domain-owned-flat-modules.md` as the placement ADR for two of its selector rows.

All three were added to the manifest for this run. The map should be corrected.

### Which placement rule governs the server

Worth recording, because the index and the guides read as though they disagree. The index marks
`14-08` **Superseded** by `18-08`, but `18-08` §Consequences states outright:

> The server side is **not** reconciled by this decision. `server-index.md` and
> `Adding a server module` still cite ADR 14-08 as the live placement decision. That is an accepted,
> recorded consequence until a later change request reconciles them, not an oversight.

So server placement was judged under **ADR 14-08 + `server-architecture.md` §Source structure +
`adding-a-server-module.md` §1**, and the scope-of-exercise tiebreak was not applied. This is a
latent trap for the next reviewer and is left as an observation, not a finding.

## Findings

- **[blocking] B1 — an observed Permission gates admission to the whole Panel read** —
  `apps/server/src/dashboards/usecases/queries/read-coverage-gap.query.ts`:24 (and
  `read-arrival-timing.query.ts`:31, over `dashboards/domain/predicates/panel-access.predicates.ts`:20-31,
  declared at `dashboards/rest/controllers/warehouse-dashboard.controller.ts`:57-60 and :73);
  rule: `docs/system/guides/server-request-authorization.md` §Rules — "The resolved-grant set may be
  read inside a use case to **narrow** what an already-admitted request may do — to withhold a field
  from a projection, or to refuse an operation whose payload requires a capability the actor does not
  hold… A handler must never gate _admission_ on an observed Permission… and no use case may recreate
  that decision by treating the set as though it could"; problem: the query `assert`s the observed set
  and refuses the **entire** response with `accessDeniedError()` before any read, unconditionally —
  no field is withheld and there is no payload to be conditional on, so the observed Permission is
  functionally required and admission has moved from the guard into the use case; suggested: add the
  third narrowing form to the guide and cite the feature ADR, exactly as the guide already carries
  `delivery-addresses` ADR 0001 (line 105) and `arrival-inspection` ADR 0001 (line 123).

- **[blocking] B2 — calendar-dependent integration fixtures; one assertion breaks tomorrow** —
  `apps/server/src/shared/domain/repositories/workspace-performance-read.repository.integration.spec.ts`:410;
  rule: `docs/system/server-architecture.md` §Testing — the tier gated by
  `pnpm --filter @warehouser/server test:integration` must be run before completing server work, and
  §Testing → "What this tier cannot test" refuses specs that "would pass without proving anything,
  which is worse than not having them" (noted: that passage is written about concurrency specs, so
  the citation is by analogy; the defect itself is verified arithmetic); problem:
  `isoDateOffsetFromToday` is offset from the file-level `const now = new Date('2026-09-21T10:00:00.000Z')`
  at `:33`, while `readDemandPressure` bands against PostgreSQL's real `now()`
  (`workspace-performance-read.repository.ts`:297, :312-313) — `:605` seeds `needed_by = 2026-09-23`
  and `:628` asserts `dueSoonQuantity: 25`, which holds only while the run date is 2026-09-09…2026-09-23;
  from 2026-09-24 that row is overdue and the assertion fails. A second instance at `:456`/`:476`
  (`needed_by = 2026-11-20`, `laterQuantity: 400`) fails from 2026-11-06; suggested: derive the
  fixtures from the clock the statement reads, as the sibling spec already does —
  `warehouse-demand-coverage.repository.integration.spec.ts`:389 (`fetchTodayDate`) / :381
  (`fetchWeekStart`) — or from `zonedToday` at `:424`, which this same file already uses for its
  boundary cases.

  Verified independently this run: the full integration tier is **green today** — 99 files, 1023
  tests — which is exactly what makes the defect invisible.

- **[advisory] A1 — `.env.example` moves the server's published default port away from what a
  `docs/system` document states** — `apps/server/.env.example`:1-2 (`PORT=3100`,
  `APP_ORIGINS=http://localhost:3200`) against `docs/system/architecture-map.md`:16 ("The web
  development server proxies `/api` requests to the server on port 3001"); rule: `AGENTS.md`
  §"System documentation indexes" (`docs/system` is the durable instruction set, kept current in the
  same change); problem: `apps/web/vite.config.ts` already proxied to 3100 on the merge-base, so the
  document was stale before this branch — but this is the change that makes the server's own default
  disagree with it, and `docs/system` _was_ updated in this branch for the sibling `dev`-script
  change; suggested: correct `architecture-map.md`:16 to 3100. Values are placeholders only, and the
  one new variable (`APP_TIMEZONE=UTC`) is genuinely read by committed code
  (`shared/config/app-timezone.config.ts`:24).

- **[advisory] A2 — a startup configuration refusal throws a bare `Error` instead of a named typed
  factory** — `apps/server/src/shared/config/app-timezone.config.ts`:27; rule:
  `docs/system/guides/server-error-handling.md` §2–§3 and §7 (`pure predicate -> assert(predicate(...),
NamedErrorFactory(...))`; §3 names "a configuration or startup check" as exactly where a named
  `SystemError` factory is raised) and `docs/system/adr/24-07-2026-server-error-handling.md` §Decision;
  problem: `readAppTimezoneConfig` asks its predicate correctly but enforces it with
  `if (!isValidIanaTimezone(...)) throw new Error(...)`, producing an untyped error outside the
  three-category taxonomy; suggested: `assert(isValidIanaTimezone(timezone), invalidAppTimezoneError())`.
  Advisory rather than blocking because the whole `shared/config/` tier already has this shape —
  `shared/config/http-platform.config.ts`:22, :31, :37, :47 predate this change.
  **Reviewer disagreement, recorded:** the A+B reviewer read the same line as the _sanctioned_
  startup-check shape under `server-error-handling.md`:92-94 ("reserve this form for genuine
  invariants") and passed it. The D+E reading is kept because §3 names a startup check as a
  `SystemError` factory site; the disagreement is why this is deferred as a tier-wide item rather
  than closed either way.

- **[advisory] A3 — `OrderFlowPanelRead` carries a `timezone` field the repository never reads from
  the database** — `apps/server/src/shared/domain/repositories/workspace-performance-read.repository.ts`:68
  (returned at `:463`); rule: `docs/system/guides/creating-a-server-repository.md` §"Keep repositories
  isolated and operation-oriented" ("A repository accepts and returns shared TypeORM persistence
  entities and persistence-oriented values only"); problem: `readOrderFlow` echoes its own `timezone`
  argument back into its result, so the field exists only because `openapi.yaml`'s `OrderFlowPanel`
  declares it — and `ReadOrderFlowQuery` then ignores it and composes `timezone: this.timezone` itself
  (`dashboards/usecases/queries/read-order-flow.query.ts`:34, whose comment at `:14` says it is "never
  read back"); suggested: drop `timezone` from `OrderFlowPanelRead` and its return, the shape
  `ArrivalTimingRead` already takes for the same reason (`warehouse-demand-coverage.repository.ts`:225-231).

- **[advisory] A4 — two integration specs assert nothing but what a migration left behind** —
  `apps/server/src/shared/domain/entities/reason-concentration-index.integration.spec.ts`:241 and
  `apps/server/src/shared/domain/entities/dashboard-permission-catalogue.integration.spec.ts`:90;
  rule: `docs/system/guides/adding-a-server-module.md` §3 ("Do not write tests for migrations");
  problem: the first asserts `pg_indexes` holds `idx_purchase_draft_line_rejections_warehouse_reason`
  with the stated column order, the second asserts the `WAREHOUSE_PERFORMANCE:WATCH` row's stored
  `id`/`label`/`kind` — in both cases the migration's DDL/DML is the entire subject, restated as an
  assertion rather than verified by apply/revert/apply; suggested: keep the halves that exercise
  behaviour the schema alone decides (the `enable_seqscan`-off access-path proof at `:248`, the
  `chk_workspace_role_permissions_reserved_exclusive` grant at `:106`, the vocabulary/catalogue parity
  at `:157`) and drop the two restatement cases. Advisory because both specs name the rule in their
  own headers as a deliberate exception and sibling precedent exists (`arrival-inspection-schema`,
  `delivery-address-permissions`).

- **[advisory] A5 — a repository comment names a `rest/mappers/` fold that does not exist** —
  `apps/server/src/shared/domain/repositories/warehouse-purchasing-read.repository.ts`:9 ("The REST
  mapper folds these eight rows back into the two-state/four-band nesting the contract declares");
  rule: `docs/system/server-architecture.md` §"Running the architectural tier" ("a use case composing
  its own result inline is the use case, while a **named** conversion beside its one caller is the
  thing this gate refuses"); problem: the nesting is composed inline in
  `read-purchasing-pipeline.query.ts`:45-56 and there is no `dashboards/rest/mappers/` — which is the
  conforming placement, but a reader following this comment would extract a named mapper into a
  directory the module correctly does not have; suggested: restate as "the query composes these eight
  rows into the contract's nesting".

## Resolution

| Finding                                       | Severity | Resolution                    | Route                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------- | -------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1 — observed Permission gates the whole read | blocking | **Change the rule**           | `/system-docs` — amend `guides/server-request-authorization.md` §Rules with the third narrowing form (refusing a whole projection whose subject spans a Permission conjunction) and cite `docs/features/dashboards/adr/0001-conjunction-gated-panel-reads.md` there, as the guide already cites the other two feature ADRs. Code unchanged. |
| B2 — calendar-dependent fixtures              | blocking | **Fix now**                   | `/implement dashboards` — derive the fixtures from the clock the SQL reads.                                                                                                                                                                                                                                                                 |
| A1 — stale documented port                    | advisory | **Defer**                     | `spec.md` §8                                                                                                                                                                                                                                                                                                                                |
| A2 — bare `Error` in a startup check          | advisory | **Defer** as a tier-wide item | `spec.md` §8 — converting only the new file would leave `shared/config/` internally inconsistent.                                                                                                                                                                                                                                           |
| A3 — dead `timezone` field                    | advisory | **Fix now**                   | `/implement dashboards`                                                                                                                                                                                                                                                                                                                     |
| A4 — migration-only specs                     | advisory | **Defer**                     | `spec.md` §8                                                                                                                                                                                                                                                                                                                                |
| A5 — misleading comment                       | advisory | **Fix now**                   | `/implement dashboards`                                                                                                                                                                                                                                                                                                                     |

## Outcome

The three fix-now findings were implemented and committed on 2026-09-23, each through the RED → GREEN
cycle and the full `test:all` gate.

| Finding | Commit                                                                             | What closed it                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B2      | `test(dashboards): anchor the Demand Pressure fixtures to the real clock`          | `isoDateOffsetFromToday` now derives from `zonedToday('UTC')` through a string `addDays`, so the fixture moves with the clock `(now() AT TIME ZONE $tz)::date` reads. RED was reproduced by shifting the frozen constant two days back — `expected 25 to be +0`, which is what 2026-09-24 would have produced. The frozen `now` is retained: it timestamps `createdAt`/`updatedAt`, which no Urgency Band compares against. |
| A3      | `refactor(dashboards): stop echoing the bound timezone out of the Order Flow read` | `timezone` dropped from `OrderFlowPanelRead` and from `readOrderFlow`'s return. RED was `expect(panel).not.toHaveProperty('timezone')`. The query spec is stronger for it — `panelRead` no longer carries the field, so `toEqual({ timezone, ...panelRead })` now proves `ReadOrderFlowQuery` composes it rather than passing through what the double returned.                                                             |
| A5      | `docs(dashboards): correct the Purchasing Pipeline folding comment`                | The comment now names `ReadPurchasingPipelineQuery`'s inline composition and states why there is deliberately no `dashboards/rest/mappers/`.                                                                                                                                                                                                                                                                                |

**Gate after the fixes:** `lint` (`--max-warnings=0`) clean · `typecheck` clean · `build` clean ·
`test:all` green — unit 152 files / 1980 tests, architectural 7 / 72, integration 99 / 1023.

**B1 and the three deferred advisories remain open**, as resolved above: B1 routes to `/system-docs`
(amend `guides/server-request-authorization.md` and cite the feature ADR), and A1, A2 and A4 are
recorded in `spec.md` §8 with owners and due dates. The verdict stays **CHANGES REQUESTED** until B1
lands, because the code and the guide still disagree — the disagreement is now recorded rather than
unnoticed, which is the only thing this pass changed about it.

No blocking finding was dropped. B1 is resolved by routing to a rule change rather than a code
change; B2 remains open until fixed, which is what sets the verdict.

## Checked and conformant

Recorded so a later reader knows what the manifest actually bought.

- **Module ownership.** `dashboards` is a legitimate owner as a _cohesive business capability_
  (`server-architecture.md`:76, `adding-a-server-module.md`:10): it enforces no Item / Customer Order
  / Purchase Draft / Rejection invariant — it reads across all of them. Splitting the eight Panels
  across the entity modules would hit `adding-a-server-module.md` §Common failures, "Splitting one
  capability across two modules by the scope that invokes it". Both scopes live in one module with
  the scope in the symbol names, which is the `access` precedent §1 prescribes.
- **Boundaries.** `dashboards/module-boundaries.spec.ts` discovers siblings from disk rather than
  hand-enumerating them, scans in both directions, excludes specs, and carries four teeth cases.
  Confirmed by grep: the module imports only `shared/*`, `@warehouser/*` and `auth/auth.module`
  (guard wiring, the same import every other `rest.module.ts` makes); nothing reaches another
  module's `domain/errors/`, `domain/*.predicates.ts` or `rest/dtos/`, and nothing imports
  `dashboards`.
- **Layers and dependency direction.** No query imports TypeORM, a QueryBuilder, an entity, a DTO or
  a controller; no controller touches a repository. None of the eight queries is a pass-through —
  each composes the operation's own contract result type and two hold the conjunction rule.
- **Use-case boundaries.** No wrapped `execute`, no `with*`/interceptor/template method, no timing,
  duration or counter anywhere in the production diff, no `try/catch` re-raising as another type,
  every constructor parameter used.
- **Query and predicate placement.** All eight are one-per-file `*Query` classes in
  `usecases/queries/*.query.ts`; predicates sit in `dashboards/domain/predicates/`, are asked rather
  than assigned, and no hand-written `=== null` exists in the non-spec diff.
- **Repository cohesion and isolation.** `WarehouseDemandCoverageRepository` (2 public methods, one
  statement each) and `WorkspacePerformanceReadRepository` (4 methods sharing the active-Warehouse
  Workspace scope, materialised once at `:116`) are both shaped around a cohesive persistence
  operation, not table-shaped CRUD — `creating-a-server-repository.md` §"Design a specialized
  repository" and its warning against splitting a multi-entity operation. No `private` methods, no
  `DataSource.transaction`/`QueryRunner`/independent boundary (every method takes
  `getEntityManager(this.dataSource)`), no catch/log/wrap of a persistence failure, no import of
  `dashboards/` or `@warehouser/contracts/*`. Module-scope SQL-fragment builders are the `src/shared/`
  exclusion `server-architecture.md` §"Running the architectural tier" names by name.
- **Migrations.** Both are timestamped classes under `apps/server/migrations/` whose `down` genuinely
  reverses its `up`; `1786900100000-GrantDashboardPermissions.ts` is byte-identical to the staged
  `docs/features/dashboards/migrations/02-grant-dashboard-permissions.ts` and follows
  `apps/server/migrations/README.md` §"Extending a Permission catalogue" verbatim, grants-before-
  catalogue-row in `down` for `ON DELETE RESTRICT`. `synchronize: false` unchanged in both
  `shared/database/data-source.ts`:50 and `shared/database/typeorm.options.ts`:14. The seed insert
  uses entity-property keys, avoiding the snake_case `manager.insert` trap.
- **Contracts.** `packages/contracts/src/dashboards/{index.ts,…}`, the `./dashboards` subpath at
  `packages/contracts/package.json`:28-31, every server import through `@warehouser/contracts/dashboards`,
  no package-root import anywhere in `apps/server/src`. All five vocabulary schemas are genuine
  boundary shapes.
- **Validation.** Zod only; no `class-validator`/`class-transformer`. The absent `rest/dtos/` is
  correct — both controllers are bodyless `GET`s taking no query or body parameter, matching
  `ItemsController`'s guard-resolved `:warehouseId`. (Note: `sad.md` §5 still draws a `rest/dtos/`
  directory; the built tree is right and the SAD line is stale.)
- **Authorization.** Each handler composes `SessionAuthGuard` + exactly one level guard with exactly
  one required Permission at the level of the operation's subject; no query injects
  `AccessCurrentUserRepository`; every observed Permission a query reads is declared on its handler
  and vice versa; both `*-http-contract.integration.spec.ts` files cover the guide's full Verify list
  including both directions of `@ArchivedTolerantRead()` and both sides of every observed Permission.
  The _mechanism_ is conformant throughout — B1 is about what the query then does with the set.
- **Logging and telemetry.** No `console.*`, no ad-hoc logger, no logger injected into a use case,
  no tracing/metrics/collector dependency, and no measurement of any kind in production code.
- **Gates run this review:** `test:architectural` 7 files / 72 tests green;
  `test:integration` 99 files / 1023 tests green; `sync-references.sh --check` in sync (42 files).

## Observations (not findings)

- **Feature-artifact dead link.** `docs/features/dashboards/data-model.md`:505 and
  `tasks/reason-concentration-index-migration.md`:8,34 link
  `./migrations/01-add-reason-concentration-index.ts`, which no longer exists on disk; the `02`
  staged file was kept. No `docs/system` rule governs feature-artifact links, so this is not a
  finding — but it will mislead the next reader.
- **`sad.md` §5 drift.** The server tree in the SAD draws `rest/dtos/` "createZodDto adapters over
  the contracts subpath". No such directory was built, correctly, because no handler takes a body or
  query parameter. §5 already carries one amendment note of this kind; a second would keep it honest.
- **The architectural tier documents three rules and ships five.** `server-architecture.md`
  §"Running the architectural tier" describes mapper, query and predicate placement;
  `src/test/architectural/` also holds `construction-shape.architectural.spec.ts` and
  `entity-registry.architectural.spec.ts`. Pre-existing and untouched by this branch, so out of
  scope — recorded for whoever next edits that section.

# Frontend conformance review — dashboards

Date: 2026-09-22
Work item: feature `dashboards` (`docs/features/dashboards`), `.size` = `L`, `.route` = `full`
Reviewer: `code-review-front-end` — three clean-context `reviewer` workers (reasoning tier, effort `xhigh`), one per dimension-group cluster, merged here
Verdict: **CHANGES REQUESTED** — 11 blocking, 5 advisory; every finding resolved _fix now_ and **applied**. See § Resolution and § Outcome.

## Diff scope

Branch `28-dashboards-analytics`, base `8632cf8b2dd9e0c887a702d690f27bbf86346250` (branch point off `master`), 28 commits.

`git diff 8632cf8b2dd9e0c887a702d690f27bbf86346250..HEAD -- apps/web packages/contracts` — 83 files, +9951 / −149.

| Area                                                              | Files |
| ----------------------------------------------------------------- | ----- |
| `apps/web/src/shared/`                                            | 20    |
| `apps/web/src/modules/warehouse/`                                 | 19    |
| `apps/web/src/modules/workspace-dashboard/`                       | 16    |
| `apps/web/src/test/`                                              | 10    |
| `packages/contracts/src/dashboards/` (+ `package.json`)           | 7     |
| `apps/web/src` root (`i18n.ts`, `router.ts`, `vite.config.ts`, …) | 7     |
| `apps/web/public/locales/{en,uk}/`                                | 4     |

`apps/server` also changed (48 files) and is **out of scope here** — it belongs to
`/code-review-back-end`. `packages/contracts` was judged only for how `apps/web` declares and
consumes the schema; the server-side DTO adaptation was not reviewed.

**Crossover observation.** `docs/system/server-architecture.md` is edited on this branch (+6/−0).
No web-governing document was changed, so that edit is `/code-review-back-end`'s to judge.

## Document manifest

`docs/system/web-index.md` was read in full this run and is authoritative. Paths below are relative
to `docs/system/`.

**Floor (always read)**

- `frontend-architecture.md`
- `architecture-map.md`
- `sad.md` — read because the change crosses out of `apps/web`
- `adr/27-08-2026-heroui-table-for-web-data-tables.md` — Accepted
- `adr/27-08-2026-reducer-driven-action-dialogs.md` — Accepted
- `adr/19-08-2026-declarative-permission-gates.md` — Accepted
- `adr/19-08-2026-generated-mutation-hooks-in-components.md` — Accepted
- `adr/18-08-2026-scope-of-exercise-placement-tiebreak.md` — Accepted
- `adr/02-08-2026-rtk-query-for-web-api-calls.md` — Accepted
- `adr/27-07-2026-bundled-centralized-web-translations.md` — Accepted
- `adr/12-07-2026-schema-validation-with-zod.md` — Accepted
- `adr/11-09-2026-oxlint-replaces-eslint.md` — Accepted
- `adr/14-08-2026-domain-owned-flat-modules.md` — **Superseded**; read for reasoning only, never cited as the rule

**Selected by the changed paths**

- `guides/adding-a-web-module.md` — new module, two new routes, `router.ts`, loaders
- `guides/placing-web-components.md` — 11 new component files in two `components/` trees
- `guides/writing-web-components.md` — every new component
- `guides/writing-web-conditional-components.md` — conditional rendering in the Panels
- `guides/placing-web-hooks.md` — `utils/iso-week-number.ts`, `shared/utils/chart-scale.ts`, `usePanelBodies`
- `guides/placing-web-tests.md` — 20 new specs, two new `src/test/` gate directories
- `guides/web-error-handling.md` — loader failure paths, denial copy
- `guides/adding-and-maintaining-web-localization.md` — new `dashboard` namespace, both locales
- `guides/heroui-design-principles.md` — `shared/components/charts/`, `global.css` tokens
- `guides/heroui-react-v3-docs-index.md` — resolved `card.mdx`, `typography.mdx`, `composition.mdx` before judging API usage
- `guides/adding-and-using-contracts.md` — `packages/contracts/src/dashboards/`
- `guides/web-motion.md` — checked; nothing animated

**Deliberately not selected, with reason**

- `guides/web-dialogs.md`, `guides/web-action-dialogs.md` — no `Modal.*`, `AlertDialog.*`,
  `FormModalDialog`, `ConfirmAlertDialog` or `useActionDialog` anywhere in the diff (confirmed by
  two reviewers independently).
- `guides/linting-with-oxlint.md` — no lint-configuration change and no `oxlint-disable` /
  `eslint-disable` comment added.

**Read as context, never as the rule**

`docs/features/dashboards/sad.md`, `spec.md` §6, `design-handoff.md`, `CONTEXT.md`, and the two
Accepted feature ADRs `adr/0001-conjunction-gated-panel-reads.md`,
`adr/0002-charting-without-a-charting-dependency.md`.

**Selector-map agreement.** `references/web-manifest.md` agreed with the index on every path this
diff touches. No correction is needed.

## Findings

### Blocking

- **[blocking] No dashboard endpoint has a subscriber, so every Panel is evicted 60s after the loader fills it** — `apps/web/src/modules/warehouse/components/dashboard/WarehouseDashboardGrid.tsx`:69-88 and `apps/web/src/modules/workspace-dashboard/components/WorkspaceDashboardGrid.tsx`:65-82; rule: `docs/system/frontend-architecture.md` §Redux Toolkit infrastructure ("React workflows use generated hooks; guards and other non-React workflows dispatch the same endpoint's `initiate` thunk and await `unwrap()`"); problem: the loaders dispatch `{ subscribe: false }` — correct, and what every other loader in the tree does — but the destinations then read `endpoints.X.select(arg)(state).data` inside `useAppSelector` instead of mounting a generated hook, so the cache entries hold zero subscribers for their whole life and no `keepUnusedDataFor` is declared. The repository documents this exact failure in its own gate at `apps/web/src/test/route-readiness/route-readiness.spec.tsx`:917-927: force-mounting each panel's query hook "is what gives each admitted tab's own query hook a mount on first paint, and with it the subscription that retains the entry for the destination's lifetime." Neither dashboard module has a `hooks/queries/` directory; the only mounted query hook in either is the pre-existing `useGetWorkspaceContextQuery` in `modules/warehouse/hooks/effects/useRecordWarehouseEntry.ts`:30, on a different endpoint; suggested: mount the generated `use<Endpoint>Query` hook per Panel, the loader having already filled the entry.

- **[blocking] A permitted actor whose Panel read failed reaches no error arm** — `apps/web/src/modules/warehouse/components/dashboard/WarehouseDashboardGrid.tsx`:132-137 and :173-175; same shape at `apps/web/src/modules/workspace-dashboard/components/WorkspaceDashboardGrid.tsx`:129-134 and :168-170; rule: `docs/system/frontend-architecture.md` §Page ("error, empty and success stay with the narrowest component that can coordinate them, so a permitted actor whose read failed still reaches that component's own error arm rather than an empty surface"); problem: the loaders dispatch without `unwrap()`, so a rejected read resolves and never reaches the route's `errorComponent`; the entry then holds `error` with `data: undefined`, and `cellFor` treats `body === undefined` as "not permitted" and drops the cell. A member holding `REJECTIONS:WATCH` whose Reason Concentration read 500s sees no trace of that Panel; if every read fails they are told their role "does not admit them" (`apps/web/public/locales/en/dashboard.json`, `warehouse.denial`), which is a false statement about their authority. No grid or loader spec exercises a failed read; suggested: keep the entry's `error`/`isError` beside its `data` and give each Panel cell its own translated error arm, so only an unadmitted Panel is absent.

- **[blocking] The denial-versus-grid choice is inferred from cache contents instead of read from the Permission** — `apps/web/src/modules/workspace-dashboard/components/WorkspaceDashboardGrid.tsx`:168-170 and `apps/web/src/modules/warehouse/components/dashboard/WarehouseDashboardGrid.tsx`:173-175; rule: `docs/system/adr/19-08-2026-declarative-permission-gates.md` §Decision 3 ("the choice between **two whole surfaces** … the Permission is read with `useHasPermission` / `useHasWorkspacePermission` **at the component that uses it**") and §Decision 1; problem: `cells.length === 0` is the only test either grid applies, and both files state they read no Permission at all. ADR 0001 ("absence is produced by not asking") may narrow a system rule, not replace its mechanism — and the Workspace surface needs no conjunction: all four Panels are admitted by the single `WorkspacePermissionId.WAREHOUSE_PERFORMANCE_WATCH`, which `WorkspacePermissionGate` expresses exactly. Because the proxy conflates "unadmitted", "failed" and "evicted", the two findings above both surface as the denial; suggested: read the admitting Permission in the grid and return the denial from that read alone, leaving body presence to decide only success versus error.

- **[blocking] Three Panels and `HeatGrid` assemble `<table>` markup of their own** — `apps/web/src/modules/warehouse/components/dashboard/CoverageGapPanel.tsx`:153, `apps/web/src/modules/warehouse/components/dashboard/ReasonConcentrationPanel.tsx`:115, `apps/web/src/modules/workspace-dashboard/components/DemandPressurePanel.tsx`:102, `apps/web/src/shared/components/charts/HeatGrid.tsx`:56-85; rule: `docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md` §Decision, restated in `docs/system/guides/heroui-design-principles.md` §3 "Tabular data is `Table`, not markup"; problem: each renders a collection of records keyed by an id (`itemId`, `rejectionReasonId`, `warehouseId`) as hand-written markup with per-cell layout classes — `text-right tabular-nums text-foreground` four times in `CoverageGapPanel.tsx`:216-227, `h-[18px]`/`h-[22px]` row heights — which reproduces two of the four costs the ADR set out to remove. See § Adjudication; suggested: `Table` + `Table.Content` / `Table.Header` / `Table.Column` / `Table.Body` / `Table.Row` / `Table.Cell`, first column `isRowHeader`, the bar mark as one cell's content, and the row body a component rather than an inline expression (ADR rule 2). Specs query the roles React Aria exposes.

- **[blocking] `modules/workspace-dashboard` is a second top-level module for the Workspace, named for a view** — `apps/web/src/modules/workspace-dashboard/route.tsx`:34, justification at `apps/web/src/test/module-boundaries/module-surface.ts`:122-131; rule: `docs/system/guides/adding-a-web-module.md` §1 "Choose the owner" ("Name the module for the domain entity that owns the behavior … not the screen or URL that consumes it"; "Extend an existing owner instead of adding a second module for the same entity. A capability exercised at several scopes lives in one module and carries the views for every scope; the scope appears in file and component names … never in a second module"); problem: the Dashboard capability is split across `modules/warehouse` and a new module whose name is a UI surface — `CONTEXT.md`:27 defines Workspace Dashboard as "A Workspace-level view" — beside the existing `modules/workspace`. The recorded reason, "a module has exactly one `route.tsx` and one `page.tsx`", is contradicted by the same §1 ("`modules/auth/` holds `login/`, `sign-up/` and `sign-out/` sub-trees and is still one module"); `modules/auth` carries two `route.tsx`/`page.tsx` pairs today (`modules/auth/login/`, `modules/auth/sign-up/`), verified. The ADR clause cited promotes a second **domain entity**, not a second view of one that already has a module; suggested: a `modules/workspace/dashboard/{route,page}.tsx` sub-tree with components under `modules/workspace/components/dashboard/`, and a second route entry in `MODULE_SURFACE['workspace']`.

- **[blocking] The four Warehouse Panels sit flat beside their exclusive owner** — `apps/web/src/modules/warehouse/components/dashboard/WarehouseDashboardGrid.tsx`:9-12; rule: `docs/system/guides/placing-web-components.md` § "The nesting rule"; problem: those four imports are the Panels' only production importers, so the grid owns them and the rule requires them "one level down, inside a `components/` directory named after the owner". The recorded justification cites § "Grouping owned components by domain", which governs sub-grouping **inside** an owner's already-nested `components/` directory and grants no exemption from the nesting rule — whose only stated exceptions are more than one consumer and a declared public surface, neither of which holds; suggested: move the four Panels and their specs to `components/dashboard/components/`.

- **[blocking] The four Workspace Panels sit flat at the module `components/` root beside their exclusive owner** — `apps/web/src/modules/workspace-dashboard/components/WorkspaceDashboardGrid.tsx`:9-12; rule: `docs/system/guides/placing-web-components.md` § "The nesting rule"; problem: `DemandPressurePanel`, `OrderFlowPanel`, `PurchasingSpreadPanel` and `ReceiptReliabilityPanel` are rendered only by the grid and imported by nothing else, yet are its unnested siblings; suggested: nest them under the grid, specs moving with them, as part of the module move above.

- **[blocking] `usePanelBodies` is a server-state hook declared inside a component file** — `apps/web/src/modules/warehouse/components/dashboard/WarehouseDashboardGrid.tsx`:69 and `apps/web/src/modules/workspace-dashboard/components/WorkspaceDashboardGrid.tsx`:65; rule: `docs/system/guides/placing-web-hooks.md` §1 "One hook per file, named after the file" and §2 (`queries/` — "Reads server state. An RTK Query binding plus the gating it owns"); problem: each grid declares a hook reading four RTK Query cache entries in the component file; `writing-web-components.md` §1's private-helper carve-out is for a render helper, not a hook; suggested: `modules/<module>/hooks/queries/usePanelBodies.ts` with its spec colocated (§5).

- **[blocking] `StackedBarRow` is promoted to `shared/components/` with zero production consumers** — `apps/web/src/shared/components/charts/StackedBarRow.tsx`:30; rule: `docs/system/frontend-architecture.md` §Source structure (`shared/components/ # reused by at least two modules`) and §Components, plus `docs/system/guides/writing-web-components.md` §9 ("A prop, mode, or view no caller uses is not flexibility; it is a permanently untested path"); problem: no production file imports it — the only references in `src/` are prose comments in `CoverageGapPanel.tsx`:38, `PurchasingPipelinePanel.tsx`:24 and `DemandPressurePanel.tsx`:23 explaining why it is _not_ used; suggested: delete `StackedBarRow.tsx` and its spec.

- **[blocking] Three chart primitives promoted to `shared/` with one consuming module each** — `apps/web/src/shared/components/charts/ColumnPlot.tsx`:37 (only `modules/warehouse`), `apps/web/src/shared/components/charts/BubblePlot.tsx`:42 and `apps/web/src/shared/components/charts/HeatGrid.tsx`:55 (only `modules/workspace-dashboard`); rule: `docs/system/frontend-architecture.md` §Source structure ("Promote it to `shared/` only when reuse exists") and `docs/system/guides/adding-a-web-module.md` § Common failures ("Moving single-feature code to `shared/` before it has another consumer"); problem: the feature `sad.md`'s own stated test ("two modules consume them") is met by `PanelCard`, `ChartLegend`, `PanelFootnote` and `chart-scale.ts` — verified at 8, 6 and 6 importers across both modules — but not by these three; suggested: keep each inside its single owning module's `components/` tree until a second module needs it.

- **[blocking] `isoWeekNumber` is implemented twice, in two modules** — `apps/web/src/modules/workspace-dashboard/components/OrderFlowPanel.tsx`:56 duplicates `apps/web/src/modules/warehouse/utils/iso-week-number.ts`; rule: `docs/system/frontend-architecture.md` §Source structure ("a generic helper several modules use is shared"; a file that declares no hook belongs in a `utils/` directory) and `docs/system/guides/placing-web-hooks.md` §3; problem: the warehouse copy's header asserts "it has one consumer today" — no longer true — and the two differ materially: `parseDate` with UTC anchoring and a Monday-only input contract versus a raw `new Date`/`setUTCDate` walk accepting any date; the duplicate also sits in a component file rather than a `utils/` one; suggested: promote one implementation to `shared/utils/iso-week-number.ts` with its spec, have both Panels read it, and drop the stale comments.

### Advisory

- **[advisory] Each grid keeps a private denial component that reads its own translations** — `apps/web/src/modules/warehouse/components/dashboard/WarehouseDashboardGrid.tsx`:106 and `apps/web/src/modules/workspace-dashboard/components/WorkspaceDashboardGrid.tsx`:103; rule: `docs/system/guides/writing-web-components.md` §1; problem: §1 requires a private helper to move into its own file "as soon as … it grows its own state, effects, or data access", and each denial calls `useTranslation('dashboard')` — unlike the precedent §1 names, `DatasetCard`'s `DatasetMessage`, which is props-in and calls no hook; suggested: give each denial its own file under the grid's owned `components/` directory, spec beside it.

- **[advisory] Responsive behaviour expressed as props no production caller passes** — `apps/web/src/modules/workspace-dashboard/components/OrderFlowPanel.tsx`:91 (`variant`) and `apps/web/src/modules/workspace-dashboard/components/ReceiptReliabilityPanel.tsx`:95 (`maxRadius`); rule: `docs/system/guides/writing-web-components.md` §9 "Delete dead branches" and `docs/system/guides/heroui-design-principles.md` §4; problem: `WorkspaceDashboardGrid.tsx`:157 and :163 pass only `panel`, so the mobile column width, the every-third-week labelling and the 12-unit radius exist only in their own specs; the sibling `ArrivalTimingPanel.tsx`:121-124 solves the same requirement with a `hidden sm:inline` / `sm:hidden` breakpoint pair; suggested: express the variants in CSS breakpoints and remove both props.

- **[advisory] Three further never-exercised surfaces in the new shared primitives** — `apps/web/src/shared/components/charts/PanelCard.tsx`:16 (`scrollable`, passed only by its own spec), `apps/web/src/shared/components/charts/ColumnPlot.tsx`:16 and :82-88 (`ColumnPlotBucket.label` and the label row it feeds — its only caller passes `label: ''`), `apps/web/src/shared/utils/chart-scale.ts`:37 (`bucketOffset`, referenced only by its own spec); rule: `docs/system/guides/writing-web-components.md` §9 and `docs/system/frontend-architecture.md` §Source structure; suggested: remove them and their spec cases until a caller exists.

- **[advisory] `HeatGridCell.columnLabel` is required of every caller and read by nothing** — `apps/web/src/shared/components/charts/HeatGrid.tsx`:8; rule: `docs/system/guides/writing-web-components.md` §9; problem: `PurchasingSpreadPanel.tsx`:81 computes and supplies it per cell, but `HeatGrid` renders its column heads from its own `columns` prop and never reads the field; suggested: remove it.

- **[advisory] `WorkspaceDashboardGrid` has no colocated spec** — `apps/web/src/modules/workspace-dashboard/components/WorkspaceDashboardGrid.tsx`:146; rule: `docs/system/frontend-architecture.md` §Testing ("Colocate component … tests with their owner") and `docs/system/guides/placing-web-tests.md` §1–§2; problem: the four sibling Panels each have one and `modules/warehouse`'s equivalent grid has `WarehouseDashboardGrid.spec.tsx`; the denial arm and the `xl:col-span-2` reflow are exercised only from `page.spec.tsx`, one level above the subject; suggested: add the spec beside it and list it in `WORKSPACE_DASHBOARD_MODULE_MANIFEST`.

## Adjudication — the hand-assembled `<table>`

The system ADR's Decision is two independent clauses, the second unqualified: "A collection of
records is presented with HeroUI's `Table`. **A feature file does not assemble `<table>`,
`<thead>`, `<tbody>`, `<tr>` or `<td>` markup of its own**, and does not hand-roll a disclosure over
rows." `web-index.md` restates it as the decision that governs how a collection of records is
presented. Nothing in it conditions on interactivity, expansion or sorting.

The Panels' comments assert the ADR "requires HeroUI's `Table` of a **data table** — a collection of
records a member browses, expands and sorts". That sentence appears in no system document, and the
ADR refutes it: it converted `ItemDirectory`, a flat six-column table with no disclosure and no
nesting, on the same terms as Demand ("Items is the same structure without the nesting"). A Coverage
Gap Panel of Item, a bar, On hand, On order, Uncovered and Total — five of six columns being figures
keyed by `itemId` — is that same shape.

The rationale reaches it too. The three rules the ADR says "follow from the collection model" are
consequences of using `Table`, not preconditions for the rule applying; and two of the four costs the
ADR set out to remove are reproduced here verbatim — layout leaking into every cell, and density and
borders as class strings rather than `@heroui/styles` tokens. The `treegrid` role the comments lean
on is the ADR's own **accepted cost** ("The ARIA role changes … a test that found the old markup with
`getByRole('table')` … must query the roles React Aria actually exposes"), not an escape hatch it
grants.

On precedence: ADR 0002's "a row-oriented Panel can be a real `<table>` because nothing else owns its
DOM" permits markup an Accepted system ADR forbids. That is loosening, not narrowing, and a feature
ADR may not do it (`_shared/system-conformance.md` §3). Three facts confirm the authority was never
there: the sentence sits in ADR 0002's **Consequences**, not its Decision outcome (which is "no
charting dependency" and nothing else); the feature `sad.md` §2 constraints table does not name the
Table ADR at all; and `sad.md`'s single recorded "Proposed deviation" covers the `--chart-*` tokens
only — the `<table>` was never recorded as a deviation anywhere.

**Verdict: blocking.** Resolved _fix now_.

## What was checked and found conformant

- **Contracts, end to end.** Module directory, barrel matching every sibling module, the `./dashboards` subpath in `packages/contracts/package.json`, consumption only via `@warehouser/contracts/dashboards`, no root import, no schema duplicated in `apps/web`; `apps/web/vite.config.ts`:26-29 and :67-70 carry **both** required alias entries.
- **RTK Query boundary.** Both api slices `injectEndpoints` on the shared `api` with the shared base query and supply the contract Zod schema through `extraOptions.schema`. No second fetch path, no promise-based API function. No mutation in the diff, so no `mutation-actions.ts`, `transformErrorResponse` or tag obligation arises.
- **Loaders.** Both dispatch `initiate` and decide no access — they read the verdict `guards/warehouse-entry.guard.ts` already published — import no page and no component, and reach no other module past its surface.
- **Module boundaries.** No import crosses a boundary outside `MODULE_SURFACE`.
- **Routes.** Both wire a module-owned loader with `errorComponent`; the Warehouse route inherits `pendingComponent` from `routes/warehouse.route.tsx`:43. No Panel declares a spinner, skeleton or readiness branch.
- **Branching.** No `if` with an `else`, no ternary or `&&` choosing between elements (`OrderFlowPanel.tsx`:169 uses `Conditional`), no inline JSX arrow handler, no prop drilled past one hop. The two Panel-body lookups are the total `Record<State, …>` shape `writing-web-components.md` §6 prescribes.
- **Tokens.** The ten `--chart-*` variables redeclare no HeroUI variable; `--chart-track`/`--chart-grid` alias `var(--surface-secondary)`/`var(--separator)` rather than restating hex; both selector groups declared; mirrored in `docs/mockups/app.pen` per `design-handoff.md` § Tokens and recorded as a deviation in `sad.md`.
- **Localization.** `dashboard` registered in `src/i18n.ts`:12; 73 leaf keys in each locale with zero asymmetry and no literal dotted keys; `src/test/locale-baseline.json` regenerated (148 additions, 0 removals, 0 changed values) rather than hand-reconciled; the one `common.json` addition, `nav.administration`, is shared sidebar copy beside `nav.dashboard` and `nav.items`, not module copy parked in `common`.
- **Motion.** Nothing animated, and nothing should be: `shared/layouts/RoutedContent.tsx`:32 already calls `useContentTransition(pathname)` for the whole outlet, so both destinations inherit the shared 200ms `ease-out` and its reduced-motion guard.
- **HeroUI composition.** `PanelCard.tsx`:36-51 composes `Card` / `Card.Header` / `Card.Title` / `Card.Description` / `Card.Content` as `card.mdx` documents, and `Card.Title`'s `render` prop is real (`DOMRenderProps.render`). No hand-written BEM string, no invented `@warehouser/ui` import.
- **No charting dependency.** `apps/web/package.json` unchanged; no second styling system; HeroUI ships `Meter`/`ProgressBar` (single-value indicators), not a stacked-series, gridded or scatter primitive, so no `charts/` primitive re-implements one. `src/test/no-charting-dependency/no-charting-dependency.spec.ts` is correctly placed as a dedicated structural gate.
- **Test placement.** `placing-web-tests.md` §§1/3/4 satisfied: `dashboard-fixtures.ts` has eight consumers so it belongs at the `src/test/` root, and both new gate directories are dedicated and state their reason.
- **No dialogs.** Confirmed independently by two reviewers.

## Reviewer corrections applied

- Reviewer 1 reported `HeatGrid` as having a single consuming module. An initial check by the merging reviewer appeared to contradict this; re-checking showed the second "importer" was two prose comments in `PurchasingPipelinePanel.tsx` (lines 28 and 76), not an import. Reviewer 1 and reviewer 3 were correct, and `HeatGrid` is included in the single-consumer finding.
- Reviewers 1 and 3 both reported the `StackedBarRow`, dead-prop and single-consumer-promotion findings; they are merged here once each, at the higher of the two severities.

## Resolution

| #     | Finding                                       | Resolution                                                                                                      |
| ----- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1     | No subscriber → 60s eviction                  | **Fix now** — mount the generated `use<Endpoint>Query` hooks (user's choice over `keepUnusedDataFor: Infinity`) |
| 2     | No error arm for a failed Panel read          | **Fix now**                                                                                                     |
| 3     | Denial inferred from cache emptiness          | **Fix now**                                                                                                     |
| 4     | Hand-assembled `<table>`                      | **Fix now** — convert to HeroUI `Table` (user chose this over amending the system ADR)                          |
| 5     | `modules/workspace-dashboard` placement       | **Fix now** — fold into `modules/workspace` as a `dashboard/` sub-tree                                          |
| 6     | Warehouse Panels not nested                   | **Fix now**                                                                                                     |
| 7     | Workspace Panels not nested                   | **Fix now**                                                                                                     |
| 8     | `usePanelBodies` in a component file          | **Fix now**                                                                                                     |
| 9     | `StackedBarRow` unused                        | **Fix now** — delete                                                                                            |
| 10    | Three primitives single-consumer in `shared/` | **Fix now** — un-promote                                                                                        |
| 11    | `isoWeekNumber` duplicated                    | **Fix now** — one implementation in `shared/utils/`                                                             |
| A1–A5 | All five advisories                           | **Fix now**                                                                                                     |

Findings 1, 4, 5 and the advisory batch were put to the user and resolved _fix now_. Findings 2 and
3 were **not** separately put to the user: they belong to the same data cluster as finding 1, their
conforming shape is determined by the cited rules rather than by a choice, and deferring them would
ship a surface that misstates a member's authority. Recorded as the merging reviewer's call.

No blocking finding is open. Every fix goes back through the same TDD gate `implement` uses.

## Next

`/implement dashboards` for the fixes (no `/clear` — stay in context), then re-run
`/code-review-front-end dashboards` over the changed surface. `apps/server` changed on this branch,
so `/code-review-back-end dashboards` is still owed regardless of this verdict.

## Outcome

Every finding was fixed and committed on `28-dashboards-analytics` between
`d268d716` and `2c5aede1` — twelve commits, 84 files, +3094 / −1706 over
`apps/web`. Each ran the full gate before it was committed
(`lint` at `--max-warnings=0`, `build`, `test`, `test:architectural`), and the
repository's Git hooks ran on every one; none was bypassed.

Final gate: **219 spec files / 1814 unit tests, 10 files / 39 architectural
tests, lint and build clean.**

| #          | Finding                                                         | Commit                                         |
| ---------- | --------------------------------------------------------------- | ---------------------------------------------- |
| 5, 7       | Module placement; Workspace Panels nested                       | `d268d716`                                     |
| 6          | Warehouse Panels nested                                         | `dc4d4abb`                                     |
| 9          | `StackedBarRow` deleted                                         | `91f85c60`                                     |
| 10         | Three primitives un-promoted                                    | `8e6037a2`                                     |
| 11         | One `isoWeekNumber`, with its first spec                        | `5883c04f`                                     |
| 4          | Four surfaces on HeroUI `Table`                                 | `1f587918`, `30464a1c`, `9cc6d989`, `10960f86` |
| 1, 2, 3, 8 | Subscription, error arm, Permission-read denial, hook placement | `e1e30e3d`                                     |
| A1–A4      | Denials extracted; dead surfaces removed                        | `22ddd85f`                                     |
| A5         | `WorkspaceDashboardGrid.spec.tsx`                               | `2c5aede1`                                     |

### What the fixes turned up that the review had not

- **Mounting the query hooks cost a second read per Panel** until `forceRefetch`
  moved from the endpoint to the loader's dispatch. Measured: the entry read
  shape went 5 → 9 → 5 against `spec.md` §6's "≤ 1 round trip per chart". The
  endpoint's own comment had argued for declaring it there; that reasoning
  predates the destination needing a subscriber at all.
- **Converting to `Table` gives every row and cell roving focus** — 84 focusable
  elements in one Panel — which contradicts `design-handoff.md` § Accessibility's
  "takes no focus beyond the shell's own navigation". The system ADR outranks the
  design artifact and records roving focus as an accepted cost; the requester
  confirmed accepting it. **`design-handoff.md` § Accessibility now needs
  revising**, and that is outstanding.
- **Two design behaviours were never wired up.** `PanelCard.scrollable` (the
  cramped-Panel internal scroll) and `ReceiptReliabilityPanel.maxRadius` (the
  mobile r ≤ 12 ceiling) were props no production caller passed, so each was
  asserted by a spec against a rendering the application could not produce. Both
  are in `design-handoff.md` § Responsive behavior. Removing the props makes the
  gap visible rather than burying it; **both remain unimplemented**.
- **Two pre-existing `shared/` files fail the cross-module rule** —
  `DatasetCard.tsx` and `shared/utils/translation-key.ts`, each consumed only
  from `modules/access`. Named as exceptions in
  `test/architectural/promotion.architectural.spec.ts` so the list can only
  shrink, and left for the deliberate change ADR 14-08 §Consequences requires
  rather than fixed opportunistically here.

### Gates added or strengthened

- `test/architectural/promotion.architectural.spec.ts` — new. What `shared/`
  may hold: every file has a production consumer, and no file's consumers all
  sit in one module. `no-orphan-modules` could not see either case, because a
  dead component imports React and its own spec imports it.
- `directory-placement.architectural.spec.ts` — the loader pattern admits a
  module sub-tree's own `loaders/`, with a control case proving it still
  refuses one under a layer directory.
- `loader-permission-parity.spec.ts` — the eight Panel reads stop being
  `loader-only`; each now has a second declaration the gate reconciles against
  its loader. Its argument splitter is bracket-aware so a conjunction can stay
  an inline array in the surface's own file, with a control case.
- Both Dashboards gained an eviction case and a failed-read case. Both were
  proven to fail against the pre-fix implementation before being kept.

### Unrelated observation

`src/modules/auth/sign-up/components/SignUpForm.spec.tsx` failed once during
this work and passed on every rerun, including three consecutive full-suite
runs. It is untouched by this change; recorded as a pre-existing intermittent
failure rather than investigated here.

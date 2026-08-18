<!-- Written by `plan-tests` for work item `change-request:refactor-warehouse-components`. -->
<!-- Size L / route `full` → a separate file, per `_shared/size-matrix.md`. -->
<!-- Levels are generic. No runner, bundler, diff or load tool is named: the real commands live in -->
<!-- sad.md §10 and are detected against the repository by `implement`. -->

---

status: Draft
owner: 'YuriiH'
reviewers: ['Tech Lead']
updated_at: '2026-08-18'
feature_size: 'L'
work_item: 'change-request:refactor-warehouse-components'
baseline_revision: '42f1205d552f8284f8ec57358ad9022340b5f76e'

---

# Test plan — change-request: refactor-warehouse-components

Twenty-two files move from `modules/warehouse` to `modules/workspace`, two components split into
seven, `shared/api` gains four domain directories, and the governing ADR is superseded — with **no
observable behavior change**. Every row below therefore proves one of two things: that a structural
rule now holds, or that something that held at `baseline_revision` still holds. Nothing in this plan
asserts new behavior, because this request has no criterion for any.

## Levels

| Level             | Scope                                                                                                                                                                                                                | Strategy (generic — no tool names)                                                                                                                                                              |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit              | Pure logic with no external dependency — including **static source analysis**: file manifests, the import graph, exported-surface inventories, case inventories, documentation status scans, tree digests.           | In-memory over source read from the tree. The dominant level here: a placement rule is pure logic over file content. Follows the repository's existing static-scan pattern.                     |
| Component         | A moved or split web component exercised in isolation — props/state → rendered output, gating and interactions.                                                                                                      | Render in a component harness against the registered locale namespaces; assert output and behavior, no full app boot.                                                                           |
| Integration       | A suite run against a real dependency it owns — here, only the server suite CR-RG-06 pins as known-red.                                                                                                              | An ephemeral real database created for the run and dropped after. Never a mocked store (sad.md §10). If it cannot run, the row is **blocked**, not passed.                                      |
| E2E-through-UI    | The Workspace administration surface driven through the rendered UI at both pinned widths.                                                                                                                           | Manual verification at ship per the repository's `run` practice (sad.md §10). Not an automated suite — recorded because it is the only tier that sees the composed screen and real focus order. |
| Contract          | <!-- N/A: no participant boundary changes. `apps/server` and `packages/contracts` are byte-identical (sad.md §7.2), which CR-RG-07 proves directly; there is no shape for two sides to re-agree. -->                 |                                                                                                                                                                                                 |
| E2E               | <!-- N/A: a behavior-preserving refactor adds no flow. The composed surface is covered by the component tier plus the manual through-the-UI verification. -->                                                        |                                                                                                                                                                                                 |
| Visual-regression | <!-- N/A: no baseline-image harness exists in the repository, and standing one up is test surface beyond the moved code. CR-RG-01's expectation-identity rule plus the component tier cover the rendered result. --> |                                                                                                                                                                                                 |
| Load              | <!-- N/A: no numeric runtime NFR — the change adds no runtime behavior. See § NFR validation (load). -->                                                                                                             |                                                                                                                                                                                                 |

## AC coverage

Every `CR-AC-*` in `spec.md` §5 and every `CR-RG-*` boundary in §5.1 maps to at least one row.
Clauses no static check can decide are **not** dropped — they are carried to
[§ Review gates](#review-gates), which is itself a required outcome recorded in the pull request.

### §5 — Acceptance criteria

| AC       | Test name (intent-based)                                                    | Level     | Expected outcome                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------- | --------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CR-AC-01 | `the workspace manifest lists exactly the post-move file set`               | unit      | The manifest matches the §5.1 enumeration exactly; an unlisted file present or a listed file missing both fail, naming the file.                                                                                                                                                                                                                                                                                                                                                                  |
| CR-AC-01 | `no moved file resolves under the warehouse module`                         | unit      | None of the 13 CH-W1 or 9 CH-W2 files is reachable at a `modules/warehouse/` path.                                                                                                                                                                                                                                                                                                                                                                                                                |
| CR-AC-01 | `the warehouse module retains exactly its six files`                        | unit      | Six files, both colocated specs among them — neither deleted nor relocated. A seventh or a fifth fails and names the difference.                                                                                                                                                                                                                                                                                                                                                                  |
| CR-AC-02 | `every production import resolves through a declared module surface`        | unit      | The boundary gate passes over the production import graph, with specs still outside its scan scope.                                                                                                                                                                                                                                                                                                                                                                                               |
| CR-AC-02 | `the boundary gate passes with an empty exception list`                     | unit      | Zero per-file exceptions. A single exception added to admit an import is an abort, not a finding.                                                                                                                                                                                                                                                                                                                                                                                                 |
| CR-AC-02 | `the warehouse surface declares no warehouses-tab entry`                    | unit      | The warehouse surface drops to two entries; each remaining entry is required by a real importer.                                                                                                                                                                                                                                                                                                                                                                                                  |
| CR-AC-02 | `an import of an undeclared module path is rejected`                        | unit      | The negative fixture fails the scan and is named in the failure — proven by fixture, not by waiting for a real violation.                                                                                                                                                                                                                                                                                                                                                                         |
| CR-AC-02 | `no source names a pre-move warehouse path`                                 | unit      | A scan for the two moved directories returns zero hits, comments included — the stale-reference class CR-AC-02 forbids.                                                                                                                                                                                                                                                                                                                                                                           |
| CR-AC-02 | `every predecessor identifier is qualified with its owning request`         | unit      | The three re-used identifiers each carry their owning request; none is renumbered to this request's identifiers.                                                                                                                                                                                                                                                                                                                                                                                  |
| CR-AC-03 | `the superseded ADR carries a forward link and an intact body`              | unit      | Status reads superseded, the forward link resolves, and the body is diff-identical to `baseline_revision`.                                                                                                                                                                                                                                                                                                                                                                                        |
| CR-AC-03 | `the new ADR is accepted and both ADRs are indexed with correct status`     | unit      | The new ADR exists and reads accepted; the web index lists both with the status each file declares.                                                                                                                                                                                                                                                                                                                                                                                               |
| CR-AC-03 | `no system guide still uses the warehouses tab as its cross-module example` | unit      | The worked example is gone from the placement guide; a scan for it across the system documents returns zero hits.                                                                                                                                                                                                                                                                                                                                                                                 |
| CR-AC-04 | `the realized file set matches the design artifact's split table`           | unit      | Five files for the list split, two for the people split — exactly the sad.md §5.3 tables, no more and no fewer.                                                                                                                                                                                                                                                                                                                                                                                   |
| CR-AC-04 | `each split file exports exactly one component`                             | unit      | One component export per file across all seven.                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| CR-AC-04 | `each moved component's colocated spec sits beside it`                      | unit      | Every spec resolves in the same directory as its subject; none is orphaned by the move.                                                                                                                                                                                                                                                                                                                                                                                                           |
| CR-AC-04 | `the three-way content branch survives in the list component`               | unit      | The flat loading / empty / present assignment is still in the list; no nested ternary and no lookup-shaped chain appears anywhere.                                                                                                                                                                                                                                                                                                                                                                |
| CR-AC-04 | `the list and the row render from plain props with no server stub`          | component | `WarehouseList` and `WarehouseRow` mount in isolation with no store, query or router — proof neither acquired a hidden read. The three leaves below them (`WarehouseSearchField`, `WarehouseListSkeleton`, `WarehouseEnterLink`) are covered transitively and get no spec of their own per `sad.md` §5.4; `WarehousePersonRow` is an Action row that reads the actor and its own permission, so it mounts through `WarehouseDetailPane` **with** a stub and is exempt by design, not by omission. |
| CR-AC-05 | `the nine shared-api files resolve under their four domain directories`     | unit      | Seven modules and two colocated specs under `client/`, `workspace/`, `access/` and `warehouse/`.                                                                                                                                                                                                                                                                                                                                                                                                  |
| CR-AC-05 | `no file remains at the shared-api root`                                    | unit      | The root holds directories only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| CR-AC-05 | `every importer resolves through the new path`                              | unit      | All 68 referencing files resolve; no specifier names a pre-move shared-api path.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| CR-AC-06 | `no store directory exists in the warehouse or workspace module`            | unit      | Only the auth module carries a store directory; none was created for symmetry.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| CR-AC-06 | `no new state slice is registered`                                          | unit      | The registered slice inventory is unchanged from `baseline_revision`.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| CR-AC-06 | `the auth slice spec is renamed with its assertions unchanged`              | unit      | The kebab-case filename exists, the old filename is gone, and the case inventory of the file is identical.                                                                                                                                                                                                                                                                                                                                                                                        |

### §5.1 — Regression boundaries

These carry more weight than §5. Each is measured against `baseline_revision`.

| Boundary | Test name (intent-based)                                                         | Level            | Expected outcome                                                                                                                                                                                                                                                                                                                                      |
| -------- | -------------------------------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CR-RG-01 | `the four post-split specs declare exactly the baseline set of case names`       | unit             | The union of case names equals the inventory captured at `baseline_revision`, before the split. A dropped case fails and names it.                                                                                                                                                                                                                    |
| CR-RG-01 | `no case is lost where two split targets share a title`                          | unit             | The total is **39**, distributed 25 / 7 / 4 / 3 — the union alone cannot see one of a duplicated pair disappear.                                                                                                                                                                                                                                      |
| CR-RG-01 | `the move commit changes no file content`                                        | unit             | A rename-detected comparison over the moved set reports path changes only; a content hunk in the move step fails.                                                                                                                                                                                                                                     |
| CR-RG-01 | `the web suite passes with no behavioral expectation changed`                    | unit + component | Green, and every expectation diff appears in the Permitted-change column of the classification table below.                                                                                                                                                                                                                                           |
| CR-RG-01 | `listing, lifecycle and access flows behave as at baseline`                      | component        | The 25 cases retained in the tab spec pass unchanged in subject and expected value — mutations, field-error mapping, toasts, dialog copy.                                                                                                                                                                                                             |
| CR-RG-01 | `the responsive split-view collapse is unchanged`                                | component        | Both pinned widths render the panes as at `baseline_revision`; the two responsive cases stay in the tab spec and stay green.                                                                                                                                                                                                                          |
| CR-RG-01 | `the Warehouses tab behaves identically in the running application`              | e2e-through-UI   | Listing, searching, selecting, entering, creating, renaming, archiving, restoring, granting and withdrawing look and behave as before.                                                                                                                                                                                                                |
| CR-RG-02 | `a qualifying row renders the Enter link`                                        | component        | Non-archived and present in the membership set → the link renders.                                                                                                                                                                                                                                                                                    |
| CR-RG-02 | `a non-qualifying row renders no Enter control at all`                           | component        | Hidden, never disabled — across all three non-qualifying row kinds. A disabled control here is a regression, not a near miss.                                                                                                                                                                                                                         |
| CR-RG-02 | `the Enter link is a sibling of the selection button`                            | component        | The link is never nested inside the button, so the selection button stays first in focus order.                                                                                                                                                                                                                                                       |
| CR-RG-02 | `the Enter link's accessible name names its Warehouse`                           | component        | N rows yield N distinguishable link names in an assistive-technology link list.                                                                                                                                                                                                                                                                       |
| CR-RG-03 | `the actor's own row is disabled with its reason exposed`                        | component        | The control is disabled and its reason is reachable through the visually hidden element it points at.                                                                                                                                                                                                                                                 |
| CR-RG-03 | `an actor without the revoke permission sees no withdraw control`                | component        | The row renders the email only; no control is emitted — hidden, never disabled. Added at review (`_review/review-2026-08-18.md` S5) in `WarehousePeopleList.spec.tsx`; until then this row advertised coverage that existed only as a source-text grep.                                                                                               |
| CR-RG-03 | `no Warehouse Role is displayed for any person`                                  | component        | The deliberate omission survives the row split — no Role text appears in the people pane.                                                                                                                                                                                                                                                             |
| CR-RG-03 | `the protected Manager case is refused by the server, not guessed in the client` | component        | The client issues the request and surfaces the refusal; it never pre-empts the decision locally.                                                                                                                                                                                                                                                      |
| CR-RG-04 | `each dataset is requested only under its own watch permission`                  | component        | No request fires outside the permission that admits it — the people list is omitted **and never requested**.                                                                                                                                                                                                                                          |
| CR-RG-04 | `a control absent at baseline is still absent without its permission`            | component        | The add control, the editable name and both lifecycle controls are omitted entirely under each missing permission.                                                                                                                                                                                                                                    |
| CR-RG-04 | `the tab shell disappears for an actor whose permissions admit no tab`           | component        | Covered by the untouched administration-shell spec, which this request does not edit — so its passing is evidence the shell is untouched.                                                                                                                                                                                                             |
| CR-RG-05 | `the normalized module→chunk manifest is identical to baseline`                  | unit             | Built at both revisions, hashes stripped, moved paths rewritten, sorted → the diff is empty **apart from the five CH-W5 components that did not exist at `baseline_revision`**, which are admitted by name in `moved-modules.mjs` and each required to land in its parent component's chunk. No new eager chunk, every lazy route boundary preserved. |
| CR-RG-05 | `no module barrel is introduced`                                                 | unit             | No module gains an index entry point; the enumerated surface declaration stays the mechanism.                                                                                                                                                                                                                                                         |
| CR-RG-06 | `the manager-transfer concurrency case fails identically to baseline`            | integration      | Same assertion, same refusal-where-conflict-expected. Making it pass is out of scope and is itself a failure of this row. **Discharged at review** against a clean database — 1 failed / 31 passed, `[200, 403]` at line 632 (`_review/cr-rg-06-known-red-server-case.md`).                                                                           |
| CR-RG-07 | `the server and contracts trees are byte-identical to baseline`                  | unit             | The name-status comparison is empty for both.                                                                                                                                                                                                                                                                                                         |
| CR-RG-07 | `the home module is byte-identical to baseline`                                  | unit             | Empty diff — it imports no shared-api module, so nothing may reach it.                                                                                                                                                                                                                                                                                |
| CR-RG-07 | `the access module differs only in import specifiers`                            | unit             | Its 33 importing files change specifiers only, plus the single comment hunk O2 authorizes. No file added, removed or renamed.                                                                                                                                                                                                                         |
| CR-RG-07 | `the auth module differs only in import specifiers and the one rename`           | unit             | Two specifier hunks plus the CR-AC-06 filename change; any third hunk kind fails.                                                                                                                                                                                                                                                                     |

## Expectation classification

The artifact that makes `change.md` §6's abort threshold mechanical, and the mitigation risk R1
names. It is produced **before the first move**, from sad.md §5.4's per-`describe` table.

> **Abort rule.** CR-RG-01 defines drift as _an expectation whose subject or expected value
> changes_. Any expectation diff not listed in the Permitted-change column for that suite is
> evidence the refactor altered behavior. It blocks the request. It is never absorbed as an update,
> and this table is never widened after the fact to accommodate a diff that already happened.

### Behavioral — no expectation may change

| Suite (or group)                                                  | Permitted change                                                                               |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| The 25 cases retained in the Warehouses tab spec                  | Re-scoped `describe` blocks and import specifiers only                                         |
| The 6 list cases and 1 accessibility case moving to the list spec | File location, `describe` scope, a per-file render harness, plain-props mounting               |
| The 4 Enter cases moving to the row spec                          | File location, `describe` scope, a per-file render harness, plain-props mounting               |
| The 3 cases moving to the people-list spec                        | File location, `describe` scope, a per-file render harness                                     |
| Every other moved web component, hook and schema spec             | File location and import specifiers only                                                       |
| The moved warehouse-name validation spec                          | File location and import specifiers only — its cross-module test coupling is unchanged in kind |
| The auth slice spec                                               | Filename only                                                                                  |

### Mixed — a named subset is structural

| Suite                                | Structural (permitted to change)                                                                    | Behavioral (may not change)                     |
| ------------------------------------ | --------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| The web module-boundaries spec       | The scan-scope comment's paths; the rule description text; the three qualified identifiers          | Every boundary rule and every surface assertion |
| The module-surface declaration       | The warehouse entry is deleted; the workspace manifest grows to 38; the auth comment's module names | The declaration's shape — enumerated, no barrel |
| The access role-name validation spec | The single comment hunk re-pointing a moved path (O2)                                               | Every validation case                           |

### New — no baseline, therefore unclassified

The Warehouses-tab case-inventory gate and its committed baseline. It **adds** assertions rather
than changing any, so the abort rule does not apply to it. It is the only new test surface this
request introduces; the four new leaf components deliberately get **no** new spec (sad.md §5.4),
because their behavior is already pinned by the cases above and CR-RG-01 forbids deleting an
expectation, not adding a file.

## Edge cases / error paths

Each is a dedicated case, never folded into a happy path.

- **A Warehouse row is archived, or absent from the membership set, or both** → no Enter control is
  emitted at all. A disabled control satisfies neither reading of CR-RG-02 and fails.
- **The Enter link is nested inside the selection button to simplify the split** → the focus-order
  case fails, because the selection button no longer comes first.
- **Two rows render the same accessible link name** → the per-Warehouse naming case fails; N rows
  must yield N distinguishable names.
- **The actor opens the people pane on their own membership** → the control is disabled and its
  reason is exposed; it is never simply omitted, which would lose the explanation.
- **The actor lacks the revoke permission** → no control at all, and the surrounding markup is
  unchanged, because the gate emits an empty fragment rather than an element.
- **The actor withdraws the protected Manager** → refused by the server and surfaced; the client
  must not pre-empt the decision, which the row split makes newly tempting.
- **A dataset is requested outside its own watch permission** → the "never requests it" case fails.
  This is why that case **stays** in the tab spec: it asserts a request that must not fire, which a
  child mounted in isolation cannot see.
- **An expectation is edited to make an isolated mount pass** → abort, per the classification table.
  This is the single failure mode risk R1 names and the whole table exists to make visible.
- **A case is silently dropped while a 1122-line spec becomes four files** → the case-inventory gate
  fails on both the union and the total of 39.
- **A leaf gains a hook, context or store read to satisfy the hop budget** → the plain-props
  component row fails to mount it without a stub, and the budget review gate catches the rest.
- **An import specifier is rewritten to a path that still type-checks but names the wrong module** →
  the boundary scan rejects it; a clean type-check is explicitly not evidence here (risk R3).
- **The surface declaration is widened instead of a misplaced import being fixed** → the empty
  exception list fails. Whether a genuinely added entry is a real public surface is a review gate.
- **A barrel is introduced to shorten the rewrite** → the no-barrel row fails before the chunk
  manifest ever sees the eager import it would create.
- **The baseline build cannot be produced** → CR-RG-05 is **unverified**, not satisfied. A green
  unit suite does not discharge it.
- **No container runtime is available** → CR-RG-06 is **blocked**, not satisfied. CR-RG-07's
  byte-identity of the server tree bounds the risk but does not discharge the criterion.
- **The integration tier reports zero cases because it was skipped** → treated as a failure, not a
  pass. There is no mocked-store fallback; a passing mock is not a passing production.
- **The baseline was captured against a contaminated tree** → every identity comparison in this plan
  is invalidated. `baseline_revision` is pinned at `42f1205`, and the working tree must be clean at
  capture.
- **A guide is reconciled at three locations instead of four** → a live system document still names
  this request's outcome as a failure. Not mechanically catchable in prose; carried to the review
  gates as O1 requires.

## Review gates

Clauses no static check can decide. Each is verified by a named reviewer, and its outcome is
recorded in the pull request beside the classification table. A gate left unrecorded is an
uncovered criterion, not a formality.

- **New-ADR content (CR-AC-03)** — that it narrows the predecessor's owning-entity tiebreak and
  preserves everything else that ADR decides; that it answers the "organize by consumer" rejection
  on its own terms rather than denying its own basis; that it records the refused domain asymmetry
  and the finding behind it; and that it carries the namespace rule.
- **Guide reconciliation (CR-AC-03, O1)** — that `adding-a-web-module.md` retains **no** statement
  contradicting the new ADR, at **four** locations, not three. O1 requires `spec.md` CR-AC-03 to be
  amended before `tasks`; until it is, this gate is the only thing holding the fourth location.
- **Shared-api equivalence (CR-AC-05)** — the rename-detected comparison per moved module against
  `baseline_revision`, with the reviewer recording that **every hunk is an import specifier**. The
  criterion states outright that a green build cannot discharge this, and no mechanical gate is
  added in its place, so this record **is** the evidence.
- **Hop budgets (CR-AC-04)** — counted from the two split roots, two hops maximum, with no new
  hook, context or read introduced at a leaf to satisfy the budget.
- **One reason to change (CR-AC-04)** — the design-time criterion. The file set is the review-time
  one and is mechanical above; the judgement behind it is not.
- **The `useState` audit (CR-AC-06)** — that the audit table accounts for every occurrence in the
  three modules at `HEAD`, and that the count drops by exactly one for the reason recorded.
- **Surface-declaration diff** — that no entry is added to accommodate an import that should have
  been fixed, and that dropping to 14 entries reflects a real intra-module import.
- **Focus order in the running application (CR-RG-02)** — sad.md §10 requires this manually, at
  both pinned widths, in addition to the component rows.
- **Placement judgement (risk R6)** — that the narrowed tiebreak is not being over-applied to some
  other single-consumer slice. Both of its conditions are import-graph facts; the ownership call
  behind them stays human, as the superseded ADR already records.

## Test data

- **Seed strategy:** the fixtures and render harness the existing web specs already use. This
  request adds **no entity shape** — there is no `data-model.md`, because persistence is untouched
  (sad.md §7.1) and the server tree is byte-identical (CR-RG-07). No new seed is designed here.
- **Per-file harnesses:** each new spec carries its own render harness and router. The toast hoist
  and the workspace fixtures are needed only where a mutation or toast is asserted, so the row and
  list specs mount their subject with plain props and **no server stub**. This is a permitted setup
  change under CR-RG-01, and the plain-props mounting is itself asserted (CR-AC-04) — a leaf that
  cannot mount without a stub has acquired a read the split forbids.
- **Integration dependency:** for CR-RG-06 only, an ephemeral real database created for the run and
  dropped after. Never a mocked store. Its absence blocks the row rather than passing it.
- **Cleanup boundary:** per-test for the component tier (the inherited arrangement); per-test state
  reset with the integration tier run serially, also inherited. This request must not alter either —
  changing the suite's own arrangement is a behavioral change to the suite.
- **Committed baselines, all captured at `baseline_revision = 42f1205`:**
  - the Warehouses-tab case inventory — the 39 case names of the pre-split spec, plus the total;
  - the normalized module→chunk manifest — hashes stripped, moved source paths rewritten, sorted;
  - the neighbour tree state for the four trees CR-RG-07 fences.

  Each is compared, never regenerated to make a gate pass. Regenerating one is a deliberate,
  reviewable act.

- **Negative fixtures:** the existing fixture directory outside the scanned production trees, so a
  deliberate boundary violation never becomes a real one. No new fixture shape is introduced.

## NFR validation (load)

<!-- N/A: no numeric NFR -->

`spec.md` §6 carries no numeric **runtime** NFR — the change adds no runtime behavior, so there is
no rate, no duration and no latency threshold to sustain, and none is invented. Its six rows are
zero-threshold structural budgets, each already covered above:

| §6 row                 | Where it is proved                                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Bundle: eager chunks   | CR-RG-05 — the normalized manifest diff is empty apart from the five enumerated CH-W5 components, or the row is unverified |
| Boundary exceptions    | CR-AC-02 — the exception list is empty at **every** step, not only the last                                                |
| Test expectation drift | CR-RG-01 plus the classification table — zero changed, zero deleted                                                        |
| Type safety            | The build gate, green at every step                                                                                        |
| Lint                   | The lint gate, green at every step                                                                                         |
| Component size         | CR-AC-04's file set, plus the hop-budget review gate                                                                       |

## CI placement

The command for each tier lives in sad.md §10 and is detected against the repository at
implementation time — deliberately not restated here.

- **After each of steps 0–4, not only at the end** (sad.md §10 is explicit, and risk R3 is why): the
  lint, unit, component and build gates, plus the repository-root static-gate suite, which now
  carries the Warehouses-tab case-inventory gate and so needs no new script.
- **Pre-merge:** the integration tier against an ephemeral database for CR-RG-06; the two
  baseline comparisons (the chunk manifest and the neighbour trees); and the manual
  through-the-UI verification, including focus order, at both pinned widths.
- **Before any code moves (step 0):** the documentation rows of CR-AC-03 and their review gates.
  sad.md §4.7 lands the documentation first precisely so no window exists in which the system
  documents contradict the tree.
- **Retired after ship:** the Warehouses-tab case-inventory gate — it has no meaning against a tree
  where the pre-split file no longer exists, and the four successor specs are then the baseline.
- **Kept permanently:** the boundary, surface-manifest and shared-api layout gates. They are the
  mechanical backstop risk R6 names against the narrowed tiebreak being over-applied later.

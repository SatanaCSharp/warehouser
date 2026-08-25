---
kind: change-request
status: Draft
owner: 'YuriiH'
reviewers: ['Tech Lead', 'implementing engineer']
updated_at: '2026-08-14'
feature_size: 'L'
change_record: './change.md'
---

# Test plan — change-request: modules-level-refactor

Every domain entity gets exactly one owning module per application, the rule is written into
`docs/system` and made executable by boundary specs — and **no user-observable behavior changes**.
That second half is the substance of this plan: §5 acceptance criteria are verified by _new_
structural assertions, while §5.1 regression boundaries are verified by proving the _existing_
assertions did not move. Coverage therefore has two halves, and the assertion classification in
[§ Assertion classification](#assertion-classification) is what keeps them apart.

## Levels

| Level             | Scope                                                                                                                                                                                                                                                        | Strategy (generic — no tool names)                                                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit              | Pure logic with no external dependency — including **static source analysis**: file manifests, import graphs, extracted route tables, locale value diffs, config-shape assertions.                                                                           | In-memory over source read from the tree. This is the dominant level here: a layout rule is pure logic over file content.                                                       |
| Integration       | The module against a real dependency it owns — the container graph and the persisted domain invariants.                                                                                                                                                      | An ephemeral real dependency: a disposable database created for the run and dropped after. Never a mocked store (sad.md §10).                                                   |
| Contract          | The HTTP boundary every client agrees on — method, full path, guard set, permission metadata, DTO class, and real payload shapes.                                                                                                                            | Two committed baselines diffed against the current tree, plus the existing payload-asserting suites. No hand-rolled stubs.                                                      |
| Component         | A moved web component exercised in isolation — props/state → rendered output and interactions.                                                                                                                                                               | Render in a component harness against the registered i18n namespaces; assert output and behavior, no full app boot.                                                             |
| E2E-through-UI    | The administration surface driven through the rendered UI.                                                                                                                                                                                                   | Manual verification at ship per the repository's `run` practice (sad.md §10). Not an automated suite — recorded here because it is the only tier that sees the composed screen. |
| E2E               | <!-- N/A: a behavior-preserving refactor adds no flow. The nearest automated equivalent is the contract tier, which already exercises real requests end to end through the server. -->                                                                       |                                                                                                                                                                                 |
| Visual-regression | <!-- N/A: no baseline-image harness exists in the repository, and standing one up is test surface beyond the moved code (the constraint CR-AC-09 applies to DI specs). CR-RG-04's value-identity diff plus the component tier cover the rendered result. --> |                                                                                                                                                                                 |
| Load              | <!-- N/A: no numeric *runtime* NFR — the change adds no runtime behavior. §6's two numeric rows are build-pipeline budgets, measured as benchmarks in [§ NFR validation](#nfr-validation). -->                                                               |                                                                                                                                                                                 |

**Naming convention for new gates.** `tests/refactor/` holds the identity gates this request adds
(route table, split-case inventory), mirroring the `tests/access/` extractor + baseline + spec
pattern the repository already uses. Negative fixtures live beside their spec in a `fixtures/`
directory, never inside a scanned production tree — the precedent is
`tests/access/fixtures/authorization-coverage/`.

## AC coverage

Every criterion in `spec.md` §5 and every regression boundary in §5.1 appears below.

### §5 — Acceptance criteria

| AC       | Test name (intent-based)                                                           | Level                  | Expected outcome                                                                                                                                      |
| -------- | ---------------------------------------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| CR-AC-01 | `warehouse module holds the warehouse administration surface`                      | unit                   | The web manifest lists the warehouse components, API slice, hooks and name-form schema under `modules/warehouse/`.                                    |
| CR-AC-01 | `no workspace-module file enforces a warehouse rule`                               | unit                   | The `modules/workspace` manifest contains none of the moved warehouse files.                                                                          |
| CR-AC-01 | `the warehouse namespace resolves in both languages`                               | unit                   | The namespace list carries `warehouse`; both language files exist and their key set matches.                                                          |
| CR-AC-01 | `warehouse keys keep their full path under the new namespace`                      | unit                   | Every key still reads `warehouses.…`; the block is nested, not hoisted to the file root.                                                              |
| CR-AC-01 | `a moved warehouse component renders real copy, not raw keys`                      | component              | Rendered text is the translated value — proving the test harness registers the new namespace.                                                         |
| CR-AC-02 | `access module carries both scopes side by side`                                   | unit                   | The manifest lists the warehouse-scoped surface and the workspace-scoped roles, members and permissions in one module.                                |
| CR-AC-02 | `no workspace-module file enforces an access rule`                                 | unit                   | The `modules/workspace` manifest contains none of the moved access files.                                                                             |
| CR-AC-02 | `scope is expressed in the file name, not a nested module`                         | unit                   | Both scope variants sit as sibling files; no second module directory appears inside `access`.                                                         |
| CR-AC-02 | `scope-named locale parents carry the incoming values without collision`           | unit                   | The three new parents hold today's values verbatim; the pre-existing warehouse-scoped blocks are untouched.                                           |
| CR-AC-02 | `both scopes' role editors render their own copy`                                  | component              | Each scope's editor shows its own strings — proof the merge overwrote neither scope.                                                                  |
| CR-AC-03 | `workspace module contains exactly its enumerated file set`                        | unit                   | The manifest matches the enumeration exactly; an unlisted file present or a listed file missing both fail, naming the file.                           |
| CR-AC-03 | `the administration shell renders four tabs in order under the same gating`        | component              | Same four tabs, same order, same gating predicates — with two of them now imported from sibling modules.                                              |
| CR-AC-03 | `the composed administration surface is unchanged in the running application`      | e2e-through-UI         | The four tabs, the warehouse view and the access surface look and behave as before — the only tier that sees the composed screen.                     |
| CR-AC-03 | `none of the six multi-consumer helpers remains in the workspace module`           | unit                   | Each of the six resolves at the location the design assigns; none is left behind and none is duplicated.                                              |
| CR-AC-03 | `warehouse-domain consumers reach workspace-users through the shared layer`        | unit                   | The three warehouse-domain importers resolve to the composition layer, not to an `access` API slice.                                                  |
| CR-AC-04 | `every import of a module resolves to that module's declared surface`              | unit                   | The import graph passes with an **empty** exception list — module importers and composition-layer importers alike.                                    |
| CR-AC-04 | `an import of an undeclared path inside a module is rejected`                      | unit                   | A fixture importing a non-surface path fails the analyzer and is named in the failure.                                                                |
| CR-AC-04 | `no module directory contains a nested module`                                     | unit                   | Only directories directly under `modules/` carry a surface entry; a route sub-tree of the same entity passes.                                         |
| CR-AC-04 | `the three composition-layer imports of module internals pass as declared surface` | unit                   | Each resolves to a declared entry — without any of the three files being edited.                                                                      |
| CR-AC-05 | `the warehouses module owns the warehouse record`                                  | unit                   | The four lifecycle commands, the list query, the controller, the mutation DTO and the module's error factories are present.                           |
| CR-AC-05 | `warehouse error codes are unchanged after the move`                               | unit                   | Every relocated factory emits its original code string.                                                                                               |
| CR-AC-05 | `the module has its three wiring files and no empty directory`                     | unit                   | Use-case module, transport module and barrel present; no directory created for symmetry.                                                              |
| CR-AC-05 | `the shared contract harness is reachable without a module importing a sibling`    | unit                   | The harness sits in the shared test location; neither module imports the other to reach it.                                                           |
| CR-AC-06 | `the access module owns both scopes and the membership grants`                     | unit                   | Warehouse-scoped and workspace-scoped use cases, the authority predicates, the deletion service and the three grant/revoke use cases are all present. |
| CR-AC-06 | `no production file in access imports workspaces`                                  | unit                   | The existing production-scoped assertion passes at the new paths, with specs still outside its scope.                                                 |
| CR-AC-06 | `an error-module member reachable from two destinations sits in the shared layer`  | unit                   | The two named multi-destination members resolve to the shared location — neither duplicated nor left behind.                                          |
| CR-AC-07 | `the workspaces module contains exactly its enumerated remainder`                  | unit                   | The manifest matches the enumeration; no unnamed file survives.                                                                                       |
| CR-AC-07 | `the workspaces error directory is deleted rather than kept as a shim`             | unit                   | Either it holds only members the ownership rule leaves behind, or it does not exist; no re-export file is present.                                    |
| CR-AC-07 | `provisioning still runs its four steps in order through exported modules`         | integration            | Workspace → owner role → first warehouse → initial access, in that order, reaching siblings only through exported use cases.                          |
| CR-AC-08 | `every cross-module dependency resolves through an exported module or barrel`      | unit                   | No deep file path crosses a module boundary — specifically no foreign error factory, domain predicate or DTO.                                         |
| CR-AC-08 | `the users module imports none of the four feature modules`                        | unit                   | The forbidden list covers all four, including the two newly added.                                                                                    |
| CR-AC-08 | `no shared repository imports a feature module`                                    | unit                   | The rule holds at the new paths, unchanged.                                                                                                           |
| CR-AC-09 | `the application graph resolves without a forward reference`                       | integration            | The container compiles; the access use-case module imports no feature module and stays the graph's leaf.                                              |
| CR-AC-09 | `no forward reference exists anywhere in the server source`                        | unit                   | A repository-wide scan returns zero occurrences.                                                                                                      |
| CR-AC-09 | `both modules boot against a real database`                                        | integration            | The existing smoke path and its new counterpart both start and resolve their providers.                                                               |
| CR-AC-10 | `the ownership ADR exists, is accepted, and both indexes name it`                  | unit                   | The ADR file is present with accepted status; each index carries a "read before…" entry pointing at it.                                               |
| CR-AC-10 | `no new guide file was created`                                                    | unit                   | The guide inventory is unchanged in count and names; guidance extends the three that already exist.                                                   |
| CR-AC-11 | `the resolved route table equals the committed baseline`                           | contract               | Method, full path, guard classes, permission metadata and DTO class are identical for all 21 handlers.                                                |
| CR-AC-11 | `no method-and-path pair is claimed twice and none is unreachable`                 | contract               | Each pair appears exactly once across the four controllers; both shared prefixes resolve every path.                                                  |
| CR-AC-11 | `request and response payloads are unchanged`                                      | contract + integration | The existing payload-asserting suites pass at their new locations with every payload assertion untouched.                                             |
| CR-AC-12 | `a file added to the workspace module fails and is named with its rule`            | unit                   | The failure message contains the offending path and the rule it violates — the manifest forces the ownership question.                                |
| CR-AC-12 | `the web boundary spec passes with no per-file exception list`                     | unit                   | The exception list is empty; only the per-module surface declaration is consulted.                                                                    |
| CR-AC-12 | `the server's existing boundary specs assert the new layout with rules intact`     | unit                   | Paths and path-valued exemption keys are updated; no rule is weakened or deleted (enforced by the classification table).                              |

CR-AC-10's prose clauses — the four ownership rules in each guide, the management-versus-enforcement
boundary, and the narrowed nesting guidance — carry no test row because no static check decides
them. They are verified in [§ Review gates](#review-gates), before the first move.

### §5.1 — Regression boundaries

| Boundary | Test name (intent-based)                                                       | Level                                     | Expected outcome                                                                                                    |
| -------- | ------------------------------------------------------------------------------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| CR-RG-01 | `the full suite passes with no behavioral assertion changed`                   | unit + integration + component + contract | Green, and every assertion diff appears in the Permitted-change column of the classification table below.           |
| CR-RG-01 | `the four splitting specs lose no case`                                        | unit                                      | The union of case names after the split equals the committed baseline set captured before it.                       |
| CR-RG-01 | `an assertion changed outside the permitted list aborts the release`           | unit                                      | Any such diff is treated as evidence of altered behavior — not absorbed as an update.                               |
| CR-RG-02 | `authorization coverage holds with every rule unchanged`                       | unit                                      | The coverage gate and every release-gate suite pass; only path-valued literals differ.                              |
| CR-RG-02 | `no handler moves between covered and exempt`                                  | contract                                  | Each handler's guard set and permission metadata match the baseline row, so its classification cannot have flipped. |
| CR-RG-02 | `the four domain invariants still hold`                                        | integration                               | One owner per workspace, one manager per warehouse, one role per user-and-warehouse, one workspace role per member. |
| CR-RG-03 | `no migration is added, altered or run`                                        | unit                                      | The migration directory is byte-identical; schema synchronization stays disabled.                                   |
| CR-RG-03 | `entities and repositories keep their count and location`                      | unit                                      | 13 entities and 17 repositories, all in the shared domain layer.                                                    |
| CR-RG-03 | `the published contract subpaths are unchanged in name and content`            | unit + contract                           | The four export subpaths are byte-identical — nothing outside the repository observes the change.                   |
| CR-RG-04 | `every locale key value is identical to the baseline`                          | unit                                      | Value-for-value equality across both languages.                                                                     |
| CR-RG-04 | `key paths move only for the three scope-named parents`                        | unit                                      | Exactly one namespace merge relocates key paths; every other block, including the new namespace, keeps its paths.   |
| CR-RG-04 | `no key exists in one language and not the other`                              | unit                                      | Key sets are symmetric in every namespace.                                                                          |
| CR-RG-04 | `the computed-key lookups still resolve`                                       | component                                 | Each tab description renders its translated value, read through the computed key from the file that stays put.      |
| CR-RG-04 | `no string is hardcoded outside a namespace`                                   | unit                                      | No literal user-facing string appears in a moved file.                                                              |
| CR-RG-05 | `both restriction selectors are still present and still forbid the identifier` | unit                                      | The identifier selector and the literal selector both survive, unchanged in intent.                                 |
| CR-RG-05 | `the ignore list still contains exactly its six entries`                       | unit                                      | Three production paths and three test globs — no seventh entry added to make a moved import resolve.                |
| CR-RG-05 | `the web lint gate is green`                                                   | unit                                      | Lint passes with the configuration unchanged.                                                                       |
| CR-RG-06 | `guards, principals, denial errors and permission decorators are unchanged`    | unit                                      | Location and content identical apart from import specifiers naming a moved file.                                    |
| CR-RG-06 | `no module gains a dependency on access to obtain a guard`                     | unit                                      | The import graph shows no module importing access for enforcement.                                                  |
| CR-RG-07 | `no file moves out of the web composition layer`                               | unit                                      | A rename scan over the composition layer reports no move out.                                                       |
| CR-RG-07 | `the test setup file is the one permitted content addition`                    | unit                                      | It gains one namespace entry per language; every other composition-layer file changes only import specifiers.       |
| CR-RG-07 | `the three files importing module internals are not edited`                    | unit                                      | Their diffs are empty — they are made legal by declaration, not by edit.                                            |

## Assertion classification

This is the §4.3 artifact that makes the §6 abort threshold mechanical, and the mitigation risk R2
names. It is produced **before the first move**. Each affected suite is classified once, and the
**Permitted change** column enumerates the only assertion diffs allowed in it.

> **Abort rule.** Any assertion diff that is not listed in this table's Permitted-change column for
> that suite is evidence the refactor altered behavior. It blocks release. It is never absorbed as
> an update, and the table is never widened to accommodate a diff that already happened — amending
> it is a reviewed decision taken before the change that needs it.

### Behavioral — no assertion may change

| Suite (or group)                                                                     | Permitted change                         |
| ------------------------------------------------------------------------------------ | ---------------------------------------- |
| Every use-case unit and integration spec moving out of the workspaces module         | File location and import specifiers only |
| Every access-module use-case, service and query spec                                 | Import specifiers only                   |
| The workspaces domain predicate, role-deletion service and error specs               | File location and import specifiers only |
| Web access API, mutation and feedback specs (`toEqual` outcome shapes — see risk R4) | Import specifiers only                   |
| Every moved web component spec and hook spec                                         | File location and import specifiers only |
| `apps/web/src/router.spec.tsx`                                                       | Import specifiers only                   |

### Mixed — a named subset is structural

| Suite                                                                     | Structural (permitted to change)                                                                                      | Behavioral (may not change)                            |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `tests/access/authorization-coverage.spec.mjs`                            | `INFRASTRUCTURE_EXEMPT` keys at `:23` and `:32`; `SELF_PROJECTION_READS` keys; the `workspaces/domain` glob at `:141` | Every classification rule and every coverage assertion |
| `warehouse.controller.spec.ts` _(splits)_                                 | Handler inventory; the file it lives in                                                                               | Every per-handler delegation and outcome assertion     |
| `workspace.controller.spec.ts` _(splits)_                                 | Handler inventory; the file it lives in                                                                               | Every per-handler delegation and outcome assertion     |
| `workspace-http-contract.integration.spec.ts` _(splits)_                  | Suite grouping and the file it lives in                                                                               | Every request and response payload assertion           |
| `WorkspaceAdministration.spec.tsx`                                        | Import specifiers for the two cross-module tabs                                                                       | Tab set, order, gating predicates, rendered copy       |
| `apps/web/src/i18n.spec.ts`                                               | The namespace inventory gains one entry                                                                               | Key-symmetry and resolution rules                      |
| `apps/web/src/modules/workspace/hooks/name-validation.spec.ts` _(splits)_ | The files the cases live in                                                                                           | Every validation case — the union must be preserved    |

### Structural — assertions change by definition

| Suite                                                             | Permitted change                                                              |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `workspaces/domain/module-boundaries.spec.ts`                     | Scanned-directory glob shrinks with the module; rule intact                   |
| `workspaces/module-wiring.spec.ts`                                | Controller inventory reduces to the workspace controller                      |
| `workspaces/domain/active-warehouse-selection-boundaries.spec.ts` | Re-pathed; rule intact                                                        |
| `workspaces/usecases/usecase.module.di.spec.ts`                   | Provider inventory shrinks with the module                                    |
| `users/module-boundaries.spec.ts`                                 | Forbidden list **extended** by two entries — a tightening, never a relaxation |
| `shared/domain/repositories/repository-boundaries.spec.ts`        | Re-pathed; rule intact                                                        |
| `tests/{auth,users,workspaces}/release-gates.spec.mjs`            | Path-valued literals only, where any exist; no rule weakened                  |

### New — no baseline, therefore unclassified

`apps/web/src/modules/module-boundaries.spec.ts` · `warehouses/module-boundaries.spec.ts` ·
`access/module-boundaries.spec.ts` · the `warehouses` wiring, container and smoke counterparts ·
`tests/refactor/route-table.spec.mjs` · `tests/refactor/split-cases.spec.mjs`

These add assertions rather than change them, so the abort rule does not apply to them. Every one is
new **structural** surface, authorized by CH-S5, CH-S6 and CH-W5 — no new _behavioral_ assertion is
added anywhere, which is what keeps CR-AC-09's "no test surface beyond the moved code" intact.

## Edge cases / error paths

Each is a dedicated case, never folded into a happy path.

- **A file is added to the workspace module** → the manifest fails and names the path and the rule;
  it stays failing until someone amends the manifest deliberately, which is the point (CR-AC-12).
- **An import reaches a module path that is not declared surface** → rejected, naming both the
  importer and the target. Proven by a fixture, not by waiting for a real violation (CR-AC-04).
- **The surface declaration is widened instead of a misplaced import being fixed** → _not
  mechanically catchable_ (risk R5). It is a review gate: the declaration is one file, diffed in
  every pull request.
- **A second domain entity acquires a home inside another module's tree** → _not mechanically
  catchable_ (§4.7). The manifest forces the ownership question to be answered; the answer is human.
- **Two controllers claim the same method and path** → the route-table diff is non-empty and names
  the duplicated pair, before any request is ever shadowed at runtime (risk R3).
- **A handler moves from covered to exempt, or exempt to covered, while its path is rewritten** →
  its guard set or permission metadata differs from the baseline row (sad.md §8's named risk).
- **A re-export shim is left behind in the workspaces error directory** → the deep-import assertion
  fails; a shim is exactly the deep import CR-AC-08 forbids (CR-AC-07).
- **A forward reference is introduced to break a resolution cycle** → the repository-wide scan
  returns a non-zero count and fails, rather than the graph quietly resolving (CR-AC-09).
- **A locale key exists in one language only** → the symmetry assertion fails per namespace.
- **A namespace merge overwrites one scope's values** → the value diff fails, naming the key whose
  value changed. This is the failure the scope-named parents exist to prevent (CR-AC-02).
- **The test harness is not told about the new namespace** → moved component specs render raw keys
  and fail on rendered text, rather than passing against a key string (CR-AC-01, CR-RG-07).
- **The integration tier is silently skipped** because its enabling variable is unset → treated as a
  failure, not a pass. A run that reports zero integration cases does not satisfy any row in this
  plan that names the integration level.
- **The disposable database is unavailable** → the integration tier fails closed. There is no
  mocked-store fallback; a passing mock would not be a passing production.
- **An existing test's expectation had to change to make the suite green** → abort, per the rule
  above. This is the single failure mode the whole classification table exists to make visible.
- **The baseline was captured against a contaminated tree** → the in-flight composition-layer work
  must land _before_ `baseline_revision` is pinned; a non-empty working tree at capture time
  invalidates every identity comparison in this plan (risk R7, CR-RG-07).

## Review gates

Clauses no static check can decide. They are verified by a named reviewer, and their outcome is
recorded in the pull request beside the classification table.

- **Owning-module judgement** — _whose invariants does this file enforce?_ Conceded as human in
  CR-AC-12 and §4.7. The manifest forces the answer to be given; it cannot compute it.
- **Guide prose (CR-AC-10)** — that each guide states the four ownership rules, the
  management-versus-enforcement boundary, the module-private rule for error factories, predicates
  and DTOs, and that the nesting guidance no longer contradicts CR-AC-04. Reviewed at step 4,
  **before the first move** (§4.6), not at ship.
- **ADR consequences (CR-AC-10)** — that the ADR states honestly that cross-module view imports
  become legal on web, that two modules may serve one prefix, and that a wrongly-placed module is
  expensive to move.
- **Surface-declaration diff (risk R5)** — that each entry added to the declaration is a genuine
  public surface, not an accommodation for an import that should have been fixed.
- **Assertion classification (risk R2)** — that the table above was produced before the first move
  and that every assertion diff in the change appears in it.

## Test data

- **Seed strategy:** the factories and fixtures the existing server integration suites already use.
  This request adds **no entity shape** — there is no `data-model.md` because persistence is
  untouched (CR-RG-03), so no new seed is designed here.
- **Integration dependency:** an ephemeral real database, created for the run and dropped after, per
  sad.md §10. Never a mocked store.
- **Cleanup boundary:** per-test state reset with the integration tier run **serially** — the
  existing arrangement, inherited unchanged. This request must not alter it; doing so would be a
  behavioral change to the suite itself.
- **Committed baselines (the test data for the identity dimension), all captured at
  `baseline_revision`:**
  - the route table — method, full path, guard classes, permission metadata, DTO class, sorted;
  - the split-case inventory — the case names of the four splitting specs;
  - the locale snapshot — every key and value in both languages.

  Each is compared, never regenerated to make a gate pass. Regenerating one is a deliberate,
  reviewable act, and the route-table gate is kept permanently after ship (§5.5).

- **Negative fixtures:** fixture files outside the scanned production trees, following the existing
  fixture-directory precedent, so a deliberate violation never becomes a real one.

## NFR validation

No numeric **runtime** NFR exists — the change adds no runtime behavior, so there is no load
scenario to run and none is invented. `spec.md` §6's two numeric rows are build-pipeline budgets,
measured as benchmarks:

- **Build and test duration ≤ 110 % of baseline** → sample: **3 runs** before and 3 after, same
  machine, same warm/cold cache state; metric: **median wall-clock** of build plus test per
  application; threshold: **≤ 110 %** of the `baseline_revision` median. Measured once, pre-merge.
- **Bundle output: no new eager chunk** → produce the web build at `baseline_revision` and after;
  metric: the chunk graph; threshold: **zero** new eager chunks and every lazy route boundary
  preserved. Measured once, pre-merge.

The remaining §6 rows are structural and are already covered above: the HTTP surface by CR-AC-11,
module depth by CR-AC-04 and CR-AC-12, and the boundary-exception count by CR-AC-04's empty
exception list.

## CI placement

The commands for each tier are in sad.md §10 and are detected against the repository at
implementation time — they are deliberately not restated here.

- **Every commit, not only at the end** (sad.md §10 is explicit about this, and risk R1 is why): the
  lint, unit, component and build gates for both applications, plus the repository-root static-gate
  suite — which now carries the route-table and split-case gates, so they run with the existing
  release gates and need no new script.
- **After each server move step, and again before merge:** the integration tier against the
  disposable database, run serially.
- **Pre-merge only:** the two benchmark measurements, and the manual through-the-UI verification
  that the administration surface renders the same four tabs in the same order with the warehouse
  view and access surface unchanged.
- **Kept permanently after ship:** the route-table gate. The split-case inventory is retired once
  the four splits have landed and their union is proven — it has no meaning against a tree where the
  pre-split files no longer exist.

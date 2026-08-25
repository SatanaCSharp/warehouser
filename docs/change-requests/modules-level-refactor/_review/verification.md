# Pre-merge verification — change-request: modules-level-refactor

> **T20.** The evidence behind [CR-US-04](../spec.md#cr-us-04-trust-that-nothing-moved-but-the-files)'s
> promise: that a reviewer can approve a ~150-file diff by verifying its boundaries rather than
> re-reviewing every behavior the repository already accepted.
>
> **Verdict: NOT clean. Ships only with reviewer sign-off on five findings.** Four are pre-existing
> or documentation defects; one is a measured NFR breach. None is a behavioral regression — every
> identity gate is green. Read §7 before approving.

| Field               | Value                                                                     |
| ------------------- | ------------------------------------------------------------------------- |
| `baseline_revision` | `d17a7f1770a9f2b4e775dbc3b72c670f658cdaf9`                                |
| Tasks               | 20 of 20 committed (18 commits; T7–T10 compile-coupled into one)          |
| Behavioral tests    | **0 added, 0 removed, 0 changed**                                         |
| Structural tests    | +76 (identity gates + four boundary specs), all authorized by CH-S5/S6/W5 |

## 1. Identity gates — all green

| Gate                    | Location                              | Result                                                                             |
| ----------------------- | ------------------------------------- | ---------------------------------------------------------------------------------- |
| Route table             | `tests/refactor/route-table.spec.mjs` | **Diff empty.** 38 routes, 21 under `/api/v1/workspace`; no method+path pair twice |
| Split-case inventory    | `tests/refactor/split-cases.spec.mjs` | Union equals baseline; `caseCount` exactly 85; no title duplicated across a split  |
| Locale value identity   | `apps/web/src/i18n.spec.ts`           | 0 value changes, 0 keys dropped, 0 keys added; `en`/`uk` symmetric across 11 ns    |
| `PERMITTED_RELOCATIONS` | same file                             | **Not widened.** T2 anticipated all four moves; the pinning assertion is unchanged |

**Runtime confirmation of the route table.** The static gate was corroborated by booting the real
application. NestJS mapped **38 routes**, **21** under `/api/v1/workspace`, with both prefix-sharing
pairs live:

```
WarehouseController        {/api/v1/workspace/warehouses}
WarehouseAccessController  {/api/v1/workspace/warehouses}
WorkspaceController        {/api/v1/workspace}
WorkspaceAccessController  {/api/v1/workspace}
```

This is the risk `sad.md` §11 R3 named — NestJS resolves by registration order, so a shadowed handler
would vanish with no behavioral test noticing. Static gate and runtime agree exactly.

## 2. Suite results

| Tier                        | Baseline `d17a7f1` | Final         | Note                                         |
| --------------------------- | ------------------ | ------------- | -------------------------------------------- |
| Root gates (`node --test`)  | 23 pass            | **31 pass**   | +8 = identity gates + CR-AC-13 fixtures      |
| Web (vitest)                | 507 / 56 files     | **516 / 58**  | +6 boundary assertions, +1 file from a split |
| Server (jest, unit)         | 510                | **577**       | +67 structural (boundary specs, teeth, DI)   |
| Server integration (serial) | 888 / 889          | **957 / 958** | 1 failure, both before and after — see §7.4  |
| Lint · Build                | clean · clean      | clean · clean |                                              |

**Integration must run `--runInBand`.** Parallel jest workers deadlock against the single Postgres and
produce ~50 bogus suite failures (`deadlock detected`) — a false signal that reads as catastrophic
regression. Recorded here so no reviewer repeats it.

## 3. Untouched-surface diffs

| Boundary     | Requirement                              | Result                                                                  |
| ------------ | ---------------------------------------- | ----------------------------------------------------------------------- |
| **CR-RG-03** | migrations + `packages/contracts`        | **empty diff**                                                          |
| **CR-RG-05** | `apps/web/eslint.config.mjs`             | **empty diff**                                                          |
| **CR-RG-06** | enforcement + persistence stay in shared | **zero non-spec files changed**; 13 entities, 17 repositories identical |
| **CR-RG-07** | nothing moves out of composition layer   | **zero renames out**; `src/test/setup.ts` the single content addition   |

CR-RG-06's diff is not literally empty: `repository-boundaries.spec.ts` changed. That is a _spec_, not
a guard, entity or repository — see finding §7.1. No enforcement or persistence code was touched.

CR-RG-07's one content addition is the carve-out the criterion explicitly names: registering the
`warehouse` namespace in `src/test/setup.ts`, without which every moved component's spec renders raw
keys instead of translated copy.

## 4. Authorization (CR-RG-02) and graph (CR-AC-09)

- `tests/access/authorization-coverage.spec.mjs` — **14/14 pass, file unchanged.** Its path-valued
  literals name `workspace.controller.ts::readContext` and `::setActiveWarehouse`, both handlers that
  stay in `workspaces`; re-pathing them (as two task cards instructed) would have broken them.
- **No handler moved between covered and exempt.** All 11 relocated handlers were covered before and
  after; the two exempt handlers did not move.
- `tests/{auth,users,workspaces}/release-gates.spec.mjs` — pass, untouched.
- `grep -rn "forwardRef(" apps/server/src` → **0**.
- `AccessUsecaseModule` has no `imports` array — still the leaf.
- **Error-code identity:** 19 codes at baseline, 19 across the three destinations after, `diff`
  identical. `global-http-exception.filter.ts` untouched.

Per [spec §6.1](../spec.md#61-security--privacy) the security review is **N/A**, conditional on
CR-RG-02 and CR-RG-06 passing. Both pass, so the waiver holds.

## 5. Cost NFRs

Median of 3, same machine, turbo cache disabled (`--force`).

| Measurement     | Baseline  | Final     | Ratio         | Budget             | Verdict      |
| --------------- | --------- | --------- | ------------- | ------------------ | ------------ |
| Build           | 4941 ms   | 4980 ms   | **100.8%**    | ≤110%              | **MET**      |
| Test (combined) | 17569 ms  | 22319 ms  | **127%**      | ≤110%              | **BREACHED** |
| — web           | 12850 ms  | 15068 ms  | 117%          |                    | breached     |
| — server        | 3087 ms   | 4784 ms   | 155%          |                    | breached     |
| Web chunk graph | 13 chunks | 13 chunks | identical set | no new eager chunk | **MET**      |

See finding §7.5. The vitest phase breakdown shows **test execution time is flat** — 33.40 s → 33.19 s,
marginally _faster_. The entire increase is fixed per-file overhead (collect +10.46 s, environment
+7.02 s) and filesystem-scanning boundary specs. Excluding the new web boundary spec, the suite still
takes ~14.87 s, so the gate itself is only ~200 ms of a ~2000 ms increase: the cost is per-_file_, not
per-_test_.

Chunk graph: entry bundle 823.90 → 823.91 kB (+10 bytes), all six lazy `page.js` route chunks
preserved, no chunk added or lost.

## 6. Assertion classification reconciliation

Every assertion diff, checked against
[test-plan.md § Assertion classification](../test-plan.md#assertion-classification).

**Within the permitted column:**

| Suite                                         | Diff                       | Permitted change                          |
| --------------------------------------------- | -------------------------- | ----------------------------------------- |
| `warehouse.controller.spec.ts` (splits)       | −8 (`it.each` rows)        | "Handler inventory; the file it lives in" |
| `workspace.controller.spec.ts` (splits)       | −5 (`it.each` rows)        | same                                      |
| `workspace-http-contract.integration.spec.ts` | suite grouping             | "Suite grouping and the file it lives in" |
| `name-validation.spec.ts` (splits)            | file location              | "The files the cases live in"             |
| `i18n.spec.ts`                                | +1 namespace               | "The namespace inventory gains one entry" |
| `users/module-boundaries.spec.ts`             | forbidden list 2 → 4       | "extended by two entries — a tightening"  |
| `workspaces/usecase.module.di.spec.ts`        | provider inventory shrinks | "Provider inventory shrinks with module"  |
| `workspaces/module-wiring.spec.ts`            | controller inventory → 1   | "reduces to the workspace controller"     |
| `authorization-coverage.spec.mjs`             | **none**                   | n/a — correctly unchanged                 |

**Outside the permitted column — see §7.1.** Both rule amendments. They are reported here rather than
filed under permitted changes, because the abort rule forbids widening the table to accommodate a diff
that already happened.

`workspaces/domain/module-boundaries.spec.ts` converted one `it.each` to a single `it` collecting
offenders — forced, because the lane empties `workspaces/domain/` and **Jest errors on an empty
`it.each` table**. The rule, patterns and file-naming on failure are unchanged, and the idiom is the
one `authorization-coverage.spec.mjs` already uses for the same rule.

## 7. Findings — read before approving

### 7.1 Two boundary rules were amended (CR-AC-13, CR-AC-14) — reviewer must sign off

Both fall in a "may not change" column. Both were escalated by an implementer that **stopped and
shipped nothing**, were decided by the owner **before** the edit, and each carries a non-weakening
proof. The abort rule's escape clause — _"amending it is a reviewed decision taken before the change
that needs it"_ — is satisfied on the record, but the judgement is the reviewer's, not the engine's.

|              | Rule                   | Documented contract                                 | Implementation                                                                                                          | Fix                                           |
| ------------ | ---------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| **CR-AC-13** | `findForbiddenImports` | "bare-specifier imports and relative imports"       | matched **any** path containing the segment, so `@warehouser/contracts/workspaces` read as a `workspaces` module import | skip scoped (`@…`) specifiers                 |
| **CR-AC-14** | command try/catch      | "delegates exception handling to the global filter" | banned the `try`/`catch` **tokens** textually                                                                           | forbid only a `try` block wrapping an `await` |

Neither was needed to make a failing test pass. Each was needed because a **conforming** file moved
into a rule's blast radius for the first time — the common cause being that both rules were stricter
than their authors documented, and nothing had previously exercised the over-broad branch.

Non-weakening proofs, each pinned by a fixture that ships:

- CR-AC-13: a bare `workspaces/domain/…` import and a relative `../../workspaces/…` traversal from
  `access` both still fail.
- CR-AC-14: a command wrapping `await this.repository.persist(…)` is still rejected; the synchronous
  value-object translation is admitted. Repository rules untouched (repositories still admit no
  `try`/`catch` at all).

### 7.2 CR-AC-08 has a live pre-existing counterexample — not fixed, by decision

`apps/server/src/auth/usecases/usecase.module.ts:11` deep-imports `WorkspaceProvisioningService` from
`workspaces/domain/services/` and re-registers it through a local factory. CR-AC-08 says the graph
"after every move" must resolve "never a deep file path".

- **Byte-identical to `baseline_revision`** — this refactor did not introduce it.
- In **no task's `files_hint`**.
- **Caught by no spec**, including T13's new ones (they scan `warehouses/`, `access/`, `users/`,
  `shared/domain/repositories/` — never `auth/`).
- A verified 15-line fix exists (point `auth` at `WorkspacesUsecaseModule`, drop the local factory):
  probed green, no `forwardRef` needed, `register-access.integration.spec.ts` passing **unedited**.
  Deliberately **not applied** — it is a DI wiring change, not a file move, and applying it would put
  a non-enumerated production file in a refactor whose premise is that nothing else changes.

**Recommend a scoped follow-up change request.**

### 7.3 `sad.md` §5.1's module graph is wrong — correct at ship

It asserts three edges including `auth.usecases → workspaces.usecases`. That edge **has never
existed**. The real graph:

```
AccessUsecaseModule       — no imports (leaf)
WorkspacesUsecaseModule   → AccessUsecaseModule
WarehousesUsecaseModule   → AccessUsecaseModule
AuthUsecaseModule         → AccessUsecaseModule   +  deep import (§7.2)
```

The predicted `workspaces → warehouses` edge correctly does not exist. `sad.md` was deliberately left
unedited: amending an upstream design artifact mid-implementation is what a change request should not
do. Fold this correction back at ship.

### 7.4 AC-36a stays red — carried through identically, by decision

`access-http-contract.integration.spec.ts:632` — a concurrent manager-transfer expects 409
`access.concurrent_change` and gets **403**. Red since `df929ca`, unrelated to this request, failing
**identically** before and after (same file, same line, same assertion).

Analysis suggests the **test** is wrong, not the code: both racing requests authenticate as the same
Manager, so once the winner transfers the role away the loser legitimately fails authorization before
reaching the command's concurrency re-check.

Keeping it red is what makes identity provable. Had it been fixed inside this request, there would be
no way to distinguish "the refactor preserved behavior" from "the refactor changed behavior and the
test was changed too". **Recommend a separate `/fix` cycle.**

### 7.5 The test-duration NFR is breached at 127% — recommend amending the NFR

[§6](../spec.md#6-non-functional-requirements) states ≤110% with no exemption for added tests, so this
is reported as **not met**. But the cause is fully attributed and is **not** a runtime or build
regression:

- Build is 100.8%; the web chunk graph is unchanged; **actual test execution is flat** (33.40 s →
  33.19 s).
- The increase is the structural test surface **this request itself authorizes** under CH-S5, CH-S6
  and CH-W5: the identity gates, four boundary specs, split spec files — every one filesystem-scanning
  or paying vitest/jest fixed per-file cost.

The budget as written measures the baseline suite against a **different, larger** suite. **Recommend
amending it to measure like-for-like**, or to carry an explicit allowance for the gates the request
mandates. That is a reviewed decision, not something to absorb here.

### 7.6 Repository hygiene — four tracked `tsbuildinfo` files (out of scope, worth fixing)

```
apps/web/tsconfig.tsbuildinfo   packages/{contracts,shared-types,utils}/tsconfig.tsbuildinfo
```

Tracked in git while their `dist/` is gitignored. In any fresh checkout or worktree `tsc` believes its
output current, emits nothing, and **every server suite fails** with
`Cannot find module '@warehouser/shared-types/enums'` — which reads as catastrophic breakage and is
purely an artifact. Six independent agents hit it, diagnosed it, and worked around it identically
(delete, build `shared-types` → `utils` → `contracts` **serially**, restore).

Unrelated to this refactor and deliberately not fixed here. Fix is one `.gitignore` line plus
`git rm --cached`.

### 7.7 Errata in the request's own prose (no outcome changed)

Every **operative** constraint held exactly — 13 call sites, 21 handlers, 3 factories, 14 factories,
3 destination modules, the 3/4/14 controller split. Only hand-written incidental counts drifted, and
each was reported rather than adapted to:

| Source              | Says                             | Actual                          |
| ------------------- | -------------------------------- | ------------------------------- |
| `spec.md:250-251`   | 3 + **6** + 1 call sites (= 10)  | 3 + **9** + 1 = 13              |
| `sad.md` §5.4       | "17 call sites"                  | 14 files / 26 invocations       |
| `sad.md` §5.3 row 4 | 5 + 7 + 1 = **13** files         | 12 files                        |
| `sad.md` §5.3 row 5 | 3 consumers                      | 1 direct (3 transitive)         |
| T6 card / CH-S1     | "**7** specs"                    | 8 on disk                       |
| T16 card            | 26 components / 13 hooks         | 25 / 12                         |
| T7 + T11 cards      | re-path `authorization-coverage` | no re-path needed; targets stay |

Two task cards also instructed work their own DoD and the system guides forbade: T6's card said to
create `warehouses/rest/rest.module.ts` while forbidding the controller move, which
`adding-a-server-module.md:65` and CR-AC-05 both forbid as an empty module (deferred to T7, correctly).

## 8. Review gates still owed to a named human

[test-plan.md § Review gates](../test-plan.md#review-gates) — none is mechanically decidable:

- [ ] **The owning-module judgement** — _whose invariants does this file enforce?_ (`sad.md` §4.7)
- [ ] The guide prose amended in T4
- [ ] The ADR consequences (T3)
- [ ] The surface-declaration diff — the residual risk (`sad.md` §11 R5) is someone widening
      `MODULE_SURFACE` instead of fixing a misplaced import. Mitigation: it is one file. **All 15
      entries were proved load-bearing** by automated leave-one-out.
- [ ] The classification table predates the first move — it does; committed in `d17a7f1`.

## 9. Manual verification — PARTIAL, one item not performed

Per [test-plan.md](../test-plan.md) the e2e-through-UI tier is manual, and it is the only tier that
sees the composed screen.

**Verified:**

- Server boots clean; 38 routes resolve at runtime; both shared prefixes live (§1).
- Web dev server serves the app (HTTP 200), no Vite errors.
- API correctly returns **401** unauthenticated.
- `public/locales/{en,uk}/warehouse.json` both serve **200** — T18's new namespace resolves at
  runtime, not merely in tests.
- `access.json` carries **all six** keys at runtime — `roles`/`members`/`permissions` alongside
  `workspaceRoles`/`workspaceMembers`/`workspacePermissions`, with distinct values
  (`"Warehouse roles"` vs `"Workspace roles"`). The namespace merge overwrote neither scope.

**NOT verified — requires a human:**

> **`/workspace` renders the same four tabs in the same order under the same gating predicates, and
> the warehouse view and access surface are unchanged.**

The dev database has zero users, so reaching the authenticated screen requires registering an account
and entering a password. The agent performing this verification does not create accounts or enter
credentials, so this check was **not performed** and must not be assumed. Its automated proxy —
`WorkspaceAdministration.spec.tsx`, 20 cases asserting tab set, order, gating predicates and rendered
copy — passes, and the shell differs from baseline by four import lines only. That is strong evidence
but it is not the composed screen.

**To complete:** start Postgres + Redis (`docker compose up -d`), run
`pnpm --filter @warehouser/server dev` (port 3100) and `pnpm --filter @warehouser/web dev`
(port 3200), register a user — which provisions Workspace → owner role → first Warehouse → initial
access — and confirm `/workspace` shows **Warehouses · Workspace roles · Members · Permissions** in
that order.

## 10. Definition of Done

| DoD item                                         | Status                                                    |
| ------------------------------------------------ | --------------------------------------------------------- |
| Full suite green, both apps + root gates         | **MET**                                                   |
| Integration green serially, non-zero cases       | **MET** — 957/958, 379 integration cases ran; 1 known red |
| Zero behavioral assertions changed               | **MET**                                                   |
| Every listed diff empty or specifier-only        | **MET** (CR-RG-06 caveat, §3)                             |
| Both cost budgets met                            | **NOT MET** — test 127%, §7.5                             |
| Review gates signed off                          | **OPEN** — §8, human-owned                                |
| `_review/verification.md` exists and PR links it | this file                                                 |

**O4 remains a ship step this task does not close:** verify at ship that no acceptance criterion in
`docs/features/{workspaces,access,users-management}` or
`docs/change-requests/{workspace-warehouse,web-shell-navigation}` constrains a file location. If one
does, it becomes a spec amendment rather than a path correction.

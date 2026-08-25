---
id: T20
title: 'Run the pre-merge identity, regression and cost verification'
layer: 'tests'
deps: ['T13', 'T19']
acs:
  [
    'CR-AC-11',
    'CR-RG-01',
    'CR-RG-02',
    'CR-RG-03',
    'CR-RG-04',
    'CR-RG-05',
    'CR-RG-06',
    'CR-RG-07',
  ]
files_hint:
  ['docs/change-requests/modules-level-refactor/_review/verification.md']
source_refs: []
owner: 'YuriiH'
estimate: 'M'
status: 'todo'
---

# T20 — Run the pre-merge identity, regression and cost verification

## Why

[CR-US-04](../spec.md#cr-us-04-trust-that-nothing-moved-but-the-files) is the promise that a reviewer can
approve a ~150-file diff by verifying its boundaries rather than re-reviewing every behavior the
repository already accepted. That is only true if the evidence is assembled and attached. This task
produces it — and it is the task that can **block release**, per
[change.md §6](../change.md#6-rollout)'s abort threshold.

## What

Assemble one record at `_review/verification.md` covering:

- **Identity gates:** the route-table diff (empty), the split-case union (equal), the locale value diff
  (values identical, key paths moved only for the three scope-named parents, `en`/`uk` symmetric).
- **Assertion classification:** every assertion diff in the change appears in
  [test-plan.md § Assertion classification](../test-plan.md#assertion-classification)'s
  Permitted-change column for its suite. Attach the reconciliation to the PR.
- **Untouched-surface diffs**, each expected empty or specifier-only:
  `git diff --stat apps/server/migrations packages/contracts` (CR-RG-03, and 13 entities / 17
  repositories still in `shared/domain/`); `apps/web/eslint.config.mjs` (CR-RG-05 — both selectors present,
  exactly six `ignores` entries, no seventh added); `shared/{guards,access,decorators}` and
  `shared/domain/{security,entities,repositories}` (CR-RG-06);
  `git diff --name-status apps/web/src/{shared,guards,routes,store,test}` showing **no rename out** and
  `src/test/setup.ts` as the one content addition (CR-RG-07).
- **Authorization:** `tests/access/authorization-coverage.spec.mjs` and every release-gate suite under
  `tests/` pass with every rule they assert unchanged; no handler moved between covered and exempt; the
  four domain invariants hold in the integration tier.
- **Graph:** repository-wide `forwardRef(` scan returns zero.
- **Cost NFRs:** median wall-clock of build + test per application over **3 runs before and 3 after**,
  same machine, same warm/cold cache state, against `baseline_revision` → **≤110%**; and the
  `pnpm --filter @warehouser/web build` chunk graph → **zero** new eager chunks, every lazy route
  boundary preserved.
- **Manual verification** per the repository's `run` practice: `/workspace` renders the same four tabs in
  the same order, and the warehouse view and access surface are unchanged. This is the only tier that sees
  the composed screen.

## Definition of Done

- [ ] Full suite green across both applications plus `node --test 'tests/**/*.spec.mjs'`, and the
      integration tier green **serially** against a disposable database — a run reporting **zero**
      integration cases is a failure, not a pass.
- [ ] **Zero behavioral assertions changed.** Any assertion diff outside the classification table is
      treated as evidence the refactor altered behavior and **blocks release**; it is never absorbed as an
      update, and the table is never widened after the fact.
- [ ] Every diff listed above is empty or import-specifier-only.
- [ ] Both cost budgets met, with the measurements recorded.
- [ ] The [review gates](../test-plan.md#review-gates) a named reviewer owns are signed off: the
      owning-module judgement, the guide prose, the ADR consequences, the surface-declaration diff, and
      that the classification table predates the first move.
- [ ] `_review/verification.md` exists and the PR links it.

## Notes

The security review is **N/A**, conditional on CR-RG-02 and CR-RG-06 passing — if either fails, the change
has altered authorization and a review becomes required
([spec §6.1](../spec.md#61-security--privacy)). Two open questions remain deliberately after this task:
[O3](../sad.md#open-questions) (whether the `pending`/`success` `workspace.` prefix is renamed) is a
post-ship follow-up, and **[O4](../sad.md#open-questions) is a ship step this task does not close** —
verify at ship that no acceptance criterion in `docs/features/{workspaces,access,users-management}` or
`docs/change-requests/{workspace-warehouse,web-shell-navigation}` constrains a file location. If one does,
it becomes a spec amendment rather than a path correction.

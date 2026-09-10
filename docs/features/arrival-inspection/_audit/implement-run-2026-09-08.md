---
title: 'implement run notes — arrival-inspection (completion)'
date: '2026-09-08'
status: 'complete — 20 of 20 tasks committed, all gates green'
---

Closes the run paused at 9/20 on 2026-09-07. Records what the task docs do not contain: the items
that still need a human decision, and the gate corrections this run had to make.

# Needs a human decision

## 1. spec.md §6's NFR table demands telemetry the repository forbids

`spec.md` §6 asks for **"structured server timing logs"** for authorization and line-ending latency.
`docs/system/guides/server-use-case-boundaries.md` §2 and `apps/server/AGENTS.md` forbid measuring
anything in production code, and the repo-wide rule is that coding agents add no telemetry. **No timing
was written anywhere in this run**, deliberately. The spec needs amending — a `clarify` or
`change-request` decision, not an implement one.

## 2. design-handoff.md contradicts itself on keyboard order

- _quantity → reason → **remove** → description_: the approved frame (`W6TARi`/`H0jcSr`) **and**
  § Component mapping (`Inspection/Rejection Row`, `H6tv5L`).
- _quantity → reason → **description** → remove_: § Accessibility, **and** `sad.md` §5 — which merely
  inherits § Accessibility, so it is one source counted twice.

The handoff's own front matter settles authority ("the frame names and node IDs are the contract; the
previews are review evidence only"), and the frame order keeps DOM, visual and tab order identical,
which is what § Accessibility's own stated principle asks for. **T15 implemented the frame order.**
The cheap correction is to amend § Accessibility and `sad.md` §5 rather than have each task
re-litigate it. `sad.md` is ours; the handoff is the design owner's.

## 3. Two more handoff wordings that do not match what shipped

- **`descriptionLabel`**: the frame caption says "What was wrong"; T15's RED asserts "Describe what was
  wrong" and the label was kept rather than weaken a shipped test.
- **T16's DoD says `aria-disabled`**: HeroUI v3's `Radio.isDisabled` renders a **native `disabled`**
  input (confirmed by probing `outerHTML`). The spec asserts the framework-true signal.

## 4. sad.md §6.1 / §8 drift, adjudicated during the run

- §6.1 step 5 maps AC-03/AC-14/AC-15b to the Condition Split and Conformance branches;
  `api-sync-report.md` and `openapi.yaml` map them to `purchase_drafts.invalid_input`. **The contract
  won.**
- §8:878-879 words T14's read-side check as "every read whose response schema can carry a Rejection's
  cause", which literally also catches the two **ending routes** — but §7:799 fixes their observed list.
  **Ruling: the check scopes to `@Get` handlers**; the ending routes are writes and their failure mode
  is withholding from someone entitled, never disclosure. Recorded in a comment at both routes.

## 5. sad.md §11 change-request item 7 — still unraised

"Any repository-wide assertion that a Closed draft is immutable is now wrong." No such assertion was
found in `apps/server` that this feature's specs break, but the CR item remains outstanding.

## 6. Pre-existing hazard, out of scope

`apps/web` `DemandDirectory.spec.tsx` emits `act()` warnings (`ArchivedWarehouseChip`,
`DemandSearchField`, `RecordDemandAction`, `DemandFooterSummary`) on unmodified HEAD. They leak async
updates into whichever test shares their worker, so unrelated timing bugs there will look random.

# Gate corrections — all now mandatory

The run shipped a regression to `master` because the gate command set was wrong. These are the fixes.

- **Run the whole root suite**: `node --test "tests/**/*.spec.mjs"`, not `tests/refactor/*.spec.mjs`.
  T13's multi-argument `@ObservedPermission` broke `tests/delivery-addresses/identity-coverage.spec.mjs`
  — a repository-wide observed-Permission gate — and the narrow glob never ran it. Fixed in T14.
- **`packages/contracts` has its own eslint config** the server's lint never invokes.
- **`--max-warnings=0`** is what the pre-commit hook uses; a plain `eslint src` exits 0 on warnings.
- **Rebuild `packages/contracts`** (`npx tsc && npx tsc-alias`) before trusting any server gate that
  touches it: `apps/server` resolves the package through `dist/`, and jest has no `moduleNameMapper` for
  it — so **a worktree cannot gate a contracts change at all**. Do that work in the main checkout.
- **Prettier the route-table baseline** after regenerating it; the generator emits unformatted JSON that
  inflated a 2-row change into a 243-line diff.

# Verification caveats

- T1's apply/revert was proven on **PGlite**, not a real PostgreSQL server. The shipped baseline needs
  PG15+ (`1786525200000` uses `ON DELETE SET NULL (col_list)`).
- `apps/web` has no integration tier by project convention — NON-red under `require_integration: auto`.

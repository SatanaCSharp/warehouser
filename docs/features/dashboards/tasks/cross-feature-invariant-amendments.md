---
id: T23
title: "Amend the four upstream rules this feature's surfaces rest on"
layer: 'docs'
deps: []
acs: ['AC-03', 'AC-06', 'AC-08', 'AC-22']
files_hint:
  - 'docs/features/ordering/spec.md'
  - 'docs/features/delivery-addresses/spec.md'
  - 'docs/features/workspaces/spec.md'
  - 'docs/features/arrival-inspection/spec.md'
  - 'docs/features/dashboards/spec.md'
owner: 'Tech Lead'
estimate: 'M'
status: 'todo'
---

# T23 — Amend the four upstream rules this feature's surfaces rest on

> **Blocked by:** —
> **Satisfies:** AC-03, AC-06, AC-08, AC-22 — see [spec.md §5](../spec.md)
> **Owner:** Tech Lead · **Estimate:** M · **Layer:** `docs`

## Why

The Workspace surface **contradicts three invariants as they are written today**, and the Coverage
Gap contradicts a fourth. `spec.md` §1 rules each override and names who owes the amendment;
`sad.md` §11 marks all of them due before `implement`. All three of the Workspace ones must move
together, or the surface rests on one amendment and two contradictions
([spec.md §8](../spec.md), [sad.md §11](../sad.md)).

## What

Five documentation edits, each citing this feature:

1. **`ordering`** — a per-Item derived read may state the arithmetic between promised, held and
   ordered quantity, which its fourth boundary declined to state; and its §3 cross-Workspace
   exclusion does not forbid an aggregate read authorized at the Workspace level.
2. **`ordering` + `delivery-addresses`** — the Expected Arrival Date speaks for its draft's **Via
   Warehouse** lines only, and a line's recorded ending is taken as the moment the goods arrived.
3. **`workspaces`** — a Workspace Permission may authorize a read of **aggregates** over
   Warehouse-owned records while still authorizing **no operation** inside a Warehouse.
4. **`arrival-inspection`** — the same exception to its rule that nothing it reads crosses that
   boundary, including across the Warehouses of one Workspace.
5. **`dashboards` `spec.md` §6** — the row-bounding target amended to the ruled rule: list rows flex
   20–26 px, then the Panel scrolls internally while the surface does not.

## Definition of Done

- [ ] Each of the five edits is made in the owning artifact and cites `dashboards` as the change's
      origin
- [ ] The three Workspace-surface amendments (`ordering`'s two rules, `workspaces`', and
      `arrival-inspection`'s) are reviewed together by the Security Lead as one change — they must
      move together
- [ ] `spec.md` §6's row-bounding row states the flex-then-internal-scroll rule and no longer
      contradicts the one-screen row
- [ ] `sad.md` §11's first three checkboxes are closed with a link to this change
- [ ] Every edited document's markdown gate (`prettier`, link check) passes
- [ ] `oxlint --type-aware --max-warnings=0` clean over every staged file, and the
      commit passes the repository's Git hooks without `--no-verify`

## Notes

**Blocks nothing technically** — it starts in phase 1 alongside the migrations and the contracts —
but it is a **ship blocker**: `sad.md` §11 states the design assumes these amendments and cannot
proceed to `ship` without them.

**Shares a lane with [T6](./arrival-timing-repository.md)** — both edit
`docs/features/dashboards/spec.md`.

Also still open and **not** this task's to close: the `purchase_drafts.reference` collision from the
10 000th draft ([data-model.md § Drift detected](../data-model.md)), owed by `ordering`'s owner
before this feature ships; and `spec.md` §6.1's phrase "subject to the same rate limiting as every
other read", which describes a control that does not exist — the application rate-limits writes
only. The Security Lead carries that one with the security review.

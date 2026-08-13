---
id: T28
title: 'Record ADR 0003 and reconcile the sad §8 handler classification'
layer: 'docs'
deps: []
acs: ['AC-11', 'AC-36']
files_hint:
  [
    'docs/features/workspaces/adr/0003-archived-tolerant-membership-edge-mutations.md',
    'docs/features/workspaces/sad.md',
    'docs/features/workspaces/contracts/api-sync-report.md',
  ]
owner: 'Tech Lead + Security Lead'
estimate: 'S'
status: 'todo'
---

# T28 — Record ADR 0003 and reconcile the sad §8 handler classification

## Why

[sad §6 "Flags raised while drawing these flows"](../sad.md#flags-raised-while-drawing-these-flows)
records the AC-11 conflict and says it "becomes ADR-worthy only if it is resolved by adding a third
handler classification" — which is how it was resolved. `api-sync-report.md` carries the same
question as **OQ-1** and adds **OQ-2**, **F-2** and **F-3**, all owned by design and all due before
`tasks`. [T30](./two-level-authorization-coverage-check.md) implements the classification, so it must
be written down first.

## What

Write `adr/0003-archived-tolerant-membership-edge-mutations.md` in the repository's MADR shape,
Accepted, recording:

- **Context** — AC-11 keeps the protected Warehouse Manager transfer available on an archived
  Warehouse; §6.3 denies every Warehouse-scoped mutation there; §8's coverage check admits no
  archived-tolerant mutation.
- **Considered options** — (a) move the handler under the Workspace guard; (b) add a third
  classification limited to membership-edge mutations; (c) leave AC-11 unsatisfied for that
  operation.
- **Outcome** — (b). Option (a) was rejected because US-13/AC-36 make the **Warehouse Manager** the
  actor, and a Warehouse Manager need not be a Workspace Member at all; re-pathing would require one.
- **Consequences** — honestly: the coverage check gets a class that must stay narrow, and every new
  archived-tolerant mutation needs an explicit membership-edge justification or the build fails.

Then reconcile the upstream artifacts:

- `sad.md` §6 flags — mark the AC-11 flag resolved and point at ADR 0003.
- `sad.md` §8 Authorization coverage — admit two additional classes: the archived-tolerant
  membership-edge mutation, and the **self-projection read** (membership-scoped, no Permission
  declared) covering `GET /api/v1/workspace/context` and
  `GET /api/v1/warehouses/{warehouseId}/access/current` (**OQ-2**).
- `sad.md` §7 and the §11 risk row — correct the breaking surface to include the four `users`
  handlers (**F-2**).
- `sad.md` §9 — add ADR 0003 to the index.
- `sad.md` §6.6a — split the lumped deny branch into its two causes (**F-3**).
- `contracts/api-sync-report.md` — mark OQ-1, OQ-2, F-2 and F-3 resolved, naming the resolution.

## Definition of Done

- [ ] `adr/0003-*.md` exists, is `Accepted`, and follows the MADR template the two existing ADRs use.
- [ ] `sad.md` §6 flags, §7, §8, §9, §11 and the §6.6a branch are updated as above, with no other
      section silently changed.
- [ ] `contracts/api-sync-report.md` records OQ-1, OQ-2, F-2 and F-3 as resolved with the resolution
      named and dated.
- [ ] The `sad.md` §6.6a sequence block still parses (one diagram declaration, balanced blocks,
      declared participants).
- [ ] Markdown lint clean.

## Notes

This task writes no code. It is a dependency of [T30](./two-level-authorization-coverage-check.md)
because the architecture check enforces exactly the classification recorded here, and of
[T26](./reshape-access-rest.md) in spirit — T26 may proceed in parallel, but its manager-transfer
declaration must cite this ADR.

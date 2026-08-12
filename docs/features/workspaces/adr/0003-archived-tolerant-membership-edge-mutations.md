---
status: Accepted
owner: 'Tech Lead'
reviewers: ['Security Lead', 'Backend Lead']
updated_at: '2026-08-12'
feature_size: 'L'
ticket: ''
---

# 0003 — Archived-tolerant membership-edge mutations as a third handler classification

## Context

`spec.md` AC-11 keeps the protected Warehouse Manager transfer available on an **archived** Warehouse:
archiving a Warehouse must not strand it with a Manager who has left, because the transfer is the only
way that protected Role ever changes hands. `spec.md` AC-36 (US-13) fixes who performs it — the
outgoing **Warehouse Manager**.

Three parts of the design contradict that in their current form:

- [`sad.md` §5](../sad.md#5-building-blocks-and-ownership) keeps the transfer in `access` as a
  Warehouse-scoped **mutating** operation.
- [`sad.md` §6.3](../sad.md#63-protected-warehouse-operation) denies every Warehouse-scoped mutating
  operation on an archived Warehouse. That is exactly AC-12, and it is load-bearing.
- [`sad.md` §8 Authorization coverage](../sad.md#authorization-coverage) classifies every
  Warehouse-scoped handler as either read (archived-tolerant) or mutating. It admits **no**
  archived-tolerant mutation, and the architecture check implements that classification as a release
  gate.

[`sad.md` §6 "Flags raised while drawing these flows"](../sad.md#flags-raised-while-drawing-these-flows)
recorded the conflict without resolving it, and stated the condition under which it becomes
ADR-worthy: "only if it is resolved by adding a third handler classification". `api-sync-report.md`
carries the same question as **OQ-1** and documents `transferWarehouseManager` as archived-tolerant
mutating _provisionally_, pending this decision.

It is resolved by adding the third classification, so the condition is met. The decision changes what
the authorization-coverage architecture check admits for every present and future handler at the
Warehouse level, which is a release gate — it therefore passes the feature ADR blast-radius gate.

## Decision drivers

- AC-11 must hold: the Manager transfer works on an archived Warehouse.
- AC-12 must not weaken: every _other_ Warehouse-scoped mutation is denied on an archived Warehouse,
  and the denial stays the guard's default rather than each handler's choice.
- AC-36 fixes the actor as the outgoing Warehouse Manager, who **need not be a Workspace Member at
  all**. Any resolution that requires Workspace authority to run the transfer breaks US-13.
- The archived-tolerance escape hatch must not become a general-purpose opt-out. `sad.md` §11 already
  names "archived-tolerance is declared on a handler that mutates, silently reopening AC-12" as a
  standing risk owned by Backend Lead + Security Lead.
- Whatever is decided must be mechanically checkable, because §8's coverage check — not review — is
  what actually holds the line ([ADR 0001](./0001-two-level-request-authorization.md) sets that
  precedent by making level confusion a compile error rather than a convention).

## Considered options

1. **Move the handler under the Workspace guard.** Re-path
   `POST /api/v1/warehouses/{warehouseId}/access/manager-transfer` to a `/api/v1/workspace/...` route
   and change its declared vocabulary from `PermissionId` to `WorkspacePermissionId`. The Workspace
   guard has no archived-Warehouse denial, so AC-11 follows for free.
2. **Add a third classification, limited to membership-edge mutations.** Keep the handler
   Warehouse-scoped and Warehouse-guarded, and admit one further class in §8: an archived-tolerant
   mutation whose subject is a membership **edge** rather than the Warehouse record or its contents.
   The classification is explicit per handler and checked by the architecture test.
3. **Leave AC-11 unsatisfied for that operation.** Deny the Manager transfer on an archived Warehouse
   like every other Warehouse-scoped mutation, and accept that an archived Warehouse can be stranded
   with a departed Manager.

## Decision outcome

Chosen: **option 2 — a third classification, narrowed to membership-edge mutations.**

**Option 1 is rejected on US-13/AC-36.** The Workspace guard resolves authority from the actor's
Workspace membership, and AC-36 makes the _outgoing Warehouse Manager_ the actor. A Warehouse Manager
need not be a Workspace Member — that separation is the whole point of `spec.md` §1's two independent
levels, and AC-21 explicitly keeps Workspace membership and Warehouse membership from implying each
other. Re-pathing the transfer under the Workspace guard would therefore require the outgoing Manager
to hold Workspace authority they may legitimately not have, which does not deny an edge case but
breaks the primary path of the user story. It also spends the breaking re-path on a handler whose
subject is genuinely Warehouse-scoped, muddying the level boundary ADR 0001 exists to keep sharp.

**Option 3 is rejected because AC-11 is a specification requirement, not a preference**, and the
failure it prevents is real: archiving is reversible (AC-09), so a Warehouse stranded with a departed
Manager stays unrecoverable through the product's own affordances until someone edits the database.

Option 2 keeps the guard's deny-by-default behaviour intact — nothing about AC-12 changes for any
other handler — and confines the exception to a class with an articulable boundary: the operation's
subject is the _relationship between a User and a Warehouse_, not the Warehouse record, its name, its
archived state, or anything it contains. Membership edges remain meaningful while a Warehouse is
archived precisely because archiving is a reversible state of the record, not a deletion of it.

The classification is declared per handler and verified by the §8 architecture check, so adding a
second archived-tolerant mutation is a visible, reviewable act rather than a silent one. In this
release the class has exactly **one** member: `transferWarehouseManager`.

This decision also resolves `api-sync-report.md` **OQ-1**, promoting that contract's provisional
documentation of `transferWarehouseManager` to the accepted design.

## Consequences

### Positive

- AC-11 and AC-36 both hold, with the outgoing Warehouse Manager as the actor and no Workspace
  authority required.
- AC-12 is untouched for every other Warehouse-scoped mutating handler; the guard still denies by
  default and each exception is explicit.
- The exception is mechanically enforced rather than review-enforced: a handler that declares
  archived tolerance while mutating fails the §8 coverage check unless it is in the admitted class.
- `api-sync-report.md` OQ-1 closes without a path change, so no contract field or path moves.

### Negative

- The coverage check now has a class that must stay narrow, and "membership edge" is a judgement the
  check cannot make on its own — it can only verify that a declaration exists and is in the admitted
  list. Every addition to that list needs an explicit membership-edge justification at review, and
  [T30](../tasks/two-level-authorization-coverage-check.md) fails the build when a handler declares
  archived tolerance without one.
- There are now three Warehouse-scoped classifications rather than two, so every new Warehouse handler
  answers one more question before it can be merged.
- The rule's correctness rests on "archiving is reversible", which is true today (AC-09). If archiving
  ever becomes a soft delete with data removal, this decision must be revisited rather than inherited.

### Neutral

- The **self-projection read** class added to §8 alongside this one (resolving `api-sync-report.md`
  **OQ-2**) is a separate, independent classification and is not governed by this ADR: it covers
  membership-scoped reads that declare no Permission, which is a read concern, not a mutation
  exception.
- `transferWorkspaceOwner` is unaffected. It is Workspace-scoped, and a Workspace has no archived
  state.

## Links

- [`spec.md`](../spec.md) AC-11, AC-12, AC-12a, AC-36, AC-36a, §1
- [`sad.md`](../sad.md) §5, §6.3, §6.7a, §8 Authorization coverage, §11
- [ADR 0001](./0001-two-level-request-authorization.md) — the two guards, vocabularies and metadata
  keys this classification is declared against
- [`contracts/api-sync-report.md`](../contracts/api-sync-report.md) — **OQ-1**, resolved here
- [`contracts/openapi.yaml`](../contracts/openapi.yaml) — `transferWarehouseManager`
- [T26](../tasks/reshape-access-rest.md) — declares the classification on the handler
- [T30](../tasks/two-level-authorization-coverage-check.md) — the architecture check that enforces it

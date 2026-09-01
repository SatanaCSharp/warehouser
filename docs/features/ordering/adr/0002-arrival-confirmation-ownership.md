---
status: Accepted
owner: 'Tech Lead'
reviewers: ['Backend Lead', 'Security Lead']
updated_at: '2026-08-25'
feature_size: 'XL'
ticket: ''
---

# 0002 — Arrival Confirmation is owned by `purchase-drafts` and delegates the demand effect

## Context

[ADR 0001](./0001-entity-owned-ordering-modules.md) places the Purchase Draft and the Customer Order
in separate modules. Arrival Confirmation is the one operation that writes to both
([`spec.md`](../spec.md) AC-17, AC-17b, AC-18): it records the quantity that actually arrived for
each Purchase Draft Line, assigns part of it to each linked Customer Order, reduces each of their
Outstanding Quantities, marks as Fulfilled any that reaches nothing, and moves the draft to Closed.

`spec.md` §6 "Arrival atomicity" requires 100% of confirmations to record every received quantity,
every Allocation and every resulting Outstanding Quantity together, or none of them. `spec.md` §6.1
"Allocation as a back door onto a frozen record" requires that the operation reach nothing else on
the frozen draft. `spec.md` §8's fifth open question, resolved in [`sad.md`](../sad.md) §8, requires
the AC-18 bounds to be re-checked against rows locked at the moment of recording.

The invariants divide cleanly but the operation does not. The draft's state guard, the once-only rule
and the received quantities are Purchase Draft invariants. The three AC-18 bounds, the Outstanding
Quantity arithmetic and the Unfulfilled → Fulfilled transition are Customer Order invariants — the
same ones AC-19b enforces from the amendment side, where no draft is involved at all.

## Decision drivers

- One transaction is mandatory (`spec.md` §6 "Arrival atomicity").
- Customer Order state rules must have exactly one implementation, because AC-19b reaches them from
  the amendment path too; two copies would drift.
- A frozen draft's other columns must not be reachable from this write path (`spec.md` AC-15, §6.1).
- [Server architecture](../../../system/server-architecture.md) §"Dependency direction": services
  never call use cases; modules communicate "through exported use-case modules, explicit services, or
  events"; no `forwardRef()` to conceal an ownership problem.
- The dependency edge must stay one-directional, since `customer-orders` already reads draft link rows
  for Coverage.
- The lock order must be the same one the amendment path uses, or §6.9 and §6.10 deadlock.

## Considered options

- **A — `purchase-drafts` owns everything**, writing the Customer Order effects itself through one
  specialized shared repository that locks the draft, its lines, its links and the linked orders and
  writes the whole outcome in one operation.
- **B — `purchase-drafts` owns the command and delegates the demand effect** to an allocation service
  `customer-orders` exports, called inside the transaction the confirmation opens.
- **C — `customer-orders` owns the confirmation**, because its observable effect is on demand, reading
  and closing the draft through a service `purchase-drafts` exports.

## Decision outcome

Chosen: **B.**

`purchase-drafts/domain/services/arrival-confirmation.service.ts` carries `@Transactional()` and owns
the operation: it locks the draft row, then its lines, then the linked Customer Orders in ascending
identifier order; refuses a draft not in Ready for Ordering; records the received quantity of each
line; calls `DemandAllocationService`, exported from `customer-orders`' use-case module, to validate
the AC-18 bounds against the locked rows and apply the Allocations; then moves the draft to Closed.
`@Transactional()` propagation makes all of it one transaction, so atomicity holds without either
module enforcing the other's rules.

Option A was rejected because it puts the Unfulfilled → Fulfilled transition and the
allocation-versus-Outstanding bound inside `purchase-drafts`, where AC-19b's identical floor would
then live in `customer-orders` — two homes for one rule, which is exactly what ADR 0001's boundary was
drawn to prevent. Option C was rejected because the subject of the operation is the draft: it is the
draft that is confirmed, that may be confirmed only once, and that reaches Closed. Owning it in
`customer-orders` would invert the dependency edge into a cycle, since `customer-orders` already reads
draft rows for Coverage.

Two constraints ride with the decision:

- **The edge is one-directional.** `purchase-drafts` may import `customer-orders`' exported service.
  `customer-orders` reaches draft rows only through a shared repository, never by importing
  `purchase-drafts`. An architecture check asserts it (`sad.md` §10).
- **One lock order everywhere:** draft, then lines, then Customer Orders in ascending identifier
  order — the same order `sad.md` §6.10's amendment path takes.

## Consequences

### Positive

- Customer Order state rules have one implementation, reached from both the arrival and the amendment
  path, so AC-18 and AC-19b cannot drift apart.
- The frozen columns are not in any statement the confirmation issues, which makes `spec.md` §6.1's
  back-door requirement a property of the write path rather than a check.
- The atomicity requirement is met by the mechanism the repository already uses, with no new
  transaction machinery.
- The seam is a single injected service, so an integration test can inject a failure at it and prove
  the whole outcome rolls back.

### Negative

- One more locked read than option A would issue, because the demand side re-reads the Customer Orders
  it locks. At the `spec.md` §1 scale this sits comfortably inside the 500 ms mutation target, but it
  is a real cost and it grows with the number of links on one draft.
- The lock order is a convention rather than something the type system enforces. A third write path
  that takes the rows in another order reintroduces the deadlock; `sad.md` §11 carries it as a
  standing risk.
- `purchase-drafts` gains a compile-time dependency on `customer-orders`, so the two modules cannot be
  released independently.

### Neutral

- `customer-orders` exports one additional provider from its use-case module. Nothing else in its
  surface changes.
- The HTTP route stays `POST .../purchase-drafts/{id}/arrival` under `PURCHASE_DRAFTS:RECEIVE`
  regardless of which module implements the effect; the choice is invisible at the boundary.

## Links

- [`sad.md`](../sad.md) §4, §5, §6.9, §8
- [ADR 0001 — Entity-owned ordering modules](./0001-entity-owned-ordering-modules.md)
- [Server architecture](../../../system/server-architecture.md) §"Dependency direction"
- [Creating a server repository](../../../system/guides/creating-a-server-repository.md) §"Transactions and errors"

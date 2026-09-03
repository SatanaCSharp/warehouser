---
status: Accepted
owner: 'Tech Lead'
reviewers: ['Security Lead', 'Backend Lead', 'Frontend Lead']
updated_at: '2026-09-02'
feature_size: 'L'
ticket: ''
---

# 0001 — Observed Permissions: redact customer identity in the projection, do not deny the request

## Context

`spec.md` AC-09a requires that a Warehouse Member whose Role carries `PURCHASE_DRAFTS:WATCH` and
`CUSTOMER_ORDERS:WATCH` but **not** `CUSTOMERS:WATCH` opens a Purchase Draft, its Address Drift and the
consolidated demand and sees every one of them — with every customer name withheld, a Customer's and one
typed onto a Customer Order alike, together with the Delivery Addresses, the access notes, and any count
from which their number could be inferred. The read must still succeed; only the identity is withheld.

The authorization stage cannot express that today. `apps/server/src/shared/guards/warehouse-access.guard.ts`
reads the Permissions declared by `@RequiredPermission`, resolves **`permissionIds[0]`** against the acting
membership, and attaches an `AccessCurrentUser` carrying exactly one `permissionId`. The decorator's
signature is already variadic, which makes the gap worse rather than better: a handler that declares two
Permissions compiles, runs, and silently evaluates only the first. `spec.md` §8's first open question names
exactly this failure mode and defers the mechanism to `design`.

The decision reaches every read in `customer-orders` and `purchase-drafts` that carries a customer name —
fifteen already-shipped surfaces by `spec.md` §6.1's count — plus every read this feature adds, the shared
guard, the shared principal, and the response schemas in `packages/contracts`. Getting it wrong fails
silently and in the direction of disclosure: nothing errors, nothing logs, a member simply reads customer
identity they hold no Permission for. Reversing it after those surfaces ship means re-cutting the
authorization contract of every read in the application. It therefore passes the feature ADR blast-radius
gate.

## Decision drivers

- AC-09a must **not** become "require both Permissions": that would deny a member the draft they legitimately
  read, contradicting the criterion's own closing clause — "continues to show that member everything their
  own Permissions do admit".
- A missed surface must fail **loudly and mechanically**, not silently. The rule has to be checkable by an
  automated architecture check, because a review pass over fifteen shipped surfaces plus every future one is
  not a control.
- The `spec.md` §6 authorization target of 50 ms p95 must survive; the stage must not gain a round trip.
- `spec.md` §6 "Authority staleness" requires every authorization decision to re-read Roles, Permissions and
  memberships from the store on the request being authorized. A redaction decision is an authorization
  decision.
- Guards are shared transport infrastructure and must not decide target-resource ownership
  ([server architecture](../../../system/server-architecture.md)); redaction is about _what a projection
  contains_, which is a query's concern.
- The existing guard, decorators, principal and two-level model are approved, tested infrastructure
  ([workspaces ADR 0001](../../workspaces/adr/0001-two-level-request-authorization.md)); this should extend
  that shape rather than replace it, and must not introduce a third guard or a third Permission vocabulary.
- A mechanism that can only ever _narrow_ what is returned is safer than one that participates in admission,
  because a mistake in it cannot widen access.

## Considered options

1. **An observed (never-required) Permission resolved by the guard and carried on the principal.** A handler
   declares `@ObservedPermission(PermissionId.CUSTOMERS_WATCH)` beside its single `@RequiredPermission`. The
   guard resolves the required Permission exactly as today and, in the same bounded grant read, resolves the
   declared observed Permissions, attaching the granted subset to `AccessCurrentUser` as
   `observedPermissionIds`. `canActivate` never consults it. Each identity-bearing query builds its
   projection from that field — the redacted form never selects the withheld columns.
2. **Require both Permissions at the guard.** `@RequiredPermission` starts meaning "all of these", and the
   identity-bearing reads declare both.
3. **Resolve the second Permission inside the query.** The query injects `AccessCurrentUserRepository` and
   asks whether the actor holds `CUSTOMERS:WATCH` before building its projection.
4. **Split every identity-bearing read into two endpoints** — a redacted one under the surface's own
   Permission and a full one additionally requiring `CUSTOMERS:WATCH` — and let the browser choose.
5. **Redact in the browser.** The server returns everything; the web hides customer identity behind a
   `WarehousePermissionGate`.

## Decision outcome

Chosen: **option 1 — an observed Permission, resolved by the guard, carried on the principal, consumed by
the projection.**

Option 5 is rejected outright and is listed only because it is the smallest diff: the data would still be on
the wire, so it is not a boundary at all. `spec.md` §6.1 counts a disclosure as an incident whether or not a
screen rendered it.

Option 2 is rejected because it denies the request. A member holding `PURCHASE_DRAFTS:WATCH` would lose the
draft entirely, which contradicts AC-09a and would also break AC-18a's requirement that drift reaches a
draft-watching member.

Option 4 is rejected because it doubles the read surface — six projections become twelve endpoints, twelve
contracts and twelve permission declarations — and it moves the decision to the caller. A browser that
requests the wrong one is a disclosure bug in the client, which is precisely where a confidentiality boundary
must not live.

Option 3 is rejected on two counts. It adds a store round trip inside every identity-bearing read, against
the 50 ms authorization target and the 400 ms read target that `spec.md` §6 says must not regress. More
importantly it puts an authorization read inside a use case, where no architecture check can find it: the
whole value of option 1 is that the declaration sits on the handler as metadata, so "every read whose response
schema can carry a customer-identity field declares the observed Permission" is a check a machine performs
(`sad.md` §10).

Option 1's decisive property is that **an observed Permission cannot widen access.** It is read only after the
required Permission has already admitted the request; `canActivate` does not consult it; and a handler that
declares only observed Permissions and no required one is denied exactly as an undecorated handler is today.
The worst outcome a mistake in it can produce is a surface that withholds identity from someone entitled to
it — visible, reportable, and safe.

## Consequences

### Positive

- AC-09a is expressible without weakening any existing read, and without a second guard or a second Permission
  vocabulary.
- The rule lives in one field consumed by six projections rather than in fifteen surfaces' worth of ad-hoc
  checks.
- It is mechanically checkable: a response schema that can carry a customer-identity field and a handler that
  declares the observed Permission are tied together by an architecture check, so a new surface added a year
  from now cannot forget.
- No round trip is added. The grant read the guard already issues widens its identifier list by one.
- The mechanism is general. A later feature needing another projection-shaping Permission declares one; it
  does not invent a second mechanism.

### Negative

- The shared authorization stage is changed by a feature. `docs/system` and
  [workspaces ADR 0001](../../workspaces/adr/0001-two-level-request-authorization.md) describe the stage, so
  both must be updated **in this change** or the documented stage becomes wrong.
- There are now two kinds of Permission declaration on a handler, and confusing them is a real mistake:
  declaring `CUSTOMERS:WATCH` as _required_ on the draft read would deny AC-09a's member the draft. Naming and
  the guard-unit tests in `sad.md` §10 are what keep them apart.
- `AccessCurrentUser` grows a field that most handlers leave empty.
- Redaction correctness is now a property of six queries. Each needs its own test on both sides of the
  Permission; a projection that forgets to consult the field leaks, and only a test catches it.

### Neutral

- The web is unaffected. It already reads the actor's full capability projection through `useHasPermission`,
  so `CUSTOMERS:WATCH` gates the client's rendering through the shipped mechanism with no new client concept —
  and the server's redaction is independent of it, as it must be.
- The existing single-Permission behaviour of `@RequiredPermission` is unchanged. Its variadic signature stays
  as misleading as it is today; tightening it to a single argument is a worthwhile cleanup this ADR does not
  require.

## Links

- [`../sad.md`](../sad.md) §1 goal 1, §2 proposed deviation, §4, §5, §6.1, §7, §8, §10
- [`../spec.md`](../spec.md) AC-09, AC-09a, §6.1, §6 "Authorization coverage", §8 first open question
- [Two-level request authorization](../../workspaces/adr/0001-two-level-request-authorization.md)
- [Server architecture](../../../system/server-architecture.md) §REST, §"Dependency direction"
- [Declarative permission gates](../../../system/adr/19-08-2026-declarative-permission-gates.md)

---
status: Accepted
owner: 'Tech Lead'
reviewers: ['Security Lead', 'Backend Lead']
updated_at: '2026-09-21'
feature_size: 'L'
ticket: ''
---

# 0001 — Authorize a Panel that needs several watch Permissions from the resolved-grant set, one endpoint per Panel

## Context

Each Warehouse Panel is admitted by a **set** of watch Permissions, and the sets differ
(`spec.md` §6.1):

| Panel                | Permissions required together                                     |
| -------------------- | ----------------------------------------------------------------- |
| Coverage Gap         | `CUSTOMER_ORDERS:WATCH` + `ITEMS:WATCH` + `PURCHASE_DRAFTS:WATCH` |
| Arrival Timing       | `CUSTOMER_ORDERS:WATCH` + `PURCHASE_DRAFTS:WATCH`                 |
| Purchasing Pipeline  | `PURCHASE_DRAFTS:WATCH`                                           |
| Reason Concentration | `REJECTIONS:WATCH`                                                |

No Permission is common to all four, so there is no single Permission a whole-surface handler could
declare as required. And
[`server-request-authorization.md`](../../../system/guides/server-request-authorization.md)
§ "Declare the Permission a handler requires" is explicit that `@RequiredPermission` is variadic but
the guard evaluates only the first identifier — "never use it to mean 'all of these'". Two of the
four Panels therefore have no expressible required declaration today.

The acceptance criteria constrain the answer further. AC-13 requires that a Panel the actor may not
read be **absent** — "no frame, no title and no count" — so the member learns neither that refusals
exist nor that anything was withheld. AC-02a requires the permitted Panel to occupy the surface "as
though the other three had never been part of it". AC-02 requires that when no Panel's whole set is
held the surface is one non-enumerating denial that does not disclose which Permission fell short.
And `spec.md` §6 "Read shape" fixes the transport at "≤ 1 round trip per chart, each awaited before
the surface is presented, and 0 reads issued after it is presented".

## Decision drivers

- A Panel's Permission set is a conjunction; the guard admits on one identifier.
- A refusal must never enumerate which Permission was missing (AC-02, AC-13, §6.1 abuse cases).
- §6 fixes one round trip per chart, which makes a per-Panel endpoint the transport the
  specification already assumes.
- The repository has an established mechanism for "resolve a second Permission without letting it
  decide admission": `@ObservedPermission`, whose safety property is structural rather than
  conventional — `WarehouseAccessGuard.canActivate` never reads the resolved set.
- Whatever is chosen becomes the pattern for every later read whose subject spans two record
  families, so it should add no mechanism the authorization guide does not already carry.

## Considered options

1. **One endpoint per Panel. The narrowest Permission is `@RequiredPermission`; the remainder of the
   conjunction is `@ObservedPermission`; the query asserts the full set from
   `AccessCurrentUser.observedPermissionIds` and refuses with the shared non-enumerating denial.**
2. **Widen the guard to evaluate a conjunction** — make `@RequiredPermission`'s variadic signature
   mean "all of these", or add a second decorator that does.
3. **Decompose each Panel into one read per Permission and compose in the browser** — Coverage Gap
   becomes an on-hand read (`ITEMS:WATCH`), an outstanding read (`CUSTOMER_ORDERS:WATCH`) and an
   inbound read (`PURCHASE_DRAFTS:WATCH`), joined per Item on the client.
4. **One endpoint per surface** returning only the Panels the actor may read, with some Permission
   nominated as required.

## Decision outcome

Chosen: **option 1 — one endpoint per Panel, conjunction asserted from the resolved-grant set.**

The required Permission of each Panel endpoint is the one governing the records the Panel is
**keyed by**, and every other member of its set is declared observed:

| Panel                | `@RequiredPermission`   | `@ObservedPermission`                            |
| -------------------- | ----------------------- | ------------------------------------------------ |
| Coverage Gap         | `ITEMS:WATCH`           | `CUSTOMER_ORDERS:WATCH`, `PURCHASE_DRAFTS:WATCH` |
| Arrival Timing       | `CUSTOMER_ORDERS:WATCH` | `PURCHASE_DRAFTS:WATCH`                          |
| Purchasing Pipeline  | `PURCHASE_DRAFTS:WATCH` | —                                                |
| Reason Concentration | `REJECTIONS:WATCH`      | —                                                |

The query reads the resolved set through a named predicate in
`dashboards/domain/predicates/`, and `assert`s it before issuing any read, raising the one
non-enumerating error from `shared/access/access-denial.errors.ts`. Every Workspace Panel is
admitted by the single new Workspace Permission, so none of this applies to that surface.

**This is a narrowing read of the principal, and it stays one.** The guard's admission properties
are untouched: an ungranted observed Permission still cannot deny at the guard, a granted one still
cannot admit, and no branch in `canActivate` consults the set. What the query does with the set is
the same act
[delivery-addresses ADR 0001](../../delivery-addresses/adr/0001-observed-permission-redaction.md)
established for a field and
[arrival-inspection ADR 0001](../../arrival-inspection/adr/0001-payload-conditional-permission.md)
established for a write — withhold, rather than widen — applied to the whole of one response rather
than a property of it. `purchase-drafts` already withholds an entire sub-structure this way:
`readsRejectionCause` removes a line's Rejections, their Reasons, Sources and Dispositions from the
projection. A Panel is that same act at its limit.

**The normal path never reaches the refusal.** The route loader reads the Permission projection it
already fetches (`accessPermissionsApi.getCurrentAccess`, the shape
`loaders/item.loader.ts` established) and dispatches only the Panel reads whose full set the actor
holds. The page renders the Panels that returned. So absence is produced by not asking, which is
what makes AC-13's "no frame, no title and no count" a property of the layout rather than of a
response the client must interpret. The server-side assertion is the enforcement boundary behind
that, not the mechanism the surface is built on.

### Why not the others

- **Option 2** changes the contract of a shared guard that every protected handler in the
  application composes, to serve one feature. It would also make `@RequiredPermission`'s existing
  variadic signature mean something different from what every current call site means by it, which
  is a silent behaviour change across the tree rather than an addition. The authorization guide
  already forecloses it: "If a handler seems to need two required Permissions, it is either two
  handlers or a case for an observed Permission."
- **Option 3** moves the arithmetic into the browser, which breaks two §6 targets outright:
  aggregation integrity ("each aggregation is computed in its own context and only then set beside
  the others") stops being a server property, and one round trip per chart becomes three. It also
  puts AC-05 (never a negative Uncovered Quantity) and AC-06a (no quantity multiplied by the row
  count beside it) in client code where no integration check reaches them.
- **Option 4** has no honest required Permission to nominate. Whichever is chosen, an actor holding
  only one of the other three is denied the whole surface, contradicting AC-02a — which requires a
  member holding `PURCHASE_DRAFTS:WATCH` alone to be served the Purchasing Pipeline. It also
  collapses four round trips into one, which contradicts §6's stated read shape rather than
  improving on it.

## Consequences

### Positive

- No new authorization mechanism, no guard change, and no new metadata key. The feature composes
  `SessionAuthGuard` + `WarehouseAccessGuard` exactly as every other Warehouse read does.
- The refusal is the application's single non-enumerating denial, so AC-02's disclosure rule is
  satisfied by reuse rather than by new copy.
- One endpoint per Panel matches §6's read shape literally, and makes each Panel's latency, index
  needs and exclusion counts separately measurable.
- A later Panel that needs a different conjunction adds one more observed identifier and one more
  predicate, and nothing else.

### Negative

- A Panel's authorization is now stated in two places that must agree: the decorators on the handler
  and the assertion inside the query. A handler that declares an observed Permission the query never
  asserts silently serves data to an actor who should not have it. This is the failure mode the
  verification strategy targets directly — every Panel query is tested on both sides of every member
  of its set (`sad.md` §10), and that is not optional coverage.
- The choice of which member is "required" is a judgement, not a derivation. It decides which denial
  an unauthorized caller gets from the guard rather than from the query, which is invisible
  externally — both are the same error — but matters when reading a failure in logs.
- Four endpoints means four route declarations, four contracts and four loaders per surface where a
  single-endpoint design would have one.

### Neutral

- The resolved-grant read is unchanged in cost: the observed identifiers only widen the `IN` list of
  the bounded grant read the guard already issues, so the query count per request is the same as for
  any other Warehouse-guarded handler.
- The Workspace surface is unaffected. Its four Panels share one Permission and one guard, and
  declare no observed Permission at all.

## Links

- [Server request authorization](../../../system/guides/server-request-authorization.md)
- [delivery-addresses ADR 0001 — Observed Permissions](../../delivery-addresses/adr/0001-observed-permission-redaction.md)
- [arrival-inspection ADR 0001 — Payload-conditional Permission](../../arrival-inspection/adr/0001-payload-conditional-permission.md)
- [workspaces ADR 0001 — Two-level request authorization](../../workspaces/adr/0001-two-level-request-authorization.md)
- [`spec.md`](../spec.md) §6.1, AC-02, AC-02a, AC-13

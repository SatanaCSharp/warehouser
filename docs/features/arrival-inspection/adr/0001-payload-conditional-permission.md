---
status: Accepted
owner: 'Tech Lead'
reviewers: ['Security Lead', 'Backend Lead']
updated_at: '2026-09-07'
feature_size: 'L'
ticket: ''
---

# 0001 — Refuse a Rejection-carrying ending from the resolved-grant set, not from a second required Permission

## Context

`spec.md` §6.1 states the product's first authorization rule whose required Permission set is decided
by **what is being written** rather than by the operation alone: recording a line's ending requires
`PURCHASE_DRAFTS:RECEIVE` **and** `REJECTIONS:CREATE` together when that ending refuses part of what
was presented (AC-01a), and `PURCHASE_DRAFTS:RECEIVE` alone when it refuses nothing (AC-01b).
`spec.md` §8 (sixth question, due **before `design`**) records the stated default — "extend the
stage" — without saying which extension.

The shipped stage cannot express it, and its failure mode is silent.
[Server request authorization](../../../system/guides/server-request-authorization.md) §"Declare the
Permission a handler requires" states it outright: `@RequiredPermission` is variadic, the guard
evaluates `permissionIds[0]`, and "a second one is silently ignored — never use it to mean 'all of
these'." `warehouse-access.guard.ts:63` is that line of code. The same section names the two
sanctioned answers — "it is either two handlers or a case for an observed Permission below" — and
`@ObservedPermission` exists, resolving declared Permissions in the **same** bounded grant read
(`AccessCurrentUserRepository.resolveRequiredPermission`, one widened `IN` list, no extra round trip)
and attaching the granted subset to the principal as `AccessCurrentUser.observedPermissionIds`
([delivery-addresses ADR 0001](../../delivery-addresses/adr/0001-observed-permission-redaction.md)).

What that guide does **not** sanction is what this feature needs. It confines the resolved set to one
purpose — "The set is a projection input and nothing else" — and forbids "derive a required
Permission from the observed set, or vice versa". AC-01a is not a projection: it is a **refusal of a
write**, decided from the same resolved set.

The two Permissions cannot be collapsed. `REJECTIONS:CREATE` is separately assignable precisely so a
Warehouse can let a member record what arrived without letting them decide that goods are unfit, and
AC-01b requires that member's refusal-free ending to keep working.

## Decision drivers

- AC-01a must refuse a Rejection-carrying ending, **record no part of it**, and name the missing
  capability. AC-01b must admit the same member's refusal-free ending on the same route.
- The one ending is atomic (`spec.md` §6 "Ending atomicity"): the Condition Split, the Pre-receipt
  Conformance, every Rejection and every Allocation land together or not at all. Authorization may
  not split that transaction.
- `spec.md` §6 "Authorization evaluation" holds the stage at p95 ≤ 50 ms **including** this rule, so
  no extension may add a store round trip.
- The property that makes `@ObservedPermission` safe must survive intact: an ungranted observed
  Permission cannot deny **at the guard**, and a granted one cannot admit anywhere. That property is
  structural in `canActivate`, not a matter of discipline, and
  `warehouse-access.guard.spec.ts` enumerates it.
- Whatever is chosen becomes the shape every later payload-conditional rule copies.

## Considered options

1. **Widen `@RequiredPermission` to a conjunction.** The guard evaluates every declared identifier
   and denies unless all are granted. Expresses "both", but not "both _when the payload refuses_":
   declaring both on the ending route denies AC-01b's refusal-free ending outright. It would also
   turn a decorator that is documented as "exactly one" into one whose arity changes meaning, so
   every existing variadic call site silently changes behaviour if a stray second argument was ever
   passed.
2. **Split the route.** A Rejection-carrying ending gets its own sub-resource declaring
   `REJECTIONS:CREATE`; the plain route's contract has no `rejections` property at all. Fully
   conformant — no shared-infrastructure change whatsoever — and it follows the repository's own
   "the kind is the route, not the payload" precedent
   (`confirm-purchase-draft-line-arrival.command.ts`). Costs: it doubles the ending routes to four
   (arrival / arrival-with-refusals × via-warehouse / direct-to-customer), duplicating one atomic
   write path across four commands and four contracts; the route becomes a function of data the
   member only settles at submission time rather than of a fact known when the dialog opens; and the
   refusal AC-01a wants named arrives as the deliberately non-enumerating `accessDeniedError` from
   `shared/access/access-denial.errors.ts`, so the server cannot tell the member which capability is
   missing — only the client's knowledge of which route it called could, which is inference, not a
   server guarantee.
3. **Read the resolved-grant set in the command.** The ending route declares
   `@ObservedPermission(PermissionId.REJECTIONS_CREATE)` beside its one required
   `PURCHASE_DRAFTS:RECEIVE`. The guard resolves it exactly as it resolves `CUSTOMERS:WATCH` today
   and changes nothing else. The ending command reads
   `currentUser.observedPermissionIds` and, **only when its input carries at least one Rejection**,
   asserts the grant is present, refusing with a typed, named error before any write.
4. **A third metadata key** (`@ConditionalPermission`) resolved identically but read only on the deny
   side. Buys an intention-revealing name at the cost of a third vocabulary for one mechanism —
   which is the confusion the two existing keys exist to prevent — and every reader must then learn
   that two of the three keys resolve the same way.

## Decision outcome

Chosen: **option 3 — read the resolved-grant set in the command.**

No guard, decorator, principal or repository changes. `WarehouseAccessGuard.canActivate` still never
consults the resolved set; `resolveRequiredPermission` still issues one bounded read; the principal
still carries `observedPermissionIds` frozen and is still never returned to the browser. The change
is entirely in what a **handler's own rules** are permitted to do with a field they were already
handed.

One rule governs that permission, and it is stated as a property rather than as a convention:

> The resolved-grant set may be read to **narrow** what an already-admitted request may do — to
> withhold a field from a projection, or to refuse an operation whose payload requires a capability
> the actor does not hold. It may never be read to **widen** anything: no branch anywhere may treat a
> granted observed Permission as substituting for a missing required one.

That asymmetry is what keeps the safety argument in
[server request authorization](../../../system/guides/server-request-authorization.md) §"Why an
observed Permission cannot deny" true where it matters. That section is a claim about **admission**,
and admission is still decided entirely by `request.user`, the unambiguous `warehouseId`, the
`granted` flag for the one required Permission, and the archived check. A narrowing read cannot make
a denied request succeed; the worst a mistake in it can produce is an operation refused to someone
entitled to it — visible, reportable, and never a disclosure. The existing wording, "the set is a
projection input and nothing else", is **too narrow and must be corrected in this same change**; see
§ Links.

Consequences of the shape, stated so `data-model`, `api` and `tasks` do not re-derive them:

- The refusal is a domain refusal of `purchase-drafts`, not an access denial. It is a named predicate
  plus a named error factory under `purchase-drafts/domain/errors/`, asserted with `assert`,
  propagated without local `try/catch`, and mapped once at the global filter under a stable
  `ErrorCode` — `purchase_drafts.rejection_capability_required`
  ([server error handling](../../../system/guides/server-error-handling.md)). That is precisely what
  lets it name the missing capability, which AC-01a requires and option 2 cannot deliver.
- It is asserted **inside** the ending's `@Transactional()` boundary and before any write, so AC-01a's
  "records no part of the ending" is the transaction's own property rather than an ordering promise.
- It fires **only** on an input carrying at least one Rejection. A refusal-free ending never reads the
  set, so AC-01b is structurally unreachable by this rule rather than passing through a permissive
  branch.
- Both ending commands run it, so it is stated once in `purchase-drafts/domain/services/` rather than
  twice — two callers, which is the first extraction trigger in
  [server architecture](../../../system/server-architecture.md) §Services.
- The UI hides the refuse control without `REJECTIONS:CREATE`
  ([`design-handoff.md`](../design-handoff.md) § Implementation constraints). That is defence in
  depth; this rule is the guarantee.

## Consequences

### Positive

- AC-01a and AC-01b are satisfied on **one** route, one command, one contract and one transaction.
- The refusal can name the capability it needs, which the guard's non-enumerating denial cannot.
- Zero cost against `spec.md` §6's 50 ms authorization target: the grant is resolved in the read the
  guard already issues, and the command's check is an array membership test over a frozen field.
- The guard's structural safety property is untouched, and its existing spec cases keep proving it.
- The shape generalizes: the next payload-conditional capability declares one more observed
  Permission and one more predicate, with no new mechanism.

### Negative

- **`@ObservedPermission`'s name now under-describes it.** A reader who meets the decorator on the
  ending route may reasonably expect a projection and find a refusal. The mitigation is documentary,
  not structural: the guide amendment must state both reader kinds and the narrowing-only rule
  together. Option 4 would have fixed the name at the cost of a third vocabulary; that trade was
  refused.
- **An authorization-shaped decision now sits in a use case**, where a guard-metadata scan will not
  find it. `sad.md` §10 therefore requires an architecture check that every ending route declaring a
  `rejections`-bearing request schema also declares the observed Permission, plus an integration test
  on both sides of the grant — the check is what makes this mechanical rather than remembered.
- **It widens shared authorization semantics for one feature.** Like
  [delivery-addresses ADR 0001](../../delivery-addresses/adr/0001-observed-permission-redaction.md)
  before it, the promotion to `docs/system` belongs in **this** change, not the next.
- A hand-written client can still aim a Rejection-carrying payload at the route without the grant.
  That is the case the rule exists to refuse, and it is refused before any write — but it means the
  denial is reachable in production traffic rather than only in tests, and is logged as an ordinary
  application error.

### Neutral

- `AccessCurrentUser` is unchanged and still never leaves the server. The browser keeps gating from
  the Permission table it already reads through `WarehousePermissionGate`; no new client concept.
- The same route also declares `@ObservedPermission(PermissionId.CUSTOMERS_WATCH)` (inherited) and,
  on the reads, `REJECTIONS:WATCH`. The decorator is variadic and the guard passes the whole list
  into one read, so declaring several costs one widened `IN` list and no extra query.

## Links

- Supersedes nothing. Extends
  [delivery-addresses ADR 0001 — Observed Permissions](../../delivery-addresses/adr/0001-observed-permission-redaction.md)
  by adding a second, narrowing-only reader of the set that ADR introduced.
- Constrained by
  [workspaces ADR 0001 — Two-level request authorization](../../workspaces/adr/0001-two-level-request-authorization.md):
  the two levels, the two Permission vocabularies and the guard chain are unchanged.
- **Required system-documentation change, in this same change:**
  [server request authorization](../../../system/guides/server-request-authorization.md) §"Declare the
  Permissions a projection observes" and §"Rules" must replace "The set is a projection input and
  nothing else" with the narrowing-only rule stated above, and §"Why an observed Permission cannot
  deny" must say explicitly that it is a claim about admission at the guard. Route through
  `/system-docs`. Tracked in [`../sad.md`](../sad.md) §11.
- `spec.md` §6.1 (the Permission table and the two-Permission rule), §8 sixth question, AC-01a,
  AC-01b.

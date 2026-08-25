---
status: Accepted
owner: 'Tech Lead'
reviewers: ['Security Lead', 'Backend Lead']
updated_at: '2026-08-25'
feature_size: 'XL'
ticket: ''
---

# 0003 — Per-member write rate limiting as a shared guard with a per-instance counter

## Context

[`spec.md`](../spec.md) §6.1 lists "draft and demand spam" as an abuse case and states the
mitigation: "recording demand, creating drafts, and adjusting On-hand Quantity are rate limited to 60
recorded changes per minute per member, and a denial from that limit reveals nothing about existing
records."

No rate limiting exists anywhere in the repository. `apps/server/package.json` carries no throttler
dependency, `apps/server/src/shared/guards/` holds only `SessionAuthGuard`, `WarehouseAccessGuard`
and `WorkspaceAccessGuard`, and `docs/system` describes no such mechanism. Redis is a planned
dependency that is not installed
([server architecture](../../../system/server-architecture.md) §"Runtime applications"), so no shared
counter store is available today. `spec.md` §6 states its throughput target "per running service
instance", which tells us the operational model is per-instance but says nothing about how a
per-member limit should behave across instances.

This is therefore not an inherited system choice being applied — it is new cross-cutting
infrastructure that one feature is introducing, which every later feature will either reuse or
duplicate.

## Decision drivers

- The specification names a concrete limit, so shipping without one is a gap against an approved
  abuse-case mitigation.
- Redis is not available, and introducing it is deployment work outside this feature's scope
  (`sad.md` §3).
- Enforcement is transport-level, so it belongs in `shared/guards/`, never in a feature module
  ([adding a server module](../../../system/guides/adding-a-server-module.md) §1).
- A denial must disclose nothing about existing records (`spec.md` §6.1), which constrains where in
  the guard chain it composes.
- Whatever is chosen becomes the repository's answer, so it must be honest about what it does and does
  not enforce.

## Considered options

- **A — `@nestjs/throttler` with its default in-memory storage**, applied through a thin wrapper guard
  keyed on the acting member.
- **B — A hand-rolled `WriteRateLimitGuard`** in `shared/guards/`, with an in-process fixed-window
  counter keyed on the acting member and a `@WriteRateLimited()` metadata decorator.
- **C — Defer enforcement to a reverse proxy or edge tier**, and document the limit as an operational
  configuration rather than application behaviour.
- **D — Wait for Redis** and ship the release with the limit unenforced.

## Decision outcome

Chosen: **B — a hand-rolled `WriteRateLimitGuard` in `shared/guards/` with a per-instance in-memory
fixed-window counter**, declared per handler with `@WriteRateLimited()` and composed **after**
`SessionAuthGuard` and `WarehouseAccessGuard`.

Composing after the access guards is what satisfies the disclosure requirement: an actor who is not
authorized is denied by the access guard and never reaches the counter, so a rate-limit refusal cannot
be used to distinguish "this Warehouse has records" from "this Warehouse does not".

Option A was rejected because `@nestjs/throttler` brings decorator surface, storage abstractions and
configuration semantics well beyond one counter, and its per-instance memory store has exactly the
same multi-instance behaviour as B — so the dependency buys nothing this feature needs. Option C was
rejected because a limit enforced only in deployment configuration is invisible to the test suite and
cannot be traced to the acceptance criterion it mitigates. Option D was rejected because it ships an
approved abuse-case mitigation as absent.

**The gap is recorded, not hidden.** With one running instance the guard enforces exactly 60 recorded
changes per minute per member. With N instances and per-instance counters, a member distributed across
them can reach N × 60. `sad.md` §8 and §11 carry this, and it is revisited when Redis lands and a
shared counter costs no new infrastructure.

**This is feature-introduced system infrastructure.** It lives in `shared/guards/` because that is
where the architecture puts enforcement, but `docs/system` does not yet describe it. It must be
promoted to a `docs/system` document — and this ADR superseded by a system ADR — the moment a second
feature declares `@WriteRateLimited()`.

## Consequences

### Positive

- The specification's stated mitigation ships as application behaviour, testable at the guard level
  and traceable to `spec.md` §6.1.
- No new runtime dependency, no new infrastructure, and nothing that presumes Redis.
- Opt-in per handler, so a read can never acquire a write limit by accident and the three limited
  operations are visible by grepping one decorator.
- Composing after the access guards makes the non-disclosure property structural rather than a
  property of the error message.

### Negative

- The limit is not global. Under horizontal scaling the effective ceiling multiplies by the instance
  count, which is a real divergence from the specification's wording and is why it is recorded in two
  places.
- In-process state makes the guard's behaviour dependent on process lifetime: a restart resets every
  window.
- One more piece of cross-cutting infrastructure owned by a feature ADR rather than by `docs/system`,
  which is a documentation debt with a named trigger for repayment.

### Neutral

- One new stable `ErrorCode` for the refusal, and one new decorator in `shared/decorators/`.
- Memory cost is bounded by the number of distinct members acting within one window, which is
  negligible at the scale in `spec.md` §1.

## Links

- [`sad.md`](../sad.md) §2, §5, §8, §11
- [`spec.md`](../spec.md) §6.1 "Draft and demand spam"
- [Server architecture](../../../system/server-architecture.md) §"Runtime applications"
- [Adding a server module](../../../system/guides/adding-a-server-module.md) §1

---
id: T4
title: 'Add WriteRateLimitGuard and the @WriteRateLimited() decorator to shared/guards'
layer: 'infra'
deps: []
acs: []
files_hint:
  [
    'apps/server/src/shared/guards/write-rate-limit.guard.ts',
    'apps/server/src/shared/guards/write-rate-limited.decorator.ts',
  ]
owner: 'Security Lead'
estimate: 'S'
status: 'todo'
---

# T4 — Add WriteRateLimitGuard and the @WriteRateLimited() decorator to shared/guards

> **Blocked by:** — (can start immediately) · **Layer:** `infra` · **Owner:** Security Lead · **Estimate:** S
> **Acceptance criteria:** — (traced to `spec.md` §6/§6.1, not §5 — see Notes)

## Why

The draft-and-demand-spam abuse case in [spec §6.1](../spec.md) caps recorded changes at 60 per minute per member. Decided in [ADR 0003](../adr/0003-per-member-write-rate-limit.md) and placed in [sad §5 `shared/guards`](../sad.md). It gates the three `ports` tasks, so it starts in parallel with the migrations.

## What

- Add `shared/guards/write-rate-limit.guard.ts` with a per-instance in-memory counter keyed by member and minute window.
- Add the `@WriteRateLimited()` decorator the mutating handlers will declare.
- Compose it **after** `SessionAuthGuard` and `WarehouseAccessGuard` so a rate-limit denial cannot be used to probe.
- Do not change `SessionAuthGuard`, `WarehouseAccessGuard`, `@RequiredPermission` or `@ArchivedTolerantRead`.

## Definition of Done

- [ ] Guard unit tests prove per-member per-minute counting and window reset
- [ ] A test proves the guard runs after the access guards, so an unauthorized actor is refused by authorization rather than by the limit
- [ ] A test proves the refusal is non-enumerating: it reveals nothing about existing records
- [ ] lint + vet clean

## Notes

- This task carries no `acs` entry: the rate limit is a `spec.md` §6.1 abuse case, not a §5 acceptance criterion. Traceability is to §6.1 and ADR 0003.
- The counter is per running instance, so N instances give an effective N × 60. Recorded in ADR 0003 and `sad.md` §11 rather than hidden; revisited when a shared counter is available at no new infrastructure cost.
- `sad.md` §11: this is new cross-cutting infrastructure introduced by one feature. Promote it to `docs/system` the moment a second feature declares `@WriteRateLimited()`.

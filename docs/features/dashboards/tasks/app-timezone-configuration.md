---
id: T4
title: 'Introduce APP_TIMEZONE as the single bound parameter every week, band and on-time verdict is computed against'
layer: 'wiring'
deps: []
acs: ['AC-07', 'AC-10', 'AC-14', 'AC-16', 'AC-20b']
files_hint:
  - 'apps/server/.env.example'
  - 'apps/server/src/shared/config/'
  - 'apps/server/src/app.module.ts'
owner: 'Backend Lead'
estimate: 'S'
status: 'todo'
---

# T4 — Introduce APP_TIMEZONE as the single bound parameter every week, band and on-time verdict is computed against

> **Blocked by:** —
> **Satisfies:** AC-07, AC-10, AC-14, AC-16, AC-20b — see [spec.md §5](../spec.md)
> **Owner:** Backend Lead · **Estimate:** S · **Layer:** `wiring`

## Why

Three figures cannot be computed without a timezone, and all three shift a whole calendar day
across an offset: Order Flow's week (AC-16), the On-time Arrival Rate's verdict (AC-20b), and
today — from which Overdue, both band sets and the eight-week horizon are derived
([data-model.md § Time, timezone and the week](../data-model.md)).

## What

One server configuration value, `APP_TIMEZONE`, an IANA zone name, default `UTC`:

- the `APP_TIMEZONE=UTC` line in `apps/server/.env.example`;
- the `ConfigService` read, exactly as `LOG_LEVEL` is read;
- the value passed to the repository layer as a **bound query parameter**.

The week start needs no configuration at all: PostgreSQL's `date_trunc('week', …)` is ISO-8601 and
begins the week on Monday, which is `spec.md` §8's stated default.

## Definition of Done

- [ ] `apps/server/.env.example` carries `APP_TIMEZONE=UTC`
- [ ] An invalid zone name fails startup, proven by a unit test
- [ ] The value reaches the repositories as a bound parameter, not as a connection `TimeZone`
      setting — asserted by an integration test that buckets the same instant into two different
      weeks under two different values
- [ ] No existing local environment file is read, printed or overwritten
- [ ] `oxlint --type-aware --max-warnings=0` clean over every staged file, and the
      commit passes the repository's Git hooks without `--no-verify`

## Notes

It is **not** a column: nothing in the product records a per-Warehouse, per-Workspace or per-user
timezone, and adding one is a business decision `spec.md` §3 puts out of scope.

It is **not** the session's `TimeZone`: relying on the connection's implicit zone makes the same
query answer differently depending on how the pool was opened, and is untestable.

Local credentials policy: `.env.example` is the only environment-value file this task may read or
write, and it takes only the documented placeholder value.

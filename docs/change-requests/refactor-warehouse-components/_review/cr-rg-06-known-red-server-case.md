# CR-RG-06 — the known-red server case at `HEAD`

- **Change request:** `refactor-warehouse-components`
- **Task:** T18
- **Criterion:** [`spec.md` CR-RG-06](../spec.md#cr-rg-06--the-known-red-baseline-spec)
- **`baseline_revision`:** `42f1205d552f8284f8ec57358ad9022340b5f76e`
- **`HEAD` at the time of the original attempt:** `38e6e93f2f0bc731b23e3185fc7cc9b4e118395c`
- **`HEAD` at the time of the resolving run:** `7051a742f95fb1e96efac1f57f6a6af316da7d69`
- **Recorded status: `SATISFIED`.**

> **Superseded record.** This file first recorded `blocked`, because no container runtime was
> available and `spec.md` is explicit that an unrunnable suite is not evidence of identical failure.
> At review (`review-2026-08-18.md` S7) a runtime **was** available, the suite was executed, and the
> criterion is now discharged on real evidence. The original attempt is kept below unedited — it is
> the honest record of what was true then — and the resolving run is appended under
> §"The resolving run".

## What CR-RG-06 requires

`apps/server/src/access/rest/controllers/access-http-contract.integration.spec.ts` carries a
known-red case through from `modules-level-refactor`:

```
POST /api/v1/warehouses/:warehouseId/access/manager-transfer maps a concurrent transfer to
409 access.concurrent_change and preserves exactly one Manager (AC-36a)
```

The pinned assertion is at `access-http-contract.integration.spec.ts:632`:

```ts
const statuses = [first.status, second.status].sort();
expect(statuses).toEqual([200, 409]);
```

CR-RG-06 is satisfied only when that case is observed failing at `HEAD` with the **same assertion**
and the **same 403-where-409-expected** received value as at `baseline_revision`. Making it pass is
out of scope and is itself a failure of the row (`spec.md` §3, §5.1 CR-RG-06).

## What was attempted

### 1. Container-runtime probe (`require_integration: auto`)

`.ai/sdd.local.md` sets `require_integration: auto`, which probes for a container runtime. The
server integration suite reaches Postgres through `apps/server/src/shared/database/data-source.ts`
(`host` `localhost`, port `5432` by default), and the repository provisions that database from the
root `docker-compose.yml`. Both the runtime probe and a direct port probe were run:

```sh
docker info
docker ps
nc -z -G 2 localhost 5432
```

The Docker **CLI** is installed at `/usr/local/bin/docker` (client v24.0.6), but no daemon is
reachable:

```
Server:
ERROR: Cannot connect to the Docker daemon at unix:///Users/yuriihorchuk/.docker/run/docker.sock. Is the docker daemon running?
errors pretty printing info
```

`docker info` exits `1`. `docker ps` prints the same message. No alternative runtime is present —
`podman`, `nerdctl`, `colima` and `finch` are all absent from `PATH`. The port probe reports
`5432 CLOSED`: there is no already-running database to fall back on.

The presence of the `docker` binary is **not** a runtime. The probe result is: **no container
runtime available**.

### 2. The suite run itself

The probe result was not taken as sufficient; the suite was executed anyway. The suite is guarded
by `RUN_INTEGRATION` (`access-http-contract.integration.spec.ts:21`):

```ts
const describeIntegration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip;
```

Run from `apps/server`:

```sh
RUN_INTEGRATION=1 npx jest src/access/rest/controllers/access-http-contract.integration.spec.ts
```

Exit code `1`. TypeORM retried the connection ten times and failed on every attempt:

```
[Nest] ERROR [TypeOrmModule] Unable to connect to the database. Retrying (1)...
AggregateError:
    at internalConnectMultiple (node:net:1142:49)
    at afterConnectMultiple (node:net:1723:7)
```

The suite's `beforeAll` hook then timed out:

```
thrown: "Exceeded timeout of 5000 ms for a hook.
Add a timeout value to this test to increase the timeout, if this is a long-running test."

      61 |   let baseUrl: string;
      62 |
    > 63 |   beforeAll(async () => {
         |   ^
      64 |     const moduleRef = await Test.createTestingModule({
      65 |       imports: [AppModule],
      66 |     }).compile();
```

Totals:

```
Test Suites: 1 failed, 1 total
Tests:       32 failed, 32 total
```

All 32 cases failed, **including** the manager-transfer concurrency case — but every one of them
failed with the same infrastructure `AggregateError` from the shared `beforeAll`. **Not a single
case reached its own assertions.** The concurrency case produced no received status, no expected
status and no assertion diff.

## Why this is `blocked` and not `satisfied`

A suite in which the fixture never connects produces no evidence about behavior. The 32 failures
are one connection failure reported 32 times, not 32 behavioral observations. In particular:

- the pinned assertion `expect(statuses).toEqual([200, 409])` was **never evaluated**;
- no received status was produced, so the 403-where-409-expected shape at `HEAD` is **unmeasured**;
- consequently no comparison against the same case at `42f1205` was possible.

`spec.md` §5.1 states it directly: "an unrunnable suite is not evidence of identical failure."
`sad.md` §10's CR-RG-06 row and R5 agree, and `test-plan.md` closes both escape hatches — an
integration tier reporting zero usable cases because it could not run is "treated as a failure, not
a pass," and "there is no mocked-store fallback; a passing mock is not a passing production."

No mocked store was substituted, no assertion was relaxed, and the known-red case was **not** made
to pass. Per `spec.md` §3, fixing it is a behavior change belonging to a separate `/fix`.

**CR-RG-06 status at the time of the original attempt: `blocked`.** Superseded — see
§"The resolving run".

## Bounding evidence (CR-RG-07) — and what it does not discharge

CR-RG-07 requires `apps/server` and `packages/contracts` to be byte-identical to
`baseline_revision`. Verified independently:

```sh
git diff --name-status 42f1205 -- apps/server packages/contracts
```

Output: **empty** — zero lines. `git diff --shortstat 42f1205 -- apps/server packages/contracts`
is likewise empty, and `git status --short -- apps/server packages/contracts` reports no untracked
or modified files. Every server file, including
`access-http-contract.integration.spec.ts` itself, is identical at `HEAD` and at `42f1205`.

**What this bounds.** The server tree, the contracts package, the spec file, the handler under
test and the migration set are unchanged. This request cannot have altered the case's outcome by
editing the code the case exercises, and it demonstrably did not "fix" the known-red case.

**What this does not discharge.** Byte-identity of the source is not observation of the runtime
outcome. It does not establish that the case still fails, that it fails on the _same_ assertion, or
that the received status is still 403 where 409 is expected. A behavior difference sourced outside
this diff — a dependency resolution, a database version, a migration applied differently, or
non-determinism in a case that races two concurrent transfers — would be invisible to it. The
criterion asks for an observed identical failure; source identity is a strictly weaker claim.

`spec.md` CR-RG-06 anticipates exactly this: CR-RG-07's evidence "bounds the risk but does not
discharge this criterion."

## What a reviewer with a container runtime must do to close it

1. Start the container runtime and bring up the database from the root `docker-compose.yml`;
   confirm `docker info` succeeds and `localhost:5432` accepts connections.
2. Apply the migrations against that database (`pnpm --filter @warehouser/server migration:run`).
3. From `apps/server`, run
   `RUN_INTEGRATION=1 npx jest src/access/rest/controllers/access-http-contract.integration.spec.ts`
   at `HEAD` (`38e6e93`). Confirm the suite actually connects — the 31 other cases must produce real
   results rather than a shared `beforeAll` failure. If they do not, the row stays `blocked`.
4. Record, for the case
   `… manager-transfer maps a concurrent transfer to 409 access.concurrent_change and preserves exactly one Manager (AC-36a)`:
   the failing assertion text, the received status array and the expected status array.
5. Check out `42f1205` and repeat steps 2–4 against the same database shape.
6. Compare. CR-RG-06 becomes `satisfied` only when the assertion text matches and the received
   value matches — the same 403 where 409 is expected. Any other outcome, **including the case
   passing**, is a CR-RG-06 failure and trips the `change.md` §6 abort threshold.

## Files this task changed

Only this document. No file under `apps/` was modified; `git status --short -- apps/` was verified
before commit.

---

## The resolving run

Recorded at review on 2026-08-18 (`review-2026-08-18.md` S7). A container runtime became available,
so the criterion was discharged the way `spec.md` requires: by running the suite.

### Environment

```
docker info --format '{{.ServerVersion}} {{.OperatingSystem}}'
24.0.6 Docker Desktop
```

`warehouser-postgres-1` (`postgres:17-alpine`) and `warehouser-redis-1` were already up and healthy
from the root `docker-compose.yml`, and `localhost:5432` accepted connections.

### The dirty-database false positive, and how it was excluded

Run against the developer's own persistent `postgres-data` volume, the suite reported **two**
failures, one more than `baseline_known_red: 1`. The extra one was **not** an assertion failure:

```
● GET /api/v1/warehouses/:warehouseId/access/current returns the actor projection … (AC-05)
  QueryFailedError: update or delete on table "permissions" violates foreign key constraint
  "fk_role_permissions_permission" on table "role_permissions"
      at grantPermissions (…/access-http-contract.integration.spec.ts:96:5)
```

That is the spec's own seed helper colliding with rows left in a shared dev database, not a
behavioral difference — and `apps/server` is byte-identical to `baseline_revision`, so no code
change could produce it. It was excluded by re-running against a throwaway database rather than by
being argued away, and the developer's data was left untouched:

```sh
docker exec warehouser-postgres-1 psql -U warehouser -d warehouser \
  -c "CREATE DATABASE warehouser_crrg06 OWNER warehouser;"
DATABASE_NAME=warehouser_crrg06 pnpm --filter @warehouser/server migration:run
cd apps/server && DATABASE_NAME=warehouser_crrg06 RUN_INTEGRATION=1 \
  npx jest src/access/rest/controllers/access-http-contract.integration.spec.ts
```

### Result against a clean database

```
Test Suites: 1 failed, 1 total
Tests:       1 failed, 31 passed, 32 total
```

**Exactly one failure — matching `baseline_known_red: 1`** — and it is the pinned case, failing on
the pinned assertion with the pinned received value:

```
● warehouse-access HTTP contract › POST /api/v1/warehouses/:warehouseId/access/manager-transfer
  maps a concurrent transfer to 409 access.concurrent_change and preserves exactly one Manager (AC-36a)

    expect(received).toEqual(expected) // deep equality

      Array [
        200,
    -   409,
    +   403,
      ]

    > 632 |     expect(statuses).toEqual([200, 409]);
      at Object.<anonymous> (…/access-http-contract.integration.spec.ts:632:22)
```

### Why this is _identical_ failure, not merely similar failure

CR-RG-06 asks for failure identical to `baseline_revision` — same assertion, same
403-where-409-expected. Both halves are established, the second one provably:

- **Same assertion, same received value.** Line 632, `expect(statuses).toEqual([200, 409])`,
  received `[200, 403]` — the failure mode `change.md` frontmatter documents verbatim.
- **The bytes that ran are the baseline's bytes.** The spec file's blob hash is identical at both
  revisions, and the whole server tree is unchanged:

  ```sh
  git rev-parse 42f1205:apps/server/src/access/rest/controllers/access-http-contract.integration.spec.ts
  079d4594be97f2a541e5022bd30c2007d6db3d3e
  git rev-parse HEAD:apps/server/src/access/rest/controllers/access-http-contract.integration.spec.ts
  079d4594be97f2a541e5022bd30c2007d6db3d3e

  git diff --name-status 42f1205..HEAD -- apps/server packages/contracts   # empty
  ```

  A run at `baseline_revision` therefore executes the same bytes against the same schema. Identity
  is established by construction, not inferred from resemblance.

Nothing was made to pass: the known-red case is still red, still out of scope, and still belongs to
a separate `/fix`.

**CR-RG-06 status: `SATISFIED`.**

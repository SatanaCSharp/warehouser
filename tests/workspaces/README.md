# Workspaces release verification

The deterministic gates complement the `workspaces` domain, repository, command, REST,
architecture, and rendered-web suites. They evaluate captured evidence without reading local
environment files or credentials.

Run them with:

```sh
pnpm test:workspaces-release
```

Before release, the Backend Lead supplies captured outcomes from a release-like 600-second load
run — sustaining a representative mix of Workspace-level operations (context read, Workspace Role
and Member reads, a rename, a Role assignment, a Warehouse create/rename, a selection write)
against a `persistWorkspaceGraph`-seeded database — to `evaluateWorkspaceLoad`. The run must
contain at least 30,000 terminal Workspace operations, reach at least 50 operations per second per
running service instance, and sustain for at least 600 seconds.

Pass captured per-stage durations to `evaluateLatencySamples`. Each of the five `spec.md` §6 stages
has its own p95 limit:

| Stage                  | p95 limit |
| ---------------------- | --------- |
| workspaceAuthorization | 50 ms     |
| warehouseAuthorization | 50 ms     |
| read                   | 250 ms    |
| mutation               | 500 ms    |
| warehouseSelection     | 250 ms    |

Pass captured Warehouse-authorization-stage durations for a member holding 1 membership and a
member holding ~50 memberships to `evaluateWarehouseAuthorizationIndependence`. It asserts both
p95s are within the `warehouseAuthorization` limit above and that the high-membership p95 does not
drift from the low-membership p95 beyond ordinary measurement noise — the structural proof that
the stage does not grow with how many Warehouses a member belongs to (`spec.md` §6, `sad.md` §8
"Performance and diagnostics").

Timing evidence for every stage comes only from the existing `withOperationTiming` structured Pino
fields (`apps/server/src/shared/logger/with-operation-timing.ts`) — this repository adds no
telemetry SDK, metrics client, exporter or collector.

Repository tests prove the evaluators against synthetic data. They do not manufacture live load,
database, or approval evidence — a human must run the real 600-second session (or the opt-in
`apps/server/src/workspaces/workspaces-load-smoke.integration.spec.ts` with `RUN_INTEGRATION=1`
against a disposable database) and feed the captured outcomes into these functions at release
time.

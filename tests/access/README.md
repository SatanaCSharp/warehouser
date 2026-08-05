# Access release verification

The deterministic gates complement the access domain, repository, command, REST, architecture,
and rendered-web suites. They evaluate captured evidence without reading local environment files or
credentials.

Run them with:

```sh
pnpm test:access-release
```

Before release, the Security Lead supplies captured outcomes from a release-like 600-second load
run to `evaluateAccessLoad`. The run must contain at least 30,000 terminal protected operations,
reach 50 operations per second per service instance, and keep added authorization p95 at or below
50 ms. Pass captured read and mutation durations to `evaluateLatencySamples`; their p95 limits are
250 ms and 500 ms respectively.

The same release session must pass failure-injection results for registration, assigned-Role
deletion, and manager transfer to `auditAtomicOutcomes`, record no partial failed outcomes, run the
catalogue reconciliation against live rows, and retain the authorization-coverage result.

Repository tests prove the evaluators and integrated behavior. They do not manufacture live load,
database, or approval evidence.

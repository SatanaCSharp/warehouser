# Access release evidence

Run date: 2026-08-04

| Gate                                 | Result               | Evidence                                                                                                                                                                                                                                                                                                     |
| ------------------------------------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Deterministic release checks         | pass                 | `pnpm test:access-release`                                                                                                                                                                                                                                                                                   |
| Catalogue reconciliation logic       | pass                 | server reconciliation unit suite                                                                                                                                                                                                                                                                             |
| Authorization classification         | pass                 | `tests/access/authorization-coverage.spec.mjs`                                                                                                                                                                                                                                                               |
| Web administration workflows         | pass                 | web interaction suite, lint, and build                                                                                                                                                                                                                                                                       |
| PostgreSQL access integration        | pass                 | `RUN_INTEGRATION=1 pnpm --filter @warehouser/server test -- --runInBand access-persistence.spec.ts register-access.integration.spec.ts auth-registration.service.spec.ts`: 3 suites, 20/20 tests                                                                                                             |
| 600-second protected-operation load  | pass                 | 600.066 s against the local service and PostgreSQL: 30,050/30,050 guarded Role reads and 6,010/6,010 Role mutations completed, zero HTTP failures, 50.078 protected operations/s                                                                                                                             |
| Live p95 latency evidence            | pass                 | Guarded Role-read/authorization p95 45.951 ms (limits: 50 ms added authorization and 250 ms Role read); Role-mutation p95 61.454 ms (limit: 500 ms)                                                                                                                                                          |
| Failure-injection atomicity evidence | approved disposition | PostgreSQL failure triggers prove rollback for registration, assigned-Role deletion after reassignment, and manager transfer after demotion; 19/19 focused integration tests passed with no partial state. Security Lead accepted this evidence without the test plan's separate 1,000 mixed-attempt session |
| Security Lead approval               | approved             | Approved by the Security Lead on 2026-08-04 after reviewing the recorded release-like load and failure-injection outcomes                                                                                                                                                                                    |

T14 is approved for completion. Every release gate passed or has the explicitly recorded Security
Lead disposition above.

## 2026-08-04 release-like session notes

- The first service start failed before traffic because Nest could not construct
  `ProvisionInitialAccessCommand`; after a test-first optional-runtime injection fix, the next start
  exposed the same defect in `CreateRoleCommand`. Both commands now have Nest-construction
  regression coverage and the service boots successfully.
- A clean 599.059-second run was rejected as evidence because it missed the literal 600-second
  duration requirement. The passing rerun scheduled traffic through t=600 and measured 600.066
  seconds wall-clock.
- Database-backed verification passed 5 suites and 32 tests covering access persistence,
  registration failure injection, catalogue reconciliation, assigned-Role deletion behavior, and
  manager-transfer behavior. All three atomic workflows now have database-level injected-failure
  coverage; the release-defined 1,000-attempt mixed session is still outstanding.
- `pnpm test:access-release` passed 4/4 deterministic release checks, including authorization
  classification and evidence evaluators.

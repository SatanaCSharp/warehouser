# Users-management release verification

The deterministic gates complement the users-management domain, repository, command, REST, and
rendered-web suites. They evaluate captured evidence without reading local environment files or
credentials.

Run them with:

```sh
pnpm test:users-release
```

Before release, the Tech Lead supplies captured outcomes from a release-like 600-second load run
against the four lifecycle operations (create, email-change, password-change, delete) to
`evaluateUsersLoad`. The run must contain at least 18,000 terminal lifecycle operations, reach at
least 30 operations per second per running service instance, and sustain for at least 600 seconds.

Pass captured per-operation durations to `evaluateLatencySamples`. Each of the four lifecycle
operations has its own p95 limit from `spec.md` §6:

| Operation      | p95 limit |
| -------------- | --------- |
| creation       | 400 ms    |
| emailChange    | 300 ms    |
| passwordChange | 300 ms    |
| deletion       | 500 ms    |

Repository tests prove the evaluators against synthetic data. They do not manufacture live load,
database, or approval evidence — a human must run the real 600-second session and feed the
captured outcomes into these functions at release time.

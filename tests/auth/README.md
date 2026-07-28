# Auth release verification

This directory contains the feature-level gates that complement the auth unit, integration, REST,
and rendered-router suites. The checks deliberately accept synthetic or captured evidence instead
of reading local environment files or production credentials.

Run the deterministic release-gate tests with:

```sh
pnpm test:auth-release
```

Before release, the Tech Lead supplies captured outcomes from a 600-second, even sign-up/sign-in
workload to `evaluateLoadSmoke`. The run must contain at least 12,000 attempts, reach at least 20
terminal outcomes per second, keep each action's p95 at or below 500 ms, and produce a business
outcome for at least 99.9% of eligible attempts.

The same release session must:

- pass real Account/User rows to `auditIdentityIntegrity` and record zero orphan identifiers;
- pass captured storage, telemetry, log, analytics, and user-visible text plus the synthetic
  submitted secrets to `auditSecretLeaks` and record zero matches;
- pass the approved frame names and file sizes to `verifyApprovedPreviews`;
- run `pnpm audit` and record any Security Lead-approved vulnerability disposition;
- record keyboard, focus, accessibility, desktop/mobile visual comparison, Product approval, and
  Security approval in the feature review evidence.

The repository tests prove the algorithms and the integrated auth journeys. They do not manufacture
live load results, approval decisions, or vulnerability dispositions.

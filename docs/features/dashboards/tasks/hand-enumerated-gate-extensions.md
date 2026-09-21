---
id: T22
title: 'Extend the four hand-enumerated structural gates that would otherwise skip this feature silently'
layer: 'tests'
deps: [T12, T14, T16, T19]
acs: ['AC-02', 'AC-13', 'AC-15', 'AC-24']
files_hint:
  - 'apps/server/src/dashboards/module-boundaries.spec.ts'
  - 'apps/web/src/test/loader-permission-parity/'
  - 'apps/web/src/test/module-boundaries/'
  - 'apps/web/src/test/route-readiness/'
owner: 'Tech Lead'
estimate: 'M'
status: 'todo'
---

# T22 — Extend the four hand-enumerated structural gates that would otherwise skip this feature silently

> **Blocked by:** [T12](./warehouse-dashboard-rest-surface.md) · [T14](./workspace-dashboard-rest-surface.md) · [T16](./warehouse-dashboard-shell-ui.md) · [T19](./workspace-dashboard-module-ui.md)
> **Satisfies:** AC-02, AC-13, AC-15, AC-24 — see [spec.md §5](../spec.md)
> **Owner:** Tech Lead · **Estimate:** M · **Layer:** `tests`

## Why

**Four structural gates that would prove this feature's authorization coverage pin their subjects as
literals, and silently skip what they do not list.** A loader they do not name is not checked rather
than reported, and the server's `module-boundaries.spec.ts` is one file per module — so a module
without one has no boundary check at all. Extending them is implementation work this feature owns,
not something a green run will demand ([sad.md §8](../sad.md), [sad.md §10](../sad.md)).

## What

- **Create** `apps/server/src/dashboards/module-boundaries.spec.ts`.
- `apps/web/src/test/loader-permission-parity/` — both new loaders in `LOADER_FILES` and
  `PARITY_ROWS`, with a named constant per loader path.
- `apps/web/src/test/module-boundaries/` — `modules/workspace-dashboard` in `MODULE_MANIFEST` and
  `MODULE_SURFACE`.
- `apps/web/src/test/route-readiness/` — `ROUTES.WORKSPACE_DASHBOARD`.

## Definition of Done

- [ ] All four gates list this feature's subjects
- [ ] **Each extension is proven to bite**: a deliberate temporary violation makes it fail, and the
      failure is recorded in the task's commit message before being reverted. A gate that passes
      without having been shown to fail proves nothing
- [ ] The server module-boundaries spec forbids `dashboards` importing another feature module and
      forbids any other module importing it
- [ ] The whole gate command set from [sad.md §10](../sad.md) runs green: server `lint` + `test` +
      `test:integration` + `test:architectural` + `build`, and web `lint` + `test` + `build`
- [ ] `pnpm --filter @warehouser/web build` is included and passes — the new contracts subpath is
      exactly the change whose failure is invisible to the test suites
- [ ] `oxlint --type-aware --max-warnings=0` clean over every staged file, and the
      commit passes the repository's Git hooks without `--no-verify`

## Notes

This is the task whose omission leaves the new code unchecked **with every suite green**. Treat a
green run before these extensions as no evidence at all.

`spec.md` §6 sets authorization coverage at 100% of the user-accessible capabilities this feature
introduces. These four gates plus the per-endpoint HTTP contract tests in
[T12](./warehouse-dashboard-rest-surface.md) and [T14](./workspace-dashboard-rest-surface.md) are
what that target rests on.

**What this cannot prove:** the §6 latency targets. The integration tier is PGlite — single-backend
WebAssembly, one major version ahead of production — and load and concurrency specs pass there for
the wrong reasons. The p95 targets are verified against a real PostgreSQL deployment or they are not
verified.

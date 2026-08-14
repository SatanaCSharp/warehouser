---
status: Accepted
owner: 'YuriiH'
reviewers: ['Tech Lead']
updated_at: '2026-08-14'
feature_size: 'L'
ticket: 'change-request:modules-level-refactor'
---

# 0001 — Declare each web module's public surface as an enumerated list read by the boundary spec

## Context

CH-W5 adds the first import-boundary enforcement `apps/web` has ever had. The rule it enforces
(change.md §2.1, spec.md §1, CR-AC-04) is that a file may reach into `modules/<x>/` only through that
module's **declared public surface** — sibling modules and the composition layer (`shared/`,
`guards/`, `routes/`, `router.ts`, `store/`, `test/`) alike, differing in reach rather than in
exemption. The spec must therefore be able to answer, mechanically, "is this import specifier part of
the target module's surface?"

Two facts constrain how that question can be answered.

The surface cannot be a **category**. change.md §2.1 rejects "page-level views" as the definition
because a category cannot be checked without re-deciding per file what counts as page-level, and a
rule that needs a judgement per file is not a rule a spec can run. sad.md §5.2 shows why the concrete
list is not obvious either: the real production import graph has nine entries, including every
module's `route` (imported by `router.ts`), `modules/auth/store/auth.slice` (imported by
`store/index.ts` and two test fixtures) and `modules/auth/store/auth.selectors` (imported by both
route guards) — six more than change.md predicted.

Web imports resolve through `baseUrl: ./src` with **no** tsconfig `paths` and no bundler alias
(change.md §4 "Tests"). Routes are lazy: `router.ts` registers each module's route object and the
page arrives through `lazyRouteComponent(() => import('./page'))`
([frontend architecture](../../../system/frontend-architecture.md) §"Runtime foundation",
[adding a web module](../../../system/guides/adding-a-web-module.md) §3). spec.md §6 makes "no new
eager chunk; lazy route boundaries preserved" a measured non-functional requirement.

## Decision drivers

- The rule must pass on day one with **zero per-file exceptions** — an import permitted _despite_
  violating the rule trips the §6 abort threshold (spec.md §6, CR-AC-04).
- The check must be mechanical and must name the offending file and the rule it broke (CR-AC-12).
- The mechanism must not alter production import sites, because every altered site is a chance to
  change the bundle and CR-RG-01 admits no behavior change.
- It must follow the enforcement pattern the repository already uses successfully — static source
  scan specs — rather than introduce a third mechanism; spec.md §3 explicitly rules out an
  import-boundary ESLint plugin.
- `modules/auth` already organizes `login/`, `sign-up/` and `sign-out/` as route sub-trees of one
  entity, so the mechanism must express flatness as module _identity_, not directory depth
  (sad.md §4.7).

## Considered options

**Option A — one enumerated declaration read as data.** A single committed module maps each module
name to the list of import specifiers other code may reach. The boundary spec imports it and fails
any `modules/**` import from outside that module which does not resolve to a listed entry.

```ts
// apps/web/src/test/module-surface.ts
export const MODULE_SURFACE = {
  warehouse: [
    'modules/warehouse/route',
    'modules/warehouse/components/workspace-administration/warehouses/WarehousesTab',
    'modules/warehouse/hooks/useRecordWarehouseEntry',
  ],
  access: [
    'modules/access/route',
    'modules/access/components/.../WorkspaceRolesTab',
    'modules/access/components/.../WorkspaceMembersTab',
    'modules/access/components/.../WorkspacePermissionsTab',
  ],
  auth: [
    'modules/auth/login/route',
    'modules/auth/sign-up/route',
    'modules/auth/session/session',
    'modules/auth/sign-out/components/SignOutButton',
    'modules/auth/store/auth.selectors',
    'modules/auth/store/auth.slice',
  ],
  workspace: ['modules/workspace/route'],
  home: ['modules/home/route'],
} as const;
```

**Option B — per-module `index.ts` barrels.** Each module exports its surface from
`modules/<x>/index.ts`; the rule collapses to "an import specifier naming `modules/<x>` may have no
further path segments", checkable from the specifier alone with no declaration to maintain.

```ts
// apps/web/src/modules/warehouse/index.ts
export { warehouseDashboardRoute } from './route';
export { WarehousesTab } from './components/.../WarehousesTab';
export { useRecordWarehouseEntry } from './hooks/useRecordWarehouseEntry';
```

## Decision outcome

Chosen: **Option A — one enumerated declaration read as data**, at
`apps/web/src/test/module-surface.ts`, consumed by
`apps/web/src/modules/module-boundaries.spec.ts`.

Option B is rejected on the bundle requirement. A barrel is a real module with real imports: any file
importing `modules/warehouse` pulls `route`, `page` and every re-exported component into its own
chunk, and `router.ts` imports every module's route. The lazy `import('./page')` boundary that
`frontend-architecture.md` prescribes would be defeated at exactly the point it matters most — the
router — which is the "no new eager chunk" NFR spec.md §6 measures. Option B also rewrites every
cross-module import site in a change request whose entire claim is that nothing changed, and it
cannot express `modules/auth/login/route` and `modules/auth/sign-up/route` as two distinct route
registrations without either re-exporting both from one barrel (widening `auth`'s surface beyond what
`router.ts` needs) or conceding that `auth` has three barrels — which is the nested-module ambiguity
sad.md §4.7 exists to close.

The declaration is placed under `src/test/` because it is data consumed only by a spec, and
[frontend architecture](../../../system/frontend-architecture.md) §"Testing" reserves `src/test` for
cross-cutting test setup. The spec is placed at `modules/module-boundaries.spec.ts` to mirror the
server's colocated `users/module-boundaries.spec.ts` naming.

The spec asserts three things:

1. `MODULE_SURFACE`'s keys are exactly the directories directly under `modules/` — the flat-module
   identity check (sad.md §4.7).
2. Every `modules/**` import from a file outside that module resolves to an entry in the target
   module's list.
3. `modules/workspace` contains exactly the file manifest CR-AC-03 enumerates.

## Consequences

### Positive

- Passes on day one with an empty exception list. All nine existing cross-module and
  composition-layer imports resolve to declared entries, and the four new
  `WorkspaceAdministration.tsx` tab imports are declared by CH-W1/CH-W2.
- No production import site changes, so the chunk graph is comparable to `baseline_revision`
  directly.
- The surface of the whole application is readable in one file, which is what makes review of a
  widening cheap: a PR that reaches into a module shows up as a one-line diff in a file whose only
  purpose is to record that decision.
- Expressible for `auth` without ambiguity: two route entries, a session module, a component and two
  store files — six entries under one module name, no barrel and no second module.

### Negative

- The declaration is not colocated with the module it describes and can drift from intent: a
  contributor may widen it instead of fixing a misplaced import. Mitigated only by review, plus the
  `modules/workspace` manifest that forces the ownership question to be answered (sad.md R5).
- Entries are string literals matched against import specifiers, so a file rename that misses the
  declaration fails the spec with a "not declared surface" message rather than "file moved" — a
  slightly indirect diagnostic.
- It records the surface without _enforcing_ it at the type level: nothing stops a module from
  exporting something it did not declare; the rule binds importers, not exporters.

### Neutral

- The rule is enforced only for `apps/web/src`. `packages/*` do not import `modules/**`, so there is
  no gap.
- Adopting per-module barrels later remains possible: the declaration would become the barrel's
  export list, and the bundle question would have to be re-answered against whatever code-splitting
  strategy exists at that time.

## Links

- [Change request — modules-level-refactor](../change.md) §2.1, §2.2, CH-W5, CH-D1, CH-D3
- [Change-request specification](../spec.md) §1, CR-AC-04, CR-AC-12, §6
- [SAD](../sad.md) §4.7, §5.2, §8, R5
- [Frontend architecture](../../../system/frontend-architecture.md) §"Runtime foundation",
  §"Source structure", §"Testing"
- [Adding a web module](../../../system/guides/adding-a-web-module.md) §3, §6
- [Placing web components](../../../system/guides/placing-web-components.md) §"When not to nest"
- Enforcement precedent: `apps/server/src/users/module-boundaries.spec.ts`,
  `tests/access/authorization-coverage-classifier.mjs`

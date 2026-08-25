# Domain-Owned Flat Modules in Both Applications

Status: Superseded by [Scope-of-exercise tiebreak for sole-consumer slices](./18-08-2026-scope-of-exercise-placement-tiebreak.md)

Date: 2026-08-14

## Context

Both applications are organized into feature modules — `apps/web/src/modules/<module>/` and
`apps/server/src/<module>/` — and both document what the layers _inside_ a module are for. Neither
states which module a given file belongs to. `server-architecture.md` says a module is named for
the business entity or capability it owns and that code stays in the owning module until it is
genuinely reused; `frontend-architecture.md` says to keep logic inside one module until another
module genuinely needs it and then promote it to `shared/`. Read together with the three module
guides, the layout rule is inferable only by combining five documents, each of which states a
different part of it, and none of the seven existing ADRs covers module structure at all.

The gap has a concrete cost. "Keep it in one module until another needs it" answers _when to
promote_ but never _who owns it_, so behavior belonging to one entity has accumulated inside the
module of the screen that happens to display it — Warehouse administration living under
`modules/workspace/components/workspace-administration/warehouses/` is the canonical example. The
same absence lets a capability exercised at two scopes be split into two modules, and lets a
contributor read a module's directory tree as its public API because nothing declares what that API
is.

Two further facts constrain any rule stated here. Neither application configures TypeScript path
aliases, so every intra-application import is a relative specifier. And on the server, HTTP route
prefixes are declared by `@Controller` decorators independently of source location, so the URL tree
and the module tree are already free to disagree.

## Decision

Modules in both applications are **owned by a domain and flat by identity**. The rule is one
sentence — _code lives in the module of the entity whose invariants it enforces, and reaches other
modules only through their declared public surface_ — and it applies to `apps/web/src/modules/` and
`apps/server/src/` alike.

**Ownership.** A module is named for the domain entity that owns the behavior it contains. One
entity owns exactly one top-level module: extend the existing owner rather than adding a second
module for the same entity. A capability exercised at several scopes lives in one module and carries
the views, use cases and endpoints for every scope, rather than being split by the scope that
invokes it. Placement follows the owning entity, not the screen, controller or URL that consumes the
behavior.

**Flatness is a property of module identity, not of directory depth.** The module list is exactly
the directories directly under `modules/` on the web and directly under `src/` on the server; only
those have a name, a public surface and an entry in the surface declaration. A module may organize
material for _its own entity_ into sub-directories — `apps/web/src/modules/auth/` holding `login/`,
`sign-up/` and `sign-out/` sub-trees, each with its own `route.tsx`, `page.tsx`, `components/` and
`schemas/`, is sanctioned and stays one module. What flatness forbids is a _second domain entity_
acquiring a home inside another module's tree, as in
`modules/workspace/components/workspace-administration/warehouses/`.

**Public surface.** A module may import another module only through that module's declared public
surface: the enumerated export list on the web, the module barrel and its exported NestJS modules on
the server. The web composition layer — `router.ts`, `store/index.ts`, `guards/`, `shared/layouts/`,
`test/` fixtures — is bound by the same rule. It differs in _reach_, being permitted to address any
module's surface rather than only a sibling's, not in _exemption_: it may not reach past a surface
into a module's internals.

**What is not a module.** Enforcement primitives stay outside the feature modules: NestJS
authentication and authorization guards in `apps/server/src/shared/guards/`, TypeORM persistence
entities in `apps/server/src/shared/domain/entities/`, and repositories in
`apps/server/src/shared/domain/repositories/`. Registering a guard in a module is not owning it.
Cross-module web helpers are promoted to `apps/web/src/shared/` under the existing reuse rule.

**Naming convention.** The web uses singular module names (`modules/warehouse`) and the server uses
plural ones (`src/warehouses`). Each application is internally consistent; this decision records the
divergence rather than renaming either side, because symmetry alone does not repay the churn.

## Alternatives

- **Leave the rule implicit across the five documents that partially state it**: rejected because a
  contributor following `docs/system` as instructed can arrive at a placement the architecture does
  not intend, and did — the existing `frontend-architecture.md` promotion advice, applied to
  Warehouse code inside the workspace module, reproduces exactly the layout this decision corrects.
- **Define flatness by directory depth ("one module = one directory containing a route")**: rejected
  because `modules/auth/` fails that test on day one, forcing an allowlist of sanctioned exceptions
  and making the exception list, rather than ownership, the operative rule.
- **Organize modules by consumer or by URL prefix — nest a module under the screen or route that
  uses it**: rejected because it makes ownership a function of the current UI and current API shape,
  so every navigation or endpoint change becomes a source move.
- **Unify the two applications on one boundary-enforcement mechanism, or adopt a dependency-graph or
  ESLint boundary plugin**: rejected here as a separate concern. The rule is one; the server keeps
  its static-source-scan specs and NestJS module exports, and the web reads an enumerated surface
  declaration. This ADR governs placement, not tooling.

## Consequences

- Placement questions have one answer to look up, and module names read as a list of the domain
  entities the system has.
- **Cross-module view imports become legal on the web.** A module's page may render another module's
  declared page-level view — `modules/workspace` composing tabs owned by `modules/warehouse` and
  `modules/access` — which the component-nesting guidance previously discouraged. The narrowing that
  makes this legal applies only to declared surface; reaching into an unexported component is still
  a violation.
- **Two modules may serve one URL prefix.** Because controllers keep their `@Controller` prefixes
  when they change module, a single prefix such as `api/v1/workspace` can be served by controllers
  from two modules. NestJS supports this as long as no two handlers claim the same method and path,
  but the URL tree stops being a reliable index of the source tree, and a route-inventory check is
  needed to prove nothing is shadowed or unreachable.
- **A wrongly-placed module is expensive to move.** Neither application configures TypeScript path
  aliases, so every import is relative: moving a module rewrites every importing file, its tests and
  its boundary declarations. The cost of getting ownership wrong is paid at correction time, which
  raises the stakes on the initial choice rather than lowering them.
- The decisive question — _whose invariants does this file enforce?_ — is not statically decidable.
  The mechanical checks (surface declarations, import graphs, module manifests) catch boundary
  crossings; the ownership judgment stays a human review step.
- `shared/` grows as multi-consumer helpers are promoted out of feature modules, and promotion
  decisions must be taken on the post-move consumer graph rather than the current one.
- Existing code that predates this decision is not automatically conformant. Modules discovered to
  hold another entity's behavior are corrected by a deliberate change, not opportunistically inside
  unrelated work.

## Links

- [Frontend architecture](../frontend-architecture.md)
- [Server architecture](../server-architecture.md)
- [System architecture description](../sad.md)
- [Adding a web module](../guides/adding-a-web-module.md)
- [Adding a server module](../guides/adding-a-server-module.md)
- [Placing web components](../guides/placing-web-components.md)

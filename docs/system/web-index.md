# Web Documentation Index

Table of contents for every `docs/system` document that governs work in `apps/web`. Read this index
first, then read only the entries that cover the change you are making. Paths are relative to
`docs/system/`.

## Architecture

- [Frontend architecture](frontend-architecture.md) — durable structure and ownership rules for
  `apps/web`: bootstrap/provider chain, the `src/` directory layout, route/page/component
  responsibilities, Redux Toolkit and RTK Query boundaries, guards, path constants, validation
  ownership, and the testing and UI-design boundaries. Read before any `apps/web` change, and always
  before adding a directory, slice, provider, or new layer.
- [System architecture description](sad.md) — repository-wide context, solution strategy, and
  cross-cutting concepts (contracts, frontend state and routing, localization, UI delivery). Read
  when a change touches more than `apps/web` or when you need the rationale behind a frontend rule.
- [Architecture map](architecture-map.md) — the containers that exist (`apps/web`, `apps/server`,
  `packages/*`), what each owns, and how the web dev server reaches the API. Read when you need to
  locate code or decide which container owns a responsibility.

## Guides

- [Adding a web module](guides/adding-a-web-module.md) — end-to-end procedure for a new route-owned
  feature: declare the path, create the module, wire route/page, add store and API slices. Use when
  adding a new route or feature module, or when moving state between modules.
- [Placing web components](guides/placing-web-components.md) — decides **where** a component file
  goes: the ownership-nesting rule, when to group owned components by domain, and when a component
  must stay unnested because it has more than one consumer. Use whenever a `components/` directory
  gains a second component.
- [Writing web components](guides/writing-web-components.md) — decides **what goes inside** a
  component file: one exported component per file, single reason to change, the two-hop prop budget,
  flat branching over `if` chains and element ternaries, event handlers declared and named above the
  `return`, and transient UI state owned by its trigger. Use when writing or refactoring any React
  component.
- [Writing web conditional components](guides/writing-web-conditional-components.md) — how a
  condition that decides which element renders is expressed inside JSX:
  `shared/components/Conditional` instead of a
  `condition ? <Thing /> : null` ternary or an `&&` gate, why both of its arms are evaluated, and
  how to resolve a branch whose props only exist under the condition. Use whenever a component
  renders something only some of the time.
- [Writing web dialogs](guides/web-dialogs.md) — the two components every modal workflow is built
  from and which one it takes: `FormModalDialog` when anything is validated, `ConfirmAlertDialog`
  when there is one decision and nothing to fill in. Covers the submit sequence `FormModalDialog`
  owns (validate → field errors → request → close only on success), how to write the `parse` step
  and its `translateValidation`, where a refusal code is explained, and who owns the open state.
  Use whenever adding or changing a dialog, and before assembling `Modal.*` or `AlertDialog.*`
  parts in a feature file.
- [Placing web hooks](guides/placing-web-hooks.md) — decides **which directory a hook file goes in**:
  the five names every `hooks/` directory uses (`queries`, `mutations`, `forms`, `projections`,
  `effects`), why a file that declares no hook belongs in `utils/` instead, and when a helper is
  promoted to `shared/utils`. Use when adding a hook, splitting one, or adding a pure helper.
- [Placing web tests](guides/placing-web-tests.md) — decides **where a spec file goes**: beside its
  subject by default, never one level above it, and — when no single file owns the behaviour — in its
  own dedicated directory under `src/test/`. Covers structural gates, specs spanning several owners,
  and what stays at the root of `src/test/`. Use when adding a spec, or when a spec covers more than
  one file.
- [Sharing web state with context](guides/sharing-web-state-with-context.md) — the only permitted
  React context shape: a state provider plus a dispatch provider in one file under
  `modules/<module>/context/`, consumed through named hooks. Use only after prop drilling and module
  hooks have been exhausted, and never for state Redux already owns.
- [Web error handling and action feedback](guides/web-error-handling.md) — normalizing API failures
  once at the RTK Query boundary, mapping them to form errors, and showing error/success alerts with
  translated copy. Use for any API error, form error, notification, or success-feedback work.
- [Adding and maintaining web localization](guides/adding-and-maintaining-web-localization.md) — how
  i18next is initialized, where namespace JSON lives under `public/locales/<language>/`, and how to
  add copy, a namespace, or a language. Use whenever you add or change user-visible text.
- [HeroUI design principles](guides/heroui-design-principles.md) — HeroUI v3's own principles mapped
  to this repository: semantic `variant` intent, compound components, token usage, and accessibility
  expectations. Use when building or reviewing UI with `@heroui/react`.
- [HeroUI React v3 docs index](guides/heroui-react-v3-docs-index.md) — the generated file index of
  the local HeroUI v3 documentation (`.heroui-docs/react`) with its components, handbook, and demo
  listings. Use to look up the exact doc or demo file to read **before** writing HeroUI code; what
  you remember about HeroUI v3 is not reliable.

## Shared with the server

- [Adding and using contracts](guides/adding-and-using-contracts.md) — when a Zod schema belongs in
  `packages/contracts` versus staying local, and how to add and consume one from `apps/web`. Use for
  any request or response shape crossing the web↔server boundary.

## Decisions

- [Gate web controls declaratively, never with capability booleans](adr/19-08-2026-declarative-permission-gates.md)
  — **Accepted; this is the decision that governs authorization in the UI.** Every decision about what
  the acting user may be offered is a gate component at the control it protects
  (`WarehousePermissionGate` at the Warehouse level, `WorkspacePermissionGate` at the Workspace level — one
  interface, `children` plus a required `permission`), or — inside a React Aria collection that admits
  no gate element — a descriptor carrying the same `permission` field, filtered by
  `usePermittedItems` / `useWorkspacePermittedItems`. Permissions are named as `PermissionId` /
  `WorkspacePermissionId` members at the surface that needs them; there is no capability table and no
  component takes a capability as a prop. A Permission is read as a boolean only where the answer
  feeds a query `skip`, a disabled control, or the choice between two whole surfaces — and only in the
  file that uses it. Read before gating any control, adding a Permission-dependent prop, or deriving a
  `canDoThing` value.
- [Trigger RTK Query's generated mutation hooks directly from components](adr/19-08-2026-generated-mutation-hooks-in-components.md)
  — **Accepted; this is the decision that governs how a component runs a mutation.** A component calls
  the generated `use<Endpoint>Mutation` hook itself; a mutation gets no wrapper hook whose only job is
  to decorate it. The three things such wrappers used to do now sit with their owners: the toast is a
  registry entry in `shared/alerts/mutation-actions.ts` raised by `mutationFeedbackMiddleware`, the
  field-error policy is the endpoint's `transformErrorResponse`, and `FormModalDialog` /
  `ConfirmAlertDialog` normalize the settled request with `mutationOutcome()`. A `use…` mutation hook
  is justified only when it composes more than one request. Read before adding a mutation endpoint, a
  success toast, or any hook under `hooks/mutations/`.
- [Scope-of-exercise tiebreak for sole-consumer slices](adr/18-08-2026-scope-of-exercise-placement-tiebreak.md)
  — **Accepted; this is the decision that governs placement.** Keeps the owning-entity rule below as
  the default and adds one tiebreak: where a slice's sole consumer exercises its capabilities at
  another scope, placement follows the scope of exercise. Also fixes the test for what makes a
  directory a module's _home_ rather than a component grouping, and states that a directory or
  namespace names the domain its contents address, not the module that renders them. Read before
  creating a module, placing a file in one, or importing across module boundaries.
- [Domain-owned flat modules](adr/14-08-2026-domain-owned-flat-modules.md) — **Superseded** by the
  decision above, and preserved as the record of why modules are named for the domain entity that
  owns their behavior, why they are flat by identity rather than by directory depth, and why
  cross-module access goes through a declared public surface that binds the composition layer too.
  Everything it decides still holds except the owning-entity tiebreak the successor narrows; read it
  for the reasoning, and the successor for the rule.
- [RTK Query for web API calls](adr/02-08-2026-rtk-query-for-web-api-calls.md) — why server-state
  access goes through one injected API slice with a shared base query. Read before adding any
  server call or considering a different data-fetching approach.
- [Serve centralized web translations from public locale directories](adr/27-07-2026-bundled-centralized-web-translations.md)
  — why translations are served from `public/locales` instead of bundled. Read before changing where
  translation resources live.
- [Schema validation with Zod](adr/12-07-2026-schema-validation-with-zod.md) — why Zod is the single
  validation technology across the monorepo. Read before introducing another validation library.

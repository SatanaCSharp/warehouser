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
  flat branching over `if` chains and nested ternaries, and transient UI state owned by its trigger.
  Use when writing or refactoring any React component.
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

- [RTK Query for web API calls](adr/02-08-2026-rtk-query-for-web-api-calls.md) — why server-state
  access goes through one injected API slice with a shared base query. Read before adding any
  server call or considering a different data-fetching approach.
- [Serve centralized web translations from public locale directories](adr/27-07-2026-bundled-centralized-web-translations.md)
  — why translations are served from `public/locales` instead of bundled. Read before changing where
  translation resources live.
- [Schema validation with Zod](adr/12-07-2026-schema-validation-with-zod.md) — why Zod is the single
  validation technology across the monorepo. Read before introducing another validation library.

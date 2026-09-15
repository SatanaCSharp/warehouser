# Web document selector — what you are about to write → what you must read

For production source under `apps/web/src`. Paths are relative to `docs/system/` (equivalently
`./docs-system/` inside this skill).

This table is a **starting selector, not the source of truth**. `docs/system/web-index.md` is
authoritative (`AGENTS.md`); read it in full every run and re-derive anything this table does not
cover from the index's own «when it applies» descriptions. When the two disagree, the index wins —
and report the disagreement so this file is corrected on the next
[`/sync-architecture-references`](../../../commands/sync-architecture-references.md) run.

Test files are out of scope for this skill; `guides/placing-web-tests.md` is listed below only so a
production change that moves a spec knows where the rule lives.

## The floor — always read, every run

| Document                              | Why it is always in the manifest                                                          |
| ------------------------------------- | ----------------------------------------------------------------------------------------- |
| `web-index.md`                        | The authoritative list of what governs `apps/web`, and the source of this table.          |
| `frontend-architecture.md`            | The owning architecture document: layout, ownership, layers, boundaries.                  |
| `architecture-map.md`                 | Container ownership — whether `apps/web` owns the responsibility at all.                  |
| The Accepted ADRs the change triggers | An Accepted decision outranks a guide, and both outrank sibling code. Which ones — below. |

Add `sad.md` whenever the change leaves `apps/web` or you need the rationale behind a frontend rule.

### Which ADRs the change triggers

Every entry in `web-index.md` §Decisions ends with a **«Read before …»** sentence naming what
triggers it — _"Read before building or changing any table"_, _"Read before gating any control"_,
_"Read before adding any server call"_. **That sentence is the selector.** An Accepted ADR whose
trigger your change matches is mandatory and is read in full; one whose trigger it does not match is
not. The selector table below already names the common ones per path.

Three qualifications, and they are what keep this from becoming a licence to skip:

- **When the trigger sentence is arguable, read the ADR.** Reading one you did not strictly need
  costs a few thousand tokens; missing one costs a rewrite. Ambiguity resolves toward reading.
- **Creating a file, moving one, or importing across a module boundary always triggers
  `adr/18-08-2026-scope-of-exercise-placement-tiebreak.md`**, whatever else the change does.
  Placement is decided before the file exists and is the expensive half of the mistake.
- **A Superseded ADR is never in the floor.** `adr/14-08-2026-domain-owned-flat-modules.md` is
  Superseded; the index routes to it for reasoning only, and the rule is its successor's.

## Selector — what the change touches → add to the manifest

| You are writing or changing                                                                         | Read as well                                                                                                                                                |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A new `src/modules/<module>/`, a module barrel, or state moved between modules                      | `guides/adding-a-web-module.md`; `adr/18-08-2026-scope-of-exercise-placement-tiebreak.md` (`adr/14-08-2026-domain-owned-flat-modules.md` for the reasoning) |
| `src/routes/`, `src/router.ts`, `src/guards/`, a `route.tsx`, a module `loaders/`                   | `guides/adding-a-web-module.md`; `frontend-architecture.md` §route/page/component responsibilities                                                          |
| **Any** component file — new, moved, or edited                                                      | `guides/placing-web-components.md` (where it goes), `guides/writing-web-components.md` (what goes in it)                                                    |
| A second component appearing in one `components/` directory                                         | `guides/placing-web-components.md` §ownership nesting                                                                                                       |
| **Any conditional at all** — an `if`, an `else`, a ternary, an `&&` gate in JSX                     | `guides/writing-web-components.md` §6 (the unconditional ban on the `if`/`else if` chain) **before writing it**                                             |
| JSX that renders an element only some of the time                                                   | `guides/writing-web-conditional-components.md` (`shared/components/Conditional`)                                                                            |
| A modal, `Modal.*` / `AlertDialog.*` parts, `FormModalDialog`, `ConfirmAlertDialog`, a `parse` step | `guides/web-dialogs.md`                                                                                                                                     |
| A dialog opened from a list row, a table row, or a row's menu                                       | `guides/web-action-dialogs.md`; `adr/27-08-2026-reducer-driven-action-dialogs.md`                                                                           |
| A data table, a `Table.Collection`, a cell renderer, row nesting or expansion                       | `adr/27-08-2026-heroui-table-for-web-data-tables.md` (a cell renders a component, not an expression)                                                        |
| Any `hooks/` directory, a new or split hook, a `utils/` helper, a promotion to `shared/utils`       | `guides/placing-web-hooks.md`                                                                                                                               |
| `src/store/`, a slice, an RTK Query endpoint, `shared/api/`, any server call                        | `adr/02-08-2026-rtk-query-for-web-api-calls.md`; `frontend-architecture.md` §Redux/RTK Query boundaries                                                     |
| A mutation call, a `hooks/mutations/` file, a success toast, `shared/alerts/`                       | `adr/19-08-2026-generated-mutation-hooks-in-components.md`; `guides/web-error-handling.md`                                                                  |
| API failure handling, form errors, `transformErrorResponse`, alerts, notifications                  | `guides/web-error-handling.md`                                                                                                                              |
| A permission check, a gate component, a permitted-items filter, any `canDoThing` value              | `adr/19-08-2026-declarative-permission-gates.md`                                                                                                            |
| A React context or a provider under `modules/<module>/context/`                                     | `guides/sharing-web-state-with-context.md` (last resort only)                                                                                               |
| Any user-visible text, `public/locales/`, an i18next namespace, `src/i18n.ts`                       | `guides/adding-and-maintaining-web-localization.md`; `adr/27-07-2026-bundled-centralized-web-translations.md`                                               |
| Any animation, transition, entrance, `useContentTransition`, a `key` used to force a remount        | `guides/web-motion.md` (one duration/curve; never re-key a subtree; never the View Transitions API)                                                         |
| Any `@heroui/react` usage, a `variant`, a token, `src/styles/`                                      | `guides/heroui-design-principles.md`, then `guides/heroui-react-v3-docs-index.md` to find the exact doc to read                                             |
| A Zod schema, validation, a shape crossing web↔server, `packages/contracts/`                        | `guides/adding-and-using-contracts.md`; `adr/12-07-2026-schema-validation-with-zod.md`                                                                      |
| A lint suppression, a rule change, an unfamiliar lint failure                                       | `guides/linting-with-oxlint.md`; `adr/11-09-2026-oxlint-replaces-eslint.md`                                                                                 |
| Locating any of the above in existing code                                                          | `guides/exploring-the-codebase-with-codegraph-and-repomix.md`                                                                                               |
| Moving or adding a spec alongside the production change                                             | `guides/placing-web-tests.md` (the spec itself is outside this skill's gate)                                                                                |

## Crossover

A change that also touches `apps/server/src` selects from
[`./server-manifest.md`](./server-manifest.md) as well — both indexes, not the nearer one. For a
shared `packages/contracts` file, this table governs the web-side declaration and consumption; the
`createZodDto` adaptation in `rest/dtos/` is the server table's.

# Web document manifest — changed-path selector

A starting selector, **not** the source of truth. `docs/system/web-index.md` is authoritative
(`AGENTS.md`); read it in full every run and re-derive anything this table does not cover from the
index's own «when it applies» descriptions. When the two disagree, the index wins — and report the
disagreement so this file can be corrected.

Paths below are relative to `docs/system/`.

## Always read (the floor, every run)

| Document                                         | Why it is always in the manifest                                 |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| `frontend-architecture.md`                       | The owning architecture document for `apps/web`.                 |
| `architecture-map.md`                            | Container ownership — which app owns the responsibility at all.  |
| Every **Accepted** ADR in the index's §Decisions | Accepted decisions outrank guides and code (shared protocol §3). |

Read `sad.md` as well whenever the change crosses out of `apps/web` or you need the rationale behind
a frontend rule.

## Selector — changed path → additional documents

| Changed path (under `apps/web/`)                                                     | Add to the manifest                                                                                                                                                 |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A new `src/modules/<module>/`, or state moved between modules                        | `guides/adding-a-web-module.md`; ADRs `18-08-2026-scope-of-exercise-placement-tiebreak.md`, `14-08-2026-domain-owned-flat-modules.md` (reasoning only — superseded) |
| `src/routes/`, `src/router.ts`, `src/guards/`, a `route.tsx`                         | `guides/adding-a-web-module.md`; `frontend-architecture.md` §route/page/guard responsibilities                                                                      |
| Any `components/` directory, a new or moved component file                           | `guides/placing-web-components.md`, `guides/writing-web-components.md`                                                                                              |
| JSX that renders something only some of the time                                     | `guides/writing-web-conditional-components.md`                                                                                                                      |
| A modal, `Modal.*` / `AlertDialog.*` parts, `FormModalDialog`, `ConfirmAlertDialog`  | `guides/web-dialogs.md`                                                                                                                                             |
| Any `hooks/` directory, a new hook, a `utils/` helper                                | `guides/placing-web-hooks.md`                                                                                                                                       |
| A `*.spec.ts(x)` file, anything under `src/test/`                                    | `guides/placing-web-tests.md`                                                                                                                                       |
| `src/store/`, a slice, an RTK Query endpoint, `shared/api/`                          | ADR `02-08-2026-rtk-query-for-web-api-calls.md`; `frontend-architecture.md` §Redux/RTK Query boundaries                                                             |
| A mutation, a success toast, `shared/alerts/`, `hooks/mutations/`                    | ADR `19-08-2026-generated-mutation-hooks-in-components.md`; `guides/web-error-handling.md`                                                                          |
| Error normalization, form errors, alerts, notifications                              | `guides/web-error-handling.md`                                                                                                                                      |
| A permission check, a gate component, a `canDoThing` value, a permitted-items filter | ADR `19-08-2026-declarative-permission-gates.md`                                                                                                                    |
| A React context, a provider under `modules/<module>/context/`                        | `guides/sharing-web-state-with-context.md`                                                                                                                          |
| User-visible text, `public/locales/`, an i18next namespace, `src/i18n.ts`            | `guides/adding-and-maintaining-web-localization.md`; ADR `27-07-2026-bundled-centralized-web-translations.md`                                                       |
| Any `@heroui/react` usage, `variant`, tokens, `src/styles/`                          | `guides/heroui-design-principles.md`, `guides/heroui-react-v3-docs-index.md`                                                                                        |
| A Zod schema, validation, `packages/contracts/` consumed by web                      | `guides/adding-and-using-contracts.md`; ADR `12-07-2026-schema-validation-with-zod.md`                                                                              |

## Crossover

A diff that also touches `apps/server/` is reviewed there by
[`../../code-review-back-end`](../../code-review-back-end/SKILL.md). For a shared
`packages/contracts` file, this skill judges only the web-side declaration and consumption; the DTO
adaptation in `rest/dtos/` is the server skill's.

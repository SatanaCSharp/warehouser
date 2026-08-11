# Web development instructions

Before implementing changes in `apps/web`, read
[`docs/system/web-index.md`](../../docs/system/web-index.md). It is the table of contents of every
system document that governs `apps/web`, with a short description of each document and when it
applies. Use those descriptions to select the entries that cover the change you are making, then
read the selected documents in full before writing code. Consult the index again whenever the work
grows into another area — state, routing, components, errors, localization, contracts, or UI — and
read the newly relevant entries at that point. Do not rely on remembered conventions when the index
lists a document that covers the change.

`../../docs/system/frontend-architecture.md` is the baseline every other web document assumes; read
it for any non-trivial change.

Keep feature-owned Redux state with its feature under `src/modules/<module>/store/`. The root
`src/store/` directory is only for application-wide store composition, typed hooks, and generic
middleware. In a feature store, declare case reducers in `<module>.actions.ts`, create the slice
and export its generated actions and reducer from `<module>.slice.ts`, and keep typed reads in
`<module>.selectors.ts`. Do not add a reducer re-export file. Follow
`../../docs/system/guides/adding-a-web-module.md` when adding or moving state.

For API errors, form errors, notifications, success feedback, and their translations, follow
`../../docs/system/guides/web-error-handling.md`.

When writing or refactoring a React component, follow
`../../docs/system/guides/writing-web-components.md`: one exported component per file, small
components with a single reason to change, no value drilled more than two hops (read data and
capabilities through hooks at the component that uses them), flat branching instead of `if` chains
and nested ternaries, and transient UI state owned by the control that triggers it. Use
`../../docs/system/guides/placing-web-components.md` to decide where the resulting file goes.

Before writing `@heroui/react` code, look the component up in
`../../docs/system/guides/heroui-react-v3-docs-index.md` and read the matching file under
`.heroui-docs/react`. What you remember about HeroUI v3 is not reliable.

<!-- init-agent:start -->

The repository-owned `../../ai/` directory is the source of truth for coding-agent workflows. Load
the relevant installed skills from `.codex/skills/` on demand. Canonical commands remain
available under `../../ai/commands/`, and specialized roles are adapted from `../../ai/agents/`.

Use Pencil only for user-facing UI work, as described in `../../README.md` and
`../../ai/skills/design-ui/SKILL.md`.

Local credentials policy: `.env.example` files are the only environment-value files agents may
read. Do not read, print, search, summarize, diff, or otherwise inspect `.env`, `.env.*` (except
`.env.example`), or any file known or suspected to contain credentials, tokens, keys, passwords,
or secrets. If a required ignored local environment file is missing, it may be copied from the
applicable `.env.example` without displaying either file; never overwrite an existing local
environment file. Setup commands and generated guidance must use only the placeholder/development
values documented in `.env.example`, never values from sensitive local files.

Coding agents must not add telemetry.
<!-- init-agent:end -->

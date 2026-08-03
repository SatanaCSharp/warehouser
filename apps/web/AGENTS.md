Before implementing changes in `apps/web`, read the relevant UI-related documentation under
`docs/system/`, including the frontend architecture documentation.

Keep feature-owned Redux state with its feature under `src/modules/<module>/store/`. The root
`src/store/` directory is only for application-wide store composition, typed hooks, and generic
middleware. In a feature store, declare case reducers in `<module>.actions.ts`, create the slice
and export its generated actions and reducer from `<module>.slice.ts`, and keep typed reads in
`<module>.selectors.ts`. Do not add a reducer re-export file. Follow
`../../docs/system/guides/adding-a-web-module.md` when adding or moving state.

For API errors, form errors, notifications, success feedback, and their translations, follow
`../../docs/system/guides/web-error-handling.md`.

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

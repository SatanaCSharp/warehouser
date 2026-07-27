Before implementing changes in `apps/web`, read the relevant UI-related documentation under
`docs/system/`, including the frontend architecture documentation.

For API errors, form errors, notifications, success feedback, and their translations, follow
`../../docs/system/guides/web-error-handling.md`.

<!-- init-agent:start -->

## Repository AI adapter (managed)

The canonical AI instructions under `../../ai/` and `ai/` are the source of truth. Load relevant
skills from `.agents/skills/` on demand. Root reusable commands and specialized worker roles remain
available through `../../ai/commands/` and `../../ai/agents/`; read them directly when applicable
because Codex has no separate project-local command or worker adapter here.

Pencil is required for user-facing UI work only as described in `../../README.md` and
`../../ai/skills/design-ui/`; follow that workflow when this app's interface changes.

Credential policy:

- `.env.example` files are the only credential or environment-value files coding agents may read.
- Do not read, print, search, summarize, diff, or otherwise inspect `.env`, `.env.*` (except
  `.env.example`), or any file known or suspected to contain credentials, tokens, keys, passwords,
  or secrets.
- If a required ignored local environment file is missing, you may copy the applicable
  `.env.example` to the expected path without displaying either file. Never overwrite an existing
  local environment file.
- Use only placeholder or development credentials documented in `.env.example` in setup commands
  or generated guidance. Never copy sensitive local values into instructions, prompts, logs,
  reports, or tracked files.

<!-- init-agent:end -->

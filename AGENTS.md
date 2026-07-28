DO NOT use superpowers plugin.

Do not write tests for migrations. Verify migrations by applying and reverting them against the
real development database.

<!-- init-agent:start -->

## Repository AI adapter (managed)

The canonical, agent-neutral AI instructions under `ai/` are the source of truth. Do not edit
canonical files to suit Codex. Load relevant skills from `.agents/skills/` on demand; those entries
link back to root and app-local canonical skills. Reusable commands live in `ai/commands/`, and
specialized worker roles live in `ai/agents/`; project-scoped Codex adapters under
`.codex/agents/` direct each subagent back to its applicable canonical role.

Pencil is required only for work that changes a user-facing web, mobile, or desktop interface, as
described in `README.md` and `ai/skills/design-ui/`. Do not invoke it for backend-only work.

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

@AGENTS.md

<!-- init-agent:start -->

This project's canonical coding-agent instructions live under `ai/` (agents, commands, skills).
Treat `ai/` as the source of truth; the files below are generated adapters for Claude Code, not new
instructions — regenerate them with `ai/commands/init-agent.md` / `ai/commands/update-agent.md`
instead of hand-editing them.

- Load relevant installed skills from `.claude/skills/` on demand as work requires them (root skills
  plus every app's own skills, namespaced `apps/<app>:<skill>` when app-scoped).
- Canonical commands `init-agent` and `update-agent` are available as Claude Code slash commands
  under `.claude/commands/` (symlinked to `ai/commands/`).
- Specialized subagent roles are adapted from `ai/agents/` into `.claude/agents/`.
- Use Pencil only for user-facing UI work, as described in `README.md` and
  `ai/skills/design-ui/SKILL.md`.

Local credentials policy: `.env.example` files are the only environment-value files agents may
read. Do not read, print, search, summarize, diff, or otherwise inspect `.env`, `.env.*` (except
`.env.example`), or any file known or suspected to contain credentials, tokens, keys, passwords,
or secrets. If a required ignored local environment file is missing, it may be copied from the
applicable `.env.example` without displaying either file; never overwrite an existing local
environment file. Setup commands and generated guidance must use only the placeholder/development
values documented in `.env.example`, never values from sensitive local files.

Coding agents must not add telemetry.
<!-- init-agent:end -->

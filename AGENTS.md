DO NOT use superpowers plugin.

<!-- init-agent:start -->

The repository-owned `ai/` directory is the source of truth for coding-agent workflows. Load the
relevant installed skills from `.codex/skills/` on demand. Canonical commands remain available
under `ai/commands/`, and specialized roles are adapted from `ai/agents/`.

Use Pencil only for user-facing UI work, as described in `README.md` and
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

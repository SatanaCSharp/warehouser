DO NOT use superpowers plugin.

## System documentation indexes

`docs/system` holds the durable, feature-agnostic instructions for this repository. Two indexes are
the entry points into it:

- [`docs/system/web-index.md`](docs/system/web-index.md) — every system document governing
  `apps/web`.
- [`docs/system/server-index.md`](docs/system/server-index.md) — every system document governing
  `apps/server`.

Before implementing anything, open the index for the application you are changing (both, when the
change spans the web/server boundary or `packages/contracts`). Each entry names a document, gives a
short description, and states when it applies. Use those descriptions to extract the instructions
relevant to the current task, read the selected documents in full, and follow them while
implementing. Re-check the index whenever the work expands into an area you have not read for yet.
Do not rely on remembered conventions when the index lists a document that covers the change.

Keep both indexes current: adding, renaming, moving, or removing a document under `docs/system`
requires updating the corresponding index entry in the same change.

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

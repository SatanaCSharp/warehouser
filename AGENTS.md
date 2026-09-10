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

## Committing

Every commit runs the repository's Git hooks. Never bypass them: no `--no-verify` (or `-n`) on
`git commit` or `git push`, no `HUSKY=0`/`HUSKY_SKIP_HOOKS`, no `--no-verify`-equivalent
environment variable, no `core.hooksPath` override, and no editing, renaming, or removing anything
under `.husky/` to get a commit through. `.husky/pre-commit` runs `lint-staged`
(`eslint <staged files> --max-warnings=0`, which fails on warnings that `pnpm lint` tolerates, plus
`pnpm --filter @warehouser/server test:architectural` whenever any `apps/server/src/**/*.ts` file is
staged) and `.husky/commit-msg` runs `commitlint`; both are part of the gate, not an obstacle to it.

The architectural tier is the one whole-tree check in the hook: it asserts where mappers live and how
they are written, so a single staged server file can break it and one run covers the whole commit.
Because `lint-staged` stashes unstaged work first, it judges the tree being committed, not the
working copy. It costs a few seconds and is skipped entirely on commits that touch no server source.

A failing hook means the change is not ready. Fix what it reports — the lint warning, the
architectural violation, the Conventional Commits message — and commit again. If a hook cannot be
satisfied, stop and say so rather than committing around it.

This rule is also enforced mechanically, so it holds for an agent that never read this file:
`ai/hooks/deny-git-hook-bypass.sh` refuses a bypassing command, and `ai/hooks/README.md` explains
how each agent installs it (`ai/commands/init-agent.md` does it during installation). The guard
reads the command text, so writing _about_ a bypass — documenting it, grepping for it — can be
refused in a shell command; use the file-writing tool for that content.

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

---
description: Synchronize an existing coding-agent installation with the canonical AI instructions at the workspace root and in every app.
argument-hint: [target-agent]
---

# Update an AI agent

Actualize an existing project-local coding-agent installation from the repository-owned `ai/`
directories. The command is agent agnostic: resolve the target agent's supported project-local
surfaces and use capability names rather than assuming a vendor-specific layout. Canonical `ai/`
files are the source of truth; agent-specific files are adapters.

## Inputs and preconditions

- Run from the repository root.
- The optional first argument identifies the target agent (for example `claude`, `codex`,
  `cursor`, or `gemini`).
- When the target is omitted, infer it only from the current agent identity or an unambiguous
  existing project-local installation. If multiple installed agents are possible, ask which one to
  update and stop.
- Treat each immediate `apps/*/` directory as an app, including apps without a local `ai/`
  directory.
- This command updates an installation previously created or managed from the canonical `ai/`
  trees. If the target has no existing project-local instruction entry point or generated adapter,
  report that it is not initialized and direct the user to `ai/commands/init-agent.md`. Do not turn
  an update into a new installation silently.

## Canonical scopes

Compare all canonical AI content in both scopes:

1. **Workspace scope** — root `ai/agents`, `ai/commands`, and `ai/skills`, plus every existing
   `apps/*/ai/skills`. App-specific skills at this scope use the same `<app>-<skill>` collision
   namespace established by `init-agent`.
2. **App scope** — for each `apps/<app>/`, only that app's `apps/<app>/ai/skills` when present.
   Do not install root `ai/skills` or another app's skills into an app-local skills directory.

Include every file needed by an instruction surface, not only Markdown: references, templates,
scripts, assets, and metadata must remain reachable with their relative paths intact. Ignore
dependencies, caches, build output, and agent-generated directories when discovering canonical
sources. Installed skills must be complete materialized copies in the target's appropriate
project-local skills directory; never use symbolic links for a skill directory or anything inside
one.

For Codex, the workspace skills directory is `.codex/skills/` and each app-local skills directory
is `apps/<app>/.codex/skills/`; `.agents/skills/` is a legacy destination and must not receive
Codex skills. For Claude, use `.claude/skills/` and `apps/<app>/.claude/skills/`. Derive the
project-local location for other targets from their installed configuration or official
documentation.

## Procedure

1. Read `AGENTS.md`, the root project overview when present, `package.json`, all app-local
   instruction files, and `ai/commands/init-agent.md`.
2. Identify the target and its existing project-local instruction, command/prompt, skill,
   specialized-worker, and MCP locations. Derive unfamiliar layouts from installed configuration
   or official documentation; do not guess or substitute another agent's conventions.
   For Codex, specialized-worker adapters are standalone `.codex/agents/*.toml` files at workspace
   scope and `apps/<app>/.codex/agents/*.toml` at app scope. Each managed adapter must contain the
   required `name`, `description`, and `developer_instructions` fields and retain the generated
   source marker defined by `init-agent`. Its instructions must locate and load the corresponding
   canonical `ai/agents/<role>.md`; the adapter must not duplicate the canonical role body.
3. Inventory every canonical file below the root `ai/` directory and every immediate
   `apps/*/ai/` directory. Inventory the target's existing workspace and app adapters separately.
4. Determine ownership before changing a destination. An entry is managed only when it is:
   - a symbolic link to a canonical source;
   - a generated copy carrying the canonical source path and the standard do-not-edit marker from
     `init-agent`; or
   - content inside an `<!-- init-agent:start -->` / `<!-- init-agent:end -->` managed block.
     Never classify a file as managed merely because its name matches a canonical file.
5. Build and print a comparison table before writing. For each canonical or managed destination,
   show its scope, source, destination, ownership, and action: `unchanged`, `add`, `update`,
   `relink`, `remove stale`, `collision`, or `unsupported`.
6. Synchronize the existing installation:
   - recursively refresh every managed skill from its canonical `ai/skills` directory as a full
     copy, including `SKILL.md`, references, templates, scripts, assets, and metadata; replace
     legacy managed skill links with materialized copies and do not create links anywhere in an
     installed skill tree;
   - migrate managed Codex skills from legacy `.agents/skills/` destinations to `.codex/skills/`,
     and remove the legacy managed copies after the new copies verify successfully;
   - at app scope, synchronize only skills sourced from that app's own
     `apps/<app>/ai/skills`; remove managed root and sibling-app skills previously copied into the
     app-local skills directory, while leaving unmanaged entries untouched;
   - preserve valid relative symbolic links for non-skill surfaces;
   - relink broken or incorrectly targeted managed non-skill links to the current canonical source;
   - refresh managed non-skill copies whose bytes differ from their source while retaining the
     generated header required by `init-agent`;
   - add newly introduced canonical entries to already initialized supported surfaces;
   - for Codex, add or refresh one managed custom-agent TOML adapter per canonical
     `ai/agents/*.md` role in both workspace and app scopes, using the exact schema and translation
     rules in `init-agent`; update adapter metadata when canonical frontmatter changes, preserve
     unrelated hand-written `.codex/config.toml` settings, and never replace an unmanaged custom
     agent merely because its filename or `name` matches;
   - update the managed instruction block at the workspace root and in every app so it points to
     the applicable canonical instructions and continues to state that `ai/` is the source of
     truth;
   - ensure every managed instruction block contains the local-credentials policy established by
     `init-agent`: coding agents may read `.env.example` files only; they must not read, print,
     search, summarize, diff, or otherwise inspect `.env`, `.env.*` (except `.env.example`), or
     any other file known or suspected to contain credentials, tokens, keys, passwords, or
     secrets; when a required ignored local environment file is missing, they may copy the
     applicable `.env.example` to it without displaying either file, but must never overwrite an
     existing local environment file; setup commands and generated guidance must use only the
     placeholder/development values documented in `.env.example`;
   - ensure every managed instruction block states that coding agents must not add telemetry;
   - remove destinations whose canonical sources no longer exist only when ownership is proven
     and only inside the target's generated directories or managed blocks;
   - leave unmanaged files and content outside managed blocks byte-for-byte unchanged.
7. Preserve the existing project-local MCP adapter. Compare its `pencil` and `notebooklm` entries
   with `.mcp.json` and `init-agent` requirements, and update only those managed server fields when
   they are stale. Add either canonical entry when it is missing, translating it to the target's
   project-local format as needed. Preserve unrelated servers and settings. Verify
   `notebooklm-mcp` and its companion `nlm` CLI are available, but do not start the server or
   perform browser authentication. Do not require Pencil desktop to be running.
8. If a newly canonical surface is unsupported by the target, keep it reachable through the
   target's managed main instruction block and report the fallback. If a destination is occupied
   by an unmanaged file or link, report the collision and continue with unaffected entries.
9. Run the comparison again after writing and verify:
   - every managed non-skill link resolves within the repository;
   - every managed non-skill copy matches its canonical source apart from its generated header;
   - every installed skill is a complete materialized copy of its canonical skill and contains no
     symbolic links;
   - every app has its existing instruction entry point with a valid managed block;
   - no destination escapes the repository;
   - no canonical `ai/` source was modified by synchronization;
   - for Codex, every managed custom-agent file parses as TOML, contains all required fields,
     points to an existing canonical role, and has a unique `name` within its workspace or app
     scope;
   - a second synchronization with unchanged inputs would produce no diff.
10. Show `git status --short` and summarize added, updated, relinked, removed, unchanged,
    unsupported, and collided entries by workspace and app scope.

## Safety and maintenance rules

- Do not modify canonical files under root or app `ai/` directories during synchronization.
- Do not install packages. Do not start the canonical NotebookLM server or perform browser
  authentication during synchronization.
- Do not overwrite or delete hand-written agent configuration, unmanaged links, or content outside
  a managed block.
- Do not copy credentials, authentication data, session tokens, user-global configuration, or
  machine-specific absolute paths into the repository.
- Do not inspect existing local environment files during synchronization. File-existence checks
  are allowed, but credential values must come only from the applicable `.env.example`.
- Do not update every detected agent when no target was supplied. One invocation updates one
  explicitly identified or unambiguously inferred agent.
- Be idempotent: unchanged canonical sources and configuration produce no filesystem changes.
- A collision, unresolved mapping, invalid adapter, missing app instruction entry point, or failed
  verification makes the update partial rather than successful.

## Completion report

Return the target and resolved layout, the canonical directories compared, workspace and app
changes grouped by action, MCP status, collisions and unsupported-surface fallbacks, verification
results, and files changed. Label a partial update clearly and list the exact unresolved paths and
the next action needed for each one.

---
description: Install the repository's canonical AI instructions for a target coding agent at the workspace root and in every app.
argument-hint: <target-agent>
---

# Initialize an AI agent

Install the repository-owned instructions from `ai/` for `$ARGUMENTS`. The `ai/` directories are
the canonical, agent-neutral source; generated agent configuration is only an adapter. Never edit a
canonical instruction merely to satisfy a target agent's file layout.

## Inputs

- The required target is the first argument (for example `claude`, `codex`, `cursor`, or `gemini`).
- Run from the repository root.
- Treat each immediate `apps/*/` directory as an app, whether or not it has its own `ai/` directory.

If the target is missing, ask for it once and stop. If the target is unknown, inspect that agent's
installed configuration or official documentation and derive its project-local instruction,
command, skill, specialized-worker, and MCP configuration locations. Do not guess a layout or
silently substitute a different agent.

## Desired installation

Build two scopes:

1. **Workspace scope** — root `ai/agents`, `ai/commands`, and `ai/skills`, plus every existing
   `apps/*/ai/skills`. This lets the target agent work anywhere in the monorepo.
2. **App scope** — for every immediate `apps/<app>/`, root `ai/agents`, `ai/commands`, and
   `ai/skills`, plus that app's `apps/<app>/ai/skills` when present. This keeps an agent started in
   an app independently useful without leaking another app's specialized skills into it.

Also configure a project-local MCP server named `pencil` for the target agent. Treat `.mcp.json`
as the repository's common Pencil definition when the target supports that format; otherwise
translate the same server definition into the target's supported project-local configuration.
Agent-specific configuration is an adapter and must not become a new source of workflow
instructions.

Use the target agent's project-local locations, not user-global configuration. Prefer relative
symbolic links back to the canonical files when the target supports links. Otherwise generate
copies with a prominent header containing the canonical source path and `DO NOT EDIT: regenerate
with init-agent`. Preserve directory structure so references and bundled assets continue to work.

## Procedure

1. Read `AGENTS.md`, the root project overview when present, `package.json`, and any app-local
   instruction files.
2. Inventory all immediate `apps/*/` directories and all canonical files under root and app `ai/`
   directories. Ignore caches, dependencies, build output, and nested agent-generated directories.
3. Resolve the target's supported project-local surfaces:
   - persistent project instructions;
   - reusable skills;
   - invokable commands or prompts;
   - specialized workers/subagents, if supported.
   - MCP server configuration, including the target-specific Pencil agent identifier when Pencil
     requires one.
4. Print the resolved source-to-destination mapping before writing. If a surface is unsupported,
   keep its instructions reachable through the target's main project instruction file and report
   the fallback.
5. Initialize Pencil for the target:
   - inspect `.mcp.json` and any existing target-local MCP configuration before changing either;
   - resolve the installed Pencil desktop MCP executable for the current operating system and
     architecture instead of assuming the macOS ARM path is valid;
   - preserve the server name `pencil`, the desktop mode, and Pencil's target-agent identifier,
     deriving the identifier from Pencil's installed metadata/help or official documentation when
     it is not already known for the target;
   - treat `.mcp.json` as a checked-in bootstrap, not a portable executable path: resolve its
     command for the local OS/architecture and add the target-agent identifier only when required;
   - if the target reads `.mcp.json`, merge or update only `mcpServers.pencil`; otherwise merge the
     equivalent entry into the target's project-local MCP configuration;
   - preserve unrelated MCP servers and hand-written settings. If the target has no project-local
     MCP support, report the exact user-local configuration needed but do not install it without
     explicit permission.
6. Install workspace and app scopes. Namespace app-specific skill collisions as `<app>-<skill>` at
   workspace scope. At app scope, the app-specific skill wins over a root skill with the same name.
   Never overwrite two different sources at one destination.
7. Create or update the target's project instruction file at the root and in every app. Preserve
   hand-written content outside a managed block delimited by:

   ```text
   <!-- init-agent:start -->
   <!-- init-agent:end -->
   ```

   The managed block must point to the applicable canonical instructions, tell the agent to load
   relevant installed skills on demand, state that `ai/` is the source of truth, and explain that
   Pencil is required only for UI work as described in `README.md` and `ai/skills/design-ui/`.

8. Remove stale entries only inside directories or managed blocks previously generated by this
   command for the same target. Do not delete hand-written target configuration.
9. Verify every installed link resolves (or every generated copy matches its source), every app has
   an instruction entry point, no destination escapes the repository, and the target can discover
   a project-local MCP server named `pencil`. Do not require Pencil desktop to be running during
   initialization; when it is running, use the target's MCP inspection command to verify the server
   starts successfully. Show `git status --short` and summarize installed, skipped, namespaced, and
   stale entries.

## Safety and portability rules

- Be idempotent: running the command twice with unchanged inputs produces no diff.
- Do not modify anything under a canonical `ai/` directory during installation.
- Do not install globally, fetch packages, or require network access unless the user explicitly
  asks for it.
- Do not commit Pencil authentication data, API keys, session tokens, absolute paths copied from a
  different machine, or user-global MCP configuration.
- Do not replace an existing non-generated file or link. Report the collision and continue with
  unaffected entries.
- Translate only adapter metadata required by the target. Keep instruction meaning, relative
  references, templates, scripts, and assets intact.
- Map capability names rather than vendor tool names: file read/search/edit, shell execution, web
  research, user input, and isolated worker delegation.

## Completion report

Return the target and resolved layout, Pencil executable and project-local MCP adapter, workspace/
app scopes installed, collision or unsupported-surface fallbacks, verification results, and the
files changed. A partial install is not success; label it clearly and give the exact unresolved
paths or configuration.

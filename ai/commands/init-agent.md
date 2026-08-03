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
2. **App scope** — for every immediate `apps/<app>/`, install only that app's
   `apps/<app>/ai/skills` when present. Do not copy root `ai/skills` or another app's skills into an
   app-local skills directory. This keeps app-local installations limited to their owning app.

Also configure the project-local MCP servers declared in `.mcp.json` for the target agent.
Currently these are `pencil` and `notebooklm`. Treat `.mcp.json` as the repository's common,
agent-neutral MCP definition when the target supports that format; otherwise translate both
server definitions into the target's supported project-local configuration. Agent-specific
configuration is an adapter and must not become a new source of workflow instructions.

Use the target agent's project-local locations, not user-global configuration. For Codex, the
workspace skills destination is `.codex/skills/` and an app's skills destination is
`apps/<app>/.codex/skills/`; never install Codex skills under `.agents/skills/`. For Claude, the
equivalent destinations are `.claude/skills/` and `apps/<app>/.claude/skills/`. Derive the
project-local skills location for other targets from their installed configuration or official
documentation.

Skills are an exception to the general adapter strategy: recursively copy every skill directory
from its canonical source into the destination for its scope. Never install a skill or any file
inside a skill as a symbolic link. For non-skill surfaces, prefer relative symbolic links back to
canonical files when the target supports links; otherwise generate copies with a prominent header
containing the canonical source path and `DO NOT EDIT: regenerate with init-agent`. Preserve
directory structure so references and bundled assets continue to work.

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
     requires one and a `notebooklm-mcp` stdio server definition for NotebookLM.
     When the target is Codex, install specialized workers as project-scoped custom-agent adapters:
   - create one standalone TOML file under `.codex/agents/` for every `ai/agents/*.md` role;
   - create the same adapters under `apps/<app>/.codex/agents/` so Codex started from an app can
     discover the repository roles;
   - use the canonical role's frontmatter `name` as the TOML `name`, and normalize its
     `description` to a valid TOML string;
   - include the required `name`, `description`, and `developer_instructions` fields;
   - translate `reasoning-effort` to `model_reasoning_effort` when Codex supports the declared
     value, but do not guess or hard-code a model from the agent-neutral `model-tier`;
   - use `sandbox_mode = "read-only"` when the canonical capabilities contain no write/edit
     capability. Otherwise inherit the parent sandbox unless the canonical role requires a
     stricter supported mode;
   - keep the adapter thin: `developer_instructions` must direct the subagent to locate the
     repository root, read the applicable canonical `ai/agents/<role>.md` completely before doing
     work, treat it as the role's source of truth, and follow every applicable `AGENTS.md`;
   - do not copy the canonical role body into TOML or create a competing role definition.

   Use this Codex adapter shape, with TOML escaping applied to substituted values:

   ```toml
   # Generated from ai/agents/<role>.md. DO NOT EDIT: regenerate with init-agent.
   name = "<canonical-name>"
   description = "<canonical-description>"
   model_reasoning_effort = "<canonical-supported-reasoning-effort>"
   sandbox_mode = "read-only" # omit when the role needs writes

   developer_instructions = """
   Locate the repository root, then read ai/agents/<role>.md completely before starting.
   That file is the canonical role definition and source of truth; follow it without duplicating
   or replacing it here. Also follow every applicable AGENTS.md and relevant skill instruction.
   Work only on the bounded task delegated by the parent agent and return a concise result to it.
   """
   ```

   In Codex project configuration, preserve unrelated settings and ensure multi-agent support is
   not disabled. Add `[agents]` only when needed; if a managed concurrency setting is required,
   use `max_concurrent_threads_per_session`. Do not overwrite a user-selected default subagent
   model, reasoning effort, or concurrency limit.

4. Print the resolved source-to-destination mapping before writing. If a surface is unsupported,
   keep its instructions reachable through the target's main project instruction file and report
   the fallback.
5. Initialize the canonical MCP servers for the target:
   - inspect `.mcp.json` and any existing target-local MCP configuration before changing either;
   - merge or update both `mcpServers.pencil` and `mcpServers.notebooklm` (or their target-native
     equivalents), preserving unrelated MCP servers and hand-written settings;
   - configure `notebooklm` as the cross-platform stdio command from `.mcp.json`; verify
     `notebooklm-mcp` and its companion `nlm` CLI are available, but do not run browser
     authentication during initialization;
   - keep NotebookLM authentication, browser profiles, cookies, and other session data in the
     package's user-local storage. Never copy or commit them to the repository;
   - resolve the installed Pencil desktop MCP executable for the current operating system and
     architecture instead of assuming the macOS ARM path is valid;
   - preserve the server name `pencil`, the desktop mode, and Pencil's target-agent identifier,
     deriving the identifier from Pencil's installed metadata/help or official documentation when
     it is not already known for the target;
   - treat `.mcp.json` as a checked-in bootstrap, not a portable executable path: resolve its
     command for the local OS/architecture and add the target-agent identifier only when required;
   - if the target reads `.mcp.json`, preserve both canonical entries there; otherwise merge their
     equivalents into the target's project-local MCP configuration;
   - if the target has no project-local MCP support, report the exact user-local configuration
     needed for both servers but do not install it without explicit permission.
6. Install workspace and app scopes. Recursively copy each complete canonical skill directory,
   including its `SKILL.md`, references, templates, scripts, assets, and metadata, into the target's
   project-local skills directory for the applicable scope. Use `.codex/skills/` for Codex and
   `.claude/skills/` for Claude, with the same directory nested below `apps/<app>/` at app scope.
   Do not create symbolic links for skill directories or their contents. Namespace app-specific
   skill collisions as `<app>-<skill>` at workspace scope. At app scope, copy only skills from that
   app's own `apps/<app>/ai/skills`; do not install root or sibling-app skills there. Never
   overwrite two different sources at one destination.
7. Create or update the target's project instruction file at the root and in every app. Preserve
   hand-written content outside a managed block delimited by:

   ```text
   <!-- init-agent:start -->
   <!-- init-agent:end -->
   ```

   The managed block must point to the applicable canonical instructions, tell the agent to load
   relevant installed skills on demand, state that `ai/` is the source of truth, and explain that
   Pencil is required only for UI work as described in `README.md` and `ai/skills/design-ui/`.
   It must also include the following local-credentials policy:
   - `.env.example` files are the only credential/environment-value files coding agents may read.
   - Coding agents must not read, print, search, summarize, diff, or otherwise inspect `.env`,
     `.env.*` (except `.env.example`), or any other file known or suspected to contain sensitive
     credentials, tokens, keys, passwords, or secrets.
   - When a local environment file is required and is missing, a coding agent may copy the
     applicable `.env.example` to the expected ignored local path without displaying either file.
     It must not overwrite an existing local environment file.
   - Coding agents must use the placeholder/development credentials documented in `.env.example`
     when giving setup commands or updating generated local-agent guidance. They must never copy
     values from a sensitive local file into an instruction, prompt, log, report, or tracked file.
     It must also state that coding agents must not add telemetry.

8. Remove stale entries only inside directories or managed blocks previously generated by this
   command for the same target. This includes migrating managed Codex skills out of legacy
   `.agents/skills/` destinations and removing managed root or sibling-app skills from app-local
   destinations. Do not delete hand-written target configuration.
9. Verify every installed non-skill link resolves, every generated non-skill copy matches its
   source, and every installed skill is a complete materialized copy of its canonical skill with no
   symbolic links in the copied skill tree. Verify every app has an instruction entry point, no
   destination escapes the repository, and the target can discover project-local MCP servers named
   `pencil` and `notebooklm`. Do not require Pencil desktop or a
   NotebookLM login during initialization. When Pencil is running, use the target's MCP inspection
   command to verify that server starts successfully. Do not start `notebooklm` merely to verify
   configuration; report whether `notebooklm-mcp` and `nlm` are present instead. For Codex, parse
   every generated `.codex/agents/*.toml`, verify that its required fields are present, its
   canonical role path exists, and its name is unique within that scope. Show `git status --short`
   and summarize installed, skipped, namespaced, and stale entries.

## Safety and portability rules

- Be idempotent: running the command twice with unchanged inputs produces no diff.
- Do not modify anything under a canonical `ai/` directory during installation.
- Do not install packages. Configuring the canonical `notebooklm` MCP invocation is required, but
  do not start it or initiate browser authentication during initialization.
- Do not commit Pencil authentication data, API keys, session tokens, absolute paths copied from a
  different machine, or user-global MCP configuration.
- Do not inspect existing local environment files while installing an agent. File-existence checks
  are allowed, but credential values must come only from the applicable `.env.example`.
- Do not replace an existing non-generated file or link. Report the collision and continue with
  unaffected entries.
- Translate only adapter metadata required by the target. Keep instruction meaning, relative
  references, templates, scripts, and assets intact.
- Map capability names rather than vendor tool names: file read/search/edit, shell execution, web
  research, user input, and isolated worker delegation.

## Completion report

Return the target and resolved layout, Pencil executable, NotebookLM runtime prerequisites,
project-local MCP adapter, workspace/app scopes installed, collision or unsupported-surface
fallbacks, verification results, and the files changed. A partial install is not success; label it
clearly and give the exact unresolved paths or configuration.

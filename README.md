# Warehouser

Warehouser is a pnpm monorepo with a web application, server application, shared packages, project documentation, and an agent-neutral feature-development workflow under `ai/`.

## Development

Install dependencies:

```sh
pnpm install
```

Start PostgreSQL and Redis:

```sh
docker compose up -d
```

Copy `apps/server/.env.example` to `apps/server/.env` when setting up the server for the first time.
The example values connect to the local Compose services.

Common commands:

```sh
pnpm dev
pnpm build
pnpm lint
pnpm test
```

See `package.json` and the package-level manifests for additional commands.

## AI workflow

The canonical, coding-agent-neutral instructions live in:

```text
ai/
├── agents/       # specialized worker roles
├── commands/     # reusable repository commands
└── skills/       # feature-development workflows
```

Use `ai/commands/init-agent.md` to install adapters for a particular coding agent. The files under `ai/` remain the source of truth; generated agent-specific adapters should not be edited directly.

### Configure your coding agent

After cloning the repository, open it in your coding agent and send it this prompt:

```text
Configure yourself for this repository.

Read ai/commands/init-agent.md and ai/commands/update-agent.md. Determine your
own coding-agent type without asking me to name it.

If your project-local adapter has not been initialized, execute the
init-agent instructions with yourself as the target. If it already exists,
execute the update-agent instructions instead.

Perform all required verification and report what you initialized, updated,
or repaired. Do not modify the canonical files under ai/.
```

Restart the coding agent if it reports that configuration or MCP changes require it.

### NotebookLM MCP

The repository exposes a project-local `notebooklm` MCP server to every MCP-capable coding agent.
`.mcp.json` is the agent-neutral definition, and `ai/commands/init-agent.md` translates it into
the target agent's project-local format alongside Pencil. The server is provided by
[`notebooklm-mcp-cli`](https://github.com/jacob-bd/gemini-notebook-mcp-cli) and runs through the
installed `notebooklm-mcp` executable.

NotebookLM authentication is a one-time interactive browser flow. After initializing the coding
agent, ask it to use the `notebooklm` server's authentication setup tool, sign in in the browser
window, and then restart the agent if requested. Authentication profiles, cookies, and session
data are user-local and must never be copied into or committed to this repository. This integration
is an unofficial community bridge that automates NotebookLM rather than a Google-supported API, so
do not use it with sensitive notebooks without reviewing that tradeoff.

## Conditional UI design with Pencil

The repository uses [Pencil](https://pencil.dev/) for editable UI designs and live design review, but only when a feature changes a user-facing web, mobile, or desktop interface. Coding agents interact with the running Pencil desktop application through its local MCP server.

Do not invoke Pencil, start its MCP server, or require a design handoff for backend-only work such as server logic, APIs, workers, data-model changes, infrastructure, or CLI features. For a mixed feature, use Pencil only for the UI portion; server tasks continue through the normal workflow.

Use `target_surfaces` in `docs/features/<feature-slug>/sad.md` as the routing decision once it exists:

- `web-frontend`, `mobile-app`, or `desktop-app` present → run `ai/skills/design-ui/SKILL.md` and require explicit design approval before planning or implementing UI tasks;
- no UI surface present → skip `design-ui` and continue directly with the applicable architecture, contract, data-model, task-planning, and implementation stages;
- `target_surfaces` missing or unclear → determine whether the requested change has a user-visible interface before deciding. Do not assume that every feature needs Pencil.

For features with UI changes, the workflow deliberately separates design approval from production implementation:

```text
specification → Pencil design → human approval → task planning → implementation → visual review
```

For features without UI changes, the Pencil stages are omitted:

```text
specification → architecture/contracts/data model as applicable → task planning → implementation → review
```

The `.pen` file and approved frame ID are the visual source of truth. Generated standalone HTML is not used as an intermediate implementation artifact.

### One-time UI setup

This setup is needed only for contributors and coding agents working on UI changes.

1. Install and authenticate the Pencil desktop application.
2. Configure the coding agent to launch Pencil's local MCP server. This repository includes:
   - `.mcp.json` as the checked-in macOS ARM desktop-mode bootstrap; `init-agent` resolves and
     rewrites its executable for the current OS/architecture and adds a target-agent identifier
     when the target requires one;
   - `.codex/config.toml` as a project-local adapter for Codex.
3. Initialize the repository's canonical skills for the selected coding agent by asking it to follow `ai/commands/init-agent.md` with its own agent name as the target.
4. Restart the coding agent after changing MCP or skill configuration.

Other agents may require their own project-local MCP adapter. Configure the same `pencil` server and preserve the canonical workflow in `ai/skills/design-ui/`.

### Start a UI design session

Start this session only after confirming that the feature includes a web, mobile, or desktop UI surface.

1. Start Pencil desktop.
2. Open the relevant `.pen` file:
   - `docs/mockups/app.pen` for shared UI exploration and reusable module concepts;
   - `docs/features/<feature-slug>/design.pen` for a feature-owned design.
3. Start the coding agent from the repository root.
4. Inspect the agent's MCP server list and confirm that `pencil` is enabled.
5. Ask the agent to use `ai/skills/design-ui/SKILL.md`.

Example request:

```text
Use the design-ui skill for <feature-slug>.

Read the feature specification, docs/system/architecture-map.md, the existing
web UI, its component library, and its design tokens. Create two or three
meaningfully different alternatives in the feature's design.pen file.

Include the relevant desktop and mobile viewports and the loading, empty,
error, disabled, authorization, and keyboard-focus states required by the
specification. Reuse existing UI primitives, tokens, and icon conventions.

Modify only design artifacts. Verify the layouts, capture preview screenshots,
explain the alternatives and their trade-offs, and stop for my approval. Do
not modify production code.
```

Changes made by the agent should appear live in the open Pencil canvas.

### Approve a design

Approval must identify the selected frame/version explicitly. General positive feedback does not count as approval.

Example:

```text
I approve "<Feature> / <Alternative> / Desktop / v2" and its corresponding
mobile frame. Preserve those frames and create
docs/features/<feature-slug>/design-handoff.md. Do not implement the feature.
```

The resulting handoff records:

- the design file;
- exact approved frame name and node ID;
- approved viewports and UI states;
- mappings to existing code components and design tokens;
- responsive and interaction behavior;
- accessibility expectations;
- open questions and explicitly approved deviations.

Approved frames are immutable. Later design revisions must use a new named version.

### Plan and implement

After approval, ask the coding agent to generate tasks from the specification, architecture artifacts, and `design-handoff.md`:

```text
Create implementation tasks for <feature-slug> from the approved design
handoff and the upstream feature artifacts.
```

Then implement in a separate phase:

```text
Implement <feature-slug> from tasks.json and the approved design handoff.
Reuse existing components and tokens. Treat the design as visual and behavioral
intent and the existing codebase as the architecture source. Report every
visible deviation from the approved design.
```

UI task planning and implementation must stop when the handoff is missing, unapproved, or does not identify an exact Pencil frame and node ID. Non-UI tasks do not require a Pencil file or design handoff.

### Review the UI implementation

Review the implemented UI at the viewports and states recorded in `design-handoff.md`. Compare browser screenshots with the approved Pencil frame and preview evidence.

Review fidelity across:

- layout and information hierarchy;
- component and token reuse;
- responsive behavior;
- loading, empty, error, disabled, and authorization states;
- focus, keyboard, labeling, contrast, and reduced-motion behavior.

Visible differences must either be fixed or recorded under `Approved deviations` in the handoff.

### MCP troubleshooting

If the coding agent cannot see Pencil:

1. Confirm Pencil desktop is running and the target `.pen` file is open.
2. Restart Pencil and the coding-agent session.
3. Inspect the agent's MCP configuration and confirm a server named `pencil` is enabled.
4. Confirm the configured Pencil MCP executable exists on the local machine.
5. Re-run the agent-adapter initialization if the `design-ui` skill is unavailable.

Do not commit Pencil authentication data, API keys, or session tokens.

### Headless fallback

For an MCP-capable agent, the desktop workflow is preferred because it provides live human review. When the desktop bridge is unavailable and the loss of live review is acceptable, use the official `@pen.dev/cli` to create or edit `.pen` files and export PNG, JPEG, WEBP, or PDF previews.

The headless fallback must preserve the same approval boundary: generate and verify design artifacts first, obtain explicit human approval, and only then begin production implementation.

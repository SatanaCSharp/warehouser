# Pencil workflow

## Connection

Use the MCP server named `pencil`. For this repository, Codex launches the installed desktop bridge from `.codex/config.toml`. The Pencil desktop app must be running; open the target `.pen` file before starting design work.

Minimum tool capabilities expected from any agent adapter:

- inspect editor state and active file;
- read nodes, variables, and component hierarchy;
- create/update design nodes in batches;
- inspect computed layout;
- capture screenshots or export selected nodes.

Tool names can be namespaced differently between Codex, Claude, Cursor, and other agents. Resolve by capability instead of assuming a vendor-specific prefix.

## Failure handling

If the server is missing:

1. Start or restart Pencil desktop.
2. Restart the coding agent from the repository root.
3. Inspect its MCP server list for `pencil`.
4. Confirm the configured executable exists.

If the desktop bridge remains unavailable, report the blocker. The optional `@pen.dev/cli` headless workflow may produce `.pen` files and previews, but use it only when the user accepts losing live desktop review.

## Design operations

Start with editor state and variables. Read the closest relevant components before writing. Prefer batched changes, then inspect the resulting structure and computed bounds. Capture a screenshot after every meaningful alternative or revision.

Name frames so approval is unambiguous:

```text
<Feature> / <Alternative> / <Viewport> / v<N>
```

Use shared roots/components rather than detached lookalikes. Preserve approved versions.

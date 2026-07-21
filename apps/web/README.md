# Warehouser Web

React single-page application for Warehouser. It uses Vite, TanStack Router, Redux Toolkit,
HeroUI, React Hook Form, and Zod.

## Commands

Run these from the repository root:

```sh
pnpm --filter @warehouser/web dev
pnpm --filter @warehouser/web lint
pnpm --filter @warehouser/web test
pnpm --filter @warehouser/web build
```

The development server listens on port 3000 and proxies `/api` to `http://localhost:3001`.

## Development guidance

- [Frontend architecture](../../docs/system/frontend-architecture.md) defines source ownership,
  routing, Redux Toolkit, validation, UI, and testing conventions.
- [Adding a web module](../../docs/system/guides/adding-a-web-module.md) is the end-to-end extension
  checklist.
- [Adding and using contracts](../../docs/system/guides/adding-and-using-contracts.md) explains when
  Zod schemas belong in `packages/contracts`.
- UI-changing features follow the Pencil approval workflow described in the root
  [README](../../README.md) and `ai/skills/design-ui/`.

Repository-neutral instructions under `ai/` and architecture under `docs/system/` are canonical.
Agent-specific files are adapters and must not become a separate source of frontend conventions.

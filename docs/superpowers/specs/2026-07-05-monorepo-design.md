# Warehouser Monorepo — Design Spec

**Date:** 2026-07-05  
**Status:** Approved

---

## Overview

Warehouser is an inventory/warehouse management system — products, locations, and stock movements. It is built as a pnpm monorepo with Turborepo for task orchestration. The system targets a single VPS deployment via Docker Compose.

---

## Folder Structure

```
warehouser/
├── apps/
│   ├── web/                     # React 19, Vite, TanStack Router, RTK + RTK Query
│   └── server/                  # NestJS, Mongoose, role-based auth (JWT)
├── packages/
│   ├── eslint-config/           # Shared ESLint flat configs (base, react, nest)
│   ├── shared-types/            # Domain DTOs, enums, interfaces (no runtime deps)
│   └── utils/                   # Pure functions shared across web + server
├── turbo.json                   # Task pipeline: build → test → lint
├── pnpm-workspace.yaml          # Declares apps/* and packages/*
└── package.json                 # Root: devDeps (turbo, typescript), scripts
```

**Conventions:**
- All packages are `private: true`; none are published to npm
- Cross-package imports use `workspace:*` — e.g. `"@warehouser/shared-types": "workspace:*"`
- Package names follow the `@warehouser/<name>` scope
- TypeScript project references wire packages together at source level (no bundling of packages)

---

## Tooling & Configuration

### TypeScript
- Root `tsconfig.base.json` with strict settings; every app and package extends it
- `composite: true` and `declarationMap: true` on all packages for IDE source navigation

### Turborepo
`turbo.json` defines a `lint → build → test` pipeline:
- `build` depends on upstream package `build` outputs (packages build before apps)
- Outputs cached: `dist/**`
- `dev` runs all apps in parallel with caching disabled

### ESLint (`packages/eslint-config`)
- Three named flat-config exports: `base` (TS rules), `react` (extends base + React/hooks), `nest` (extends base + NestJS conventions)
- Each app imports the relevant preset in its own `.eslint.config.mjs`
- Prettier integrated via `eslint-config-prettier`; no separate Prettier pipeline

### pnpm
- `pnpm-workspace.yaml` declares `apps/*` and `packages/*`
- `.npmrc`: `shamefully-hoist=false`, `strict-peer-dependencies=false`
- Root `package.json` holds only Turborepo, TypeScript, and shared devDeps

---

## Apps

### `apps/web` — React 19 + Vite + TanStack Router + RTK

| Concern | Solution |
|---|---|
| Bundler / dev server | Vite |
| Routing | TanStack Router (code-based) |
| Global client state | Redux Toolkit slices |
| Server / async state | RTK Query |
| Auth enforcement | TanStack Router `beforeLoad` guards |

**Structure:**
```
apps/web/src/
├── routes/          # Route objects; root router assembled in router.ts
├── store/
│   ├── api/         # RTK Query slices — one per domain (products, locations, stock)
│   └── slices/      # UI state slices (auth, ui, etc.)
├── features/        # Feature folders (products, locations, stock)
└── components/      # Shared UI components
```

- User role is stored in the Redux auth slice after JWT login
- Route guards implemented as TanStack Router `beforeLoad` hooks that read from the auth slice
- All types consumed from `@warehouser/shared-types` — no DTO duplication

### `apps/server` — NestJS + Mongoose

**Modules:** `AuthModule`, `UsersModule`, `ProductsModule`, `LocationsModule`, `StockModule`

| Concern | Solution |
|---|---|
| ORM / ODM | Mongoose via `@nestjs/mongoose` |
| Auth | JWT + Passport (`AuthModule`) |
| Authorization | `RolesGuard` + `@Roles()` decorator |
| Validation | `class-validator` + `class-transformer` on all DTOs |
| Config | `@nestjs/config` + `.env` (Mongo URI, JWT secret, port) |

**Roles:** `admin`, `staff`, `viewer` — stored as an enum field on the User document.

Mongoose schemas are defined per module; no global schema barrel. DTOs extend/implement interfaces from `@warehouser/shared-types` and add `class-validator` decorators server-side.

---

## Shared Packages

### `packages/shared-types`
- Pure TypeScript, no runtime dependencies, no build step (TS project references only)
- **Domain interfaces:** `IProduct`, `ILocation`, `IStockMovement`, `IUser`
- **Enums:** `UserRole` (`admin | staff | viewer`), `MovementType` (`in | out | transfer`)
- **DTO shapes:** `CreateProductDto`, `UpdateProductDto`, `StockMovementDto`, etc.

### `packages/utils`
- Pure functions, no side effects, Node + browser compatible
- Compiled to `dist/` via `tsc`
- Starting candidates: date formatting, pagination helpers, net stock movement calculations

### `packages/eslint-config`
- No build step — consumed as source via `exports` in `package.json`
- Exports:
  - `@warehouser/eslint-config/base`
  - `@warehouser/eslint-config/react`
  - `@warehouser/eslint-config/nest`

---

## Deployment

- Docker Compose on a single VPS
- Two services: `web` (Nginx serving Vite build) and `server` (Node/NestJS), plus `mongo`
- Environment variables injected at runtime via `.env` file on the host

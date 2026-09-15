# Schema Validation with Zod

Status: Accepted

## Context

`apps/server` used `class-validator` + `class-transformer` for request
validation via NestJS's `ValidationPipe`, decorating DTO classes with
decorators (`@IsString()`, `@IsOptional()`, etc.). `apps/web` had no
validation library. Both apps are still scaffolds — no controllers/DTOs or
forms exist yet — so this decision is made before real validation code
accumulates on the old pattern.

Decorator-based validation (class-validator) duplicates shape information
that already lives in TypeScript types, requires `reflect-metadata` and
experimental decorators, and doesn't give the web app anything to reuse: a
web form and a server DTO validating the "same" request would be defined
twice, by hand, with no guarantee they stay in sync.

## Decision

Use `zod` for schema validation across the monorepo:

- **`packages/contracts`** is the single source of truth for zod schemas that
  describe requests/responses crossing the web↔server boundary. Both apps
  depend on it and derive types from schemas with `z.infer`.
- **`apps/server`** validates incoming requests with
  [`nestjs-zod`](https://www.npmjs.com/package/nestjs-zod), which wires zod
  schemas into NestJS's pipe system. DTOs are created with `createZodDto()`
  wrapping a schema from `@warehouser/contracts`, and the global
  `ZodValidationPipe` (registered in `main.ts`) validates against them the
  same way `ValidationPipe` did for class-validator.
- **`apps/web`** uses `zod` directly (e.g. with a form library's zod
  resolver) and imports shared request schemas from `@warehouser/contracts`
  where a form submits data the server will validate against the same shape.
- **App-local validation** — a schema that only one side needs (e.g. a
  server-internal config shape, or a web-only UI field with no server
  counterpart) is defined with plain `zod` inside that app
  (`apps/server/src` or `apps/web/src`), not in `packages/contracts`.
  `packages/contracts` only holds schemas shared across the boundary.

`class-validator` and `class-transformer` are removed.

## Consequences

- One schema definition per shared request/response shape, reused by both
  apps, instead of parallel class-validator DTOs and hand-written web-side
  checks that can drift apart.
- Schema shapes are plain data (zod objects) rather than decorated classes,
  so they don't depend on `reflect-metadata` / `emitDecoratorMetadata` to
  work — though the server still needs those for NestJS's own DI.
- `packages/contracts` becomes a new build dependency for both apps; changes
  to a shared schema now require rebuilding it before consumers pick up the
  change (same pattern already used by `packages/shared-types`).
- Adds a bit of judgment call at authoring time: contributors need to decide
  whether a new schema belongs in `packages/contracts` (shared) or inside the
  app (local-only). The rule of thumb is: if it validates data that crosses
  the web↔server boundary, it goes in `contracts`; otherwise it stays local.

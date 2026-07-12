# Adding and Using Contracts

How to add a new zod schema to `packages/contracts` and consume it from
`apps/server` and `apps/web`. Background and rationale: [ADR — Schema
Validation with Zod](../adr/12-07-2026-schema-validation-with-zod.md).

## When a schema belongs in `contracts`

Only schemas that validate data crossing the web↔server boundary
(request/response shapes) go in `packages/contracts`. A schema only one side
needs (server-internal config, a web-only UI field) stays local to that app,
defined with plain `zod` in `apps/server/src` or `apps/web/src`.

## 1. Create the module directory

Schemas are grouped by module under `packages/contracts/src/`, one directory
per module (e.g. a domain or resource):

```
packages/contracts/src/
  [module-name]/
    [schema-name].ts
    index.ts
```

Each schema file exports one schema (and, where useful, its inferred type):

```ts
// packages/contracts/src/user/create-user.schema.ts
import { z } from 'zod';

export const createUserSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1),
});

export type CreateUserDto = z.infer<typeof createUserSchema>;
```

## 2. Barrel-export the module

Follow the same pattern `packages/utils` uses: each module has its own
`index.ts` that re-exports everything in that module, nothing more.

```ts
// packages/contracts/src/user/index.ts
export { createUserSchema } from './create-user.schema';
export type { CreateUserDto } from './create-user.schema';
```

Compare with `packages/utils/src/asserts/index.ts`, which re-exports each
file in `asserts/` the same way.

## 3. Expose the module via `package.json`

Add a subpath export for the module in `packages/contracts/package.json`,
mirroring how `packages/utils` exposes `./asserts`, `./predicates`, etc.:

```json
{
  "exports": {
    "./user": {
      "types": "./dist/user/index.d.ts",
      "default": "./dist/user/index.js"
    }
  }
}
```

There is no root `.` export — consumers always import from a specific
module subpath (`@warehouser/contracts/user`), not from the package root.
The placeholder `packages/contracts/src/index.ts` is only there until the
first module exists; once modules are added, schemas are imported via their
module subpath and the root barrel is removed.

## 4. Build the package

Both apps consume compiled output (`dist/`), so rebuild `contracts` after
adding or changing a schema before the change is visible to consumers:

```bash
pnpm --filter @warehouser/contracts build
# or, from the repo root:
pnpm build
```

## 5. Use it in `apps/server`

Wrap the schema with `createZodDto()` from `nestjs-zod` to get a DTO class;
the global `ZodValidationPipe` (registered in `apps/server/src/main.ts`)
validates incoming requests against it the same way `ValidationPipe` did for
class-validator DTOs.

```ts
import { createUserSchema } from '@warehouser/contracts/user';
import { createZodDto } from 'nestjs-zod';

export class CreateUserDto extends createZodDto(createUserSchema) {}
```

```ts
@Post()
create(@Body() dto: CreateUserDto) {
  // dto is validated and typed as z.infer<typeof createUserSchema>
}
```

## 6. Use it in `apps/web`

Import the same schema directly with `zod`, e.g. as a form library's zod
resolver, so the form validates against the exact shape the server expects:

```ts
import { createUserSchema } from '@warehouser/contracts/user';
import { zodResolver } from '@hookform/resolvers/zod';

const resolver = zodResolver(createUserSchema);
```

## Checklist for a new shared schema

- [ ] Schema file at `packages/contracts/src/[module-name]/[schema-name].ts`
- [ ] Module `index.ts` re-exports the schema (and its inferred type)
- [ ] Subpath export added to `packages/contracts/package.json`
- [ ] `packages/contracts` rebuilt
- [ ] Consumed via `@warehouser/contracts/[module-name]` in `apps/server`
      and/or `apps/web` — never via the package root

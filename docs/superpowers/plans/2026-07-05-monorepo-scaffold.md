# Warehouser Monorepo Scaffold — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold a fully wired pnpm + Turborepo monorepo with a React 19 web app, NestJS server, and three shared packages — ready for feature development.

**Architecture:** Two apps (`web`, `server`) and three packages (`eslint-config`, `shared-types`, `utils`) linked via pnpm `workspace:*` and TypeScript project references. Turborepo orchestrates `lint → build → test` with output caching.

**Tech Stack:** pnpm 10, Turborepo, TypeScript 5, React 19, Vite, TanStack Router, Redux Toolkit + RTK Query, NestJS, Mongoose, ESLint flat config, Prettier (via eslint-config-prettier)

## Global Constraints

- Package manager: pnpm 10.32.0 (already set in root `package.json`)
- All package names scoped to `@warehouser/<name>`
- All packages `private: true`
- Cross-package imports use `workspace:*`
- TypeScript strict mode everywhere
- `composite: true` and `declarationMap: true` on all packages
- ESLint flat config format (not legacy `.eslintrc`)
- No package published to npm

---

### Task 1: Root workspace configuration

**Files:**
- Modify: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `.npmrc`
- Create: `tsconfig.base.json`
- Create: `turbo.json`
- Create: `.gitignore`

**Interfaces:**
- Produces: workspace root that all other tasks build on

- [ ] **Step 1: Update root `package.json`**

Replace the existing content with:

```json
{
  "name": "warehouser",
  "version": "1.0.0",
  "private": true,
  "packageManager": "pnpm@10.32.0",
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "test": "turbo run test",
    "clean": "turbo run clean"
  },
  "devDependencies": {
    "turbo": "^2.5.4",
    "typescript": "^5.8.3"
  }
}
```

- [ ] **Step 2: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 3: Create `.npmrc`**

```ini
shamefully-hoist=false
strict-peer-dependencies=false
```

- [ ] **Step 4: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 5: Create `turbo.json`**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "ui": "tui",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "clean": {
      "cache": false
    }
  }
}
```

- [ ] **Step 6: Create `.gitignore`**

```
node_modules/
dist/
.turbo/
coverage/
*.env
.env.local
```

- [ ] **Step 7: Install root dependencies**

```bash
pnpm install
```

Expected: `node_modules/.pnpm` created, `pnpm-lock.yaml` generated.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-workspace.yaml .npmrc tsconfig.base.json turbo.json .gitignore pnpm-lock.yaml
git commit -m "chore: scaffold root workspace with pnpm and Turborepo"
```

---

### Task 2: `packages/eslint-config`

**Files:**
- Create: `packages/eslint-config/package.json`
- Create: `packages/eslint-config/base.js`
- Create: `packages/eslint-config/react.js`
- Create: `packages/eslint-config/nest.js`

**Interfaces:**
- Produces: `@warehouser/eslint-config/base`, `/react`, `/nest` — imported by apps in their own `eslint.config.mjs`

- [ ] **Step 1: Create `packages/eslint-config/package.json`**

```json
{
  "name": "@warehouser/eslint-config",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    "./base": "./base.js",
    "./react": "./react.js",
    "./nest": "./nest.js"
  },
  "dependencies": {
    "@eslint/js": "^9.28.0",
    "eslint-config-prettier": "^10.1.5",
    "eslint-plugin-react": "^7.37.5",
    "eslint-plugin-react-hooks": "^5.2.0",
    "typescript-eslint": "^8.34.0"
  },
  "peerDependencies": {
    "eslint": "^9.0.0"
  }
}
```

- [ ] **Step 2: Create `packages/eslint-config/base.js`**

```js
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "error"
    }
  }
];
```

- [ ] **Step 3: Create `packages/eslint-config/react.js`**

```js
import base from "./base.js";
import reactPlugin from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  ...base,
  reactPlugin.configs.flat.recommended,
  {
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react/react-in-jsx-scope": "off"
    },
    settings: {
      react: { version: "detect" }
    }
  }
];
```

- [ ] **Step 4: Create `packages/eslint-config/nest.js`**

```js
import base from "./base.js";

export default [
  ...base,
  {
    rules: {
      "@typescript-eslint/explicit-function-return-type": "error",
      "@typescript-eslint/explicit-module-boundary-types": "error"
    }
  }
];
```

- [ ] **Step 5: Install dependencies**

```bash
pnpm install
```

- [ ] **Step 6: Verify exports resolve**

```bash
node -e "import('@warehouser/eslint-config/base').then(m => console.log('ok', typeof m.default))"
```

Expected: `ok object`

- [ ] **Step 7: Commit**

```bash
git add packages/eslint-config
git commit -m "feat(eslint-config): add shared ESLint flat configs (base, react, nest)"
```

---

### Task 3: `packages/shared-types`

**Files:**
- Create: `packages/shared-types/package.json`
- Create: `packages/shared-types/tsconfig.json`
- Create: `packages/shared-types/src/index.ts`
- Create: `packages/shared-types/src/enums.ts`
- Create: `packages/shared-types/src/interfaces.ts`
- Create: `packages/shared-types/src/dtos.ts`

**Interfaces:**
- Produces: `@warehouser/shared-types` — exports `UserRole`, `MovementType`, `IProduct`, `ILocation`, `IStockMovement`, `IUser`, `CreateProductDto`, `UpdateProductDto`, `CreateLocationDto`, `StockMovementDto`

- [ ] **Step 1: Create `packages/shared-types/package.json`**

```json
{
  "name": "@warehouser/shared-types",
  "version": "0.0.1",
  "private": true,
  "exports": {
    ".": {
      "types": "./src/index.ts"
    }
  },
  "scripts": {
    "lint": "echo \"no lint for shared-types\""
  }
}
```

- [ ] **Step 2: Create `packages/shared-types/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "declarationMap": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `packages/shared-types/src/enums.ts`**

```ts
export enum UserRole {
  Admin = "admin",
  Staff = "staff",
  Viewer = "viewer"
}

export enum MovementType {
  In = "in",
  Out = "out",
  Transfer = "transfer"
}
```

- [ ] **Step 4: Create `packages/shared-types/src/interfaces.ts`**

```ts
import type { UserRole, MovementType } from "./enums.js";

export interface IUser {
  _id: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

export interface IProduct {
  _id: string;
  name: string;
  sku: string;
  description?: string;
  unit: string;
  createdAt: string;
}

export interface ILocation {
  _id: string;
  name: string;
  code: string;
  description?: string;
}

export interface IStockMovement {
  _id: string;
  product: string;
  fromLocation?: string;
  toLocation?: string;
  type: MovementType;
  quantity: number;
  performedBy: string;
  note?: string;
  createdAt: string;
}
```

- [ ] **Step 5: Create `packages/shared-types/src/dtos.ts`**

```ts
import type { MovementType } from "./enums.js";

export interface CreateProductDto {
  name: string;
  sku: string;
  description?: string;
  unit: string;
}

export interface UpdateProductDto {
  name?: string;
  description?: string;
  unit?: string;
}

export interface CreateLocationDto {
  name: string;
  code: string;
  description?: string;
}

export interface UpdateLocationDto {
  name?: string;
  description?: string;
}

export interface StockMovementDto {
  productId: string;
  fromLocationId?: string;
  toLocationId?: string;
  type: MovementType;
  quantity: number;
  note?: string;
}

export interface PaginationDto {
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}
```

- [ ] **Step 6: Create `packages/shared-types/src/index.ts`**

```ts
export * from "./enums.js";
export * from "./interfaces.js";
export * from "./dtos.js";
```

- [ ] **Step 7: Verify types compile**

```bash
pnpm --filter @warehouser/shared-types exec tsc --noEmit
```

Expected: no output (clean).

- [ ] **Step 8: Commit**

```bash
git add packages/shared-types
git commit -m "feat(shared-types): add domain interfaces, enums, and DTOs"
```

---

### Task 4: `packages/utils`

**Files:**
- Create: `packages/utils/package.json`
- Create: `packages/utils/tsconfig.json`
- Create: `packages/utils/src/index.ts`
- Create: `packages/utils/src/pagination.ts`
- Create: `packages/utils/src/date.ts`
- Create: `packages/utils/src/stock.ts`
- Create: `packages/utils/src/pagination.test.ts`
- Create: `packages/utils/src/stock.test.ts`

**Interfaces:**
- Consumes: `@warehouser/shared-types` — `PaginatedResponse`, `IStockMovement`, `MovementType`
- Produces: `@warehouser/utils` — exports `paginate`, `formatDate`, `calcNetStock`

- [ ] **Step 1: Create `packages/utils/package.json`**

```json
{
  "name": "@warehouser/utils",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "lint": "eslint src",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@warehouser/shared-types": "workspace:*"
  },
  "devDependencies": {
    "@warehouser/eslint-config": "workspace:*",
    "vitest": "^3.2.4"
  }
}
```

- [ ] **Step 2: Create `packages/utils/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "declarationMap": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "references": [
    { "path": "../shared-types" }
  ],
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
}
```

- [ ] **Step 3: Write failing tests first**

Create `packages/utils/src/pagination.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { paginate } from "./pagination.js";

describe("paginate", () => {
  it("slices data and returns metadata", () => {
    const items = [1, 2, 3, 4, 5];
    const result = paginate(items, { page: 2, limit: 2 });
    expect(result.data).toEqual([3, 4]);
    expect(result.total).toBe(5);
    expect(result.page).toBe(2);
    expect(result.limit).toBe(2);
  });

  it("defaults page to 1 and limit to 20", () => {
    const items = Array.from({ length: 5 }, (_, i) => i);
    const result = paginate(items, {});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.data).toHaveLength(5);
  });
});
```

Create `packages/utils/src/stock.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { calcNetStock } from "./stock.js";
import { MovementType } from "@warehouser/shared-types";

describe("calcNetStock", () => {
  it("adds in-movements and subtracts out-movements", () => {
    const movements = [
      { type: MovementType.In, quantity: 10 },
      { type: MovementType.In, quantity: 5 },
      { type: MovementType.Out, quantity: 3 }
    ];
    expect(calcNetStock(movements)).toBe(12);
  });

  it("counts transfer as neither in nor out", () => {
    const movements = [
      { type: MovementType.In, quantity: 10 },
      { type: MovementType.Transfer, quantity: 5 }
    ];
    expect(calcNetStock(movements)).toBe(10);
  });

  it("returns 0 for empty array", () => {
    expect(calcNetStock([])).toBe(0);
  });
});
```

- [ ] **Step 4: Run tests to confirm they fail**

```bash
pnpm --filter @warehouser/utils test
```

Expected: FAIL — `Cannot find module './pagination.js'` and `'./stock.js'`

- [ ] **Step 5: Implement `src/pagination.ts`**

```ts
import type { PaginatedResponse, PaginationDto } from "@warehouser/shared-types";

export function paginate<T>(items: T[], dto: PaginationDto): PaginatedResponse<T> {
  const page = dto.page ?? 1;
  const limit = dto.limit ?? 20;
  const start = (page - 1) * limit;
  return {
    data: items.slice(start, start + limit),
    total: items.length,
    page,
    limit
  };
}
```

- [ ] **Step 6: Implement `src/date.ts`**

```ts
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}
```

- [ ] **Step 7: Implement `src/stock.ts`**

```ts
import { MovementType } from "@warehouser/shared-types";

export function calcNetStock(
  movements: Array<{ type: MovementType; quantity: number }>
): number {
  return movements.reduce((acc, m) => {
    if (m.type === MovementType.In) return acc + m.quantity;
    if (m.type === MovementType.Out) return acc - m.quantity;
    return acc;
  }, 0);
}
```

- [ ] **Step 8: Create `src/index.ts`**

```ts
export * from "./pagination.js";
export * from "./date.js";
export * from "./stock.js";
```

- [ ] **Step 9: Run tests — confirm they pass**

```bash
pnpm --filter @warehouser/utils test
```

Expected: all 5 tests PASS.

- [ ] **Step 10: Build**

```bash
pnpm --filter @warehouser/utils build
```

Expected: `packages/utils/dist/` created with `.js` and `.d.ts` files.

- [ ] **Step 11: Commit**

```bash
git add packages/utils
git commit -m "feat(utils): add paginate, formatDate, calcNetStock utilities with tests"
```

---

### Task 5: `apps/server` — NestJS scaffold

**Files:**
- Create: `apps/server/package.json`
- Create: `apps/server/tsconfig.json`
- Create: `apps/server/tsconfig.build.json`
- Create: `apps/server/.eslint.config.mjs`
- Create: `apps/server/src/main.ts`
- Create: `apps/server/src/app.module.ts`

**Interfaces:**
- Consumes: `@warehouser/shared-types` (workspace:*), `@warehouser/eslint-config/nest`
- Produces: running NestJS server on port from env (default 3001)

- [ ] **Step 1: Create `apps/server/package.json`**

```json
{
  "name": "@warehouser/server",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "build": "nest build",
    "dev": "nest start --watch",
    "start": "node dist/main",
    "lint": "eslint src",
    "test": "jest",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@nestjs/common": "^11.0.0",
    "@nestjs/config": "^4.0.0",
    "@nestjs/core": "^11.0.0",
    "@nestjs/jwt": "^11.0.0",
    "@nestjs/mongoose": "^11.0.0",
    "@nestjs/passport": "^11.0.0",
    "@nestjs/platform-express": "^11.0.0",
    "@warehouser/shared-types": "workspace:*",
    "class-transformer": "^0.5.1",
    "class-validator": "^0.14.1",
    "mongoose": "^8.15.1",
    "passport": "^0.7.0",
    "passport-jwt": "^4.0.1",
    "passport-local": "^1.0.0",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1"
  },
  "devDependencies": {
    "@nestjs/cli": "^11.0.0",
    "@nestjs/testing": "^11.0.0",
    "@types/jest": "^29.5.14",
    "@types/passport-jwt": "^4.0.1",
    "@types/passport-local": "^1.0.38",
    "@warehouser/eslint-config": "workspace:*",
    "eslint": "^9.28.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.3.4"
  }
}
```

- [ ] **Step 2: Create `apps/server/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "CommonJS",
    "moduleResolution": "node",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "references": [
    { "path": "../../packages/shared-types" }
  ],
  "include": ["src"]
}
```

- [ ] **Step 3: Create `apps/server/tsconfig.build.json`**

```json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "dist", "**/*.spec.ts"]
}
```

- [ ] **Step 4: Create `apps/server/.eslint.config.mjs`**

```js
import nest from "@warehouser/eslint-config/nest";

export default [
  ...nest,
  {
    ignores: ["dist/**", "node_modules/**"]
  }
];
```

- [ ] **Step 5: Create `apps/server/src/app.module.ts`**

```ts
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true })
  ]
})
export class AppModule {}
```

- [ ] **Step 6: Create `apps/server/src/main.ts`**

```ts
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.enableCors();
  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  console.log(`Server running on port ${port}`);
}

bootstrap();
```

- [ ] **Step 7: Create `apps/server/.env.example`**

```
PORT=3001
MONGO_URI=mongodb://localhost:27017/warehouser
JWT_SECRET=change-me-in-production
```

- [ ] **Step 8: Install dependencies**

```bash
pnpm install
```

- [ ] **Step 9: Verify server compiles**

```bash
pnpm --filter @warehouser/server build
```

Expected: `apps/server/dist/` created, no TypeScript errors.

- [ ] **Step 10: Commit**

```bash
git add apps/server
git commit -m "feat(server): scaffold NestJS app with config and validation pipe"
```

---

### Task 6: `apps/web` — React 19 + Vite scaffold

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/tsconfig.node.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/.eslint.config.mjs`
- Create: `apps/web/index.html`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/router.ts`
- Create: `apps/web/src/routes/index.route.ts`
- Create: `apps/web/src/store/index.ts`
- Create: `apps/web/src/store/slices/authSlice.ts`

**Interfaces:**
- Consumes: `@warehouser/shared-types`, `@warehouser/utils`, `@warehouser/eslint-config/react`
- Produces: Vite dev server, wired Redux store, TanStack Router with one root route

- [ ] **Step 1: Create `apps/web/package.json`**

```json
{
  "name": "@warehouser/web",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -p tsconfig.json && vite build",
    "preview": "vite preview",
    "lint": "eslint src",
    "test": "vitest run",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@reduxjs/toolkit": "^2.8.2",
    "@tanstack/react-router": "^1.121.12",
    "@warehouser/shared-types": "workspace:*",
    "@warehouser/utils": "workspace:*",
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "react-redux": "^9.2.0"
  },
  "devDependencies": {
    "@types/react": "^19.1.6",
    "@types/react-dom": "^19.1.5",
    "@vitejs/plugin-react": "^4.5.2",
    "@warehouser/eslint-config": "workspace:*",
    "eslint": "^9.28.0",
    "vite": "^6.3.5",
    "vitest": "^3.2.4"
  }
}
```

- [ ] **Step 2: Create `apps/web/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "declarationMap": true,
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "noEmit": true
  },
  "references": [
    { "path": "../../packages/shared-types" },
    { "path": "../../packages/utils" },
    { "path": "./tsconfig.node.json" }
  ],
  "include": ["src"]
}
```

- [ ] **Step 3: Create `apps/web/tsconfig.node.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "noEmit": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 4: Create `apps/web/vite.config.ts`**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      "/api": "http://localhost:3001"
    }
  }
});
```

- [ ] **Step 5: Create `apps/web/.eslint.config.mjs`**

```js
import react from "@warehouser/eslint-config/react";

export default [
  ...react,
  {
    ignores: ["dist/**", "node_modules/**"]
  }
];
```

- [ ] **Step 6: Create `apps/web/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Warehouser</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Create `apps/web/src/store/slices/authSlice.ts`**

```ts
import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { IUser } from "@warehouser/shared-types";

interface AuthState {
  user: IUser | null;
  token: string | null;
}

const initialState: AuthState = { user: null, token: null };

export const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setCredentials(state, action: PayloadAction<{ user: IUser; token: string }>) {
      state.user = action.payload.user;
      state.token = action.payload.token;
    },
    clearCredentials(state) {
      state.user = null;
      state.token = null;
    }
  }
});

export const { setCredentials, clearCredentials } = authSlice.actions;
export default authSlice.reducer;
```

- [ ] **Step 8: Create `apps/web/src/store/index.ts`**

```ts
import { configureStore } from "@reduxjs/toolkit";
import authReducer from "./slices/authSlice.js";

export const store = configureStore({
  reducer: {
    auth: authReducer
  }
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
```

- [ ] **Step 9: Create `apps/web/src/routes/index.route.ts`**

```ts
import { createRoute, rootRouteWithContext } from "@tanstack/react-router";
import type { RootState } from "../store/index.js";

interface RouterContext {
  getState: () => RootState;
}

export const rootRoute = rootRouteWithContext<RouterContext>()({});

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => null
});
```

- [ ] **Step 10: Create `apps/web/src/router.ts`**

```ts
import { createRouter } from "@tanstack/react-router";
import { rootRoute, indexRoute } from "./routes/index.route.js";
import { store } from "./store/index.js";

const routeTree = rootRoute.addChildren([indexRoute]);

export const router = createRouter({
  routeTree,
  context: { getState: () => store.getState() }
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
```

- [ ] **Step 11: Create `apps/web/src/App.tsx`**

```tsx
import { RouterProvider } from "@tanstack/react-router";
import { router } from "./router.js";

export default function App(): React.ReactElement {
  return <RouterProvider router={router} />;
}
```

- [ ] **Step 12: Create `apps/web/src/main.tsx`**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { store } from "./store/index.js";
import App from "./App.js";

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

createRoot(root).render(
  <StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </StrictMode>
);
```

- [ ] **Step 13: Install dependencies**

```bash
pnpm install
```

- [ ] **Step 14: Verify web type-checks**

```bash
pnpm --filter @warehouser/web exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 15: Verify Vite dev server starts**

```bash
pnpm --filter @warehouser/web dev
```

Expected: `Local: http://localhost:3000/` — browser shows blank page (no 404, no console errors).

- [ ] **Step 16: Commit**

```bash
git add apps/web
git commit -m "feat(web): scaffold React 19 + Vite + TanStack Router + Redux Toolkit"
```

---

### Task 7: Turborepo end-to-end wiring

**Files:**
- Modify: `turbo.json` (no change needed — already correct)
- Verify: full `turbo run build` succeeds across all packages and apps

**Interfaces:**
- Consumes: all prior tasks
- Produces: verified monorepo where `pnpm build`, `pnpm lint`, `pnpm test` all run cleanly

- [ ] **Step 1: Run full build**

```bash
pnpm build
```

Expected: Turborepo builds in order — `shared-types` → `utils` → `server` + `web` — no errors, outputs cached.

- [ ] **Step 2: Run full lint**

```bash
pnpm lint
```

Expected: all packages report clean (zero lint errors).

- [ ] **Step 3: Run full test**

```bash
pnpm test
```

Expected: `utils` tests pass (5 tests). Server and web report no test files yet (exit 0 or skip).

- [ ] **Step 4: Verify Turborepo cache works**

```bash
pnpm build
```

Expected: second run shows `>>> FULL TURBO` — all tasks served from cache, near-instant.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "chore: verify Turborepo pipeline — build, lint, test all pass"
```

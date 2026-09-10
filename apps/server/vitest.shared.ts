import swc from 'unplugin-swc';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

/**
 * What every server tier shares: how TypeScript is compiled, and how a bare
 * `shared/...` specifier finds its file.
 *
 * `unplugin-swc` replaces Vite's esbuild transform because esbuild cannot emit
 * `design:paramtypes` — it "does not replicate TypeScript's type system"
 * (https://esbuild.github.io/content-types/#typescript-caveats) — and without
 * that metadata every Nest constructor injection resolves to `undefined`.
 *
 * `vite-tsconfig-paths` is the replacement for Jest's `moduleDirectories`: it
 * prepends `compilerOptions.baseUrl` (`./src`) to every bare import, which is
 * how the ~3000 `shared/...` / `warehouses/...` specifiers across the suite
 * resolve.
 *
 * Nothing here sets `include`, `exclude` or `setupFiles`: `mergeConfig`
 * concatenates arrays, so a shared entry would silently accumulate duplicates
 * in every tier. Each tier states those in full.
 */
export default defineConfig({
  plugins: [
    tsconfigPaths({ root: import.meta.dirname }),
    swc.vite({
      // ESM output — the server ships as an ES module.
      module: { type: 'es6' },
      // These are already inferred from `apps/server/tsconfig.json`, but
      // pinning them means a tsconfig edit cannot silently disable Nest DI.
      jsc: {
        // Not inferred from `compilerOptions.target`; must be stated, and must
        // match `packages/tsconfig/tsconfig.base.json`. Raising it to `es2022`
        // silently turns `useDefineForClassFields` on, which changes what a
        // TypeORM entity instance looks like: `id!: string` stops emitting
        // nothing and starts defining the property as `undefined`, so a
        // partial `.select([...]).getMany()` returns rows carrying every
        // column of the entity instead of the three that were asked for.
        target: 'es2021',
        parser: { syntax: 'typescript', decorators: true },
        transform: {
          legacyDecorator: true,
          decoratorMetadata: true,
          // Already the default at this target; stated so raising the target
          // cannot quietly change entity shape (see above).
          useDefineForClassFields: false,
        },
        // Nest's own error messages and TypeORM's entity registry read the
        // original class name.
        keepClassNames: true,
      },
    }),
  ],
  test: {
    environment: 'node',
    // Explicit `import { ... } from 'vitest'` in every spec, matching
    // `apps/web`. `globals: true` would need `vitest/globals` in the app's
    // `types`, which injects `describe`/`it`/`expect` into the ambient type
    // space of every production file too.
    globals: false,
    // Vitest 5's default; stated so a future default change cannot move the
    // PGlite tier onto threads, where PGlite's WebAssembly and TypeORM's
    // `process.cwd()` reads behave worse.
    pool: 'forks',
    // Vitest 5 enables this by default; stated because specs call
    // `vi.clearAllMocks()` in `beforeEach` and the intent should be visible.
    clearMocks: true,
  },
});

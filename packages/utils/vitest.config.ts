import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

/**
 * A plain TypeScript library with no decorators, so Vite's default esbuild
 * transform compiles it correctly and faster than SWC would. Only
 * `apps/server` needs `unplugin-swc`, and only because esbuild cannot emit the
 * `design:paramtypes` metadata Nest's DI reads.
 *
 * `vite-tsconfig-paths` replaces Jest's `moduleDirectories: ['<rootDir>']`:
 * `tsconfig.json` sets `baseUrl: "src"`, and the plugin prepends it to every
 * bare import, so specifiers like `asserts/assert` keep resolving into the
 * source tree exactly as `tsc` (and `tsc-alias`) resolve them.
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    // Since Vitest 4 the default `exclude` covers only `node_modules` and
    // `.git`, so a built `dist/**/*.spec.js` would otherwise be collected.
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Where Jest's `coverageDirectory: '../coverage'` (relative to its
      // `rootDir: src`) wrote, and what `turbo.json` declares as the output.
      reportsDirectory: './coverage',
    },
  },
});

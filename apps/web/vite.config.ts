import path from 'path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@warehouser/contracts/access': path.resolve(
        __dirname,
        '../../packages/contracts/src/access/index.ts',
      ),
      '@warehouser/contracts/auth': path.resolve(
        __dirname,
        '../../packages/contracts/src/auth/index.ts',
      ),
      '@warehouser/contracts/customer-orders': path.resolve(
        __dirname,
        '../../packages/contracts/src/customer-orders/index.ts',
      ),
      '@warehouser/contracts/customers': path.resolve(
        __dirname,
        '../../packages/contracts/src/customers/index.ts',
      ),
      '@warehouser/contracts/items': path.resolve(
        __dirname,
        '../../packages/contracts/src/items/index.ts',
      ),
      '@warehouser/contracts/purchase-drafts': path.resolve(
        __dirname,
        '../../packages/contracts/src/purchase-drafts/index.ts',
      ),
      '@warehouser/contracts/users': path.resolve(
        __dirname,
        '../../packages/contracts/src/users/index.ts',
      ),
      '@warehouser/contracts/workspaces': path.resolve(
        __dirname,
        '../../packages/contracts/src/workspaces/index.ts',
      ),
      '@warehouser/shared-types/enums': path.resolve(
        __dirname,
        '../../packages/shared-types/src/enums/index.ts',
      ),
      access: path.resolve(__dirname, '../../packages/contracts/src/access'),
      'customer-orders': path.resolve(
        __dirname,
        '../../packages/contracts/src/customer-orders',
      ),
      // `packages/contracts/tsconfig.json` sets `baseUrl: src`, so a contracts module importing
      // another one names it bare — `customers/customers-projections`. Both aliases are required:
      // without the subpath one above, vite resolves the import through the package `exports` map
      // to the compiled CommonJS `dist`, whose `__exportStar` re-exports rollup cannot statically
      // analyse, and only `vite build` fails while every test tier stays green.
      customers: path.resolve(
        __dirname,
        '../../packages/contracts/src/customers',
      ),
      items: path.resolve(__dirname, '../../packages/contracts/src/items'),
      'purchase-drafts': path.resolve(
        __dirname,
        '../../packages/contracts/src/purchase-drafts',
      ),
      workspaces: path.resolve(
        __dirname,
        '../../packages/contracts/src/workspaces',
      ),
      src: path.resolve(__dirname, './src'),
      App: path.resolve(__dirname, './src/App.tsx'),
      i18n: path.resolve(__dirname, './src/i18n.ts'),
      guards: path.resolve(__dirname, './src/guards'),
      modules: path.resolve(__dirname, './src/modules'),
      router: path.resolve(__dirname, './src/router.ts'),
      routes: path.resolve(__dirname, './src/routes'),
      shared: path.resolve(__dirname, './src/shared'),
      store: path.resolve(__dirname, './src/store'),
      test: path.resolve(__dirname, './src/test'),
    },
  },
  server: {
    port: 3200,
    proxy: {
      '/api': 'http://localhost:3100',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Since Vitest 4 the default `exclude` covers only `node_modules` and
    // `.git`, so a built `dist/**/*.spec.js` would be collected as a test file
    // the moment `vite build` emits one.
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});

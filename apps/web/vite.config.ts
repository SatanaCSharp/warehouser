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
      '@warehouser/shared-types/enums': path.resolve(
        __dirname,
        '../../packages/shared-types/src/enums/index.ts',
      ),
      access: path.resolve(__dirname, '../../packages/contracts/src/access'),
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
  },
});

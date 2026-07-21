import path from 'path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      src: path.resolve(__dirname, './src'),
      App: path.resolve(__dirname, './src/App.tsx'),
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
    port: 3000,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});

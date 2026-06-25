/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',   // 👈 относительные пути — работает везде (локально, на GitHub Pages и т.д.)
  resolve: {
    alias: {
      '@src': '/src',
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'https://wsisapi.legenda-dom.ru/corportal/hs/corportal',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.js'],
    coverage: {
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.js'],
      exclude: ['src/**/*.test.js'],
    },
  },
});

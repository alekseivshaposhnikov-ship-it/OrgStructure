/// <reference types="vitest" />
import { defineConfig } from 'vite';
import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Копирует docs/changelog.md в dist/ при билде,
 * чтобы changelog был доступен на production-сайте.
 */
function copyChangelogPlugin() {
  return {
    name: 'copy-changelog',
    closeBundle() {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const src = resolve(__dirname, 'docs', 'changelog.md');
      const destDir = resolve(__dirname, 'dist', 'docs');
      const dest = resolve(destDir, 'changelog.md');
      mkdirSync(destDir, { recursive: true });
      copyFileSync(src, dest);
      console.log('[copy-changelog] docs/changelog.md → dist/docs/changelog.md');
    },
  };
}

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
  plugins: [copyChangelogPlugin()],
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
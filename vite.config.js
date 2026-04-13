import { defineConfig } from 'vite';

export default defineConfig({
  base: './',   // 👈 относительные пути — работает везде (локально, на GitHub Pages и т.д.)
  resolve: {
    alias: {
      '@src': '/src',
    },
  },
});
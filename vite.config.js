import { defineConfig } from 'vite';

export default defineConfig({
  // пример настройки алиасов
  resolve: {
    alias: {
      '@src': '/src',
    },
  },
});
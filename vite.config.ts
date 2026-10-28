import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2500,
    assetsInlineLimit: 0,
  },
  worker: { format: 'es' },
});

import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // Both entries need Phaser at startup. Its shared minified engine is ~1.21 MB;
    // allow that known vendor cost while retaining warnings above 1.3 MB.
    chunkSizeWarningLimit: 1300,
    rollupOptions: {
      input: { app: 'index.html', showroom: 'showroom.html' },
      output: { manualChunks: { phaser: ['phaser'] } },
    },
  },
});

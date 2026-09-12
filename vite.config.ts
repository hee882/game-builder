import {defineConfig} from 'vite';
export default defineConfig({build:{rollupOptions:{input:{app:'index.html',showroom:'showroom.html'},output:{manualChunks:{phaser:['phaser']}}}}});

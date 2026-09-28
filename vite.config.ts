import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // 챌린지·쇼룸 엔트리는 Phaser를 시작부터 쓴다. 압축 전 약 1.21 MB인 공유 엔진 청크를
    // 알려진 비용으로 허용하되 1.3 MB를 넘으면 경고가 다시 뜨게 둔다.
    // 심해 전초기지 엔트리(index/outpost)는 Phaser를 쓰지 않는다 — 순수 Canvas 2D.
    chunkSizeWarningLimit: 1300,
    rollupOptions: {
      input: {
        app: 'index.html',
        outpost: 'outpost.html',
        challenge: 'challenge.html',
        showroom: 'showroom.html',
        idle: 'idle.html',
      },
      output: { manualChunks: { phaser: ['phaser'] } },
    },
  },
});

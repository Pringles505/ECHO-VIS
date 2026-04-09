import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// COOP/COEP headers are REQUIRED for SharedArrayBuffer,
// which ffmpeg.wasm needs for multi-threaded encoding.
export default defineConfig({
  plugins: [react()],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  // Tell Vite not to try to pre-bundle ffmpeg (it ships its own ESM)
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
});

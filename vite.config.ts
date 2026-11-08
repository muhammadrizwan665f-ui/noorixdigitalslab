import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: false, target: 'es2020', cssCodeSplit: true, rollupOptions: { output: { manualChunks: { react: ['react', 'react-dom'] } } } },
  server: { proxy: { '/api': 'http://127.0.0.1:8787', '/files': 'http://127.0.0.1:8787' } },
});

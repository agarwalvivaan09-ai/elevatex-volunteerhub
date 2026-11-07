import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// VITE_BASE is set by the GitHub Pages workflow ("/elevatex-volunteerhub/"); Firebase Hosting uses "/".
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  server: { port: 5173, host: true },
  build: {
    rollupOptions: {
      output: { manualChunks: { firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'], react: ['react', 'react-dom', 'react-router-dom'] } },
    },
    chunkSizeWarningLimit: 700,
  },
});

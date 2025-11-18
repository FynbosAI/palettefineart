import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Read env from monorepo root so all apps share the same .env
  envDir: '..',
  server: {
    // Remove problematic headers that can cause CORS issues with PDF.js workers
    // headers: {
    //   'Cross-Origin-Embedder-Policy': 'require-corp',
    //   'Cross-Origin-Opener-Policy': 'same-origin',
    // },
  },
  optimizeDeps: {
    exclude: ['pdfjs-dist']
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'pdfjs-dist': ['pdfjs-dist']
        }
      }
    }
  },
  // Add worker support for PDF.js
  worker: {
    format: 'es'
  }
});

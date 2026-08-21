import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    // The API runs separately in development; proxying keeps the browser on one
    // origin so no CORS configuration is needed during a soundcheck.
    proxy: { '/api': { target: 'http://localhost:3001', changeOrigin: true } },
  },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Mirrors nginx.conf: `go run .` in backend/ listens on 8080.
  server: { proxy: { '/api': 'http://localhost:8080' } },
});

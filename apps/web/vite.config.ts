import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Where `pnpm dev` starts the API: PORT of .env, 3000 by default.
const API_URL = 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    // The page calls the API at the same address as itself (/api/...), and the Vite server
    // forwards these requests to the API, as Caddy will in production. For the browser, the
    // page and the API have the same origin: no CORS to allow, and the API's protection
    // against requests from other websites (Sec-Fetch-Site) lets them through.
    proxy: { '/api/': API_URL },
  },
});

import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  server: {
    // Development only. In production the server route in src/routes/api.$.ts forwards `/api/*`
    // to API_INTERNAL_URL. The dev server answers non-HTML requests (such as <img>) before that
    // route sees them, so a real proxy is needed here for images and downloads to work.
    proxy: { '/api': process.env.API_INTERNAL_URL ?? 'http://localhost:3001' },
  },
  plugins: [tailwindcss(), nitro(), tanstackStart(), viteReact()],
});

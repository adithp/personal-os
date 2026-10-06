import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** Dev-only UI gallery: pnpm dev:ui */
export default defineConfig({
  root: 'gallery',
  plugins: [react(), tailwindcss()],
  server: { port: 5174, open: true },
});

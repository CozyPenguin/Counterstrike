import { defineConfig } from 'vite';
import { attachLAN } from './server/lan.js';

export default defineConfig({
  plugins: [{
    name: 'lan-multiplayer',
    configureServer(server) { attachLAN(server.httpServer); },
    configurePreviewServer(server) { attachLAN(server.httpServer); },
  }],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true,
  },
});

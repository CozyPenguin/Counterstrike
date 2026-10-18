import { defineConfig } from 'vite';
import { attachLAN } from './server/lan.js';

export default defineConfig({
  plugins: [{
    name: 'lan-multiplayer',
    configureServer(server) { const lan = attachLAN(server.httpServer); server.middlewares.use((req, res, next) => req.url?.split('?')[0] === '/api/rooms' ? lan.request(req, res) : next()); },
    configurePreviewServer(server) { const lan = attachLAN(server.httpServer); server.middlewares.use((req, res, next) => req.url?.split('?')[0] === '/api/rooms' ? lan.request(req, res) : next()); },
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

import { loadEnv, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const HEALTH_BODY = JSON.stringify({ status: 'ok', service: 'web', checks: {} });

// GET /health for the dev and preview servers (docs/tasks.md 0.2).
function healthPlugin(): Plugin {
  const handler = (req: { url?: string; method?: string }, res: { statusCode: number; setHeader(k: string, v: string): void; end(b: string): void }, next: () => void) => {
    if (req.url === '/health' && req.method === 'GET') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(HEALTH_BODY);
      return;
    }
    next();
  };
  return {
    name: 'health-endpoint',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

// GATEWAY_URL comes from the root .env (see .env.example) or the environment.
export default defineConfig(({ mode }) => {
  const gateway = loadEnv(mode, '..', '').GATEWAY_URL || 'http://localhost:3000';
  const proxy = {
    '/api': { target: gateway, changeOrigin: true },
    '/ws': { target: gateway, ws: true, changeOrigin: true },
  };
  return {
    plugins: [healthPlugin()],
    server: {
      port: 8080,
      strictPort: true,
      proxy,
      // shared/map.json lives outside web/ and is imported directly, never copied.
      fs: { allow: ['..'] },
    },
    preview: { port: 8080, strictPort: true, proxy },
  };
});

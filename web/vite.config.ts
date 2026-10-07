import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

// GATEWAY_URL comes from the root .env (see .env.example) or the environment.
export default defineConfig(({ mode }) => {
  const gateway = loadEnv(mode, '..', '').GATEWAY_URL || 'http://localhost:3000';
  const proxy = {
    '/api': { target: gateway, changeOrigin: true },
    '/ws': { target: gateway, ws: true, changeOrigin: true },
  };
  return {
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

import { defineConfig, Plugin } from 'vite';

function healthPlugin(): Plugin {
  return {
    name: 'health-endpoint',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/health' && req.method === 'GET') {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ status: 'ok', service: 'web', checks: {} }));
          return;
        }
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/health' && req.method === 'GET') {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ status: 'ok', service: 'web', checks: {} }));
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [healthPlugin()],
  server: {
    port: 8080,
  },
});

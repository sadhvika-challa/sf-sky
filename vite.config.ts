import { defineConfig, type Plugin } from 'vite'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

function localPrivateSpots(): Plugin {
  return {
    name: 'soleil-local-private-spots',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__soleil/private-spots', async (request, response) => {
        const remote = request.socket.remoteAddress;
        const host = request.headers.host ?? '';
        const localHost = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host);
        const sameOrigin = !request.headers.origin || request.headers.origin === `http://${host}`;
        if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote ?? '') ||
            !localHost || !sameOrigin) {
          response.statusCode = 403;
          response.end();
          return;
        }
        response.setHeader('Cache-Control', 'no-store');
        try {
          const data = await readFile(fileURLToPath(new URL('./private-spots.local', import.meta.url)), 'utf8');
          response.setHeader('Content-Type', 'application/json');
          response.end(data);
        } catch {
          response.statusCode = 204;
          response.end();
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), localPrivateSpots()],
})

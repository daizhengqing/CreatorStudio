import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATA_ROOT } from './config.js';
import './db/index.js';
import { installApi } from './routes/api.js';

const app = Fastify({ logger: true, bodyLimit: 1_048_576 });

await app.register(multipart, {
  limits: { fileSize: 4 * 1024 * 1024 * 1024, files: 1, fields: 0 },
});
await installApi(app);

// After pnpm build, the same local server can also serve the web app.
const webDist = resolve(dirname(fileURLToPath(import.meta.url)), '../../web/dist');
if (existsSync(webDist)) {
  await app.register(fastifyStatic, { root: webDist, prefix: '/' });
  app.setNotFoundHandler((request, reply) => {
    if (request.method === 'GET' && !request.url.startsWith('/api/')) return reply.sendFile('index.html');
    return reply.code(404).send({ error: 'Not found' });
  });
}

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '127.0.0.1';
await app.listen({ port, host });
app.log.info({ dataRoot: DATA_ROOT }, 'Media Studio local storage ready');

import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DATA_ROOT, DIRS } from './config.js';
import { createAgentService } from './agent/session-service.js';
import { mediaTools } from './agent/tools/media.js';
import { trendTools } from './agent/tools/trends.js';
import { xTools } from './agent/tools/x-monitor.js';
import { createTrendsService } from './harness/trends/index.js';
import { createXMonitorService } from './harness/x-monitor/index.js';
import { installAgentRoutes } from './routes/agent.js';
import { installApi } from './routes/api.js';
import { installCollectionRoutes } from './routes/collection.js';
import { installModelRoutes } from './routes/models.js';
import { initializeModels, models } from './services/models.js';

const app = Fastify({ logger: true });
await app.register(multipart, { limits: { fileSize: 4 * 1024 * 1024 * 1024, files: 1, fields: 0 } });

initializeModels();
const trends = createTrendsService(DIRS.trends, models);
const xMonitor = createXMonitorService(DIRS.xMonitor);
const agent = createAgentService([...mediaTools, ...trendTools(trends), ...xTools(xMonitor)]);

installApi(app);
installAgentRoutes(app, agent);
installModelRoutes(app);
installCollectionRoutes(app, trends, xMonitor);
app.addHook('onClose', async () => {
  xMonitor.dispose();
  await trends.dispose();
});

const webDist = fileURLToPath(new URL('../../web/dist', import.meta.url));
if (existsSync(webDist)) await app.register(fastifyStatic, { root: webDist, prefix: '/' });

await app.listen({ port: Number(process.env.PORT ?? 3000), host: '127.0.0.1' });
app.log.info({ dataRoot: DATA_ROOT }, 'CreatorStudio 已启动');

process.on('SIGINT', () => { void app.close(); });
process.on('SIGTERM', () => { void app.close(); });

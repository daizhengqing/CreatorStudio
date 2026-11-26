import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DATA_ROOT, DIRS } from './config.js';
import { createAgentService } from './agent/session-service.js';
import { mediaTools } from './agent/tools/media.js';
import { createScheduleTool } from './agent/tools/schedules.js';
import { createTrendsService } from './harness/trends/index.js';
import { createXMonitorService } from './harness/x-monitor/index.js';
import { createScheduleService } from './harness/schedules/index.js';
import { createCollectionMcp } from './mcp/index.js';
import { installAgentRoutes } from './routes/agent.js';
import { installApi } from './routes/api.js';
import { installCollectionRoutes } from './routes/collection.js';
import { installMcpRoutes } from './routes/mcp.js';
import { installModelRoutes } from './routes/models.js';
import { installScheduleRoutes } from './routes/schedules.js';
import { initializeModels, models } from './services/models.js';

const app = Fastify({ logger: true });
await app.register(multipart, { limits: { fileSize: 4 * 1024 * 1024 * 1024, files: 1, fields: 0 } });

initializeModels();
const trends = createTrendsService(DIRS.trends, models);
const xMonitor = createXMonitorService(DIRS.xMonitor);
const collectionMcp = await createCollectionMcp(trends, xMonitor);
const tools = [...mediaTools, ...collectionMcp.tools];
const schedules = createScheduleService({
  trends, x: xMonitor,
  // 调度器通过定时器触发执行，此时 Agent 已完成初始化。
  startConversation: input => agent.startScheduled(input),
  callCollectionTool: collectionMcp.call,
});
const agent: ReturnType<typeof createAgentService> = createAgentService(tools, [createScheduleTool(schedules)]);

app.addHook('preClose', async () => schedules.dispose());
installApi(app);
installAgentRoutes(app, agent);
installModelRoutes(app);
installCollectionRoutes(app, trends, xMonitor);
installMcpRoutes(app, collectionMcp.servers);
installScheduleRoutes(app, schedules);
app.addHook('onClose', async () => {
  await collectionMcp.close();
  xMonitor.dispose();
  await trends.dispose();
});

const webDist = fileURLToPath(new URL('../../web/dist', import.meta.url));
if (existsSync(webDist)) await app.register(fastifyStatic, { root: webDist, prefix: '/' });

await app.listen({ port: Number(process.env.PORT ?? 3000), host: '127.0.0.1' });
app.log.info({ dataRoot: DATA_ROOT }, 'CreatorStudio 已启动');

process.on('SIGINT', () => { void app.close(); });
process.on('SIGTERM', () => { void app.close(); });

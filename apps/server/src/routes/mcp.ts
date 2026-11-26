import { localhostHostValidation, localhostOriginValidation, toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler } from '@modelcontextprotocol/server';
import type { FastifyInstance } from 'fastify';
import type { createCollectionMcp } from '../mcp/index.js';

type Servers = Awaited<ReturnType<typeof createCollectionMcp>>['servers'];

export function installMcpRoutes(app: FastifyInstance, servers: Servers) {
  const validateHost = localhostHostValidation();
  const validateOrigin = localhostOriginValidation();
  const endpoints = [
    ['/mcp/trends', createMcpHandler(servers.trends)],
    ['/mcp/x-monitor', createMcpHandler(servers.xMonitor)],
  ] as const;

  for (const [path, handler] of endpoints) {
    const handle = toNodeHandler(handler);
    app.all(path, async (request, reply) => {
      reply.hijack();
      if (validateHost(request.raw, reply.raw) && validateOrigin(request.raw, reply.raw)) {
        await handle(request.raw, reply.raw, request.body);
      }
    });
  }

  app.addHook('onClose', async () => { await Promise.all(endpoints.map(([, handler]) => handler.close())); });
}

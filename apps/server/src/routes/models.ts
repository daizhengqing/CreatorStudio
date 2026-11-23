import type { ModelCompletionInput, ModelConfigInput, ModelProfileId } from '@creator-studio/plugin-sdk';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { closeModelConnections } from '../services/model-completion.js';
import { getModelConfig, models, saveModelConfig, testModelConnection } from '../services/models.js';

function modelError(reply: FastifyReply, error: unknown) {
  return reply.code(400).send({ error: error instanceof Error ? error.message : '模型请求失败' });
}

export function installModelRoutes(app: FastifyInstance): void {
  app.get('/api/models/config', async () => getModelConfig());
  app.put<{ Body: ModelConfigInput }>('/api/models/config', async (request, reply) => {
    try { return saveModelConfig(request.body); }
    catch (error) { return modelError(reply, error); }
  });
  app.post<{ Body: { profileId: ModelProfileId } }>('/api/models/test', async (request, reply) => {
    try { return await testModelConnection(request.body.profileId); }
    catch (error) { return modelError(reply, error); }
  });
  app.post<{ Body: ModelCompletionInput }>('/api/models/complete', async (request, reply) => {
    try { return { content: await models.complete(request.body) }; }
    catch (error) { return modelError(reply, error); }
  });
  app.addHook('onClose', closeModelConnections);
}

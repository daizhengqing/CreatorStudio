import { MODEL_PROTOCOLS, type ModelInput } from '@creator-studio/contracts';
import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';
import { probeCreatorModel } from '../agent/runtime.js';
import { closeModelConnections } from '../services/model-completion.js';
import { activateModel, addModel, deleteModel, editModel, getModelConfig, testModelConnection } from '../services/models.js';

type ModelParams = { id: string };
const params = Type.Object({ id: Type.String() });
const body = Type.Object({
  protocol: Type.Union(MODEL_PROTOCOLS.map(protocol => Type.Literal(protocol))),
  baseUrl: Type.String({ minLength: 1 }),
  model: Type.String({ minLength: 1 }),
  apiKey: Type.Optional(Type.String()),
  proxyUrl: Type.String(),
  contextWindow: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
  supportsImages: Type.Boolean(),
});

export function installModelRoutes(app: FastifyInstance): void {
  app.get('/api/models/config', async () => getModelConfig());
  app.post<{ Body: ModelInput }>('/api/models', { schema: { body } }, async (request, reply) =>
    reply.code(201).send(addModel(request.body)));
  app.put<{ Params: ModelParams; Body: ModelInput }>('/api/models/:id', { schema: { params, body } }, async request =>
    editModel(request.params.id, request.body));
  app.post<{ Params: ModelParams }>('/api/models/:id/activate', { schema: { params } }, async request =>
    activateModel(request.params.id));
  app.delete<{ Params: ModelParams }>('/api/models/:id', { schema: { params } }, async request =>
    deleteModel(request.params.id));
  app.post<{ Params: ModelParams }>('/api/models/:id/test', { schema: { params } }, async request =>
    testModelConnection(request.params.id, probeCreatorModel));
  app.addHook('onClose', closeModelConnections);
}

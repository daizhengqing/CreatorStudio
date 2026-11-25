import type { ModelConfigInput, ModelProfileId } from '@creator-studio/contracts';
import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';
import { probeCreatorModel } from '../agent/runtime.js';
import { closeModelConnections } from '../services/model-completion.js';
import { getModelConfig, saveModelConfig, testModelConnection } from '../services/models.js';

const id = Type.Union([Type.Literal('local'), Type.Literal('remote')]);
const profile = Type.Object({ baseUrl: Type.String(), model: Type.String(), apiKey: Type.Optional(Type.String()) });
const config = Type.Object({
  activeProfile: id, proxyUrl: Type.String(),
  profiles: Type.Object({ local: profile, remote: profile }),
});

export function installModelRoutes(app: FastifyInstance): void {
  app.get('/api/models/config', async () => getModelConfig());
  app.put<{ Body: ModelConfigInput }>('/api/models/config', { schema: { body: config } }, async request => saveModelConfig(request.body));
  app.post<{ Body: { profileId: ModelProfileId } }>('/api/models/test',
    { schema: { body: Type.Object({ profileId: id }) } }, async request => testModelConnection(request.body.profileId, probeCreatorModel));
  app.addHook('onClose', closeModelConnections);
}

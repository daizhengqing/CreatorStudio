import type { BrowserSDK } from '@creator-studio/plugin-sdk/browser';
import { json, request } from './http';

export const models: BrowserSDK['models'] = {
  getConfig: () => request('/api/models/config'),
  saveConfig: config => request('/api/models/config', json(config, 'PUT')),
  testConnection: profileId => request('/api/models/test', json({ profileId })),
  async complete(input) {
    const { content } = await request<{ content: string }>('/api/models/complete', json(input));
    return content;
  },
};

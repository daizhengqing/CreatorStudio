import type { BrowserSDK } from '@creator-studio/plugin-sdk/browser';
import { json, request } from './http';

export const media: BrowserSDK['media'] = {
  assets: () => request('/api/assets'),
  async upload(file) {
    const data = new FormData();
    data.append('file', file);
    return request('/api/assets/upload', { method: 'POST', body: data });
  },
  downloads: () => request('/api/downloads'),
  previewDownload: url => request('/api/downloads/preview', json({ url })),
  startDownload: input => request('/api/downloads', json(input)),
  cancelDownload: id => request(`/api/downloads/${id}/cancel`, json({})),
  deleteDownload: id => request(`/api/downloads/${id}`, { method: 'DELETE' }),
  exports: () => request('/api/exports'),
  startExport: input => request('/api/exports', json(input)),
};

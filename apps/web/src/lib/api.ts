import type { Asset, DownloadPreview, DownloadTask, ExportRequest, ExportTask } from '@creator-studio/shared';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: '请求失败' })) as { error?: string };
    throw new Error(payload.error ?? `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}
const json = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export const api = {
  assets: () => request<Asset[]>('/api/assets'),
  async upload(file: File) {
    const data = new FormData(); data.append('file', file);
    return request<{ id: string }>('/api/assets/upload', { method: 'POST', body: data });
  },
  downloads: () => request<DownloadTask[]>('/api/downloads'),
  previewDownload: (url: string) => request<DownloadPreview>('/api/downloads/preview', json({ url })),
  startDownload: (input: { previewId: string; resolution: number | null }) => request<DownloadTask>('/api/downloads', json(input)),
  cancelDownload: (id: string) => request<DownloadTask>(`/api/downloads/${id}/cancel`, json({})),
  deleteDownload: (id: string) => request<{ deleted: boolean }>(`/api/downloads/${id}`, { method: 'DELETE' }),
  exports: () => request<ExportTask[]>('/api/exports'),
  startExport: (body: ExportRequest) => request<ExportTask>('/api/exports', json(body)),
};

export function friendlySize(bytes: number): string {
  return bytes > 1_073_741_824 ? `${(bytes / 1_073_741_824).toFixed(2)} GB` : `${(bytes / 1_048_576).toFixed(1)} MB`;
}
export function friendlyTime(seconds: number | null): string {
  if (seconds === null) return '—';
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

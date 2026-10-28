export const ASSET_TYPES = ['video', 'audio', 'image'] as const;
export type AssetType = (typeof ASSET_TYPES)[number];
export type AssetSource = 'local' | 'youtube' | 'bilibili' | 'douyin';

export type Asset = {
  id: string;
  name: string;
  type: AssetType;
  source: AssetSource;
  sourceUrl: string | null;
  mime: string;
  size: number;
  duration: number | null;
  width: number | null;
  height: number | null;
  hasAudio: boolean;
  createdAt: number;
  streamUrl: string;
  thumbnailUrl: string | null;
};

export type TaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type DownloadPreview = {
  id: string;
  url: string;
  title: string;
  platform: AssetSource;
  thumbnailUrl: string | null;
  duration: number | null;
  resolutions: number[];
};
export type DownloadTask = {
  id: string;
  url: string;
  title: string;
  platform: AssetSource;
  thumbnailUrl: string | null;
  resolution: number | null;
  status: TaskStatus;
  progress: number;
  error: string | null;
  assetId: string | null;
  createdAt: number;
};

export type ExportTask = {
  id: string;
  assetId: string;
  status: TaskStatus;
  progress: number;
  outputFile: string | null;
  error: string | null;
  createdAt: number;
};

export type ExportRequest = {
  assetId: string;
  start: number;
  end: number;
  aspect: 'original' | '16:9' | '9:16' | '1:1';
  mute: boolean;
  bgmAssetId?: string;
  bgmVolume?: number;
};

export type MediaApi = {
  assets(): Promise<Asset[]>;
  downloads(): Promise<DownloadTask[]>;
  previewDownload(url: string): Promise<DownloadPreview>;
  startDownload(input: { previewId: string; resolution: number | null }): Promise<DownloadTask>;
  cancelDownload(id: string): Promise<DownloadTask>;
  deleteDownload(id: string): Promise<{ deleted: boolean }>;
  exports(): Promise<ExportTask[]>;
  startExport(input: ExportRequest): Promise<ExportTask>;
};

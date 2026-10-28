export type Category = 'social' | 'international' | 'ai' | 'finance' | 'crypto';
export const categoryNames: Record<Category, string> = { social: '社会', international: '国际', ai: 'AI／科技', finance: '宏观金融', crypto: 'Web3／加密' };
export type ProfileId = 'local' | 'remote';
export type SourceKind = 'feed' | 'hot' | 'community' | 'flash';
export type TimeKind = 'published' | 'community' | 'discovered';
export type AiState = 'pending' | 'processing' | 'completed' | 'failed' | 'skipped' | 'not_needed' | 'unconfigured';

export type SourceDefinition = { id: string; name: string; category: Category; kind: SourceKind; url?: string; requiresCredentials?: boolean };
export type CollectedItem = { externalId: string; title: string; url: string; content: string; publishedAt: number | null; updatedAt: number | null; timeKind: TimeKind; rank: number | null; heat: string | null };
export type CollectedBatch = { items: CollectedItem[]; notModified?: boolean };
export type SourceStatus = SourceDefinition & { enabled: boolean; state: 'idle' | 'refreshing' | 'ok' | 'error' | 'needs_auth'; lastCheckedAt: number | null; lastSuccessAt: number | null; latestContentAt: number | null; error: string | null; hasCredentials: boolean };
export type ItemSource = { id: string; name: string; rank: number | null; previousRank: number | null; heat: string | null };
export type TrendItem = {
  id: string; title: string; titleZh: string | null; summaryZh: string | null; content: string; url: string; category: Category;
  publishedAt: number | null; updatedAt: number | null; firstSeenAt: number; timeKind: TimeKind; sources: ItemSource[];
  aiState: AiState; aiError: string | null; aiModel: string | null; aiGeneratedAt: number | null; saved: boolean; note: string;
};
export type ItemQuery = { search?: string; category?: Category; sourceId?: string; savedOnly?: boolean; offset?: number; limit?: number };
export type ItemPage = { items: TrendItem[]; total: number; offset: number; limit: number };
export type RankingGroup = { source: SourceStatus; items: TrendItem[] };
export type ModelProfile = { baseUrl: string; model: string; hasKey: boolean; verified: boolean };
export type TrendsConfig = { activeProfile: ProfileId; autoGenerate: boolean; proxyUrl: string; profiles: Record<ProfileId, ModelProfile> };
export type ConfigInput = { activeProfile: ProfileId; autoGenerate: boolean; proxyUrl: string; profiles: Record<ProfileId, { baseUrl: string; model: string; apiKey?: string }> };
export type TrendsStatus = { sources: SourceStatus[]; queue: { pending: number; processing: number; failed: number }; modelReady: boolean; autoGenerate: boolean };

export type TrendsApi = {
  list: { input: ItemQuery; output: ItemPage };
  rankings: { input: { search?: string; category?: Category; sourceId?: string }; output: RankingGroup[] };
  getStatus: { input: null; output: TrendsStatus };
  refresh: { input: { sourceId?: string }; output: null };
  setSourceEnabled: { input: { sourceId: string; enabled: boolean }; output: null };
  saveSourceCredentials: { input: { sourceId: string; cookie: string }; output: null };
  saveTopic: { input: { itemId: string; note: string }; output: null };
  removeTopic: { input: { itemId: string }; output: null };
  getConfig: { input: null; output: TrendsConfig };
  saveConfig: { input: ConfigInput; output: TrendsConfig };
  testModel: { input: { profileId: ProfileId }; output: { ok: boolean; message: string } };
  retryAi: { input: { itemId: string }; output: null };
};

// 以下类型只供插件后台协作，不能直接通过读取配置接口返回。
export type RuntimeProfile = { baseUrl: string; model: string; apiKey: string; verified: boolean };
export type RuntimeConfig = { activeProfile: ProfileId; autoGenerate: boolean; proxyUrl: string; profiles: Record<ProfileId, RuntimeProfile> };
export type AiJob = { itemId: string; inputHash: string; title: string; content: string; publishedAt: number | null; firstSeenAt: number; attempt: number; manual: boolean };
export type AiResult = { titleZh: string; summaryZh: string | null; profileId: ProfileId; model: string; generatedAt: number; cacheKey: string };
export type AiRepository = {
  getRuntimeConfig(): RuntimeConfig;
  takeAiJob(): AiJob | undefined;
  finishAiJob(job: AiJob, result: AiResult): void;
  failAiJob(job: AiJob, error: string, retryAt: number | null): void;
  skipExpiredAiJobs(): void;
  getCachedAiResult(key: string): AiResult | undefined;
};

export type Category = 'social' | 'international' | 'ai' | 'finance' | 'crypto';
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
export type TrendsConfig = { autoGenerate: boolean; proxyUrl: string };
export type TrendsStatus = { sources: SourceStatus[]; queue: { pending: number; processing: number; failed: number }; modelReady: boolean; autoGenerate: boolean };

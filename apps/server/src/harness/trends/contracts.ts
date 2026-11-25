import type { ModelProfileId } from '@creator-studio/contracts';
export type * from '@creator-studio/contracts';

export type AiJob = { itemId: string; inputHash: string; title: string; content: string; publishedAt: number | null; firstSeenAt: number; attempt: number; manual: boolean };
export type AiResult = { titleZh: string; summaryZh: string | null; profileId: ModelProfileId; model: string; generatedAt: number; cacheKey: string };
export type AiRepository = {
  takeAiJob(): AiJob | undefined;
  finishAiJob(job: AiJob, result: AiResult): void;
  failAiJob(job: AiJob, error: string, retryAt: number | null): void;
  skipExpiredAiJobs(): void;
  getCachedAiResult(key: string): AiResult | undefined;
};

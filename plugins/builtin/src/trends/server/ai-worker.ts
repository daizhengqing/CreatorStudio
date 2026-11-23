import { createHash } from 'node:crypto';
import type { ModelService } from '@creator-studio/plugin-sdk';
import type { AiJob, AiRepository } from '../contracts';
import { aiPromptVersion, generateChineseText } from './ai-client';

type ActiveModel = ReturnType<ModelService['active']>;
const cacheKeyFor = (job: AiJob, model: ActiveModel): string => {
  return createHash('sha256').update(JSON.stringify([
    job.inputHash, model.id, model.baseUrl, model.model, aiPromptVersion, 'zh',
  ])).digest('hex');
};

export const createAiWorker = (repo: AiRepository, models: ModelService, notify: () => void): { wake(): void; dispose(): void } => {
  const active = new Set<AbortController>();
  let disposed = false;
  let pumping = false;

  const runJob = async (job: AiJob, model: ActiveModel, controller: AbortController): Promise<void> => {
    const cacheKey = cacheKeyFor(job, model);
    const cached = repo.getCachedAiResult(cacheKey);
    if (cached) {
      repo.finishAiJob(job, cached);
      return;
    }
    try {
      const text = await generateChineseText(job, model.complete, controller.signal);
      if (disposed) return;
      repo.finishAiJob(job, { ...text, profileId: model.id, model: model.model, generatedAt: Date.now(), cacheKey });
    } catch (error) {
      if (disposed) return;
      const retryAt = job.attempt === 0 && error instanceof Error && 'retryAfterMs' in error && typeof error.retryAfterMs === 'number'
        ? Date.now() + error.retryAfterMs : null;
      repo.failAiJob(job, error instanceof Error ? error.message : '模型请求失败', retryAt);
    }
  };

  const pump = (): void => {
    if (disposed || pumping) return;
    pumping = true;
    try {
      repo.skipExpiredAiJobs();
      while (!disposed) {
        // 每次领取任务时读取配置，已开始的请求继续使用自己的配置快照。
        const model = models.active();
        const concurrency = model.id === 'local' ? 1 : 2;
        if (!model.verified || active.size >= concurrency) break;
        const job = repo.takeAiJob();
        if (!job) break;
        const controller = new AbortController();
        active.add(controller);
        notify();
        void runJob(job, model, controller).finally(() => {
          active.delete(controller);
          if (disposed) return;
          notify();
          pump();
        });
      }
    } finally {
      pumping = false;
    }
  };

  // 同一调度器负责普通任务和延迟重试，避免每条任务创建独立定时器。
  const timer = setInterval(pump, 1_000);
  timer.unref();
  return {
    wake: pump,
    dispose: () => {
      disposed = true;
      clearInterval(timer);
      for (const controller of active) controller.abort();
      active.clear();
    },
  };
};

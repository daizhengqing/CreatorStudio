import { createHash } from 'node:crypto';
import type { AiJob, AiRepository, ProfileId, RuntimeConfig } from '../contracts';
import { aiPromptVersion, describeAiFailure, generateChineseText } from './ai-client';

const cacheKeyFor = (job: AiJob, profileId: ProfileId, config: RuntimeConfig): string => {
  const profile = config.profiles[profileId];
  return createHash('sha256').update(JSON.stringify([
    job.inputHash, profileId, profile.baseUrl, profile.model, aiPromptVersion, 'zh',
  ])).digest('hex');
};

export const createAiWorker = (repo: AiRepository, notify: () => void): { wake(): void; dispose(): void } => {
  const active = new Set<AbortController>();
  let disposed = false;
  let pumping = false;

  const runJob = async (job: AiJob, config: RuntimeConfig, controller: AbortController): Promise<void> => {
    const profileId = config.activeProfile;
    const profile = config.profiles[profileId];
    const cacheKey = cacheKeyFor(job, profileId, config);
    const cached = repo.getCachedAiResult(cacheKey);
    if (cached) {
      repo.finishAiJob(job, cached);
      return;
    }
    try {
      const text = await generateChineseText(job, profile, config.proxyUrl, profileId === 'local', controller.signal);
      if (disposed) return;
      repo.finishAiJob(job, { ...text, profileId, model: profile.model, generatedAt: Date.now(), cacheKey });
    } catch (error) {
      if (disposed) return;
      const failure = describeAiFailure(error);
      const retryAt = job.attempt === 0 && failure.retryable ? Date.now() + failure.retryAfterMs : null;
      repo.failAiJob(job, failure.message, retryAt);
    }
  };

  const pump = (): void => {
    if (disposed || pumping) return;
    pumping = true;
    try {
      repo.skipExpiredAiJobs();
      while (!disposed) {
        // 每次领取任务时读取配置，已开始的请求继续使用自己的配置快照。
        const config = structuredClone(repo.getRuntimeConfig());
        const profile = config.profiles[config.activeProfile];
        const concurrency = config.activeProfile === 'local' ? 1 : 2;
        if (!profile.verified || !profile.baseUrl || !profile.model || active.size >= concurrency) break;
        const job = repo.takeAiJob();
        if (!job) break;
        const controller = new AbortController();
        active.add(controller);
        notify();
        void runJob(job, config, controller).finally(() => {
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

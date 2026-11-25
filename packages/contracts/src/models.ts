export const MODEL_PROFILE_IDS = ['local', 'remote'] as const;

export type ModelProfileId = (typeof MODEL_PROFILE_IDS)[number];
export type ModelProfileInput = { baseUrl: string; model: string; apiKey?: string };
export type ModelProfile = { baseUrl: string; model: string; hasKey: boolean; agentVerified: boolean; summaryVerified: boolean };
export type ModelConfigInput = { activeProfile: ModelProfileId; proxyUrl: string; profiles: Record<ModelProfileId, ModelProfileInput> };
export type ModelConfig = { activeProfile: ModelProfileId; proxyUrl: string; profiles: Record<ModelProfileId, ModelProfile> };
export type ModelCheck = { ok: boolean; message: string };
export type ModelTestResult = { agent: ModelCheck; summary: ModelCheck };

export type ModelCompletionInput = {
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  json?: boolean;
};

export type ModelService = {
  /** 领取后台任务时固定当前模型，任务执行期间切换模型也不会改变这次调用。 */
  active(): {
    id: ModelProfileId;
    baseUrl: string;
    model: string;
    verified: boolean;
    complete(input: ModelCompletionInput, signal?: AbortSignal): Promise<string>;
  };
};

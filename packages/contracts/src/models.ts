export const MODEL_PROTOCOLS = ['openai-completions', 'anthropic-messages'] as const;

export type ModelProtocol = (typeof MODEL_PROTOCOLS)[number];

export type ModelInput = {
  protocol: ModelProtocol;
  baseUrl: string;
  model: string;
  apiKey?: string;
  proxyUrl: string;
  contextWindow: number | null;
  supportsImages: boolean;
};

export type ConfiguredModel = Omit<ModelInput, 'apiKey'> & {
  id: string;
  hasKey: boolean;
  agentVerified: boolean;
  summaryVerified: boolean;
};

export type ModelConfig = { activeModelId: string | null; models: ConfiguredModel[] };
export type ModelCheck = { ok: boolean; message: string };
export type ModelTestResult = { agent: ModelCheck; summary: ModelCheck };
export type ModelTestResponse = ModelTestResult & { config: ModelConfig };

export type ModelCompletionInput = {
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  json?: boolean;
};

export type ModelService = {
  /** 领取后台任务时固定当前模型，任务执行期间切换模型也不会改变这次调用。 */
  active(): {
    id: string;
    protocol: ModelProtocol;
    baseUrl: string;
    model: string;
    verified: boolean;
    complete(input: ModelCompletionInput, signal?: AbortSignal): Promise<string>;
  } | null;
};

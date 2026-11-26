import type { ConfiguredModel } from '@creator-studio/contracts';

export type StoredModel = Omit<ConfiguredModel, 'hasKey'> & { apiKey: string };
export type StoredConfig = { activeModelId: string | null; models: StoredModel[] };

type LegacyId = 'local' | 'remote';
type LegacyModel = Pick<StoredModel, 'baseUrl' | 'model' | 'apiKey' | 'agentVerified' | 'summaryVerified'>;
type LegacyConfig = { activeProfile: LegacyId; proxyUrl: string; profiles: Record<LegacyId, LegacyModel> };

/** 启动时将旧档位改写为列表，运行时只读取新结构。 */
export function migrateModelConfig(json: string): StoredConfig | undefined {
  const old = JSON.parse(json) as StoredConfig | LegacyConfig;
  if ('models' in old) return;

  const models: StoredModel[] = [];
  for (const id of ['local', 'remote'] as const) {
    const model = old.profiles[id];
    const defaultUrl = id === 'local' ? 'http://127.0.0.1:11434/v1' : '';
    const proxyUrl = id === 'remote' ? old.proxyUrl : '';
    if (model.baseUrl === defaultUrl && !model.model && !model.apiKey && !proxyUrl && !model.agentVerified && !model.summaryVerified) {
      continue;
    }
    models.push({ ...model, id, proxyUrl, protocol: 'openai-completions', contextWindow: null, supportsImages: false });
  }
  const active = models.find(model => model.id === old.activeProfile && model.baseUrl && model.model);
  return { activeModelId: active?.id ?? null, models };
}

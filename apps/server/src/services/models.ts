import { randomUUID } from 'node:crypto';
import type {
  ConfiguredModel, ModelCheck, ModelCompletionInput, ModelConfig, ModelInput, ModelService, ModelTestResponse, ModelTestResult,
} from '@creator-studio/contracts';
import { sqlite } from '../db/index.js';
import { requestModel, type ModelConnection } from './model-completion.js';
import { migrateModelConfig, type StoredConfig, type StoredModel } from './model-config-migration.js';

const read = sqlite.prepare<[], { config: string }>('SELECT config FROM model_settings WHERE id=1');
const upsert = sqlite.prepare<[string]>('INSERT INTO model_settings(id,config) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET config=excluded.config');
const write = (config: StoredConfig) => upsert.run(JSON.stringify(config));
const readConfig = () => JSON.parse(read.get()!.config) as StoredConfig;

const initialize = sqlite.transaction(() => {
  const row = read.get();
  if (!row) {
    write({ activeModelId: null, models: [] });
    return;
  }
  const migrated = migrateModelConfig(row.config);
  if (migrated) write(migrated);
});

export function initializeModels(): void {
  initialize.immediate();
}

function publicConfig(config: StoredConfig): ModelConfig {
  return {
    activeModelId: config.activeModelId,
    models: config.models.map(({ apiKey, ...model }): ConfiguredModel => ({ ...model, hasKey: Boolean(apiKey) })),
  };
}

export function getModelConfig(): ModelConfig {
  return publicConfig(readConfig());
}

function statusError(message: string, statusCode: number) {
  return Object.assign(new Error(message), { statusCode });
}

function httpUrl(value: string, label: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  const url = URL.canParse(trimmed) ? new URL(trimmed) : null;
  if (!url || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw statusError(`${label}应为不含凭据和查询参数的 HTTP(S) 地址`, 400);
  }
  return trimmed;
}

function getModel(config: StoredConfig, id: string): StoredModel {
  const model = config.models.find(item => item.id === id);
  if (!model) throw statusError('模型不存在', 404);
  return model;
}

function sameConnection(first: StoredModel, second: StoredModel): boolean {
  return first.baseUrl === second.baseUrl && first.model === second.model
    && first.apiKey === second.apiKey && first.proxyUrl === second.proxyUrl
    && first.protocol === second.protocol && first.supportsImages === second.supportsImages
    && first.contextWindow === second.contextWindow;
}

function requireModelDetails(model: StoredModel) {
  if (!model.baseUrl || !model.model) throw statusError('请填写 API 地址和模型 ID', 400);
}

function storedModel(input: ModelInput, id: string, previous?: StoredModel): StoredModel {
  const next: StoredModel = {
    id, protocol: input.protocol, baseUrl: httpUrl(input.baseUrl, '模型地址'), model: input.model.trim(),
    apiKey: input.apiKey?.trim() ?? previous?.apiKey ?? '', proxyUrl: httpUrl(input.proxyUrl, '模型代理'),
    contextWindow: input.contextWindow, supportsImages: input.supportsImages,
    agentVerified: false, summaryVerified: false,
  };
  requireModelDetails(next);
  if (previous && sameConnection(previous, next)) {
    next.agentVerified = previous.agentVerified;
    next.summaryVerified = previous.summaryVerified;
  }
  return next;
}

const updateConfig = sqlite.transaction((update: (config: StoredConfig) => void): ModelConfig => {
  const config = readConfig();
  update(config);
  write(config);
  return publicConfig(config);
});

export function addModel(input: ModelInput): ModelConfig {
  return updateConfig.immediate(config => {
    const model = storedModel(input, randomUUID());
    config.models.push(model);
    config.activeModelId ??= model.id;
  });
}

export function editModel(id: string, input: ModelInput): ModelConfig {
  return updateConfig.immediate(config => {
    const model = getModel(config, id);
    config.models[config.models.indexOf(model)] = storedModel(input, id, model);
  });
}

export function activateModel(id: string): ModelConfig {
  return updateConfig.immediate(config => {
    requireModelDetails(getModel(config, id));
    config.activeModelId = id;
  });
}

export function deleteModel(id: string): ModelConfig {
  return updateConfig.immediate(config => {
    const model = getModel(config, id);
    config.models.splice(config.models.indexOf(model), 1);
    if (config.activeModelId === id) {
      config.activeModelId = config.models.find(item => item.baseUrl && item.model)?.id ?? null;
    }
  });
}

function connection(model: StoredModel, timeoutMs = 180_000): ModelConnection {
  const { protocol, baseUrl, model: name, apiKey, proxyUrl, contextWindow, supportsImages } = model;
  return { protocol, baseUrl, model: name, apiKey, proxyUrl, contextWindow, supportsImages, timeoutMs };
}

function activeModel(config: StoredConfig): StoredModel | null {
  return config.activeModelId === null ? null : getModel(config, config.activeModelId);
}

export function getActiveModelConnection(): ModelConnection | null {
  const model = activeModel(readConfig());
  return model ? connection(model) : null;
}

// 测试期间允许编辑和删除模型，结果只写回同一份连接配置。
const finishTest = sqlite.transaction((tested: StoredModel, result: ModelTestResult): ModelTestResponse => {
  const config = readConfig();
  const current = config.models.find(model => model.id === tested.id);
  if (!current || !sameConnection(tested, current)) {
    const changed = { ok: false, message: '模型配置已变化，请重新测试连接' };
    return { agent: changed, summary: changed, config: publicConfig(config) };
  }
  current.agentVerified = result.agent.ok;
  current.summaryVerified = result.summary.ok;
  write(config);
  return { ...result, config: publicConfig(config) };
});

export async function testModelConnection(id: string, probe: (value: ModelConnection) => Promise<void>): Promise<ModelTestResponse> {
  const model = getModel(readConfig(), id);
  requireModelDetails(model);
  const value = connection(model, 35_000);
  async function check(run: () => Promise<void>, message: string): Promise<ModelCheck> {
    try {
      await run();
      return { ok: true, message };
    } catch (error) {
      const reason = error instanceof SyntaxError ? '模型未返回有效的 JSON' : error instanceof Error ? error.message : '连接测试失败';
      return { ok: false, message: value.apiKey ? reason.replaceAll(value.apiKey, '[密钥已隐藏]') : reason };
    }
  }
  const agent = await check(() => probe(value), '流式工具调用通过');
  const summary = await check(async () => {
    const content = await requestModel(value, { json: true, messages: [{ role: 'user', content: '请只返回 JSON 对象 {"ok":true}。' }] });
    if ((JSON.parse(content) as { ok?: unknown } | null)?.ok !== true) throw new Error('模型未返回预期 JSON');
  }, 'JSON 摘要接口通过');
  return finishTest.immediate(model, { agent, summary });
}

export const models: ModelService = {
  active() {
    const active = activeModel(readConfig());
    if (!active) return null;
    const { id, protocol, baseUrl, model, summaryVerified: verified } = active;
    return { id, protocol, baseUrl, model, verified, async complete(input: ModelCompletionInput, signal?: AbortSignal) {
      if (!verified) throw new Error('请先在设置中验证热点摘要模型');
      return requestModel(connection(active), input, signal);
    } };
  },
};

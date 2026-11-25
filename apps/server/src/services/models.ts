import {
  MODEL_PROFILE_IDS, type ModelCheck, type ModelCompletionInput, type ModelConfig, type ModelConfigInput,
  type ModelProfile, type ModelProfileId, type ModelService, type ModelTestResult,
} from '@creator-studio/contracts';
import { sqlite } from '../db/index.js';
import { requestModel, type ModelConnection } from './model-completion.js';

type StoredProfile = Omit<ModelProfile, 'hasKey'> & { apiKey: string };
type StoredConfig = Omit<ModelConfig, 'profiles'> & { profiles: Record<ModelProfileId, StoredProfile> };

const read = sqlite.prepare<[], { config: string }>('SELECT config FROM model_settings WHERE id=1');
const upsert = sqlite.prepare<[string]>('INSERT INTO model_settings(id,config) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET config=excluded.config');
const write = (config: StoredConfig) => upsert.run(JSON.stringify(config));
const readConfig = () => JSON.parse(read.get()!.config) as StoredConfig;
const emptyProfile = { model: '', apiKey: '', agentVerified: false, summaryVerified: false };

export function initializeModels() {
  const defaults: StoredConfig = {
    activeProfile: 'local', proxyUrl: '',
    profiles: { local: { ...emptyProfile, baseUrl: 'http://127.0.0.1:11434/v1' }, remote: { ...emptyProfile, baseUrl: '' } },
  };
  sqlite.prepare('INSERT OR IGNORE INTO model_settings(id,config) VALUES (1,?)').run(JSON.stringify(defaults));
}

function publicProfile({ apiKey, ...profile }: StoredProfile): ModelProfile {
  return { ...profile, hasKey: Boolean(apiKey) };
}

export function getModelConfig(): ModelConfig {
  const { profiles, ...config } = readConfig();
  return { ...config, profiles: { local: publicProfile(profiles.local), remote: publicProfile(profiles.remote) } };
}

function httpUrl(value: string, label: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  const url = URL.canParse(trimmed) ? new URL(trimmed) : null;
  if (!url || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw Object.assign(new Error(`${label}应为不含凭据和查询参数的 HTTP(S) 地址`), { statusCode: 400 });
  }
  return trimmed;
}

function sameConnection(first: StoredConfig, second: StoredConfig, id: ModelProfileId): boolean {
  const a = first.profiles[id];
  const b = second.profiles[id];
  return a.baseUrl === b.baseUrl && a.model === b.model && a.apiKey === b.apiKey && (id === 'local' || first.proxyUrl === second.proxyUrl);
}

export function saveModelConfig(input: ModelConfigInput): ModelConfig {
  const previous = readConfig();
  const config: StoredConfig = { activeProfile: input.activeProfile, proxyUrl: httpUrl(input.proxyUrl, '模型代理'), profiles: { ...previous.profiles } };
  for (const id of MODEL_PROFILE_IDS) {
    const { baseUrl, model, apiKey } = input.profiles[id];
    config.profiles[id] = {
      baseUrl: httpUrl(baseUrl, '模型地址'), model: model.trim(), apiKey: apiKey?.trim() ?? previous.profiles[id].apiKey,
      agentVerified: false, summaryVerified: false,
    };
    if (sameConnection(previous, config, id)) {
      config.profiles[id].agentVerified = previous.profiles[id].agentVerified;
      config.profiles[id].summaryVerified = previous.profiles[id].summaryVerified;
    }
  }
  write(config);
  return getModelConfig();
}

function connection(config: StoredConfig, id: ModelProfileId): ModelConnection {
  const { baseUrl, model, apiKey } = config.profiles[id];
  return { baseUrl, model, apiKey, proxyUrl: id === 'local' ? '' : config.proxyUrl, timeoutMs: id === 'local' ? 180_000 : 60_000 };
}

export function getActiveModelConnection(): ModelConnection {
  const config = readConfig();
  return connection(config, config.activeProfile);
}

export async function testModelConnection(id: ModelProfileId, probe: (value: ModelConnection) => Promise<void>): Promise<ModelTestResult> {
  const snapshot = readConfig();
  const value = { ...connection(snapshot, id), timeoutMs: 35_000 };
  async function check(run: () => Promise<void>, message: string): Promise<ModelCheck> {
    try { await run(); return { ok: true, message }; }
    catch (error) {
      const reason = error instanceof SyntaxError ? '模型未返回有效的 JSON' : error instanceof Error ? error.message : '连接测试失败';
      return { ok: false, message: value.apiKey ? reason.replaceAll(value.apiKey, '[密钥已隐藏]') : reason };
    }
  }
  const agent = await check(() => probe(value), '流式工具调用通过');
  const summary = await check(async () => {
    const content = await requestModel(value, { json: true, messages: [{ role: 'user', content: '请只返回 JSON 对象 {"ok":true}。' }] });
    if ((JSON.parse(content) as { ok?: unknown } | null)?.ok !== true) throw new Error('模型未返回预期 JSON');
  }, 'JSON 摘要接口通过');
  const current = readConfig();
  if (!sameConnection(snapshot, current, id)) {
    const changed = { ok: false, message: '模型配置已变化，请重新测试连接' };
    return { agent: changed, summary: changed };
  }
  current.profiles[id].agentVerified = agent.ok;
  current.profiles[id].summaryVerified = summary.ok;
  write(current);
  return { agent, summary };
}

export const models: ModelService = {
  active() {
    const config = readConfig();
    const id = config.activeProfile;
    const { baseUrl, model, summaryVerified: verified } = config.profiles[id];
    return { id, baseUrl, model, verified, async complete(input: ModelCompletionInput, signal?: AbortSignal) {
      if (!verified) throw new Error('请先在设置中验证热点摘要模型');
      return requestModel(connection(config, id), input, signal);
    } };
  },
};

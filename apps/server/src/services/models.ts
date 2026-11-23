import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  MODEL_CONFIG_CHANGED, MODEL_PROFILE_IDS, type ModelCompletionInput, type ModelConfig, type ModelConfigInput,
  type ModelProfile, type ModelProfileId, type ModelService, type ModelTestResult,
} from '@creator-studio/plugin-sdk';
import { DIRS } from '../config.js';
import { sqlite } from '../db/index.js';
import { events } from './events.js';
import { requestModel } from './model-completion.js';

type StoredProfile = Omit<ModelProfile, 'hasKey'> & { apiKey: string };
type StoredConfig = Omit<ModelConfig, 'profiles'> & { profiles: Record<ModelProfileId, StoredProfile> };

const read = sqlite.prepare<[], { config: string }>('SELECT config FROM model_settings WHERE id=1');
const upsert = sqlite.prepare<[string]>('INSERT INTO model_settings(id,config) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET config=excluded.config');
const write = (config: StoredConfig) => upsert.run(JSON.stringify(config));
const readConfig = () => JSON.parse(read.get()!.config) as StoredConfig;
const defaults: StoredConfig = {
  activeProfile: 'local', proxyUrl: '',
  profiles: {
    local: { baseUrl: 'http://127.0.0.1:11434/v1', model: '', apiKey: '', verified: false },
    remote: { baseUrl: '', model: '', apiKey: '', verified: false },
  },
};

export function initializeModels(): void {
  if (read.get()) return;
  const path = join(DIRS.pluginData, 'studio.trends', 'trends.db');
  const hasTrends = existsSync(path);
  if (hasTrends) sqlite.prepare('ATTACH DATABASE ? AS trends_migration').run(path);
  try {
    sqlite.transaction(() => {
      if (read.get()) return;
      const row = hasTrends ? sqlite.prepare<[], { value: string }>("SELECT value FROM trends_migration.settings WHERE key='config'").get() : undefined;
      if (!row) { write(defaults); return; }
      // 一次性迁移模型凭据，采集代理与自动翻译设置仍由热点追踪保存。
      const { autoGenerate, ...config } = JSON.parse(row.value) as StoredConfig & { autoGenerate: boolean };
      write(config);
      sqlite.prepare("UPDATE trends_migration.settings SET value=? WHERE key='config'").run(JSON.stringify({ autoGenerate, proxyUrl: config.proxyUrl }));
    }).immediate();
  } finally {
    if (hasTrends) sqlite.exec('DETACH DATABASE trends_migration');
  }
}

function publicProfile({ baseUrl, model, apiKey, verified }: StoredProfile): ModelProfile {
  return { baseUrl, model, verified, hasKey: Boolean(apiKey) };
}

export function getModelConfig(): ModelConfig {
  const { profiles, ...config } = readConfig();
  return { ...config, profiles: { local: publicProfile(profiles.local), remote: publicProfile(profiles.remote) } };
}

function httpUrl(value: string, label: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  const url = URL.canParse(trimmed) ? new URL(trimmed) : null;
  if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password || url.search || url.hash) {
    throw new Error(`${label}应为不含凭据和查询参数的 HTTP(S) 地址`);
  }
  return trimmed;
}

function sameConnection(first: StoredConfig, second: StoredConfig, id: ModelProfileId): boolean {
  const a = first.profiles[id];
  const b = second.profiles[id];
  return a.baseUrl === b.baseUrl && a.model === b.model && a.apiKey === b.apiKey && (id === 'local' || first.proxyUrl === second.proxyUrl);
}

export function saveModelConfig(input: ModelConfigInput): ModelConfig {
  if (!MODEL_PROFILE_IDS.includes(input.activeProfile)) throw new Error('请选择本地模型或远程 API');
  sqlite.transaction(() => {
    const previous = readConfig();
    const config: StoredConfig = { activeProfile: input.activeProfile, proxyUrl: httpUrl(input.proxyUrl, '模型代理'), profiles: { ...previous.profiles } };
    for (const id of MODEL_PROFILE_IDS) {
      const { baseUrl, model, apiKey } = input.profiles[id];
      config.profiles[id] = {
        baseUrl: httpUrl(baseUrl, '模型地址'), model: model.trim(), apiKey: apiKey?.trim() ?? previous.profiles[id].apiKey, verified: false,
      };
      config.profiles[id].verified = previous.profiles[id].verified && sameConnection(previous, config, id);
    }
    write(config);
  }).immediate();
  void events.emit(MODEL_CONFIG_CHANGED, null);
  return getModelConfig();
}

function complete(config: StoredConfig, id: ModelProfileId, input: ModelCompletionInput, signal?: AbortSignal) {
  return requestModel({ ...config.profiles[id], proxyUrl: id === 'local' ? '' : config.proxyUrl, timeoutMs: id === 'local' ? 180_000 : 60_000 }, input, signal);
}

export async function testModelConnection(id: ModelProfileId): Promise<ModelTestResult> {
  if (!MODEL_PROFILE_IDS.includes(id)) throw new Error('模型配置不存在');
  const snapshot = readConfig();
  let result: ModelTestResult;
  try {
    const content = await complete(snapshot, id, { json: true, messages: [{ role: 'user', content: '请只返回 JSON 对象 {"ok":true}。' }] }, AbortSignal.timeout(60_000));
    if ((JSON.parse(content) as { ok?: unknown } | null)?.ok !== true) throw new Error('模型未返回预期 JSON');
    result = { ok: true, message: '连接成功，JSON 输出已验证' };
  } catch (error) {
    const message = error instanceof SyntaxError ? '模型未返回有效的 JSON' : error instanceof Error ? error.message : '连接测试失败';
    result = { ok: false, message };
  }
  const saved = sqlite.transaction(() => {
    const current = readConfig();
    if (!sameConnection(snapshot, current, id)) return false;
    current.profiles[id].verified = result.ok;
    write(current);
    return true;
  }).immediate();
  if (!saved) return { ok: false, message: '模型配置已变化，请重新测试连接' };
  void events.emit(MODEL_CONFIG_CHANGED, null);
  return result;
}

export const models: ModelService = {
  active() {
    const config = readConfig();
    const id = config.activeProfile;
    const { baseUrl, model, verified } = config.profiles[id];
    return { id, baseUrl, model, verified, async complete(input, signal) {
      if (!verified) throw new Error('请在「大模型配置」中保存并测试当前模型');
      return complete(config, id, input, signal);
    } };
  },
  complete(input, signal) { return models.active().complete(input, signal); },
};

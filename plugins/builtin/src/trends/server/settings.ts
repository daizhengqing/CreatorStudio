import type { ConfigInput, RuntimeConfig, SourceDefinition, SourceStatus, TrendsConfig } from '../contracts';
import { readRow, readRows, type TrendsDatabase } from './database';

type SourceRow = { id: string; enabled: number; cookie: string; state: SourceStatus['state']; error: string | null; checked_at: number | null; success_at: number | null; latest_at: number | null; initialized: number };
const defaults = (): RuntimeConfig => ({
  activeProfile: 'local', autoGenerate: true, proxyUrl: '',
  profiles: { local: { baseUrl: 'http://127.0.0.1:11434/v1', model: '', apiKey: '', verified: false }, remote: { baseUrl: '', model: '', apiKey: '', verified: false } },
});

function httpUrl(value: string, label: string, optional = false): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed && optional) return '';
  const url = new URL(trimmed);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error(`${label}应为不含凭据和查询参数的 HTTP(S) 地址`);
  return trimmed;
}

export function createSettings(db: TrendsDatabase, definitions: SourceDefinition[]) {
  function getRuntimeConfig(): RuntimeConfig {
    const row = readRow<{ value: string }>(db, 'SELECT value FROM settings WHERE key=?', 'config');
    return row ? JSON.parse(row.value) as RuntimeConfig : defaults();
  }
  function write(config: RuntimeConfig) { db.prepare('INSERT OR REPLACE INTO settings(key,value) VALUES (?,?)').run('config', JSON.stringify(config)); }
  function getConfig(): TrendsConfig {
    const config = getRuntimeConfig();
    return { activeProfile: config.activeProfile, autoGenerate: config.autoGenerate, proxyUrl: config.proxyUrl, profiles: {
      local: { baseUrl: config.profiles.local.baseUrl, model: config.profiles.local.model, verified: config.profiles.local.verified, hasKey: Boolean(config.profiles.local.apiKey) },
      remote: { baseUrl: config.profiles.remote.baseUrl, model: config.profiles.remote.model, verified: config.profiles.remote.verified, hasKey: Boolean(config.profiles.remote.apiKey) },
    } };
  }
  function saveConfig(input: ConfigInput): TrendsConfig {
    if (input.activeProfile !== 'local' && input.activeProfile !== 'remote') throw new Error('请选择本地或远程模型');
    const previous = getRuntimeConfig();
    const proxyUrl = httpUrl(input.proxyUrl, '网络代理', true);
    const config: RuntimeConfig = { activeProfile: input.activeProfile, autoGenerate: input.autoGenerate, proxyUrl, profiles: { ...previous.profiles } };
    for (const id of ['local', 'remote'] as const) {
      const submitted = input.profiles[id];
      const baseUrl = httpUrl(submitted.baseUrl, '模型地址', true);
      const model = submitted.model.trim();
      const apiKey = submitted.apiKey === undefined ? previous.profiles[id].apiKey : submitted.apiKey.trim();
      const unchanged = baseUrl === previous.profiles[id].baseUrl && model === previous.profiles[id].model && apiKey === previous.profiles[id].apiKey && (id === 'local' || proxyUrl === previous.proxyUrl);
      config.profiles[id] = { baseUrl, model, apiKey, verified: unchanged && previous.profiles[id].verified };
    }
    write(config);
    return getConfig();
  }
  function markVerified(id: 'local' | 'remote', expected: RuntimeConfig) {
    const current = getRuntimeConfig();
    const before = expected.profiles[id];
    const now = current.profiles[id];
    if (before.baseUrl !== now.baseUrl || before.model !== now.model || before.apiKey !== now.apiKey || (id === 'remote' && expected.proxyUrl !== current.proxyUrl)) throw new Error('配置已变化，请重新测试连接');
    current.profiles[id].verified = true;
    write(current);
  }
  function markUnverified(id: 'local' | 'remote') {
    const config = getRuntimeConfig();
    config.profiles[id].verified = false;
    write(config);
  }
  function sourceRow(id: string): SourceRow {
    const row = readRow<SourceRow>(db, 'SELECT * FROM sources WHERE id=?', id);
    if (!row) throw new Error('信息源不存在');
    return row;
  }
  function sources(): SourceStatus[] {
    const rows = new Map(readRows<SourceRow>(db, 'SELECT * FROM sources').map(row => [row.id, row]));
    return definitions.map(definition => {
      const row = rows.get(definition.id)!;
      return { ...definition, enabled: Boolean(row.enabled), state: row.state, error: row.error, lastCheckedAt: row.checked_at, lastSuccessAt: row.success_at, latestContentAt: row.latest_at, hasCredentials: Boolean(row.cookie) };
    });
  }
  function setEnabled(id: string, enabled: boolean) {
    const row = sourceRow(id);
    const requiresCredentials = definitions.find(source => source.id === id)!.requiresCredentials;
    const needsAuth = enabled && requiresCredentials && !row.cookie;
    db.prepare('UPDATE sources SET enabled=?, state=?, error=NULL WHERE id=?').run(needsAuth ? 0 : Number(enabled), needsAuth ? 'needs_auth' : 'idle', id);
  }
  function saveCredentials(id: string, cookie: string) {
    sourceRow(id);
    if (id !== 'weibo') throw new Error('该信息源无需配置登录态');
    db.prepare('UPDATE sources SET cookie=?, enabled=0, state=?, error=NULL WHERE id=?').run(cookie.trim(), cookie.trim() ? 'idle' : 'needs_auth', id);
  }
  return { getRuntimeConfig, getConfig, saveConfig, markVerified, markUnverified, sources, sourceRow, setEnabled, saveCredentials };
}

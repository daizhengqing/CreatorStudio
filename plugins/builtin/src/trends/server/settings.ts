import type { SourceDefinition, SourceStatus, TrendsConfig } from '../contracts';
import { readRow, readRows, type TrendsDatabase } from './database';

type SourceRow = { id: string; enabled: number; cookie: string; state: SourceStatus['state']; error: string | null; checked_at: number | null; success_at: number | null; latest_at: number | null; initialized: number };
function parseProxy(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  const url = URL.canParse(trimmed) ? new URL(trimmed) : null;
  if (!url || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('采集代理应为不含凭据和查询参数的 HTTP(S) 地址');
  return trimmed;
}

export function createSettings(db: TrendsDatabase, definitions: SourceDefinition[]) {
  function getConfig(): TrendsConfig {
    const row = readRow<{ value: string }>(db, 'SELECT value FROM settings WHERE key=?', 'config');
    return row ? JSON.parse(row.value) as TrendsConfig : { autoGenerate: true, proxyUrl: '' };
  }
  function saveConfig(input: TrendsConfig): TrendsConfig {
    const config = { autoGenerate: input.autoGenerate, proxyUrl: parseProxy(input.proxyUrl) };
    db.prepare('INSERT OR REPLACE INTO settings(key,value) VALUES (?,?)').run('config', JSON.stringify(config));
    return config;
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
  return { getConfig, saveConfig, sources, sourceRow, setEnabled, saveCredentials };
}

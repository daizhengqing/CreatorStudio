import { createHash } from 'node:crypto';
import type { AiState, Category, CollectedBatch, CollectedItem, ItemPage, ItemQuery, ItemSource, SourceDefinition, TimeKind, TrendItem } from '../contracts';
import { readRow, readRows, type SqlValue, type TrendsDatabase } from './database';

export const DAY = 86_400_000;
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
type ItemRow = {
  id: string; url: string; primary_source: string; title: string; content: string; category: Category;
  published_at: number | null; updated_at: number | null; first_seen_at: number; time_kind: TimeKind;
  content_hash: string; ai_state: AiState; ai_error: string | null; title_zh: string | null; summary_zh: string | null;
  ai_model: string | null; ai_generated_at: number | null; ai_manual: number; note?: string; saved?: number;
};
type OccurrenceRow = { source_id: string; rank: number | null; previous_rank: number | null; heat: string | null };

function normalizeUrl(value: string): string {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('来源包含无效原文链接');
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) if (/^utm_/i.test(key) || ['fbclid', 'gclid'].includes(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  return url.href;
}

function needsAi(title: string, content: string): boolean {
  return !/\p{Script=Han}/u.test(title) || Boolean(content.trim() && content.trim() !== title.trim());
}

export function createItems(db: TrendsDatabase, definitions: SourceDefinition[], aiAvailability: () => { ready: boolean; automatic: boolean }) {
  const names = new Map(definitions.map(source => [source.id, source.name]));
  function toItem(row: ItemRow, onlySource?: string): TrendItem {
    const ai = aiAvailability();
    const occurrences = readRows<OccurrenceRow>(db, `SELECT source_id,rank,previous_rank,heat FROM occurrences WHERE item_id=? ${onlySource ? 'AND source_id=?' : ''} ORDER BY source_id,active DESC,rank IS NULL,rank`, row.id, ...(onlySource ? [onlySource] : []));
    const seenSources = new Set<string>();
    const sources: ItemSource[] = occurrences.filter(source => { if (seenSources.has(source.source_id)) return false; seenSources.add(source.source_id); return true; })
      .map(source => ({ id: source.source_id, name: names.get(source.source_id)!, rank: source.rank, previousRank: source.previous_rank, heat: source.heat }));
    return {
      id: row.id, title: row.title, titleZh: row.title_zh, summaryZh: row.summary_zh, content: row.content, url: row.url, category: row.category,
      publishedAt: row.published_at, updatedAt: row.updated_at, firstSeenAt: row.first_seen_at, timeKind: row.time_kind, sources,
      aiState: row.ai_state === 'pending' && !ai.ready ? 'unconfigured' : row.ai_state === 'pending' && !ai.automatic && !row.ai_manual ? 'skipped' : row.ai_state,
      aiError: row.ai_error, aiModel: row.ai_model, aiGeneratedAt: row.ai_generated_at, saved: Boolean(row.saved), note: row.note ?? '',
    };
  }
  function list(query: ItemQuery): ItemPage {
    const clauses: string[] = [];
    const values: SqlValue[] = [];
    if (query.category) { clauses.push('i.category=?'); values.push(query.category); }
    if (query.sourceId) { clauses.push('EXISTS(SELECT 1 FROM occurrences o WHERE o.item_id=i.id AND o.source_id=?)'); values.push(query.sourceId); }
    if (query.savedOnly) clauses.push('t.item_id IS NOT NULL');
    if (query.search?.trim()) {
      clauses.push("(i.title LIKE ? ESCAPE '\\' OR coalesce(i.title_zh,'') LIKE ? ESCAPE '\\' OR coalesce(i.summary_zh,'') LIKE ? ESCAPE '\\' OR i.content LIKE ? ESCAPE '\\' OR coalesce(t.note,'') LIKE ? ESCAPE '\\')");
      const search = `%${query.search.trim().replace(/[\\%_]/g, '\\$&')}%`;
      values.push(search, search, search, search, search);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const from = `FROM items i LEFT JOIN topics t ON t.item_id=i.id ${where}`;
    const total = readRow<{ count: number }>(db, `SELECT count(*) count ${from}`, ...values)!.count;
    const limit = Math.min(100, Math.max(1, query.limit ?? 30));
    const offset = Math.max(0, query.offset ?? 0);
    const order = query.savedOnly ? 't.saved_at DESC' : 'coalesce(i.published_at,i.first_seen_at) DESC,i.first_seen_at DESC';
    const rows = readRows<ItemRow>(db, `SELECT i.*,t.note,t.item_id IS NOT NULL saved ${from} ORDER BY ${order} LIMIT ? OFFSET ?`, ...values, limit, offset);
    return { items: rows.map(row => toItem(row)), total, limit, offset };
  }
  function ranked(sourceId: string, query: { search?: string; category?: Category }): TrendItem[] {
    const rows = readRows<ItemRow>(db, `SELECT i.*,t.note,t.item_id IS NOT NULL saved FROM occurrences o JOIN items i ON i.id=o.item_id LEFT JOIN topics t ON t.item_id=i.id WHERE o.source_id=? AND o.active=1 AND o.rank IS NOT NULL GROUP BY i.id ORDER BY min(o.rank)`, sourceId);
    const search = query.search?.trim().toLowerCase() ?? '';
    return rows.filter(row => (!query.category || row.category === query.category) && (!search || `${row.title} ${row.title_zh ?? ''} ${row.summary_zh ?? ''}`.toLowerCase().includes(search))).map(row => toItem(row, sourceId));
  }
  function upsert(source: SourceDefinition, incoming: CollectedItem, eligible: boolean, now: number) {
    const url = normalizeUrl(incoming.url);
    const existing = readRow<ItemRow>(db, 'SELECT * FROM items WHERE url=?', url) ?? readRow<ItemRow>(db, 'SELECT i.* FROM items i JOIN occurrences o ON o.item_id=i.id WHERE o.source_id=? AND o.external_id=?', source.id, incoming.externalId);
    const urlHash = digest(url);
    const seen = readRow<{ first_seen_at: number }>(db, 'SELECT first_seen_at FROM seen_items WHERE url_hash=?', urlHash);
    const firstSeenAt = seen?.first_seen_at ?? existing?.first_seen_at ?? now;
    // 内容清理后仍保留轻量指纹，避免旧订阅条目重新入库并重置保留期限。
    db.prepare('INSERT OR IGNORE INTO seen_items(url_hash,first_seen_at) VALUES (?,?)').run(urlHash, firstSeenAt);
    if (!existing && (firstSeenAt < now - 30 * DAY || (source.kind === 'feed' && incoming.publishedAt !== null && incoming.publishedAt < now - 30 * DAY))) return false;
    const own = !existing || existing.primary_source === source.id;
    const title = own ? incoming.title : existing.title;
    const content = own ? incoming.content || existing?.content || '' : existing.content || incoming.content;
    const hash = digest(`${title}\n${content}`);
    const id = existing?.id ?? digest(url);
    const changed = existing?.content_hash !== hash;
    const effectiveTime = incoming.publishedAt ?? existing?.published_at ?? firstSeenAt;
    const state: AiState = !needsAi(title, content) ? 'not_needed' : eligible && effectiveTime >= now - DAY ? 'pending' : 'skipped';
    if (!existing) {
      db.prepare(`INSERT INTO items(id,url,primary_source,title,content,category,published_at,updated_at,first_seen_at,time_kind,content_hash,ai_state) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(id, url, source.id, title, content, source.category, incoming.publishedAt, incoming.updatedAt, firstSeenAt, incoming.timeKind, hash, state);
    } else if (changed) {
      db.prepare(`UPDATE items SET url=?,title=?,content=?,content_hash=?,ai_state=?,ai_error=NULL,ai_attempt=0,ai_manual=0,ai_ready_at=0 WHERE id=?`)
        .run(own ? url : existing.url, title, content, hash, state, id);
      if (state !== 'pending') db.prepare('UPDATE items SET title_zh=NULL,summary_zh=NULL,ai_model=NULL,ai_profile=NULL,ai_generated_at=NULL WHERE id=?').run(id);
    }
    if (own) db.prepare('UPDATE items SET published_at=coalesce(?,published_at),updated_at=coalesce(?,updated_at),time_kind=CASE WHEN ? IS NOT NULL THEN ? ELSE time_kind END WHERE id=?')
      .run(incoming.publishedAt, incoming.updatedAt, incoming.publishedAt, incoming.timeKind, id);
    db.prepare(`INSERT INTO occurrences(source_id,external_id,item_id,rank,heat,active) VALUES (?,?,?,?,?,1)
      ON CONFLICT(source_id,external_id) DO UPDATE SET item_id=excluded.item_id,rank=excluded.rank,heat=excluded.heat,active=1`)
      .run(source.id, incoming.externalId, id, incoming.rank, incoming.heat);
    return !existing || changed;
  }
  function ingest(source: SourceDefinition, batch: CollectedBatch) {
    const now = Date.now();
    const initialized = Boolean(readRow<{ initialized: number }>(db, 'SELECT initialized FROM sources WHERE id=?', source.id)!.initialized);
    db.transaction(() => {
      if (!batch.notModified) {
        db.prepare('UPDATE occurrences SET previous_rank=CASE WHEN active=1 THEN rank ELSE NULL END,active=0 WHERE source_id=?').run(source.id);
        let initialJobs = 0;
        const items = [...batch.items].sort((a, b) => (b.publishedAt ?? now) - (a.publishedAt ?? now));
        for (const item of items) {
          const recent = (item.publishedAt ?? now) >= now - DAY;
          const eligible = recent && (initialized || initialJobs < 20);
          const changed = upsert(source, item, eligible, now);
          if (!initialized && changed && eligible && needsAi(item.title, item.content)) initialJobs += 1;
        }
      }
      const latest = batch.items.reduce<number | null>((value, item) => item.publishedAt === null ? value : Math.max(value ?? 0, item.publishedAt), null);
      db.prepare("UPDATE sources SET state='ok',error=NULL,success_at=?,latest_at=coalesce(?,latest_at),initialized=1 WHERE id=?").run(now, latest, source.id);
    })();
  }
  function saveTopic(id: string, note: string) {
    if (!readRow<{ id: string }>(db, 'SELECT id FROM items WHERE id=?', id)) throw new Error('资讯不存在');
    db.prepare('INSERT INTO topics(item_id,note,saved_at) VALUES (?,?,?) ON CONFLICT(item_id) DO UPDATE SET note=excluded.note').run(id, note, Date.now());
  }
  function cleanup() {
    db.transaction(() => {
      // 选题及其原文、摘要不受普通资讯保留期限影响。
      db.prepare('DELETE FROM items WHERE first_seen_at<? AND id NOT IN (SELECT item_id FROM topics)').run(Date.now() - 30 * DAY);
      db.prepare('DELETE FROM ai_cache WHERE created_at<?').run(Date.now() - 30 * DAY);
    })();
  }
  return { list, ranked, ingest, saveTopic, cleanup, removeTopic: (id: string) => { db.prepare('DELETE FROM topics WHERE item_id=?').run(id); } };
}

import { join } from 'node:path';
import Database from 'better-sqlite3';
import type {
  XMonitorAuthor, XMonitorTarget, XMonitorTweet, XMonitorTweetCursor, XMonitorTweetQuery,
} from '@creator-studio/contracts';
import { createCollectionSignals } from '../collection-signals.js';
import { MINUTE_MS, type Backfill, type UpdateTarget } from './contracts.js';
import type { processPage, Scan } from './scan.js';

type FailureState = Extract<XMonitorTarget['state'], 'needs_auth' | 'rate_limited' | 'runtime_missing' | 'error'>;
type TargetRow = XMonitorAuthor & {
  addedAt: number;
  enabled: number;
  removed: number;
  intervalMinutes: number;
  nextRunAt: number;
  lastSuccessAt: number | null;
  failure: FailureState | null;
  message: string | null;
  backfill: string | null;
  watermark: string | null;
  scan: string | null;
};
export type TargetJob = Omit<TargetRow, 'backfill' | 'watermark' | 'scan'> & {
  backfill: Backfill | null;
  watermark: XMonitorTweetCursor | null;
  scan: Scan | null;
};

const targetFields = `
  id, handle, name, avatar_url AS avatarUrl, added_at AS addedAt, enabled, removed,
  interval_minutes AS intervalMinutes, next_run_at AS nextRunAt, last_success_at AS lastSuccessAt,
  failure, message, backfill, watermark, scan
`;

function job(row: TargetRow): TargetJob {
  return {
    ...row,
    backfill: row.backfill ? JSON.parse(row.backfill) as Backfill : null,
    watermark: row.watermark ? JSON.parse(row.watermark) as XMonitorTweetCursor : null,
    scan: row.scan ? JSON.parse(row.scan) as Scan : null,
  };
}

function targetView(row: TargetRow, runningId: string | null): XMonitorTarget {
  const state = row.removed ? 'removed' : !row.enabled ? 'paused'
    : runningId === row.id ? 'collecting' : row.failure ?? 'scheduled';
  return {
    id: row.id, handle: row.handle, name: row.name, avatarUrl: row.avatarUrl,
    intervalMinutes: row.intervalMinutes, lastSuccessAt: row.lastSuccessAt,
    state, nextRunAt: row.enabled ? row.nextRunAt : null,
    message: state === row.failure ? row.message : null,
  };
}

function tweetRecord(tweet: XMonitorTweet) {
  return {
    id: tweet.id, targetId: tweet.targetId, publishedAt: tweet.publishedAt, kind: tweet.kind,
    hasMedia: Number(Boolean(tweet.media.length || tweet.reference?.media.length)),
    searchText: [tweet.text, tweet.reference?.text].join('\n'), payload: JSON.stringify(tweet),
  };
}

export function openStore(directory: string) {
  const db = new Database(join(directory, 'x-monitor.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS targets (
      id TEXT PRIMARY KEY, handle TEXT NOT NULL, name TEXT NOT NULL, avatar_url TEXT,
      added_at INTEGER NOT NULL, enabled INTEGER NOT NULL, removed INTEGER NOT NULL DEFAULT 0,
      interval_minutes INTEGER NOT NULL, next_run_at INTEGER NOT NULL, last_success_at INTEGER,
      failure TEXT, message TEXT, backfill TEXT, watermark TEXT, scan TEXT
    );
    CREATE INDEX IF NOT EXISTS x_targets_due ON targets(next_run_at, id) WHERE enabled = 1;
    CREATE TABLE IF NOT EXISTS tweets (
      id TEXT PRIMARY KEY, target_id TEXT NOT NULL REFERENCES targets(id),
      published_at INTEGER NOT NULL, kind TEXT NOT NULL, has_media INTEGER NOT NULL,
      search_text TEXT NOT NULL, payload TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS x_tweets_time ON tweets(published_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS x_tweets_target ON tweets(target_id, published_at DESC, id DESC);
  `);
  const { append, latestSequence, listNew } = createCollectionSignals(db);
  const targetById = db.prepare<[string], TargetRow>(`SELECT ${targetFields} FROM targets WHERE id = ?`);
  const dueTarget = db.prepare<[], TargetRow>(`SELECT ${targetFields} FROM targets WHERE enabled = 1 ORDER BY next_run_at, id LIMIT 1`);
  const allTargets = db.prepare<[], TargetRow>(`SELECT ${targetFields} FROM targets ORDER BY removed, handle`);
  const insertTarget = db.prepare<XMonitorAuthor & { now: number; intervalMinutes: number; next: number; backfill: string }>(`
    INSERT INTO targets (id, handle, name, avatar_url, added_at, enabled, interval_minutes, next_run_at, backfill)
    VALUES (@id, @handle, @name, @avatarUrl, @now, 1, @intervalMinutes, @next, @backfill)
    ON CONFLICT(id) DO UPDATE SET handle = excluded.handle, name = excluded.name, avatar_url = excluded.avatar_url,
      added_at = excluded.added_at, enabled = 1, removed = 0, interval_minutes = excluded.interval_minutes,
      next_run_at = excluded.next_run_at, backfill = excluded.backfill, scan = NULL,
      watermark = NULL, failure = NULL, message = NULL
    WHERE targets.removed = 1
  `);
  const updateTarget = db.prepare('UPDATE targets SET enabled = ?, interval_minutes = ?, next_run_at = ? WHERE id = ?');
  const removeTarget = db.prepare('UPDATE targets SET enabled = 0, removed = 1, scan = NULL WHERE id = ?');
  const scheduleTarget = db.prepare('UPDATE targets SET next_run_at = ? WHERE id = ?');
  const wakeBlocked = db.prepare("UPDATE targets SET next_run_at = ? WHERE enabled = 1 AND failure IN ('needs_auth', 'runtime_missing')");
  const writeFailure = db.prepare('UPDATE targets SET failure = ?, message = ?, next_run_at = ? WHERE id = ?');
  const writeScan = db.prepare(`
    UPDATE targets SET handle = ?, name = ?, avatar_url = ?, next_run_at = ?, last_success_at = ?, backfill = ?,
      watermark = ?, scan = ?, failure = NULL, message = NULL WHERE id = ?
  `);
  const insertTweet = db.prepare<ReturnType<typeof tweetRecord>>(`
    INSERT INTO tweets (id, target_id, published_at, kind, has_media, search_text, payload)
    VALUES (@id, @targetId, @publishedAt, @kind, @hasMedia, @searchText, @payload)
    ON CONFLICT(id) DO NOTHING
  `);
  const refreshTweet = db.prepare<ReturnType<typeof tweetRecord>>(`
    UPDATE tweets SET kind = @kind, has_media = @hasMedia, search_text = @searchText, payload = @payload
    WHERE id = @id AND target_id = @targetId AND payload <> @payload
  `);
  const tweetById = db.prepare<[string], { payload: string }>('SELECT payload FROM tweets WHERE id = ?');

  const commitPage = db.transaction((target: TargetJob, page: ReturnType<typeof processPage>, now: number) => {
    let changes = 0;
    for (const tweet of page.tweets) {
      const record = tweetRecord(tweet);
      if (insertTweet.run(record).changes === 0) {
        changes += refreshTweet.run(record).changes;
        continue;
      }
      changes += 1;
      const source = `@${tweet.author.handle}`;
      const reference = tweet.reference ? `原帖 @${tweet.reference.author.handle}：${tweet.reference.text}` : '';
      append({
        id: tweet.id, title: `${source} 的推文`, text: [tweet.text, reference].filter(Boolean).join('\n'),
        url: tweet.url, source: `X ${source}`, publishedAt: tweet.publishedAt, collectedAt: now,
      });
    }
    for (const tweet of page.refresh) changes += refreshTweet.run(tweetRecord(tweet)).changes;

    const author = [...page.tweets, ...page.refresh].find(tweet => tweet.author.handle && tweet.author.avatarUrl)?.author;
    const watermark = page.done ? page.scan.newest ?? target.watermark : target.watermark;
    writeScan.run(
      author?.handle ?? target.handle, author?.name ?? target.name, author?.avatarUrl ?? target.avatarUrl,
      page.done ? now + target.intervalMinutes * MINUTE_MS : now, page.done ? now : target.lastSuccessAt,
      page.done || !target.backfill ? null : JSON.stringify(target.backfill), watermark && JSON.stringify(watermark),
      page.done ? null : JSON.stringify(page.scan), target.id,
    );
    return changes;
  });

  return {
    close: () => db.close(),
    getJob(id: string) { const row = targetById.get(id); return row ? job(row) : null; },
    nextJob() { const row = dueTarget.get(); return row ? job(row) : null; },
    listTargets: (runningId: string | null) => allTargets.all().map(row => targetView(row, runningId)),
    addTarget(author: XMonitorAuthor, intervalMinutes: number, backfill: Backfill, now: number) {
      const next = backfill.mode === 'from_now' ? now + intervalMinutes * MINUTE_MS : now;
      const result = insertTarget.run({ ...author, now, intervalMinutes, next, backfill: JSON.stringify(backfill) });
      if (result.changes === 0) throw Object.assign(new Error('该账号已在监控列表中。'), { statusCode: 409 });
      return targetView(targetById.get(author.id)!, null);
    },
    updateTarget(target: TargetJob, input: UpdateTarget, now: number) {
      const enabled = input.enabled ?? Boolean(target.enabled);
      const interval = input.intervalMinutes ?? target.intervalMinutes;
      const intervalChanged = interval !== target.intervalMinutes;
      const regular = !target.scan && (!target.backfill || target.backfill.mode === 'from_now');
      const next = enabled && !target.enabled ? now
        : intervalChanged && regular && !target.failure ? now + interval * MINUTE_MS : target.nextRunAt;
      updateTarget.run(Number(enabled), interval, next, target.id);
    },
    removeTarget: (id: string) => removeTarget.run(id),
    scheduleTarget: (id: string, now: number) => scheduleTarget.run(now, id),
    wakeBlocked: (now: number) => wakeBlocked.run(now),
    writeFailure: (id: string, state: FailureState, message: string, nextRunAt: number) => writeFailure.run(state, message, nextRunAt, id),
    commitPage,
    latestSequence,
    listNew,
    getTweet(id: string): XMonitorTweet | null {
      const row = tweetById.get(id);
      return row ? JSON.parse(row.payload) as XMonitorTweet : null;
    },
    listTweets(query: XMonitorTweetQuery) {
      const clauses: string[] = [];
      const values: Array<string | number> = [];
      if (query.targetId) { clauses.push('target_id = ?'); values.push(query.targetId); }
      if (query.kind) { clauses.push('kind = ?'); values.push(query.kind); }
      if (query.hasMedia !== undefined) { clauses.push('has_media = ?'); values.push(Number(query.hasMedia)); }
      if (query.from !== undefined) { clauses.push('published_at >= ?'); values.push(query.from); }
      if (query.to !== undefined) { clauses.push('published_at < ?'); values.push(query.to); }
      if (query.q?.trim()) { clauses.push('instr(lower(search_text), lower(?)) > 0'); values.push(query.q.trim()); }
      if (query.cursor) { clauses.push('(published_at, id) < (?, ?)'); values.push(query.cursor.publishedAt, query.cursor.id); }
      const limit = Math.min(100, Math.max(1, Math.trunc(query.limit ?? 30)));
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const rows = db.prepare<Array<string | number>, { payload: string }>(
        `SELECT payload FROM tweets ${where} ORDER BY published_at DESC, id DESC LIMIT ?`,
      ).all(...values, limit + 1);
      const items = rows.slice(0, limit).map(row => JSON.parse(row.payload) as XMonitorTweet);
      const last = items.at(-1);
      return { items, nextCursor: last && rows.length > limit ? { publishedAt: last.publishedAt, id: last.id } : null };
    },
  };
}

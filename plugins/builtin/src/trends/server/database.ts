import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { SourceDefinition } from '../contracts';

export type TrendsDatabase = Database.Database;
export type SqlValue = string | number | null;
export function readRows<T>(db: TrendsDatabase, sql: string, ...values: SqlValue[]): T[] { return db.prepare(sql).all(...values) as T[]; }
export function readRow<T>(db: TrendsDatabase, sql: string, ...values: SqlValue[]): T | undefined { return db.prepare(sql).get(...values) as T | undefined; }

export function openDatabase(directory: string, definitions: SourceDefinition[]): TrendsDatabase {
  mkdirSync(directory, { recursive: true });
  const db = new Database(join(directory, 'trends.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  // 插件数据独立保存；初版数据库不复用素材库的数据表。
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY, enabled INTEGER NOT NULL, cookie TEXT NOT NULL DEFAULT '',
      state TEXT NOT NULL DEFAULT 'idle', error TEXT, checked_at INTEGER, success_at INTEGER,
      latest_at INTEGER, initialized INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY, url TEXT NOT NULL UNIQUE, primary_source TEXT NOT NULL,
      title TEXT NOT NULL, content TEXT NOT NULL, category TEXT NOT NULL,
      published_at INTEGER, updated_at INTEGER, first_seen_at INTEGER NOT NULL, time_kind TEXT NOT NULL,
      content_hash TEXT NOT NULL, ai_state TEXT NOT NULL, ai_error TEXT,
      title_zh TEXT, summary_zh TEXT, ai_model TEXT, ai_profile TEXT, ai_generated_at INTEGER,
      ai_attempt INTEGER NOT NULL DEFAULT 0, ai_manual INTEGER NOT NULL DEFAULT 0, ai_ready_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS occurrences (
      source_id TEXT NOT NULL REFERENCES sources(id), external_id TEXT NOT NULL,
      item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      rank INTEGER, previous_rank INTEGER, heat TEXT, active INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY(source_id, external_id)
    );
    CREATE TABLE IF NOT EXISTS topics (
      item_id TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
      note TEXT NOT NULL, saved_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ai_cache (key TEXT PRIMARY KEY, result TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS seen_items (url_hash TEXT PRIMARY KEY, first_seen_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS items_time_idx ON items(first_seen_at DESC);
    CREATE INDEX IF NOT EXISTS items_ai_idx ON items(ai_state, ai_ready_at);
    CREATE INDEX IF NOT EXISTS occurrences_item_idx ON occurrences(item_id);
    CREATE INDEX IF NOT EXISTS occurrences_rank_idx ON occurrences(source_id, active, rank);
    UPDATE items SET ai_state='pending' WHERE ai_state='processing';
    UPDATE sources SET state='idle' WHERE state='refreshing';
    PRAGMA user_version = 1;
  `);
  const insert = db.prepare('INSERT OR IGNORE INTO sources(id, enabled, state) VALUES (?, ?, ?)');
  db.transaction(() => {
    for (const source of definitions) insert.run(source.id, source.requiresCredentials ? 0 : 1, source.requiresCredentials ? 'needs_auth' : 'idle');
  })();
  return db;
}

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { join } from 'node:path';
import { DIRS, ensureDataDirs } from '../config.js';
import * as schema from './schema.js';

ensureDataDirs();
export const sqlite = new Database(join(DIRS.database, 'studio.db'));
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('busy_timeout = 5000');
sqlite.pragma('foreign_keys = ON');

// MVP bootstrap: new local databases are ready on the first launch.
// Switch to versioned migrations before changing these tables in later milestones.
sqlite.exec(`
CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL,
  source TEXT NOT NULL, source_url TEXT, relative_path TEXT NOT NULL,
  mime TEXT NOT NULL, size INTEGER NOT NULL, duration INTEGER,
  width INTEGER, height INTEGER, has_audio INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS assets_created_idx ON assets(created_at DESC);
CREATE TABLE IF NOT EXISTS download_tasks (
  id TEXT PRIMARY KEY, url TEXT NOT NULL, title TEXT NOT NULL,
  platform TEXT NOT NULL, status TEXT NOT NULL,
  thumbnail_url TEXT, resolution INTEGER,
  progress INTEGER NOT NULL DEFAULT 0, error TEXT, asset_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS export_tasks (
  id TEXT PRIMARY KEY, asset_id TEXT NOT NULL, status TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0, output_file TEXT, error TEXT,
  created_at INTEGER NOT NULL
);
UPDATE download_tasks SET status='failed', error='程序已重启，请重新创建下载任务' WHERE status='running' OR status='queued';
UPDATE export_tasks SET status='failed', error='程序已重启，请重新导出' WHERE status='running' OR status='queued';
`);

// 给已有本地数据库补齐下载预览字段。
const downloadColumns = sqlite.prepare('PRAGMA table_info(download_tasks)').all() as Array<{ name: string }>;
if (!downloadColumns.some(column => column.name === 'thumbnail_url')) sqlite.exec('ALTER TABLE download_tasks ADD COLUMN thumbnail_url TEXT');
if (!downloadColumns.some(column => column.name === 'resolution')) sqlite.exec('ALTER TABLE download_tasks ADD COLUMN resolution INTEGER');

export const db = drizzle(sqlite, { schema });

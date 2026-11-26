import type { CollectionSignal } from '@creator-studio/contracts';
import type Database from 'better-sqlite3';

export function createCollectionSignals(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS collection_signals (
      seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL,
      title TEXT NOT NULL, text TEXT NOT NULL, url TEXT NOT NULL, source TEXT NOT NULL,
      published_at INTEGER, collected_at INTEGER NOT NULL
    );
  `);
  const append = db.prepare<Omit<CollectionSignal, 'seq'>>(`
    INSERT INTO collection_signals (id, title, text, url, source, published_at, collected_at)
    VALUES (@id, @title, @text, @url, @source, @publishedAt, @collectedAt)
  `);
  const latest = db.prepare<[], { seq: number }>('SELECT coalesce(max(seq), 0) AS seq FROM collection_signals');
  const list = db.prepare<[number, number, number], CollectionSignal>(`
    SELECT seq, id, title, text, url, source, published_at AS publishedAt, collected_at AS collectedAt
    FROM collection_signals WHERE seq > ? AND seq <= ? ORDER BY seq LIMIT ?
  `);

  return {
    // 保存供后台任务筛选的文字摘录，序号和采集记录在同一事务内提交。
    append: (signal: Omit<CollectionSignal, 'seq'>) => append.run({ ...signal, text: signal.text.slice(0, 4000) }),
    latestSequence: () => latest.get()!.seq,
    listNew: (after: number, through: number, limit: number) => list.all(after, through, limit),
  };
}

import type { AiJob, AiRepository, AiResult, RuntimeConfig } from '../contracts';
import { readRow, type TrendsDatabase } from './database';
import { DAY } from './items';

type JobRow = { id: string; content_hash: string; title: string; content: string; published_at: number | null; first_seen_at: number; ai_attempt: number; ai_manual: number };
export function createQueue(db: TrendsDatabase, getRuntimeConfig: () => RuntimeConfig): AiRepository & { retryAi(id: string): void; counts(): { pending: number; processing: number; failed: number } } {
  function takeAiJob(): AiJob | undefined {
    const config = getRuntimeConfig();
    const row = readRow<JobRow>(db, `SELECT * FROM items WHERE ai_state='pending' AND ai_ready_at<=? ${config.autoGenerate ? '' : 'AND ai_manual=1'} ORDER BY ai_manual DESC,coalesce(published_at,first_seen_at) DESC LIMIT 1`, Date.now());
    if (!row) return undefined;
    db.prepare("UPDATE items SET ai_state='processing',ai_error=NULL WHERE id=?").run(row.id);
    return { itemId: row.id, inputHash: row.content_hash, title: row.title, content: row.content, publishedAt: row.published_at, firstSeenAt: row.first_seen_at, attempt: row.ai_attempt, manual: Boolean(row.ai_manual) };
  }
  return {
    getRuntimeConfig, takeAiJob,
    finishAiJob(job, result) {
      db.transaction(() => {
        db.prepare("UPDATE items SET ai_state='completed',ai_error=NULL,title_zh=?,summary_zh=?,ai_model=?,ai_profile=?,ai_generated_at=?,ai_manual=0 WHERE id=? AND content_hash=?")
          .run(result.titleZh, result.summaryZh, result.model, result.profileId, result.generatedAt, job.itemId, job.inputHash);
        db.prepare('INSERT OR REPLACE INTO ai_cache(key,result,created_at) VALUES (?,?,?)').run(result.cacheKey, JSON.stringify(result), Date.now());
      })();
    },
    failAiJob(job, error, retryAt) {
      db.prepare('UPDATE items SET ai_state=?,ai_error=?,ai_attempt=ai_attempt+1,ai_ready_at=? WHERE id=? AND content_hash=?')
        .run(retryAt === null ? 'failed' : 'pending', error, retryAt ?? 0, job.itemId, job.inputHash);
    },
    skipExpiredAiJobs() {
      db.prepare("UPDATE items SET ai_state='skipped',ai_error=NULL WHERE ai_state='pending' AND ai_manual=0 AND coalesce(published_at,first_seen_at)<?").run(Date.now() - DAY);
    },
    getCachedAiResult(key) {
      const row = readRow<{ result: string }>(db, 'SELECT result FROM ai_cache WHERE key=?', key);
      return row ? JSON.parse(row.result) as AiResult : undefined;
    },
    retryAi(id) {
      const config = getRuntimeConfig();
      if (!config.profiles[config.activeProfile].verified) throw new Error('请先在设置中保存并测试当前模型连接');
      const row = readRow<{ ai_state: string }>(db, 'SELECT ai_state FROM items WHERE id=?', id);
      if (!row) throw new Error('资讯不存在');
      if (row.ai_state === 'processing') return;
      db.prepare("UPDATE items SET ai_state='pending',ai_error=NULL,ai_attempt=0,ai_manual=1,ai_ready_at=0 WHERE id=?").run(id);
    },
    counts() {
      const count = (state: string) => readRow<{ n: number }>(db, 'SELECT count(*) n FROM items WHERE ai_state=?', state)!.n;
      return { pending: count('pending'), processing: count('processing'), failed: count('failed') };
    },
  };
}

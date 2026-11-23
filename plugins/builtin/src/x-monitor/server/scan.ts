import type { XMonitorTweet, XMonitorTweetCursor } from '@creator-studio/plugin-sdk/x-monitor';
import { DAY_MS, type Backfill } from '../contracts';
import type { TimelinePage } from './bridge';

export type Scan = {
  cursor: string | null;
  newest: XMonitorTweetCursor | null;
  pendingPin: XMonitorTweet | null;
  counted: string[];
};
type Boundary = { addedAt: number; backfill: Backfill | null; watermark: XMonitorTweetCursor | null };

export const newScan = (): Scan => ({ cursor: null, newest: null, pendingPin: null, counted: [] });

function compare(a: XMonitorTweetCursor, b: XMonitorTweetCursor): number {
  return a.publishedAt - b.publishedAt || (a.id === b.id ? 0 : a.id > b.id ? 1 : -1);
}

export function processPage(boundary: Boundary, scan: Scan, page: TimelinePage) {
  const ordered = [...page.items].sort((a, b) => compare(b, a));
  const oldest = ordered.at(-1);
  const pin = scan.pendingPin ?? page.pinned;
  let pendingPin = null;
  let counted = scan.counted;
  let done = page.nextCursor === null;
  let tweets: XMonitorTweet[];
  let refresh: XMonitorTweet[] = [];
  const backfill = boundary.backfill;

  if (backfill?.mode === 'latest') {
    // 置顶可能比后续页面更旧，等时间线扫到相同位置再计入最新 N 条。
    const pinIsInRange = pin && (done || (oldest && compare(pin, oldest) >= 0));
    pendingPin = pinIsInRange ? null : pin;
    const candidates = pinIsInRange ? [...ordered, pin].sort((a, b) => compare(b, a)) : ordered;
    const seen = new Set(counted);
    tweets = candidates.filter(tweet => {
      if (tweet.publishedAt >= boundary.addedAt) return true;
      if (seen.has(tweet.id) || seen.size >= backfill.amount) return false;
      seen.add(tweet.id);
      return true;
    });
    counted = [...seen];
    done ||= counted.length === backfill.amount;
  } else {
    const lowerTime = backfill?.mode === 'days' ? boundary.addedAt - backfill.amount * DAY_MS : boundary.addedAt;
    const watermark = backfill ? null : boundary.watermark;
    const inRange = (tweet: XMonitorTweet) => watermark ? compare(tweet, watermark) >= 0 : tweet.publishedAt >= lowerTime;
    const candidates = pin ? [...ordered, pin] : ordered;
    tweets = candidates.filter(inRange);
    // 增量采集顺手更新本页已有推文的互动，不扩大原先选定的采集范围。
    if (!backfill) refresh = candidates.filter(tweet => !inRange(tweet));
    done ||= Boolean(oldest && !inRange(oldest));
  }

  const newest = tweets.reduce<Scan['newest']>(
    (previous, { id, publishedAt }) => !previous || compare({ id, publishedAt }, previous) > 0 ? { id, publishedAt } : previous,
    scan.newest,
  );
  return { tweets, refresh, done, scan: { cursor: page.nextCursor, newest, pendingPin, counted } satisfies Scan };
}

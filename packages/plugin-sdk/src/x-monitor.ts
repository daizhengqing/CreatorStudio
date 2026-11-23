export const X_MONITOR_PLUGIN_ID = 'studio.x-monitor';
export const X_MONITOR_TWEETS_CHANGED = 'studio.x-monitor.tweets.changed';

export type XMonitorAuthor = {
  id: string;
  handle: string;
  name: string;
  avatarUrl: string | null;
};

export type XMonitorTarget = XMonitorAuthor & {
  intervalMinutes: number;
  state: 'scheduled' | 'collecting' | 'paused' | 'removed' | 'needs_auth' | 'rate_limited' | 'runtime_missing' | 'error';
  lastSuccessAt: number | null;
  nextRunAt: number | null;
  message: string | null;
};

export type XMonitorMedia = {
  kind: 'image' | 'video' | 'gif';
  url: string | null;
  previewUrl: string;
  alt: string | null;
};

export type XMonitorPost = {
  id: string;
  author: XMonitorAuthor;
  /** Unix 毫秒时间戳。 */
  publishedAt: number;
  url: string;
  text: string;
  metrics: {
    replies: number;
    reposts: number;
    quotes: number;
    likes: number;
    bookmarks: number;
    views: number | null;
  };
  media: XMonitorMedia[];
};

export type XMonitorTweetKind = 'original' | 'quote' | 'repost';
export type XMonitorTweet = XMonitorPost & {
  targetId: string;
  kind: XMonitorTweetKind;
  referenceId: string | null;
  reference: XMonitorPost | null;
};
export type XMonitorTweetCursor = Pick<XMonitorPost, 'publishedAt' | 'id'>;

export type XMonitorTweetQuery = {
  targetId?: string;
  q?: string;
  kind?: XMonitorTweetKind;
  hasMedia?: boolean;
  /** Unix 毫秒时间戳。包含 from，截止到 to 之前。 */
  from?: number;
  to?: number;
  cursor?: XMonitorTweetCursor;
  limit?: number;
};

export type XMonitorTweetPage = {
  items: XMonitorTweet[];
  nextCursor: XMonitorTweetCursor | null;
};

export type XMonitorTweetsChanged = { targetId: string };

export type XMonitorReadApi = {
  listTargets: { input: null; output: XMonitorTarget[] };
  listTweets: { input: XMonitorTweetQuery; output: XMonitorTweetPage };
  getTweet: { input: { id: string }; output: XMonitorTweet | null };
};

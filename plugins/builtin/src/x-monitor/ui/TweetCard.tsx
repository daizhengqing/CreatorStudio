import { Bookmark, ExternalLink, Eye, Heart, MessageCircle, Quote, Repeat2 } from 'lucide-react';
import type { XMonitorMedia, XMonitorPost, XMonitorTweet } from '@creator-studio/plugin-sdk/x-monitor';
import { dateTime, kindNames } from './shared';

const number = new Intl.NumberFormat('zh-CN');
const metrics = [
  ['replies', '回复', MessageCircle], ['reposts', '转发', Repeat2], ['quotes', '引用', Quote],
  ['likes', '赞', Heart], ['bookmarks', '书签', Bookmark], ['views', '浏览', Eye],
] as const;

function Media({ items }: { items: XMonitorMedia[] }) {
  if (items.length === 0) return null;
  return <div className="xm-media">
    {items.map(({ kind, url, previewUrl, alt }, index) => (
      kind === 'image' ? <a key={index} href={previewUrl} target="_blank" rel="noreferrer">
        <img src={previewUrl} alt={alt ?? '推文图片'} loading="lazy" />
      </a> : url ? <video key={index} src={url} poster={previewUrl} preload="none" controls playsInline
        aria-label={alt ?? (kind === 'gif' ? '推文动图' : '推文视频')} />
        : <img key={index} src={previewUrl} alt={alt ?? '视频封面'} loading="lazy" />
    ))}
  </div>;
}

function PostBody({ post }: { post: XMonitorPost }) {
  return <><p className="xm-post-text">{post.text}</p><Media items={post.media} /></>;
}

export function TweetCard({ tweet }: { tweet: XMonitorTweet }) {
  const { author, publishedAt, reference, referenceId, kind } = tweet;
  const repost = kind === 'repost' && reference;
  const counters = (repost || tweet).metrics;
  const authorLabel = author.name || (author.handle ? `@${author.handle}` : 'X 账号');
  return <article className="xm-tweet">
    <header className="xm-tweet-header">
      {author.avatarUrl ? <img className="xm-avatar" src={author.avatarUrl} alt="" loading="lazy" />
        : <span className="xm-avatar" aria-hidden>{authorLabel.slice(0, 1).toUpperCase()}</span>}
      <div className="xm-tweet-byline">
        <strong title={authorLabel}>{authorLabel}</strong>
        {author.handle && <span>@{author.handle}</span>}
      </div>
      <span className="xm-quiet">{kindNames[kind]}</span>
      <a className="xm-post-link" href={tweet.url} target="_blank" rel="noreferrer" aria-label="在 X 查看原文">
        <time dateTime={new Date(publishedAt).toISOString()}>{dateTime.format(publishedAt)}</time>
        <ExternalLink size={13} aria-hidden />
      </a>
    </header>
    {!repost && <PostBody post={tweet} />}
    {reference ? <div className="xm-reference">
      <a href={reference.url} target="_blank" rel="noreferrer" className="xm-post-link">
        {reference.author.name || (reference.author.handle ? `@${reference.author.handle}` : '查看引用推文')} <ExternalLink size={12} aria-hidden />
      </a>
      <PostBody post={reference} />
    </div> : referenceId && <a className="xm-post-link" href={`https://x.com/i/status/${referenceId}`} target="_blank" rel="noreferrer">
      查看关联推文 <ExternalLink size={12} aria-hidden />
    </a>}
    <footer className="xm-metrics" aria-label={repost ? '被转发推文的互动数据' : '推文互动数据'}>
      {metrics.map(([key, label, Icon]) => {
        const value = counters[key];
        const display = value === null ? '—' : number.format(value);
        return <span key={key} title={`${label} ${display}`} aria-label={`${label} ${display}`}>
          <Icon size={14} aria-hidden />{display}
        </span>;
      })}
    </footer>
  </article>;
}

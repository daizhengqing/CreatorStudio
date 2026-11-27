import type { XMonitorPost } from '@creator-studio/contracts';
import { messageExcerpt } from '../../harness/messages.js';

export function projectXPost(post: XMonitorPost, fullText: boolean) {
  const { views, ...metrics } = post.metrics;
  return {
    id: post.id, source: `X @${post.author.handle}`, authorId: post.author.id,
    url: post.url, publishedAt: new Date(post.publishedAt).toISOString(),
    text: fullText ? post.text : messageExcerpt(post.text),
    metrics: { ...metrics, ...(views !== null ? { views } : {}) },
    ...(post.media.length ? { media: post.media.map(({ kind, url, previewUrl, alt }) => ({
      kind, url: url ?? previewUrl, ...(alt ? { alt } : {}),
    })) } : {}),
  };
}

export function projectXReference(post: XMonitorPost, fullText: boolean) {
  if (fullText) return projectXPost(post, true);
  return {
    id: post.id, source: `X @${post.author.handle}`, url: post.url,
    text: messageExcerpt(post.text),
  };
}

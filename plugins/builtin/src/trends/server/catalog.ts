import type { SourceDefinition } from '../contracts.js';

export const sourceDefinitions: SourceDefinition[] = [
  { id: 'thepaper', name: '澎湃新闻', category: 'social', kind: 'hot' },
  { id: 'zhihu', name: '知乎热榜', category: 'social', kind: 'hot' },
  { id: 'douyin', name: '抖音热榜', category: 'social', kind: 'hot' },
  { id: 'weibo', name: '微博热搜', category: 'social', kind: 'hot', requiresCredentials: true },
  { id: 'wallstreetcn', name: '华尔街见闻', category: 'finance', kind: 'flash' },
  { id: 'bbc', name: 'BBC 国际', category: 'international', kind: 'feed', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  { id: 'un', name: '联合国新闻', category: 'international', kind: 'feed', url: 'https://news.un.org/feed/subscribe/en/news/all/rss.xml' },
  { id: 'huggingface', name: 'Hugging Face', category: 'ai', kind: 'feed', url: 'https://huggingface.co/blog/feed.xml' },
  { id: 'deepmind', name: 'Google DeepMind', category: 'ai', kind: 'feed', url: 'https://deepmind.google/blog/rss.xml' },
  { id: 'hackernews', name: 'Hacker News', category: 'ai', kind: 'community' },
  { id: 'fed', name: '美联储', category: 'finance', kind: 'feed', url: 'https://www.federalreserve.gov/feeds/press_all.xml' },
  { id: 'coindesk', name: 'CoinDesk', category: 'crypto', kind: 'feed', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
  { id: 'cointelegraph', name: 'Cointelegraph', category: 'crypto', kind: 'feed', url: 'https://cointelegraph.com/rss' },
];

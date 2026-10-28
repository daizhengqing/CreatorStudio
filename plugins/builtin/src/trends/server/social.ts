import { load } from 'cheerio';
import type { CollectedBatch, CollectedItem } from '../contracts.js';
import type { CollectOptions } from './collectors.js';
import { fetchJson, fetchText } from './http.js';
import { plainText } from './rss.js';

// 接口映射参考 NewsNow（MIT，© ourongxing）；完整许可见 NOTICE.md。
type ZhihuEntry = { target: { title_area: { text: string }; excerpt_area: { text: string }; metrics_area: { text: string }; link: { url: string } } };
type DouyinEntry = { sentence_id: string; word: string; hot_value: number; position: number; event_time: number };
type PaperEntry = { contId: string | number; name: string; pubTimeLong?: string | number };
type WallstreetEntry = { id: number; title?: string; content_text: string; uri: string; display_time: number };
let anonymousDouyinCookie = '';

const item = (externalId: string, title: string, url: string): CollectedItem => ({ externalId, title: plainText(title), url, content: '', publishedAt: null, updatedAt: null, timeKind: 'discovered', rank: null, heat: null });
const needsAuth = (message: string) => Object.assign(new Error(message), { code: 'NEEDS_AUTH' });

function nonempty<T>(items: T[], source: string): T[] {
  if (!Array.isArray(items) || !items.length) throw new Error(`${source}没有返回榜单数据，可能需要登录或暂时无法访问`);
  return items;
}

export async function collectZhihu(options: CollectOptions): Promise<CollectedBatch> {
  const result = await fetchJson<{ data: ZhihuEntry[] }>('https://www.zhihu.com/api/v3/feed/topstory/hot-list-web?limit=20&desktop=true', { ...options, headers: options.cookie ? { cookie: options.cookie } : undefined });
  return { items: nonempty(result.data, '知乎').map(({ target }, index) => ({
    ...item(target.link.url.match(/(\d+)$/)?.[1] ?? target.link.url, target.title_area.text, target.link.url),
    content: plainText(target.excerpt_area.text),
    rank: index + 1,
    heat: target.metrics_area.text,
  })) };
}

export async function collectDouyin(options: CollectOptions): Promise<CollectedBatch> {
  if (!options.cookie && !anonymousDouyinCookie) {
    const bootstrap = await fetchText('https://login.douyin.com/', options);
    if (bootstrap.status < 200 || bootstrap.status >= 300) throw new Error(`抖音匿名会话返回 HTTP ${bootstrap.status}`);
    // 只保留当前服务器收到的匿名会话，不使用公共 Cookie 或逆向签名。
    anonymousDouyinCookie = bootstrap.cookies.map(cookie => cookie.split(';', 1)[0]).join('; ');
  }
  try {
    const result = await fetchJson<{ status_code: number; data: { word_list: DouyinEntry[] } }>('https://www.douyin.com/aweme/v1/web/hot/search/list/?device_platform=webapp&aid=6383&channel=channel_pc_web&detail_list=1', { ...options, headers: { cookie: options.cookie || anonymousDouyinCookie } });
    if (result.status_code !== 0) throw new Error('抖音热榜暂时无法访问，请检查来源状态');
    return { items: nonempty(result.data.word_list, '抖音').map(entry => ({
      ...item(entry.sentence_id, entry.word, `https://www.douyin.com/hot/${entry.sentence_id}`),
      rank: entry.position,
      heat: String(entry.hot_value),
      // event_time 是平台事件时间，未声明为新闻发布时间，故不写 publishedAt。
    })) };
  } catch (error) {
    anonymousDouyinCookie = '';
    throw error;
  }
}

export async function collectWeibo(options: CollectOptions): Promise<CollectedBatch> {
  if (!options.cookie?.trim()) throw needsAuth('微博需要配置你自己的登录 Cookie');
  const url = 'https://s.weibo.com/top/summary?cate=realtimehot';
  const response = await fetchText(url, { ...options, headers: { cookie: options.cookie, referer: url } });
  if (response.status === 401 || response.status === 403) throw needsAuth(`微博登录态不可用（HTTP ${response.status}），请更新 Cookie`);
  if (response.status < 200 || response.status >= 300) throw new Error(`微博返回 HTTP ${response.status}`);
  const document = load(response.body);
  const rows = document('#pl_top_realtimehot table tbody tr');
  if (!rows.length) throw needsAuth('微博没有返回热榜，登录态可能已失效，请更新 Cookie');
  const items: CollectedItem[] = [];
  rows.each((_, row) => {
    const current = document(row);
    const rank = Number.parseInt(current.find('td.td-01').text().trim(), 10);
    const link = current.find('td.td-02 a').filter((__, element) => !document(element).attr('href')?.startsWith('javascript:')).first();
    const href = link.attr('href');
    const title = link.text().trim();
    if (!href || !title || !Number.isFinite(rank)) return;
    items.push({ ...item(title, title, new URL(href, url).href), rank, heat: current.find('td.td-02 span').first().text().trim() || null });
  });
  return { items: nonempty(items, '微博') };
}

export async function collectThepaper(options: CollectOptions): Promise<CollectedBatch> {
  const result = await fetchJson<{ data: { hotNews: PaperEntry[] } }>('https://cache.thepaper.cn/contentapi/wwwIndex/rightSidebar', options);
  return { items: nonempty(result.data.hotNews, '澎湃新闻').map((entry, index) => ({
    ...item(String(entry.contId), entry.name, `https://www.thepaper.cn/newsDetail_forward_${entry.contId}`),
    rank: index + 1,
    // 这是热榜快照；未验证 pubTimeLong 的来源定义，不把它写成新闻发布时间。
  })) };
}

export async function collectWallstreet(options: CollectOptions): Promise<CollectedBatch> {
  const result = await fetchJson<{ data: { items: WallstreetEntry[] } }>('https://api-one.wallstcn.com/apiv1/content/lives?channel=global-channel&limit=30', options);
  return { items: nonempty(result.data.items, '华尔街见闻').map(entry => ({
    ...item(String(entry.id), entry.title || entry.content_text, entry.uri),
    content: plainText(entry.content_text),
    publishedAt: entry.display_time * 1000,
    timeKind: 'published',
  })) };
}

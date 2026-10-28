import { load } from 'cheerio';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { CollectedBatch, CollectedItem } from '../contracts.js';
import type { CollectOptions } from './collectors.js';
import { fetchText } from './http.js';

type XmlRecord = Record<string, unknown>;
const conditionalHeaders = new Map<string, Record<string, string>>();
const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false, parseAttributeValue: false, trimValues: true });
const record = (value: unknown): XmlRecord => typeof value === 'object' && value !== null && !Array.isArray(value) ? value as XmlRecord : {};
const list = (value: unknown): unknown[] => value === undefined ? [] : Array.isArray(value) ? value : [value];
const valueText = (value: unknown): string => typeof value === 'string' || typeof value === 'number' ? String(value) : valueTextLeaf(record(value)['#text']);
const valueTextLeaf = (value: unknown): string => typeof value === 'string' || typeof value === 'number' ? String(value) : '';

export function plainText(html: string): string {
  const document = load(html);
  document('script, style').remove();
  document('br, p, div, li, h1, h2, h3').append(' ');
  return document.text().replace(/\s+/g, ' ').trim();
}

function dateValue(value: unknown): number | null {
  const text = valueText(value);
  const timestamp = text ? Date.parse(text) : NaN;
  return Number.isFinite(timestamp) ? timestamp : null;
}

function entryLink(entry: XmlRecord, baseUrl: string): string {
  const links = list(entry.link);
  const alternate = links.find(link => record(link)['@_rel'] === 'alternate') ?? links.find(link => !!record(link)['@_href']) ?? links[0];
  const href = valueText(record(alternate)['@_href']) || valueText(alternate);
  return href ? new URL(href, baseUrl).href : '';
}

export function parseFeed(xml: string, baseUrl: string): CollectedItem[] {
  if (XMLValidator.validate(xml) !== true) throw new Error('来源返回的 RSS／Atom 不是有效 XML');
  const document: unknown = parser.parse(xml);
  const root = record(document);
  const channel = root.rss ? record(record(root.rss).channel) : record(root.feed);
  if (!root.rss && !root.feed) throw new Error('来源没有返回 RSS／Atom 订阅内容');
  return list(channel.item ?? channel.entry).map((value): CollectedItem => {
    const entry = record(value);
    const url = entryLink(entry, baseUrl);
    const publishedAt = dateValue(entry.pubDate ?? entry.published ?? entry['dc:date']);
    const updatedAt = dateValue(entry.updated ?? entry['atom:updated']);
    return {
      externalId: valueText(entry.guid ?? entry.id) || url,
      title: plainText(valueText(entry.title)),
      url,
      content: plainText(valueText(entry['content:encoded'] ?? entry.content ?? entry.description ?? entry.summary)),
      publishedAt,
      updatedAt,
      // Atom 的 updated 只表示修改时间，不能冒充发布时间。
      timeKind: publishedAt === null ? 'discovered' : 'published',
      rank: null,
      heat: null,
    };
  }).filter(item => !!item.title && !!item.url).slice(0, 100);
}

export async function collectFeed(url: string, options: CollectOptions): Promise<CollectedBatch> {
  const response = await fetchText(url, { ...options, headers: conditionalHeaders.get(url) });
  if (response.status === 304) return { items: [], notModified: true };
  if (response.status < 200 || response.status >= 300) throw new Error(`订阅源返回 HTTP ${response.status}`);
  const items = parseFeed(response.body, url);
  if (!items.length) throw new Error('订阅源没有返回有效条目');
  const headers: Record<string, string> = {};
  if (response.headers.etag) headers['if-none-match'] = response.headers.etag;
  if (response.headers['last-modified']) headers['if-modified-since'] = response.headers['last-modified'];
  conditionalHeaders.set(url, headers);
  return { items };
}

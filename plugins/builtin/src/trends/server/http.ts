import { Agent, ProxyAgent, fetch } from 'undici';

export type HttpOptions = {
  proxyUrl?: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
  method?: string;
  body?: string;
  direct?: boolean;
};
export type TextResponse = { body: string; status: number; headers: Record<string, string>; cookies: string[] };

let directAgent: Agent | undefined;
const proxies = new Map<string, ProxyAgent>();
const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

function transport(url: URL, options: HttpOptions) {
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  // 本地模型地址即使配置了出口代理，也始终在本机直连。
  const loopback = hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '::1' || /^127\./.test(hostname) || hostname.startsWith('::ffff:127.');
  if (options.direct || loopback || !options.proxyUrl) return directAgent ??= new Agent();
  let agent = proxies.get(options.proxyUrl);
  if (!agent) {
    agent = new ProxyAgent(options.proxyUrl);
    proxies.set(options.proxyUrl, agent);
  }
  return agent;
}

export async function fetchText(input: string, options: HttpOptions = {}): Promise<TextResponse> {
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 15_000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  const headers = new Headers({ 'user-agent': userAgent, ...options.headers });
  let url = new URL(input);
  let method = options.method ?? 'GET';
  let body = options.body;

  // 手动跟随重定向，逐跳选择代理，并避免把 Cookie/密钥发送到其他站点。
  for (let redirect = 0; redirect <= 5; redirect += 1) {
    const response = await fetch(url, { method, body, headers: Object.fromEntries(headers), signal, dispatcher: transport(url, options), redirect: 'manual' });
    const text = await response.text();
    const location = response.headers.get('location');
    if (![301, 302, 303, 307, 308].includes(response.status) || !location) {
      return { body: text, status: response.status, headers: Object.fromEntries(response.headers), cookies: response.headers.getSetCookie() };
    }
    const next = new URL(location, url);
    if (next.origin !== url.origin) {
      headers.delete('authorization');
      headers.delete('cookie');
    }
    if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === 'POST')) {
      method = 'GET';
      body = undefined;
      headers.delete('content-type');
    }
    url = next;
  }
  throw new Error('来源重定向次数过多');
}

export async function fetchJson<T>(url: string, options: HttpOptions = {}): Promise<T> {
  const response = await fetchText(url, options);
  if (response.status < 200 || response.status >= 300) throw new Error(`来源返回 HTTP ${response.status}`);
  if (!response.body.trim()) throw new Error('来源返回空响应');
  try {
    return JSON.parse(response.body) as T;
  } catch {
    throw new Error('来源返回非 JSON 内容，可能需要重新登录或暂时无法访问');
  }
}

export async function closeTransport(): Promise<void> {
  const agents = [...proxies.values(), ...(directAgent ? [directAgent] : [])];
  directAgent = undefined;
  proxies.clear();
  await Promise.all(agents.map(agent => agent.close()));
}

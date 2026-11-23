import type { ModelCompletionInput } from '@creator-studio/plugin-sdk';
import { fetch, ProxyAgent } from 'undici';

type Connection = { baseUrl: string; model: string; apiKey: string; proxyUrl: string; timeoutMs: number };
const proxies = new Map<string, ProxyAgent>();
const retryDelay = 60_000;

function proxyFor(baseUrl: string, proxyUrl: string) {
  if (!proxyUrl) return undefined;
  const host = new URL(baseUrl).hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host === '::1' || /^127(?:\.\d+){3}$/.test(host) || /^::ffff:7f[\da-f]{2}:/.test(host)) return undefined;
  let agent = proxies.get(proxyUrl);
  if (!agent) {
    agent = new ProxyAgent(proxyUrl);
    proxies.set(proxyUrl, agent);
  }
  return agent;
}

function requestError(message: string, retryAfterMs?: number) {
  return Object.assign(new Error(message), { retryAfterMs });
}

function retryAfter(header: string | null): number {
  if (!header) return retryDelay;
  const seconds = Number(header);
  const delay = Number.isFinite(seconds) ? seconds * 1_000 : Date.parse(header) - Date.now();
  return Number.isFinite(delay) ? Math.max(retryDelay, delay) : retryDelay;
}

export async function requestModel(connection: Connection, input: ModelCompletionInput, signal?: AbortSignal): Promise<string> {
  const { baseUrl, model, apiKey, proxyUrl, timeoutMs } = connection;
  if (!baseUrl || !model) throw new Error('请填写模型 API 根地址和模型名称');
  const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json' };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  const timeout = AbortSignal.timeout(timeoutMs);
  let response: Awaited<ReturnType<typeof fetch>>;
  let body: string;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST', headers, dispatcher: proxyFor(baseUrl, proxyUrl),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      body: JSON.stringify({ model, messages: input.messages, stream: false, ...(input.json ? { response_format: { type: 'json_object' } } : {}) }),
    });
    body = await response.text();
  } catch {
    throw requestError('模型服务连接失败或请求超时', retryDelay);
  }

  // 上游错误正文可能包含凭据，只返回工作台定义的错误信息。
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw requestError('模型认证失败，请检查 API Key 或访问权限');
    if (response.status === 429) throw requestError('模型服务请求限流', retryAfter(response.headers.get('retry-after')));
    if (response.status >= 500) throw requestError(`模型服务暂时不可用（HTTP ${response.status}）`, retryDelay);
    throw requestError(`模型请求被拒绝（HTTP ${response.status}），请检查模型配置和输出格式`);
  }
  try {
    const result = JSON.parse(body) as { choices: { message: { content: unknown } }[] };
    const content = result.choices[0]?.message.content;
    if (typeof content === 'string' && content.trim()) return content;
  } catch {
    throw requestError('模型服务返回的响应格式无效');
  }
  throw requestError('模型未返回有效的消息内容');
}

export async function closeModelConnections(): Promise<void> {
  await Promise.all([...proxies.values()].map(agent => agent.close()));
  proxies.clear();
}

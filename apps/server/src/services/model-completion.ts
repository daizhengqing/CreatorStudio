import type { ModelCompletionInput, ModelInput } from '@creator-studio/contracts';
import { fetch, ProxyAgent } from 'undici';

export type ModelConnection = Omit<ModelInput, 'apiKey'> & { apiKey: string; timeoutMs: number };
const proxies = new Map<string, ProxyAgent>();
const retryDelay = 60_000;

export function modelProxy(baseUrl: string, proxyUrl: string) {
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

export async function requestModel(connection: ModelConnection, input: ModelCompletionInput, signal?: AbortSignal): Promise<string> {
  const { baseUrl, model, apiKey, proxyUrl, timeoutMs } = connection;
  const anthropic = connection.protocol === 'anthropic-messages';
  const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json' };
  if (anthropic) {
    headers['anthropic-version'] = '2023-06-01';
    if (apiKey) headers['x-api-key'] = apiKey;
  } else if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
  }

  // Messages 将 system 指令与对话消息分开。摘要提示词已明确要求返回 JSON。
  const system = input.messages.filter(message => message.role === 'system').map(message => message.content).join('\n\n');
  const payload = anthropic ? {
    model,
    max_tokens: 1024,
    ...(system ? { system } : {}),
    messages: input.messages.filter(message => message.role !== 'system'),
  } : {
    model, messages: input.messages, stream: false, ...(input.json ? { response_format: { type: 'json_object' } } : {}),
  };

  const timeout = AbortSignal.timeout(timeoutMs);
  let response: Awaited<ReturnType<typeof fetch>>;
  let body: string;
  try {
    response = await fetch(`${baseUrl}${anthropic ? '/v1/messages' : '/chat/completions'}`, {
      method: 'POST', headers, dispatcher: modelProxy(baseUrl, proxyUrl),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      body: JSON.stringify(payload),
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
    const result = JSON.parse(body) as {
      content?: { type: string; text?: string }[];
      choices?: { message: { content: unknown } }[];
    };
    const content = anthropic
      ? result.content?.filter(block => block.type === 'text').map(block => block.text).join('')
      : result.choices?.[0]?.message.content;
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

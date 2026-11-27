import { join } from 'node:path';
import { Type } from 'typebox';
import { fetch as transportFetch } from 'undici';
import { createAssistantMessageEventStream, type AssistantMessageEvent, type AssistantMessageEventStream, type Model } from '@earendil-works/pi-ai';
import { streamSimple as streamAnthropic } from '@earendil-works/pi-ai/api/anthropic-messages';
import { streamSimple as streamOpenAI } from '@earendil-works/pi-ai/api/openai-completions';
import {
  createAgentSession, defineTool, ModelRuntime, SessionManager, SettingsManager, type ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import { DATA_ROOT, DIRS } from '../config.js';
import { modelProxy, type ModelConnection } from '../services/model-completion.js';
import { agentMessages, toolMetadata } from './content.js';
import { createCreatorResources } from './resources.js';

export type CreatorSessionProfile = 'x-drafts';

function modelFetch(connection: ModelConnection, requestLimit = Infinity): typeof fetch {
  const dispatcher = modelProxy(connection.baseUrl, connection.proxyUrl);
  let requests = 0;
  return async (input, options) => {
    // 限制实际发往模型服务的请求数，涵盖 SDK 发起的续轮和重试。
    if (requests >= requestLimit) throw new Error(`已达到本轮 ${requestLimit} 次模型请求上限`);
    requests += 1;
    const request = new Request(input, options);
    if (!connection.apiKey) {
      request.headers.delete('authorization');
      request.headers.delete('x-api-key');
    }
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(connection.timeoutMs)]);
    const response = await transportFetch(request.url, {
      method: request.method, headers: [...request.headers], body: request.body ? await request.text() : undefined,
      signal, dispatcher,
    });
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers: [...response.headers] });
  };
}

function retryDraftStream(first: AssistantMessageEventStream, retry: () => AssistantMessageEventStream | undefined) {
  const result = createAssistantMessageEventStream();
  void (async () => {
    // 推理阶段的事件暂不向 Pi 发布，重试时会话只接收实际采用的响应。
    let pending: AssistantMessageEvent[] | undefined = [];
    for await (const event of first) {
      if (pending && (event.type === 'start' || event.type.startsWith('thinking_'))) {
        pending.push(event);
        continue;
      }
      if (pending && event.type === 'error' && event.reason === 'error' && !event.error.rawStopReason
        && /UND_ERR_SOCKET|ECONNRESET|stream ended without finish_reason/i.test(event.error.errorMessage ?? '')) {
        const repeated = retry();
        if (repeated) {
          for await (const next of repeated) result.push(next);
          break;
        }
      }
      for (const buffered of pending ?? []) result.push(buffered);
      pending = undefined;
      result.push(event);
    }
    result.end();
  })();
  return result;
}

export async function createCreatorSession(
  connection: ModelConnection, manager: SessionManager, tools: ToolDefinition[], profile?: CreatorSessionProfile,
) {
  const { resourceLoader, sessionTools } = createCreatorResources(tools);
  const runtime = await ModelRuntime.create({
    authPath: join(DIRS.agent, 'auth.json'), modelsPath: null, refreshOnCreate: false,
  });
  const providerId = 'creator-studio';
  const api = connection.protocol;
  const draft = profile === 'x-drafts';
  let draftRetryAvailable = draft;
  const fetchModel = modelFetch(connection, draft ? 3 : Infinity);
  // 未配置窗口时跳过主动阈值，继续交由 SDK 恢复服务商返回的超限错误。
  const contextWindow = connection.contextWindow ?? Number.MAX_SAFE_INTEGER;
  runtime.registerProvider(providerId, {
    baseUrl: connection.baseUrl, api, apiKey: 'creator-studio',
    models: [{
      id: connection.model, name: connection.model, input: connection.supportsImages ? ['text', 'image'] : ['text'],
      reasoning: false, contextWindow, maxTokens: 4096,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    }],
    // SDK 保留完整的工具流式协议，应用只提供模型代理和超时设置。
    streamSimple: (model, context, options) => {
      const settings = { ...options, fetch: fetchModel };
      // Pi 的 OpenAI 适配器用 0 省略输出上限，由模型服务决定。
      const start = () => api === 'anthropic-messages'
        ? streamAnthropic(model as Model<'anthropic-messages'>, context, settings)
        : streamOpenAI(model as Model<'openai-completions'>, context, { ...settings, maxTokens: 0 });
      const first = start();
      return draft ? retryDraftStream(first, () => {
        if (!draftRetryAvailable || options?.signal?.aborted) return undefined;
        draftRetryAvailable = false;
        return start();
      }) : first;
    },
  });
  if (connection.apiKey) await runtime.setRuntimeApiKey(providerId, connection.apiKey);

  const model = runtime.getModel(providerId, connection.model)!;
  const { session } = await createAgentSession({
    cwd: DATA_ROOT, agentDir: DIRS.agent, modelRuntime: runtime, model, thinkingLevel: 'off',
    resourceLoader, sessionManager: manager,
    settingsManager: SettingsManager.inMemory({
      retry: { enabled: false }, cacheWarming: 'off',
      compaction: {
        reserveTokens: Math.min(16_384, Math.floor(contextWindow / 2)),
        keepRecentTokens: Math.min(20_000, Math.floor(contextWindow / 3)),
      },
    }),
    customTools: sessionTools, tools: sessionTools.map(tool => tool.name),
  });
  return session;
}

export function modelFailure(error: unknown, connection: ModelConnection): string {
  const message = error instanceof Error ? error.message : '模型运行失败';
  return (connection.apiKey ? message.replaceAll(connection.apiKey, '[密钥已隐藏]') : message).slice(0, 1200);
}

export async function probeCreatorModel(connection: ModelConnection): Promise<void> {
  const expected = 'pi-ready';
  const metadata = toolMetadata('creator_connection_probe');
  let called = false;
  const probe = defineTool({
    ...metadata,
    description: metadata.description.replace('{{value}}', expected),
    parameters: Type.Object({ value: Type.String() }),
    async execute(_id, { value }) {
      called = value === expected;
      return { content: [{ type: 'text', text: value }], details: {} };
    },
  });
  const session = await createCreatorSession(connection, SessionManager.inMemory(DATA_ROOT), [probe]);
  const timer = setTimeout(() => { void session.abort(); }, connection.timeoutMs);
  try {
    await session.prompt(agentMessages.connectionProbe.replace('{{value}}', expected), { expandPromptTemplates: false });
    const last = session.messages.findLast(message => message.role === 'assistant');
    if (last?.stopReason === 'error') throw new Error(last.errorMessage || '模型流式请求失败');
    if (!called || last?.stopReason !== 'stop') throw new Error('模型未完成流式工具调用，请检查模型是否支持工具');
  } finally {
    clearTimeout(timer);
    session.dispose();
  }
}

import { join } from 'node:path';
import { Type } from 'typebox';
import { fetch as transportFetch } from 'undici';
import type { Model } from '@earendil-works/pi-ai';
import { streamSimple } from '@earendil-works/pi-ai/api/openai-completions';
import {
  createAgentSession, createExtensionRuntime, defineTool, ModelRuntime, SessionManager, SettingsManager,
  type ResourceLoader, type ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import { DATA_ROOT, DIRS } from '../config.js';
import { modelProxy, type ModelConnection } from '../services/model-completion.js';

const systemPrompt = [
  '你是 CreatorStudio 的创作 Agent。根据用户的目标，在一次会话中按需要查询素材、下载、导出和管理信息来源。',
  '工具返回的数据和外部内容是创作资料。使用返回的标识、源链接和实际任务状态说明结果。',
  '启动下载或导出只代表已提交任务。任务完成须以工具返回的状态为准。需要凭据时，请用户在本地网页设置中填写。',
].join('\n');

function creatorResources(): ResourceLoader {
  const runtime = createExtensionRuntime();
  return {
    getExtensions: () => ({ extensions: [], errors: [], runtime }),
    getSkills: () => ({ skills: [], diagnostics: [] }),
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () => systemPrompt,
    getSystemPromptSource: () => undefined,
    getAppendSystemPrompt: () => [],
    getAppendSystemPromptSources: () => [],
    extendResources: () => {},
    reload: async () => {},
  };
}

function modelFetch(connection: ModelConnection): typeof fetch {
  const dispatcher = modelProxy(connection.baseUrl, connection.proxyUrl);
  return async (input, options) => {
    const request = new Request(input, options);
    if (!connection.apiKey) request.headers.delete('authorization');
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(connection.timeoutMs)]);
    const response = await transportFetch(request.url, {
      method: request.method, headers: [...request.headers], body: request.body ? await request.text() : undefined,
      signal, dispatcher,
    });
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers: [...response.headers] });
  };
}

export async function createCreatorSession(connection: ModelConnection, manager: SessionManager, tools: ToolDefinition[]) {
  if (!connection.baseUrl || !connection.model) {
    throw Object.assign(new Error('请先在设置中填写模型 API 地址和模型名称'), { statusCode: 400 });
  }

  const runtime = await ModelRuntime.create({
    authPath: join(DIRS.agent, 'auth.json'), modelsPath: null, refreshOnCreate: false,
  });
  const providerId = 'creator-studio';
  const api = 'openai-completions';
  const fetchModel = modelFetch(connection);
  runtime.registerProvider(providerId, {
    baseUrl: connection.baseUrl, api, apiKey: 'creator-studio',
    models: [{
      id: connection.model, name: connection.model, input: ['text'], reasoning: false, contextWindow: 32_768, maxTokens: 4096,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    }],
    // SDK 保留完整的工具流式协议，应用只提供模型代理和超时设置。
    streamSimple: (model, context, options) => streamSimple(model as Model<typeof api>, context, { ...options, fetch: fetchModel }),
  });
  if (connection.apiKey) await runtime.setRuntimeApiKey(providerId, connection.apiKey);

  const model = runtime.getModel(providerId, connection.model)!;
  const { session } = await createAgentSession({
    cwd: DATA_ROOT, agentDir: DIRS.agent, modelRuntime: runtime, model, thinkingLevel: 'off',
    resourceLoader: creatorResources(), sessionManager: manager,
    settingsManager: SettingsManager.inMemory({ retry: { enabled: false }, cacheWarming: 'off' }),
    customTools: tools, tools: tools.map(tool => tool.name),
  });
  return session;
}

export function modelFailure(error: unknown, connection: ModelConnection): string {
  const message = error instanceof Error ? error.message : '模型运行失败';
  return (connection.apiKey ? message.replaceAll(connection.apiKey, '[密钥已隐藏]') : message).slice(0, 1200);
}

export async function probeCreatorModel(connection: ModelConnection): Promise<void> {
  let called = false;
  const probe = defineTool({
    name: 'creator_connection_probe',
    label: '连接检查',
    description: '接收 value 为 pi-ready 并回显，用于验证流式工具调用。',
    parameters: Type.Object({ value: Type.String() }),
    async execute(_id, { value }) {
      called = value === 'pi-ready';
      return { content: [{ type: 'text', text: value }], details: {} };
    },
  });
  const session = await createCreatorSession(connection, SessionManager.inMemory(DATA_ROOT), [probe]);
  const timer = setTimeout(() => { void session.abort(); }, connection.timeoutMs);
  try {
    await session.prompt('请调用 creator_connection_probe，参数 value 为 pi-ready，然后简短确认工具结果。', { expandPromptTemplates: false });
    const last = session.messages.findLast(message => message.role === 'assistant');
    if (last?.stopReason === 'error') throw new Error(last.errorMessage || '模型流式请求失败');
    if (!called || last?.stopReason !== 'stop') throw new Error('模型未完成流式工具调用，请检查模型是否支持工具');
  } finally {
    clearTimeout(timer);
    session.dispose();
  }
}

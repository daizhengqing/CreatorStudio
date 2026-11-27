import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { McpServer, fromJsonSchema, type JsonSchemaType } from '@modelcontextprotocol/server';
import { creatorTool, type ToolOutput } from '../agent/tools/tool.js';
import type { createTrendsService } from '../harness/trends/index.js';
import type { createXMonitorService } from '../harness/x-monitor/index.js';
import { createTrendMcpTools, createXMcpTools } from './collection-tools.js';

type CollectionTool = Pick<ReturnType<typeof creatorTool>, 'name' | 'label' | 'description' | 'parameters' | 'invoke' | 'invokeForModel'>;

const version = '0.1.0';

function createServer(name: string, tools: readonly CollectionTool[], forModel = false) {
  const server = new McpServer({ name, version });
  for (const tool of tools) {
    server.registerTool(tool.name, {
      title: tool.label,
      description: tool.description,
      inputSchema: fromJsonSchema(tool.parameters as JsonSchemaType),
    }, async (input, context) => {
      const invoke = forModel ? tool.invokeForModel : tool.invoke;
      const result = await invoke(input, context.mcpReq.signal);
      return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
    });
  }
  return server;
}

async function connect(name: string, definitions: CollectionTool[]) {
  const server = createServer(name, definitions, true);
  const client = new Client({ name: 'creator-studio', version });
  try {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const { tools } = await client.listTools();
    return { client, byName: new Map(tools.map(tool => [tool.name, tool])) };
  } catch (error) {
    await Promise.allSettled([client.close(), server.close()]);
    throw error;
  }
}

export async function createCollectionMcp(trends: ReturnType<typeof createTrendsService>, x: ReturnType<typeof createXMonitorService>) {
  const trend = createTrendMcpTools(trends);
  const monitor = createXMcpTools(x);
  const trendTools = trend.agent.filter(tool => tool.name !== 'list_new_trends');
  const xTools = monitor.agent.filter(tool => tool.name !== 'list_new_x_tweets');
  const trendsClient = await connect('creator-studio-trends', trendTools);
  const xClient = await connect('creator-studio-x-monitor', xTools).catch(async error => {
    await trendsClient.client.close();
    throw error;
  });
  const clients = new Map([
    ...[...trendsClient.byName.keys()].map(name => [name, trendsClient.client] as const),
    ...[...xClient.byName.keys()].map(name => [name, xClient.client] as const),
  ]);

  async function call(name: string, input: Record<string, unknown>, signal?: AbortSignal): Promise<ToolOutput> {
    const client = clients.get(name);
    if (!client) throw new Error('未找到 MCP 工具 ' + name);
    const result = await client.callTool({ name, arguments: input }, { signal });
    if (result.isError) {
      const message = result.content.find(item => item.type === 'text');
      throw new Error(message?.type === 'text' ? message.text : 'MCP 工具执行失败');
    }
    if (!result.structuredContent) throw new Error('MCP 工具未返回结构化结果');
    return result.structuredContent as ToolOutput;
  }

  const tools = [
    { available: trendsClient.byName, definitions: trendTools },
    { available: xClient.byName, definitions: xTools },
  ].flatMap(({ available, definitions }) => definitions.map(definition => {
    const tool = available.get(definition.name);
    if (!tool) throw new Error('MCP 未公布工具 ' + definition.name);
    return creatorTool(
      { name: tool.name, label: tool.title ?? definition.label, description: tool.description ?? definition.description },
      definition.parameters, (input, signal) => call(tool.name, input as Record<string, unknown>, signal),
    );
  }));

  return {
    tools,
    servers: {
      trends: () => createServer('creator-studio-trends', [...trend.agent, ...trend.settings]),
      xMonitor: () => createServer('creator-studio-x-monitor', [...monitor.agent, ...monitor.settings]),
    },
    async close() { await Promise.all([trendsClient.client.close(), xClient.client.close()]); },
  };
}

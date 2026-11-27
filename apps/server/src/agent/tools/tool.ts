import { defineTool } from '@earendil-works/pi-coding-agent';
import type { Static, TSchema } from 'typebox';
import type { ToolReference } from '@creator-studio/contracts';
import type { ToolMetadata } from '../content.js';

export type ToolOutput<Data = unknown> = { data: Data; summary: string; references?: ToolReference[]; terminate?: boolean };

export function creatorTool<Schema extends TSchema, Response extends ToolOutput>(
  { name, label, description }: ToolMetadata, parameters: Schema,
  run: (input: Static<Schema>, signal?: AbortSignal) => Response | Promise<Response>,
  project?: (data: NoInfer<Response['data']>) => unknown,
) {
  // Pi 和 MCP 各自校验工具参数，共享同一份工具实现。
  const invoke = (input: unknown, signal?: AbortSignal) => run(input as Static<Schema>, signal);
  async function invokeForModel(input: unknown, signal?: AbortSignal): Promise<ToolOutput> {
    const result = await invoke(input, signal);
    return project ? { ...result, data: project(result.data) } : result;
  }
  return Object.assign(defineTool({
    name, label, description, parameters, executionMode: 'sequential',
    async execute(_callId, input, signal) {
      const { data, summary, references = [], terminate } = await invokeForModel(input, signal);
      return { content: [{ type: 'text', text: JSON.stringify(data) }], details: { label, summary, references }, terminate };
    },
  }), { invoke, invokeForModel });
}

export function requiredResult<T>(value: T | null | undefined, message: string): T {
  if (value == null) throw new Error(message);
  return value;
}

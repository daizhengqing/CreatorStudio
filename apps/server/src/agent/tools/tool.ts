import { defineTool } from '@earendil-works/pi-coding-agent';
import type { Static, TSchema } from 'typebox';
import type { ToolReference } from '@creator-studio/contracts';

export type ToolOutput = { data: unknown; summary: string; references?: ToolReference[] };

export function creatorTool<Schema extends TSchema>(
  name: string, label: string, description: string, parameters: Schema,
  run: (input: Static<Schema>, signal?: AbortSignal) => ToolOutput | Promise<ToolOutput>,
) {
  // Pi 和 MCP 各自校验工具参数，共享同一份工具实现。
  const invoke = (input: unknown, signal?: AbortSignal) => run(input as Static<Schema>, signal);
  return Object.assign(defineTool({
    name, label, description, parameters, executionMode: 'sequential',
    async execute(_callId, input, signal) {
      const { data, summary, references = [] } = await invoke(input, signal);
      return { content: [{ type: 'text', text: JSON.stringify(data) }], details: { label, summary, references } };
    },
  }), { invoke });
}

export function requiredResult<T>(value: T | null | undefined, message: string): T {
  if (value == null) throw new Error(message);
  return value;
}

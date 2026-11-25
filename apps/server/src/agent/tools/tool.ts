import { defineTool } from '@earendil-works/pi-coding-agent';
import type { Static, TSchema } from 'typebox';
import type { ToolReference } from '@creator-studio/contracts';

type ToolOutput = { data: unknown; summary: string; references?: ToolReference[] };

export function creatorTool<Schema extends TSchema>(
  name: string, label: string, description: string, parameters: Schema,
  run: (input: Static<Schema>, signal?: AbortSignal) => ToolOutput | Promise<ToolOutput>,
) {
  return defineTool({
    name, label, description, parameters, executionMode: 'sequential',
    async execute(_callId, input, signal) {
      const { data, summary, references = [] } = await run(input, signal);
      return { content: [{ type: 'text', text: JSON.stringify(data) }], details: { summary, references } };
    },
  });
}

export function requiredResult<T>(value: T | null | undefined, message: string): T {
  if (value == null) throw new Error(message);
  return value;
}

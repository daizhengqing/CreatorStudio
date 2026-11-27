import { readFileSync } from 'node:fs';
import type messagesFile from './content/messages.json';
import type toolMetadataFile from './content/tool-metadata.json';

// 开发和生产均从服务模块旁的 content 目录读取。
export const agentContentDirectory = new URL('./content/', import.meta.url);

function readContent(file: string) {
  return readFileSync(new URL(file, agentContentDirectory), 'utf8');
}

export const agentInstructions = readContent('AGENTS.md').trimEnd();
export const xDraftWorkflow = readContent('workflows/x-drafts.md').trimEnd();
export const agentMessages = JSON.parse(readContent('messages.json')) as typeof messagesFile;
export const toolText = JSON.parse(readContent('tool-metadata.json')) as typeof toolMetadataFile;

export type ToolMetadata = { name: string; label: string; description: string };

export function toolMetadata(name: keyof typeof toolText.tools): ToolMetadata {
  const { label, description } = toolText.tools[name];
  return { name, label, description };
}

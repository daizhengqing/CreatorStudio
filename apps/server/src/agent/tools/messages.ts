import { Type } from 'typebox';
import type { createMessageService } from '../../harness/messages.js';
import { toolMetadata } from '../content.js';
import { creatorTool } from './tool.js';

export function createMessageTool(messages: ReturnType<typeof createMessageService>) {
  return creatorTool(toolMetadata('get_messages'),
    Type.Object({
      source: Type.Optional(Type.Union([Type.Literal('trends'), Type.Literal('x')])),
      keyword: Type.Optional(Type.String()),
      limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 24 })),
    }), input => {
      const items = messages.list(input);
      return { data: { items }, summary: `返回 ${items.length} 条消息` };
    });
}

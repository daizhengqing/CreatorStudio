import { Type } from 'typebox';
import { toolText } from '../../agent/content.js';

const descriptions = toolText.parameters.schedule;

export const scheduleInputSchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 100 }),
  prompt: Type.String({ minLength: 1, maxLength: 12_000, description: descriptions.prompt }),
  kind: Type.Union([Type.Literal('instruction'), Type.Literal('x-drafts')], {
    description: descriptions.kind,
  }),
  intervalMinutes: Type.Integer({ minimum: 1, maximum: 525_600, description: descriptions.intervalMinutes }),
  enabled: Type.Boolean({ description: descriptions.enabled }),
});

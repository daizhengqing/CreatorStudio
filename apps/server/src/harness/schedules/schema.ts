import { Type } from 'typebox';

export const scheduleInputSchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 100 }),
  prompt: Type.String({ minLength: 1, maxLength: 12_000, description: '每次运行时使用的完整指令。每次定时执行会打开新会话。' }),
  kind: Type.Union([Type.Literal('instruction'), Type.Literal('x-drafts')], {
    description: 'instruction 定时执行通用指令，x-drafts 从新增热点和 X 推文生成待审草稿。',
  }),
  intervalMinutes: Type.Integer({ minimum: 1, maximum: 525_600, description: '重复执行的间隔，以分钟为单位。' }),
  enabled: Type.Boolean({ description: '启用后第一次运行安排在一个间隔之后，false 表示先保存为暂停状态。' }),
});

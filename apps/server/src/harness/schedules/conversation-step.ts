import type { ScheduledConversationTrace } from '@creator-studio/contracts';

type StepResult<T> = { value: T; summary: string; text?: string };

export async function runConversationStep<T>(
  trace: ScheduledConversationTrace, label: string, work: () => StepResult<T> | Promise<StepResult<T>>,
): Promise<T> {
  const step = trace.beginStep(label);
  try {
    const { value, summary, text } = await work();
    step.complete(summary, text);
    return value;
  } catch (error) {
    step.fail(error instanceof Error ? error.message : '执行失败');
    throw error;
  }
}

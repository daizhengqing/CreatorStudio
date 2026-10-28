import { createContext, useMemo } from 'react';
import { usePlugin } from '../../context';
import type { TrendsApi } from '../contracts';

export const TopicDraftContext = createContext<{
  values: Record<string, string>;
  update: (itemId: string, note: string | undefined) => void;
} | null>(null);

export function useTrendsApi() {
  const { sdk } = usePlugin();
  return useMemo(() => sdk.plugins.client<TrendsApi>('studio.trends'), [sdk]);
}

const dateFormat = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
});

export function formatDate(value: number | null): string {
  return value === null ? '尚未获取' : dateFormat.format(new Date(value));
}

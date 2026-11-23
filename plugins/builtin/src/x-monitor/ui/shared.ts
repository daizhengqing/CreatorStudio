import { useMemo } from 'react';
import { X_MONITOR_PLUGIN_ID, type XMonitorTarget, type XMonitorTweetKind } from '@creator-studio/plugin-sdk/x-monitor';
import { usePlugin } from '../../context';
import type { XMonitorApi } from '../contracts';

export const queryRoot = 'x-monitor';
export const dateTime = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
});

export const kindNames: Record<XMonitorTweetKind, string> = { original: '原创', quote: '引用', repost: '转发' };
export const targetStates: Record<XMonitorTarget['state'], string> = {
  scheduled: '已安排', collecting: '采集中', paused: '已暂停', removed: '已移除',
  needs_auth: '需要登录', rate_limited: '请求受限', runtime_missing: '缺少 Python 依赖', error: '采集失败',
};

export function useMonitorApi() {
  const { sdk } = usePlugin();
  return useMemo(() => sdk.plugins.client<XMonitorApi>(X_MONITOR_PLUGIN_ID), [sdk]);
}

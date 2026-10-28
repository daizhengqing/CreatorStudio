import type { ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { WindowMount } from '@creator-studio/plugin-sdk/browser';
import { PluginContext } from './context';
import './windows.css';

export function reactWindow(View: ComponentType): WindowMount {
  return (container, context) => {
    const root = createRoot(container);
    const client = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 3000 } } });
    const subscriptions = ['assets', 'downloads', 'exports'].map(type => context.sdk.events.subscribe(`media.${type}.changed`, () => {
      void client.invalidateQueries({ queryKey: [type] });
    }));
    // 提交窗口接口后再通知宿主挂载完成，open() 后即可立即调用。
    flushSync(() => root.render(<QueryClientProvider client={client}><PluginContext value={context}><View /></PluginContext></QueryClientProvider>));
    return () => { subscriptions.forEach(dispose => dispose()); root.unmount(); client.clear(); };
  };
}

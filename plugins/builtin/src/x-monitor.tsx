import type { FrontendPlugin } from '@creator-studio/plugin-sdk/browser';
import { reactWindow } from './mount';
import { XMonitorWindow } from './x-monitor/ui/XMonitorWindow';
import './x-monitor/ui/x-monitor.css';

export default { windows: { main: reactWindow(XMonitorWindow) } } satisfies FrontendPlugin;

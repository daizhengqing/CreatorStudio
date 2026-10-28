import type { FrontendPlugin } from '@creator-studio/plugin-sdk/browser';
import { reactWindow } from './mount';
import { ExportWindow } from './windows/ExportWindow';

export default { windows: { main: reactWindow(ExportWindow) } } satisfies FrontendPlugin;

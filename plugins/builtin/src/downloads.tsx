import type { FrontendPlugin } from '@creator-studio/plugin-sdk/browser';
import { reactWindow } from './mount';
import { DownloadWindow } from './windows/DownloadWindow';

export default { windows: { main: reactWindow(DownloadWindow) } } satisfies FrontendPlugin;

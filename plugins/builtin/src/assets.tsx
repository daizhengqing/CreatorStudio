import type { FrontendPlugin } from '@creator-studio/plugin-sdk/browser';
import { reactWindow } from './mount';
import { AssetWindow } from './windows/AssetWindow';

export default { windows: { main: reactWindow(AssetWindow) } } satisfies FrontendPlugin;

import type { FrontendPlugin } from '@creator-studio/plugin-sdk/browser';
import { reactWindow } from './mount';
import { InspectorWindow } from './windows/InspectorWindow';

export default { windows: { main: reactWindow(InspectorWindow) } } satisfies FrontendPlugin;

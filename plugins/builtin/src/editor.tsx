import type { FrontendPlugin } from '@creator-studio/plugin-sdk/browser';
import { reactWindow } from './mount';
import { EditorWindow } from './windows/EditorWindow';

export default { windows: { main: reactWindow(EditorWindow) } } satisfies FrontendPlugin;

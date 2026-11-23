import type { FrontendPlugin } from '@creator-studio/plugin-sdk/browser';
import { reactWindow } from './mount';
import { ModelSettingsWindow } from './windows/ModelSettingsWindow';
import './windows/ModelSettingsWindow.css';

export default { windows: { main: reactWindow(ModelSettingsWindow) } } satisfies FrontendPlugin;

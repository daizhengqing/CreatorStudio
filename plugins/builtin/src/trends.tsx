import type { FrontendPlugin } from '@creator-studio/plugin-sdk/browser';
import { reactWindow } from './mount';
import { TrendsWindow } from './trends/ui/TrendsWindow';
import './trends/ui/trends.css';

export default { windows: { main: reactWindow(TrendsWindow) } } satisfies FrontendPlugin;

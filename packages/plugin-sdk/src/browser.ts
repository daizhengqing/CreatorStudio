import type { MediaApi } from './media.js';
import type {
  ApiPublisher, ApiRouter, Dispose, JsonValue, PluginEvents,
  PluginStorage, ReadableValue, WindowHandle,
} from './index.js';

export type WindowApi = ApiRouter & {
  open(viewId: string, input?: JsonValue): Promise<WindowHandle>;
  list(viewId?: string): WindowHandle[];
  focus(id: string): void;
  close(id: string): void;
};
export type BrowserSDK = {
  pluginId: string;
  media: MediaApi & { upload(file: File): Promise<{ id: string }> };
  selection: ReadableValue<string | null> & { set(assetId: string | null): void };
  windows: WindowApi;
  plugins: ApiRouter;
  events: PluginEvents;
  storage: PluginStorage;
};
export type WindowContext = {
  sdk: BrowserSDK;
  window: WindowHandle & ApiPublisher & { input: ReadableValue<JsonValue> };
};
export type WindowMount = (container: HTMLElement, context: WindowContext) => Dispose | Promise<Dispose>;
export type FrontendPlugin = {
  activate?(sdk: BrowserSDK): void | Dispose | Promise<void | Dispose>;
  windows: Record<string, WindowMount>;
};

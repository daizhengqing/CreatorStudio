import type { Asset, MediaApi } from './media.js';
import type { ApiPublisher, ApiRouter, Dispose, PluginEvents, PluginStorage } from './index.js';

export type ServerContext = {
  pluginId: string;
  /** 插件自己的持久化目录，由宿主创建。 */
  readonly dataDirectory: string;
  media: MediaApi & { importFile(path: string): Promise<Asset> };
  api: ApiPublisher;
  plugins: ApiRouter;
  events: PluginEvents;
  storage: PluginStorage;
};
export type BackendPlugin = {
  activate(context: ServerContext): void | Dispose | Promise<void | Dispose>;
};

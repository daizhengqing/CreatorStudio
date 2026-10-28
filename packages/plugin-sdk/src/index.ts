export * from './media.js';

export const SDK_VERSION = 1;
export type Dispose = () => void;
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type ApiContract = Record<string, { input: unknown; output: unknown }>;
export type ApiHandlers<C extends ApiContract> = {
  [K in keyof C]: (input: C[K]['input']) => C[K]['output'] | Promise<C[K]['output']>;
};
export type ApiClient<C extends ApiContract> = {
  call<K extends keyof C & string>(method: K, input: C[K]['input']): Promise<C[K]['output']>;
};
export type ApiCaller = (target: string, method: string, input: unknown) => Promise<unknown>;
export type ApiRouter = {
  call: ApiCaller;
  client<C extends ApiContract>(target: string): ApiClient<C>;
};
export type ApiPublisher = {
  expose<C extends ApiContract>(handlers: ApiHandlers<C>): Dispose;
};
export type ReadableValue<T> = {
  getSnapshot(): T;
  subscribe(listener: () => void): Dispose;
};
export type EventMessage = { topic: string; payload: JsonValue };
export type PluginEvents = {
  emit(topic: string, payload: JsonValue): Promise<void>;
  subscribe<T extends JsonValue>(topic: string, listener: (payload: T) => void): Dispose;
};
export type PluginStorage = {
  get<T extends JsonValue>(key: string): Promise<T | undefined>;
  set(key: string, value: JsonValue): Promise<void>;
  delete(key: string): Promise<void>;
};
export type WindowDefinition = {
  id: string;
  title: string;
  singleton: boolean;
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  toolbar?: string;
  actions?: { title: string; method: string; input: JsonValue }[];
  defaultSlot?: 'left' | 'center' | 'right-top' | 'right-bottom';
};
export type PluginManifest = {
  id: string;
  name: string;
  version: string;
  sdkVersion: number;
  frontend?: string;
  styles?: string[];
  backend?: string;
  windows: WindowDefinition[];
};
export type PluginInfo = {
  manifest: PluginManifest;
  frontendUrl?: string;
  styleUrls: string[];
};
export type WindowHandle = { id: string; viewId: string };
export type WindowRecord = WindowHandle & {
  title: string;
  input: JsonValue;
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
  minimized: boolean;
};

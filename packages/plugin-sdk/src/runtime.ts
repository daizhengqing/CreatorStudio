import type { ApiCaller, ApiClient, ApiContract, ApiHandlers, Dispose, EventMessage, JsonValue } from './index.js';

export function createApiClient<C extends ApiContract>(target: string, call: ApiCaller): ApiClient<C> {
  return { call: (method, input) => call(target, method, input) as Promise<C[typeof method]['output']> };
}

export function createApiRegistry() {
  type Handler = (input: unknown) => unknown;
  const targets = new Map<string, Map<string, Handler>>();
  return {
    expose<C extends ApiContract>(target: string, handlers: ApiHandlers<C>): Dispose {
      if (targets.has(target)) throw new Error(`接口已注册：${target}`);
      // 泛型契约在注册边界擦除，调用端通过同一契约恢复输入输出类型。
      targets.set(target, new Map(Object.entries(handlers as Record<string, Handler>)));
      return () => { targets.delete(target); };
    },
    async call(target: string, method: string, input: unknown): Promise<unknown> {
      const handler = targets.get(target)?.get(method);
      if (!handler) throw new Error(`接口不存在：${target}.${method}`);
      return await handler(input);
    },
  };
}

export function createEventBus() {
  const listeners = new Map<string, Set<(payload: JsonValue) => void>>();
  const observers = new Set<(message: EventMessage) => void>();
  return {
    subscribe<T extends JsonValue>(topic: string, listener: (payload: T) => void): Dispose {
      const set = listeners.get(topic) ?? new Set();
      const handler = listener as (payload: JsonValue) => void;
      set.add(handler);
      listeners.set(topic, set);
      return () => {
        set.delete(handler);
        if (!set.size) listeners.delete(topic);
      };
    },
    observe(listener: (message: EventMessage) => void): Dispose {
      observers.add(listener);
      return () => { observers.delete(listener); };
    },
    dispatch(message: EventMessage): void {
      for (const listener of listeners.get(message.topic) ?? []) listener(message.payload);
      for (const observer of observers) observer(message);
    },
  };
}

// 作用域统一回收窗口或插件创建的注册项；手动提前释放也不会重复清理。
export function createScope() {
  const disposers = new Set<Dispose>();
  let disposed = false;
  return {
    add(dispose: Dispose): Dispose {
      if (disposed) { dispose(); return () => {}; }
      const release = () => { if (disposers.delete(release)) dispose(); };
      disposers.add(release);
      return release;
    },
    dispose(): void { disposed = true; for (const dispose of [...disposers].reverse()) dispose(); },
  };
}

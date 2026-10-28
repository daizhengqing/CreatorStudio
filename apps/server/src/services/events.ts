import type { ServerResponse } from 'node:http';
import type { PluginEvents } from '@creator-studio/plugin-sdk';
import { createEventBus } from '@creator-studio/plugin-sdk/runtime';

const clients = new Set<ServerResponse>();
const bus = createEventBus();
export const events: PluginEvents = {
  subscribe: bus.subscribe,
  async emit(topic, payload) { bus.dispatch({ topic, payload }); },
};
bus.observe(message => {
  for (const client of clients) client.write(`event: studio\ndata: ${JSON.stringify(message)}\n\n`);
});
export function addClient(res: ServerResponse): void { clients.add(res); }
export function removeClient(res: ServerResponse): void { clients.delete(res); }
export function closeClients(): void { for (const client of clients) client.end(); clients.clear(); }
export function publish(type: 'assets' | 'downloads' | 'exports'): void {
  void events.emit(`media.${type}.changed`, null);
}

import type { ServerResponse } from 'node:http';

const clients = new Set<ServerResponse>();
export function addClient(res: ServerResponse): void { clients.add(res); }
export function removeClient(res: ServerResponse): void { clients.delete(res); }
export function publish(type: 'assets' | 'downloads' | 'exports'): void {
  for (const client of clients) {
    try { client.write(`event: changed\ndata: ${JSON.stringify({ type })}\n\n`); }
    catch { clients.delete(client); }
  }
}

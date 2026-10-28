import type { BackendPlugin } from '@creator-studio/plugin-sdk/server';
import type { NotesApi } from './contracts.js';

export default {
  activate({ api, media, storage, events }) {
    return api.expose<NotesApi>({
      async load({ assetId }) {
        const asset = (await media.assets()).find(asset => asset.id === assetId);
        if (!asset) throw new Error('素材不存在');
        return { name: asset.name, note: (await storage.get<string>(`note:${assetId}`)) ?? '' };
      },
      async save({ assetId, note }) {
        await storage.set(`note:${assetId}`, note);
        await events.emit('example.asset-notes.saved', { assetId, note });
        return { saved: true };
      },
    });
  },
} satisfies BackendPlugin;

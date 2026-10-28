export type NotesApi = {
  load: { input: { assetId: string }; output: { name: string; note: string } };
  save: { input: { assetId: string; note: string }; output: { saved: boolean } };
};
export type NotesWindowApi = {
  setNote: { input: { note: string }; output: null };
  getNote: { input: null; output: string };
};

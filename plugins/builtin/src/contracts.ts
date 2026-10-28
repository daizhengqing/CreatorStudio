export type AssetWindowApi = {
  importFiles: { input: null; output: null };
  selectAsset: { input: { assetId: string }; output: null };
  getSelection: { input: null; output: string | null };
};
export type EditorApi = {
  loadAsset: { input: { assetId: string }; output: null };
  seek: { input: { seconds: number }; output: null };
  play: { input: null; output: null };
  pause: { input: null; output: null };
  getState: { input: null; output: { assetId: string | null; cursor: number; playing: boolean } };
};
export type InspectorApi = {
  showAsset: { input: { assetId: string }; output: null };
};
export type DownloadWindowApi = {
  focusInput: { input: null; output: null };
  preview: { input: { url: string }; output: null };
};
export type ExportWindowApi = { refresh: { input: null; output: null } };

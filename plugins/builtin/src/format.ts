export function friendlySize(bytes: number): string {
  return bytes > 1_073_741_824 ? `${(bytes / 1_073_741_824).toFixed(2)} GB` : `${(bytes / 1_048_576).toFixed(1)} MB`;
}
export function friendlyTime(seconds: number | null): string {
  if (seconds === null) return '—';
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

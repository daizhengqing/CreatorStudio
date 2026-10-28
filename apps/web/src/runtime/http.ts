export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const payload = await response.json() as { message?: string; error?: string };
    throw new Error(payload.message ?? payload.error ?? `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}
export const json = (body: unknown, method = 'POST'): RequestInit => ({
  method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

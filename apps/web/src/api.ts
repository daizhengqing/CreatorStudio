export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) {
    const error = `后端请求失败（HTTP ${response.status}）`;
    // 开发代理连不上后端时返回空响应，Fastify 的业务错误则有 JSON 正文。
    if (!response.headers.get('content-type')?.startsWith('application/json')) throw new Error(error);
    const body = await response.json() as { error?: string; message?: string };
    throw new Error(body.message ?? body.error ?? error);
  }
  return response.status === 204 ? (undefined as T) : response.json() as Promise<T>;
}

export function json(method: 'POST' | 'PUT' | 'PATCH', value: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) };
}

export function messageOf(error: unknown) {
  return error instanceof Error ? error.message : '操作失败，请稍后重试';
}

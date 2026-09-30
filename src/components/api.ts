'use client';

// Session token kept in memory only (never localStorage): used as a Bearer
// header when the browser blocks the partitioned cookie inside the iframe.
let memoryToken: string | null = null;
export function setMemoryToken(t: string | null) {
  memoryToken = t;
}

export class ApiError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { 'x-compass-request': '1' };
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  if (memoryToken) headers.Authorization = `Bearer ${memoryToken}`;
  const res = await fetch(path, {
    method: init.method ?? 'GET',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    credentials: 'same-origin',
    cache: 'no-store',
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const code = (data as { error?: string } | null)?.error ?? `http_${res.status}`;
    throw new ApiError(res.status, code);
  }
  return data as T;
}

export interface Entity {
  id: string;
  name?: string;
  status?: string;
  points?: number;
  tags?: string[];
  source_type?: string;
  source_uri?: string;
  file_type?: string;
  error?: string;
  [key: string]: unknown;
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(`/api/v1${path}`, {
    ...options,
    headers,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || `Ошибка HTTP ${response.status}`);
  }
  return response.status === 204 ? undefined as T : response.json();
}

export function save<T>(path: string, method: string, body?: unknown) {
  if (body instanceof FormData) return request<T>(path, { method, body });
  if (body instanceof Blob) {
    return request<T>(path, { method, body, headers: { 'Content-Type': 'application/octet-stream' } });
  }
  return request<T>(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

export const fileURL = (id: string) => `/api/v1/downloads/${encodeURIComponent(id)}/file`;
export const pretty = (value: unknown) => JSON.stringify(value, null, 2);
export const date = (value: unknown) => value ? new Date(String(value)).toLocaleString('ru-RU') : '—';

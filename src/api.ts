export interface Entity {
  id: string;
  name?: string;
  status?: string;
  yt_plays?: number | null;
  yt_subs?: number | null;
  asked?: number;
  guessed?: number;
  excluded_from_quiz?: boolean;
  missing_fields?: string[];
  audio_status?: string;
  downloader?: string;
  preview?: boolean;
  tags?: string[];
  source_type?: string;
  source_uri?: string;
  file_type?: string;
  error?: string;
  [key: string]: unknown;
}

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

async function apiResponse(url: string, options: RequestInit) {
  const response = await fetch(url, options);
  if (!response.ok) {
    if (response.status === 401 && url !== '/api/v1/auth/me' && url !== '/api/v1/auth/login') window.dispatchEvent(new Event('quiz:unauthorized'));
    const body = await response.json().catch(() => null);
    throw new ApiError(body?.error || `Ошибка HTTP ${response.status}`, response.status);
  }
  return response;
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await apiResponse(`/api/v1${path}`, { ...options, headers });
  return response.status === 204 ? undefined as T : response.json();
}

export async function requestBlob(url: string, signal: AbortSignal) {
  const response = await apiResponse(url, { signal });
  const blob = await response.blob();
  if (!blob.size) throw new Error('Сервер вернул пустой файл');
  return blob;
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

export const formatCount = (value?: number | null) => value == null ? '—' : value.toLocaleString('ru-RU');
export function guessRate({ asked = 0, guessed = 0 }: Entity) {
  return asked ? `${guessed} / ${asked} · ${Math.round(guessed / asked * 100)}%` : '0 / 0';
}

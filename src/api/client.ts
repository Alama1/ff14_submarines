interface RuntimeEnv {
  VITE_API_URL?: string;
}

declare global {
  interface Window {
    env?: RuntimeEnv;
  }
}

export const getEnv = (key: keyof RuntimeEnv): string => {
  return window.env?.[key] || (import.meta.env[key] as string) || '';
};

/** Base URL of the backend gateway, e.g. https://api.submarines.alamai.dev/api */
export const API_BASE_URL =
  getEnv('VITE_API_URL').replace(/\/+$/, '') || 'https://api.submarines.alamai.dev/api';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

interface ErrorBody {
  message?: string | string[];
  error?: string;
  statusCode?: number;
}

async function parseErrorBody(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as ErrorBody;
    if (Array.isArray(body.message)) return body.message.join(', ');
    if (body.message) return body.message;
    if (body.error) return body.error;
  } catch {
    /* ignore malformed bodies */
  }
  return `Request failed with status ${res.status}`;
}

export interface ApiRequestInit {
  method?: string;
  body?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export async function apiRequest<T>(path: string, init?: ApiRequestInit): Promise<T> {
  const { timeoutMs = 15000, ...rest } = init ?? {};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...rest,
      signal: controller.signal,
      headers: {
        ...(rest.body ? { 'Content-Type': 'application/json' } : {}),
        ...(rest.headers ?? {}),
      },
    });
  } catch (e: unknown) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new ApiError(0, 'The request timed out. Please try again.');
    }
    throw new ApiError(0, 'Could not reach the server. Check your connection and try again.');
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new ApiError(res.status, await parseErrorBody(res));
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return apiRequest<T>(path, { method: 'GET' });
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>(path, {
    method: 'POST',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export interface ApiErrorBody {
  error?: { code?: string; message?: string; details?: unknown };
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }

  /** Per-field messages produced by the shared zod schemas on the API. */
  get fieldErrors(): Record<string, string> {
    const value = (this.details as { fieldErrors?: Record<string, string> } | undefined)
      ?.fieldErrors;
    return value ?? {};
  }
}

type SessionAudience = 'member' | 'admin';
type Audience = SessionAudience | 'none';

export interface ApiFetchOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  auth?: Audience;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

/**
 * Endpoints that issue or end a session never trigger a refresh-and-retry
 * (a wrong OTP or password must surface as-is, and refresh must not loop).
 * `/auth/me` and `/admin/auth/me` are deliberately refreshable.
 */
function isAuthEndpoint(path: string): boolean {
  const authPath = path.startsWith('/admin/auth/') || path.startsWith('/auth/');
  return authPath && !path.endsWith('/auth/me');
}

/**
 * One refresh in flight per audience: concurrent 401s share it, so a page that
 * fires several requests at once rotates the refresh token exactly once.
 */
type RefreshResult = 'refreshed' | 'race' | 'failed';
const refreshing: Partial<Record<SessionAudience, Promise<RefreshResult>>> = {};
const loggingOut: Partial<Record<SessionAudience, Promise<Response>>> = {};

function refreshSession(audience: SessionAudience): Promise<RefreshResult> {
  const existing = refreshing[audience];
  if (existing) return existing;
  const endpoint = audience === 'admin' ? '/api/v1/admin/auth/refresh' : '/api/v1/auth/refresh';
  const attempt = fetch(endpoint, { method: 'POST', credentials: 'same-origin' })
    .then(async (response): Promise<RefreshResult> => {
      if (response.ok) return 'refreshed';
      if (response.status === 401) {
        const body = (await response.json()) as ApiErrorBody | null;
        const details = body?.error?.details as { refreshRace?: boolean } | undefined;
        if (details?.refreshRace === true) return 'race';
      }
      return 'failed';
    })
    .catch(() => 'failed' as const)
    .finally(() => {
      delete refreshing[audience];
    });
  refreshing[audience] = attempt;
  return attempt;
}

function sendLogout(audience: SessionAudience, url: string, init: RequestInit): Promise<Response> {
  // Wait for Set-Cookie from any pending refresh before sending the logout cookie.
  // Mark logout as pending so a concurrent 401 cannot start a new rotation.
  const existing = loggingOut[audience];
  if (existing) return existing.then((response) => response.clone());
  const logout = Promise.all([refreshing.member, refreshing[audience]])
    .then(() => fetch(url, init))
    .finally(() => {
      delete loggingOut[audience];
    });
  loggingOut[audience] = logout;
  return logout.then((response) => response.clone());
}

/**
 * Sends a protected request, refreshing the access cookie at most once on 401.
 */
async function sendWithRefresh(path: string, init: RequestInit): Promise<Response> {
  const url = `/api/v1${path}`;
  const audience = path.startsWith('/admin/') ? 'admin' : 'member';
  if (init.method === 'POST' && (path === '/auth/logout' || path === '/admin/auth/logout')) {
    return sendLogout(audience, url, init);
  }

  const response = await fetch(url, init);
  if (response.status !== 401 || isAuthEndpoint(path) || loggingOut[audience]) return response;

  const result = await refreshSession(audience);
  if (loggingOut[audience]) return response;
  if (result === 'refreshed') return fetch(url, init);
  if (result === 'race') {
    // The winning tab may still be receiving its cookies. Retry only the
    // protected request so we cannot replay a stale refresh token again.
    for (const delay of [100, 250, 500]) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      if (loggingOut[audience] || init.signal?.aborted) break;
      const retry = await fetch(url, init);
      if (retry.status !== 401) return retry;
    }
  }
  return response;
}

/**
 * Browser client for the proxied API. Cookies are sent automatically because
 * every call is same-origin (`/api/v1/...` is rewritten by Next.js).
 */
export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { method = 'GET', body, signal, headers = {} } = options;

  let response: Response;
  try {
    response = await sendWithRefresh(path, {
      method,
      credentials: 'same-origin',
      signal,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new ApiError('NETWORK_ERROR', 'Could not reach KodeCupid. Check your connection.', 0);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    const errorBody = (payload as ApiErrorBody | null)?.error;
    throw new ApiError(
      errorBody?.code ?? 'UNKNOWN_ERROR',
      errorBody?.message ?? 'Something went wrong. Please try again.',
      response.status,
      errorBody?.details,
    );
  }

  return payload as T;
}

/** Multipart upload (photos) — no JSON content type so the browser sets the boundary. */
export async function apiUpload<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append('file', file);

  let response: Response;
  try {
    response = await sendWithRefresh(path, {
      method: 'POST',
      credentials: 'same-origin',
      body: form,
    });
  } catch {
    throw new ApiError('NETWORK_ERROR', 'Could not reach KodeCupid. Check your connection.', 0);
  }

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    const errorBody = (payload as ApiErrorBody | null)?.error;
    throw new ApiError(
      errorBody?.code ?? 'UPLOAD_FAILED',
      errorBody?.message ?? 'That photo could not be uploaded.',
      response.status,
      errorBody?.details,
    );
  }

  return payload as T;
}

export function errorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

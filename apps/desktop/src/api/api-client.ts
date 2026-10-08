import { parseDesktopEnv } from '@personal-os/shared';
import type { Auth } from '../auth/auth';

/** A failed call to the backend. The message is safe to show to the user. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export interface RequestOptions {
  body?: unknown;
  query?: Record<string, string | number | boolean | readonly string[] | undefined>;
}

/** The part of the backend client the app uses. Tests pass a fake with the same shape. */
export interface ApiClient {
  request: <T>(method: string, path: string, options?: RequestOptions) => Promise<T>;
}

export interface ApiClientOptions {
  /** Where the backend lives, e.g. http://127.0.0.1:3000/api/v1 */
  baseUrl: string;
  /** The login token to send, or null when signed out. */
  getToken: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
}

const NETWORK_MESSAGE = 'Cannot reach the server. Check that it is running and try again.';

function queryString(query: RequestOptions['query']): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) params.append(key, String(item));
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

async function errorFrom(response: Response): Promise<ApiError> {
  try {
    const json = (await response.json()) as { error?: { code?: string; message?: string } };
    if (json.error?.code && json.error.message) {
      return new ApiError(response.status, json.error.code, json.error.message);
    }
  } catch {
    // Not JSON: fall through to the generic message.
  }
  return new ApiError(
    response.status,
    'http_error',
    `The server answered ${String(response.status)}.`,
  );
}

/** Calls the backend with the login token. Errors are ApiError with the server's code and message. */
export function createApiClient({ baseUrl, getToken, fetchImpl }: ApiClientOptions): ApiClient {
  const base = baseUrl.replace(/\/+$/, '');

  return {
    request: async <T>(method: string, path: string, options: RequestOptions = {}) => {
      const token = await getToken();
      if (!token) throw new ApiError(401, 'unauthorized', 'Sign in again to continue.');

      const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
      if (options.body !== undefined) headers['Content-Type'] = 'application/json';

      let response: Response;
      try {
        response = await (fetchImpl ?? fetch)(`${base}${path}${queryString(options.query)}`, {
          method,
          headers,
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
        });
      } catch {
        throw new ApiError(0, 'network', NETWORK_MESSAGE);
      }

      if (!response.ok) throw await errorFrom(response);
      return (await response.json()) as T;
    },
  };
}

/** Builds the client from the Vite env. If VITE_API_URL is missing, every call fails clearly. */
export function createApiFromEnv(raw: Record<string, unknown>, auth: Auth): ApiClient {
  const result = parseDesktopEnv(raw);
  if (!result.ok) {
    return {
      request: () =>
        Promise.reject(new ApiError(0, 'not_configured', 'The app is not configured (see .env).')),
    };
  }
  return createApiClient({
    baseUrl: result.env.VITE_API_URL,
    getToken: () => auth.getAccessToken(),
  });
}

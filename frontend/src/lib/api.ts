import { supabase } from './supabase';

export const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/+$/, '');

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** The backend verifies the Supabase JWT sent as a Bearer token on every request. */
export async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  const session = data?.session;
  if (!session) return null;

  // Proactively refresh if the token expires within 60 seconds
  if (session.expires_at && session.expires_at * 1000 < Date.now() + 60_000) {
    const { data: refreshed, error } = await supabase.auth.refreshSession();
    if (!error && refreshed?.session?.access_token) {
      return refreshed.session.access_token;
    }
  }

  return session.access_token ?? null;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  if (!token) return {};
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
}

/** The backend answers errors as { error: "message", details?: [{ path, message }] }. */
export function errorMessage(body: any, status: number) {
  const message = typeof body?.error === 'string' ? body.error : body?.error?.message;
  const first = body?.details?.[0];
  if (!message) return `API error ${status}`;
  if (!first?.message) return message;
  // "raw_bill_data.2.item_name" → "bill line 3": say which line, since the cause may be invisible.
  const line = /^raw_bill_data\.(\d+)\./.exec(first.path ?? '');
  return `${message}: ${first.message}${line ? ` (bill line ${Number(line[1]) + 1})` : ''}`;
}

export async function fetchApi(endpoint: string, options: RequestInit = {}) {
  const headers = await getAuthHeaders();
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        ...headers,
        ...options.headers
      }
    });
  } catch {
    throw new Error(`Cannot reach the CareClaim API at ${API_BASE}. Is the backend running?`);
  }

  // If 401 Unauthorized, try refreshing session once and retry
  if (res.status === 401) {
    const { data: refreshed, error } = await supabase.auth.refreshSession();
    if (!error && refreshed?.session?.access_token) {
      const retryHeaders = {
        ...headers,
        'Authorization': `Bearer ${refreshed.session.access_token}`,
        ...options.headers,
      };
      try {
        const retryRes = await fetch(`${API_BASE}${endpoint}`, {
          ...options,
          headers: retryHeaders,
        });
        if (retryRes.ok) {
          return retryRes.json();
        }
        res = retryRes;
      } catch {
        // Fall through to error handling
      }
    }
  }

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new ApiError(errorMessage(errorBody, res.status), res.status);
  }

  return res.json();
}

export async function extractBill(fileBase64: string, mimeType: string) {
  const { extracted } = await fetchApi('/api/claims/extract-bill', {
    method: 'POST',
    body: JSON.stringify({ fileBase64, mimeType }),
  });
  return extracted;
}

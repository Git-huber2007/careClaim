import { supabase } from './supabase';

export const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/+$/, '');

/** The backend verifies the Supabase JWT sent as a Bearer token on every request. */
export async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
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
  const detail = body?.details?.[0]?.message;
  if (!message) return `API error ${status}`;
  return detail ? `${message}: ${detail}` : message;
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

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorMessage(errorBody, res.status));
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


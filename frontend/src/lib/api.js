import { supabase } from './supabase';

const rawBase = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').trim();
const BASE = (rawBase ? (/^https?:\/\//i.test(rawBase) ? rawBase : `https://${rawBase}`) : 'http://localhost:5000').replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request(path, { method = 'GET', body } = {}) {
  const { data } = (await supabase?.auth.getSession()) ?? { data: {} };
  const token = data?.session?.access_token;
  if (!token) throw new ApiError(401, 'You are not signed in.');

  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, `Cannot reach the CareClaim API at ${BASE}. Is the backend running?`);
  }

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, payload.error || `Request failed (${res.status})`, payload.details);
  return payload;
}

export const api = {
  listClaims: () => request('/api/claims').then((r) => r.claims),
  getClaim: (id) => request(`/api/claims/${id}`).then((r) => r.claim),
  createClaim: (body) => request('/api/claims', { method: 'POST', body }).then((r) => r.claim),
  processClaim: (id) => request(`/api/claims/${id}/process`, { method: 'POST' }).then((r) => r.claim),
  listPolicies: () => request('/api/policies').then((r) => r.policies),
};

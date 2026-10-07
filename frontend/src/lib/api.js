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
  getMe: () => request('/api/me'),
  createProfile: (body) => request('/api/me/profile', { method: 'POST', body }).then((r) => r.profile),
  listDisputes: () => request('/api/disputes').then((r) => r.disputes),
  createDispute: (claimId, body) => request(`/api/claims/${claimId}/disputes`, { method: 'POST', body }).then((r) => r.dispute),
  respondToDispute: (id, body) => request(`/api/disputes/${id}/respond`, { method: 'POST', body }).then((r) => r.dispute),
  listClaims: () => request('/api/claims').then((r) => r.claims),
  getClaim: (id) => request(`/api/claims/${id}`).then((r) => r.claim),
  createClaim: (body) => request('/api/claims', { method: 'POST', body }).then((r) => r.claim),
  processClaim: (id) => request(`/api/claims/${id}/process`, { method: 'POST' }).then((r) => r.claim),
  extractBill: (fileBase64, mimeType) =>
    request('/api/claims/extract-bill', { method: 'POST', body: { fileBase64, mimeType } }).then((r) => r.extracted),
  listPolicies: () => request('/api/policies').then((r) => r.policies),

  /**
   * Real-time Server-Sent Events (SSE) stream for adjudication.
   */
  streamProcessClaim: async (id, { onLog, onStage, onResult, onError }) => {
    const { data } = (await supabase?.auth.getSession()) ?? { data: {} };
    const token = data?.session?.access_token;
    if (!token) throw new ApiError(401, 'You are not signed in.');

    const res = await fetch(`${BASE}/api/claims/${id}/process`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'text/event-stream',
      },
    });

    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      throw new ApiError(res.status, payload.error || `Stream failed (${res.status})`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() || '';

      for (const evt of events) {
        if (!evt.trim() || evt.startsWith(':')) continue;
        const lines = evt.split('\n');
        let eventType = 'message';
        let eventData = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) eventType = line.slice(7).trim();
          else if (line.startsWith('data: ')) eventData = line.slice(6).trim();
        }
        if (!eventData) continue;
        try {
          const parsed = JSON.parse(eventData);
          if (eventType === 'log') onLog?.(parsed.message);
          else if (eventType === 'stage_start') onStage?.(parsed.stage);
          else if (eventType === 'result') onResult?.(parsed);
          else if (eventType === 'error') onError?.(parsed.message);
        } catch {
          // ignore malformed SSE line
        }
      }
    }
  },
};

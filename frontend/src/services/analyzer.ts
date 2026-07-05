import type { AnalyzeResponse } from '../types';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export async function analyzeUrl(url: string): Promise<AnalyzeResponse> {
  if (!BACKEND_URL) {
    throw new Error('Backend URL not configured');
  }
  const res = await fetch(`${BACKEND_URL}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const j = await res.json();
      if (j?.detail) msg = j.detail;
    } catch {
      /* noop */
    }
    throw new Error(msg);
  }
  return (await res.json()) as AnalyzeResponse;
}

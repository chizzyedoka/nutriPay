const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';

type RequestOptions = Omit<RequestInit, 'body'> & { body?: unknown };

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error ?? 'Something went wrong');
  }
  return response.status === 204 ? (undefined as T) : response.json() as Promise<T>;
}

export type Meal = {
  id: string;
  name: string;
  slug: string;
  description: string;
  imageUrl: string;
  caloriesPreview: number;
  unlockPriceCents: number;
  premiumNutrition?: Record<string, string | number | string[]> | null;
  isLocked?: boolean;
};

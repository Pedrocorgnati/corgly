'use server';
import { PAGINATION } from '@/lib/constants';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

import { env } from '@/lib/env';
const API_BASE = env.NEXT_PUBLIC_APP_URL;

async function apiFetch<T>(path: string, init?: RequestInit): Promise<{ data: T | null; error: string | null }> {
  const cookieStore = await cookies();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    cache: init?.method && init.method !== 'GET' ? undefined : 'no-store',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieStore.toString(),
      ...init?.headers,
    },
  });

  const json = await res.json();

  if (!res.ok) {
    return { data: null, error: json.error ?? `Erro ${res.status}` };
  }

  return { data: json.data as T, error: null };
}

export async function getSessions(params?: { page?: number; limit?: number; status?: string }) {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.status) qs.set('status', params.status);

  const result = await apiFetch<{ data: unknown[]; total: number; page: number; limit: number; totalPages: number }>(
    `/api/v1/sessions?${qs.toString()}`,
  );

  return result.data ?? { data: [], total: 0, page: 1, limit: PAGINATION.DEFAULT, totalPages: 0 };
}

export async function getSession(id: string) {
  return apiFetch(`/api/v1/sessions/${id}`);
}

export async function bookSession(slotId: string) {
  const result = await apiFetch('/api/v1/sessions', {
    method: 'POST',
    body: JSON.stringify({ availabilitySlotId: slotId }),
  });

  if (!result.error) {
    revalidatePath('/schedule');
    revalidatePath('/history');
    revalidatePath('/admin/sessions');
  }

  return result;
}

export async function cancelSession(id: string, reason?: string) {
  const result = await apiFetch(`/api/v1/sessions/${id}/cancel`, {
    method: 'PATCH',
    body: JSON.stringify({ reason }),
  });

  if (!result.error) {
    revalidatePath('/history');
    revalidatePath('/schedule');
    revalidatePath('/admin/sessions');
  }

  return result;
}

export async function rescheduleSession(id: string, newSlotId: string) {
  const result = await apiFetch(`/api/v1/sessions/${id}/reschedule`, {
    method: 'PATCH',
    body: JSON.stringify({ newAvailabilitySlotId: newSlotId }),
  });

  if (!result.error) {
    revalidatePath('/history');
    revalidatePath('/schedule');
    revalidatePath('/admin/sessions');
  }

  return result;
}


export async function getAvailability(month: string) {
  const date = `${month}-01`;
  return apiFetch<Array<{ id: string; startAt: string; endAt: string; isBlocked: boolean }>>(
    `/api/v1/availability?date=${date}`,
  );
}

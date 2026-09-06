'use server';

import { cookies } from 'next/headers';
import { getSession } from '@/lib/auth/session';

import { internalApiOrigin } from '@/lib/internal-api';

async function apiFetch<T>(path: string): Promise<{ data: T | null; error: string | null }> {
  const cookieStore = await cookies();
  const res = await fetch(`${await internalApiOrigin()}${path}`, {
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieStore.toString(),
    },
  });

  const json = await res.json();

  if (!res.ok) {
    return { data: null, error: json.error ?? `Erro ${res.status}` };
  }

  return { data: json.data as T, error: null };
}

// ── Types ──

export interface AdminDashboardData {
  today: {
    scheduled: number;
    inProgress: number;
    completed: number;
    cancelled: number;
  };
  pendingFeedbacks: {
    count: number;
    items: Array<{
      sessionId: string;
      completedAt: string;
      sessionDate: string;
      student: { id: string; name: string; email: string };
    }>;
  };
  expiringCredits: {
    count: number;
    items: Array<{
      batchId: string;
      userId: string;
      student: { id: string; name: string; email: string };
      remaining: number;
      expiresAt: string;
      daysUntilExpiry: number | null;
    }>;
  };
  totalStudents: number;
}

// ── Fetcher ──

export async function getAdminDashboard() {
  const session = await getSession();
  if (!session || session.user.role !== 'ADMIN') {
    return { data: null, error: 'Unauthorized' };
  }
  return apiFetch<AdminDashboardData>('/api/v1/admin/dashboard');
}

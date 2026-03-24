'use server';

import { cookies } from 'next/headers';
import { getSession } from '@/lib/auth/session';

import { env } from '@/lib/env';
const API_BASE = env.NEXT_PUBLIC_APP_URL;

async function apiFetch<T>(path: string): Promise<{ data: T | null; error: string | null }> {
  const cookieStore = await cookies();
  const res = await fetch(`${API_BASE}${path}`, {
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

export interface AdminStudent {
  id: string;
  name: string;
  email: string;
  country: string | null;
  timezone: string | null;
  emailConfirmed: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  isActive: boolean;
  creditBalance: number;
}

export interface AdminStudentsResponse {
  items: AdminStudent[];
  total: number;
  page: number;
  limit: number;
}

export interface AdminStudentDetail {
  user: {
    id: string;
    name: string;
    email: string;
    country: string | null;
    timezone: string | null;
    emailConfirmed: boolean;
    marketingOptIn: boolean;
    preferredLanguage: string | null;
    onboardingCompletedAt: string | null;
    createdAt: string;
    lastLoginAt: string | null;
    deletionRequestedAt: string | null;
  };
  stats: {
    creditBalance: number;
    totalSessions: number;
    completedSessions: number;
    cancelledSessions: number;
  };
  creditBatches: Array<{
    id: string;
    type: string;
    total: number;
    used: number;
    remaining: number;
    expiresAt: string | null;
  }>;
  recentSessions: Array<{
    id: string;
    status: string;
    startAt: string;
    completedAt: string | null;
    hasFeedback: boolean;
  }>;
  recentFeedbacks: Array<{
    id: string;
    sessionDate: string;
    averageScore: number;
    reviewed: boolean;
    reviewedAt: string | null;
    createdAt: string;
  }>;
}

export interface SessionFeedbackDetail {
  id: string;
  sessionId: string;
  studentId: string;
  studentName: string;
  sessionDate: string;
  clarity: number;
  didacticQuality: number;
  punctuality: number;
  engagement: number;
  averageScore: number;
  comment: string | null;
  reviewed: boolean;
  reviewedAt: string | null;
  createdAt: string;
}

// ── Fetchers ──

export async function getAdminStudents(params?: {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
  sort?: string;
  order?: string;
}) {
  const session = await getSession();
  if (!session || session.user.role !== 'ADMIN') {
    return { data: null, error: 'Unauthorized' };
  }

  const searchParams = new URLSearchParams();
  if (params?.search) searchParams.set('search', params.search);
  if (params?.status) searchParams.set('status', params.status);
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.sort) searchParams.set('sort', params.sort);
  if (params?.order) searchParams.set('order', params.order);

  const qs = searchParams.toString();
  const path = `/api/v1/admin/users${qs ? `?${qs}` : ''}`;

  return apiFetch<AdminStudentsResponse>(path);
}

export async function getAdminStudentDetail(studentId: string) {
  const session = await getSession();
  if (!session || session.user.role !== 'ADMIN') {
    return { data: null, error: 'Unauthorized' };
  }
  return apiFetch<AdminStudentDetail>(`/api/v1/admin/users/${studentId}`);
}

export async function getSessionFeedback(sessionId: string) {
  const session = await getSession();
  if (!session || session.user.role !== 'ADMIN') {
    return { data: null, error: 'Unauthorized' };
  }
  return apiFetch<SessionFeedbackDetail>(`/api/v1/admin/sessions/${sessionId}/feedback`);
}

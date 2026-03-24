'use server';

import { cookies } from 'next/headers';
import { getAuthUser } from '@/lib/data/auth';

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

export interface DashboardUser {
  id: string;
  name: string;
  email: string;
  role: string;
  creditBalance: number;
}

export interface DashboardCredits {
  balance: number;
  breakdown: Array<{
    id: string;
    remaining: number;
    expiresAt: string;
  }>;
}

export interface DashboardNextSession {
  id: string;
  scheduledAt: string;
  status: string;
  durationMinutes: number;
}

interface FeedbackScores {
  clarity: number;
  didactics: number;
  punctuality: number;
  engagement: number;
}

export interface DashboardProgress {
  averageScores: FeedbackScores;
  totalSessions: number;
  completedSessions: number;
  trend: 'improving' | 'stable' | 'declining';
  lastFeedbacks: Array<{
    id: string;
    sessionId: string;
    sessionDate: string;
    averageScore: number;
    scores: FeedbackScores;
  }>;
}

// ── Fetchers ──

export async function getDashboardUser() {
  // Uses React.cache() — deduplicated with layout's getAuthUser() in same render
  const user = await getAuthUser();
  return { data: user as DashboardUser | null, error: user ? null : 'Não autenticado' };
}

export async function getDashboardCredits() {
  return apiFetch<DashboardCredits>('/api/v1/credits');
}

export async function getDashboardNextSession() {
  return apiFetch<{
    data: DashboardNextSession[];
    total: number;
  }>('/api/v1/sessions?status=SCHEDULED&limit=1&sort=scheduledAt:asc');
}

export async function getDashboardProgress() {
  return apiFetch<DashboardProgress>('/api/v1/feedback/progress');
}

export async function getDashboardRecentFeedbacks() {
  return apiFetch<{
    items: Array<{
      id: string;
      sessionId: string;
      sessionDate: string;
      averageScore: number;
    }>;
    total: number;
  }>('/api/v1/feedback?limit=3');
}

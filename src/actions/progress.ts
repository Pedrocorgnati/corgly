'use server';

import { cookies } from 'next/headers';

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

export interface FeedbackScores {
  clarity: number;
  didactics: number;
  punctuality: number;
  engagement: number;
}

export interface ProgressData {
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

export interface FeedbackHistoryItem {
  id: string;
  sessionId: string;
  sessionDate: string;
  scores: FeedbackScores;
  averageScore: number;
  comment: string | null;
}

export interface FeedbackHistoryResult {
  items: FeedbackHistoryItem[];
  total: number;
  page: number;
  limit: number;
}

// ── Fetchers ──

export async function getProgressData() {
  return apiFetch<ProgressData>('/api/v1/feedback/progress');
}

export async function getFeedbackHistory(page = 1, period: '30d' | '90d' | 'all' = 'all') {
  return apiFetch<FeedbackHistoryResult>(
    `/api/v1/feedback/history?page=${page}&limit=20&period=${period}`
  );
}

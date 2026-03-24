import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  isFeedbackWindowOpen,
  getFeedbackWindowExpiresAt,
  getRemainingWindowHours,
} from '@/lib/feedback/window';

const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

describe('isFeedbackWindowOpen', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('retorna true dentro de 48h apos completedAt', () => {
    vi.useFakeTimers();
    const completedAt = new Date('2025-06-01T10:00:00Z');
    // Set "now" to 24h after completion
    vi.setSystemTime(new Date('2025-06-02T10:00:00Z'));

    expect(isFeedbackWindowOpen(completedAt)).toBe(true);
  });

  it('retorna false apos 48h de completedAt', () => {
    vi.useFakeTimers();
    const completedAt = new Date('2025-06-01T10:00:00Z');
    // Set "now" to 49h after completion
    vi.setSystemTime(new Date('2025-06-03T11:00:00Z'));

    expect(isFeedbackWindowOpen(completedAt)).toBe(false);
  });

  it('retorna false exatamente em 48h (limiar)', () => {
    vi.useFakeTimers();
    const completedAt = new Date('2025-06-01T10:00:00Z');
    vi.setSystemTime(new Date(completedAt.getTime() + FORTY_EIGHT_HOURS_MS));

    expect(isFeedbackWindowOpen(completedAt)).toBe(false);
  });
});

describe('getFeedbackWindowExpiresAt', () => {
  it('retorna data correta (completedAt + 48h)', () => {
    const completedAt = new Date('2025-06-01T10:00:00Z');
    const expires = getFeedbackWindowExpiresAt(completedAt);
    expect(expires.getTime()).toBe(completedAt.getTime() + FORTY_EIGHT_HOURS_MS);
  });
});

describe('getRemainingWindowHours', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('retorna horas restantes corretamente', () => {
    vi.useFakeTimers();
    const completedAt = new Date('2025-06-01T10:00:00Z');
    // 24h after → 24h remaining
    vi.setSystemTime(new Date('2025-06-02T10:00:00Z'));

    expect(getRemainingWindowHours(completedAt)).toBe(24);
  });

  it('retorna 0 quando janela expirou', () => {
    vi.useFakeTimers();
    const completedAt = new Date('2025-06-01T10:00:00Z');
    vi.setSystemTime(new Date('2025-06-04T10:00:00Z'));

    expect(getRemainingWindowHours(completedAt)).toBe(0);
  });
});

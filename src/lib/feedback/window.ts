/** Feedback window: admin/student has 48h after session.completedAt to submit. */
const FEEDBACK_WINDOW_MS = 48 * 60 * 60 * 1000;

/**
 * Returns true if the 48h feedback window is still open.
 * Window starts at session.completedAt.
 */
export function isFeedbackWindowOpen(completedAt: Date): boolean {
  return Date.now() - completedAt.getTime() < FEEDBACK_WINDOW_MS;
}

/**
 * Returns the exact datetime the window expires.
 */
export function getFeedbackWindowExpiresAt(completedAt: Date): Date {
  return new Date(completedAt.getTime() + FEEDBACK_WINDOW_MS);
}

/**
 * Returns remaining hours in the window (0 if expired).
 */
export function getRemainingWindowHours(completedAt: Date): number {
  const remainingMs = FEEDBACK_WINDOW_MS - (Date.now() - completedAt.getTime());
  return Math.max(0, Math.floor(remainingMs / (60 * 60 * 1000)));
}

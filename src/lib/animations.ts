import type { Variants } from 'framer-motion';

/**
 * Shared animation variants for landing page and beyond.
 * Every variant set has a reduced-motion companion (suffix `Reduced`)
 * that collapses transforms and durations so users with
 * `prefers-reduced-motion: reduce` see no motion.
 */

// ── Fade-in up (sections, cards) ─────────────────────────────

export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: 'easeOut' },
  },
};

export const fadeInUpReduced: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.01 } },
};

// ── Stagger container (grids, lists) ─────────────────────────

export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

export const staggerContainerReduced: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0 } },
};

// ── Scale on hover (interactive cards) ───────────────────────

export const scaleOnHover: Variants = {
  rest: { scale: 1 },
  hover: { scale: 1.02, transition: { duration: 0.2 } },
};

export const scaleOnHoverReduced: Variants = {
  rest: { scale: 1 },
  hover: { scale: 1 },
};

// ── Slide in from left (onboarding slides) ───────────────────

export const slideInLeft: Variants = {
  hidden: { opacity: 0, x: -30 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.4, ease: 'easeOut' },
  },
  exit: {
    opacity: 0,
    x: 30,
    transition: { duration: 0.3, ease: 'easeIn' },
  },
};

export const slideInLeftReduced: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.01 } },
  exit: { opacity: 0, transition: { duration: 0.01 } },
};

// ── Helper: pick the right variant set based on reduced motion ─

/**
 * Returns the reduced-motion variant when the user prefers reduced motion.
 *
 * Usage:
 * ```tsx
 * const prefersReduced = useReducedMotion();
 * <motion.div variants={pickVariant(prefersReduced, fadeInUp, fadeInUpReduced)} />
 * ```
 */
export function pickVariant(
  prefersReduced: boolean | null,
  normal: Variants,
  reduced: Variants,
): Variants {
  return prefersReduced ? reduced : normal;
}

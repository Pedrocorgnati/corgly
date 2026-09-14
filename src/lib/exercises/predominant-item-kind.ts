import type { ExerciseItemKind } from './exercise-item.schema';

const PHASE_1_KIND_PRIORITY: Partial<Record<ExerciseItemKind, number>> = {
  MULTIPLE_CHOICE: 0,
  MATCH_CLICK: 1,
  TEXT_CHOICE: 2,
  VERB_CLOZE: 3,
};

export interface PositionedExerciseItemKind {
  readonly kind: ExerciseItemKind;
  readonly position: number;
}

interface KindStats {
  readonly kind: ExerciseItemKind;
  count: number;
  firstPosition: number;
}

function compareLexically(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function compareKindStats(left: KindStats, right: KindStats): number {
  if (left.count !== right.count) return right.count - left.count;
  if (left.firstPosition !== right.firstPosition) {
    return left.firstPosition - right.firstPosition;
  }

  const leftPriority = PHASE_1_KIND_PRIORITY[left.kind] ?? Number.POSITIVE_INFINITY;
  const rightPriority = PHASE_1_KIND_PRIORITY[right.kind] ?? Number.POSITIVE_INFINITY;

  if (leftPriority !== rightPriority) return leftPriority - rightPriority;
  return compareLexically(left.kind, right.kind);
}

/** Resolve o tipo predominante sem depender da ordem recebida nem alterar os itens. */
export function getPredominantItemKind(
  items: readonly PositionedExerciseItemKind[],
): ExerciseItemKind | null {
  const statsByKind = new Map<ExerciseItemKind, KindStats>();

  for (const item of items) {
    const stats = statsByKind.get(item.kind);

    if (stats) {
      stats.count += 1;
      stats.firstPosition = Math.min(stats.firstPosition, item.position);
    } else {
      statsByKind.set(item.kind, {
        kind: item.kind,
        count: 1,
        firstPosition: item.position,
      });
    }
  }

  let predominant: KindStats | null = null;

  for (const stats of statsByKind.values()) {
    if (predominant === null || compareKindStats(stats, predominant) < 0) {
      predominant = stats;
    }
  }

  return predominant?.kind ?? null;
}

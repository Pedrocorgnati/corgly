'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ROUTES } from '@/lib/constants/routes';
import { EXERCISE_STATUS_MAP, LEVEL_MAP } from '@/lib/constants/enums';
import type { AdminExerciseDetail } from '@/actions/admin-exercises';

interface AssignmentListProps {
  exercise: AdminExerciseDetail;
  activeCount: number;
}

export function AssignmentList({ exercise, activeCount }: AssignmentListProps) {
  const statusConfig = EXERCISE_STATUS_MAP[exercise.status];
  const levelConfig = LEVEL_MAP[exercise.level];

  return (
    <Card data-testid="exercise-info-panel">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <Link
            href={ROUTES.ADMIN_EXERCISES}
            className="hover:text-foreground hover:underline"
          >
            Admin
          </Link>
          <span>/</span>
          <Link
            href={`${ROUTES.ADMIN_EXERCISES}/${exercise.id}`}
            className="hover:text-foreground hover:underline"
          >
            Exercícios
          </Link>
          <span>/</span>
          <span className="text-foreground">{exercise.internalTitle}</span>
          <span>/</span>
          <span className="text-foreground font-medium">Liberações</span>
        </div>
        <CardTitle className="text-lg">{exercise.internalTitle}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge
            variant="outline"
            className={`${statusConfig.color} ${statusConfig.bg} ${statusConfig.border}`}
          >
            {statusConfig.label}
          </Badge>
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
            {exercise.supportLanguage}
          </Badge>
          <Badge
            variant="outline"
            className={`${levelConfig.color} ${levelConfig.bg} ${levelConfig.border}`}
          >
            Nível {exercise.level}
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-2">
          <div>
            <p className="text-xs text-muted-foreground">Itens</p>
            <p className="text-lg font-semibold">{exercise.items.length}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Alunos liberados</p>
            <p className="text-lg font-semibold text-primary">{activeCount}</p>
          </div>
        </div>

        {exercise.subject && (
          <div>
            <p className="text-xs text-muted-foreground">Matéria</p>
            <p className="text-sm">{exercise.subject}</p>
          </div>
        )}

        {exercise.timeEstimateMin && (
          <div>
            <p className="text-xs text-muted-foreground">Tempo estimado</p>
            <p className="text-sm">{exercise.timeEstimateMin} min</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
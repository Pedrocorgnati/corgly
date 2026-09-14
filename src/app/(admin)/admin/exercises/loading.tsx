import { TableSkeleton } from '@/components/ui/loading-skeleton';

export default function AdminExercisesLoading() {
  return (
    <div
      data-testid="admin-exercises-loading"
      className="px-4 py-6 md:px-6 md:py-8 max-w-6xl mx-auto"
      aria-busy="true"
    >
      <div className="h-7 w-40 bg-muted rounded mb-6 animate-pulse" />
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
        <TableSkeleton rows={5} />
      </div>
    </div>
  );
}

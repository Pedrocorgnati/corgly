import { PageWrapper } from '@/components/shared';

export default function AdminFeedbackSessionLoading() {
  return (
    <PageWrapper className="animate-pulse">
      <div className="h-6 w-48 bg-muted rounded mb-2" />
      <div className="h-4 w-32 bg-muted rounded mb-6" />
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm mb-4">
        <div className="h-4 w-40 bg-muted rounded mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-4 bg-muted rounded w-full" />
          ))}
        </div>
      </div>
    </PageWrapper>
  );
}

export default function AdminStudentsLoading() {
  return (
    <div className="px-4 py-6 md:px-6 md:py-8 max-w-6xl mx-auto animate-pulse">
      {/* Header */}
      <div className="mb-6">
        <div className="h-7 w-32 bg-muted rounded" />
        <div className="h-4 w-56 bg-muted rounded mt-2" />
      </div>
      {/* Search bar */}
      <div className="mb-6">
        <div className="h-10 w-full max-w-sm bg-muted rounded-lg" />
      </div>
      {/* Table skeleton */}
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
        {/* Table header */}
        <div className="flex items-center gap-4 pb-3 mb-3 border-b border-border">
          <div className="h-4 w-32 bg-muted rounded" />
          <div className="h-4 w-40 bg-muted rounded" />
          <div className="h-4 w-24 bg-muted rounded" />
          <div className="h-4 w-20 bg-muted rounded ml-auto" />
        </div>
        {/* Table rows */}
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="h-4 w-32 bg-muted rounded" />
              <div className="h-4 w-40 bg-muted rounded" />
              <div className="h-4 w-24 bg-muted rounded" />
              <div className="h-4 w-20 bg-muted rounded ml-auto" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

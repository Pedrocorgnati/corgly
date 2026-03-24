export default function ProgressLoading() {
  return (
    <div className="px-4 py-6 md:px-6 md:py-8 max-w-6xl mx-auto animate-pulse">
      {/* Breadcrumb */}
      <div className="mb-6">
        <div className="h-4 w-36 bg-muted rounded" />
      </div>
      {/* Header */}
      <div className="mb-6">
        <div className="h-7 w-40 bg-muted rounded" />
        <div className="h-4 w-56 bg-muted rounded mt-2" />
      </div>
      {/* Chart skeletons */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <div className="h-4 w-32 bg-muted rounded mb-4" />
            <div className="h-60 w-full bg-muted rounded" />
          </div>
        ))}
      </div>
      {/* History table skeleton */}
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
        <div className="h-5 w-28 bg-muted rounded mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="h-4 w-24 bg-muted rounded" />
              <div className="h-4 w-40 bg-muted rounded" />
              <div className="h-4 w-16 bg-muted rounded ml-auto" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

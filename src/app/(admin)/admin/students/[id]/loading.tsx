export default function StudentDetailLoading() {
  return (
    <div className="px-4 py-6 md:px-6 md:py-8 max-w-6xl mx-auto animate-pulse">
      {/* Breadcrumb */}
      <div className="mb-6">
        <div className="h-4 w-48 bg-muted rounded" />
      </div>
      {/* Profile card */}
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm mb-6">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 bg-muted rounded-full" />
          <div>
            <div className="h-6 w-40 bg-muted rounded mb-2" />
            <div className="h-4 w-56 bg-muted rounded" />
          </div>
        </div>
      </div>
      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-card border border-border rounded-2xl p-4 shadow-sm">
            <div className="h-3 w-16 bg-muted rounded mb-2" />
            <div className="h-7 w-12 bg-muted rounded" />
          </div>
        ))}
      </div>
      {/* Table skeleton */}
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
        <div className="h-5 w-32 bg-muted rounded mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="h-4 w-24 bg-muted rounded" />
              <div className="h-4 w-36 bg-muted rounded" />
              <div className="h-4 w-20 bg-muted rounded" />
              <div className="h-4 w-16 bg-muted rounded ml-auto" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

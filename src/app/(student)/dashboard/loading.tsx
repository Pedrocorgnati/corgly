export default function DashboardLoading() {
  return (
    <div className="px-4 py-6 md:px-6 md:py-8 max-w-6xl mx-auto animate-pulse">
      {/* Header */}
      <div className="mb-6">
        <div className="h-7 w-48 bg-muted rounded" />
        <div className="h-4 w-64 bg-muted rounded mt-2" />
      </div>
      {/* Widget grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <div className="h-4 w-24 bg-muted rounded mb-3" />
            <div className="h-8 w-16 bg-muted rounded mb-2" />
            <div className="h-3 w-32 bg-muted rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

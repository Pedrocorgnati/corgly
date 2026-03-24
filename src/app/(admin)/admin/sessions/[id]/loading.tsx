export default function AdminSessionDetailLoading() {
  return (
    <div className="px-4 py-6 md:px-6 md:py-8 max-w-6xl mx-auto animate-pulse">
      <div className="h-6 w-48 bg-muted rounded mb-2" />
      <div className="h-4 w-32 bg-muted rounded mb-6" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          <div className="h-4 w-32 bg-muted rounded mb-4" />
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-4 bg-muted rounded w-full" />
            ))}
          </div>
        </div>
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          <div className="h-4 w-24 bg-muted rounded mb-4" />
          <div className="h-32 bg-muted rounded" />
        </div>
      </div>
    </div>
  );
}

export default function AdminContentLoading() {
  return (
    <div className="px-4 py-6 md:px-6 md:py-8 max-w-6xl mx-auto animate-pulse">
      <div className="h-7 w-40 bg-muted rounded mb-6" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-card border border-border rounded-2xl p-5 shadow-sm">
            <div className="h-36 bg-muted rounded-xl mb-3" />
            <div className="h-4 w-3/4 bg-muted rounded mb-2" />
            <div className="h-3 w-1/2 bg-muted rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

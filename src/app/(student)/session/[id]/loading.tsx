export default function SessionLoading() {
  return (
    <div className="min-h-dvh animate-pulse bg-background">
      <div className="flex flex-col md:flex-row h-full gap-4 p-4">
        {/* Main area (video/content) */}
        <div className="flex-1 bg-muted rounded-2xl min-h-[300px] md:min-h-[500px]" />
        {/* Sidebar */}
        <div className="w-full md:w-72 space-y-3">
          <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
            <div className="h-4 w-32 bg-muted rounded mb-3" />
            <div className="h-3 w-full bg-muted rounded mb-2" />
            <div className="h-3 w-3/4 bg-muted rounded" />
          </div>
          <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
            <div className="h-4 w-24 bg-muted rounded mb-3" />
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-3 bg-muted rounded w-full" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function StudentCreditsLoading() {
  return (
    <div className="px-4 py-6 md:px-6 md:py-8 max-w-4xl mx-auto animate-pulse">
      <div className="h-7 w-40 bg-muted rounded mb-6" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          <div className="h-4 w-24 bg-muted rounded mb-2" />
          <div className="h-8 w-16 bg-muted rounded" />
        </div>
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          <div className="h-4 w-28 bg-muted rounded mb-2" />
          <div className="h-8 w-20 bg-muted rounded" />
        </div>
      </div>
      <div className="bg-muted rounded-2xl h-64" />
    </div>
  );
}

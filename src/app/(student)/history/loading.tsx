export default function Loading() {
  return (
    <div className="px-4 py-6 md:px-6 md:py-8 max-w-4xl mx-auto animate-pulse">
      <div className="h-8 w-48 bg-muted rounded mb-6" />
      <div className="flex gap-2 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-7 w-20 bg-muted rounded-full" />
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 bg-muted rounded-xl" />
        ))}
      </div>
    </div>
  );
}

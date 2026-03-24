export default function ContentDetailLoading() {
  return (
    <div className="px-4 py-8 md:px-6 md:py-12 max-w-3xl mx-auto animate-pulse">
      {/* Title */}
      <div className="h-8 w-3/4 bg-muted rounded mb-3" />
      <div className="h-4 w-1/2 bg-muted rounded mb-6" />
      {/* Body paragraphs */}
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={`h-4 bg-muted rounded ${i === 2 ? 'w-3/4' : 'w-full'}`} />
        ))}
      </div>
    </div>
  );
}

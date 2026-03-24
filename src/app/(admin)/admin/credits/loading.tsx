export default function AdminCreditsLoading() {
  return (
    <div className="px-4 py-6 md:px-6 md:py-8 max-w-6xl mx-auto animate-pulse">
      <div className="h-7 w-36 bg-muted rounded mb-6" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-muted rounded-xl h-40" />
        <div className="bg-muted rounded-xl h-40" />
      </div>
      <div className="bg-muted rounded-2xl h-80" />
    </div>
  );
}

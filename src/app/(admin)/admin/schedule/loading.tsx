export default function Loading() {
  return (
    <div className="px-4 py-6 md:px-6 md:py-8 max-w-6xl mx-auto animate-pulse">
      <div className="h-8 w-32 bg-muted rounded mb-6" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-muted rounded-2xl h-[400px]" />
        <div className="bg-muted rounded-2xl h-[300px]" />
      </div>
    </div>
  );
}

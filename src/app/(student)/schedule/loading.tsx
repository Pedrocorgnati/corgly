export default function Loading() {
  return (
    <div className="px-4 py-6 md:px-6 md:py-8 max-w-5xl mx-auto animate-pulse">
      <div className="h-8 w-48 bg-muted rounded mb-6" />
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 bg-muted rounded-2xl h-[380px]" />
        <div className="lg:w-72 bg-muted rounded-2xl h-[300px]" />
      </div>
    </div>
  );
}

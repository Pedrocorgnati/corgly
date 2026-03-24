import { Loader2Icon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"

interface LoadingStateProps {
  variant?: "spinner" | "skeleton"
  message?: string
  skeletonLines?: number
  className?: string
}

function LoadingState({
  variant = "spinner",
  message,
  skeletonLines = 3,
  className,
}: LoadingStateProps) {
  if (variant === "skeleton") {
    return (
      <div
        role="status"
        aria-busy="true"
        className={cn("space-y-3", className)}
      >
        {Array.from({ length: skeletonLines }).map((_, i) => (
          <Skeleton
            key={i}
            className={cn(
              "h-4",
              i === 0 && "w-3/4",
              i > 0 && i < skeletonLines - 1 && "w-full",
              i === skeletonLines - 1 && "w-1/2"
            )}
          />
        ))}
        {message && (
          <p className="text-sm text-muted-foreground sr-only">{message}</p>
        )}
      </div>
    )
  }

  return (
    <div
      role="status"
      aria-busy="true"
      className={cn(
        "flex flex-col items-center justify-center gap-3 py-12",
        className
      )}
    >
      <Loader2Icon className="size-6 animate-spin text-primary" />
      {message && (
        <p className="text-sm text-muted-foreground">{message}</p>
      )}
    </div>
  )
}

export { LoadingState }
export type { LoadingStateProps }

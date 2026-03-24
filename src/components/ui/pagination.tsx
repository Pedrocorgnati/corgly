"use client"

import * as React from "react"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface PaginationProps {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
  showInfo?: boolean
  total?: number
  limit?: number
  className?: string
}

function getPageNumbers(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }

  const pages: (number | "ellipsis")[] = [1]

  if (current <= 3) {
    pages.push(2, 3, 4, "ellipsis", total)
  } else if (current >= total - 2) {
    pages.push("ellipsis", total - 3, total - 2, total - 1, total)
  } else {
    pages.push("ellipsis", current - 1, current, current + 1, "ellipsis", total)
  }

  return pages
}

function Pagination({
  page,
  totalPages,
  onPageChange,
  showInfo = false,
  total,
  limit,
  className,
}: PaginationProps) {
  if (totalPages <= 1) return null

  const pages = getPageNumbers(page, totalPages)

  return (
    <nav
      aria-label="Paginação"
      className={cn("flex items-center justify-center gap-1", className)}
    >
      <Button
        variant="outline"
        size="icon-sm"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        aria-label="Página anterior"
      >
        <ChevronLeftIcon />
      </Button>

      {/* Mobile: simplified display */}
      <span className="text-sm text-muted-foreground sm:hidden px-2">
        {page} de {totalPages}
      </span>

      {/* Desktop: page number buttons */}
      <div className="hidden sm:flex items-center gap-1">
        {pages.map((p, i) =>
          p === "ellipsis" ? (
            <span
              key={`ellipsis-${i}`}
              className="px-1 text-sm text-muted-foreground select-none"
            >
              ...
            </span>
          ) : (
            <Button
              key={p}
              variant={p === page ? "default" : "outline"}
              size="icon-sm"
              onClick={() => onPageChange(p)}
              aria-current={p === page ? "page" : undefined}
              aria-label={`Página ${p}`}
            >
              {p}
            </Button>
          )
        )}
      </div>

      <Button
        variant="outline"
        size="icon-sm"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        aria-label="Próxima página"
      >
        <ChevronRightIcon />
      </Button>

      {showInfo && total != null && limit != null && (
        <span className="ml-2 text-xs text-muted-foreground hidden sm:inline">
          {(page - 1) * limit + 1}–{Math.min(page * limit, total)} de {total}
        </span>
      )}
    </nav>
  )
}

export { Pagination }
export type { PaginationProps }

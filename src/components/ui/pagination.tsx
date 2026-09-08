"use client"

import * as React from "react"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { useTranslations } from "next-intl"

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
  /** Prefixo dos data-testid da paginacao. Default: "pagination". */
  testId?: string
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
  testId = "pagination",
}: PaginationProps) {
  // Ate 2026-09-07 os rotulos e os aria-labels desta paginacao eram portugues
  // cravado e ignoravam o idioma escolhido pelo leitor — inclusive nas telas que
  // ja estavam traduzidas em volta dela.
  const t = useTranslations("pagination")

  if (totalPages <= 1) return null

  const pages = getPageNumbers(page, totalPages)

  return (
    <nav
      data-testid={testId}
      aria-label={t("aria.nav")}
      className={cn("flex items-center justify-center gap-1", className)}
    >
      <Button
        data-testid={`${testId}-prev-button`}
        variant="outline"
        size="icon-sm"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        aria-label={t("aria.prev")}
      >
        <ChevronLeftIcon />
      </Button>

      {/* Mobile: simplified display */}
      <span data-testid={`${testId}-status`} className="text-sm text-muted-foreground sm:hidden px-2">
        {t("status", { page, totalPages })}
      </span>

      {/* Desktop: page number buttons */}
      <div data-testid={`${testId}-pages`} className="hidden sm:flex items-center gap-1">
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
              data-testid={`${testId}-page-${p}-button`}
              variant={p === page ? "default" : "outline"}
              size="icon-sm"
              onClick={() => onPageChange(p)}
              aria-current={p === page ? "page" : undefined}
              aria-label={t("aria.page", { page: p })}
            >
              {p}
            </Button>
          )
        )}
      </div>

      <Button
        data-testid={`${testId}-next-button`}
        variant="outline"
        size="icon-sm"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        aria-label={t("aria.next")}
      >
        <ChevronRightIcon />
      </Button>

      {showInfo && total != null && limit != null && (
        <span data-testid={`${testId}-info`} className="ml-2 text-xs text-muted-foreground hidden sm:inline">
          {t("info", {
            from: (page - 1) * limit + 1,
            to: Math.min(page * limit, total),
            total,
          })}
        </span>
      )}
    </nav>
  )
}

export { Pagination }
export type { PaginationProps }

import { cn } from "@/lib/utils"

interface TimezoneDisplayProps {
  time: Date | string
  studentTz: string
  adminTz?: string
  format?: "short" | "long"
  className?: string
}

function formatInTimezone(
  date: Date,
  timezone: string,
  style: "short" | "long"
): string {
  try {
    if (style === "short") {
      const weekday = new Intl.DateTimeFormat("pt-BR", {
        weekday: "short",
        timeZone: timezone,
      }).format(date)

      const dateStr = new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        timeZone: timezone,
      }).format(date)

      const timeStr = new Intl.DateTimeFormat("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: timezone,
      }).format(date)

      const tzShort = new Intl.DateTimeFormat("pt-BR", {
        timeZoneName: "short",
        timeZone: timezone,
      })
        .formatToParts(date)
        .find((p) => p.type === "timeZoneName")?.value ?? timezone

      return `${weekday}, ${dateStr} · ${timeStr} ${tzShort}`
    }

    const dateStr = new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: timezone,
    }).format(date)

    const timeStr = new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: timezone,
    }).format(date)

    const tzShort = new Intl.DateTimeFormat("pt-BR", {
      timeZoneName: "short",
      timeZone: timezone,
    })
      .formatToParts(date)
      .find((p) => p.type === "timeZoneName")?.value ?? timezone

    return `${dateStr} · ${timeStr} ${tzShort}`
  } catch {
    // Fallback to UTC for invalid timezones
    return formatInTimezone(date, "UTC", style)
  }
}

function TimezoneDisplay({
  time,
  studentTz,
  adminTz,
  format = "short",
  className,
}: TimezoneDisplayProps) {
  const date = typeof time === "string" ? new Date(time) : time

  const studentFormatted = formatInTimezone(date, studentTz, format)

  if (!adminTz || adminTz === studentTz) {
    return (
      <span className={cn("text-sm text-muted-foreground", className)}>
        {studentFormatted}
      </span>
    )
  }

  const adminTime = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: adminTz,
  }).format(date)

  const adminTzShort = (() => {
    try {
      return (
        new Intl.DateTimeFormat("pt-BR", {
          timeZoneName: "short",
          timeZone: adminTz,
        })
          .formatToParts(date)
          .find((p) => p.type === "timeZoneName")?.value ?? adminTz
      )
    } catch {
      return "UTC"
    }
  })()

  if (format === "long") {
    const studentDateAndTime = formatInTimezone(date, studentTz, "long")
    return (
      <span className={cn("text-sm text-muted-foreground", className)}>
        {studentDateAndTime} / {adminTime} {adminTzShort}
      </span>
    )
  }

  return (
    <span className={cn("text-sm text-muted-foreground", className)}>
      {studentFormatted}
      <span className="mx-1 opacity-50">/</span>
      {adminTime} {adminTzShort}
    </span>
  )
}

export { TimezoneDisplay }
export type { TimezoneDisplayProps }

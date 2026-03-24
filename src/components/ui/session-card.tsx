"use client"

import * as React from "react"
import { CalendarIcon, PlayIcon, XIcon, RefreshCwIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { TimezoneDisplay } from "@/components/ui/timezone-display"
import { SessionStatus, SESSION_STATUS_MAP } from "@/lib/constants/enums"

interface SessionData {
  id: string
  startAt: string
  endAt: string
  status: string
  studentName?: string
  adminName?: string
}

interface SessionCardProps {
  session: SessionData
  studentTimezone?: string
  adminTimezone?: string
  onEnter?: () => void
  onCancel?: () => void
  onReschedule?: () => void
  className?: string
}

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  [SessionStatus.SCHEDULED]: { label: SESSION_STATUS_MAP.SCHEDULED.label, variant: "outline" },
  [SessionStatus.IN_PROGRESS]: { label: SESSION_STATUS_MAP.IN_PROGRESS.label, variant: "default" },
  [SessionStatus.COMPLETED]: { label: SESSION_STATUS_MAP.COMPLETED.label, variant: "secondary" },
  [SessionStatus.CANCELLED_BY_STUDENT]: { label: SESSION_STATUS_MAP.CANCELLED_BY_STUDENT.label, variant: "destructive" },
  [SessionStatus.CANCELLED_BY_ADMIN]: { label: SESSION_STATUS_MAP.CANCELLED_BY_ADMIN.label, variant: "destructive" },
  [SessionStatus.NO_SHOW_STUDENT]: { label: SESSION_STATUS_MAP.NO_SHOW_STUDENT.label, variant: "destructive" },
  [SessionStatus.NO_SHOW_ADMIN]: { label: SESSION_STATUS_MAP.NO_SHOW_ADMIN.label, variant: "destructive" },
  [SessionStatus.INTERRUPTED]: { label: SESSION_STATUS_MAP.INTERRUPTED.label, variant: "destructive" },
  [SessionStatus.RESCHEDULE_PENDING]: { label: SESSION_STATUS_MAP.RESCHEDULE_PENDING.label, variant: "outline" },
}

function SessionCard({
  session,
  studentTimezone = "America/Sao_Paulo",
  adminTimezone,
  onEnter,
  onCancel,
  onReschedule,
  className,
}: SessionCardProps) {
  const statusConfig = STATUS_CONFIG[session.status] ?? {
    label: session.status,
    variant: "outline" as const,
  }

  const startDate = new Date(session.startAt)
  const now = new Date()
  const minutesBefore = (startDate.getTime() - now.getTime()) / 1000 / 60
  const canEnter = minutesBefore <= 5

  const showEnter =
    onEnter && (session.status === SessionStatus.SCHEDULED || session.status === SessionStatus.IN_PROGRESS)
  const showCancel = onCancel && session.status === SessionStatus.SCHEDULED
  const showReschedule = onReschedule && session.status === SessionStatus.SCHEDULED

  return (
    <Card className={cn("", className)}>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="size-4 text-muted-foreground" />
            {session.studentName ?? session.adminName ?? "Sessão"}
          </CardTitle>
          <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-2">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-sm">
            <span className="font-medium text-foreground">Início:</span>
            <TimezoneDisplay
              time={session.startAt}
              studentTz={studentTimezone}
              adminTz={adminTimezone}
              format="short"
            />
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            <span className="font-medium text-foreground">Fim:</span>
            <TimezoneDisplay
              time={session.endAt}
              studentTz={studentTimezone}
              adminTz={adminTimezone}
              format="short"
            />
          </div>
        </div>
      </CardContent>

      {(showEnter || showCancel || showReschedule) && (
        <CardFooter className="gap-2">
          {showReschedule && (
            <Button variant="outline" size="sm" onClick={onReschedule}>
              <RefreshCwIcon className="size-3.5" />
              Reagendar
            </Button>
          )}
          {showCancel && (
            <Button variant="destructive" size="sm" onClick={onCancel}>
              <XIcon className="size-3.5" />
              Cancelar
            </Button>
          )}
          {showEnter && (
            <Button
              size="sm"
              onClick={onEnter}
              disabled={!canEnter}
              className="ml-auto"
            >
              <PlayIcon className="size-3.5" />
              Entrar
            </Button>
          )}
        </CardFooter>
      )}
    </Card>
  )
}

export { SessionCard }
export type { SessionCardProps, SessionData }

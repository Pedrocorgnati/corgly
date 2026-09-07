"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
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
import { SessionStatus, SESSION_STATUS_LABEL_KEY } from "@/lib/constants/enums"

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

/**
 * Variante visual do badge por status. O ROTULO nao mora aqui: ele vem do
 * catalogo (`sessionStatus.*`) via `SESSION_STATUS_LABEL_KEY`, porque este
 * mapa e avaliado no modulo, fora de qualquer provider de i18n.
 */
const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  [SessionStatus.SCHEDULED]: "outline",
  [SessionStatus.IN_PROGRESS]: "default",
  [SessionStatus.COMPLETED]: "secondary",
  [SessionStatus.CANCELLED_BY_STUDENT]: "destructive",
  [SessionStatus.CANCELLED_BY_ADMIN]: "destructive",
  [SessionStatus.NO_SHOW_STUDENT]: "destructive",
  [SessionStatus.NO_SHOW_ADMIN]: "destructive",
  [SessionStatus.INTERRUPTED]: "destructive",
  [SessionStatus.RESCHEDULE_PENDING]: "outline",
}

/** Minutos antes do inicio em que o botao "Entrar" destrava. */
const ENTER_WINDOW_MINUTES = 5

function SessionCard({
  session,
  studentTimezone = "America/Sao_Paulo",
  adminTimezone,
  onEnter,
  onCancel,
  onReschedule,
  className,
}: SessionCardProps) {
  const t = useTranslations("sessionCard")
  const tStatus = useTranslations("sessionStatus")

  const statusVariant = STATUS_VARIANT[session.status] ?? "outline"

  const startDate = new Date(session.startAt)
  const now = new Date()
  const minutesBefore = (startDate.getTime() - now.getTime()) / 1000 / 60
  const canEnter = minutesBefore <= ENTER_WINDOW_MINUTES

  const showEnter =
    onEnter && (session.status === SessionStatus.SCHEDULED || session.status === SessionStatus.IN_PROGRESS)
  const showCancel = onCancel && session.status === SessionStatus.SCHEDULED
  const showReschedule = onReschedule && session.status === SessionStatus.SCHEDULED

  return (
    <Card data-testid={`session-card-${session.id}`} className={cn("", className)}>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="size-4 text-muted-foreground" />
            {session.studentName ?? session.adminName ?? t("fallbackTitle")}
          </CardTitle>
          <Badge data-testid={`session-card-${session.id}-status`} variant={statusVariant}>
            {SESSION_STATUS_LABEL_KEY[session.status as SessionStatus]
              ? tStatus(SESSION_STATUS_LABEL_KEY[session.status as SessionStatus])
              : session.status}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-2">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-sm">
            <span className="font-medium text-foreground">{t("startLabel")}</span>
            <TimezoneDisplay
              time={session.startAt}
              studentTz={studentTimezone}
              adminTz={adminTimezone}
              format="short"
            />
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            <span className="font-medium text-foreground">{t("endLabel")}</span>
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
        <CardFooter data-testid={`session-card-${session.id}-actions`} className="gap-2">
          {showReschedule && (
            <Button data-testid={`session-card-${session.id}-reschedule-button`} variant="outline" size="sm" onClick={onReschedule}>
              <RefreshCwIcon className="size-3.5" />
              {t("actions.reschedule")}
            </Button>
          )}
          {showCancel && (
            <Button data-testid={`session-card-${session.id}-cancel-button`} variant="destructive" size="sm" onClick={onCancel}>
              <XIcon className="size-3.5" />
              {t("actions.cancel")}
            </Button>
          )}
          {showEnter && (
            <div className="ml-auto flex items-center gap-2">
              {/* Zero Silencio: o botao desabilitado dizia apenas "Entrar" e nao
                  explicava por que nao clicava. */}
              {!canEnter && (
                <span
                  data-testid={`session-card-${session.id}-enter-hint`}
                  className="text-xs text-muted-foreground"
                >
                  {t("enterAvailableIn", { minutes: Math.ceil(minutesBefore - ENTER_WINDOW_MINUTES) })}
                </span>
              )}
              <Button
                data-testid={`session-card-${session.id}-enter-button`}
                size="sm"
                onClick={onEnter}
                disabled={!canEnter}
              >
                <PlayIcon className="size-3.5" />
                {t("actions.enter")}
              </Button>
            </div>
          )}
        </CardFooter>
      )}
    </Card>
  )
}

export { SessionCard }
export type { SessionCardProps, SessionData }

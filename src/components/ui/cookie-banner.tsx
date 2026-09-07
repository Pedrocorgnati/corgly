"use client"

import * as React from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { CookieCustomizeDialog } from "@/components/ui/cookie-customize-dialog"

import { API, ROUTES } from "@/lib/constants/routes"
import { timeoutSignal } from "@/lib/timeout-signal"
import {
  getConsentCookie,
  setConsentCookie,
  serializeConsent,
} from "@/lib/legal/consent-cookie"

interface CookieBannerProps {
  className?: string
}

/** Teto de espera do POST de consentimento. */
const CONSENT_SYNC_TIMEOUT_MS = 10_000

function CookieBanner({ className }: CookieBannerProps) {
  const t = useTranslations("cookieBanner")
  const [visible, setVisible] = React.useState(false)
  const [customizeOpen, setCustomizeOpen] = React.useState(false)

  React.useEffect(() => {
    const consent = getConsentCookie()
    if (!consent) {
      setVisible(true)
    }
  }, [])

  /**
   * Registra a escolha no backend. O cookie ja foi gravado antes desta chamada
   * e e a fonte primaria, entao a falha aqui nao desfaz a escolha do usuario —
   * mas tambem nao pode sumir sem sinal: o POST e o registro de auditoria do
   * consentimento, e um `catch` vazio significa que ninguem nunca descobre que
   * esse registro parou de ser gravado. O usuario recebe o aviso de que a
   * escolha valeu neste dispositivo mas nao chegou ao servidor.
   */
  const syncConsentToApi = (analytics: boolean, marketing: boolean) => {
    void (async () => {
      try {
        const response = await fetch(API.AUTH.COOKIE_CONSENT, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ analytics, marketing }),
          signal: timeoutSignal(CONSENT_SYNC_TIMEOUT_MS),
        })
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
      } catch {
        toast.message(t("sync_failed_title"), {
          description: t("sync_failed_description"),
        })
      }
    })()
  }

  const handleAcceptAll = () => {
    setConsentCookie(serializeConsent({ analytics: true, marketing: true }))
    setVisible(false)
    syncConsentToApi(true, true)
  }

  const handleReject = () => {
    setConsentCookie(serializeConsent({ analytics: false, marketing: false }))
    setVisible(false)
    syncConsentToApi(false, false)
  }

  const handleCustomize = () => {
    setCustomizeOpen(true)
  }

  const handleSavePreferences = (preferences: {
    analytics: boolean
    marketing: boolean
  }) => {
    const { analytics, marketing } = preferences

    setConsentCookie(serializeConsent({ analytics, marketing }))

    setCustomizeOpen(false)
    setVisible(false)
    syncConsentToApi(analytics, marketing)
  }

  if (!visible) return null

  return (
    <>
      <div
        data-testid="cookie-banner"
        role="dialog"
        aria-label={t("aria")}
        className={cn(
          "fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 p-4 backdrop-blur-sm sm:p-6",
          className
        )}
      >
        <div className="mx-auto flex max-w-4xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1 space-y-1">
            <p className="text-sm font-medium text-foreground">
              {t("title")}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("description")}{" "}
              <Link
                data-testid="cookie-banner-privacy-link"
                href={ROUTES.PRIVACY}
                className="underline underline-offset-4 hover:text-foreground"
              >
                {t("privacy_link")}
              </Link>
              .{" "}
              <Link
                data-testid="cookie-banner-preferences-link"
                href={ROUTES.COOKIE_PREFERENCES}
                className="underline underline-offset-4 hover:text-foreground"
              >
                {t("manage_preferences")}
              </Link>
              .
            </p>
          </div>

          <div data-testid="cookie-banner-actions" className="flex flex-col gap-2 sm:flex-row sm:shrink-0">
            <Button data-testid="cookie-banner-customize-button" variant="ghost" size="sm" onClick={handleCustomize}>
              {t("customize")}
            </Button>
            <Button data-testid="cookie-banner-reject-button" variant="outline" size="sm" onClick={handleReject}>
              {t("reject")}
            </Button>
            <Button data-testid="cookie-banner-accept-all-button" size="sm" onClick={handleAcceptAll}>
              {t("accept_all")}
            </Button>
          </div>
        </div>
      </div>

      <CookieCustomizeDialog
        open={customizeOpen}
        onOpenChange={setCustomizeOpen}
        onSave={handleSavePreferences}
      />
    </>
  )
}

export { CookieBanner }
export type { CookieBannerProps }

"use client"

import * as React from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { CookieCustomizeDialog } from "@/components/ui/cookie-customize-dialog"

import { API, ROUTES } from "@/lib/constants/routes"
import {
  getConsentCookie,
  setConsentCookie,
  serializeConsent,
} from "@/lib/legal/consent-cookie"

interface CookieBannerProps {
  className?: string
}

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

  /** Fire-and-forget: persist consent to backend */
  const syncConsentToApi = (analytics: boolean, marketing: boolean) => {
    fetch(API.AUTH.COOKIE_CONSENT, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ analytics, marketing }),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => {
      // Silently ignore: cookie is the primary store
    })
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
                href={ROUTES.PRIVACY}
                className="underline underline-offset-4 hover:text-foreground"
              >
                {t("privacy_link")}
              </Link>
              .{" "}
              <Link
                href={ROUTES.COOKIE_PREFERENCES}
                className="underline underline-offset-4 hover:text-foreground"
              >
                {t("manage_preferences")}
              </Link>
              .
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:shrink-0">
            <Button variant="ghost" size="sm" onClick={handleCustomize}>
              {t("customize")}
            </Button>
            <Button variant="outline" size="sm" onClick={handleReject}>
              {t("reject")}
            </Button>
            <Button size="sm" onClick={handleAcceptAll}>
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

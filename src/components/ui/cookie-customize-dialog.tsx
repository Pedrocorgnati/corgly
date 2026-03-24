"use client"

import * as React from "react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface CookieCustomizeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (preferences: { analytics: boolean; marketing: boolean }) => void
}

function CookieCustomizeDialog({
  open,
  onOpenChange,
  onSave,
}: CookieCustomizeDialogProps) {
  const t = useTranslations("cookieBanner")
  const [analytics, setAnalytics] = React.useState(false)
  const [marketing, setMarketing] = React.useState(false)

  const handleSave = () => {
    onSave({ analytics, marketing })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("dialog_title")}</DialogTitle>
          <DialogDescription>{t("dialog_description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Essential - always on */}
          <div className="flex items-start gap-3">
            <Checkbox
              checked
              disabled
              className="mt-0.5"
              aria-label={t("essential_label")}
            />
            <div className="space-y-0.5">
              <Label className="text-sm font-medium text-foreground">
                {t("essential_label")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t("essential_description")}
              </p>
            </div>
          </div>

          {/* Analytics */}
          <div className="flex items-start gap-3">
            <Checkbox
              checked={analytics}
              onCheckedChange={(checked) => setAnalytics(checked)}
              className="mt-0.5"
              aria-label={t("analytics_label")}
            />
            <div className="space-y-0.5">
              <Label className="text-sm font-medium text-foreground">
                {t("analytics_label")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t("analytics_description")}
              </p>
            </div>
          </div>

          {/* Marketing */}
          <div className="flex items-start gap-3">
            <Checkbox
              checked={marketing}
              onCheckedChange={(checked) => setMarketing(checked)}
              className="mt-0.5"
              aria-label={t("marketing_label")}
            />
            <div className="space-y-0.5">
              <Label className="text-sm font-medium text-foreground">
                {t("marketing_label")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t("marketing_description")}
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleSave}>{t("save_preferences")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export { CookieCustomizeDialog }
export type { CookieCustomizeDialogProps }

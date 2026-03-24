'use client'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface EditorStatusBarProps {
  syncBannerText: string
  syncBannerVariant: 'info' | 'success' | 'warning'
  connectedUsers: number
}

// ── Variant styles ─────────────────────────────────────────────────────────────

const DOT_COLORS: Record<string, string> = {
  info: 'bg-blue-500',
  success: 'bg-green-500',
  warning: 'bg-yellow-500',
}

const TEXT_COLORS: Record<string, string> = {
  info: 'text-blue-600 dark:text-blue-400',
  success: 'text-green-600 dark:text-green-400',
  warning: 'text-yellow-600 dark:text-yellow-400',
}

// ── Component ──────────────────────────────────────────────────────────────────

export function EditorStatusBar({
  syncBannerText,
  syncBannerVariant,
  connectedUsers,
}: EditorStatusBarProps) {
  const usersLabel =
    connectedUsers <= 0
      ? 'Apenas voce'
      : `${connectedUsers} conectado${connectedUsers > 1 ? 's' : ''}`

  return (
    <div
      className="flex h-8 items-center justify-between border-b border-border bg-muted/20 px-3"
      aria-live="polite"
      role="status"
    >
      {/* Left: sync status */}
      <div className="flex items-center gap-2">
        <span
          className={`inline-block h-2 w-2 rounded-full ${DOT_COLORS[syncBannerVariant]}`}
          aria-hidden="true"
        />
        <span className={`text-xs font-medium ${TEXT_COLORS[syncBannerVariant]}`}>
          {syncBannerText}
        </span>
      </div>

      {/* Right: connected users */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        <span>{usersLabel}</span>
      </div>
    </div>
  )
}

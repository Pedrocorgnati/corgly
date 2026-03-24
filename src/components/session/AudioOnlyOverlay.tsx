'use client'

import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface AudioOnlyOverlayProps {
  peerName: string
  peerInitials: string
  isAudioActive: boolean
}

// ── Waveform bars (CSS animation) ─────────────────────────────────────────────

function WaveformIndicator({ isActive }: { isActive: boolean }) {
  return (
    <div
      className="mt-3 flex items-end justify-center gap-1"
      aria-hidden="true"
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn(
            'inline-block w-1 rounded-full bg-primary transition-opacity',
            isActive
              ? 'animate-waveform opacity-100'
              : 'h-1 opacity-40',
          )}
          style={
            isActive
              ? {
                  animationDelay: `${i * 150}ms`,
                  height: undefined, // controlled by animation
                }
              : undefined
          }
        />
      ))}

      {/* Keyframes injected via inline style tag */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @keyframes waveform {
              0%, 100% { height: 0.5rem; }
              50% { height: 1.25rem; }
            }
            .animate-waveform {
              animation: waveform 0.8s ease-in-out infinite;
            }
          `,
        }}
      />
    </div>
  )
}

// ── Component ──────────────────────────────────────────────────────────────────

export function AudioOnlyOverlay({
  peerName,
  peerInitials,
  isAudioActive,
}: AudioOnlyOverlayProps) {
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center bg-card"
      aria-label={`Modo apenas áudio. ${peerName} está conectado via áudio.`}
    >
      {/* Avatar com iniciais */}
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary">
        <span className="select-none text-3xl font-bold text-primary-foreground">
          {peerInitials}
        </span>
      </div>

      {/* Nome do peer */}
      <p className="mt-3 max-w-[200px] truncate text-sm font-medium text-muted-foreground">
        {peerName}
      </p>

      {/* Waveform indicator */}
      <WaveformIndicator isActive={isAudioActive} />

      {/* Banner informativo */}
      <div className="mt-4 rounded-md bg-yellow-500/10 px-3 py-1.5">
        <p className="text-sm text-yellow-600">
          Modo apenas áudio
        </p>
      </div>
    </div>
  )
}

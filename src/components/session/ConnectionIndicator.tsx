'use client'

import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import type { RTCConnectionState } from '@/hooks/useWebRTC'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ConnectionIndicatorProps {
  connectionState: RTCConnectionState
  rtt?: number        // ms, obtido via getStats()
  packetLoss?: number // %, obtido via getStats()
  className?: string
}

// ── Quality helpers ───────────────────────────────────────────────────────────

type QualityLevel = 'good' | 'unstable' | 'bad' | 'unknown'

/**
 * Ate 2026-09-07 as duas funcoes abaixo montavam a copy em portugues cravado no
 * escopo do modulo, fora do alcance do next-intl. Agora recebem o tradutor do
 * componente: a logica de qualidade continua pura e a copy vem do catalogo.
 */
type Translator = (key: string, values?: Record<string, string | number>) => string

function getQuality(
  connectionState: RTCConnectionState,
  rtt?: number,
  packetLoss?: number,
): QualityLevel {
  if (connectionState === 'connecting' || connectionState === 'new') {
    return 'unknown'
  }
  if (connectionState === 'disconnected' || connectionState === 'failed') {
    return 'bad'
  }
  if (connectionState !== 'connected') {
    return 'unknown'
  }

  // Estado connected — avaliar métricas
  if (rtt === undefined && packetLoss === undefined) {
    return 'unknown'
  }

  const rttBad = rtt !== undefined && rtt > 300
  const lossBad = packetLoss !== undefined && packetLoss > 5
  if (rttBad || lossBad) return 'bad'

  const rttUnstable = rtt !== undefined && rtt >= 150 && rtt <= 300
  const lossUnstable = packetLoss !== undefined && packetLoss >= 2 && packetLoss <= 5
  if (rttUnstable || lossUnstable) return 'unstable'

  return 'good'
}

function getDotClass(quality: QualityLevel): string {
  switch (quality) {
    case 'good':
      return 'bg-green-500'
    case 'unstable':
      return 'bg-yellow-500'
    case 'bad':
      return 'bg-red-500'
    default:
      return 'bg-gray-400'
  }
}

const QUALITY_HEADLINE_KEY: Record<'good' | 'unstable' | 'bad', string> = {
  good: 'qualityGood',
  unstable: 'qualityUnstable',
  bad: 'qualityBad',
}

const QUALITY_LEVEL_KEY: Record<QualityLevel, string> = {
  good: 'levelGood',
  unstable: 'levelUnstable',
  bad: 'levelBad',
  unknown: 'levelUnknown',
}

function getTooltipText(
  t: Translator,
  quality: QualityLevel,
  connectionState: RTCConnectionState,
  rtt?: number,
  packetLoss?: number,
): string {
  if (connectionState === 'connecting') return t('connecting')
  if (connectionState === 'new') return t('waiting')
  if (connectionState === 'failed') return t('failed')
  if (connectionState === 'disconnected') return t('disconnected')

  if (quality === 'unknown') return t('monitoring')

  const parts = [t(QUALITY_HEADLINE_KEY[quality])]
  if (rtt !== undefined) parts.push(t('rtt', { rtt }))
  if (packetLoss !== undefined) parts.push(t('loss', { loss: packetLoss.toFixed(1) }))
  return parts.join(' | ')
}

function getAriaLabel(
  t: Translator,
  quality: QualityLevel,
  connectionState: RTCConnectionState,
  rtt?: number,
): string {
  if (connectionState === 'connecting') return t('ariaConnecting')
  if (connectionState === 'new') return t('ariaWaiting')
  if (connectionState === 'failed') return t('ariaFailed')
  if (connectionState === 'disconnected') return t('ariaDisconnected')

  const qualityLabel = t(QUALITY_LEVEL_KEY[quality])
  return rtt !== undefined
    ? t('ariaQualityRtt', { quality: qualityLabel, rtt })
    : t('ariaQuality', { quality: qualityLabel })
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ConnectionIndicator({
  connectionState,
  rtt,
  packetLoss,
  className,
}: ConnectionIndicatorProps) {
  const t = useTranslations('sessionRoom.connection')

  const quality = getQuality(connectionState, rtt, packetLoss)
  const dotClass = getDotClass(quality)
  const tooltipText = getTooltipText(t, quality, connectionState, rtt, packetLoss)
  const ariaLabel = getAriaLabel(t, quality, connectionState, rtt)

  return (
    <div
      className={cn('group relative inline-flex items-center', className)}
      aria-label={ariaLabel}
      role="status"
    >
      {/* Indicador visual — ponto 8x8 */}
      <span
        className={cn(
          'block h-2 w-2 rounded-full',
          dotClass,
          // Pulso animado quando conectando
          connectionState === 'connecting' && 'animate-pulse',
          // Pulso lento quando conectado e estável
          connectionState === 'connected' && quality === 'good' && 'animate-pulse',
        )}
        aria-hidden="true"
      />

      {/* Tooltip no hover */}
      <span
        className={cn(
          'pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2',
          'whitespace-nowrap rounded bg-foreground px-2 py-1 text-xs text-background',
          'opacity-0 transition-opacity group-hover:opacity-100',
          'z-50',
        )}
        role="tooltip"
      >
        {tooltipText}
      </span>
    </div>
  )
}

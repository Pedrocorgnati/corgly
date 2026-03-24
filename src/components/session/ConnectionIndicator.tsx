'use client'

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

function getTooltipText(
  quality: QualityLevel,
  connectionState: RTCConnectionState,
  rtt?: number,
  packetLoss?: number,
): string {
  if (connectionState === 'connecting') return 'Conectando...'
  if (connectionState === 'new') return 'Aguardando conexão'
  if (connectionState === 'failed') return 'Falha na conexão'
  if (connectionState === 'disconnected') return 'Desconectado'

  if (quality === 'good') {
    const parts = ['Conexão: Boa']
    if (rtt !== undefined) parts.push(`RTT: ${rtt}ms`)
    if (packetLoss !== undefined) parts.push(`Perda: ${packetLoss.toFixed(1)}%`)
    return parts.join(' | ')
  }
  if (quality === 'unstable') {
    const parts = ['Conexão: Instável']
    if (rtt !== undefined) parts.push(`RTT: ${rtt}ms`)
    if (packetLoss !== undefined) parts.push(`Perda: ${packetLoss.toFixed(1)}%`)
    return parts.join(' | ')
  }
  if (quality === 'bad') {
    const parts = ['Conexão: Ruim']
    if (rtt !== undefined) parts.push(`RTT: ${rtt}ms`)
    if (packetLoss !== undefined) parts.push(`Perda: ${packetLoss.toFixed(1)}%`)
    return parts.join(' | ')
  }
  return 'Monitorando conexão...'
}

function getAriaLabel(
  quality: QualityLevel,
  connectionState: RTCConnectionState,
  rtt?: number,
): string {
  if (connectionState === 'connecting') return 'Indicador de conexão: conectando'
  if (connectionState === 'new') return 'Indicador de conexão: aguardando'
  if (connectionState === 'failed') return 'Indicador de conexão: falha'
  if (connectionState === 'disconnected') return 'Indicador de conexão: desconectado'

  const qualityLabel =
    quality === 'good' ? 'boa' : quality === 'unstable' ? 'instável' : quality === 'bad' ? 'ruim' : 'desconhecida'
  const rttLabel = rtt !== undefined ? `, latência ${rtt} milissegundos` : ''
  return `Indicador de conexão: qualidade ${qualityLabel}${rttLabel}`
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ConnectionIndicator({
  connectionState,
  rtt,
  packetLoss,
  className,
}: ConnectionIndicatorProps) {
  const quality = getQuality(connectionState, rtt, packetLoss)
  const dotClass = getDotClass(quality)
  const tooltipText = getTooltipText(quality, connectionState, rtt, packetLoss)
  const ariaLabel = getAriaLabel(quality, connectionState, rtt)

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

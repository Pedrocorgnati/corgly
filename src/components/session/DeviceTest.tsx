'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useDeviceCheck, type DeviceCheckErrorKind } from '@/hooks/useDeviceCheck'
import { API } from '@/lib/constants/routes'
import {
  runConnectivityCheck,
  type ConnectivityResult,
} from '@/lib/webrtc/connectivity-check'
import type { IceServersConfig } from '@/types/sala-virtual'
import type { EquipmentFailure } from '@/lib/equipment/last-check.client'

export type OverallStatus = 'idle' | 'checking' | 'ok' | 'warning' | 'fail'

/**
 * Ate 2026-09-07 toda a copy deste arquivo era portugues cravado — inclusive no
 * escopo do modulo (`fetchIceServers` e `Badge`), fora do alcance do next-intl.
 * Agora as funcoes de modulo recebem o tradutor do componente e so as CHAVES
 * moram aqui.
 */
type Translator = (key: string, values?: Record<string, string | number>) => string

type BadgeState = 'ok' | 'warning' | 'fail' | 'checking' | 'idle'

const BADGE_KEY: Record<BadgeState, string> = {
  ok: 'badgeOk',
  warning: 'badgeWarning',
  fail: 'badgeFail',
  checking: 'badgeChecking',
  idle: 'badgeIdle',
}

const DEVICE_ERROR_KEY: Record<DeviceCheckErrorKind, string> = {
  unsupported: 'errorUnsupported',
  permission: 'errorPermission',
  notfound: 'errorNotFound',
  unknown: 'errorUnknown',
}

/** Resultado consolidado de uma rodada de teste, com o detalhe das falhas. */
export interface EquipmentCheckResult {
  status: OverallStatus
  failedChecks: EquipmentFailure[]
  /** ISO 8601 do momento em que a rodada foi concluída. */
  at: string
}

interface DeviceTestProps {
  onReady?: (status: OverallStatus) => void
  /**
   * Disparado uma vez por rodada quando o teste chega a um estado terminal
   * (ok/warning/fail) com a sonda de rede concluída ou erro de dispositivo.
   * Carrega o detalhe das falhas (camera/microphone/permission/bandwidth) para
   * onboarding e lobby persistirem e orientarem correção.
   */
  onResult?: (result: EquipmentCheckResult) => void
}

/**
 * Componente de teste pre-aula: camera, microfone, audio de saida e rede.
 * Expoe status consolidado via onReady para o container habilitar o CTA.
 */
export function DeviceTest({ onReady, onResult }: DeviceTestProps) {
  const t = useTranslations('sessionRoom.deviceTest')
  const device = useDeviceCheck()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [network, setNetwork] = useState<ConnectivityResult | null>(null)
  const [networkChecking, setNetworkChecking] = useState(false)
  const [networkError, setNetworkError] = useState<string | null>(null)
  const [audioOutputOk, setAudioOutputOk] = useState<boolean | null>(null)
  const lastReportedRef = useRef<string>('')

  useEffect(() => {
    if (videoRef.current && device.stream) {
      videoRef.current.srcObject = device.stream
    }
  }, [device.stream])

  const cameraOk = device.status === 'ok' && !!device.stream?.getVideoTracks().length
  const micOk =
    device.status === 'ok' && !!device.stream?.getAudioTracks().length && device.audioLevel > 0.01
  const netOk = network?.ok === true
  const netWarn = network != null && !network.hasTurn && network.ok
  const bandwidthLow = network?.bandwidthLow === true

  const overall: OverallStatus = (() => {
    if (device.status === 'error') return 'fail'
    if (device.status === 'checking' || networkChecking) return 'checking'
    if (!cameraOk || !network) return 'idle'
    if (!netOk) return 'fail'
    if (netWarn || bandwidthLow || !micOk) return 'warning'
    return 'ok'
  })()

  useEffect(() => {
    onReady?.(overall)
  }, [overall, onReady])

  // Detalha as falhas para onboarding/lobby. A classificacao permission vs camera
  // ausente vem do discriminante `errorKind` do hook — ate 2026-09-07 ela lia a
  // mensagem em portugues, o que quebraria assim que a copy fosse traduzida.
  const failedChecks: EquipmentFailure[] = (() => {
    const failed: EquipmentFailure[] = []
    if (device.status === 'error') {
      failed.push(device.errorKind === 'permission' ? 'permission' : 'camera')
      return failed
    }
    if (!cameraOk) failed.push('camera')
    if (!micOk) failed.push('microphone')
    if (network && (!netOk || bandwidthLow)) failed.push('bandwidth')
    return failed
  })()

  // Reporta o resultado uma vez por estado terminal (sonda concluída OU erro).
  const settled =
    (overall === 'ok' || overall === 'warning' || overall === 'fail') &&
    (network !== null || device.status === 'error')

  useEffect(() => {
    if (!onResult || !settled) return
    const payload: EquipmentCheckResult = {
      status: overall,
      failedChecks,
      at: new Date().toISOString(),
    }
    const fingerprint = `${payload.status}|${payload.failedChecks.join(',')}`
    if (lastReportedRef.current === fingerprint) return
    lastReportedRef.current = fingerprint
    onResult(payload)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled, overall, failedChecks.join(','), onResult])

  async function handleStart() {
    await device.start()
    setNetworkChecking(true)
    setNetworkError(null)
    try {
      const ice = await fetchIceServers(t)
      const result = await runConnectivityCheck(ice, 10_000)
      setNetwork(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : t('networkConfigError')
      setNetworkError(message)
      setNetwork({
        ok: false,
        timedOut: false,
        candidateTypes: [],
        hasStun: false,
        hasTurn: false,
        durationMs: 0,
        bandwidthLow: false,
        error: message,
      })
    } finally {
      setNetworkChecking(false)
    }
  }

  async function handleTestSpeaker() {
    try {
      const ctx = new AudioContext()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = 440
      gain.gain.value = 0.05
      osc.connect(gain).connect(ctx.destination)
      osc.start()
      setTimeout(() => {
        osc.stop()
        ctx.close().catch(() => {})
        setAudioOutputOk(true)
      }, 700)
    } catch {
      setAudioOutputOk(false)
    }
  }

  return (
    <div data-testid="device-test" className="space-y-6">
      <section data-testid="device-test-camera" className="rounded-lg border bg-card p-4">
        <header className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">{t('cameraTitle')}</h3>
          <Badge t={t} testId="device-test-camera-status" state={cameraOk ? 'ok' : device.status === 'error' ? 'fail' : 'idle'} />
        </header>
        <div className="aspect-video w-full overflow-hidden rounded bg-black/80">
          {device.stream ? (
            <video data-testid="device-test-camera-preview" ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {t('cameraPlaceholder')}
            </div>
          )}
        </div>
        {device.cameras.length > 1 && (
          <label className="mt-3 block text-sm">
            <span className="mb-1 block text-muted-foreground">{t('device')}</span>
            <select
              data-testid="device-test-camera-select"
              className="w-full rounded border bg-background p-2 text-sm"
              value={device.selectedCameraId ?? ''}
              onChange={(e) => device.setSelectedCameraId(e.target.value)}
            >
              {device.cameras.map((c) => (
                <option key={c.deviceId} value={c.deviceId}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>

      <section data-testid="device-test-microphone" className="rounded-lg border bg-card p-4">
        <header className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">{t('micTitle')}</h3>
          <Badge t={t} testId="device-test-microphone-status" state={micOk ? 'ok' : device.status === 'error' ? 'fail' : 'idle'} />
        </header>
        <div data-testid="device-test-microphone-level" className="h-3 w-full overflow-hidden rounded bg-muted">
          <div
            className="h-full bg-primary transition-[width]"
            style={{ width: `${Math.round(device.audioLevel * 100)}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {t('micHint')}
        </p>
        {device.microphones.length > 1 && (
          <label className="mt-3 block text-sm">
            <span className="mb-1 block text-muted-foreground">{t('device')}</span>
            <select
              data-testid="device-test-microphone-select"
              className="w-full rounded border bg-background p-2 text-sm"
              value={device.selectedMicId ?? ''}
              onChange={(e) => device.setSelectedMicId(e.target.value)}
            >
              {device.microphones.map((m) => (
                <option key={m.deviceId} value={m.deviceId}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>

      <section data-testid="device-test-speaker" className="rounded-lg border bg-card p-4">
        <header className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">{t('speakerTitle')}</h3>
          <Badge t={t} testId="device-test-speaker-status" state={audioOutputOk === true ? 'ok' : audioOutputOk === false ? 'fail' : 'idle'} />
        </header>
        <button
          data-testid="device-test-speaker-button"
          type="button"
          onClick={handleTestSpeaker}
          className="rounded border px-3 py-1.5 text-sm hover:bg-accent"
        >
          {t('speakerButton')}
        </button>
        <p className="mt-2 text-xs text-muted-foreground">
          {t('speakerHint')}
        </p>
      </section>

      <section data-testid="device-test-network" className="rounded-lg border bg-card p-4">
        <header className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">{t('networkTitle')}</h3>
          <Badge
            t={t}
            testId="device-test-network-status"
            state={
              networkChecking
                ? 'checking'
                : network
                  ? netOk
                    ? netWarn
                      ? 'warning'
                      : 'ok'
                    : 'fail'
                  : 'idle'
            }
          />
        </header>
        {network ? (
          <ul data-testid="device-test-network-details" className="space-y-1 text-sm">
            <li>{t('candidates', { list: network.candidateTypes.join(', ') || t('none') })}</li>
            <li>{t('stun', { value: network.hasStun ? t('yes') : t('no') })}</li>
            <li>{t('turn', { value: network.hasTurn ? t('yes') : t('turnNo') })}</li>
            {typeof network.estimatedDownlinkMbps === 'number' && (
              <li>{t('bandwidth', { mbps: network.estimatedDownlinkMbps.toFixed(1) })}</li>
            )}
            {network.effectiveType && <li>{t('networkProfile', { type: network.effectiveType })}</li>}
            <li>{t('duration', { ms: network.durationMs })} {network.timedOut && t('timeout')}</li>
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t('probePending')}
          </p>
        )}
      </section>

      {device.errorKind && (
        <div data-testid="device-test-device-error" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {device.errorKind === 'unknown' && device.error
            ? device.error
            : t(DEVICE_ERROR_KEY[device.errorKind])}
        </div>
      )}
      {networkError && (
        <div data-testid="device-test-network-error" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {networkError}
        </div>
      )}

      <div data-testid="device-test-actions" className="flex flex-wrap gap-2">
        <button
          data-testid="device-test-start-button"
          type="button"
          onClick={handleStart}
          disabled={device.status === 'checking' || networkChecking}
          className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {device.status === 'checking' || networkChecking ? t('testing') : t('start')}
        </button>
        {device.stream && (
          <button
            data-testid="device-test-stop-button"
            type="button"
            onClick={device.stop}
            className="rounded border px-4 py-2 text-sm"
          >
            {t('stop')}
          </button>
        )}
      </div>
    </div>
  )
}

async function fetchIceServers(t: Translator): Promise<IceServersConfig[]> {
  const res = await fetch(API.ICE_CONFIG, { method: 'GET' })
  if (!res.ok) {
    throw new Error(t('iceError'))
  }
  const json = (await res.json()) as {
    data?: { iceServers?: IceServersConfig[] }
    error?: string | null
  }
  if (!Array.isArray(json.data?.iceServers)) {
    throw new Error(json.error ?? t('iceInvalid'))
  }
  return json.data.iceServers
}

function Badge({ state, testId, t }: { state: BadgeState; testId?: string; t: Translator }) {
  const cls: Record<BadgeState, string> = {
    ok: 'bg-green-500/15 text-green-700 dark:text-green-400',
    warning: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
    fail: 'bg-red-500/15 text-red-700 dark:text-red-400',
    checking: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
    idle: 'bg-muted text-muted-foreground',
  }
  return (
    <span data-testid={testId} className={`rounded px-2 py-0.5 text-xs font-medium ${cls[state]}`}>
      {t(BADGE_KEY[state])}
    </span>
  )
}

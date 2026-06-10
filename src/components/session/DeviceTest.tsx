'use client'

import { useEffect, useRef, useState } from 'react'
import { useDeviceCheck } from '@/hooks/useDeviceCheck'
import { getIceServers } from '@/lib/iceServers'
import {
  runConnectivityCheck,
  type ConnectivityResult,
} from '@/lib/webrtc/connectivity-check'
import type { EquipmentFailure } from '@/lib/equipment/last-check.client'

export type OverallStatus = 'idle' | 'checking' | 'ok' | 'warning' | 'fail'

/** Resultado consolidado de uma rodada de teste, com o detalhe das falhas. */
export interface EquipmentCheckResult {
  status: OverallStatus
  failedChecks: EquipmentFailure[]
  /** ISO 8601 do momento em que a rodada foi concluída. */
  at: string
}

interface DeviceTestProps {
  userId: string
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
export function DeviceTest({ userId, onReady, onResult }: DeviceTestProps) {
  const device = useDeviceCheck()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [network, setNetwork] = useState<ConnectivityResult | null>(null)
  const [networkChecking, setNetworkChecking] = useState(false)
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

  const overall: OverallStatus = (() => {
    if (device.status === 'error') return 'fail'
    if (device.status === 'checking' || networkChecking) return 'checking'
    if (!cameraOk || !network) return 'idle'
    if (!netOk) return 'fail'
    if (netWarn || !micOk) return 'warning'
    return 'ok'
  })()

  useEffect(() => {
    onReady?.(overall)
  }, [overall, onReady])

  // Detalha as falhas para onboarding/lobby. Classifica erro de dispositivo em
  // permission vs camera ausente pela mensagem do hook (NotAllowed/NotFound).
  const failedChecks: EquipmentFailure[] = (() => {
    const failed: EquipmentFailure[] = []
    const errMsg = device.error ?? ''
    if (device.status === 'error') {
      if (errMsg.includes('Permissao')) failed.push('permission')
      else if (errMsg.includes('Nenhum dispositivo')) failed.push('camera')
      else failed.push('camera')
      return failed
    }
    if (!cameraOk) failed.push('camera')
    if (!micOk) failed.push('microphone')
    if (network && (!netOk || netWarn)) failed.push('bandwidth')
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
    try {
      const ice = getIceServers(userId)
      const result = await runConnectivityCheck(ice, 10_000)
      setNetwork(result)
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
    <div className="space-y-6">
      <section className="rounded-lg border bg-card p-4">
        <header className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">Camera</h3>
          <Badge state={cameraOk ? 'ok' : device.status === 'error' ? 'fail' : 'idle'} />
        </header>
        <div className="aspect-video w-full overflow-hidden rounded bg-black/80">
          {device.stream ? (
            <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Clique em &quot;Iniciar teste&quot; para pre-visualizar.
            </div>
          )}
        </div>
        {device.cameras.length > 1 && (
          <label className="mt-3 block text-sm">
            <span className="mb-1 block text-muted-foreground">Dispositivo</span>
            <select
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

      <section className="rounded-lg border bg-card p-4">
        <header className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">Microfone</h3>
          <Badge state={micOk ? 'ok' : device.status === 'error' ? 'fail' : 'idle'} />
        </header>
        <div className="h-3 w-full overflow-hidden rounded bg-muted">
          <div
            className="h-full bg-primary transition-[width]"
            style={{ width: `${Math.round(device.audioLevel * 100)}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Fale algo: o nivel acima deve reagir. Se nao reagir, verifique permissoes.
        </p>
        {device.microphones.length > 1 && (
          <label className="mt-3 block text-sm">
            <span className="mb-1 block text-muted-foreground">Dispositivo</span>
            <select
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

      <section className="rounded-lg border bg-card p-4">
        <header className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">Audio de saida</h3>
          <Badge state={audioOutputOk === true ? 'ok' : audioOutputOk === false ? 'fail' : 'idle'} />
        </header>
        <button
          type="button"
          onClick={handleTestSpeaker}
          className="rounded border px-3 py-1.5 text-sm hover:bg-accent"
        >
          Tocar bip de teste
        </button>
        <p className="mt-2 text-xs text-muted-foreground">
          Voce deve ouvir um tom curto. Ajuste o volume do sistema se necessario.
        </p>
      </section>

      <section className="rounded-lg border bg-card p-4">
        <header className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">Rede (STUN/TURN)</h3>
          <Badge
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
          <ul className="space-y-1 text-sm">
            <li>Candidates: {network.candidateTypes.join(', ') || 'nenhum'}</li>
            <li>STUN (srflx): {network.hasStun ? 'sim' : 'nao'}</li>
            <li>TURN (relay): {network.hasTurn ? 'sim' : 'nao — algumas redes corporativas podem falhar'}</li>
            <li>Duracao: {network.durationMs} ms {network.timedOut && '(timeout)'}</li>
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Probe sera executado apos iniciar o teste.
          </p>
        )}
      </section>

      {device.error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {device.error}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleStart}
          disabled={device.status === 'checking' || networkChecking}
          className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {device.status === 'checking' || networkChecking ? 'Testando...' : 'Iniciar teste'}
        </button>
        {device.stream && (
          <button
            type="button"
            onClick={device.stop}
            className="rounded border px-4 py-2 text-sm"
          >
            Parar
          </button>
        )}
      </div>
    </div>
  )
}

function Badge({ state }: { state: 'ok' | 'warning' | 'fail' | 'checking' | 'idle' }) {
  const map: Record<typeof state, { cls: string; label: string }> = {
    ok: { cls: 'bg-green-500/15 text-green-700 dark:text-green-400', label: 'OK' },
    warning: { cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400', label: 'Atencao' },
    fail: { cls: 'bg-red-500/15 text-red-700 dark:text-red-400', label: 'Falha' },
    checking: { cls: 'bg-blue-500/15 text-blue-700 dark:text-blue-400', label: 'Testando' },
    idle: { cls: 'bg-muted text-muted-foreground', label: 'Aguardando' },
  }
  const s = map[state]
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>
}

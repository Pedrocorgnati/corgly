'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type DeviceCheckStatus = 'idle' | 'checking' | 'ok' | 'error'

/**
 * Discriminante da falha, independente de idioma.
 *
 * Ate 2026-09-07 este hook devolvia SO a mensagem em portugues cravado e o
 * `DeviceTest` classificava a falha com `errMsg.includes('Permissao')`. Traduzir
 * a copy quebraria o classificador em silencio; por isso a causa virou dado.
 * `unknown` vem acompanhado de `error` com a mensagem crua do navegador.
 */
export type DeviceCheckErrorKind = 'unsupported' | 'permission' | 'notfound' | 'unknown'

/** Sentinela interna: o navegador nao expoe getUserMedia. */
const UNSUPPORTED_SENTINEL = 'DEVICE_CHECK_UNSUPPORTED'

export interface DeviceInfo {
  deviceId: string
  label: string
  kind: MediaDeviceKind
}

export interface UseDeviceCheckResult {
  status: DeviceCheckStatus
  /** Mensagem crua do navegador quando `errorKind === 'unknown'`; senao null. */
  error: string | null
  errorKind: DeviceCheckErrorKind | null
  cameras: DeviceInfo[]
  microphones: DeviceInfo[]
  speakers: DeviceInfo[]
  selectedCameraId: string | null
  selectedMicId: string | null
  selectedSpeakerId: string | null
  stream: MediaStream | null
  audioLevel: number
  setSelectedCameraId: (id: string) => void
  setSelectedMicId: (id: string) => void
  setSelectedSpeakerId: (id: string) => void
  start: () => Promise<void>
  stop: () => void
}

/**
 * Hook para testar dispositivos (camera/microfone) antes de entrar em sala virtual.
 * - enumerateDevices lista hardware
 * - getUserMedia abre stream com constraints
 * - AudioContext + AnalyserNode exibe VU meter
 */
export function useDeviceCheck(): UseDeviceCheckResult {
  const [status, setStatus] = useState<DeviceCheckStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [errorKind, setErrorKind] = useState<DeviceCheckErrorKind | null>(null)
  const [cameras, setCameras] = useState<DeviceInfo[]>([])
  const [microphones, setMicrophones] = useState<DeviceInfo[]>([])
  const [speakers, setSpeakers] = useState<DeviceInfo[]>([])
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null)
  const [selectedMicId, setSelectedMicId] = useState<string | null>(null)
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [audioLevel, setAudioLevel] = useState(0)

  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const rafRef = useRef<number | null>(null)

  const stopAudioAnalysis = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {})
      audioCtxRef.current = null
    }
    analyserRef.current = null
  }, [])

  const stop = useCallback(() => {
    stopAudioAnalysis()
    if (stream) {
      stream.getTracks().forEach((t) => t.stop())
    }
    setStream(null)
    setAudioLevel(0)
    setStatus('idle')
  }, [stream, stopAudioAnalysis])

  const enumerate = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
      return
    }
    const devices = await navigator.mediaDevices.enumerateDevices()
    const map = (kind: MediaDeviceKind) =>
      devices
        .filter((d) => d.kind === kind)
        .map<DeviceInfo>((d) => ({ deviceId: d.deviceId, label: d.label || kind, kind: d.kind }))
    setCameras(map('videoinput'))
    setMicrophones(map('audioinput'))
    setSpeakers(map('audiooutput'))
  }, [])

  const start = useCallback(async () => {
    setStatus('checking')
    setError(null)
    setErrorKind(null)
    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        throw new Error(UNSUPPORTED_SENTINEL)
      }
      const constraints: MediaStreamConstraints = {
        video: selectedCameraId ? { deviceId: { exact: selectedCameraId } } : true,
        audio: selectedMicId
          ? { deviceId: { exact: selectedMicId }, echoCancellation: true, noiseSuppression: true }
          : { echoCancellation: true, noiseSuppression: true },
      }
      const media = await navigator.mediaDevices.getUserMedia(constraints)
      setStream(media)
      await enumerate()

      // VU meter
      try {
        const AudioCtx =
          (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
            .AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (AudioCtx) {
          const ctx = new AudioCtx()
          const source = ctx.createMediaStreamSource(media)
          const analyser = ctx.createAnalyser()
          analyser.fftSize = 512
          source.connect(analyser)
          audioCtxRef.current = ctx
          analyserRef.current = analyser
          const data = new Uint8Array(analyser.frequencyBinCount)
          const tick = () => {
            if (!analyserRef.current) return
            analyserRef.current.getByteTimeDomainData(data)
            // RMS
            let sum = 0
            for (let i = 0; i < data.length; i++) {
              const v = (data[i] - 128) / 128
              sum += v * v
            }
            const rms = Math.sqrt(sum / data.length)
            setAudioLevel(Math.min(1, rms * 2))
            rafRef.current = requestAnimationFrame(tick)
          }
          tick()
        }
      } catch {
        // VU opcional — ignora
      }

      setStatus('ok')
    } catch (err) {
      // A copy do erro mora no catalogo (`sessionRoom.deviceTest.error*`); aqui so
      // sai a CAUSA, para que o consumidor traduza sem perder a classificacao.
      let kind: DeviceCheckErrorKind = 'unknown'
      let detail: string | null = null
      if (err instanceof Error) {
        if (err.message === UNSUPPORTED_SENTINEL) kind = 'unsupported'
        else if (err.name === 'NotAllowedError') kind = 'permission'
        else if (err.name === 'NotFoundError') kind = 'notfound'
        else detail = err.message
      }
      setErrorKind(kind)
      setError(detail)
      setStatus('error')
    }
  }, [enumerate, selectedCameraId, selectedMicId])

  useEffect(() => {
    enumerate().catch(() => {})
    return () => {
      stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    status,
    error,
    errorKind,
    cameras,
    microphones,
    speakers,
    selectedCameraId,
    selectedMicId,
    selectedSpeakerId,
    stream,
    audioLevel,
    setSelectedCameraId,
    setSelectedMicId,
    setSelectedSpeakerId,
    start,
    stop,
  }
}

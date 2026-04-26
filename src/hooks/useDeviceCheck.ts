'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type DeviceCheckStatus = 'idle' | 'checking' | 'ok' | 'error'

export interface DeviceInfo {
  deviceId: string
  label: string
  kind: MediaDeviceKind
}

export interface UseDeviceCheckResult {
  status: DeviceCheckStatus
  error: string | null
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
    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('Navegador nao suporta getUserMedia')
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
      const message =
        err instanceof Error
          ? err.name === 'NotAllowedError'
            ? 'Permissao negada. Autorize camera e microfone no navegador.'
            : err.name === 'NotFoundError'
              ? 'Nenhum dispositivo encontrado.'
              : err.message
          : 'Falha desconhecida'
      setError(message)
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

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { SessionSignal, IceServersConfig } from '@/types/sala-virtual'

// ── Types ──────────────────────────────────────────────────────────────────────

export type RTCConnectionState = 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed'

export interface UseWebRTCReturn {
  localStream: MediaStream | null
  remoteStream: MediaStream | null
  connectionState: RTCConnectionState
  connect: (sessionId: string, iceServers: IceServersConfig[]) => Promise<void>
  disconnect: () => void
  toggleAudio: () => void
  toggleVideo: () => void
  restartIce: () => void
  isMuted: boolean
  isVideoOff: boolean
  isAudioOnly: boolean
  isRemoteAudioOnly: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SIGNAL_POLL_INTERVAL_MS = 2000
const SIGNAL_RETRY_DELAY_MS = 2000

async function postSignal(
  sessionId: string,
  signal: Omit<SessionSignal, 'from'>,
): Promise<void> {
  const body: Omit<SessionSignal, 'from'> = {
    type: signal.type,
    payload: signal.payload,
    timestamp: new Date().toISOString(),
  }

  const attempt = async () => {
    const res = await fetch(`/api/v1/sessions/${sessionId}/signal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) throw new Error(`Signal POST falhou: ${res.status}`)
  }

  try {
    await attempt()
  } catch (err) {
    console.warn('[useWebRTC] Falha ao enviar sinal, tentando novamente...', err)
    await new Promise((r) => setTimeout(r, SIGNAL_RETRY_DELAY_MS))
    try {
      await attempt()
    } catch (retryErr) {
      console.error('[useWebRTC] Falha persistente ao enviar sinal:', retryErr)
    }
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useWebRTC(): UseWebRTCReturn {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [connectionState, setConnectionState] = useState<RTCConnectionState>('new')
  const [isMuted, setIsMuted] = useState(false)
  const [isVideoOff, setIsVideoOff] = useState(false)
  const [isAudioOnly, setIsAudioOnly] = useState(false)
  const [isRemoteAudioOnly, setIsRemoteAudioOnly] = useState(false)

  const pcRef = useRef<RTCPeerConnection | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastSignalTimestampRef = useRef<string | undefined>(undefined)
  const sessionIdRef = useRef<string | null>(null)
  const isInitiatorRef = useRef<boolean>(false)
  const remoteStreamRef = useRef<MediaStream | null>(null)
  const iceFailureCountRef = useRef(0)
  const iceServersRef = useRef<IceServersConfig[]>([])

  // ── Cleanup ─────────────────────────────────────────────────────────────────

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }, [])

  const stopLocalTracks = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop())
      localStreamRef.current = null
      setLocalStream(null)
    }
  }, [])

  // ── Signal processing ────────────────────────────────────────────────────────

  const processSignal = useCallback(async (signal: SessionSignal) => {
    const pc = pcRef.current
    if (!pc) return

    try {
      if (signal.type === 'offer') {
        const offer = signal.payload as RTCSessionDescriptionInit
        await pc.setRemoteDescription(new RTCSessionDescription(offer))
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        if (sessionIdRef.current) {
          await postSignal(sessionIdRef.current, {
            type: 'answer',
            payload: answer,
            timestamp: new Date().toISOString(),
          })
        }
      } else if (signal.type === 'answer') {
        const answer = signal.payload as RTCSessionDescriptionInit
        if (pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(answer))
        }
      } else if (signal.type === 'candidate') {
        const candidate = signal.payload as RTCIceCandidateInit
        if (candidate && pc.remoteDescription) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate))
        }
      }
    } catch (err) {
      console.error('[useWebRTC] Erro ao processar sinal:', signal.type, err)
    }
  }, [])

  // ── Polling ──────────────────────────────────────────────────────────────────

  const startPolling = useCallback(
    (sessionId: string) => {
      if (pollingRef.current) return

      pollingRef.current = setInterval(async () => {
        if (!pcRef.current) return

        try {
          const params = new URLSearchParams()
          if (lastSignalTimestampRef.current) {
            params.set('after', lastSignalTimestampRef.current)
          }

          const res = await fetch(
            `/api/v1/sessions/${sessionId}/signal?${params.toString()}`,
            { signal: AbortSignal.timeout(8_000) },
          )
          if (!res.ok) return

          const json = await res.json()
          const signals: SessionSignal[] = json.data ?? []

          for (const signal of signals) {
            await processSignal(signal)
            lastSignalTimestampRef.current = signal.timestamp
          }
        } catch (err) {
          console.error('[useWebRTC] Erro no polling de sinais:', err)
        }
      }, SIGNAL_POLL_INTERVAL_MS)
    },
    [processSignal],
  )

  // ── TURN fallback ──────────────────────────────────────────────────────────

  const fetchFreshTurnCredentials = useCallback(async (): Promise<IceServersConfig[]> => {
    const sid = sessionIdRef.current
    if (!sid) return iceServersRef.current

    try {
      const res = await fetch(`/api/v1/sessions/${sid}/turn-credentials`, {
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) throw new Error(`TURN credentials fetch falhou: ${res.status}`)
      const json = await res.json()
      const { username, credential, urls } = json.data ?? json
      const turnServer: IceServersConfig = {
        urls: urls ?? iceServersRef.current.find((s) => s.username)?.urls ?? '',
        username,
        credential,
      }
      // Combine STUN (entries without username) + fresh TURN
      const stunOnly = iceServersRef.current.filter((s) => !s.username)
      return [...stunOnly, turnServer]
    } catch (err) {
      console.error('[useWebRTC] Falha ao buscar TURN credentials:', err)
      return iceServersRef.current // fallback to previous
    }
  }, [])

  const rebuildPeerConnectionWithRelay = useCallback(async () => {
    console.warn('[useWebRTC] 3 ICE failures — forçando TURN relay')
    const sid = sessionIdRef.current
    if (!sid) return

    // Close existing PC
    const oldPc = pcRef.current
    if (oldPc) {
      oldPc.ontrack = null
      oldPc.onicecandidate = null
      oldPc.onconnectionstatechange = null
      oldPc.onicegatheringstatechange = null
      oldPc.close()
      pcRef.current = null
    }

    // Fetch fresh TURN credentials
    const freshServers = await fetchFreshTurnCredentials()

    // Recreate with relay-only policy
    const pc = new RTCPeerConnection({
      iceServers: freshServers as RTCIceServer[],
      iceTransportPolicy: 'relay',
    })
    pcRef.current = pc

    // Re-add local tracks
    const stream = localStreamRef.current
    if (stream) {
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream)
      })
    }

    // Re-setup remote stream
    const remoteMs = new MediaStream()
    remoteStreamRef.current = remoteMs

    pc.ontrack = (event) => {
      const existingMs = remoteStreamRef.current ?? new MediaStream()
      remoteStreamRef.current = existingMs
      let hasRemoteVideo = false
      event.streams[0]?.getTracks().forEach((track) => {
        existingMs.addTrack(track)
        if (track.kind === 'video') {
          hasRemoteVideo = true
          track.onended = () => {
            setIsRemoteAudioOnly(true)
          }
        }
      })
      if (!hasRemoteVideo) {
        setIsRemoteAudioOnly(true)
      }
      setRemoteStream(new MediaStream(existingMs.getTracks()))
    }

    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        await postSignal(sid, {
          type: 'candidate',
          payload: event.candidate.toJSON(),
          timestamp: new Date().toISOString(),
        })
      }
    }

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState as RTCConnectionState
      console.debug('[useWebRTC] Connection state (relay):', state)
      setConnectionState(state)
      if (state === 'connected') {
        iceFailureCountRef.current = 0
      }
    }

    // Restart signaling handshake
    try {
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      await postSignal(sid, {
        type: 'offer',
        payload: offer,
        timestamp: new Date().toISOString(),
      })
    } catch (err) {
      console.error('[useWebRTC] Erro ao criar offer (relay):', err)
    }
  }, [fetchFreshTurnCredentials])

  // ── restartIce ────────────────────────────────────────────────────────────────

  const restartIce = useCallback(() => {
    const pc = pcRef.current
    if (!pc) return

    try {
      pc.restartIce()
      console.debug('[useWebRTC] ICE restart solicitado')
    } catch (err) {
      console.error('[useWebRTC] Erro ao reiniciar ICE:', err)
    }
  }, [])

  // ── Connect ──────────────────────────────────────────────────────────────────

  const connect = useCallback(
    async (sessionId: string, iceServers: IceServersConfig[]) => {
      sessionIdRef.current = sessionId
      iceServersRef.current = iceServers
      iceFailureCountRef.current = 0
      setIsRemoteAudioOnly(false)
      setConnectionState('connecting')

      // 1. Obter mídia local
      let stream: MediaStream
      let audioOnly = false

      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      } catch (videoErr) {
        console.warn('[useWebRTC] Câmera indisponível, tentando apenas áudio:', videoErr)
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true })
          audioOnly = true
          setIsAudioOnly(true)
          toast.info('Câmera não disponível. Conectando apenas com áudio.')
        } catch (audioErr) {
          console.error('[useWebRTC] Permissão de mídia negada:', audioErr)
          setConnectionState('failed')
          toast.error('Permissão de câmera/microfone negada. Verifique as configurações do navegador.')
          return
        }
      }

      setIsAudioOnly(audioOnly)
      localStreamRef.current = stream
      setLocalStream(stream)

      // Detect local video track ending mid-session
      const localVideoTrack = stream.getVideoTracks()[0]
      if (localVideoTrack) {
        localVideoTrack.onended = () => {
          console.warn('[useWebRTC] Track de vídeo local encerrado')
          setIsAudioOnly(true)
          toast.info('Câmera desconectada. Continuando apenas com áudio.')
        }
      }

      // 2. Criar RTCPeerConnection
      const pc = new RTCPeerConnection({
        iceServers: iceServers as RTCIceServer[],
      })
      pcRef.current = pc

      // 3. Adicionar tracks locais
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream)
      })

      // 4. Receber stream remoto
      const remoteMs = new MediaStream()
      remoteStreamRef.current = remoteMs

      pc.ontrack = (event) => {
        const existingMs = remoteStreamRef.current ?? new MediaStream()
        remoteStreamRef.current = existingMs
        let hasRemoteVideo = false
        event.streams[0]?.getTracks().forEach((track) => {
          existingMs.addTrack(track)
          if (track.kind === 'video') {
            hasRemoteVideo = true
            track.onended = () => {
              setIsRemoteAudioOnly(true)
            }
          }
        })
        if (!hasRemoteVideo) {
          setIsRemoteAudioOnly(true)
        }
        // Criar novo objeto para forçar re-render no React
        setRemoteStream(new MediaStream(existingMs.getTracks()))
      }

      // 5. ICE candidates → POST
      pc.onicecandidate = async (event) => {
        if (event.candidate) {
          await postSignal(sessionId, {
            type: 'candidate',
            payload: event.candidate.toJSON(),
            timestamp: new Date().toISOString(),
          })
        }
      }

      pc.onicegatheringstatechange = () => {
        console.debug('[useWebRTC] ICE gathering state:', pc.iceGatheringState)
      }

      // 6. Connection state tracking + ICE failure counting
      pc.onconnectionstatechange = () => {
        const state = pc.connectionState as RTCConnectionState
        console.debug('[useWebRTC] Connection state:', state)
        setConnectionState(state)

        if (state === 'failed') {
          iceFailureCountRef.current++
          console.warn(`[useWebRTC] ICE failure #${iceFailureCountRef.current}`)

          if (iceFailureCountRef.current >= 3) {
            // Force TURN relay after 3 ICE failures
            rebuildPeerConnectionWithRelay()
          } else {
            toast.error('Falha na conexão WebRTC. Verifique sua conexão de rede.')
          }
        } else if (state === 'disconnected') {
          toast.warning('Conexão interrompida. Aguardando reconexão...')
        } else if (state === 'connected') {
          iceFailureCountRef.current = 0
        }
      }

      // 7. Determinar papel: initiator vs answerer
      // Usamos um mecanismo simples: tentar criar offer e veremos se o peer já enviou um
      // Em produção real, usaríamos um mecanismo de coordenação (ex: quem se conectou primeiro)
      // Aqui: role de admin é sempre o initiator; student responde
      // Como não temos acesso ao role aqui, tentamos detectar via primeiro sinal recebido
      // Estratégia: iniciar como initiator após 500ms se não receber offer do peer
      const initiatorTimer = setTimeout(async () => {
        if (!pcRef.current || pcRef.current.signalingState !== 'stable') return

        try {
          isInitiatorRef.current = true
          const offer = await pc.createOffer()
          await pc.setLocalDescription(offer)
          await postSignal(sessionId, {
            type: 'offer',
            payload: offer,
            timestamp: new Date().toISOString(),
          })
        } catch (err) {
          console.error('[useWebRTC] Erro ao criar offer:', err)
        }
      }, 500)

      // Limpar timer se já recebermos um offer antes de enviar o nosso
      const originalProcessSignal = processSignal
      const wrappedProcessSignal = async (signal: SessionSignal) => {
        if (signal.type === 'offer' && isInitiatorRef.current === false) {
          clearTimeout(initiatorTimer)
          isInitiatorRef.current = false
        }
        await originalProcessSignal(signal)
      }

      // 8. Iniciar polling
      startPolling(sessionId)

      // Atualizar estado inicial
      setIsMuted(false)
      setIsVideoOff(false)
    },
    [processSignal, startPolling, rebuildPeerConnectionWithRelay],
  )

  // ── Disconnect ───────────────────────────────────────────────────────────────

  const disconnect = useCallback(() => {
    stopPolling()

    if (pcRef.current) {
      pcRef.current.ontrack = null
      pcRef.current.onicecandidate = null
      pcRef.current.onconnectionstatechange = null
      pcRef.current.close()
      pcRef.current = null
    }

    stopLocalTracks()
    setRemoteStream(null)
    setConnectionState('new')
    setIsMuted(false)
    setIsVideoOff(false)
    setIsAudioOnly(false)
    setIsRemoteAudioOnly(false)
    lastSignalTimestampRef.current = undefined
    sessionIdRef.current = null
    isInitiatorRef.current = false
    iceFailureCountRef.current = 0
  }, [stopPolling, stopLocalTracks])

  // ── Toggle controls ──────────────────────────────────────────────────────────

  const toggleAudio = useCallback(() => {
    const stream = localStreamRef.current
    if (!stream) return
    const audioTrack = stream.getAudioTracks()[0]
    if (!audioTrack) return
    audioTrack.enabled = !audioTrack.enabled
    setIsMuted(!audioTrack.enabled)
  }, [])

  const toggleVideo = useCallback(() => {
    const stream = localStreamRef.current
    if (!stream) return
    const videoTrack = stream.getVideoTracks()[0]
    if (!videoTrack) return
    videoTrack.enabled = !videoTrack.enabled
    setIsVideoOff(!videoTrack.enabled)
  }, [])

  // ── Cleanup on unmount ───────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      stopPolling()
      if (pcRef.current) {
        pcRef.current.close()
        pcRef.current = null
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop())
        localStreamRef.current = null
      }
    }
  }, [stopPolling])

  return {
    localStream,
    remoteStream,
    connectionState,
    connect,
    disconnect,
    toggleAudio,
    toggleVideo,
    restartIce,
    isMuted,
    isVideoOff,
    isAudioOnly,
    isRemoteAudioOnly,
  }
}

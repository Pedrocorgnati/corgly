import type { IceServersConfig } from '@/types/sala-virtual'

export type CandidateType = 'host' | 'srflx' | 'prflx' | 'relay' | 'unknown'

export interface ConnectivityResult {
  ok: boolean
  timedOut: boolean
  candidateTypes: CandidateType[]
  hasStun: boolean
  hasTurn: boolean
  durationMs: number
  estimatedDownlinkMbps?: number
  effectiveType?: string
  bandwidthLow: boolean
  error?: string
}

/**
 * Executa probe de conectividade WebRTC: cria RTCPeerConnection,
 * um DataChannel, gera offer e coleta ICE candidates ate terminar
 * ou timeout. Reporta os tipos encontrados (host/srflx/relay).
 */
export async function runConnectivityCheck(
  iceServers: IceServersConfig[],
  timeoutMs = 10_000,
): Promise<ConnectivityResult> {
  const started = Date.now()
  if (typeof window === 'undefined' || typeof RTCPeerConnection === 'undefined') {
    return {
      ok: false,
      timedOut: false,
      candidateTypes: [],
      hasStun: false,
      hasTurn: false,
      durationMs: 0,
      bandwidthLow: false,
      error: 'RTCPeerConnection nao disponivel',
    }
  }

  const pc = new RTCPeerConnection({ iceServers: iceServers as RTCIceServer[] })
  const types = new Set<CandidateType>()

  return new Promise<ConnectivityResult>((resolve) => {
    let done = false
    const finish = (partial: Partial<ConnectivityResult>) => {
      if (done) return
      done = true
      clearTimeout(timer)
      try {
        pc.close()
      } catch {
        // ignore
      }
      const candidateTypes = Array.from(types)
      resolve({
        ok: candidateTypes.length > 0,
        timedOut: false,
        candidateTypes,
        hasStun: candidateTypes.includes('srflx'),
        hasTurn: candidateTypes.includes('relay'),
        durationMs: Date.now() - started,
        ...readConnectionQuality(),
        ...partial,
      })
    }

    const timer = setTimeout(() => {
      const candidateTypes = Array.from(types)
      finish({
        timedOut: true,
        ok: candidateTypes.length > 0,
      })
    }, timeoutMs)

    pc.onicecandidate = (ev) => {
      if (!ev.candidate) {
        // Gathering complete
        finish({})
        return
      }
      const t = (ev.candidate.type as CandidateType | undefined) ?? parseType(ev.candidate.candidate)
      if (t) types.add(t)
    }

    pc.onicegatheringstatechange = () => {
      if (pc.iceGatheringState === 'complete') {
        finish({})
      }
    }

    try {
      pc.createDataChannel('probe')
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .catch((err) => {
          finish({ ok: false, error: err instanceof Error ? err.message : 'offer error' })
        })
    } catch (err) {
      finish({ ok: false, error: err instanceof Error ? err.message : 'probe error' })
    }
  })
}

function parseType(candidate: string): CandidateType {
  const m = /typ (host|srflx|prflx|relay)/.exec(candidate)
  if (!m) return 'unknown'
  return m[1] as CandidateType
}

function readConnectionQuality(): Pick<ConnectivityResult, 'estimatedDownlinkMbps' | 'effectiveType' | 'bandwidthLow'> {
  const nav = navigator as Navigator & {
    connection?: { downlink?: number; effectiveType?: string }
  }
  const downlink = nav.connection?.downlink
  const effectiveType = nav.connection?.effectiveType
  const bandwidthLow =
    (typeof downlink === 'number' && downlink > 0 && downlink < 1.5) ||
    effectiveType === 'slow-2g' ||
    effectiveType === '2g'

  return {
    estimatedDownlinkMbps: typeof downlink === 'number' ? downlink : undefined,
    effectiveType,
    bandwidthLow,
  }
}

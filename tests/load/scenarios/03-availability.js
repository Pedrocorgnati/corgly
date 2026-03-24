// tests/load/scenarios/03-availability.js
// Cenário: Listar slots disponíveis — GET /api/v1/availability
// SLO: p95 < 400ms | p99 < 800ms | erros < 1%
// Auth: Bearer token requerida
//
// Contexto: endpoint de alta frequência — alunos consultam slots
// antes de agendar. PRD menciona polling a cada 30s.
// Crítico: deve ser rápido para não degradar UX do calendário.

import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Trend } from 'k6/metrics'

const BASE_URL = __ENV.BASE_URL || 'https://corgly.app'
const AUTH_TOKEN = __ENV.AUTH_TOKEN || ''
const LOAD_TEST_USER = __ENV.LOAD_TEST_USER || 'loadtest@corgly.app'
const LOAD_TEST_PASS = __ENV.LOAD_TEST_PASS || 'LoadTest@123'

const errorRate = new Rate('errors')
const availabilityDuration = new Trend('availability_duration', true)

const SLO_P95 = 400
const SLO_P99 = 800

function getToken() {
  if (AUTH_TOKEN) return AUTH_TOKEN
  const res = http.post(
    `${BASE_URL}/api/v1/auth/login`,
    JSON.stringify({ email: LOAD_TEST_USER, password: LOAD_TEST_PASS }),
    { headers: { 'Content-Type': 'application/json' } }
  )
  if (res.status === 200) {
    try {
      const body = JSON.parse(res.body)
      return body.token || body.accessToken || body.access_token || ''
    } catch { return '' }
  }
  return ''
}

export function setup() {
  return { token: getToken() }
}

export const options = {
  scenarios: {
    smoke: {
      executor: 'constant-vus',
      vus: 1,
      duration: '1m',
      tags: { scenario: 'smoke' },
    },
    average_load: {
      // Simula polling de slots: muitos usuários consultando simultaneamente
      executor: 'constant-arrival-rate',
      rate: 20,
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 30,
      maxVUs: 100,
      startTime: '1m',
      tags: { scenario: 'average_load' },
    },
    stress: {
      executor: 'constant-arrival-rate',
      rate: 60,
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 80,
      maxVUs: 200,
      startTime: '7m',
      tags: { scenario: 'stress' },
    },
  },
  thresholds: {
    http_req_duration: [`p(95)<${SLO_P95}`, `p(99)<${SLO_P99}`],
    errors: ['rate<0.01'],
    http_req_failed: ['rate<0.05'],
  },
  tags: {
    commit: __ENV.COMMIT_SHA || 'local',
    scenario: __ENV.SCENARIO || 'availability',
    project: 'corgly',
  },
}

export default function (data) {
  const token = data.token
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': token ? `Bearer ${token}` : '',
  }

  // Incluir parâmetros de filtro realistas (próximas 2 semanas)
  const now = new Date()
  const twoWeeksLater = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
  const from = now.toISOString().split('T')[0]
  const to = twoWeeksLater.toISOString().split('T')[0]

  const res = http.get(
    `${BASE_URL}/api/v1/availability?from=${from}&to=${to}`,
    { headers }
  )

  availabilityDuration.add(res.timings.duration)

  const ok = check(res, {
    'availability: status 200': (r) => r.status === 200,
    'availability: NUNCA retorna 500': (r) => r.status !== 500 && r.status !== 503,
    'availability: latência < SLO p95': (r) => r.timings.duration < SLO_P95,
    'availability: response é array JSON': (r) => {
      try {
        const body = JSON.parse(r.body)
        return Array.isArray(body) || Array.isArray(body.data) || Array.isArray(body.slots)
      } catch { return false }
    },
  })

  errorRate.add(!ok)
  sleep(0.5)
}

export function handleSummary(data) {
  return {
    'tests/load/results/03-availability-summary.json': JSON.stringify(data, null, 2),
  }
}

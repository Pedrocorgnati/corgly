// tests/load/scenarios/06-sessions.js
// Cenário: Listar aulas do aluno — GET /api/v1/sessions
// SLO: p95 < 400ms | p99 < 800ms | erros < 1%
// Auth: Bearer token requerida
//
// Contexto: dashboard principal do aluno — carregado a cada acesso.
// Deve suportar paginação e filtros de status.

import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Trend } from 'k6/metrics'

const BASE_URL = __ENV.BASE_URL || 'https://corgly.app'
const AUTH_TOKEN = __ENV.AUTH_TOKEN || ''
const LOAD_TEST_USER = __ENV.LOAD_TEST_USER || 'loadtest@corgly.app'
const LOAD_TEST_PASS = __ENV.LOAD_TEST_PASS || 'LoadTest@123'

const errorRate = new Rate('errors')
const sessionsDuration = new Trend('sessions_list_duration', true)

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
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 25 },
        { duration: '5m', target: 25 },
        { duration: '2m', target: 0 },
      ],
      startTime: '1m',
      tags: { scenario: 'average_load' },
    },
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 80 },
        { duration: '5m', target: 80 },
        { duration: '2m', target: 0 },
      ],
      startTime: '10m',
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
    scenario: __ENV.SCENARIO || 'sessions',
    project: 'corgly',
  },
}

const STATUS_FILTERS = ['SCHEDULED', 'COMPLETED', 'CANCELLED', '']

export default function (data) {
  // Variar filtros para simular uso real
  const statusFilter = STATUS_FILTERS[Math.floor(Math.random() * STATUS_FILTERS.length)]
  const url = statusFilter
    ? `${BASE_URL}/api/v1/sessions?status=${statusFilter}&page=1&limit=10`
    : `${BASE_URL}/api/v1/sessions?page=1&limit=10`

  const res = http.get(url, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.token}`,
    },
  })

  sessionsDuration.add(res.timings.duration)

  const ok = check(res, {
    'sessions: status 200': (r) => r.status === 200,
    'sessions: NUNCA retorna 500': (r) => r.status !== 500 && r.status !== 503,
    'sessions: latência < SLO p95': (r) => r.timings.duration < SLO_P95,
    'sessions: response é array ou paginado': (r) => {
      try {
        const body = JSON.parse(r.body)
        return (
          Array.isArray(body) ||
          Array.isArray(body.data) ||
          Array.isArray(body.sessions)
        )
      } catch { return false }
    },
  })

  errorRate.add(!ok)
  sleep(1)
}

export function handleSummary(data) {
  return {
    'tests/load/results/06-sessions-summary.json': JSON.stringify(data, null, 2),
  }
}

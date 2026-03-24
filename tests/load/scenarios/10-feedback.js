// tests/load/scenarios/10-feedback.js
// Cenario: Listar feedbacks do aluno — GET /api/v1/feedback
// SLO: p95 < 400ms | p99 < 800ms | erros < 1%
// Auth: Bearer token requerida (role STUDENT)
//
// Contexto: aluno consulta feedbacks pos-aula. Paginado com limit max 50.
// Erros esperados: 401 (sem auth), 403 (role invalido)

import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Trend, Counter } from 'k6/metrics'

const BASE_URL = __ENV.BASE_URL || 'https://corgly.app'
const AUTH_TOKEN = __ENV.AUTH_TOKEN || ''
const LOAD_TEST_USER = __ENV.LOAD_TEST_USER || 'loadtest@corgly.app'
const LOAD_TEST_PASS = __ENV.LOAD_TEST_PASS || 'LoadTest@123'

const errorRate = new Rate('errors')
const feedbackDuration = new Trend('feedback_list_duration', true)
const authErrors = new Counter('feedback_auth_errors')

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
  const token = getToken()
  return { token }
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
        { duration: '2m', target: 20 },
        { duration: '5m', target: 20 },
        { duration: '2m', target: 0 },
      ],
      startTime: '1m',
      tags: { scenario: 'average_load' },
    },
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 50 },
        { duration: '5m', target: 50 },
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
    scenario: __ENV.SCENARIO || 'feedback',
    project: 'corgly',
  },
}

export default function (data) {
  const { token } = data
  const headers = token
    ? { Authorization: `Bearer ${token}` }
    : {}

  const res = http.get(`${BASE_URL}/api/v1/feedback?page=1&limit=10`, { headers })

  feedbackDuration.add(res.timings.duration)

  if (res.status === 401 || res.status === 403) {
    authErrors.add(1)
  }

  const ok = check(res, {
    'feedback: status 200 ou auth error esperado': (r) =>
      r.status === 200 || r.status === 401 || r.status === 403,
    'feedback: NUNCA retorna 500': (r) => r.status !== 500 && r.status !== 503,
    'feedback: latencia < SLO p95': (r) => r.timings.duration < SLO_P95,
    'feedback: response e JSON': (r) => {
      try { JSON.parse(r.body); return true } catch { return false }
    },
  })

  errorRate.add(!ok)
  sleep(1)
}

export function handleSummary(data) {
  return {
    'tests/load/results/10-feedback-summary.json': JSON.stringify(data, null, 2),
  }
}

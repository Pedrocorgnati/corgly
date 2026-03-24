// tests/load/scenarios/05-credits.js
// Cenário: Saldo de créditos — GET /api/v1/credits
// SLO: p95 < 400ms | p99 < 800ms | erros < 1%
// Auth: Bearer token requerida
//
// Contexto: consultado antes de cada agendamento + exibido no dashboard.
// Alta frequência de consulta — deve ser extremamente rápido.

import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Trend } from 'k6/metrics'

const BASE_URL = __ENV.BASE_URL || 'https://corgly.app'
const AUTH_TOKEN = __ENV.AUTH_TOKEN || ''
const LOAD_TEST_USER = __ENV.LOAD_TEST_USER || 'loadtest@corgly.app'
const LOAD_TEST_PASS = __ENV.LOAD_TEST_PASS || 'LoadTest@123'

const errorRate = new Rate('errors')
const creditsDuration = new Trend('credits_duration', true)

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
      executor: 'constant-arrival-rate',
      rate: 30,
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 40,
      maxVUs: 120,
      startTime: '1m',
      tags: { scenario: 'average_load' },
    },
    stress: {
      executor: 'constant-arrival-rate',
      rate: 80,
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 100,
      maxVUs: 250,
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
    scenario: __ENV.SCENARIO || 'credits',
    project: 'corgly',
  },
}

export default function (data) {
  const res = http.get(`${BASE_URL}/api/v1/credits`, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.token}`,
    },
  })

  creditsDuration.add(res.timings.duration)

  const ok = check(res, {
    'credits: status 200': (r) => r.status === 200,
    'credits: NUNCA retorna 500': (r) => r.status !== 500 && r.status !== 503,
    'credits: latência < SLO p95': (r) => r.timings.duration < SLO_P95,
    'credits: campo balance presente': (r) => {
      try {
        const body = JSON.parse(r.body)
        return body.balance !== undefined || body.credits !== undefined || body.total !== undefined
      } catch { return false }
    },
  })

  errorRate.add(!ok)
  sleep(0.5)
}

export function handleSummary(data) {
  return {
    'tests/load/results/05-credits-summary.json': JSON.stringify(data, null, 2),
  }
}

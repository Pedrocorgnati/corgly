// tests/load/scenarios/09-health-check.js
// Cenario: Health check detalhado — GET /api/health/detail
// SLO: p95 < 200ms | p99 < 500ms | erros < 0% | disponibilidade 100%
// Auth: X-Internal-Token OU JWT admin
//
// Contexto: endpoint de monitoramento — usado por oncall para detectar degradacao.
// Deve SEMPRE responder rapido, mesmo sob carga.

import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Trend } from 'k6/metrics'

const BASE_URL = __ENV.BASE_URL || 'https://corgly.app'
const INTERNAL_TOKEN = __ENV.INTERNAL_TOKEN || ''
const AUTH_TOKEN = __ENV.AUTH_TOKEN || ''
const LOAD_TEST_USER = __ENV.LOAD_TEST_USER || 'loadtest@corgly.app'
const LOAD_TEST_PASS = __ENV.LOAD_TEST_PASS || 'LoadTest@123'

const errorRate = new Rate('errors')
const healthDuration = new Trend('health_check_duration', true)

const SLO_P95 = 200
const SLO_P99 = 500

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
      rate: 10,
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 10,
      maxVUs: 30,
      startTime: '1m',
      tags: { scenario: 'average_load' },
    },
    stress: {
      executor: 'constant-arrival-rate',
      rate: 50,
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 50,
      maxVUs: 100,
      startTime: '7m',
      tags: { scenario: 'stress' },
    },
  },
  thresholds: {
    http_req_duration: [`p(95)<${SLO_P95}`, `p(99)<${SLO_P99}`],
    errors: ['rate<0.001'],
    http_req_failed: ['rate<0.01'],
  },
  tags: {
    commit: __ENV.COMMIT_SHA || 'local',
    scenario: __ENV.SCENARIO || 'health-check',
    project: 'corgly',
  },
}

function getAuthHeaders() {
  if (INTERNAL_TOKEN) {
    return { 'x-internal-token': INTERNAL_TOKEN }
  }
  if (AUTH_TOKEN) {
    return { Authorization: `Bearer ${AUTH_TOKEN}` }
  }
  return {}
}

export default function () {
  const res = http.get(`${BASE_URL}/api/health/detail`, {
    headers: getAuthHeaders(),
  })

  healthDuration.add(res.timings.duration)

  const ok = check(res, {
    'health-check: status 200 ou 401 (sem token)': (r) =>
      r.status === 200 || r.status === 401,
    'health-check: NUNCA retorna 500': (r) => r.status !== 500 && r.status !== 503,
    'health-check: latencia < SLO p95': (r) => r.timings.duration < SLO_P95,
    'health-check: response e JSON': (r) => {
      try { JSON.parse(r.body); return true } catch { return false }
    },
  })

  if (res.status === 200) {
    check(res, {
      'health-check: status field presente': (r) => {
        try {
          const body = JSON.parse(r.body)
          return body.status === 'healthy' || body.status === 'degraded'
        } catch { return false }
      },
    })
  }

  errorRate.add(!ok)
  sleep(0.5)
}

export function handleSummary(data) {
  return {
    'tests/load/results/09-health-check-summary.json': JSON.stringify(data, null, 2),
  }
}

// tests/load/scenarios/02-login.js
// Cenário: Login de usuário — POST /api/v1/auth/login
// SLO: p95 < 800ms | p99 < 2000ms | erros < 1%
// Auth: não requerida (é o próprio fluxo de auth)
//
// Erros esperados (ERROR-CATALOG.md):
//   401 — credenciais inválidas (não deve virar 500 sob carga)
//   403 — email não confirmado
//   429 — rate limit (validar que sistema responde, não trava)

import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Trend, Counter } from 'k6/metrics'

const BASE_URL = __ENV.BASE_URL || 'https://corgly.app'
const LOAD_TEST_USER = __ENV.LOAD_TEST_USER || 'loadtest@corgly.app'
const LOAD_TEST_PASS = __ENV.LOAD_TEST_PASS || 'LoadTest@123'

const errorRate = new Rate('errors')
const loginDuration = new Trend('login_duration', true)
const authFailures = new Counter('auth_failures_expected')

const SLO_P95 = 800
const SLO_P99 = 2000

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
    scenario: __ENV.SCENARIO || 'login',
    project: 'corgly',
  },
}

export default function () {
  // Cenário 1: login válido
  const payload = JSON.stringify({ email: LOAD_TEST_USER, password: LOAD_TEST_PASS })
  const res = http.post(`${BASE_URL}/api/v1/auth/login`, payload, {
    headers: { 'Content-Type': 'application/json' },
  })

  loginDuration.add(res.timings.duration)

  const ok = check(res, {
    'login: status 200 ou 401/403 (esperado)': (r) =>
      r.status === 200 || r.status === 401 || r.status === 403,
    'login: NUNCA retorna 500 sob carga': (r) => r.status !== 500 && r.status !== 503,
    'login: latência < SLO p95': (r) => r.timings.duration < SLO_P95,
    'login: response tem body JSON': (r) => {
      try { JSON.parse(r.body); return true } catch { return false }
    },
  })

  if (res.status === 401 || res.status === 403) {
    authFailures.add(1) // esperado para usuário de teste não cadastrado
  }

  if (res.status === 200) {
    // Validar que token está presente quando login bem-sucedido
    check(res, {
      'login: token presente no response 200': (r) => {
        try {
          const body = JSON.parse(r.body)
          return body.token || body.accessToken || body.access_token
        } catch { return false }
      },
    })
  }

  errorRate.add(!ok)
  sleep(2)
}

export function handleSummary(data) {
  return {
    'tests/load/results/02-login-summary.json': JSON.stringify(data, null, 2),
  }
}

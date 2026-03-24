// tests/load/scenarios/13-admin-dashboard.js
// Cenario: Admin dashboard — GET /api/v1/admin/dashboard
// SLO: p95 < 2000ms | p99 < 5000ms | erros < 1%
// Auth: Bearer token com role ADMIN
//
// Contexto: query pesada — 7 queries paralelas (Promise.all) com counts e findMany.
// Potencial gargalo sob carga. Acesso baixo (1 admin), mas impacto alto se degradar.
// Erros esperados: 401/403 (sem auth ou role != ADMIN)

import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Trend } from 'k6/metrics'

const BASE_URL = __ENV.BASE_URL || 'https://corgly.app'
const AUTH_TOKEN = __ENV.AUTH_TOKEN || ''
const ADMIN_USER = __ENV.ADMIN_USER || ''
const ADMIN_PASS = __ENV.ADMIN_PASS || ''

const errorRate = new Rate('errors')
const dashboardDuration = new Trend('admin_dashboard_duration', true)

const SLO_P95 = 2000
const SLO_P99 = 5000

function getAdminToken() {
  if (AUTH_TOKEN) return AUTH_TOKEN
  if (!ADMIN_USER || !ADMIN_PASS) return ''
  const res = http.post(
    `${BASE_URL}/api/v1/auth/login`,
    JSON.stringify({ email: ADMIN_USER, password: ADMIN_PASS }),
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
  const token = getAdminToken()
  if (!token) {
    console.warn('Admin dashboard: sem credenciais ADMIN. Cenario validara apenas rejeicao de auth.')
  }
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
      executor: 'constant-vus',
      vus: 3,
      duration: '5m',
      startTime: '1m',
      tags: { scenario: 'average_load' },
    },
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 10 },
        { duration: '5m', target: 10 },
        { duration: '2m', target: 0 },
      ],
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
    scenario: __ENV.SCENARIO || 'admin-dashboard',
    project: 'corgly',
  },
}

export default function (data) {
  const { token } = data
  const headers = token
    ? { Authorization: `Bearer ${token}` }
    : {}

  const res = http.get(`${BASE_URL}/api/v1/admin/dashboard`, { headers })

  dashboardDuration.add(res.timings.duration)

  const ok = check(res, {
    'admin-dashboard: status 200 ou auth error': (r) =>
      r.status === 200 || r.status === 401 || r.status === 403,
    'admin-dashboard: NUNCA retorna 500': (r) => r.status !== 500 && r.status !== 503,
    'admin-dashboard: latencia < SLO p95': (r) => r.timings.duration < SLO_P95,
    'admin-dashboard: response e JSON': (r) => {
      try { JSON.parse(r.body); return true } catch { return false }
    },
  })

  if (res.status === 200) {
    check(res, {
      'admin-dashboard: tem campo today': (r) => {
        try {
          const body = JSON.parse(r.body)
          const d = body.data || body
          return d.today !== undefined
        } catch { return false }
      },
    })
  }

  errorRate.add(!ok)
  sleep(3)
}

export function handleSummary(data) {
  return {
    'tests/load/results/13-admin-dashboard-summary.json': JSON.stringify(data, null, 2),
  }
}
